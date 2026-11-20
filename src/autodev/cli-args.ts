/** Pure argument validation: no controller imports or side effects. */
export type CliAction = "help" | "status" | "dry-run" | "execute" | `retry:${number}`;

const HELP = `LaceFrame AutoDev

Usage:
  npx tsx src/autodev/cli.ts --help
  npx tsx src/autodev/cli.ts status
  npx tsx src/autodev/cli.ts run --dry-run
  npx tsx src/autodev/cli.ts run --execute
  npx tsx src/autodev/cli.ts retry 36

Commands:
  --help, -h       Show this help without starting the controller
  status           Show current estimated free-model budget
  run --dry-run    Select one approved issue and simulate the workflow; no Kilo tasks, commits, pushes or issue mutations
  run --execute    Run the real issue workflow (Kilo, Git changes and GitHub actions)
  retry <number>  Requeue a failed approved issue after a clean-tree check; no model usage

Safety: Running without an explicit mode never starts production work.
`;

export function cliHelp(): string {
  return HELP;
}

export function parseCliArgs(args: readonly string[]): CliAction {
  if (args.length === 0 || (args.length === 1 && (args[0] === "--help" || args[0] === "-h"))) {
    return "help";
  }
  if (args.length === 1 && args[0] === "status") return "status";
  if (args.length === 2 && args[0] === "run" && (args[1] === "--dry-run" || args[1] === "-d")) return "dry-run";
  if (args.length === 2 && args[0] === "run" && args[1] === "--execute") return "execute";
  if (args.length === 2 && args[0] === "retry" && /^[1-9]\d*$/.test(args[1]) && Number.isSafeInteger(Number(args[1]))) return `retry:${Number(args[1])}`;

  throw new Error(`Unsupported or incomplete arguments: ${args.join(" ")}. Use --help for usage.`);
}
