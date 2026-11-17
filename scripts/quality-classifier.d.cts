export type Risk = "LOW" | "MEDIUM" | "HIGH";
export type Classification = {
  risk: Risk;
  profile: "fast" | "targeted" | "full";
  groups: string[];
  decisions: { file: string; risk: Risk; groups: string[]; reason: string }[];
  forced: boolean;
  base?: string;
  head?: string;
};
export const GROUPS: string[];
export const rank: Record<Risk, number>;
export function classifyPaths(
  files: string[],
  forceFull?: boolean,
): Classification;
export function parseNameStatus(raw: string): string[];
export function changedFiles(
  cwd?: string,
  env?: Record<string, string | undefined>,
): Classification;
export function writeOutputs(plan: Classification, destination: string): void;
