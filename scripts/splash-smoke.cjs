// Focused real Electron lifecycle test. Only native chooser and init error/delay are fixtures.
const { _electron: electron, expect } = require("@playwright/test");
const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");
const { projectSelection, nav } = require("./smoke-ui.cjs");
(async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "laceframe-splash-"));
  const first = path.join(root, "first"),
    second = path.join(root, "second"),
    invalid = path.join(root, "invalid");
  for (const dir of [first, second, invalid]) await fs.mkdir(dir);
  await fs.writeFile(path.join(invalid, "laceframe.json"), "invalid project");
  await fs.mkdir("artifacts/splash", { recursive: true });
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  let app, page;
  const errors = [];
  const launch = async () => {
    app = await electron.launch({
      executablePath: path.resolve("out/Laceframe-linux-x64/laceframe"),
      args: [`--user-data-dir=${path.join(root, "user-data")}`],
      env,
    });
    page = await app.firstWindow();
    page.setDefaultTimeout(5000);
    page.on("pageerror", (e) => errors.push(e.message));
  };
  const chooser = async (file, delay = 0) =>
    app.evaluate(
      ({ dialog }, { file, delay }) => {
        globalThis.splashDialogCalls = 0;
        dialog.showOpenDialog = async () => {
          globalThis.splashDialogCalls++;
          if (delay) await new Promise((r) => setTimeout(r, delay));
          return { canceled: !file, filePaths: file ? [file] : [] };
        };
      },
      { file, delay },
    );
  const create = async (dir, name) => {
    await page
      .getByRole("button", { name: "Neues Projekt", exact: true })
      .click();
    await page.getByLabel("Projektname", { exact: true }).fill(name);
    await chooser(dir);
    await page
      .getByRole("button", { name: "Projekt erstellen …", exact: true })
      .click();
    await expect(page.locator(".sidebar")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Projekt schließen", exact: true }),
    ).toBeVisible();
  };
  const close = async () => {
    const started = Date.now();
    await page
      .getByRole("button", { name: "Projekt schließen", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Neues Projekt", exact: true }),
    ).toBeVisible();
    expect(Date.now() - started).toBeLessThan(3000);
    await expect(page.locator(".sidebar")).toHaveCount(0);
    await expect(page.getByRole("progressbar")).toHaveCount(0);
    const result = await page.evaluate(() =>
      window.laceframe.preview("00000000-0000-4000-8000-000000000000"),
    );
    expect(result).toEqual({
      ok: false,
      error: "Bitte zuerst ein Projekt öffnen.",
    });
  };
  try {
    await launch();
    await expect(page.getByRole("progressbar")).toBeVisible();
    await page.evaluate(() => {
      window.splashSamples = [];
      window.splashObserver = new window.MutationObserver(() => {
        const bar = document.querySelector('[role="progressbar"]');
        if (bar)
          window.splashSamples.push([
            window.performance.now(),
            Number(bar.getAttribute("aria-valuenow")),
          ]);
      });
      window.splashObserver.observe(document.body, {
        subtree: true,
        attributes: true,
        childList: true,
      });
    });
    await expect(page.locator(".sidebar")).toHaveCount(0);
    await page.screenshot({ path: "artifacts/splash/boot.png" });
    await projectSelection(page);
    const samples = await page.evaluate(() => {
      window.splashObserver.disconnect();
      return window.splashSamples;
    });
    expect(samples.length).toBeGreaterThan(100);
    for (let i = 1; i < samples.length; i++)
      expect(samples[i][1]).toBeGreaterThanOrEqual(samples[i - 1][1]);
    expect(samples.at(-1)[0] - samples[0][0]).toBeGreaterThanOrEqual(9900);
    expect(samples.at(-1)[1]).toBe(100);
    expect(samples.at(-1)[0]).toBeGreaterThanOrEqual(10000);
    for (const [width, height] of [
      [960, 720],
      [1440, 900],
    ]) {
      await page.setViewportSize({ width, height });
      const layout = await page.evaluate(() => {
        const image = document.querySelector(".splash-image"),
          control = document.querySelector(".splash-controls");
        const i = image.getBoundingClientRect(),
          c = control.getBoundingClientRect();
        return {
          url: image.src,
          loaded: image.complete,
          natural: [image.naturalWidth, image.naturalHeight],
          ratio: i.width / i.height,
          visible:
            i.left >= -1 &&
            i.top >= -1 &&
            i.right <= window.innerWidth + 1 &&
            i.bottom <= window.innerHeight + 1,
          below: c.top > i.top + i.height * 0.7,
          controls: c.bottom <= window.innerHeight,
        };
      });
      expect(layout.url).toBe("laceframe://app/images/splash.png");
      expect(layout.natural).toEqual([1827, 861]);
      expect(layout.loaded).toBe(true);
      expect(layout.ratio).toBeCloseTo(1827 / 861, 3);
      expect(layout.visible).toBe(true);
      expect(layout.below).toBe(true);
      expect(layout.controls).toBe(true);
      await page.screenshot({
        path: `artifacts/splash/selection-${width}.png`,
      });
    }
    const boundary = await app.evaluate(async ({ net, BrowserWindow }) => ({
      denied: (await net.fetch("laceframe://app/images/other.png")).status,
      preferences: (() => {
        const p =
          BrowserWindow.getAllWindows()[0].webContents.getLastWebPreferences();
        return [p.contextIsolation, p.nodeIntegration, p.sandbox];
      })(),
    }));
    expect(boundary).toEqual({ denied: 403, preferences: [true, false, true] });
    expect(await page.evaluate(() => typeof window.require)).toBe("undefined");
    await chooser(null, 300);
    await page
      .getByRole("button", { name: "Projekt öffnen", exact: true })
      .evaluate((button) => {
        button.click();
        button.click();
      });
    await projectSelection(page);
    expect(await app.evaluate(() => globalThis.splashDialogCalls)).toBe(1);
    await chooser(invalid);
    await page
      .getByRole("button", { name: "Projekt öffnen", exact: true })
      .click();
    await expect(page.getByRole("alert")).toBeVisible();
    await expect(page.locator(".sidebar")).toHaveCount(0);
    expect(
      await fs.readFile(path.join(invalid, "laceframe.json"), "utf8"),
    ).toBe("invalid project");
    await page
      .getByRole("button", { name: "Neues Projekt", exact: true })
      .click();
    await page.getByRole("button", { name: "Abbrechen", exact: true }).click();
    await chooser(null);
    await page
      .getByRole("button", { name: "Neues Projekt", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Projekt erstellen …", exact: true })
      .click();
    await projectSelection(page);
    await expect(page.locator(".sidebar")).toHaveCount(0);
    await create(first, "Splash synthetic one");
    const saved = await fs.readFile(path.join(first, "laceframe.json"));
    await nav(page, "Art Direction");
    await page
      .getByLabel("Stilname", { exact: true })
      .fill("Unsaved splash draft");
    let warning = "";
    page.once("dialog", async (dialog) => {
      warning = dialog.message();
      await dialog.dismiss();
    });
    await page
      .getByRole("button", { name: "Projekt schließen", exact: true })
      .click();
    expect(warning).toContain("Ungespeicherte");
    await expect(page.getByLabel("Stilname", { exact: true })).toHaveValue(
      "Unsaved splash draft",
    );
    await chooser(null);
    page.once("dialog", (dialog) => dialog.accept());
    await page
      .getByRole("button", { name: "Projekt öffnen …", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Projekt öffnen …", exact: true }),
    ).toBeEnabled();
    await expect(page.getByLabel("Stilname", { exact: true })).toHaveValue(
      "Unsaved splash draft",
    );
    page.once("dialog", (dialog) => dialog.accept());
    await close();
    expect(await fs.readFile(path.join(first, "laceframe.json"))).toEqual(
      saved,
    );
    await create(second, "Splash synthetic two");
    await close();
    await chooser(first);
    await page
      .getByRole("button", { name: "Projekt öffnen", exact: true })
      .click();
    await expect(page.locator(".sidebar")).toBeVisible();
    await app.close();
    await launch();
    await expect(page.getByRole("progressbar")).toBeVisible();
    await expect(page.locator(".sidebar")).toHaveCount(0);
    await projectSelection(page);
    await chooser(first);
    await page
      .getByRole("button", { name: "Projekt öffnen", exact: true })
      .click();
    await expect(page.locator(".sidebar")).toBeVisible();
    await close();
    // Exercise initialization error/retry through real IPC after a document reload.
    await app.evaluate(({ ipcMain }) => {
      ipcMain.removeHandler("generation:providers");
      ipcMain.handle("generation:providers", () => ({
        ok: false,
        error: "Kontrollierter Initialisierungsfehler",
      }));
    });
    await page.reload();
    await expect(page.getByRole("alert")).toHaveText(
      "Kontrollierter Initialisierungsfehler",
    );
    await expect(
      page.getByRole("button", { name: "Neues Projekt", exact: true }),
    ).toHaveCount(0);
    await app.evaluate(({ ipcMain }) => {
      ipcMain.removeHandler("generation:providers");
      ipcMain.handle("generation:providers", () => ({
        ok: true,
        value: [{ id: "manual-import" }],
      }));
    });
    await page
      .getByRole("button", { name: "Erneut versuchen", exact: true })
      .click();
    await projectSelection(page);
    // Slow init fixture: no project/generation service is replaced; 95% must hold.
    await app.evaluate(({ ipcMain }) => {
      ipcMain.removeHandler("generation:providers");
      ipcMain.handle("generation:providers", async () => {
        await new Promise((r) => setTimeout(r, 12500));
        return { ok: true, value: [{ id: "manual-import" }] };
      });
    });
    await page.reload();
    await expect(page.locator(".splash-status")).toHaveText(
      "Noch einen Moment, die Pixel stellen sich quer …",
      { timeout: 12000 },
    );
    await expect(page.getByRole("progressbar")).toHaveAttribute(
      "aria-valuenow",
      "95",
    );
    await expect(
      page.getByRole("button", { name: "Neues Projekt", exact: true }),
    ).toHaveCount(0);
    await projectSelection(page);
    expect(errors).toEqual([]);
    console.log(
      "PASS focused splash: real >=10s boot, monotone progress, delayed/error/retry init, packaged asset, responsive selection, secure preload, cancel/double click, invalid/create/close/reopen/restart. Synthetic temporary projects; no generation.",
    );
  } finally {
    if (app) await app.close();
    await fs.rm(root, { recursive: true, force: true });
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
