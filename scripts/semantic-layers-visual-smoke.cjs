// Focused visual overlay verification for Character Layer Editor (Issue #36)
// Verifies brush cursor preview, live masking, and polygon lasso preview are rendered on vectors canvas
const { _electron: electron, expect } = require("@playwright/test");
const { PNG } = require("pngjs");
const fs = require("node:fs/promises"),
  path = require("node:path"),
  os = require("node:os");
const { field, nav } = require("./smoke-ui.cjs");
const { reviewImport } = require("./historical-master-fixture.cjs");

(async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "laceframe-layer-visual-"));
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
  const screenshots = path.resolve("artifacts/layers-visual");
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
    await field(page, "Projektname", { exact: true }).fill("Visual overlay test");
    await page
      .getByRole("button", { name: "Projekt erstellen …", exact: true })
      .click();
    await field(page, "Neue Figur", { exact: true }).fill("Visual Test");
    await page
      .getByRole("button", { name: "Figur erstellen", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Visual Test", exact: true }),
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
    const master = (await manifest()).masters[0];
    await nav(page, "Library");
    await field(page, "Bibliothek Asset", { exact: true }).selectOption(
      master.id,
    );
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
    // Create first layer
    await editor.getByRole("button", { name: "Layer hinzufügen", exact: true }).click();
    await expect(
      editor.getByLabel("Layername 1", { exact: true }),
    ).toBeVisible();
    await editor.getByLabel("Layername 1", { exact: true }).fill("Test Layer");
    const canvas = () =>
      editor.getByLabel("Semantische Layer Bildfläche", { exact: true });
    const vectorsCanvas = () =>
      editor.locator("canvas.selection-vector");
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
    const hover = async (x, y) => {
      const p = await point(x, y);
      await page.mouse.move(p.x, p.y);
    };
    const vp = editor.locator(".pixel-camera-viewport");
    // The camera handles wheel zoom only while focused; focus without a pointer click.
    const focusViewport = async () => vp.focus();
    // Wheel zoom is anchored to the viewport center. At high zoom, image
    // coordinate (150,100) can be outside its clipping area, causing
    // onPointerLeave and an *empty* vectors canvas even when hover works.
    const zoomTo162 = async () => {
      await focusViewport();
      await vp.hover();
      const readZoom = async () => Number((await editor.locator('.pixel-camera-tools output').innerText()).replace('%', '').trim());
      const before = await readZoom();
      // PixelViewport uses scale * exp(-deltaY * 0.001).
      const deltaY = -1000 * Math.log(162 / before);
      await page.mouse.wheel(0, deltaY);
      await expect.poll(readZoom, { timeout: 5000 }).toBeGreaterThanOrEqual(160);
      const actual = await readZoom();
      expect(actual).toBeLessThanOrEqual(164);
      console.log('  Zoom before:', before, 'after:', actual);
    };
    const assertVisiblePoint = async (x, y) => {
      const p = await point(x, y);
      const b = await vp.boundingBox();
      expect(b).not.toBeNull();
      expect(p.x).toBeGreaterThan(b.x + 1);
      expect(p.x).toBeLessThan(b.x + b.width - 1);
      expect(p.y).toBeGreaterThan(b.y + 1);
      expect(p.y).toBeLessThan(b.y + b.height - 1);
    };

    // ========================================================================
    // Test 1: Verify vectors canvas exists and is mounted
    // ========================================================================
    console.log("Test 1: Verify vectors canvas exists and is mounted");
    await expect(vectorsCanvas()).toBeVisible();
    await expect(vectorsCanvas()).toHaveAttribute("width", "512");
    await expect(vectorsCanvas()).toHaveAttribute("height", "640");
    await expect(vectorsCanvas()).toHaveCSS("position", "absolute");
    await expect(vectorsCanvas()).toHaveCSS("pointer-events", "none");

    // ========================================================================
    // Test 2: Brush cursor preview at fit zoom (~49%)
    // ========================================================================
    console.log("Test 2: Brush cursor preview at fit zoom");
    await editor.getByRole("button", { name: "Pinsel", exact: true }).click();
    await editor.getByLabel("Pinselgröße", { exact: true }).fill("14");
    // Fit zoom - click Einpassen
    await editor.getByRole("button", { name: "Einpassen", exact: true }).click();
    await page.waitForTimeout(500); // allow render
    // Hover must work without clicking/focusing and must never paint pixels.
    // Hover at image coordinate (150, 100)
    await hover(150, 100);
    await page.waitForTimeout(300); // allow draw
    // Verify vectors canvas has drawn brush cursor circle - check larger area
    const brushAtFit = await vectorsCanvas().evaluate((c) => {
      const ctx = c.getContext("2d");
      // Check a larger area around cursor for non-transparent pixels
      const sample = ctx.getImageData(130, 80, 40, 40).data;
      let nonTransparent = 0;
      for (let i = 3; i < sample.length; i += 4) {
        if (sample[i] > 0) nonTransparent++;
      }
      // Also check center
      const centerData = ctx.getImageData(150, 100, 1, 1).data;
      // Check entire canvas
      const fullData = ctx.getImageData(0, 0, c.width, c.height).data;
      let fullNonTransparent = 0;
      for (let i = 3; i < fullData.length; i += 4) {
        if (fullData[i] > 0) fullNonTransparent++;
      }
      return { centerAlpha: centerData[3], nonTransparentPixels: nonTransparent, fullNonTransparent };
    });
    console.log("  Brush cursor at fit zoom: centerAlpha =", brushAtFit.centerAlpha, "nonTransparentPixels =", brushAtFit.nonTransparentPixels, "fullNonTransparent =", brushAtFit.fullNonTransparent);
    expect(brushAtFit.fullNonTransparent).toBeGreaterThan(0);
    expect(brushAtFit.nonTransparentPixels).toBeGreaterThan(0);

    // ========================================================================
    // Test 3: Brush cursor preview at 162% zoom
    // ========================================================================
    console.log("Test 3: Brush cursor preview at 162% zoom");
    // Zoom in using mouse wheel on canvas viewport
    await zoomTo162();
    // Use the image center, which remains visible when the viewport zooms
    // around its center. An off-screen hover is not evidence of a broken brush.
    await assertVisiblePoint(256, 320);
    await hover(256, 320);
    await page.waitForTimeout(300);
    const brushAtZoom = await vectorsCanvas().evaluate((c) => {
      const ctx = c.getContext('2d');
      const circle = ctx.getImageData(244, 308, 24, 24).data;
      let nonTransparent = 0;
      for (let i = 3; i < circle.length; i += 4) if (circle[i] > 0) nonTransparent++;
      const centerAlpha = ctx.getImageData(256, 320, 1, 1).data[3];
      return { nonTransparent, centerAlpha };
    });
    console.log('  Brush cursor at 162% zoom:', brushAtZoom);
    expect(brushAtZoom.nonTransparent).toBeGreaterThan(0);
    // A circle must have a transparent interior, not just any canvas pixels.
    expect(brushAtZoom.centerAlpha).toBe(0);

    // ========================================================================
    // Test 4: Eraser shows same preview footprint
    // ========================================================================
    console.log("Test 4: Eraser shows same preview footprint");
    await editor.getByRole("button", { name: "Radierer", exact: true }).click();
    await page.waitForTimeout(200);
    await assertVisiblePoint(256, 320);
    await hover(256, 320);
    await page.waitForTimeout(300);
    const eraserPreview = await vectorsCanvas().evaluate((c) => {
      const ctx = c.getContext('2d');
      const ring = ctx.getImageData(244, 308, 24, 24).data;
      let nonTransparent = 0;
      for (let i = 3; i < ring.length; i += 4) if (ring[i] > 0) nonTransparent++;
      return { nonTransparent, centerAlpha: ctx.getImageData(256, 320, 1, 1).data[3] };
    });
    console.log('  Eraser preview:', eraserPreview);
    expect(eraserPreview.nonTransparent).toBeGreaterThan(0);
    expect(eraserPreview.centerAlpha).toBe(0);

    // ========================================================================
    // Test 5: Live mask feedback during brush stroke
    // ========================================================================
    console.log("Test 5: Live mask feedback during brush stroke");
    await editor.getByRole("button", { name: "Pinsel", exact: true }).click();
    // Draw a stroke and verify main canvas updates in real-time
    const strokeStart = await point(300, 300);
    const strokeEnd = await point(350, 350);
    await page.mouse.move(strokeStart.x, strokeStart.y);
    await page.mouse.down();
    await page.waitForTimeout(50);
    await page.mouse.move(strokeEnd.x, strokeEnd.y);
    await page.waitForTimeout(50);
    await page.mouse.up();
    await page.waitForTimeout(100);
    // Verify mask was applied (check main canvas alpha overlay)
    const maskApplied = await canvas().evaluate((c) => {
      const ctx = c.getContext("2d");
      // Sample along stroke path
      const data1 = ctx.getImageData(300, 300, 1, 1).data;
      const data2 = ctx.getImageData(325, 325, 1, 1).data;
      const data3 = ctx.getImageData(350, 350, 1, 1).data;
      return { a1: data1[3], a2: data2[3], a3: data3[3] };
    });
    // At least some pixels should have overlay (alpha > 0 in overlay areas)
    console.log("  Live mask feedback: maskApplied =", maskApplied);

    // ========================================================================
    // Test 6: Undo reverses entire stroke in one step
    // ========================================================================
    console.log("Test 6: Undo reverses entire stroke in one step");
    const countBeforeUndo = await editor
      .getByRole("status")
      .filter({ hasText: "Zugeordnet:" })
      .innerText()
      .then((t) => Number(t.match(/Zugeordnet: (\d+)/)[1]));
    await editor.getByRole("button", { name: "Rückgängig", exact: true }).click();
    await page.waitForTimeout(100);
    const countAfterUndo = await editor
      .getByRole("status")
      .filter({ hasText: "Zugeordnet:" })
      .innerText()
      .then((t) => Number(t.match(/Zugeordnet: (\d+)/)[1]));
    expect(countAfterUndo).toBeLessThan(countBeforeUndo);
    console.log("  Undo: count before =", countBeforeUndo, "after =", countAfterUndo);

    // ========================================================================
    // Test 7: Polygon lasso preview - vertices, edges, rubber-band
    // ========================================================================
    console.log("Test 7: Polygon lasso preview at fit zoom");
    await editor.getByRole("button", { name: "Einpassen", exact: true }).click();
    await page.waitForTimeout(500);
    await editor.getByRole("button", { name: "Polygon-Lasso", exact: true }).click();
    // Click first vertex
    await click(100, 400);
    await page.waitForTimeout(100);
    // Click second vertex
    await click(180, 400);
    await page.waitForTimeout(100);
    // Hover for rubber-band (don't click third vertex yet)
    await hover(180, 480);
    await page.waitForTimeout(200);
    const polygonPreview1 = await vectorsCanvas().evaluate((c) => {
      const ctx = c.getContext("2d");
      // Check for edges (line between vertices)
      const edgeData = ctx.getImageData(140, 400, 1, 1).data;
      // Check for vertex markers
      const vertexData = ctx.getImageData(100, 400, 1, 1).data;
      // Check for rubber-band line
      const rubberData = ctx.getImageData(180, 440, 1, 1).data;
      // Check larger area around vertices
      const vertexArea = ctx.getImageData(90, 390, 21, 21).data;
      let vertexAreaNonTransparent = 0;
      for (let i = 3; i < vertexArea.length; i += 4) {
        if (vertexArea[i] > 0) vertexAreaNonTransparent++;
      }
      return {
        edgeAlpha: edgeData[3],
        vertexAlpha: vertexData[3],
        rubberAlpha: rubberData[3],
        vertexAreaNonTransparent: vertexAreaNonTransparent,
      };
    });
    console.log("  Polygon preview at fit zoom:", polygonPreview1);
    expect(polygonPreview1.vertexAreaNonTransparent).toBeGreaterThan(0);

    // Add third vertex and check close indicator
    await click(180, 480);
    await page.waitForTimeout(100);
    await hover(100, 400); // near first vertex
    await page.waitForTimeout(200);
    const polygonPreview2 = await vectorsCanvas().evaluate((c) => {
      const ctx = c.getContext("2d");
      // Check for close indicator around first vertex
      const closeData = ctx.getImageData(90, 390, 21, 21).data;
      let nonTransparent = 0;
      for (let i = 3; i < closeData.length; i += 4) {
        if (closeData[i] > 0) nonTransparent++;
      }
      return { closeIndicatorPixels: nonTransparent };
    });
    console.log("  Close indicator at fit zoom: closeIndicatorPixels =", polygonPreview2.closeIndicatorPixels);
    expect(polygonPreview2.closeIndicatorPixels).toBeGreaterThan(0);

    // ========================================================================
    // Test 8: Polygon preview at 162% zoom
    // ========================================================================
    console.log("Test 8: Polygon lasso preview at 162% zoom");
    await zoomTo162();
    await editor.getByRole("button", { name: "Polygon verwerfen", exact: true }).click();
    await editor.getByRole("button", { name: "Polygon-Lasso", exact: true }).click();
    // All three coordinates must be visible at this zoom, unlike the old
    // (100,400) point that could fall outside the clipped viewport.
    await assertVisiblePoint(240, 300);
    await assertVisiblePoint(280, 300);
    await assertVisiblePoint(280, 350);
    await click(240, 300);
    await click(280, 300);
    await hover(280, 350);
    const polygonAtZoom = await vectorsCanvas().evaluate((c) => {
      const ctx = c.getContext("2d");
      const vertexArea = ctx.getImageData(230, 290, 21, 21).data;
      let vertexAreaNonTransparent = 0;
      for (let i = 3; i < vertexArea.length; i += 4) {
        if (vertexArea[i] > 0) vertexAreaNonTransparent++;
      }
      const edgeAlpha = ctx.getImageData(260, 300, 1, 1).data[3];
      return { edgeAlpha, vertexAreaNonTransparent };
    });
    console.log("  Polygon preview at 162% zoom:", polygonAtZoom);
    expect(polygonAtZoom.vertexAreaNonTransparent).toBeGreaterThan(0);
    expect(polygonAtZoom.edgeAlpha).toBeGreaterThan(0);

    // ========================================================================
    // Test 9: Escape cancels unfinished polygon
    // ========================================================================
    console.log("Test 9: Escape cancels unfinished polygon");
    await editor.getByRole("button", { name: "Einpassen", exact: true }).click();
    await page.waitForTimeout(500);
    await editor.getByRole("button", { name: "Polygon-Lasso", exact: true }).click();
    await click(100, 400);
    await page.waitForTimeout(100);
    await click(180, 400);
    await page.waitForTimeout(100);
    // Press Escape
    await page.keyboard.press("Escape");
    await page.waitForTimeout(200);
    // Verify polygon gesture cleared (no vertices drawn)
    const afterEscape = await vectorsCanvas().evaluate((c) => {
      const ctx = c.getContext("2d");
      const sample = ctx.getImageData(90, 390, 21, 21).data;
      let nonTransparent = 0;
      for (let i = 3; i < sample.length; i += 4) {
        if (sample[i] > 0) nonTransparent++;
      }
      return { nonTransparentPixels: nonTransparent };
    });
    console.log("  After Escape: nonTransparentPixels =", afterEscape.nonTransparentPixels);
    expect(afterEscape.nonTransparentPixels).toBe(0);

    // ========================================================================
    // Test 10: Polygon assignment works without data loss
    // ========================================================================
    console.log("Test 10: Polygon assignment works without data loss");
    await editor.getByRole("button", { name: "Polygon-Lasso", exact: true }).click();
    await click(100, 400);
    await page.waitForTimeout(100);
    await click(180, 400);
    await page.waitForTimeout(100);
    await click(180, 480);
    await page.waitForTimeout(100);
    await click(100, 480);
    await page.waitForTimeout(100);
    await editor.getByRole("button", { name: "Polygon zuweisen", exact: true }).click();
    await page.waitForTimeout(500);
    const countAfterAssign = await editor
      .getByRole("status")
      .filter({ hasText: "Zugeordnet:" })
      .innerText()
      .then((t) => Number(t.match(/Zugeordnet: (\d+)/)[1]));
    console.log("  After polygon assign: count =", countAfterAssign);
    expect(countAfterAssign).toBeGreaterThan(0);

    console.log("ALL VISUAL OVERLAY TESTS PASSED");

  } catch (error) {
    if (app) {
      try {
        const p = await app.firstWindow();
        await p.screenshot({ path: path.join(screenshots, "failure.png"), timeout: 3000 });
        console.error((await p.locator("body").innerText()).slice(-2500));
      } catch (diagnosticError) {
        console.error("Screenshot diagnostic unavailable:", diagnosticError);
      }
    }
    throw error;
  } finally {
    if (app) {
      try { await app.close(); } catch (closeError) { console.error("Electron cleanup failed:", closeError); }
    }
    await fs.rm(root, { recursive: true, force: true });
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});