/* global module */
// Deterministic Git-based routing. No PR labels, commit text or branch-name overrides.
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const GROUPS = [
  "creator",
  "expressions",
  "art-direction",
  "cutout",
  "relighting",
  "native",
  "persistence",
];
const rank = { LOW: 0, MEDIUM: 1, HIGH: 2 };
function classifyPaths(files, forceFull = false) {
  if (
    !Array.isArray(files) ||
    files.some(
      (f) =>
        typeof f !== "string" ||
        !f ||
        f.includes("\0") ||
        f.includes("\ufffd") ||
        path.posix.isAbsolute(f) ||
        f.split("/").includes(".."),
    )
  )
    throw new Error("Invalid changed-file list");
  const decisions = [...new Set(files)].sort().map((file) => {
    if (
      /^(?:scripts\/|tests\/|\.github\/)|^(?:package(?:-lock)?\.json|\.gitignore|\.gitattributes|.*(?:config|lock)\.(?:[cm]?[jt]s|json)|tsconfig.*|\.npmrc|\.node-version|\.nvmrc)$/.test(
        file,
      )
    )
      return {
        file,
        risk: "HIGH",
        groups: GROUPS,
        reason: "Test/CI/dependency/build configuration is a trust boundary",
      };
    if (
      /^src\/(?:main|preload|shared)\//.test(file) ||
      /^src\/renderer\/workers\//.test(file) ||
      /^src\/renderer\/components\/(?:MaskEditor|RelightCanvas|RelightingEditor|AssetQuality|useSmartCutout|cutout-preview|editor-geometry)\.(?:[cm]?[jt]sx?)$/.test(
        file,
      )
    )
      return {
        file,
        risk: "HIGH",
        groups: GROUPS,
        reason:
          "Persistence, IPC, provider, image/alpha/mask processing or domain invariants",
      };
    if (
      /\.md$/i.test(file) ||
      /^src\/renderer\/.*\.css$/.test(file) ||
      /^(?:docs\/.*\.(?:png|webp|svg)|src\/renderer\/(?:icons|assets\/icons)\/.*\.(?:svg|png|webp))$/.test(
        file,
      ) ||
      /^LICENSE$/.test(file)
    )
      return {
        file,
        risk: "LOW",
        groups: [],
        reason: "Documentation or presentation-only asset",
      };
    if (/^src\/renderer\/.*\.tsx$/.test(file)) {
      const name = path.posix.basename(file);
      const groups =
        name === "CharacterCreator.tsx"
          ? ["creator", "native"]
          : name === "ExpressionDesigner.tsx"
            ? ["expressions"]
            : name === "CreateView.tsx"
              ? ["expressions", "native"]
              : [
                    "StyleLibrary.tsx",
                    "StyleAnalyzer.tsx",
                    "StyleComparison.tsx",
                  ].includes(name)
                ? ["art-direction"]
                : [
                      "MasterApproval.tsx",
                      "MasterHistory.tsx",
                      "AssetLibrary.tsx",
                    ].includes(name)
                  ? ["creator", "expressions"]
                  : GROUPS;
      return {
        file,
        risk: "MEDIUM",
        groups,
        reason:
          "React state/navigation; select affected integration groups conservatively",
      };
    }
    return {
      file,
      risk: "HIGH",
      groups: GROUPS,
      reason: "Unknown or ambiguous path; fail closed to full regression",
    };
  });
  const risk = forceFull
    ? "HIGH"
    : decisions.reduce(
        (level, d) => (rank[d.risk] > rank[level] ? d.risk : level),
        "LOW",
      );
  return {
    risk,
    profile: risk === "HIGH" ? "full" : risk === "MEDIUM" ? "targeted" : "fast",
    groups:
      risk === "HIGH"
        ? [...GROUPS]
        : [...new Set(decisions.flatMap((d) => d.groups))].sort(),
    decisions,
    forced: forceFull,
  };
}
function git(cwd, args, input) {
  return execFileSync("git", args, {
    cwd,
    input,
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
    stdio: ["pipe", "pipe", "pipe"],
  });
}
function parseNameStatus(raw) {
  if (typeof raw !== "string" || (raw && !raw.endsWith("\0")))
    throw new Error("Malformed Git name-status output");
  const fields = raw ? raw.slice(0, -1).split("\0") : [],
    files = [];
  if (fields.length % 2) throw new Error("Malformed Git status pairs");
  for (let i = 0; i < fields.length; i += 2) {
    if (!/^[AMDT]$/.test(fields[i]) || !fields[i + 1])
      throw new Error("Unsupported/unmerged Git status");
    files.push(fields[i + 1]);
  }
  return files;
}
function resolveCommit(cwd, value) {
  if (!/^[a-f0-9]{40,64}$/.test(value ?? ""))
    throw new Error("Invalid event commit SHA");
  return git(cwd, ["rev-parse", "--verify", `${value}^{commit}`]).trim();
}
function changedFiles(cwd = process.cwd(), env = process.env) {
  const eventName = env.GITHUB_EVENT_NAME;
  let base,
    head = "HEAD",
    forceFull = false;
  if (eventName) {
    if (!env.GITHUB_EVENT_PATH) throw new Error("Missing GitHub event payload");
    const bytes = fs.readFileSync(env.GITHUB_EVENT_PATH);
    if (bytes.length > 2 * 1024 * 1024)
      throw new Error("Event payload too large");
    const event = JSON.parse(bytes.toString("utf8"));
    if (eventName === "pull_request") {
      const baseSha = resolveCommit(cwd, event.pull_request?.base?.sha);
      head = resolveCommit(cwd, event.pull_request?.head?.sha);
      base = git(cwd, ["merge-base", baseSha, head]).trim();
    } else if (eventName === "push") {
      head = resolveCommit(cwd, event.after);
      base = /^0{40,64}$/.test(event.before ?? "")
        ? git(cwd, ["hash-object", "-t", "tree", "--stdin"], "").trim()
        : resolveCommit(cwd, event.before);
    } else if (eventName === "workflow_dispatch") {
      base = git(cwd, ["rev-parse", "HEAD"]).trim();
      forceFull = true;
    } else throw new Error("Unsupported CI event: refusing reduced checks");
  } else {
    git(cwd, ["rev-parse", "--verify", "origin/main^{commit}"]);
    base = git(cwd, ["merge-base", "origin/main", "HEAD"]).trim();
  }
  const files = parseNameStatus(
    git(cwd, ["diff", "--no-renames", "--name-status", "-z", base, head]),
  );
  files.push(
    ...parseNameStatus(
      git(cwd, ["diff", "--no-renames", "--name-status", "-z", "HEAD"]),
    ),
  );
  const untracked = git(cwd, [
    "ls-files",
    "--others",
    "--exclude-standard",
    "-z",
  ]);
  if (untracked) files.push(...untracked.slice(0, -1).split("\0"));
  return { ...classifyPaths(files, forceFull), base, head };
}
function writeOutputs(plan, destination) {
  if (!Object.hasOwn(rank, plan.risk)) throw new Error("Invalid risk");
  fs.appendFileSync(
    destination,
    `risk=${plan.risk}\nprofile=${plan.profile}\ngroups=${plan.groups.join(",")}\n`,
  );
}
module.exports = {
  GROUPS,
  rank,
  classifyPaths,
  parseNameStatus,
  changedFiles,
  writeOutputs,
};
if (require.main === module) {
  try {
    if (process.argv.slice(2).some((a) => a !== "--json"))
      throw new Error("Only --json is supported; risk cannot be overridden");
    const plan = changedFiles();
    if (process.env.GITHUB_OUTPUT)
      writeOutputs(plan, process.env.GITHUB_OUTPUT);
    console.log(JSON.stringify(plan, null, 2));
  } catch (error) {
    console.error(
      "Change classification failed; no FAST fallback:",
      error.message,
    );
    process.exitCode = 1;
  }
}
