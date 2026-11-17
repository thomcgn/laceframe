import * as fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { ProjectService } from "../src/main/project-service";
import { hashBytes } from "../src/main/project-service";
import type { StagedImage } from "../src/shared/domain";
/** Explicit pre-gate fixture only. Does NOT call/bypass a production approval command.
 * Regression suites need historical opaque masters to test compatibility and correction.
 * New approval/security tests use the real ProjectService command, never this helper.
 */
export async function seedHistoricalMaster(
  service: ProjectService,
  staged: StagedImage,
  characterId: string | undefined,
) {
  const { directory, project: p } = service.snapshot();
  const c = p.characters.find((c) => c.id === characterId);
  if (!c || c.masterId)
    throw new Error("Historical fixture needs an empty character");
  const bytes = Buffer.from(staged.preview.split(",")[1], "base64");
  if (hashBytes(bytes) !== staged.sha256)
    throw new Error("Invalid fixture bytes");
  const file = `assets/originals/${staged.sha256}.${staged.format}`,
    id = randomUUID();
  await fs.mkdir(path.join(directory, "assets/originals"), { recursive: true });
  await fs.writeFile(path.join(directory, file), bytes, { mode: 0o444 });
  p.masters.push({
    id,
    characterId: c.id,
    file,
    sha256: staged.sha256,
    width: staged.width,
    height: staged.height,
    format: staged.format,
    version: 1,
    approvedAt: new Date().toISOString(),
    locked: true,
  });
  c.masterId = id;
  await fs.writeFile(path.join(directory, "laceframe.json"), JSON.stringify(p));
  service.discard(staged.token);
  return service.open(directory);
}
