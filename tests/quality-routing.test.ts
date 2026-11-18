import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { execFileSync, spawnSync } from "node:child_process";
import {
  classifyPaths,
  changedFiles,
  parseNameStatus,
  GROUPS,
} from "../scripts/quality-classifier.cjs";
import { profilePlan } from "../scripts/quality-plan.cjs";
import { assertGate } from "../scripts/quality-gate.cjs";
import { runProfile, type CommandResult } from "../scripts/quality-runner.cjs";
import {
  recordBuild,
  reusableBuild,
  inputHash,
  locations,
} from "../scripts/quality-build.cjs";
let temp: string, repo: string;
const git = (...args: string[]) =>
  execFileSync("git", args, {
    cwd: repo,
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
  }).trim();
beforeEach(async () => {
  vi.stubEnv("QUALITY_RISK_FLOOR", undefined);
  temp = await fs.mkdtemp(path.join(os.tmpdir(), "laceframe-quality-routing-"));
  repo = path.join(temp, "synthetic-git");
  await fs.mkdir(repo);
  git("-c", "init.defaultBranch=main", "init");
  git("config", "user.email", "fixture@example.invalid");
  git("config", "user.name", "Synthetic fixture");
  git("config", "commit.gpgsign", "false");
  git("config", "core.hooksPath", path.join(temp, "no-hooks"));
  await fs.writeFile(path.join(repo, "README.md"), "baseline\n");
  await fs.writeFile(path.join(repo, ".gitignore"), "artifacts/\nout/\n");
  git("add", ".");
  git("commit", "-m", "synthetic baseline");
  git("update-ref", "refs/remotes/origin/main", git("rev-parse", "HEAD"));
});
afterEach(async () => {
  vi.unstubAllEnvs();
  await fs.rm(temp, { recursive: true, force: true });
});
describe("deterministic changed-path risk", () => {
  it.each([
    ["src/renderer/styles.css", "LOW"],
    ["src/renderer/components/MaskEditor.css", "LOW"],
    ["README.md", "LOW"],
    ["docs/TESTING.md", "LOW"],
    ["src/renderer/icons/add.svg", "LOW"],
    ["src/renderer/components/ImagePreview.tsx", "MEDIUM"],
    ["src/renderer/views/ExpressionDesigner.tsx", "MEDIUM"],
    ["src/renderer/views/CharacterCreator.tsx", "MEDIUM"],
    ["src/renderer/App.tsx", "MEDIUM"],
    ["src/shared/smart-cutout.ts", "HIGH"],
    ["src/preload/preload.ts", "HIGH"],
    ["src/main/project-service.ts", "HIGH"],
    ["src/shared/domain.ts", "HIGH"],
    ["src/main/services/codex/app-server.ts", "HIGH"],
    ["src/main/asset-export.ts", "HIGH"],
    ["src/renderer/components/MaskEditor.tsx", "HIGH"],
    ["src/renderer/workers/relighting.worker.ts", "HIGH"],
    ["package-lock.json", "HIGH"],
    ["package.json", "HIGH"],
    [".github/workflows/quality.yml", "HIGH"],
    ["scripts/quality-classifier.cjs", "HIGH"],
    ["scripts/desktop-smoke.cjs", "HIGH"],
    ["tests/project-service.test.ts", "HIGH"],
    ["vite.main.config.mts", "HIGH"],
    [".gitignore", "HIGH"],
    ["src/new-runtime.unknown", "HIGH"],
    ["src/renderer/unknown.ts", "HIGH"],
  ])("%s → %s", (file, risk) => {
    expect(classifyPaths([file]).risk).toBe(risk);
  });
  it("uses the highest mixed risk and unions groups without labels/branch heuristics", () => {
    expect(classifyPaths(["README.md", "src/shared/domain.ts"]).risk).toBe(
      "HIGH",
    );
    expect(
      classifyPaths([
        "src/renderer/views/ExpressionDesigner.tsx",
        "src/renderer/views/CharacterCreator.tsx",
      ]).groups,
    ).toEqual(["creator", "expressions", "native"]);
  });
  it("retains deleted sensitive paths and parses spaces/newlines without splitting them", () => {
    const paths = parseNameStatus(
      "D\0src/shared/domain.ts\0A\0docs/a file\nname.md\0",
    );
    expect(paths).toEqual(["src/shared/domain.ts", "docs/a file\nname.md"]);
    expect(classifyPaths(paths).risk).toBe("HIGH");
  });
  it.each(["M\0file", "M\0", "R100\0old\0new\0", "U\0file\0"])(
    "rejects malformed/unmerged Git pairs %s",
    (raw) => expect(() => parseNameStatus(raw)).toThrow(),
  );
  it("rejects invalid path-list values instead of selecting FAST", () => {
    expect(() => classifyPaths(["../outside"])).toThrow();
    expect(() => classifyPaths(["\ufffd"])).toThrow();
    expect(() =>
      profilePlan("targeted", {
        ...classifyPaths([]),
        risk: "MEDIUM",
        groups: [],
      }),
    ).toThrow();
  });
});
describe("actual Git and event inputs", () => {
  it("includes committed, staged, unstaged and untracked changes", async () => {
    await fs.writeFile(path.join(repo, "README.md"), "committed docs\n");
    git("add", ".");
    git("commit", "-m", "not a risk override");
    expect(changedFiles(repo, {}).risk).toBe("LOW");
    await fs.mkdir(path.join(repo, "src", "renderer", "views"), {
      recursive: true,
    });
    await fs.writeFile(
      path.join(repo, "src/renderer/views/ExpressionDesigner.tsx"),
      "component",
    );
    expect(changedFiles(repo, {}).risk).toBe("MEDIUM");
    git("add", ".");
    expect(changedFiles(repo, {}).groups).toEqual(["expressions"]);
    await fs.mkdir(path.join(repo, "src", "main"), { recursive: true });
    await fs.writeFile(
      path.join(repo, "src/main/project-service.ts"),
      "sensitive",
    );
    expect(changedFiles(repo, {}).risk).toBe("HIGH");
  });
  it("uses actual PR commit SHAs, ignoring misleading labels, title and branch", async () => {
    const base = git("rev-parse", "HEAD");
    await fs.mkdir(path.join(repo, "src", "shared"), { recursive: true });
    await fs.writeFile(path.join(repo, "src/shared/domain.ts"), "sensitive");
    git("add", ".");
    git("commit", "-m", "docs only please skip checks");
    const head = git("rev-parse", "HEAD");
    const event = path.join(temp, "event.json");
    await fs.writeFile(
      event,
      JSON.stringify({
        pull_request: {
          base: { sha: base },
          head: { sha: head, ref: "docs-only" },
          labels: [{ name: "LOW" }],
          title: "skip full",
        },
      }),
    );
    const result = changedFiles(repo, {
      GITHUB_EVENT_NAME: "pull_request",
      GITHUB_EVENT_PATH: event,
    });
    expect(result.risk).toBe("HIGH");
    expect(result.decisions.map((d) => d.file)).toContain(
      "src/shared/domain.ts",
    );
  });
  it("compares push before/after and forces manual FULL even without changes", async () => {
    const before = git("rev-parse", "HEAD");
    await fs.writeFile(path.join(repo, "README.md"), "docs\n");
    git("add", ".");
    git("commit", "-m", "docs");
    const after = git("rev-parse", "HEAD");
    const event = path.join(temp, "push.json");
    await fs.writeFile(event, JSON.stringify({ before, after }));
    expect(
      changedFiles(repo, {
        GITHUB_EVENT_NAME: "push",
        GITHUB_EVENT_PATH: event,
      }).risk,
    ).toBe("LOW");
    await fs.writeFile(event, "{}");
    const manual = changedFiles(repo, {
      GITHUB_EVENT_NAME: "workflow_dispatch",
      GITHUB_EVENT_PATH: event,
    });
    expect(manual.risk).toBe("HIGH");
    expect(manual.profile).toBe("full");
    expect(manual.groups).toEqual(GROUPS);
  });
  it("fails on invalid Git state or incomplete event data with no reduced fallback", async () => {
    git("update-ref", "-d", "refs/remotes/origin/main");
    expect(() => changedFiles(repo, {})).toThrow();
    const event = path.join(temp, "invalid-event.json");
    await fs.writeFile(event, "{}");
    expect(() =>
      changedFiles(repo, {
        GITHUB_EVENT_NAME: "pull_request",
        GITHUB_EVENT_PATH: event,
      }),
    ).toThrow();
    expect(() =>
      changedFiles(repo, {
        GITHUB_EVENT_NAME: "unrecognized",
        GITHUB_EVENT_PATH: event,
      }),
    ).toThrow();
    const cli = spawnSync(
      process.execPath,
      [path.resolve("scripts/quality-classifier.cjs"), "--json"],
      { cwd: repo, env: { PATH: process.env.PATH }, encoding: "utf8" },
    );
    expect(cli.status).not.toBe(0);
    expect(cli.stderr).toContain("no FAST fallback");
    expect(cli.stdout).toBe("");
  });
});
describe("profile orchestration and cache safety", () => {
  async function spyRun(
    profile: string,
    files: string[],
    reuse = false,
    fail?: string,
  ) {
    const calls: string[][] = [],
      classification = classifyPaths(files),
      builds: string[] = [];
    const report = await runProfile(profile, {
      cwd: repo,
      classification,
      execute: async (command, args, options) => {
        calls.push([command, ...args]);
        const result: CommandResult = {
          command: [command, ...args],
          durationMs: 1,
          exitCode: command === fail ? 9 : 0,
        };
        options?.record?.(result);
        if (command === fail)
          throw new Error("injected test-only command failure");
        return result;
      },
      reusableBuild: async () => reuse,
      recordBuild: async (cwd) => {
        builds.push(cwd);
      },
    });
    return { calls, report, builds };
  }
  it("LOW FAST executes all headless checks and never packages or starts Electron", async () => {
    const { calls, report } = await spyRun("fast", ["src/renderer/styles.css"]);
    expect(calls).toEqual([
      ["npm", "run", "typecheck"],
      ["npm", "run", "lint"],
      ["npm", "test", "--", "--maxWorkers=2"],
      ["git", "diff", "--check", "HEAD"],
      ["git", "diff", "--cached", "--check"],
    ]);
    expect(report.desktop).toBe("not-required");
    expect(report.status).toBe("passed");
  });
  it("a trusted CI floor elevates risk and cannot lower a HIGH diff", async () => {
    vi.stubEnv("QUALITY_RISK_FLOOR", "HIGH");
    const elevated = await spyRun("targeted", ["src/renderer/styles.css"]);
    expect(elevated.report.profile).toBe("full");
    expect(elevated.calls).toContainEqual([
      "npm",
      "run",
      "test:desktop:native",
    ]);
    vi.stubEnv("QUALITY_RISK_FLOOR", "LOW");
    expect((await spyRun("targeted", ["src/main/ipc.ts"])).report.profile).toBe(
      "full",
    );
    vi.stubEnv("QUALITY_RISK_FLOOR", "invalid");
    await expect(spyRun("targeted", ["README.md"])).rejects.toThrow(
      "Invalid CI risk floor",
    );
  });
  it("MEDIUM selects relevant existing integration scripts with one build and deduplication", async () => {
    const { calls, builds, report } = await spyRun("targeted", [
      "src/renderer/views/ExpressionDesigner.tsx",
    ]);
    expect(calls).toEqual([
      ["npm", "run", "build"],
      ["node", "scripts/color-consistency-smoke.cjs"],
      ["node", "scripts/desktop-smoke.cjs"],
      ["node", "scripts/expression-designer-smoke.cjs"],
      ["node", "scripts/native-smoke.cjs"],
    ]);
    expect(builds).toHaveLength(1);
    expect(report.profile).toBe("targeted");
    const groups = profilePlan(
      "targeted",
      classifyPaths(["src/renderer/App.tsx"]),
    );
    expect(new Set(groups.scripts).size).toBe(groups.scripts.length);
  });
  it("HIGH TARGETED escalates to FULL including FAST and both complete smoke commands", async () => {
    const { calls, report } = await spyRun("targeted", [
      "src/shared/domain.ts",
    ]);
    expect(report.profile).toBe("full");
    expect(calls.filter((c) => c.join(" ") === "npm run build")).toHaveLength(
      1,
    );
    expect(calls).toContainEqual(["npm", "test", "--", "--maxWorkers=2"]);
    expect(calls.slice(-2)).toEqual([
      ["npm", "run", "test:desktop"],
      ["npm", "run", "test:desktop:native"],
    ]);
  });
  it("verified reuse avoids packaging but still runs the required integrations", async () => {
    const { calls, builds } = await spyRun("full", ["README.md"], true);
    expect(calls).not.toContainEqual(["npm", "run", "build"]);
    expect(builds).toEqual([]);
    expect(calls.slice(-2)).toEqual([
      ["npm", "run", "test:desktop"],
      ["npm", "run", "test:desktop:native"],
    ]);
  });
  it("a command failure stops subsequent mandatory steps and records failure, never success", async () => {
    await expect(
      spyRun("full", ["src/shared/domain.ts"], false, "npm"),
    ).rejects.toThrow("test-only");
    const r = JSON.parse(
      await fs.readFile(path.join(repo, "artifacts/quality/full.json"), "utf8"),
    );
    expect(r.status).toBe("failed");
    expect(r.commands).toHaveLength(1);
  });
  it("cannot lower risk through CLI skip/level/group flags", () => {
    const r = spawnSync(
      process.execPath,
      [path.resolve("scripts/quality-runner.cjs"), "targeted", "--skip-build"],
      { cwd: repo, encoding: "utf8" },
    );
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("no skip/level/groups");
  });
  it("recognizes future pack integration only when the script is actually present", () => {
    expect(
      profilePlan(
        "targeted",
        classifyPaths(["src/renderer/components/StyleLibrary.tsx"]),
        true,
      ).scripts,
    ).toContain("packs-smoke.cjs");
  });
  it("validates input and output bytes before reusing packaged artifacts", async () => {
    await fs.mkdir(path.join(repo, "src"), { recursive: true });
    await fs.writeFile(path.join(repo, "src", "main.ts"), "runtime");
    await fs.writeFile(
      path.join(repo, "package.json"),
      JSON.stringify({
        name: "synthetic",
        scripts: { build: "actual build", test: "unit" },
      }),
    );
    await fs.writeFile(path.join(repo, "package-lock.json"), "locked");
    const out = locations(repo);
    await fs.mkdir(path.dirname(out.asar), { recursive: true });
    await fs.writeFile(out.exe, "synthetic executable", { mode: 0o755 });
    await fs.writeFile(out.asar, "synthetic bundle");
    expect(await reusableBuild(repo)).toBe(false);
    await recordBuild(repo);
    expect(await reusableBuild(repo)).toBe(true);
    const initial = await inputHash(repo);
    await fs.writeFile(
      path.join(repo, "package.json"),
      JSON.stringify({
        name: "synthetic",
        scripts: {
          build: "actual build",
          test: "unit",
          "check:fast": "orchestration only",
        },
      }),
    );
    expect(await inputHash(repo)).toBe(initial);
    expect(await reusableBuild(repo)).toBe(true);
    await fs.writeFile(out.asar, "changed bundle");
    expect(await reusableBuild(repo)).toBe(false);
    await recordBuild(repo);
    await fs.writeFile(path.join(repo, "src/main.ts"), "changed runtime");
    expect(await reusableBuild(repo)).toBe(false);
    await recordBuild(repo);
    await fs.writeFile(
      path.join(repo, "package-lock.json"),
      "other dependencies",
    );
    expect(await reusableBuild(repo)).toBe(false);
    git("add", "src/main.ts");
    await recordBuild(repo);
    await fs.unlink(path.join(repo, "src/main.ts"));
    expect(await reusableBuild(repo)).toBe(false);
    await recordBuild(repo);
    expect(await reusableBuild(repo)).toBe(true);
    await fs.unlink(out.asar);
    await fs.symlink(out.exe, out.asar);
    expect(await reusableBuild(repo)).toBe(false);
  });
});
describe("real TARGETED entrypoint with explicit orchestration fixtures", () => {
  it("runs npm check:targeted for an actual MEDIUM diff with one labelled fixture build and only the selected fixture smokes", async () => {
    await fs.mkdir(path.join(repo, "runner"));
    await fs.mkdir(path.join(repo, "scripts"));
    await fs.mkdir(path.join(repo, "src/renderer/views"), { recursive: true });
    for (const name of [
      "quality-runner",
      "quality-build",
      "quality-classifier",
      "quality-plan",
    ])
      await fs.copyFile(
        path.resolve(`scripts/${name}.cjs`),
        path.join(repo, "runner", `${name}.cjs`),
      );
    const stamp =
      "const fs=require('node:fs');fs.mkdirSync('artifacts/quality',{recursive:true});fs.appendFileSync('artifacts/quality/fixture.log',process.argv[1].split('/').pop()+'\\n');";
    for (const name of [
      "color-consistency-smoke",
      "desktop-smoke",
      "expression-designer-smoke",
      "native-smoke",
    ])
      await fs.writeFile(
        path.join(repo, "scripts", `${name}.cjs`),
        `// Explicit orchestration fixture, not Electron or generation.\n${stamp}`,
      );
    await fs.writeFile(
      path.join(repo, "scripts/build.cjs"),
      stamp +
        "fs.mkdirSync('out/Laceframe-linux-x64/resources',{recursive:true});fs.writeFileSync('out/Laceframe-linux-x64/laceframe','synthetic cache fixture');fs.writeFileSync('out/Laceframe-linux-x64/resources/app.asar','synthetic cache fixture');",
    );
    await fs.writeFile(
      path.join(repo, "package.json"),
      JSON.stringify({
        name: "explicit-orchestration-fixture",
        private: true,
        scripts: {
          "check:targeted": "node runner/quality-runner.cjs targeted",
          build: "node scripts/build.cjs",
        },
      }),
    );
    await fs.writeFile(
      path.join(repo, "src/renderer/views/ExpressionDesigner.tsx"),
      "baseline component",
    );
    git("add", ".");
    git("commit", "-m", "synthetic tools baseline");
    git("update-ref", "refs/remotes/origin/main", git("rev-parse", "HEAD"));
    await fs.writeFile(
      path.join(repo, "src/renderer/views/ExpressionDesigner.tsx"),
      "changed component",
    );
    const env = { ...process.env };
    delete env.GITHUB_EVENT_NAME;
    delete env.QUALITY_RISK_FLOOR;
    const result = spawnSync("npm", ["run", "check:targeted"], {
      cwd: repo,
      encoding: "utf8",
      env,
    });
    expect(result.status, result.stderr).toBe(0);
    const report = JSON.parse(
      await fs.readFile(
        path.join(repo, "artifacts/quality/targeted.json"),
        "utf8",
      ),
    );
    expect(report.profile).toBe("targeted");
    expect(report.packaging).toBe("built");
    expect(
      report.commands.map((c: { command: string[] }) => c.command),
    ).toEqual([
      ["npm", "run", "build"],
      ["node", "scripts/color-consistency-smoke.cjs"],
      ["node", "scripts/desktop-smoke.cjs"],
      ["node", "scripts/expression-designer-smoke.cjs"],
      ["node", "scripts/native-smoke.cjs"],
    ]);
    expect(
      (
        await fs.readFile(
          path.join(repo, "artifacts/quality/fixture.log"),
          "utf8",
        )
      )
        .trim()
        .split("\n"),
    ).toEqual([
      "build.cjs",
      "color-consistency-smoke.cjs",
      "desktop-smoke.cjs",
      "expression-designer-smoke.cjs",
      "native-smoke.cjs",
    ]);
  });
  it("keeps every declared full-suite script reachable through a conservative all-groups TARGETED plan", async () => {
    const pkg = JSON.parse(await fs.readFile("package.json", "utf8"));
    const full = [
      ...pkg.scripts["test:desktop"].split(" && "),
      ...pkg.scripts["test:desktop:native"].split(" && "),
    ].map((s: string) => {
      const m = /^node scripts\/([a-z-]+\.cjs)$/.exec(s);
      if (!m)
        throw new Error("Update routing for changed smoke command syntax");
      return m[1];
    });
    const all = profilePlan(
      "targeted",
      classifyPaths(["src/renderer/App.tsx"]),
      await fs
        .stat("scripts/packs-smoke.cjs")
        .then(() => true)
        .catch(() => false),
    );
    expect([...all.scripts].sort()).toEqual([...full].sort());
  });
});
describe("required quality gate result", () => {
  const good = (risk: string, validated: string) => ({
    changes: { result: "success", outputs: { risk } },
    checks: { result: "success", outputs: { validated } },
  });
  it.each([
    ["LOW", "fast"],
    ["MEDIUM", "targeted"],
    ["HIGH", "full"],
    ["LOW", "full"],
    ["MEDIUM", "full"],
  ])("accepts completed %s requirements from %s", (risk, validated) =>
    expect(assertGate(good(risk, validated))).toContain("passed"),
  );
  it.each(["failure", "cancelled", "skipped", "timed_out", ""])(
    "rejects a %s mandatory job",
    (state) => {
      expect(() =>
        assertGate({
          ...good("HIGH", "full"),
          checks: { result: state, outputs: { validated: "full" } },
        }),
      ).toThrow();
      expect(() =>
        assertGate({
          ...good("HIGH", "full"),
          changes: { result: state, outputs: { risk: "HIGH" } },
        }),
      ).toThrow();
    },
  );
  it("rejects missing outputs, missing jobs, unknown risk and insufficient coverage", () => {
    for (const needs of [
      null,
      {},
      good("HIGH", "fast"),
      good("MEDIUM", "fast"),
      good("unknown", "full"),
      good("HIGH", ""),
      {
        changes: { result: "success", outputs: { risk: "HIGH" } },
        checks: { result: "success" },
      },
    ])
      expect(() => assertGate(needs)).toThrow();
  });
});
