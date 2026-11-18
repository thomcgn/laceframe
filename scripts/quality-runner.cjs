/* global module, performance, clearTimeout */
const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { reusableBuild, recordBuild } = require("./quality-build.cjs");
function execute(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const started = performance.now();
    const child = spawn(command, args, {
      cwd: options.cwd,
      stdio: "inherit",
      shell: false,
      detached: process.platform !== "win32",
    });
    let done = false,
      hardStop,
      interrupted = false;
    const signalChild = (signal) => {
      try {
        if (child.pid)
          process.kill(
            process.platform === "win32" ? child.pid : -child.pid,
            signal,
          );
      } catch (error) {
        if (error.code !== "ESRCH") console.error(error.message);
      }
    };
    const interrupt = () => {
        interrupted = true;
        signalChild("SIGINT");
      },
      terminate = () => {
        interrupted = true;
        signalChild("SIGTERM");
      };
    process.on("SIGINT", interrupt);
    process.on("SIGTERM", terminate);
    const timer = setTimeout(
      () => {
        terminate();
        hardStop = setTimeout(() => signalChild("SIGKILL"), 5000);
      },
      20 * 60 * 1000,
    );
    const finish = (code, error) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      if (hardStop) clearTimeout(hardStop);
      process.off("SIGINT", interrupt);
      process.off("SIGTERM", terminate);
      const result = {
        command: [command, ...args],
        durationMs: Math.round(performance.now() - started),
        exitCode: code ?? -1,
      };
      options.record?.(result);
      if (error || code !== 0 || interrupted)
        reject(
          error ??
            new Error(
              `${command} ${args.join(" ")} failed (${code ?? "signal"})`,
            ),
        );
      else resolve(result);
    };
    child.once("error", (e) => finish(-1, e));
    child.once("close", (code) => finish(code));
  });
}
async function runProfile(profile, options = {}) {
  const cwd = options.cwd ?? process.cwd();
  const scripts = {
    creator: "creator-smoke.cjs",
    expressions: "expression-designer-smoke.cjs",
    color: "color-consistency-smoke.cjs",
    cutout: "smart-cutout-smoke.cjs",
    relighting: "relighting-smoke.cjs",
    desktop: "desktop-smoke.cjs",
    quality: "quality-smoke.cjs",
    "cutout-stability": "cutout-stability-smoke.cjs",
    style: "style-analysis-smoke.cjs",
    packs: "packs-smoke.cjs",
    native: "native-smoke.cjs",
  };
  if (!["dev", "smoke", "full"].includes(profile))
    throw new Error("Unknown profile; use dev, smoke <workflow>, or full");
  if (
    profile === "smoke"
      ? !Object.hasOwn(scripts, options.workflow)
      : options.workflow !== undefined
  )
    throw new Error(
      `Select exactly one smoke workflow: ${Object.keys(scripts).join(", ")}`,
    );
  const build = profile !== "dev",
    records = [];
  const run = options.execute ?? execute,
    canReuse = options.reusableBuild ?? reusableBuild,
    saveBuild = options.recordBuild ?? recordBuild;
  const report = {
    requested: profile,
    profile,
    workflow: options.workflow,
    desktop: build ? "required" : "not-required",
    packaging: build ? "required" : "not-required",
    commands: records,
    status: "running",
  };
  fs.mkdirSync(path.join(cwd, "artifacts", "quality"), { recursive: true });
  const reportFile = path.join(cwd, "artifacts", "quality", `${profile}.json`);
  const save = () =>
    fs.writeFileSync(reportFile, JSON.stringify(report, null, 2) + "\n");
  const step = (command, args) =>
    run(command, args, {
      cwd,
      record: (r) => {
        records.push(r);
        save();
      },
    });
  console.log(
    `Quality profile ${profile}${options.workflow ? ` / ${options.workflow}` : ""}`,
  );
  try {
    if (profile !== "smoke") {
      await step("npm", ["run", "typecheck"]);
      if (profile === "full") await step("npm", ["run", "lint"]);
      await step("npm", ["test", "--", "--maxWorkers=2"]);
      await step("git", [
        "diff",
        "--check",
        process.env.QUALITY_DIFF_BASE || "HEAD",
      ]);
      await step("git", ["diff", "--cached", "--check"]);
    }
    if (build) {
      if (await canReuse(cwd)) {
        report.packaging = "reused-verified";
        console.log(
          "Reusing verified unchanged Electron executable + app.asar",
        );
      } else {
        await step("npm", ["run", "build"]);
        await saveBuild(cwd);
        report.packaging = "built";
      }
      if (profile === "full") {
        await step("npm", ["run", "test:desktop"]);
        await step("npm", ["run", "test:desktop:native"]);
      } else await step("node", [`scripts/${scripts[options.workflow]}`]);
    } else
      console.log(
        "Desktop/packaging not required for this profile; not reported as passed.",
      );
    report.status = "passed";
    return report;
  } catch (error) {
    report.status = "failed";
    throw error;
  } finally {
    save();
  }
}
module.exports = { execute, runProfile };
if (require.main === module) {
  const args = process.argv.slice(2);
  if (
    !(["dev", "full"].includes(args[0]) && args.length === 1) &&
    !(args[0] === "smoke" && args.length === 2)
  ) {
    console.error("Usage: quality-runner.cjs dev|full|smoke <workflow>");
    process.exitCode = 1;
  } else
    runProfile(args[0], { workflow: args[1] }).catch((error) => {
      console.error(error.message);
      process.exitCode = 1;
    });
}
