import type { Classification } from "./quality-classifier.cjs";
export type CommandResult = {
  command: string[];
  durationMs: number;
  exitCode: number;
};
export function execute(
  command: string,
  args: string[],
  options?: { cwd?: string; record?: (r: CommandResult) => void },
): Promise<CommandResult>;
export function runProfile(
  profile: string,
  options?: {
    cwd?: string;
    classification?: Classification;
    execute?: typeof execute;
    reusableBuild?: (cwd: string) => Promise<boolean>;
    recordBuild?: (cwd: string) => Promise<unknown>;
  },
): Promise<{
  requested: string;
  risk: string;
  profile: string;
  desktop: string;
  packaging: string;
  commands: CommandResult[];
  status: string;
}>;
