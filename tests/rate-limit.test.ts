import { test } from 'vitest';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { SharedFreeBudget, RateLimitPause, isFreeQuotaError } from '../src/autodev/rate-limit.js';

const config = { windowMinutes: 60, limit: 200, warningAt: 160, pauseAt: 190, estimatedRequestsPerTask: 50, cooldownMinutes: 60 };
function setup() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'autodev-rate-'));
  return {file:path.join(dir,'budget.json'), clean:()=>fs.rmSync(dir,{recursive:true,force:true})};
}

test('shared ledger blocks sessions before exceeding 190 and persists across instances', () => {
  const x = setup();
  try {
    const a = new SharedFreeBudget(x.file, config);
    const b = new SharedFreeBudget(x.file, config);
    a.reserve(1000); b.reserve(1001); a.reserve(1002);
    assert.equal(b.status(1003).used,150);
    assert.throws(()=>b.reserve(1003), RateLimitPause);
    assert.equal(a.status(1003).remaining,40);
    assert.equal(a.status(1003).resumeAt,1000+3_600_000);
  } finally { x.clean(); }
});

test('rolling-window expiration allows new session', () => {
  const x = setup();
  try {
    const a = new SharedFreeBudget(x.file,config);
    a.reserve(1000); a.reserve(1001); a.reserve(1002);
    assert.throws(()=>a.reserve(1003),RateLimitPause);
    a.reserve(1000+3_600_001);
    assert.equal(a.status(1000+3_600_001).used,100);
  } finally { x.clean(); }
});

test('server 429 triggers 60-minute cooldown that persists across restart', () => {
  const x = setup();
  try {
    const a = new SharedFreeBudget(x.file,config);
    const until=a.pauseForLimit('quota', 1000);
    assert.equal(until,1000+3_600_000);
    const restarted=new SharedFreeBudget(x.file,config);
    assert.throws(()=>restarted.reserve(1001),RateLimitPause);
    assert.equal(restarted.status(1001).reason,'quota');
    restarted.reserve(until+1);
  } finally { x.clean(); }
});

test('lock prevents parallel process from reserving a second session', () => {
  const x=setup();
  try {
    fs.mkdirSync(x.file+'.lock');
    assert.throws(()=>new SharedFreeBudget(x.file,config).reserve(1000),/lock|in use/i);
  } finally { x.clean(); }
});

test('quota error recognition is specific', () => {
  assert.equal(isFreeQuotaError(new Error('Too Many Requests: Free model usage limit reached')),true);
  assert.equal(isFreeQuotaError(new Error('status code 429')),true);
  assert.equal(isFreeQuotaError(new Error('TypeError: missing key')),false);
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
