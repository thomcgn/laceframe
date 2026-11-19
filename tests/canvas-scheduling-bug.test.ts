import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

describe("Canvas scheduling bug: cancelled frame ID prevents re-scheduling", () => {
  const rafCallbacks: Map<number, FrameRequestCallback> = new Map();
  let nextFrameId = 1;
  let cancelledFrames: number[] = [];

  beforeEach(() => {
    rafCallbacks.clear();
    nextFrameId = 1;
    cancelledFrames = [];

    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
      const id = nextFrameId++;
      rafCallbacks.set(id, cb);
      return id;
    });

    vi.stubGlobal("cancelAnimationFrame", (id: number) => {
      cancelledFrames.push(id);
      rafCallbacks.delete(id);
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function fireFrame(id: number) {
    const cb = rafCallbacks.get(id);
    if (cb) {
      rafCallbacks.delete(id);
      cb(performance.now());
    }
  }

  function fireAllFrames() {
    const ids = [...rafCallbacks.keys()];
    for (const id of ids) fireFrame(id);
  }

  it("reproduces the bug: cleanup leaves cancelled frame ID, preventing re-schedule", () => {
    let frame = 0;
    let drawCalls = 0;

    function requestDraw() {
      if (!frame) {
        frame = requestAnimationFrame(() => {
          frame = 0;
          drawCalls++;
        });
      }
    }

    function cleanup() {
      cancelAnimationFrame(frame);
      // BUG: frame is NOT reset to 0 here
    }

    // Initial draw request
    requestDraw();
    expect(frame).toBe(1);
    expect(drawCalls).toBe(0);

    // Cleanup runs (e.g., sourceId change) BEFORE frame fires
    cleanup();
    expect(cancelledFrames).toEqual([1]);
    expect(frame).toBe(1); // BUG: frame still holds cancelled ID

    // New draw request after cleanup
    requestDraw();
    expect(frame).toBe(1); // BUG: still 1, no new frame scheduled
    expect(drawCalls).toBe(0);

    // Even firing all frames doesn't help - no new frame was scheduled
    fireAllFrames();
    expect(drawCalls).toBe(0);
  });

  it("demonstrates the fix: reset frame to 0 in cleanup", () => {
    let frame = 0;
    let drawCalls = 0;

    function requestDraw() {
      if (!frame) {
        frame = requestAnimationFrame(() => {
          frame = 0;
          drawCalls++;
        });
      }
    }

    function cleanupFixed() {
      if (frame) cancelAnimationFrame(frame);
      frame = 0; // FIX: reset frame to 0
    }

    // Initial draw request
    requestDraw();
    expect(frame).toBe(1);
    expect(drawCalls).toBe(0);

    // Cleanup runs BEFORE frame fires
    cleanupFixed();
    expect(cancelledFrames).toEqual([1]);
    expect(frame).toBe(0); // FIXED: frame reset to 0

    // New draw request after cleanup
    requestDraw();
    expect(frame).toBe(2); // NEW frame scheduled
    expect(drawCalls).toBe(0);

    // Fire the new frame
    fireFrame(2);
    expect(drawCalls).toBe(1);
  });

  it("works correctly when frame fires before cleanup", () => {
    let frame = 0;
    let drawCalls = 0;

    function requestDraw() {
      if (!frame) {
        frame = requestAnimationFrame(() => {
          frame = 0;
          drawCalls++;
        });
      }
    }

    function cleanupFixed() {
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
    }

    // Initial draw request
    requestDraw();
    expect(frame).toBe(1);

    // Frame fires BEFORE cleanup
    fireFrame(1);
    expect(drawCalls).toBe(1);
    expect(frame).toBe(0);

    // Cleanup runs after frame already fired
    cleanupFixed();
    expect(cancelledFrames).toEqual([]); // nothing to cancel
    expect(frame).toBe(0);

    // New draw request works
    requestDraw();
    expect(frame).toBe(2);
    fireFrame(2);
    expect(drawCalls).toBe(2);
  });
});