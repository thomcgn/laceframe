const { seedHistoricalMaster } = require("./historical-master-fixture.cjs");
const { selectMaskTool } = require("./smoke-ui.cjs");
const { field, image, nav } = require("./smoke-ui.cjs");
// Synthetic local pixels only. No provider, image turn, remote request or private project.
const { _electron: electron, expect } = require("@playwright/test");
const fs = require("node:fs/promises"),
  path = require("node:path"),
  os = require("node:os");
const { PNG } = require("pngjs");
const { createHash } = require("node:crypto");
(async () => {
  const root = await fs.mkdtemp(
      path.join(os.tmpdir(), "laceframe-quality-desktop-"),
    ),
    project = path.join(root, "project"),
    exports = path.join(root, "exports");
  await fs.mkdir(project);
  await fs.mkdir(exports);
  let app, page;
  const errors = [];
  const read = async () =>
    JSON.parse(await fs.readFile(path.join(project, "laceframe.json"), "utf8"));
  const launch = async () => {
    const env = { ...process.env };
    delete env.ELECTRON_RUN_AS_NODE;
    app = await electron.launch({
      executablePath: path.resolve("out/Laceframe-linux-x64/laceframe"),
      args: ["--user-data-dir=" + path.join(root, "user-data")],
      env,
    });
    page = await app.firstWindow();
    page.setDefaultTimeout(15000);
    page.on("pageerror", (e) => errors.push(e.message));
    await expect(
      page.getByRole("button", { name: "Neues Projekt", exact: true }),
    ).toBeVisible({ timeout: 25000 });
  };
  const chooser = async (directory) =>
    app.evaluate(({ dialog }, directory) => {
      dialog.showOpenDialog = async () => ({
        canceled: false,
        filePaths: [directory],
      });
    }, directory);
  try {
    await launch();
    await chooser(project);
    await require("./smoke-ui.cjs").prepareProjectCreation(page);
    await page
      .getByLabel("Projektname", { exact: true })
      .fill("Synthetic Quality");
    await page
      .getByRole("button", { name: "Projekt erstellen …", exact: true })
      .click();
    await expect(
      page.getByText("Synthetic Quality", { exact: true }),
    ).toBeVisible();
    await page.getByLabel("Neue Figur", { exact: true }).fill("Black Coat");
    await page
      .getByRole("button", { name: "Figur erstellen", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Black Coat", exact: true }),
    ).toBeVisible();
    const pixels = new PNG({ width: 32, height: 32 });
    pixels.data.fill(0);
    for (let i = 0; i < 32 * 32; i++) {
      pixels.data[i * 4] = 10;
      pixels.data[i * 4 + 1] = 10;
      pixels.data[i * 4 + 2] = 10;
      pixels.data[i * 4 + 3] = 255;
    }
    pixels.data.set([190, 70, 30, 255], (16 * 32 + 12) * 4);
    const bytes = PNG.sync.write(pixels),
      originalHash = createHash("sha256").update(bytes).digest("hex");
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

    await expect(
      page.locator('[data-quality-status="opaque"]').first(),
    ).toBeVisible();
    let q = page.locator('[data-testid="asset-quality"]:visible').first();
    await expect(q.getByRole("heading", {name: "Bild bearbeiten", exact: true})).toBeVisible();
    await q
      .getByRole("button", {
        name: "Transparentes PNG exportieren",
        exact: true,
      })
      .click();
    await expect(q.getByRole("alert")).toContainText("Rohbild");
    await q
      .getByRole("button", { name: "Hintergrund freistellen", exact: true })
      .click();
    let editor = page.getByRole("dialog", {
      name: "Freistellungsmaske",
      exact: true,
    });
    await expect(
      editor.getByRole("button", {
        name: "Freigestellten Kandidaten speichern",
        exact: true,
      }),
    ).toBeEnabled();
    // A colored source must be visible immediately; a flat mask canvas cannot pass this regression.
    const previewPixel = async (x, y) =>
      editor
        .locator("canvas")
        .evaluate(
          (c, { x, y }) => [
            ...c.getContext("2d").getImageData(x, y, 1, 1).data,
          ],
          { x, y },
        );
    await expect(
      editor.getByLabel("Maskenüberlagerung", { exact: true }),
    ).not.toBeChecked();
    await expect.poll(() => previewPixel(12, 16)).toEqual([190, 70, 30, 255]);
    await editor.getByLabel("Maskenüberlagerung", { exact: true }).check();
    // React schedules the canvas paint separately from the checkbox update.
    // Wait for the exact tint; reading immediately races requestAnimationFrame on CI.
    await expect.poll(() => previewPixel(12, 16)).toEqual([174, 106, 78, 255]);
    const tinted = await previewPixel(12, 16);
    expect(tinted[3]).toBe(255);
    expect(tinted[0]).toBeGreaterThan(tinted[1]);
    expect(tinted).not.toEqual(await previewPixel(16, 16));
    await editor.getByLabel("Maskenüberlagerung", { exact: true }).uncheck();
    await expect.poll(() => previewPixel(12, 16)).toEqual([190, 70, 30, 255]);
    if (
      (await editor.locator(".editor-advanced").getAttribute("open")) === null
    )
      await editor.locator(".editor-advanced summary").click();
    await editor
      .getByLabel("Maskenname", { exact: true })
      .fill("Retained silhouette");
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].setSize(960, 720),
    );
    await expect
      .poll(() => editor.evaluate((el) => el.scrollWidth <= el.clientWidth))
      .toBe(true);
    await selectMaskTool(editor, "erase");
    await editor.getByLabel("Pinselgröße", { exact: true }).fill("5");
    let box = await editor.locator("canvas").boundingBox();
    const trace = async (x1, y1, x2, y2) => {
      await page.mouse.move(box.x + box.width * x1, box.y + box.height * y1);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width * x2, box.y + box.height * y2, {
        steps: 30,
      });
      await page.mouse.up();
    };
    await trace(0.01, 0.01, 0.99, 0.01);
    await trace(0.99, 0.01, 0.99, 0.99);
    await trace(0.99, 0.99, 0.01, 0.99);
    await trace(0.01, 0.99, 0.01, 0.01);
    await editor
      .getByRole("button", { name: "Rückgängig", exact: true })
      .click();
    await editor
      .getByRole("button", { name: "Wiederholen", exact: true })
      .click();
    await editor.getByLabel("Maskenüberlagerung", { exact: true }).uncheck();
    await fs.mkdir("artifacts", { recursive: true });
    await page.screenshot({ path: "artifacts/cutout-editor-960.png" });
    await editor
      .getByRole("button", {
        name: "Freigestellten Kandidaten speichern",
        exact: true,
      })
      .click();
    await expect(editor).not.toBeVisible();
    let p = await read(),
      derived = p.qualityAssets[0];
    expect(derived.mask.type).toBe("foreground-alpha");
    expect(derived.status).toBe("candidate");
    const cut = PNG.sync.read(
      await fs.readFile(path.join(project, derived.file)),
    );
    expect(cut.data[3]).toBe(0);
    expect([
      ...cut.data.slice((16 * 32 + 12) * 4, (16 * 32 + 12) * 4 + 4),
    ]).toEqual([190, 70, 30, 255]);
    expect([
      ...cut.data.slice((16 * 32 + 16) * 4, (16 * 32 + 16) * 4 + 4),
    ]).toEqual([10, 10, 10, 255]);
    // Reload saved retention mask from the original, correct a soft edge, then save a new candidate.
    await q
      .getByRole("button", { name: "Hintergrund freistellen", exact: true })
      .click();
    editor = page.getByRole("dialog", {
      name: "Freistellungsmaske",
      exact: true,
    });
    await expect(
      editor.getByRole("button", {
        name: "Freigestellten Kandidaten speichern",
        exact: true,
      }),
    ).toBeEnabled();
    await expect(editor.getByLabel("Maskenname", { exact: true })).toHaveValue(
      "Retained silhouette",
    );
    await selectMaskTool(editor, "paint");
    await editor.getByLabel("Pinselgröße", { exact: true }).fill("3");
    await editor.getByLabel("Maskenwert", { exact: true }).fill("128");
    box = await editor.locator("canvas").boundingBox();
    await trace(0.15, 0.15, 0.2, 0.15);
    await editor
      .getByRole("button", {
        name: "Freigestellten Kandidaten speichern",
        exact: true,
      })
      .click();
    await expect(editor).not.toBeVisible();
    p = await read();
    expect(p.qualityAssets).toHaveLength(2);
    await q
      .getByLabel("Qualitätsnotiz", { exact: true })
      .fill(
        "Black outfit retained; silhouette and soft alpha inspected. Synthetic fixture.",
      );
    await q
      .getByLabel(
        "Identität, Outfit, Konturen, Raster, Stil und Alpha-Kanten visuell geprüft",
        { exact: true },
      )
      .check();
    page.once("dialog", d => d.accept());
    await q
      .getByRole("button", { name: "Qualitätsversion freigeben", exact: true })
      .click();
    await expect.poll(async () => (await read()).masters.length).toBe(2);
    p = await read();
    expect(p.masters[1].previousMasterId).toBe(p.masters[0].id);
    expect(p.masters[0].sha256).toBe(originalHash);
    await expect(page.getByAltText("Freigegebener Master V2")).toBeVisible();
    q = page.locator('[data-testid="asset-quality"]:visible').first();
    await expect(q.getByRole("heading", {name: "Bild bearbeiten", exact: true})).toBeVisible();
    await chooser(exports);
    await q
      .getByRole("button", {
        name: "Transparentes PNG exportieren",
        exact: true,
      })
      .click();
    await expect(
      q.getByRole("status").filter({ hasText: "Exportiert:" }),
    ).toContainText("Black_Coat_Master_V2_32x32.png");
    const exported = await fs.readFile(
      path.join(exports, "Black_Coat_Master_V2_32x32.png"),
    );
    const exportedPixels = PNG.sync.read(exported);
    expect([
      ...exportedPixels.data.slice((16 * 32 + 12) * 4, (16 * 32 + 12) * 4 + 4),
    ]).toEqual([190, 70, 30, 255]);
    expect(exportedPixels.data[3]).toBe(0);
    expect(exported).toEqual(
      await fs.readFile(path.join(project, p.masters[1].file)),
    );
    expect(
      JSON.parse(
        await fs.readFile(
          path.join(exports, "Black_Coat_Master_V2_32x32.json"),
          "utf8",
        ),
      ).source.id,
    ).toBe(p.masters[1].id);
    const gate = await page.evaluate(async () => ({
      bad: await window.laceframe.command({
        type: "createCutout",
        sourceId: "/etc/passwd",
        weights: new Uint8Array(1),
      }),
      node: typeof window.require,
      unsafeExport: await window.laceframe.exportAsset({
        id: "../../file",
        raw: true,
        provenance: false,
      }),
    }));
    expect(gate.bad.ok).toBe(false);
    expect(gate.unsafeExport.ok).toBe(false);
    expect(gate.node).toBe("undefined");
    await page.screenshot({
      path: "artifacts/quality-master-v2-960.png",
      fullPage: true,
    });
    // UX-01 Library retains actual master versions and opens exact quality records.
    await nav(page, "Library");
    await field(page, "Library Assettyp", { exact: true }).selectOption(
      "master",
    );
    await field(page, "Library Asset", { exact: true }).selectOption(
      p.masters[0].id,
    );
    await expect(
      image(page, "Library · Ergebnisvorschau", { exact: true }),
    ).toBeVisible();
    await expect(
      page.locator("section.library-workspace:visible"),
    ).toContainText("Master V1");
    await field(page, "Library Asset", { exact: true }).selectOption(
      p.masters[1].id,
    );
    await expect(
      page.locator("section.library-workspace:visible"),
    ).toContainText("Master V2");
    await field(page, "Library Assettyp", { exact: true }).selectOption(
      "quality",
    );
    await field(page, "Library Asset", { exact: true }).selectOption(
      p.qualityAssets[0].id,
    );
    q = page.locator('[data-testid="asset-quality"]:visible');
    await expect(q.getByRole("heading", {name: "Bild bearbeiten", exact: true})).toBeVisible();
    await expect(q.getByLabel("Qualitätsversion", { exact: true })).toHaveValue(
      p.qualityAssets[0].id,
    );
    await expect(
      q.getByRole("button", { name: "Hintergrund freistellen", exact: true }),
    ).toBeEnabled();
    await expect(
      q.getByRole("button", {
        name: "Transparentes PNG exportieren",
        exact: true,
      }),
    ).toBeEnabled();
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].setSize(1440, 900),
    );
    await expect
      .poll(() =>
        page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      )
      .toBe(true);
    await page
      .locator("section.library-workspace .master-compare")
      .first()
      .getByLabel("Create Zoom", { exact: true })
      .selectOption("400");
    await q.getByLabel("Create Zoom", { exact: true }).selectOption("400");
    await expect
      .poll(() =>
        page
          .locator("section.library-workspace img:visible")
          .evaluateAll(
            (images) =>
              images.length > 0 &&
              images.every((img) => img.complete && img.naturalWidth > 0),
          ),
      )
      .toBe(true);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({
      path: "artifacts/ux01-library-1440.png",
      fullPage: true,
    });
    const before = await fs.readFile(
      path.join(project, "laceframe.json"),
      "utf8",
    );
    await app.close();
    app = null;
    await launch();
    await chooser(project);
    await page
      .getByRole("button", { name: /^Projekt öffnen(?: …)?$/ })
      .click();
    await expect(page.getByAltText("Freigegebener Master V2")).toBeVisible();
    expect(
      await fs.readFile(path.join(project, "laceframe.json"), "utf8"),
    ).toBe(before);
    expect(
      createHash("sha256")
        .update(await fs.readFile(path.join(project, p.masters[0].file)))
        .digest("hex"),
    ).toBe(originalHash);
    expect(errors).toEqual([]);
    console.log(
      "PASS packaged quality: actual alpha analysis, opaque export gate, real brush/erase/undo/redo/correction, soft cutout, black outfit retained, Master V2, original hashes, PNG+JSON export, secure bridge, 960px, reopen. No image generation.",
    );
  } finally {
    if (app) await app.close();
    console.log("Synthetic artifacts:", root);
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
