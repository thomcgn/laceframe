/* global module */
const { GROUPS, rank } = require("./quality-classifier.cjs");
const groupScripts = {
  creator: ["creator-smoke.cjs"],
  expressions: [
    "desktop-smoke.cjs",
    "expression-designer-smoke.cjs",
    "native-smoke.cjs",
  ],
  "art-direction": ["style-analysis-smoke.cjs", "native-smoke.cjs"],
  cutout: [
    "quality-smoke.cjs",
    "smart-cutout-smoke.cjs",
    "cutout-stability-smoke.cjs",
    "native-smoke.cjs",
  ],
  relighting: ["relighting-smoke.cjs", "cutout-stability-smoke.cjs"],
  native: ["native-smoke.cjs", "creator-smoke.cjs"],
  persistence: [
    "desktop-smoke.cjs",
    "expression-designer-smoke.cjs",
    "quality-smoke.cjs",
    "relighting-smoke.cjs",
    "style-analysis-smoke.cjs",
    "smart-cutout-smoke.cjs",
    "cutout-stability-smoke.cjs",
    "native-smoke.cjs",
    "creator-smoke.cjs",
  ],
};
function riskPlan(risk) {
  if (!Object.hasOwn(rank, risk))
    throw new Error("Unknown risk: no reduced fallback");
  return risk === "HIGH" ? "full" : risk === "MEDIUM" ? "targeted" : "fast";
}
function profilePlan(profile, classification, hasPacks = false) {
  if (!["fast", "targeted", "full"].includes(profile))
    throw new Error("Unknown profile");
  riskPlan(classification.risk);
  if (
    !Array.isArray(classification.groups) ||
    classification.groups.some((g) => !GROUPS.includes(g))
  )
    throw new Error("Unknown integration group");
  // FAST is an explicit development component, not a risk-complete gate. TARGETED cannot lower HIGH.
  const effective =
    profile === "targeted" && classification.risk === "HIGH" ? "full" : profile;
  if (effective === "fast")
    return {
      profile: effective,
      fast: true,
      build: false,
      scripts: [],
      full: false,
    };
  if (effective === "full")
    return {
      profile: effective,
      fast: true,
      build: true,
      scripts: [],
      full: true,
    };
  if (classification.risk === "MEDIUM" && !classification.groups.length)
    throw new Error("Missing required integration groups");
  const scripts = [
    ...new Set(classification.groups.flatMap((g) => groupScripts[g])),
  ];
  if (
    hasPacks &&
    classification.groups.some((g) =>
      ["art-direction", "expressions", "persistence"].includes(g),
    )
  )
    scripts.push("packs-smoke.cjs");
  return {
    profile: effective,
    fast: false,
    build: scripts.length > 0,
    scripts: [...new Set(scripts)],
    full: false,
  };
}
module.exports = { riskPlan, profilePlan, groupScripts };
