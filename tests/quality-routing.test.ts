import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { execFileSync, spawnSync } from "node:child_process";
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
  vi.stubEnv("QUALITY_DIFF_BASE", undefined);
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
describe("explicit development and smoke profiles", () => {
  async function spyRun(
    profile: string,
    workflow?: string,
    reuse = false,
    fail?: string,
  ) {
    const calls: string[][] = [],
      builds: string[] = [];
    const report = await runProfile(profile, {
      cwd: repo,
      workflow,
      execute: async (command, args, options) => {
        calls.push([command, ...args]);
        const result: CommandResult = {
          command: [command, ...args],
          durationMs: 1,
          exitCode: command === fail ? 9 : 0,
        };
        options?.record?.(result);
        if (command === fail) throw new Error("injected failure");
        return result;
      },
      reusableBuild: async () => reuse,
      recordBuild: async (cwd) => {
        builds.push(cwd);
      },
    });
    return { calls, builds, report };
  }
  it("DEV always runs exactly typecheck, units and whitespace; no lint/build/desktop", async () => {
    // Sensitive or unknown files cannot silently escalate the development profile.
    await fs.mkdir(path.join(repo, "src/shared"), { recursive: true });
    await fs.writeFile(path.join(repo, "src/shared/new.ts"), "changed");
    vi.stubEnv("QUALITY_RISK_FLOOR", "HIGH");
    const { calls, report } = await spyRun("dev");
    expect(calls).toEqual([
      ["npm", "run", "typecheck"],
      ["npm", "test", "--", "--maxWorkers=2"],
      ["git", "diff", "--check", "HEAD"],
      ["git", "diff", "--cached", "--check"],
    ]);
    expect(report.status).toBe("passed");
    expect(report.packaging).toBe("not-required");
    expect(report.desktop).toBe("not-required");
  });
  it("checks committed PR whitespace against the supplied base", async () => {
    const base = git("rev-parse", "HEAD");
    vi.stubEnv("QUALITY_DIFF_BASE", base);
    expect((await spyRun("dev")).calls).toContainEqual([
      "git",
      "diff",
      "--check",
      base,
    ]);
  });
  it.each([
    ["creator", "creator-smoke.cjs"],
    ["expressions", "expression-designer-smoke.cjs"],
    ["color", "color-consistency-smoke.cjs"],
    ["cutout", "smart-cutout-smoke.cjs"],
    ["relighting", "relighting-smoke.cjs"],
    ["native", "native-smoke.cjs"],
  ])("SMOKE %s packages once and executes only %s", async (name, script) => {
    const { calls, builds } = await spyRun("smoke", name);
    expect(calls).toEqual([
      ["npm", "run", "build"],
      ["node", `scripts/${script}`],
    ]);
    expect(builds).toEqual([repo]);
  });
  it("SMOKE reuses a verified build, without skipping its selected workflow", async () => {
    const { calls, builds, report } = await spyRun("smoke", "creator", true);
    expect(calls).toEqual([["node", "scripts/creator-smoke.cjs"]]);
    expect(builds).toEqual([]);
    expect(report.packaging).toBe("reused-verified");
  });
  it("FULL retains lint, all units and both complete desktop suites", async () => {
    const { calls, builds } = await spyRun("full");
    expect(calls).toEqual([
      ["npm", "run", "typecheck"],
      ["npm", "run", "lint"],
      ["npm", "test", "--", "--maxWorkers=2"],
      ["git", "diff", "--check", "HEAD"],
      ["git", "diff", "--cached", "--check"],
      ["npm", "run", "build"],
      ["npm", "run", "test:desktop"],
      ["npm", "run", "test:desktop:native"],
    ]);
    expect(builds).toHaveLength(1);
  });
  it.each([
    ["smoke", undefined],
    ["smoke", "../bad"],
    ["smoke", "all"],
    ["dev", "creator"],
    ["unknown", undefined],
  ])(
    "rejects an ambiguous/invalid request %s %s before executing anything",
    async (profile, workflow) => {
      await expect(spyRun(profile, workflow)).rejects.toThrow();
    },
  );
  it("records failure and stops subsequent steps", async () => {
    await expect(spyRun("dev", undefined, false, "npm")).rejects.toThrow(
      "injected",
    );
    const report = JSON.parse(
      await fs.readFile(path.join(repo, "artifacts/quality/dev.json"), "utf8"),
    );
    expect(report.status).toBe("failed");
    expect(report.commands).toHaveLength(1);
    expect(report.commands[0].exitCode).toBe(9);
  });
  it("a real child process failure is propagated", async () => {
    const { execute } = await import("../scripts/quality-runner.cjs");
    const records: CommandResult[] = [];
    await expect(
      execute(process.execPath, ["-e", "process.exit(7)"], {
        record: (r) => records.push(r),
      }),
    ).rejects.toThrow("failed");
    expect(records[0].exitCode).toBe(7);
    expect(records[0].durationMs).toBeGreaterThanOrEqual(0);
  });
  it("a signalled child cannot be reported as passed", async () => {
    const { execute } = await import("../scripts/quality-runner.cjs");
    const records: CommandResult[] = [];
    await expect(
      execute(
        process.execPath,
        ["-e", "process.kill(process.pid, 'SIGTERM')"],
        { record: (r) => records.push(r) },
      ),
    ).rejects.toThrow("failed");
    expect(records[0].exitCode).not.toBe(0);
  });
  it("requires a workflow at the actual CLI entrypoint", () => {
    const result = spawnSync(
      process.execPath,
      [path.resolve("scripts/quality-runner.cjs"), "smoke"],
      { cwd: repo, encoding: "utf8" },
    );
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Usage:");
  });
  it("the npm smoke entrypoint executes one fixture workflow, then verifies and reuses its build", async () => {
    // Explicit orchestration fixtures: no Electron, generated artwork or real project.
    await fs.mkdir(path.join(repo, "runner"));
    await fs.mkdir(path.join(repo, "scripts"));
    for (const name of ["quality-runner", "quality-build"])
      await fs.copyFile(
        path.resolve(`scripts/${name}.cjs`),
        path.join(repo, "runner", `${name}.cjs`),
      );
    await fs.writeFile(
      path.join(repo, "scripts/build.cjs"),
      `
      const fs = require('node:fs');
      fs.mkdirSync('out/Laceframe-linux-x64/resources', {recursive:true});
      fs.writeFileSync('out/Laceframe-linux-x64/laceframe', 'synthetic executable');
      fs.writeFileSync('out/Laceframe-linux-x64/resources/app.asar', 'synthetic bundle');
      fs.appendFileSync('artifacts/quality/fixture.log', 'build\\n');
    `,
    );
    await fs.writeFile(
      path.join(repo, "scripts/creator-smoke.cjs"),
      `
      require('node:fs').appendFileSync('artifacts/quality/fixture.log', 'creator\\n');
    `,
    );
    await fs.writeFile(
      path.join(repo, "package.json"),
      JSON.stringify({
        private: true,
        scripts: {
          "check:smoke": "node runner/quality-runner.cjs smoke",
          build: "node scripts/build.cjs",
        },
      }),
    );
    for (const packaging of ["built", "reused-verified"]) {
      const result = spawnSync("npm", ["run", "check:smoke", "--", "creator"], {
        cwd: repo,
        encoding: "utf8",
      });
      expect(result.status, result.stderr).toBe(0);
      const report = JSON.parse(
        await fs.readFile(
          path.join(repo, "artifacts/quality/smoke.json"),
          "utf8",
        ),
      );
      expect(report.profile).toBe("smoke");
      expect(report.workflow).toBe("creator");
      expect(report.packaging).toBe(packaging);
      expect(report.status).toBe("passed");
    }
    expect(
      await fs.readFile(
        path.join(repo, "artifacts/quality/fixture.log"),
        "utf8",
      ),
    ).toBe("build\ncreator\ncreator\n");
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
    await fs.mkdir(path.join(repo, "scripts"));
    await fs.writeFile(path.join(repo, "scripts/test-helper.cjs"), "test only");
    expect(await reusableBuild(repo)).toBe(true);
    await fs.writeFile(
      path.join(repo, "vite.main.config.mts"),
      "new build config",
    );
    expect(await reusableBuild(repo)).toBe(false);
    await recordBuild(repo);
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

describe("single-job PR CI contract", () => {
  it("keeps quality-gate and manual FULL, with desktop setup guarded by dispatch", async () => {
    const workflow = await fs.readFile(".github/workflows/quality.yml", "utf8");
    expect(workflow).toContain("  pull_request:\n    branches: [main]");
    expect(workflow).toContain("  workflow_dispatch:");
    expect(workflow).not.toMatch(/^ {2}push:/m);
    expect([...workflow.matchAll(/^ {2}[a-z-]+:\n {4}name:/gm)]).toHaveLength(
      1,
    );
    expect(workflow).toContain("  quality-gate:\n    name: quality-gate");
    expect(workflow).not.toMatch(
      /classifier|REQUIRED_RISK|needs:|continue-on-error/,
    );
    expect(workflow).toContain(
      "if: github.event_name == 'pull_request'\n        run: npm run check:dev",
    );
    expect(workflow).toContain(
      "name: Desktop dependencies (manual FULL only)\n        if: github.event_name == 'workflow_dispatch'",
    );
    expect(workflow).toContain(
      "name: Manual FULL regression\n        if: github.event_name == 'workflow_dispatch'",
    );
    expect(workflow).toContain(
      "report.status !== 'passed' || report.profile !== profile",
    );
    expect(workflow).toContain("ELECTRON_SKIP_BINARY_DOWNLOAD:");
  });
  it("preserves every full-regression smoke command and exposes explicit entrypoints", async () => {
    const pkg = JSON.parse(await fs.readFile("package.json", "utf8"));
    const scripts = pkg.scripts;
    expect(scripts["check:dev"]).toBe("node scripts/quality-runner.cjs dev");
    expect(scripts["check:smoke"]).toBe(
      "node scripts/quality-runner.cjs smoke",
    );
    expect(scripts["check:full"]).toBe("node scripts/quality-runner.cjs full");
    const full = [
      ...scripts["test:desktop"].split(" && "),
      ...scripts["test:desktop:native"].split(" && "),
    ];
    expect(full).toHaveLength(11);
    for (const command of full) {
      expect(command).toMatch(/^node scripts\/[a-z-]+-smoke.cjs$/);
      await expect(fs.stat(command.slice(5))).resolves.toBeDefined();
    }
  });
});
