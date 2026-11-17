/* global module, performance, clearTimeout, structuredClone */
const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { changedFiles, rank, GROUPS } = require("./quality-classifier.cjs");
const { profilePlan } = require("./quality-plan.cjs");
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
  const classification = structuredClone(
    options.classification ?? changedFiles(cwd),
  );
  const floor = process.env.QUALITY_RISK_FLOOR;
  if (floor !== undefined) {
    if (!Object.hasOwn(rank, floor)) throw new Error("Invalid CI risk floor");
    if (rank[floor] > rank[classification.risk]) {
      classification.risk = floor;
      classification.groups = GROUPS;
    }
  }
  const plan = profilePlan(
      profile,
      classification,
      fs.existsSync(path.join(cwd, "scripts", "packs-smoke.cjs")),
    ),
    records = [];
  const run = options.execute ?? execute,
    canReuse = options.reusableBuild ?? reusableBuild,
    saveBuild = options.recordBuild ?? recordBuild;
  const report = {
    requested: profile,
    risk: classification.risk,
    profile: plan.profile,
    desktop: plan.build ? "required" : "not-required",
    packaging: plan.build ? "required" : "not-required",
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
    `Quality profile ${plan.profile}; Git risk ${classification.risk}; groups ${classification.groups.join(",") || "none"}`,
  );
  try {
    if (plan.fast) {
      await step("npm", ["run", "typecheck"]);
      await step("npm", ["run", "lint"]);
      await step("npm", ["test", "--", "--maxWorkers=2"]);
      await step("git", ["diff", "--check", classification.base ?? "HEAD"]);
      await step("git", ["diff", "--cached", "--check"]);
    }
    if (plan.build) {
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
      if (plan.full) {
        await step("npm", ["run", "test:desktop"]);
        await step("npm", ["run", "test:desktop:native"]);
      } else
        for (const script of plan.scripts)
          await step("node", [`scripts/${script}`]);
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
  if (args.length !== 1 || !["fast", "targeted", "full"].includes(args[0])) {
    console.error(
      "Usage: quality-runner.cjs fast|targeted|full; no skip/level/groups overrides",
    );
    process.exitCode = 1;
  } else
    runProfile(args[0]).catch((error) => {
      console.error(error.message);
      process.exitCode = 1;
    });
}
