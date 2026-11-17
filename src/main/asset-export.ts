import * as fs from "node:fs/promises";
import path from "node:path";
/** Destination comes exclusively from the native chooser. Exclusive writes never replace files. */
export async function writeExport(
  directory: string,
  projectDirectory: string,
  payload: { name: string; bytes: Uint8Array; provenance?: string },
) {
  const root = await fs.realpath(directory),
    project = await fs.realpath(projectDirectory);
  const relative = path.relative(project, root);
  if (
    relative === "" ||
    (!relative.startsWith(".." + path.sep) &&
      relative !== ".." &&
      !path.isAbsolute(relative))
  )
    throw new Error(
      "Export außerhalb des Projekts speichern; interne Assets bleiben unverändert.",
    );
  if (!/^[A-Za-z0-9_-]+\.(?:png|json)$/.test(payload.name))
    throw new Error("Ungültiger Exportname.");
  const files = [
    { name: payload.name, bytes: payload.bytes },
    ...(payload.provenance
      ? [
          {
            name: payload.name.replace(/\.png$/, ".json"),
            bytes: Buffer.from(payload.provenance),
          },
        ]
      : []),
  ];
  // Reserve every output before writing. On collision, only this operation's files are removed.
  const owned: { file: string; handle: fs.FileHandle }[] = [];
  try {
    for (const f of files) {
      const file = path.join(root, f.name);
      owned.push({ file, handle: await fs.open(file, "wx", 0o600) });
    }
    for (let i = 0; i < owned.length; i++) {
      await owned[i].handle.writeFile(files[i].bytes);
      await owned[i].handle.sync();
    }
  } catch (error) {
    for (const f of owned) {
      await f.handle.close();
      await fs.unlink(f.file);
    }
    throw error;
  } finally {
    for (const f of owned) await f.handle.close();
  }
}
