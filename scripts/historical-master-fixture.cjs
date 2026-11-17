/* global exports */
// TEST ONLY: seed a pre-transparency-gate master into a disposable synthetic project.
// No production command/IPC is intercepted. Close/reopen Electron after creating this fixture.
const fs = require("node:fs/promises"),
  path = require("node:path");
const { createHash, randomUUID } = require("node:crypto");
const { PNG } = require("pngjs");
exports.seedHistoricalMaster = async (project, bytes, characterId) => {
  const p = JSON.parse(
    await fs.readFile(path.join(project, "laceframe.json"), "utf8"),
  );
  const c = p.characters.find(
    (c) => c.id === (characterId || p.selectedCharacterId),
  );
  if (!c || c.masterId)
    throw new Error("Historical fixture needs an empty character");
  const png = PNG.sync.read(Buffer.from(bytes)),
    sha = createHash("sha256").update(Buffer.from(bytes)).digest("hex"),
    id = randomUUID(),
    file = `assets/originals/${sha}.png`;
  await fs.mkdir(path.join(project, "assets/originals"), { recursive: true });
  await fs.writeFile(path.join(project, file), Buffer.from(bytes), {
    mode: 0o444,
  });
  p.masters.push({
    id,
    characterId: c.id,
    file,
    sha256: sha,
    width: png.width,
    height: png.height,
    format: "png",
    version: 1,
    approvedAt: new Date().toISOString(),
    locked: true,
  });
  c.masterId = id;
  await fs.writeFile(path.join(project, "laceframe.json"), JSON.stringify(p));
  return p;
};
exports.reviewImport = async (page) => {
  await page.getByLabel("Import Master Sichtprüfung", { exact: true }).check();
  await page
    .getByLabel("Import Master Prüfnotiz", { exact: true })
    .fill("Synthetic identity and silhouette manually reviewed");
};
