#!/usr/bin/env node

import { AutodevController, runAutodev } from "./controller.js";

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run") || args.includes("-d");

  if (args.includes("status")) {
    const budget = new AutodevController(true).rateLimitStatus();
    console.log(JSON.stringify(budget, null, 2));
    return;
  }

  if (dryRun) {
    console.log("Running in DRY RUN mode - no commits, pushes, or issue mutations");
  }

  try {
    await runAutodev(dryRun);
    console.log("Autodev controller completed successfully");
    process.exit(0);
  } catch (error) {
    console.error("Autodev controller failed:", error);
    process.exit(1);
  }
}

main();