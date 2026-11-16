import { describe, it, expect } from "vitest";
import { GenerationClock } from "../src/main/services/generation-clock";
import {
  executionLabel,
  formatDuration,
  generationExecutionSchema,
} from "../src/shared/generation";
import {
  comparisonCanvas,
  comparisonTransform,
  sliderKey,
  sliderPosition,
} from "../src/shared/comparison";

describe("main-process monotonic execution clock", () => {
  it("ignores wall-clock jumps and freezes the terminal duration", () => {
    let mono = 100,
      wall = Date.parse("2026-11-16T12:00:00Z");
    const clock = new GenerationClock(
      () => mono,
      () => new Date(wall),
    );
    mono += 3661005;
    wall -= 86400000;
    expect(clock.snapshot()).toMatchObject({
      status: "running",
      durationMs: 3661005,
    });
    const result = clock.finish("completed");
    expect(result.endedAt).toBe("2026-11-15T12:00:00.000Z");
    expect(executionLabel(result)).toBe("Generiert in 01:01:01");
    mono += 5000;
    expect(clock.snapshot()).toEqual(result);
    expect(generationExecutionSchema.safeParse(result).success).toBe(true);
  });
  it("does not seal provisional successful metadata before durable import", () => {
    let mono = 0;
    const clock = new GenerationClock(() => mono);
    mono = 1000;
    expect(clock.stamp("completed").status).toBe("completed");
    mono = 2500;
    expect(clock.finish("failed")).toMatchObject({
      durationMs: 2500,
      status: "failed",
    });
    expect(executionLabel(clock.snapshot())).toBe("Fehlgeschlagen in 00:00:02");
  });
  it.each(["failed", "cancelled"] as const)(
    "records terminal %s with end time",
    (status) => {
      const clock = new GenerationClock();
      const terminal = clock.finish(status);
      expect(terminal.endedAt).toBeDefined();
      expect(generationExecutionSchema.safeParse(terminal).success).toBe(true);
    },
  );
  it("shows interrupted persisted jobs honestly and validates terminal metadata", () => {
    const running = {
      startedAt: "2026-11-16T12:00:00Z",
      durationMs: 0,
      status: "running" as const,
    };
    expect(executionLabel(running)).toContain("Nicht abgeschlossen");
    expect(executionLabel({ ...running, durationMs: 62000 }, true)).toBe(
      "Laufzeit 00:01:02",
    );
    expect(
      generationExecutionSchema.safeParse({ ...running, status: "completed" })
        .success,
    ).toBe(false);
    expect(
      generationExecutionSchema.safeParse({
        ...running,
        endedAt: running.startedAt,
      }).success,
    ).toBe(false);
  });
  it("formats full hours, including jobs beyond a day", () => {
    expect(formatDuration(90061000)).toBe("25:01:01");
    expect(formatDuration(-1)).toBe("00:00:00");
    expect(formatDuration(Number.NaN)).toBe("00:00:00");
  });
});
describe("registered comparison geometry and controls", () => {
  it("uses a union canvas without stretching either image", () => {
    expect(
      comparisonCanvas(
        { width: 600, height: 400 },
        { width: 400, height: 600 },
      ),
    ).toEqual({ width: 600, height: 600, mismatch: true });
    expect(
      comparisonCanvas({ width: 600, height: 400 }, { width: 600, height: 400 })
        .mismatch,
    ).toBe(false);
  });
  it("shares one pixel transform for zoom and pan", () => {
    const canvas = { width: 600, height: 600 },
      viewport = { width: 900, height: 300 };
    expect(
      comparisonTransform(canvas, viewport, "fit", { x: 0, y: 0 }),
    ).toEqual({ scale: 0.5, x: 300, y: 0 });
    expect(
      comparisonTransform(canvas, viewport, 200, { x: 24, y: -12 }),
    ).toEqual({ scale: 2, x: -126, y: -462 });
  });
  it("clamps pointer motion at the canvas boundaries", () => {
    expect(sliderPosition(250, 100, 600)).toBe(25);
    expect(sliderPosition(-1, 100, 600)).toBe(0);
    expect(sliderPosition(900, 100, 600)).toBe(100);
  });
  it("supports fine/coarse keyboard motion and endpoints", () => {
    expect(sliderKey(50, "ArrowRight")).toBe(51);
    expect(sliderKey(50, "ArrowLeft", true)).toBe(40);
    expect(sliderKey(50, "Home")).toBe(0);
    expect(sliderKey(50, "End")).toBe(100);
    expect(sliderKey(0, "ArrowDown")).toBe(0);
    expect(sliderKey(100, "ArrowUp", true)).toBe(100);
  });
});
