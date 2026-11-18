import { describe, it, expect, vi } from "vitest";
import {
  AppLifecycle,
  BOOT_DURATION,
  bootLabel,
} from "../src/renderer/app-lifecycle";
import type { Snapshot } from "../src/shared/domain";
import { ProjectService } from "../src/main/project-service";
import * as fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { transparentPng, masterReview } from "./fixtures";
const value = { project: { id: "synthetic" } } as Snapshot;
async function boot(work = async () => {}) {
  let now = 0;
  const lifecycle = new AppLifecycle(work, () => now);
  lifecycle.displayed();
  await lifecycle.initialize();
  return {
    lifecycle,
    setTime: (n: number) => {
      now = n;
      lifecycle.tick();
    },
    getTime: () => now,
  };
}
describe("single application lifecycle", () => {
  it("starts at zero, is monotonic and never selects projects before ten seconds plus completion", async () => {
    const { lifecycle: l, setTime } = await boot();
    expect(l.getSnapshot().progress).toBe(0);
    let previous = 0;
    for (let t = 0; t < BOOT_DURATION; t += 17) {
      setTime(t);
      const s = l.getSnapshot();
      expect(s.phase).toBe("booting");
      expect(s.progress).toBeGreaterThanOrEqual(previous);
      previous = s.progress;
    }
    setTime(10_000);
    expect(l.getSnapshot()).toMatchObject({ phase: "booting", progress: 95 });
    setTime(10_400);
    expect(l.getSnapshot().progress).toBe(100);
    expect(bootLabel(l.getSnapshot())).toBe("Alles an seinem Platz. Fast.");
    setTime(10_650);
    expect(l.getSnapshot().phase).toBe("project-selection");
  });
  it("holds at 95 when real initialization is slow", async () => {
    let done!: () => void,
      now = 0;
    const l = new AppLifecycle(
      () =>
        new Promise((r) => {
          done = r;
        }),
      () => now,
    );
    l.displayed();
    const work = l.initialize();
    await Promise.resolve();
    now = 15_000;
    l.tick();
    expect(l.getSnapshot()).toMatchObject({ progress: 95, waiting: true });
    expect(bootLabel(l.getSnapshot())).toContain("stellen sich quer");
    done();
    await work;
    l.tick();
    now += 650;
    l.tick();
    expect(l.getSnapshot().phase).toBe("project-selection");
  });
  it("deduplicates Strict Mode initialization and unsubscribes cleanly", async () => {
    const init = vi.fn(async () => {}),
      l = new AppLifecycle(init, () => 0),
      listener = vi.fn();
    const unsubscribe = l.subscribe(listener);
    l.displayed();
    const a = l.initialize(),
      b = l.initialize();
    expect(a).toBe(b);
    await a;
    expect(init).toHaveBeenCalledTimes(1);
    unsubscribe();
    l.tick();
    expect(listener).not.toHaveBeenCalled();
  });
  it("stops on initialization failure, disables project work and retries explicitly", async () => {
    let calls = 0,
      now = 0;
    const l = new AppLifecycle(
      async () => {
        if (++calls === 1) throw new Error("Offline startup error");
      },
      () => now,
    );
    l.displayed();
    await l.initialize();
    expect(l.getSnapshot()).toMatchObject({
      phase: "error",
      errorKind: "boot",
    });
    const open = vi.fn();
    await l.project("opening-project", open, () => {});
    expect(open).not.toHaveBeenCalled();
    await l.initialize();
    expect(calls).toBe(1);
    l.retry();
    await l.initialize();
    expect(calls).toBe(2);
    now = 10_000;
    l.tick();
    now += 650;
    l.tick();
    expect(l.getSnapshot().phase).toBe("project-selection");
  });
  it("single-flights project operations and returns cancellation/error to selection", async () => {
    const { lifecycle: l, setTime } = await boot();
    setTime(10_000);
    setTime(10_650);
    let finish!: (v: { ok: true; value: null }) => void;
    const work = vi.fn(
      () =>
        new Promise<{ ok: true; value: null }>((r) => {
          finish = r;
        }),
    );
    const first = l.project("opening-project", work, () => {});
    await l.project("creating-project", work, () => {});
    expect(work).toHaveBeenCalledTimes(1);
    finish({ ok: true, value: null });
    await first;
    expect(l.getSnapshot().phase).toBe("project-selection");
    await l.project(
      "opening-project",
      async () => ({ ok: false, error: "Invalid project" }),
      () => {},
    );
    expect(l.getSnapshot()).toMatchObject({
      phase: "error",
      errorKind: "project",
      error: "Invalid project",
    });
  });
  it("commits only successful snapshots, retains an old workspace on failed switch, closes without boot", async () => {
    const { lifecycle: l, setTime } = await boot();
    setTime(10_000);
    setTime(10_650);
    const commit = vi.fn();
    await l.project(
      "creating-project",
      async () => ({ ok: true, value }),
      commit,
    );
    expect(commit).toHaveBeenCalledWith(value);
    expect(l.getSnapshot().phase).toBe("workspace");
    await l.project(
      "opening-project",
      async () => ({ ok: false, error: "Broken" }),
      commit,
    );
    expect(l.getSnapshot().phase).toBe("workspace");
    expect(commit).toHaveBeenCalledTimes(1);
    const closed = vi.fn();
    await l.close(async () => ({ ok: true, value: null }), closed);
    expect(closed).toHaveBeenCalledOnce();
    expect(l.getSnapshot().phase).toBe("project-selection");
    await l.project(
      "opening-project",
      async () => ({ ok: true, value }),
      commit,
    );
    expect(l.getSnapshot().phase).toBe("workspace");
  });
  it("does not clear the active project when close fails", async () => {
    const { lifecycle: l, setTime } = await boot();
    setTime(10_000);
    setTime(10_650);
    await l.project(
      "creating-project",
      async () => ({ ok: true, value }),
      () => {},
    );
    const closed = vi.fn();
    await l.close(async () => ({ ok: false, error: "Running job" }), closed);
    expect(closed).not.toHaveBeenCalled();
    expect(l.getSnapshot()).toMatchObject({
      phase: "workspace",
      error: "Running job",
    });
  });
});
it("closing releases staging and old project authority without modifying masters or manifests", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "laceframe-close-"));
  try {
    const s = new ProjectService();
    await s.create(root, "Synthetic close");
    await s.command({ type: "addCharacter", name: "Fixture" });
    const image = await s.stage(transparentPng(), "master.png");
    await s.command({
      type: "confirmMaster",
      characterId: s.snapshot().project.characters[0].id,
      token: image.token,
      review: masterReview(image.sha256),
    });
    const before = s.snapshot(),
      master = before.project.masters[0],
      manifest = await fs.readFile(path.join(root, "laceframe.json")),
      bytes = await fs.readFile(path.join(root, master.file));
    const pending = await s.stage(transparentPng(), "pending.png");
    s.close();
    s.close();
    expect(() => s.snapshot()).toThrow("Projekt öffnen");
    await expect(
      s.command({ type: "addCharacter", name: "No authority" }),
    ).rejects.toThrow();
    expect(await fs.readFile(path.join(root, "laceframe.json"))).toEqual(
      manifest,
    );
    expect(await fs.readFile(path.join(root, master.file))).toEqual(bytes);
    await s.open(root);
    await expect(
      s.command({
        type: "confirmMaster",
        characterId: before.project.characters[0].id,
        token: pending.token,
        review: masterReview(pending.sha256),
      }),
    ).rejects.toThrow();
    expect(s.snapshot().project).toEqual(before.project);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
