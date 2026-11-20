import { test } from 'vitest';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { SharedFreeBudget, RateLimitPause, isFreeQuotaError, parseRetryAfter, type FreeBudgetConfig } from '../src/autodev/rate-limit.js';

const config: FreeBudgetConfig = {
  windowMinutes: 60,
  limit: 200,
  warningAt: 160,
  pauseAt: 190,
  estimatedRequestsPerTask: 50,
  cooldownMinutes: 60,
};

function setup() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'autodev-rate-'));
  return { file: path.join(dir, 'budget.json'), clean: () => fs.rmSync(dir, { recursive: true, force: true }) };
}

test('shared ledger blocks sessions before exceeding 190 and persists across instances', () => {
  const x = setup();
  try {
    const a = new SharedFreeBudget(x.file, config);
    const b = new SharedFreeBudget(x.file, config);
    a.reserve(1000); b.reserve(1001); a.reserve(1002);
    assert.equal(b.status(1003).used, 150);
    assert.throws(() => b.reserve(1003), RateLimitPause);
    assert.equal(a.status(1003).remaining, 40);
    assert.equal(a.status(1003).resumeAt, 1000 + 3_600_000);
  } finally { x.clean(); }
});

test('rolling-window expiration allows new session', () => {
  const x = setup();
  try {
    const a = new SharedFreeBudget(x.file, config);
    a.reserve(1000); a.reserve(1001); a.reserve(1002);
    assert.throws(() => a.reserve(1003), RateLimitPause);
    a.reserve(1000 + 3_600_001);
    assert.equal(a.status(1000 + 3_600_001).used, 100);
  } finally { x.clean(); }
});

test('server 429 triggers 60-minute cooldown that persists across restart', () => {
  const x = setup();
  try {
    const a = new SharedFreeBudget(x.file, config);
    const until = a.pauseForLimit('quota', 1000);
    assert.equal(until, 1000 + 3_600_000);
    const restarted = new SharedFreeBudget(x.file, config);
    assert.throws(() => restarted.reserve(1001), RateLimitPause);
    assert.equal(restarted.status(1001).reason, 'quota');
    restarted.reserve(until + 1);
  } finally { x.clean(); }
});

test('lock prevents parallel process from reserving a second session', () => {
  const x = setup();
  try {
    fs.mkdirSync(x.file + '.lock');
    assert.throws(() => new SharedFreeBudget(x.file, config).reserve(1000), /lock|in use/i);
  } finally { x.clean(); }
});

test('quota error recognition is specific', () => {
  assert.equal(isFreeQuotaError(new Error('Too Many Requests: Free model usage limit reached')), true);
  assert.equal(isFreeQuotaError(new Error('status code 429')), true);
  assert.equal(isFreeQuotaError(new Error('TypeError: missing key')), false);
});

test('failed tool-permission startup can release only its own reservation', () => {
  const x = setup();
  try {
    const a = new SharedFreeBudget(x.file, config);
    const receiptA = a.reserve(1000);
    const receiptB = a.reserve(1001);
    assert.equal(a.status(1002).used, 100);
    assert.equal(a.release(receiptA), true);
    assert.equal(a.status(1002).used, 50);
    assert.equal(a.release(receiptA), false);
    assert.equal(a.status(1002).used, 50);
    assert.equal(a.release(receiptB), true);
    assert.equal(a.status(1002).used, 0);
  } finally { x.clean(); }
});

test('reservations receive unique receipts even in the same millisecond', () => {
  const x = setup();
  try {
    const a = new SharedFreeBudget(x.file, config);
    const first = a.reserve(1000);
    const second = a.reserve(1000);
    assert.notEqual(first, second);
    assert.equal(a.release(second), true);
    assert.equal(a.status(1002).used, 50);
  } finally { x.clean(); }
});

test('budget automatically recovers an abandoned pre-PID lock directory', () => {
  const x = setup();
  try {
    const lock = x.file + '.lock';
    fs.mkdirSync(lock);
    const old = new Date(Date.now() - 10_000);
    fs.utimesSync(lock, old, old);
    const a = new SharedFreeBudget(x.file, config);
    assert.doesNotThrow(() => a.reserve());
    assert.equal(fs.existsSync(lock), false);
  } finally { x.clean(); }
});

test('status shows warning at 160', () => {
  const x = setup();
  try {
    const a = new SharedFreeBudget(x.file, config);
    // Add reservations totaling 150 (3 * 50)
    a.reserve(1000);
    a.reserve(1001);
    a.reserve(1002);
    const status = a.status(1003);
    assert.equal(status.used, 150);
    assert.equal(status.warning, false); // 150 < 160
    // Manually write state with 160 used to test warning
    const state160 = { version: 1, reservations: [{ at: 1000, count: 160 }], cooldownUntil: 0, pauseReason: '' };
    fs.writeFileSync(x.file, JSON.stringify(state160));
    const b = new SharedFreeBudget(x.file, config);
    const status160 = b.status(1001);
    assert.equal(status160.used, 160);
    assert.equal(status160.warning, true);
    assert.ok(status160.reason.includes('warning threshold'));
  } finally { x.clean(); }
});

