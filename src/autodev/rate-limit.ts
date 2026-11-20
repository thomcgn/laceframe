import fs from 'node:fs';
import path from 'node:path';

/** Conservative SESSION reservations. Kilo hides the actual per-message request count.
 * This cannot enforce an account-wide 200-request quota without gateway telemetry.
 */
export interface FreeBudgetConfig {
  windowMinutes: number;
  limit: number;
  pauseAt: number;
  estimatedRequestsPerTask: number;
  cooldownMinutes: number;
}

interface BudgetState {
  version: 1;
  reservations: Array<{ at: number; count: number }>;
  cooldownUntil: number;
  pauseReason: string;
}

export class RateLimitPause extends Error {
  constructor(public readonly until: number, message: string) {
    super(message);
    this.name = 'RateLimitPause';
  }
}

export class SharedFreeBudget {
  constructor(private readonly file: string, readonly config: FreeBudgetConfig) {
    if (config.limit < 1 || config.pauseAt > config.limit || config.pauseAt < 1 ||
        config.estimatedRequestsPerTask < 1 || config.estimatedRequestsPerTask > config.pauseAt ||
        config.windowMinutes < 1 || config.cooldownMinutes < 1) {
      throw new Error('Invalid free model budget configuration');
    }
  }

  private initial(): BudgetState {
    return { version: 1, reservations: [], cooldownUntil: 0, pauseReason: '' };
  }

  private read(): BudgetState {
    if (!fs.existsSync(this.file)) return this.initial();
    const parsed: unknown = JSON.parse(fs.readFileSync(this.file, 'utf8'));
    if (!parsed || typeof parsed !== 'object') throw new Error('Invalid budget state');
    const state = parsed as BudgetState;
    if (state.version !== 1 || !Array.isArray(state.reservations) ||
        typeof state.cooldownUntil !== 'number' || typeof state.pauseReason !== 'string' ||
        !state.reservations.every(r => Number.isFinite(r.at) && Number.isInteger(r.count) && r.count > 0)) {
      throw new Error('Invalid budget state: refusing to reset request history');
    }
    return state;
  }

  private write(state: BudgetState): void {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const tmp = `${this.file}.${process.pid}.tmp`;
    try {
      fs.writeFileSync(tmp, JSON.stringify(state, null, 2));
      fs.renameSync(tmp, this.file);
    } finally {
      if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
    }
  }

  private withLock<T>(fn: () => T): T {
    const lock = `${this.file}.lock`;
    const ownerFile = path.join(lock, "pid");
    fs.mkdirSync(path.dirname(lock), { recursive: true });
    const claim = (): void => {
      fs.mkdirSync(lock);
      try {
        fs.writeFileSync(ownerFile, String(process.pid), { flag: "wx" });
      } catch (error) {
        fs.rmdirSync(lock);
        throw error;
      }
    };

    try {
      claim();
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      if (fs.existsSync(ownerFile)) {
        const raw = fs.readFileSync(ownerFile, "utf8").trim();
        const owner = Number(raw);
        if (!Number.isSafeInteger(owner) || owner <= 0) {
          throw new Error("Budget lock has an invalid owner", { cause: error });
        }
        try {
          process.kill(owner, 0);
          throw new Error(`Budget is already in use by PID ${owner}`, { cause: error });
        } catch (probeError) {
          if ((probeError as NodeJS.ErrnoException).code !== "ESRCH") throw probeError;
        }
        if (fs.readFileSync(ownerFile, "utf8").trim() !== raw) {
          throw new Error("Budget lock owner changed; retry", { cause: error });
        }
        fs.unlinkSync(ownerFile);
      } else {
        if (Date.now() - fs.statSync(lock).mtimeMs < 5000) {
          throw new Error("Budget lock is being initialized; retry shortly", { cause: error });
        }
        if (fs.readdirSync(lock).length) throw new Error("Unknown files in budget lock", { cause: error });
      }
      fs.rmdirSync(lock);
      claim();
    }
    try {
      return fn();
    } finally {
      if (fs.existsSync(ownerFile) && fs.readFileSync(ownerFile, "utf8").trim() === String(process.pid)) {
        fs.unlinkSync(ownerFile);
        fs.rmdirSync(lock);
      }
    }
  }

  private prune(s: BudgetState, now: number): void {
    const earliest = now - this.config.windowMinutes * 60_000;
    s.reservations = s.reservations.filter(r => r.at > earliest);
    if (s.cooldownUntil <= now) { s.cooldownUntil = 0; s.pauseReason = ''; }
  }

  status(now = Date.now()): { used: number; remaining: number; resumeAt: number | null; reason: string; accounting: string } {
    const s = this.read();
    this.prune(s, now);
    const used = s.reservations.reduce((n, r) => n + r.count, 0);
    const firstExpiry = s.reservations.length
      ? Math.min(...s.reservations.map(r => r.at + this.config.windowMinutes * 60_000))
      : 0;
    const eligible = used + this.config.estimatedRequestsPerTask <= this.config.pauseAt;
    return {
      used, remaining: Math.max(0, this.config.pauseAt - used),
      resumeAt: s.cooldownUntil > now || !eligible ? Math.max(s.cooldownUntil, eligible ? 0 : firstExpiry) : null,
      reason: s.cooldownUntil > now ? s.pauseReason : !eligible ? 'proactive session budget' : '',
      accounting: 'estimated Kilo session reservations, NOT observed model/API request count',
    };
  }

  reserve(now = Date.now()): number {
    return this.withLock(() => {
      const s = this.read();
      this.prune(s, now);
      const used = s.reservations.reduce((n, r) => n + r.count, 0);
      if (s.cooldownUntil > now) throw new RateLimitPause(s.cooldownUntil, s.pauseReason);
      if (used + this.config.estimatedRequestsPerTask > this.config.pauseAt) {
        const expiry = Math.min(...s.reservations.map(r => r.at + this.config.windowMinutes * 60_000));
        throw new RateLimitPause(expiry, 'Proactive free-model session budget reached');
      }
      const receipt = s.reservations.some(r => r.at === now)
        ? Math.max(now, ...s.reservations.map(r => r.at)) + 1 : now;
      s.reservations.push({ at: receipt, count: this.config.estimatedRequestsPerTask });
      this.write(s);
      return receipt;
    });
  }

  /** Refund only a session known not to have obtained tool access. */
  release(receipt: number): boolean {
    return this.withLock(() => {
      const state = this.read();
      const index = state.reservations.findIndex(r => r.at === receipt);
      if (index < 0) return false;
      state.reservations.splice(index, 1);
      this.write(state);
      return true;
    });
  }

  pauseForLimit(reason: string, now = Date.now(), retryAfterMs?: number): number {
    return this.withLock(() => {
      const s = this.read();
      this.prune(s, now);
      s.cooldownUntil = Math.max(s.cooldownUntil, now + Math.max(retryAfterMs ?? this.config.cooldownMinutes * 60_000, 0));
      s.pauseReason = reason;
      this.write(s);
      return s.cooldownUntil;
    });
  }
}

export function isFreeQuotaError(value: unknown): boolean {
  const text = String(value instanceof Error ? [value.message, (value as Error & {stderr?: unknown}).stderr].join(' ') : value);
  return /free model usage limit reached|too many requests|rate.?limit|\b429\b/i.test(text);
}
