// Focused Semantic Layers visual/integrity acceptance. Synthetic images; no generation provider.
const { _electron: electron, expect } = require("@playwright/test");
const { PNG } = require("pngjs");
const fs = require("node:fs/promises"),
  path = require("node:path"),
  os = require("node:os");
const { field, nav } = require("./smoke-ui.cjs");
const { reviewImport } = require("./historical-master-fixture.cjs");
(async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "laceframe-layer-ui-"));
  const dir = path.join(root, "project");
  await fs.mkdir(dir);
  const png = new PNG({ width: 512, height: 640 });
  for (let y = 32; y < 608; y++)
    for (let x = 64; x < 448; x++) {
      let color =
        y < 208
          ? [80, 60, 50, 255]
          : y < 400
            ? [190, 140, 110, 255]
            : [50, 90, 100, 255];
      if (
        y >= 256 &&
        y < 272 &&
        ((x >= 144 && x < 160) || (x >= 352 && x < 368))
      )
        color = [20, 24, 32, 255];
      if (y >= 352 && y < 368 && x >= 200 && x < 312)
        color = [120, 62, 67, 255];
      png.data.set(color, (y * 512 + x) * 4);
    }
  png.data.set([98, 78, 68, 255], (105 * 512 + 105) * 4);
  const bytes = PNG.sync.write(png),
    file = path.join(root, "synthetic.png");
  await fs.writeFile(file, bytes);
  const screenshots = path.resolve("artifacts/layers");
  await fs.mkdir(screenshots, { recursive: true });
  let app;
  const errors = [];
  try {
    const env = { ...process.env };
    delete env.ELECTRON_RUN_AS_NODE;
    app = await electron.launch({
      executablePath: path.resolve("out/Laceframe-linux-x64/laceframe"),
      args: ["--user-data-dir=" + path.join(root, "user-data")],
      env,
    });
    let page = await app.firstWindow();
    page.setDefaultTimeout(15000);
    page.on("pageerror", (e) => errors.push(e.message));
    const choose = (p) =>
      app.evaluate(({ dialog }, p) => {
        dialog.showOpenDialog = async () => ({
          canceled: false,
          filePaths: [p],
        });
      }, p);
    const manifest = () =>
      fs.readFile(path.join(dir, "laceframe.json"), "utf8").then(JSON.parse);
    await choose(dir);
    await require("./smoke-ui.cjs").prepareProjectCreation(page);
    await field(page, "Projektname", { exact: true }).fill("Pixel pipeline");
    await page
      .getByRole("button", { name: "Projekt erstellen …", exact: true })
      .click();
    await field(page, "Neue Figur", { exact: true }).fill("Synthetic Pixel");
    await page
      .getByRole("button", { name: "Figur erstellen", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Synthetic Pixel", exact: true }),
    ).toBeVisible();
    await choose(file);
    await page
      .getByRole("button", { name: "Masterportrait auswählen …", exact: true })
      .click();
    await reviewImport(page);
    await page
      .getByRole("button", {
        name: "Freigegebenen Master sperren",
        exact: true,
      })
      .click();
    await expect.poll(async () => (await manifest()).masters.length).toBe(1);
    const master = (await manifest()).masters[0],
      masterBytes = await fs.readFile(path.join(dir, master.file));
    await nav(page, "Library");
    await field(page, "Bibliothek Asset", { exact: true }).selectOption(
      master.id,
    );

    // Existing region fixture goes through the production command boundary.
    const paletteSetup = await page.evaluate((m) => {
      const weights = new Uint8Array(512 * 640);
      weights[100 * 512 + 150] = 255;
      return window.laceframe.command({
        type: "saveMasterPalette",
        masterId: m.id,
        masterSha256: m.sha256,
        regions: [
          {
            id: window.crypto.randomUUID(),
            name: "Vorhandene Haarregion",
            role: "hair",
            weights,
          },
        ],
      });
    }, master);
    expect(paletteSetup.ok).toBe(true);
    const originalPalette = paletteSetup.value.project.masterPalettes[0],
      paletteBytes = await fs.readFile(
        path.join(dir, originalPalette.regions[0].mask.file),
      );
    await choose(dir);
    await page
      .getByRole("button", { name: "Projekt öffnen …", exact: true })
      .click();
    await nav(page, "Library");
    await field(page, "Bibliothek Asset", { exact: true }).selectOption(
      master.id,
    );
    const openLayers = async () => {
      await page
        .getByRole("button", {
          name: "Character Layers bearbeiten",
          exact: true,
        })
        .click();
      const editor = page.getByRole("dialog", {
        name: "Character Layers",
        exact: true,
      });
      // Start with empty layers, create first layer
      await editor.getByRole("button", { name: "Layer hinzufügen", exact: true }).click();
      await expect(
        editor.getByLabel("Layername 1", { exact: true }),
      ).toBeVisible();
      return editor;
    };
    let editor = await openLayers();
    const canvas = () =>
      editor.getByLabel("Semantische Layer Bildfläche", { exact: true });
    const count = async () =>
      Number(
        (
          await editor
            .getByRole("status")
            .filter({ hasText: "Zugeordnet:" })
            .innerText()
        ).match(/Zugeordnet: (\d+)/)[1],
      );
    const point = async (x, y) => {
      const b = await canvas().boundingBox();
      const native = await canvas().evaluate((c) => ({
        width: c.width,
        height: c.height,
      }));
      return {
        x: b.x + (x / native.width) * b.width,
        y: b.y + (y / native.height) * b.height,
      };
    };
    const click = async (x, y) => {
      const p = await point(x, y);
      await page.mouse.click(p.x, p.y);
    };
    const before = await fs.readFile(path.join(dir, "laceframe.json"));
    // Rename first layer to "Haare" to match test expectations
    await editor.getByLabel("Layername 1", { exact: true }).fill("Haare");
    expect(await count()).toBe(0);
    await editor.getByLabel("Pinselgröße", { exact: true }).fill("5");
    await click(150, 100);
    await expect.poll(count).toBeGreaterThan(0);
    await editor.getByRole("button", { name: "Radierer", exact: true }).click();
    await click(150, 100);
    await expect.poll(count).toBe(0);
    await editor
      .getByRole("button", { name: "Rückgängig", exact: true })
      .click();
    await expect.poll(count).toBeGreaterThan(0);
    await editor
      .getByRole("button", { name: "Wiederholen", exact: true })
      .click();
    await expect.poll(count).toBe(0);
    await editor
      .getByRole("button", { name: "Flood Fill", exact: true })
      .click();
    await click(150, 100);
    await expect.poll(count).toBeGreaterThan(10000);
    const hairCount = await count();
    await editor.getByLabel("Gesperrt 1", { exact: true }).check();
    await expect(
      editor.getByLabel("Layername 1", { exact: true }),
    ).toBeDisabled();
    await editor.getByRole("button", { name: "Pinsel", exact: true }).click();
    await click(160, 300);
    expect(await count()).toBe(hairCount);
    await editor.getByLabel("Sichtbar 1", { exact: true }).uncheck();
    await editor.getByLabel("Sichtbar 1", { exact: true }).check();
    await editor.getByLabel("Gesperrt 1", { exact: true }).uncheck();
    // Add second layer "Haut"
    await editor.getByRole("button", { name: "Layer hinzufügen", exact: true }).click();
    await editor.getByLabel("Layername 2", { exact: true }).fill("Haut");
    await editor.getByRole("button", { name: "Haut", exact: true }).click();
    await editor
      .getByRole("button", { name: "Farbauswahl", exact: true })
      .click();
    await click(150, 100);
    await expect(editor.getByRole("alert")).toContainText("Layer überlappen");
    await expect(
      editor.getByRole("button", {
        name: "Layerrevision speichern",
        exact: true,
      }),
    ).toBeDisabled();
    await editor
      .getByRole("button", { name: "Rückgängig", exact: true })
      .click();
    await expect(
      editor.getByRole("button", {
        name: "Layerrevision speichern",
        exact: true,
      }),
    ).toBeEnabled();
    await editor
      .getByRole("button", { name: "Polygon-Lasso", exact: true })
      .click();
    for (const [x, y] of [
      [110, 280],
      [180, 280],
      [180, 330],
      [110, 330],
    ])
      await click(x, y);
    await editor
      .getByRole("button", { name: "Polygon zuweisen", exact: true })
      .click();
    await expect.poll(count).toBeGreaterThan(hairCount);
    const baseline = await count();
    // Add third layer "Kleidung"
    await editor.getByRole("button", { name: "Layer hinzufügen", exact: true }).click();
    await editor.getByLabel("Layername 3", { exact: true }).fill("Kleidung");
    await editor.getByRole("button", { name: "Kleidung", exact: true }).click();
    await editor.getByRole("button", { name: "Pinsel", exact: true }).click();
    await editor.getByLabel("Pinselgröße", { exact: true }).fill("1");
    for (let i = 0; i < 20; i++) await click(110 + i * 3 + 0.5, 500.5);
    await expect.poll(count).toBe(baseline + 20);
    for (let i = 0; i < 20; i++)
      await editor
        .getByRole("button", { name: "Rückgängig", exact: true })
        .click();
    expect(await count()).toBe(baseline);
    for (let i = 0; i < 20; i++)
      await editor
        .getByRole("button", { name: "Wiederholen", exact: true })
        .click();
    expect(await count()).toBe(baseline + 20);
    await editor
      .getByRole("button", { name: "Layer hinzufügen", exact: true })
      .click();
    await editor
      .getByLabel("Layername 4", { exact: true })
      .fill("Bart separat");
    await editor
      .getByLabel("Layerkategorie 4", { exact: true })
      .selectOption("hair");
    await editor
      .getByRole("button", { name: "Layer nach oben 4", exact: true })
      .click();
    await expect(editor.getByLabel("Layername 3", { exact: true })).toHaveValue(
      "Bart separat",
    );
    await editor
      .getByRole("button", { name: "Layer nach unten 3", exact: true })
      .click();
    page.once("dialog", (d) => d.accept());
    await editor
      .getByRole("button", { name: "Layer entfernen 4", exact: true })
      .click();
    await expect(editor.locator(".semantic-row")).toHaveCount(3);
    await editor
      .getByRole("button", { name: "Rückgängig", exact: true })
      .click();
    await expect(editor.locator(".semantic-row")).toHaveCount(4);
    await editor
      .getByRole("button", { name: "Wiederholen", exact: true })
      .click();
    await expect(editor.locator(".semantic-row")).toHaveCount(3);
    await editor
      .getByRole("button", { name: "Haare", exact: true })
      .click();
    await editor
      .getByLabel("Layeransicht", { exact: true })
      .selectOption("original");
    await expect
      .poll(() =>
        canvas().evaluate((c) => [
          ...c.getContext("2d").getImageData(150, 100, 1, 1).data,
        ]),
      )
      .toEqual([80, 60, 50, 255]);
    await editor
      .getByLabel("Layeransicht", { exact: true })
      .selectOption("active");
    await expect
      .poll(() =>
        canvas().evaluate(
          (c) => c.getContext("2d").getImageData(300, 500, 1, 1).data[3],
        ),
      )
      .toBe(0);
    await editor
      .getByLabel("Layeransicht", { exact: true })
      .selectOption("unclassified");
    await expect
      .poll(() =>
        canvas().evaluate(
          (c) => c.getContext("2d").getImageData(150, 100, 1, 1).data[3],
        ),
      )
      .toBe(0);
    await expect
      .poll(() =>
        canvas().evaluate(
          (c) => c.getContext("2d").getImageData(300, 500, 1, 1).data[3],
        ),
      )
      .toBe(255);
    await editor
      .getByLabel("Layeransicht", { exact: true })
      .selectOption("all");
    await editor.getByLabel("Layername 1", { exact: true }).fill("Haupthaar");
    const vp = editor.locator(".pixel-camera-viewport"),
      stage = editor.locator(".pixel-camera-stage");
    const idle = await stage.evaluate((n) => n.style.width);
    await editor
      .getByRole("heading", { name: "Character Layers", exact: true })
      .click();
    await vp.hover();
    await page.mouse.wheel(0, -100);
    expect(await stage.evaluate((n) => n.style.width)).toBe(idle);
    await vp.click({ position: { x: 20, y: 20 } });
    await page.mouse.wheel(0, -100);
    await expect
      .poll(() => stage.evaluate((n) => n.style.width))
      .not.toBe(idle);
    await editor
      .getByRole("button", { name: "Verschieben", exact: true })
      .click();
    const box = await vp.boundingBox(),
      left = await stage.evaluate((n) => n.style.left);
    await page.mouse.move(box.x + 50, box.y + 50);
    await page.mouse.down();
    await page.mouse.move(box.x + 80, box.y + 70);
    await page.mouse.up();
    expect(await stage.evaluate((n) => n.style.left)).not.toBe(left);
    await editor
      .getByRole("button", { name: "Einpassen", exact: true })
      .click();
    for (const [width, height] of [
      [960, 720],
      [1280, 800],
      [1920, 1080],
    ]) {
      await app.evaluate(
        ({ BrowserWindow }, s) =>
          BrowserWindow.getAllWindows()[0].setContentSize(s.width, s.height),
        { width, height },
      );
      await expect(
        editor.getByRole("button", {
          name: "Layerrevision speichern",
          exact: true,
        }),
      ).toBeInViewport();
      await expect
        .poll(() => vp.evaluate((n) => n.clientHeight))
        .toBeGreaterThan(180);
      await page.screenshot({
        path: path.join(screenshots, `layers-${width}.png`),
      });
    }
    expect(await fs.readFile(path.join(dir, "laceframe.json"))).toEqual(before);
    await editor
      .getByRole("button", { name: "Layerrevision speichern", exact: true })
      .click();
    await expect(editor).not.toBeVisible();
    let p = await manifest();
    expect(p.semanticLayerSets).toHaveLength(1);
    const first = p.semanticLayerSets[0];
    expect(first.masterId).toBe(master.id);
    expect(first.layers[0].name).toBe("Haupthaar");
    const firstMasks = await page.evaluate(
      (id) => window.laceframe.semanticLayers(id),
      first.id,
    );
    expect(firstMasks.ok).toBe(true);
    expect(firstMasks.value.layers[0].weights.filter(Boolean).length).toBe(
      hairCount,
    );
    editor = await openLayers();
    await editor
      .getByLabel("Layername 1", { exact: true })
      .fill("Haupthaar Revision 2");
    await editor
      .getByRole("button", { name: "Layerrevision speichern", exact: true })
      .click();
    await expect(editor).not.toBeVisible();
    p = await manifest();
    expect(p.semanticLayerSets).toHaveLength(2);
    expect(p.semanticLayerSets[0]).toEqual(first);
    editor = await openLayers();
    await editor
      .getByLabel("Layerrevision laden", { exact: true })
      .selectOption(first.id);
    await expect(editor.getByLabel("Layername 1", { exact: true })).toHaveValue(
      "Haupthaar",
    );
    page.once("dialog", (d) => d.accept());
    await editor
      .getByRole("button", { name: "Schließen / verwerfen", exact: true })
      .click();
    expect(await fs.readFile(path.join(dir, master.file))).toEqual(masterBytes);
    editor = await openLayers();
    await editor
      .getByLabel("Vorhandene Masterregion", { exact: true })
      .selectOption(`${originalPalette.id}:${originalPalette.regions[0].id}`);
    await editor
      .getByRole("button", {
        name: "Region ausdrücklich übernehmen",
        exact: true,
      })
      .click();
    await expect(editor.locator(".semantic-row")).toHaveCount(8);
    await expect(editor.getByRole("alert")).toContainText("Layer überlappen");
    await editor
      .getByRole("button", { name: "Haupthaar Revision 2", exact: true })
      .click();
    await editor.getByRole("button", { name: "Radierer", exact: true }).click();
    await editor.getByLabel("Pinselgröße", { exact: true }).fill("1");
    await click(150.5, 100.5);
    await expect(
      editor.getByRole("button", {
        name: "Layerrevision speichern",
        exact: true,
      }),
    ).toBeEnabled();
    await editor
      .getByRole("button", { name: "Layerrevision speichern", exact: true })
      .click();
    await expect(editor).not.toBeVisible();
    p = await manifest();
    const template = p.semanticLayerSets.at(-1);
    expect(template.revision).toBe(3);
    expect(template.layers[7].importedFrom).toEqual({
      paletteId: originalPalette.id,
      regionId: originalPalette.regions[0].id,
      maskSha256: originalPalette.regions[0].mask.sha256,
    });
    expect(
      await fs.readFile(path.join(dir, originalPalette.regions[0].mask.file)),
    ).toEqual(paletteBytes);
    const importedMasks = await page.evaluate(
      (id) => window.laceframe.semanticLayers(id),
      template.id,
    );
    expect(importedMasks.value.layers[7].weights.filter(Boolean).length).toBe(
      1,
    );
    expect(importedMasks.value.layers[7].weights[100 * 512 + 150]).toBe(255);
    // A differently sized Expression inherits definitions only; its masks start empty.
    const small = new PNG({ width: 64, height: 80 });
    for (let y = 4; y < 76; y++)
      for (let x = 8; x < 56; x++)
        small.data.set(
          y < 26 ? [80, 60, 50, 255] : [190, 140, 110, 255],
          (y * 64 + x) * 4,
        );
    const expressionFile = path.join(root, "expression.png");
    await fs.writeFile(expressionFile, PNG.sync.write(small));
    await nav(page, "Studio");
    await require("./smoke-ui.cjs").studioMode(page, "expression");
    await require("./smoke-ui.cjs").studioStep(page, "Erzeugen");
    await choose(expressionFile);
    await page
      .getByRole("button", { name: "Ergebnis importieren …", exact: true })
      .click();
    await expect.poll(async () => (await manifest()).assets.length).toBe(1);
    await require("./smoke-ui.cjs").studioStep(page, "Bearbeiten");
    editor = await openLayers();
    await expect(
      editor.getByLabel("Master-Layerrevision als Vorlage", { exact: true }),
    ).toHaveValue(template.id);
    expect(await count()).toBe(0);
    expect(await canvas().evaluate((c) => [c.width, c.height])).toEqual([
      64, 80,
    ]);
    await editor
      .getByRole("button", { name: "Vorhandene Haarregion", exact: true })
      .click();
    await editor
      .getByRole("button", { name: "Flood Fill", exact: true })
      .click();
    await click(20, 10);
    await expect.poll(count).toBeGreaterThan(0);
    for (const [width, height] of [
      [960, 720],
      [1280, 800],
      [1920, 1080],
    ]) {
      await app.evaluate(
        ({ BrowserWindow }, s) =>
          BrowserWindow.getAllWindows()[0].setContentSize(s.width, s.height),
        { width, height },
      );
      await expect(
        editor.getByRole("button", {
          name: "Layerrevision speichern",
          exact: true,
        }),
      ).toBeInViewport();
      await page.screenshot({
        path: path.join(screenshots, `expression-${width}.png`),
      });
    }
    await editor
      .getByRole("button", { name: "Layerrevision speichern", exact: true })
      .click();
    await expect(editor).not.toBeVisible();
    p = await manifest();
    const mapped = p.semanticLayerSets.at(-1);
    expect(mapped.templateSetId).toBe(template.id);
    expect(mapped.sourceId).toBe(p.assets[0].id);
    expect(mapped.masterId).toBe(master.id);
    expect(mapped.layers[7].masterLayerId).toBe(template.layers[7].id);
    expect([mapped.width, mapped.height]).toEqual([64, 80]);
    expect(p.semanticLayerSets[2]).toEqual(template);
    expect(await fs.readFile(path.join(dir, master.file))).toEqual(masterBytes);
    const saved = await manifest();
    await app.close();
    app = await electron.launch({
      executablePath: path.resolve("out/Laceframe-linux-x64/laceframe"),
      args: ["--user-data-dir=" + path.join(root, "user-data")],
      env,
    });
    page = await app.firstWindow();
    page.setDefaultTimeout(15000);
    await choose(dir);
    await page.getByRole("button", { name: /^Projekt öffnen(?: …)?$/ }).click();
    await expect(
      page.getByRole("heading", { name: "Synthetic Pixel", exact: true }),
    ).toBeVisible();
    expect(await manifest()).toEqual(saved);
    expect(
      await page.evaluate(() => ({
        node: typeof window.require,
        filesystem: "readFile" in window.laceframe,
      })),
    ).toEqual({ node: "undefined", filesystem: false });
    expect(errors).toEqual([]);
    console.log(
      "PASS Semantic Layers: real editor tools, conflicts, twenty-step undo/redo, focused zoom/pan, 960/1280/1920 layouts, immutable Master, exact revision masks, color-region provenance, independent Expression masks, historical load and restart. No generation.",
    );
  } catch (error) {
    if (app) {
      const p = await app.firstWindow();
      await p.screenshot({ path: path.join(screenshots, "failure.png") });
      console.error((await p.locator("body").innerText()).slice(-2500));
    }
    throw error;
  } finally {
    if (app) await app.close();
    await fs.rm(root, { recursive: true, force: true });
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
