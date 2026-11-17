/* global module */
const { riskPlan } = require("./quality-plan.cjs");
function assertGate(needs) {
  if (
    !needs ||
    needs.changes?.result !== "success" ||
    needs.checks?.result !== "success"
  )
    throw new Error(
      "Required classification or checks failed, were cancelled, skipped or missing",
    );
  const risk = needs.changes.outputs?.risk;
  const plan = riskPlan(risk);
  const levels = { fast: 0, targeted: 1, full: 2 },
    validated = needs.checks.outputs?.validated;
  if (!Object.hasOwn(levels, validated) || levels[validated] < levels[plan])
    throw new Error("Missing required validation profile result");
  return `quality-gate passed: ${risk} / ${plan}`;
}
module.exports = { assertGate };
if (require.main === module) {
  try {
    console.log(
      assertGate(JSON.parse(process.env.QUALITY_NEEDS_JSON ?? "null")),
    );
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
