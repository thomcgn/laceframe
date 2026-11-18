// Focused PX-01 visual/integrity acceptance. Synthetic images; no generation provider.
const { _electron: electron, expect } = require("@playwright/test");
const { PNG } = require("pngjs");
const fs = require("node:fs/promises"),
  path = require("node:path"),
  os = require("node:os");
const { createHash } = require("node:crypto");
const { field, nav, studioStep } = require("./smoke-ui.cjs");
const { reviewImport } = require("./historical-master-fixture.cjs");
(async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "laceframe-pixel-ui-"));
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
  const screenshots = path.resolve("artifacts/px01");
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
    await field(page, "Library Asset", { exact: true }).selectOption(master.id);
    const openSnap = async () => {
      await page
        .getByRole("button", { name: "Pixel Snap öffnen", exact: true })
        .click();
      const editor = page.getByRole("dialog", {
        name: "Pixel Snap",
        exact: true,
      });
      await expect(
        editor.getByLabel("Farbanzahl", { exact: true }),
      ).toBeVisible();
      return editor;
    };
    let editor = await openSnap();
    const before = await fs.readFile(path.join(dir, "laceframe.json"));
    expect(await fs.readFile(path.join(dir, "laceframe.json"))).toEqual(before);
    await editor
      .getByLabel("Motiv und freigestellte Silhouette geprüft", { exact: true })
      .check();
    await editor
      .getByLabel("Automatische Rastervorgabe", { exact: true })
      .uncheck();
    await editor.getByLabel("Rastergröße", { exact: true }).fill("8");
    await editor
      .getByRole("button", { name: "Pixel bereinigen", exact: true })
      .click();
    await expect(
      editor.getByRole("button", { name: "Ergebnis übernehmen", exact: true }),
    ).toBeEnabled();
    await expect(
      editor.getByRole("status").filter({ hasText: /Vorschau bereit/ }),
    ).toContainText("Vorschau bereit");
    await expect(
      editor.getByLabel("Ergebnismaße", { exact: true }),
    ).toContainText("65 × 81 PNG");
    // Actual worker decodes the original engine PNG at its real, smaller dimensions.
    const preview = await editor
      .getByLabel("Pixel-Snap-Vorschau", { exact: true })
      .evaluate((c) => ({
        width: c.width,
        height: c.height,
        pixel: [...c.getContext("2d").getImageData(14, 14, 1, 1).data],
      }));
    expect(preview).toEqual({
      width: 65,
      height: 81,
      pixel: [80, 60, 50, 255],
    });
    const cameras = editor.locator(".pixel-camera");
    const leftCamera = cameras.first(),
      rightCamera = cameras.nth(1);
    const focusViewport = leftCamera.locator(".pixel-camera-viewport");
    const idleZoom = await leftCamera
      .getByLabel("Bildzoom", { exact: true })
      .innerText();
    await focusViewport.hover();
    await page.mouse.wheel(0, -100);
    await expect(leftCamera.getByLabel("Bildzoom", { exact: true })).toHaveText(
      idleZoom,
    );
    await focusViewport.click({ position: { x: 30, y: 30 } });
    await expect(focusViewport).toBeFocused();
    await page.mouse.wheel(0, -100);
    await expect(
      leftCamera.getByLabel("Bildzoom", { exact: true }),
    ).not.toHaveText(idleZoom);
    await rightCamera
      .locator(".pixel-camera-viewport")
      .click({ position: { x: 30, y: 30 } });
    await expect(focusViewport).not.toBeFocused();
    await editor
      .getByRole("heading", { name: "Pixel Snap", exact: true })
      .click();
    await expect(
      rightCamera.locator(".pixel-camera-viewport"),
    ).not.toBeFocused();

    await cameras
      .first()
      .getByRole("button", { name: "800%", exact: true })
      .click();
    await expect(
      cameras.nth(1).getByLabel("Bildzoom", { exact: true }),
    ).not.toHaveText("800%");
    const rightBeforePan = await cameras
      .nth(1)
      .locator(".pixel-camera-stage")
      .evaluate((n) => n.style.left);
    const vp = cameras.first().locator(".pixel-camera-viewport"),
      box = await vp.boundingBox();
    await cameras
      .first()
      .getByRole("button", { name: "Ansicht verschieben", exact: true })
      .click();
    await page.mouse.move(box.x + 60, box.y + 60);
    await page.mouse.down();
    await page.mouse.move(box.x + 90, box.y + 80);
    await page.mouse.up();
    const lefts = await editor
      .locator(".pixel-camera-stage")
      .evaluateAll((nodes) => nodes.map((n) => n.style.left));
    expect(lefts[0]).not.toBe(lefts[1]);
    expect(lefts[1]).toBe(rightBeforePan);
    await cameras
      .first()
      .getByRole("button", { name: "Einpassen", exact: true })
      .click();
    for (const [width, height] of [
      [960, 720],
      [1440, 900],
    ]) {
      await app.evaluate(
        ({ BrowserWindow }, s) =>
          BrowserWindow.getAllWindows()[0].setContentSize(s.width, s.height),
        { width, height },
      );
      await expect
        .poll(async () =>
          editor
            .locator(".pixel-camera-viewport")
            .first()
            .evaluate((n) => n.clientHeight),
        )
        .toBeGreaterThan(200);
      await expect
        .poll(async () =>
          editor
            .locator(".pixel-camera-viewport")
            .first()
            .evaluate(
              (n) =>
                n.querySelector("canvas").getBoundingClientRect().height <=
                n.clientHeight + 1,
            ),
        )
        .toBe(true);
      await page.screenshot({
        path: path.join(screenshots, `snap-${width}.png`),
      });
      await expect(
        editor.getByRole("button", {
          name: "Ergebnis übernehmen",
          exact: true,
        }),
      ).toBeInViewport();
    }
    // Discard a computed draft: no manifest/assets adopted.
    page.once("dialog", (d) => d.accept());
    await editor
      .getByRole("button", { name: "Verwerfen", exact: true })
      .click();
    expect(await fs.readFile(path.join(dir, "laceframe.json"))).toEqual(before);
    editor = await openSnap();
    await editor
      .getByLabel("Motiv und freigestellte Silhouette geprüft", { exact: true })
      .check();
    await editor
      .getByLabel("Automatische Rastervorgabe", { exact: true })
      .uncheck();
    await editor.getByLabel("Rastergröße", { exact: true }).fill("8");
    await editor
      .getByRole("button", { name: "Pixel bereinigen", exact: true })
      .click();
    await expect(
      editor.getByRole("button", { name: "Ergebnis übernehmen", exact: true }),
    ).toBeEnabled();
    await editor
      .getByRole("button", { name: "Ergebnis übernehmen", exact: true })
      .click();
    await expect(editor).not.toBeVisible();
    await expect
      .poll(async () => (await manifest()).qualityAssets.length)
      .toBe(1);
    let p = await manifest();
    const snap = p.qualityAssets[0];
    expect(snap.status).toBe("candidate");
    expect(p.masters).toHaveLength(1);
    expect(snap.sourceId).toBe(master.id);
    const snapBytes = await fs.readFile(path.join(dir, snap.file));
    expect(PNG.sync.read(snapBytes).width).toBe(65);
    expect(PNG.sync.read(snapBytes).height).toBe(81);
    expect(snap.pixelEdit.algorithm).toBe("spritefusion-original-wasm-v1");
    expect(snap.pixelEdit.pixelSha256).toBe(
      createHash("sha256").update(PNG.sync.read(snapBytes).data).digest("hex"),
    );
    await page
      .getByRole("button", { name: "Color Correction öffnen", exact: true })
      .click();
    const color = page.getByRole("dialog", {
      name: "Color Correction",
      exact: true,
    });
    await color
      .getByRole("button", { name: "Auswahl nach Farbe", exact: true })
      .click();
    const region = page.getByRole("dialog", {
      name: "Auswahl nach Farbe",
      exact: true,
    });
    await expect(page.locator(".editor-workspace-screen:visible")).toHaveCount(
      1,
    );
    await region
      .getByRole("button", { name: "Bildfarbe #503c32", exact: true })
      .click();
    await region
      .getByRole("button", { name: "Zur Region hinzufügen", exact: true })
      .click();
    await region
      .getByRole("button", { name: "Bildfarbe #be8c6e", exact: true })
      .click();
    await region
      .getByRole("button", { name: "Zur Region hinzufügen", exact: true })
      .click();
    await expect(
      region.getByRole("button", { name: /Regionsfarbe #be8c6e/ }),
    ).toBeVisible();
    await region
      .getByRole("button", { name: "Von Region entfernen", exact: true })
      .click();
    await expect(
      region.getByRole("button", { name: /Regionsfarbe #be8c6e/ }),
    ).toHaveCount(0);
    await region
      .getByRole("button", { name: "Region speichern", exact: true })
      .click();
    await expect(
      color.getByLabel("Aufgenommene Farbe", { exact: true }),
    ).toHaveValue("#503c32");
    await expect(color).toBeVisible();
    await color.getByLabel("Zielfarbe", { exact: true }).fill("#785050");
    await color
      .getByRole("button", { name: "Farbvorschau berechnen", exact: true })
      .click();
    await expect(
      color.getByRole("button", { name: "Ergebnis übernehmen", exact: true }),
    ).toBeEnabled();
    await page.screenshot({ path: path.join(screenshots, "color-1440.png") });
    await color
      .getByRole("button", { name: "Rückgängig", exact: true })
      .click();
    await expect(
      color.getByRole("button", { name: "Ergebnis übernehmen", exact: true }),
    ).toBeDisabled();
    await color
      .getByRole("button", { name: "Wiederholen", exact: true })
      .click();
    await color
      .getByRole("button", { name: "Farbvorschau berechnen", exact: true })
      .click();
    await expect(
      color.getByRole("button", { name: "Ergebnis übernehmen", exact: true }),
    ).toBeEnabled();
    await color
      .getByRole("button", { name: "Ergebnis übernehmen", exact: true })
      .click();
    await expect(color).not.toBeVisible();
    await expect
      .poll(async () => (await manifest()).qualityAssets.length)
      .toBe(2);
    p = await manifest();
    const corrected = p.qualityAssets[1];
    expect(corrected.sourceId).toBe(snap.id);
    expect(corrected.status).toBe("candidate");
    expect(p.masters).toHaveLength(1);
    const correctedBytes = await fs.readFile(path.join(dir, corrected.file)),
      decoded = PNG.sync.read(correctedBytes),
      clean = PNG.sync.read(snapBytes);
    expect(decoded.width).toBe(clean.width);
    expect(decoded.height).toBe(clean.height);
    const selection = PNG.sync.read(
      await fs.readFile(path.join(dir, corrected.pixelEdit.edit.mask.file)),
    );
    let alphaMismatch = 0,
      outsideMismatch = 0;
    for (let i = 0; i < clean.width * clean.height; i++) {
      if (decoded.data[i * 4 + 3] !== clean.data[i * 4 + 3]) alphaMismatch++;
      if (!selection.data[i * 4])
        for (let c = 0; c < 4; c++)
          if (decoded.data[i * 4 + c] !== clean.data[i * 4 + c])
            outsideMismatch++;
    }
    expect(alphaMismatch).toBe(0);
    expect(outsideMismatch).toBe(0);
    await field(page, "Qualitätsnotiz", { exact: true }).fill(
      "Synthetic pixel and color review",
    );
    await page
      .getByLabel(
        "Identität, Outfit, Konturen, Raster, Stil und Alpha-Kanten visuell geprüft",
        { exact: true },
      )
      .check();
    page.once("dialog", (d) => d.accept());
    await page
      .getByRole("button", { name: "Qualitätsversion freigeben", exact: true })
      .click();
    await expect.poll(async () => (await manifest()).masters.length).toBe(2);
    const exportDir = path.join(root, "export");
    await fs.mkdir(exportDir);
    await choose(exportDir);
    await page
      .getByRole("button", {
        name: "Transparentes PNG exportieren",
        exact: true,
      })
      .click();
    await expect
      .poll(
        async () =>
          (await fs.readdir(exportDir)).filter((f) => f.endsWith(".png"))
            .length,
      )
      .toBe(1);
    const exported = (await fs.readdir(exportDir)).find((f) =>
      f.endsWith(".png"),
    );
    expect(await fs.readFile(path.join(exportDir, exported))).toEqual(
      correctedBytes,
    );
    // Existing manual Expression pipeline uses the same editor, keeps its Master binding.
    await nav(page, "Studio");
    await page
      .getByRole("button", { name: "Expression erstellen", exact: true })
      .click();
    await studioStep(page, "Erzeugen");
    await choose(file);
    await page
      .getByRole("button", { name: "Ergebnis importieren …", exact: true })
      .click();
    await expect.poll(async () => (await manifest()).assets.length).toBe(1);
    await studioStep(page, "Bearbeiten");
    await expect(
      page.locator(".studio-editor:visible .create-result > .master-compare"),
    ).toBeVisible();
    editor = await openSnap();
    await editor
      .getByLabel("Motiv und freigestellte Silhouette geprüft", { exact: true })
      .check();
    await editor
      .getByLabel("Automatische Rastervorgabe", { exact: true })
      .uncheck();
    await editor.getByLabel("Rastergröße", { exact: true }).fill("8");
    await editor
      .getByRole("button", { name: "Pixel bereinigen", exact: true })
      .click();
    await expect(
      editor.getByRole("button", { name: "Ergebnis übernehmen", exact: true }),
    ).toBeEnabled();
    await editor
      .getByRole("button", { name: "Ergebnis übernehmen", exact: true })
      .click();
    await expect
      .poll(async () => (await manifest()).qualityAssets.length)
      .toBe(3);
    p = await manifest();
    expect(p.assets[0].status).toBe("candidate");
    expect(p.assets[0].masterId).toBe(p.masters[1].id);
    expect(p.qualityAssets[2].sourceId).toBe(p.assets[0].id);
    await studioStep(page, "Freigeben");
    await field(page, "Qualitätsnotiz", { exact: true }).fill(
      "Synthetic expression checked",
    );
    await page
      .getByLabel(
        "Identität, Outfit, Konturen, Raster, Stil und Alpha-Kanten visuell geprüft",
        { exact: true },
      )
      .check();
    page.once("dialog", (d) => d.accept());
    await page
      .getByRole("button", { name: "Qualitätsversion freigeben", exact: true })
      .click();
    await expect.poll(async () => (await manifest()).assets.length).toBe(2);
    expect(await fs.readFile(path.join(dir, master.file))).toEqual(masterBytes);
    expect((await manifest()).assets[1].masterId).toBe(p.masters[1].id);
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
        fs: "readFile" in window.laceframe,
      })),
    ).toEqual({ node: "undefined", fs: false });
    expect(errors).toEqual([]);
    const license = await fs.readFile(
      "out/Laceframe-linux-x64/resources/SpriteFusion-Pixel-Snapper-MIT.txt",
      "utf8",
    );
    expect(license).toContain("Copyright (c) 2025 Hugo Duprez");
    console.log(
      "PASS Sprite Fusion: original Rust WASM worker, discard without writes, actual resized PNG preview/import, independent cameras, regional Color Correction and undo/redo, explicit Master/Expression approval, exact PNG export, restart, immutable original, sandboxed preload and shipped MIT notice. No live generation.",
    );
  } catch (e) {
    if (app) {
      const p = await app.firstWindow();
      await p.screenshot({ path: path.join(screenshots, "failure.png") });
      console.error((await p.locator("body").innerText()).slice(-2500));
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
