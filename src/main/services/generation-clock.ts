import { performance } from "node:perf_hooks";
import type { GenerationExecution } from "../../shared/generation";
/** Wall time is provenance only. Elapsed time exclusively uses the monotonic main-process clock. */
export class GenerationClock {
  private readonly start: number;
  private readonly startedAt: string;
  private terminal?: GenerationExecution;
  constructor(
    private monotonic: () => number = () => performance.now(),
    private wall: () => Date = () => new Date(),
  ) {
    this.start = monotonic();
    this.startedAt = wall().toISOString();
  }
  snapshot(): GenerationExecution {
    return this.terminal
      ? { ...this.terminal }
      : {
          startedAt: this.startedAt,
          durationMs: Math.max(0, Math.round(this.monotonic() - this.start)),
          status: "running",
        };
  }
  stamp(status: "completed" | "failed" | "cancelled"): GenerationExecution {
    return { ...this.snapshot(), status, endedAt: this.wall().toISOString() };
  }
  seal(execution: GenerationExecution) {
    this.terminal = { ...execution };
  }
  finish(status: "completed" | "failed" | "cancelled"): GenerationExecution {
    if (!this.terminal) this.terminal = this.stamp(status);
    return { ...this.terminal };
  }
}