test('status shows paused at 190', () => {
  const x = setup();
  try {
    // Manually write state with 190 used
    const state = { version: 1, reservations: [{ at: 1000, count: 190 }], cooldownUntil: 0, pauseReason: '' };
    fs.writeFileSync(x.file, JSON.stringify(state));
    const b = new SharedFreeBudget(x.file, config);
    const status = b.status(1001);
    assert.equal(status.used, 190);
    assert.equal(status.paused, true);
    assert.notEqual(status.resumeAt, null);
  } finally { x.clean(); }
});

test('status shows paused during cooldown', () => {
  const x = setup();
  try {
    const state = { version: 1, reservations: [], cooldownUntil: 2000, pauseReason: 'rate limit hit' };
    fs.writeFileSync(x.file, JSON.stringify(state));
    const a = new SharedFreeBudget(x.file, config);
    const status = a.status(1001);
    assert.equal(status.paused, true);
    assert.equal(status.reason, 'rate limit hit');
    assert.ok(status.resumeAt !== null && status.resumeAt > 1001);
  } finally { x.clean(); }
});

test('reserve throws RateLimitPause when pauseAt would be exceeded', () => {
  const x = setup();
  try {
    const state = { version: 1, reservations: [{ at: 1000, count: 150 }], cooldownUntil: 0, pauseReason: '' };
    fs.writeFileSync(x.file, JSON.stringify(state));
    const a = new SharedFreeBudget(x.file, config);
    assert.throws(() => a.reserve(1001), RateLimitPause);
    assert.throws(() => a.reserve(1001), /Proactive free-model session budget reached/);
  } finally { x.clean(); }
});

test('reserve throws RateLimitPause during cooldown', () => {
  const x = setup();
  try {
    const state = { version: 1, reservations: [], cooldownUntil: 2000, pauseReason: 'rate limit hit' };
    fs.writeFileSync(x.file, JSON.stringify(state));
    const a = new SharedFreeBudget(x.file, config);
    assert.throws(() => a.reserve(1001), RateLimitPause);
    assert.throws(() => a.reserve(1001), /rate limit hit/);
  } finally { x.clean(); }
});

test('release returns false for unknown receipt', () => {
  const x = setup();
  try {
    const a = new SharedFreeBudget(x.file, config);
    const released = a.release(999999);
    assert.equal(released, false);
  } finally { x.clean(); }
});

test('pauseForLimit sets cooldown with retry-after precedence', () => {
  const x = setup();
  try {
    const a = new SharedFreeBudget(x.file, config);
    const until = a.pauseForLimit("429 hit", 1000, 120000); // 2 minutes retry-after
    assert.ok(until > 1000 + 100000);
    assert.ok(until <= 1000 + 130000);
  } finally { x.clean(); }
});

test('pauseForLimit uses config cooldown when no retry-after', () => {
  const x = setup();
  try {
    const a = new SharedFreeBudget(x.file, config);
    const until = a.pauseForLimit("rate limit", 1000);
    assert.ok(until > 1000 + 59 * 60 * 1000);
    assert.ok(until <= 1000 + 61 * 60 * 1000);
  } finally { x.clean(); }
});

test('validation rejects invalid config', () => {
  assert.throws(() => new SharedFreeBudget('/tmp/x.json', { ...config, limit: 0 }), /Invalid free model budget configuration/);
  assert.throws(() => new SharedFreeBudget('/tmp/x.json', { ...config, pauseAt: 201 }), /Invalid free model budget configuration/);
  assert.throws(() => new SharedFreeBudget('/tmp/x.json', { ...config, warningAt: 191 }), /Invalid free model budget configuration/);
  assert.throws(() => new SharedFreeBudget('/tmp/x.json', { ...config, estimatedRequestsPerTask: 200 }), /Invalid free model budget configuration/);
});

test('parseRetryAfter parses seconds', () => {
  assert.equal(parseRetryAfter("120"), 120000);
  assert.equal(parseRetryAfter("0"), 0);
});

test('parseRetryAfter parses HTTP-date', () => {
  const future = new Date(Date.now() + 60000).toUTCString();
  const ms = parseRetryAfter(future);
  assert.ok(ms !== null);
  if (ms !== null) {
    assert.ok(ms > 50000);
    assert.ok(ms < 70000);
  }
});

test('parseRetryAfter returns null for invalid input', () => {
  assert.equal(parseRetryAfter(null), null);
  assert.equal(parseRetryAfter(undefined), null);
  assert.equal(parseRetryAfter("invalid"), null);
  assert.equal(parseRetryAfter(""), null);
});

test('isFreeQuotaError detects free model limit errors', () => {
  assert.equal(isFreeQuotaError(new Error('free model usage limit reached')), true);
  assert.equal(isFreeQuotaError(new Error('too many requests')), true);
  assert.equal(isFreeQuotaError(new Error('rate limit exceeded')), true);
  assert.equal(isFreeQuotaError(new Error('429 Too Many Requests')), true);
  assert.equal(isFreeQuotaError(new Error('rate limited')), true);
});

test('isFreeQuotaError returns false for unrelated errors', () => {
  assert.equal(isFreeQuotaError(new Error('network error')), false);
  assert.equal(isFreeQuotaError(new Error('permission denied')), false);
  assert.equal(isFreeQuotaError('just a string'), false);
});

test('RateLimitPause stores until and retryAfterMs', () => {
  const pause = new RateLimitPause(Date.now() + 60000, 'rate limited', 30000);
  assert.ok(pause.until > Date.now());
  assert.equal(pause.retryAfterMs, 30000);
  assert.equal(pause.message, 'rate limited');
});