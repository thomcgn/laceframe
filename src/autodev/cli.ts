#!/usr/bin/env node

import { cliHelp, parseCliArgs } from "./cli-args.js";

async function main(): Promise<void> {
  let action;
  try {
    action = parseCliArgs(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    console.error("Use --help to see safe command examples.");
    process.exitCode = 2;
    return;
  }

  if (action === "help") {
    process.stdout.write(cliHelp());
    return;
  }

  // Importing the controller is intentionally delayed until after argument
  // validation, so --help and invalid arguments cannot initialize AutoDev.
  try {
    const { AutodevController, runAutodev } = await import("./controller.js");
    if (action === "status") {
      console.log(JSON.stringify(new AutodevController(true).rateLimitStatus(), null, 2));
      return;
    }
    if (action.startsWith("retry:")) {
      const issueNumber = Number(action.slice("retry:".length));
      new AutodevController(false).retryIssue(issueNumber);
      console.log(`AutoDev issue #${issueNumber} requeued`);
      return;
    }
    const dryRun = action === "dry-run";
    if (dryRun) console.log("[DRY RUN] No Kilo task, commit, push or GitHub issue mutation");
    await runAutodev(dryRun);
    console.log("AutoDev controller completed successfully");
  } catch (error) {
    console.error("AutoDev controller failed:", error);
    process.exitCode = 1;
  }
}

void main();
