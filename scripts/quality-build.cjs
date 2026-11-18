/* global module */
const fs = require("node:fs/promises");
const path = require("node:path");
const { createHash } = require("node:crypto");
const { createReadStream } = require("node:fs");
async function hashFile(file) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest("hex");
}
async function inputHash(root = process.cwd()) {
  const { execFileSync } = require("node:child_process");
  const hash = createHash("sha256");
  // Git's ignore rules prevent scanning local projects/artwork and generated outputs.
  const listed = execFileSync(
    "git",
    ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
    { cwd: root, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 },
  );
  const excluded = new Set([
    ".git",
    "node_modules",
    "out",
    ".vite",
    "artifacts",
    "coverage",
    "docs",
    "tests",
    "scripts",
    ".github",
    ".vscode",
  ]);
  const files = [...new Set(listed.split("\0").filter(Boolean))]
    .filter(
      (relative) =>
        !excluded.has(relative.split("/")[0]) &&
        !/^(?:AGENTS\.md|README(?:\..*)?|LICENSE|package\.json)$/.test(
          relative,
        ),
    )
    .sort();
  const installedLock = path.join(root, "node_modules", ".package-lock.json");
  try {
    if ((await fs.lstat(installedLock)).isFile())
      files.push("node_modules/.package-lock.json");
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  for (const relative of files) {
    if (path.isAbsolute(relative) || relative.split("/").includes(".."))
      throw new Error("Invalid build input path");
    const file = path.join(root, relative);
    let stat;
    try {
      stat = await fs.lstat(file);
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      hash.update(relative + "\0deleted\0");
      continue;
    }
    if (!stat.isFile() || stat.isSymbolicLink())
      throw new Error("Build fingerprint requires regular non-symlink inputs");
    hash.update(relative);
    hash.update("\0");
    hash.update(await hashFile(file));
  }
  const pkg = JSON.parse(
    await fs.readFile(path.join(root, "package.json"), "utf8"),
  );
  // Forge's Vite plugin bundles .vite + pruned package metadata; test/check scripts are not bundled.
  pkg.scripts = Object.fromEntries(
    Object.entries(pkg.scripts ?? {}).filter(
      ([key]) => !/^(?:check:|test(?::|$)|classify:)/.test(key),
    ),
  );
  hash.update(JSON.stringify(pkg));
  return hash.digest("hex");
}
function locations(root = process.cwd()) {
  return {
    stamp: path.join(root, "out", ".quality-build.json"),
    exe: path.join(root, "out", "Laceframe-linux-x64", "laceframe"),
    asar: path.join(
      root,
      "out",
      "Laceframe-linux-x64",
      "resources",
      "app.asar",
    ),
  };
}
async function recordBuild(root = process.cwd()) {
  const files = locations(root);
  for (const file of [files.exe, files.asar]) {
    const stat = await fs.lstat(file);
    if (!stat.isFile() || stat.isSymbolicLink())
      throw new Error("Packaged outputs must be regular files");
  }
  const record = {
    version: 1,
    inputs: await inputHash(root),
    platform: process.platform,
    arch: process.arch,
    node: process.versions.node,
    exe: await hashFile(files.exe),
    asar: await hashFile(files.asar),
  };
  await fs.writeFile(files.stamp, JSON.stringify(record) + "\n");
  return record;
}
async function reusableBuild(root = process.cwd()) {
  try {
    const files = locations(root),
      s = await fs.lstat(files.stamp);
    if (!s.isFile() || s.isSymbolicLink() || s.size > 2048) return false;
    for (const file of [files.exe, files.asar]) {
      const stat = await fs.lstat(file);
      if (!stat.isFile() || stat.isSymbolicLink()) return false;
    }
    const r = JSON.parse(await fs.readFile(files.stamp, "utf8"));
    return (
      r.version === 1 &&
      r.platform === process.platform &&
      r.arch === process.arch &&
      r.node === process.versions.node &&
      r.inputs === (await inputHash(root)) &&
      r.exe === (await hashFile(files.exe)) &&
      r.asar === (await hashFile(files.asar))
    );
  } catch {
    return false;
  }
}
module.exports = { hashFile, inputHash, locations, recordBuild, reusableBuild };
