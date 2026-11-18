const { seedHistoricalMaster } = require("./historical-master-fixture.cjs");
// Real Electron/IPC/pixels/worker. Optional dev mode exercises React StrictMode's effect replay.
const { _electron: electron, expect } = require("@playwright/test");
const fs = require("node:fs/promises"),
  path = require("node:path"),
  os = require("node:os");
const { PNG } = require("pngjs");
const { createHash, randomUUID } = require("node:crypto");
const { nav, selectMaskTool } = require("./smoke-ui.cjs");
(async () => {
  const root = await fs.mkdtemp(
      path.join(os.tmpdir(), "laceframe-cutout-stability-"),
    ),
    project = path.join(root, "project");
  await fs.mkdir(project);
  const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
  let app, page;
  const errors = [];
  const launch = async () => {
    const env = { ...process.env };
    delete env.ELECTRON_RUN_AS_NODE;
    app = await electron.launch({
      executablePath: process.env.LACEFRAME_DEV
        ? path.resolve("node_modules/electron/dist/electron")
        : path.resolve("out/Laceframe-linux-x64/laceframe"),
      args: [
        ...(process.env.LACEFRAME_DEV ? ["."] : []),
        `--user-data-dir=${path.join(root, "user")}`,
      ],
      env,
    });
    page = await app.firstWindow();
    page.setDefaultTimeout(20000);
    page.on("pageerror", (e) => errors.push(e.message));
    await expect(
      page.getByRole("button", { name: "Neues Projekt", exact: true }),
    ).toBeVisible({ timeout: 25000 });
    // Delay only transport to the REAL worker; inspect original canvas before selection can complete.
    await page.evaluate(() => {
      window.Worker = new Proxy(window.Worker, {
        construct(Target, args) {
          const w = Reflect.construct(Target, args);
          if (String(args[0]).includes("smart-cutout.worker")) {
            window.__stabilityWorker = w;
            const post = w.postMessage.bind(w);
            w.postMessage = (msg, ...rest) => {
              window.__stabilityRequest = msg;
              if (window.__delaySelection) {
                window.__delaySelection = false;
                setTimeout(() => post(msg, ...rest), 1200);
              } else post(msg, ...rest);
            };
          }
          return w;
        },
      });
    });
  };
  const chooser = async (file) =>
    app.evaluate(({ dialog }, file) => {
      dialog.showOpenDialog = async () => ({
        canceled: false,
        filePaths: [file],
      });
    }, file);
  const read = async () =>
    JSON.parse(await fs.readFile(path.join(project, "laceframe.json"), "utf8"));
  const editor = () =>
    page.getByRole("dialog", { name: "Freistellungsmaske", exact: true });
  const ready = async () => {
    await expect(
      editor().getByRole("status", {
        name: "Freistellung Berechnung",
        exact: true,
      }),
    ).toContainText("Vorschau bereit");
    await expect(
      editor().getByRole("button", {
        name: "Freigestellten Kandidaten speichern",
        exact: true,
      }),
    ).toBeEnabled();
  };
  const rgba = async (x, y) =>
    editor()
      .locator("canvas")
      .evaluate(
        (c, { x, y }) => [...c.getContext("2d").getImageData(x, y, 1, 1).data],
        { x, y },
      );
  const open = async () => {
    const quality = page
      .locator('[data-testid="asset-quality"]:visible')
      .first();
    if ((await quality.getAttribute("open")) === null)
      await expect(quality.getByRole("heading", {name: "Bild bearbeiten", exact: true})).toBeVisible();
    await quality
      .getByRole("button", { name: "Hintergrund freistellen", exact: true })
      .click();
  };
  const close = async () => {
    const accept = (d) => d.accept();
    page.once("dialog", accept);
    try {
      await editor()
        .getByRole("button", { name: "Editor schließen", exact: true })
        .click();
    } finally {
      // A pristine close has no confirmation: never leave its listener armed
      // for a later, unrelated master-activation dialog.
      page.off("dialog", accept);
    }
  };
  try {
    await launch();
    await chooser(project);
    await require("./smoke-ui.cjs").prepareProjectCreation(page);
    await page
      .getByRole("button", { name: "Projekt erstellen …", exact: true })
      .click();
    await page
      .getByLabel("Neue Figur", { exact: true })
      .fill("Synthetic stability");
    await page
      .getByRole("button", { name: "Figur erstellen", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Synthetic stability", exact: true }),
    ).toBeVisible();
    const source = new PNG({ width: 1254, height: 1254 });
    for (let i = 0; i < 1254 * 1254; i++)
      source.data.set([20, 80, 140, 255], i * 4);
    const bytes = PNG.sync.write(source);
    await app.close();
    await seedHistoricalMaster(project, bytes);
    await launch();
    await chooser(project);
    await page
      .getByRole("button", { name: /^Projekt öffnen(?: …)?$/ })
      .click();
    await expect(
      page.getByAltText("Freigegebener Master V1", { exact: true }),
    ).toBeVisible();

    const original = (await read()).masters[0],
      originalBytes = await fs.readFile(path.join(project, original.file));
    await expect(
      page.getByAltText("Freigegebener Master V1", { exact: true }),
    ).toBeVisible();
    let quality = page.locator('[data-testid="asset-quality"]:visible').first();
    await expect(quality.getByRole("heading", {name: "Bild bearbeiten", exact: true})).toBeVisible();
    await expect(
      quality.getByRole("status", { name: "Relighting Freigabe", exact: true }),
    ).toContainText("erst nach der Freistellung");
    await expect(
      quality.getByRole("button", {
        name: "Live Relighting öffnen",
        exact: true,
      }),
    ).toBeDisabled();
    const denied = await page.evaluate(
      (id) => window.laceframe.relightSource(id),
      original.id,
    );
    expect(denied.ok).toBe(false);
    const deniedApply = await page.evaluate(
      (m) =>
        window.laceframe.command({
          type: "createRelighting",
          sourceId: m.id,
          sourceSha256: m.sha256,
          light: {
            direction: 315,
            intensity: 0,
            temperature: 0,
            ambient: 1,
            shadows: 0,
            contrast: 1,
            highlights: 0,
            pixelArt: false,
            levels: 4,
          },
          regions: [],
          previewPixelSha256: "0".repeat(64),
        }),
      original,
    );
    expect(deniedApply.ok).toBe(false);
    expect(deniedApply.error).toContain("Freistellung");
    expect((await read()).qualityAssets).toHaveLength(0);

    await page.evaluate(() => {
      window.__delaySelection = true;
    });
    await open();
    await expect.poll(() => rgba(600, 600)).toEqual([20, 80, 140, 255]);
    await expect(
      editor().getByRole("button", {
        name: "Freigestellten Kandidaten speichern",
        exact: true,
      }),
    ).toBeDisabled();
    await ready();
    const canvasHash = await editor()
      .locator("canvas")
      .evaluate(async (c) => {
        const rgba = c
          .getContext("2d")
          .getImageData(0, 0, c.width, c.height).data;
        return [
          ...new Uint8Array(await window.crypto.subtle.digest("SHA-256", rgba)),
        ]
          .map((x) => x.toString(16).padStart(2, "0"))
          .join("");
      });
    expect(canvasHash).toBe(hash(source.data));
    await expect(
      editor().getByRole("status", {
        name: "Freistellung Berechnung",
        exact: true,
      }),
    ).toContainText("0 reduzierte Maskenpixel");
    await expect(
      editor().getByLabel("Pinselgröße", { exact: true }),
    ).toBeHidden();
    await expect(
      editor().getByLabel("Farbtoleranz", { exact: true }),
    ).toBeVisible();
    await selectMaskTool(editor(), "protect");
    await expect(
      editor().getByLabel("Farbtoleranz", { exact: true }),
    ).toBeHidden();
    await expect(
      editor().getByLabel("Pinselgröße", { exact: true }),
    ).toBeVisible();
    await expect(
      editor().getByText(
        "Diese Pixel bleiben erhalten, auch wenn sie dieselbe Farbe wie der Hintergrund haben.",
        { exact: true },
      ),
    ).toBeVisible();
    await selectMaskTool(editor(), "polygon");
    await expect(
      editor().getByLabel("Polygonoperation", { exact: true }),
    ).toBeVisible();
    await selectMaskTool(editor(), "pick");
    expect(await editor().locator("details details").count()).toBe(0);
    await editor()
      .getByLabel("Freistellung Bildansicht", { exact: true })
      .selectOption("original");
    expect(await rgba(600, 600)).toEqual([20, 80, 140, 255]);
    await editor()
      .getByLabel("Freistellung Bildansicht", { exact: true })
      .selectOption("alpha");
    await expect.poll(() => rgba(600, 600)).toEqual([255, 255, 255, 255]);
    await editor()
      .getByLabel("Freistellung Bildansicht", { exact: true })
      .selectOption("result");
    await expect.poll(() => rgba(600, 600)).toEqual([20, 80, 140, 255]);
    await editor()
      .getByRole("button", {
        name: "Hintergrundauswahl aktualisieren",
        exact: true,
      })
      .click();
    await ready();
    expect(await rgba(600, 600)).toEqual([20, 80, 140, 255]);
    await fs.mkdir("artifacts", { recursive: true });
    for (const [width, height] of [
      [960, 720],
      [1280, 800],
      [1440, 900],
      [1920, 1080],
    ]) {
      await app.evaluate(
        ({ BrowserWindow }, { width, height }) => {
          const w = BrowserWindow.getAllWindows()[0];
          if (width === 1920) w.maximize();
          else w.unmaximize();
          w.setContentSize(width, height);
        },
        { width, height },
      );
      await page.setViewportSize({ width, height });
      await editor()
        .getByRole("button", { name: "Einpassen", exact: true })
        .click();
      await expect.poll(() => rgba(600, 600)).toEqual([20, 80, 140, 255]);
      await expect(
        editor().getByRole("button", {
          name: "Freigestellten Kandidaten speichern",
          exact: true,
        }),
      ).toBeInViewport();
      expect(
        await editor().evaluate((el) => el.scrollWidth <= el.clientWidth),
      ).toBe(true);
      await page.screenshot({
        path: `artifacts/cutout-stability-${width}.png`,
      });
    }
    await editor().getByRole("button", { name: "100 %", exact: true }).click();
    expect(await rgba(600, 600)).toEqual([20, 80, 140, 255]);
    await editor()
      .getByRole("button", { name: "Einpassen", exact: true })
      .click();
    // Invalid worker payload cannot masquerade as ready, and retry uses real worker output.
    await page.evaluate(() => {
      window.__stabilityWorker.dispatchEvent(
        new window.MessageEvent("message", {
          data: {
            serial: window.__stabilityRequest.serial,
            weights: new Uint8Array(),
          },
        }),
      );
    });
    await expect(
      editor().getByRole("status", {
        name: "Freistellung Berechnung",
        exact: true,
      }),
    ).toContainText("Berechnungsfehler");
    await expect(
      editor().getByRole("button", {
        name: "Freigestellten Kandidaten speichern",
        exact: true,
      }),
    ).toBeDisabled();
    expect(await rgba(600, 600)).toEqual([20, 80, 140, 255]);
    await editor()
      .getByRole("button", { name: "Erneut versuchen", exact: true })
      .click();
    await ready();
    await close();
    await open();
    await ready();
    expect(await rgba(600, 600)).toEqual([20, 80, 140, 255]);
    await close();
    // Real bounded file read failure + recovery, in this disposable project only.
    await fs.chmod(path.join(project, original.file), 0o644);
    await fs.writeFile(path.join(project, original.file), "invalid");
    await open();
    await expect(
      editor().getByRole("status", {
        name: "Freistellung Berechnung",
        exact: true,
      }),
    ).toContainText("Ladefehler");
    await expect(
      editor().getByRole("button", {
        name: "Freigestellten Kandidaten speichern",
        exact: true,
      }),
    ).toBeDisabled();
    await fs.writeFile(path.join(project, original.file), originalBytes);
    await fs.chmod(path.join(project, original.file), 0o444);
    await editor()
      .getByRole("button", { name: "Erneut versuchen", exact: true })
      .click();
    await ready();
    expect(await rgba(600, 600)).toEqual([20, 80, 140, 255]);
    // Explicit polygon removes a border strip; candidate and approval are separate UI actions.
    await selectMaskTool(editor(), "polygon");
    await editor()
      .getByLabel("Polygonoperation", { exact: true })
      .selectOption("protect");
    const box = await editor().locator("canvas").boundingBox();
    for (const [x, y] of [
      [120, 120],
      [1130, 120],
      [1130, 1130],
      [120, 1130],
    ])
      await page.mouse.click(
        box.x + ((x + 0.5) * box.width) / 1254,
        box.y + ((y + 0.5) * box.height) / 1254,
      );
    await editor()
      .getByRole("button", { name: "Polygon schließen", exact: true })
      .click();
    await editor()
      .getByRole("button", { name: "Polygon anwenden", exact: true })
      .click();
    await ready();
    await selectMaskTool(editor(), "pick");
    const seedBox = await editor().locator("canvas").boundingBox();
    await page.mouse.click(
      seedBox.x + (10.5 * seedBox.width) / 1254,
      seedBox.y + (10.5 * seedBox.height) / 1254,
    );
    await ready();

    await editor()
      .getByRole("button", {
        name: "Freigestellten Kandidaten speichern",
        exact: true,
      })
      .click();
    quality = page.locator('[data-testid="asset-quality"]:visible').first();
    await expect(
      quality.getByRole("button", {
        name: "Live Relighting öffnen",
        exact: true,
      }),
    ).toBeDisabled();
    await quality
      .getByLabel("Qualitätsnotiz", { exact: true })
      .fill("Synthetic cutout silhouette manually checked");
    await quality
      .getByLabel(
        "Identität, Outfit, Konturen, Stil und Alpha-Kanten visuell geprüft",
        { exact: true },
      )
      .check();
    page.once("dialog", (d) => d.accept());
    await quality
      .getByRole("button", { name: "Qualitätsversion freigeben", exact: true })
      .click();
    await expect(
      page.getByAltText("Freigegebener Master V2", { exact: true }),
    ).toBeVisible();
    quality = page.locator('[data-testid="asset-quality"]:visible').first();
    if ((await quality.getAttribute("open")) === null)
      await expect(quality.getByRole("heading", {name: "Bild bearbeiten", exact: true})).toBeVisible();
    await expect(
      quality.getByRole("button", {
        name: "Live Relighting öffnen",
        exact: true,
      }),
    ).toBeEnabled();
    await quality
      .getByRole("button", { name: "Live Relighting öffnen", exact: true })
      .click();
    await expect(
      page.getByRole("status", { name: "Lichtberechnung", exact: true }),
    ).toContainText("Vorschau bereit");
    await page
      .getByRole("dialog", { name: "Live Relighting", exact: true })
      .getByRole("button", { name: "Verwerfen & schließen", exact: true })
      .click();
    // Reopen historical cutout revision from Library, retaining original RGBA and saved mask.
    const approved = (await read()).qualityAssets.find(
      (q) => q.operation === "cutout",
    );
    await nav(page, "Library");
    await page
      .getByLabel("Library Asset", { exact: true })
      .selectOption(approved.id);
    quality = page.locator('[data-testid="asset-quality"]:visible').first();
    if ((await quality.getAttribute("open")) === null)
      await expect(quality.getByRole("heading", {name: "Bild bearbeiten", exact: true})).toBeVisible();
    await open();
    await ready();
    await editor()
      .getByLabel("Freistellung Bildansicht", { exact: true })
      .selectOption("original");
    await expect.poll(() => rgba(5, 600)).toEqual([20, 80, 140, 255]);
    await editor()
      .getByLabel("Freistellung Bildansicht", { exact: true })
      .selectOption("result");
    await editor()
      .getByLabel("Entfernten Bereich anzeigen", { exact: true })
      .uncheck();
    await expect.poll(async () => (await rgba(5, 600))[3]).toBe(0);
    await close();
    // Synthetic pre-guard light record: existing reading/export/cutout stay available.
    await app.close();
    app = undefined;
    const historical = await read(),
      legacyId = randomUUID(),
      legacyHash = hash(originalBytes);
    const neutral = {
      direction: 315,
      intensity: 0,
      temperature: 0,
      ambient: 1,
      shadows: 0,
      contrast: 1,
      highlights: 0,
      pixelArt: false,
      levels: 4,
    };
    const legacy = {
      id: legacyId,
      sourceId: original.id,
      sourceSha256: original.sha256,
      characterId: original.characterId,
      sha256: legacyHash,
      file: `assets/quality/${legacyHash}.png`,
      width: 1254,
      height: 1254,
      format: "png",
      operation: "relighting",
      version: 1,
      createdAt: new Date().toISOString(),
      status: "candidate",
      relighting: {
        revision: 1,
        algorithm: "2d-rgba8-lut-v1",
        geometry: "2d-gradient-no-normals",
        light: neutral,
        pixelSha256: hash(source.data),
        regions: [],
      },
    };
    await fs.writeFile(path.join(project, legacy.file), originalBytes);
    historical.qualityAssets.push(legacy);
    const historicalManifest = JSON.stringify(historical);
    await fs.writeFile(
      path.join(project, "laceframe.json"),
      historicalManifest,
    );
    await launch();
    await chooser(project);
    await page
      .getByRole("button", { name: /^Projekt öffnen(?: …)?$/ })
      .click();
    await expect(
      page.getByAltText("Freigegebener Master V2", { exact: true }),
    ).toBeVisible();
    await nav(page, "Library");
    await page
      .getByLabel("Library Asset", { exact: true })
      .selectOption(legacyId);
    quality = page.locator('[data-testid="asset-quality"]:visible').first();
    if ((await quality.getAttribute("open")) === null)
      await expect(quality.getByRole("heading", {name: "Bild bearbeiten", exact: true})).toBeVisible();
    await expect(
      quality.getByRole("button", {
        name: "Live Relighting öffnen",
        exact: true,
      }),
    ).toBeDisabled();
    await expect(
      quality.getByRole("button", {
        name: "Lichtrevision bearbeiten",
        exact: true,
      }),
    ).toBeDisabled();
    await expect(
      page.getByAltText("Qualität · Ergebnisvorschau", { exact: true }),
    ).toBeVisible();
    const exportedDir = path.join(root, "export");
    await fs.mkdir(exportedDir);
    await chooser(exportedDir);
    await quality
      .getByRole("button", {
        name: "Ausdrücklich Rohbild exportieren",
        exact: true,
      })
      .click();
    await expect(quality.getByText(/Exportiert:/)).toBeVisible();
    const exportedFiles = await fs.readdir(exportedDir);
    expect(
      hash(
        await fs.readFile(
          path.join(
            exportedDir,
            exportedFiles.find((f) => f.endsWith(".png")),
          ),
        ),
      ),
    ).toBe(original.sha256);
    await open();
    await ready();
    expect(await rgba(600, 600)).toEqual([20, 80, 140, 255]);
    await close();
    expect(
      await fs.readFile(path.join(project, "laceframe.json"), "utf8"),
    ).toBe(historicalManifest);
    // Known partial/zero alpha remains unchanged with no seeds and retention 255.
    await nav(page, "Characters");
    await page
      .getByLabel("Neue Figur", { exact: true })
      .fill("Partial synthetic");
    await page
      .getByRole("button", { name: "Figur erstellen", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Partial synthetic", exact: true }),
    ).toBeVisible();
    const partial = new PNG({ width: 32, height: 24 });
    for (let i = 0; i < 32 * 24; i++)
      partial.data.set([20, 80, 140, 255], i * 4);
    partial.data.set([64, 128, 192, 128], (12 * 32 + 16) * 4);
    partial.data.set([5, 10, 15, 0], 0);
    await app.close();
    await seedHistoricalMaster(project, PNG.sync.write(partial));
    await launch();
    await chooser(project);
    await page
      .getByRole("button", { name: /^Projekt öffnen(?: …)?$/ })
      .click();
    await expect(
      page.getByAltText("Freigegebener Master V1", { exact: true }),
    ).toBeVisible();
    quality = page.locator('[data-testid="asset-quality"]:visible').first();
    if ((await quality.getAttribute("open")) === null)
      await expect(quality.getByRole("heading", {name: "Bild bearbeiten", exact: true})).toBeVisible();
    await open();
    await ready();
    const partialResult = await rgba(16, 12);
    expect(partialResult[3]).toBe(128);
    expect((await rgba(0, 0))[3]).toBe(0);
    await editor()
      .getByLabel("Freistellung Bildansicht", { exact: true })
      .selectOption("original");
    await expect.poll(async () => (await rgba(16, 12))[3]).toBe(128);
    const originalPartial = await rgba(16, 12);
    for (let c = 0; c < 3; c++)
      expect(
        Math.abs(originalPartial[c] - partialResult[c]),
      ).toBeLessThanOrEqual(1);
    await editor()
      .getByLabel("Freistellung Bildansicht", { exact: true })
      .selectOption("alpha");
    await expect.poll(() => rgba(16, 12)).toEqual([128, 128, 128, 255]);
    await close();
    expect(hash(await fs.readFile(path.join(project, original.file)))).toBe(
      original.sha256,
    );
    expect(errors).toEqual([]);
    console.log(
      `PASS cutout stability (${process.env.LACEFRAME_DEV ? "development StrictMode" : "packaged"}): actual 1254x1254 full canvas SHA, original before worker, no seeds/retention255/zero removals, views/recompute/resize/zoom/reopen, context tools, invalid worker and real source failure/retry, direct IPC denial, explicit cutout review unlocks Relighting; original unchanged.`,
    );
  } catch (e) {
    if (app) {
      await fs.mkdir("artifacts", { recursive: true });
      await page.screenshot({ path: "artifacts/cutout-stability-failure.png" });
      console.error(await page.locator("body").innerText());
    }
    throw e;
  } finally {
    if (app) await app.close();
    await fs.rm(root, { recursive: true, force: true });
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
