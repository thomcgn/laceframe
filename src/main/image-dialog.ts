import { tr } from "../shared/locales/index";
import * as fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { OpenDialogOptions, OpenDialogReturnValue } from "electron";
import { readLimited } from "./project-service";

/** Local application preference only: never enters a project, preload result or export. */
export class ImageDialogService {
  constructor(
    private readonly userData: string,
    private readonly show: (
      options: OpenDialogOptions,
    ) => Promise<OpenDialogReturnValue>,
  ) {}
  async choose(options: OpenDialogOptions): Promise<string[] | null> {
    const settings = path.join(this.userData, "image-dialog.json");
    let defaultPath: string | undefined;
    try {
      const saved: unknown = JSON.parse(
        (await readLimited(settings, 4096)).toString("utf8"),
      );
      if (
        saved &&
        typeof saved === "object" &&
        "directory" in saved &&
        typeof saved.directory === "string" &&
        path.isAbsolute(saved.directory) &&
        (await fs.stat(saved.directory)).isDirectory()
      )
        defaultPath = saved.directory;
    } catch {
      /* Missing/corrupt preference or vanished folder: OS default. */
    }
    const selected = await this.show({
      ...options,
      ...(defaultPath ? { defaultPath } : {}),
    });
    if (selected.canceled || !selected.filePaths.length) return null;
    const directory = await fs.realpath(path.dirname(selected.filePaths[0]));
    if (!(await fs.stat(directory)).isDirectory())
      throw new Error(tr("errors.m2d9203c4dd"));
    await fs.mkdir(this.userData, { recursive: true });
    const temp = path.join(this.userData, `.image-dialog-${randomUUID()}.tmp`);
    try {
      await fs.writeFile(temp, JSON.stringify({ directory }), {
        flag: "wx",
        mode: 0o600,
      });
      await fs.rename(temp, settings);
    } finally {
      await fs.rm(temp, { force: true });
    }
    return selected.filePaths;
  }
}
