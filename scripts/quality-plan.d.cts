import type { Classification } from "./quality-classifier.cjs";
export type Plan = {
  profile: string;
  fast: boolean;
  build: boolean;
  scripts: string[];
  full: boolean;
};
export function riskPlan(risk: string): string;
export function profilePlan(
  profile: string,
  classification: Classification,
  hasPacks?: boolean,
): Plan;
export const groupScripts: Record<string, string[]>;
