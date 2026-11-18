import { tr } from "../shared/locales";
import * as fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { languages, resolveLanguage } from "../shared/locales";
export const languageSchema = z.string().refine((l) => languages.includes(l));
const settingsSchema = z.object({ language: languageSchema }).strict();
export class AppPreferences {
  private language: string;
  constructor(
    private readonly directory: string,
    systemLocales: readonly string[],
  ) {
    this.language = resolveLanguage(systemLocales);
  }
  async load() {
    try {
      const file = path.join(this.directory, "preferences.json"),
        stat = await fs.lstat(file);
      if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 1024)
        return this.get();
      this.language = settingsSchema.parse(
        JSON.parse(await fs.readFile(file, "utf8")),
      ).language;
    } catch {
      /* Missing/corrupt preferences use the OS language, never project metadata. */
    }
    return this.get();
  }
  get() {
    return { language: this.language };
  }
  async set(input: unknown) {
    const language = languageSchema.parse(input),
      target = path.join(this.directory, "preferences.json");
    await fs.mkdir(this.directory, { recursive: true });
    try {
      if ((await fs.lstat(target)).isSymbolicLink())
        throw new Error(tr("common.m1f14ef14a6"));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    const tmp = path.join(this.directory, `.preferences-${randomUUID()}.tmp`);
    try {
      await fs.writeFile(tmp, JSON.stringify({ language }), {
        flag: "wx",
        mode: 0o600,
      });
      await fs.rename(tmp, target);
      this.language = language;
    } finally {
      await fs.rm(tmp, { force: true });
    }
    return this.get();
  }
}
