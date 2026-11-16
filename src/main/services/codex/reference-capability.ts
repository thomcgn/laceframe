import { execFile } from "node:child_process";
import { promisify } from "node:util";
import * as fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { z } from "zod";
const schema = z.object({
  properties: z.object({
    input: z.object({
      type: z.literal("array"),
      maxItems: z.number().optional(),
      items: z.object({ $ref: z.literal("#/definitions/UserInput") }),
    }),
  }),
  definitions: z.object({
    UserInput: z.object({
      oneOf: z.array(
        z
          .object({
            properties: z.object({
              type: z.object({ enum: z.array(z.string()) }),
              path: z.object({ type: z.string() }).optional(),
            }),
            required: z.array(z.string()),
          })
          .passthrough(),
      ),
    }),
  }),
});
export function supportsMultipleLocalImages(input: unknown) {
  const parsed = schema.safeParse(input);
  if (!parsed.success) return false;
  const p = parsed.data;
  return (
    (p.properties.input.maxItems ?? 9) >= 9 &&
    p.definitions.UserInput.oneOf.some(
      (v) =>
        v.properties.type.enum.includes("localImage") &&
        v.properties.path?.type === "string" &&
        v.required.includes("path"),
    )
  );
}
/** Read-only CLI schema export; no account secrets, image turn, HTTP or fallback. */
export async function probeReferenceCapability() {
  const dir = await fs.mkdtemp(
    path.join(os.tmpdir(), "laceframe-codex-schema-"),
  );
  const env = { ...process.env };
  for (const key of [
    "OPENAI_API_KEY",
    "CODEX_API_KEY",
    "OPENAI_BASE_URL",
    "OPENAI_ORG_ID",
    "OPENAI_PROJECT_ID",
  ])
    delete env[key];
  try {
    await promisify(execFile)(
      "codex",
      ["app-server", "generate-json-schema", "--out", dir],
      { env, timeout: 15000, maxBuffer: 256 * 1024, windowsHide: true },
    );
    const file = path.join(dir, "v2", "TurnStartParams.json");
    const info = await fs.lstat(file);
    if (!info.isFile() || info.isSymbolicLink() || info.size > 2 * 1024 * 1024)
      return false;
    return supportsMultipleLocalImages(
      JSON.parse(await fs.readFile(file, "utf8")),
    );
  } catch {
    return false;
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}
