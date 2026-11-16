import path from "node:path";
import os from "node:os";
import * as fs from "node:fs/promises";
import { constants } from "node:fs";
import { MAX_IMAGE_BYTES } from "../../../shared/domain";
import { safePath, inspectImage } from "../../project-service";

export function generatedImagesRoot() {
  return path.join(
    process.env.CODEX_HOME || path.join(os.homedir(), ".codex"),
    "generated_images",
  );
}
/** Bind output to this thread, reject traversal/symlinks, then read a bounded regular image. */
export async function readGeneratedImage(
  savedPath: string,
  threadId: string,
  root = generatedImagesRoot(),
): Promise<Buffer> {
  if (
    !/^[a-f0-9-]{36}$/.test(threadId) ||
    !path.isAbsolute(savedPath) ||
    savedPath !== path.normalize(savedPath) ||
    /[/\\]\.\.?([/\\]|$)/.test(savedPath)
  )
    throw new Error("Unsicherer Codex-Ergebnispfad.");
  const threadRoot = await safePath(root, threadId);
  const relative = path.relative(threadRoot, savedPath);
  if (!/^[a-zA-Z0-9_-]+\.(png|webp)$/.test(relative))
    throw new Error("Codex-Ergebnis gehört nicht zum aktiven Thread.");
  const file = await safePath(root, `${threadId}/${relative}`);
  const handle = await fs.open(
    file,
    constants.O_RDONLY | (constants.O_NOFOLLOW || 0),
  );
  try {
    const stat = await handle.stat();
    if (!stat.isFile() || stat.size <= 0 || stat.size > MAX_IMAGE_BYTES)
      throw new Error("Codex-Ergebnis ist keine Bilddatei bis 32 MiB.");
    const bytes = Buffer.alloc(stat.size + 1);
    const { bytesRead } = await handle.read(bytes, 0, bytes.length, 0);
    if (bytesRead !== stat.size)
      throw new Error("Codex-Ergebnis wurde während des Imports verändert.");
    const result = bytes.subarray(0, bytesRead);
    const info = inspectImage(result);
    if (path.extname(file) !== "." + info.format)
      throw new Error("Codex-Bildformat stimmt nicht mit der Datei überein.");
    return result;
  } finally {
    await handle.close();
  }
}
