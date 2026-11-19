// Focused Electron regression: real UI navigation to Semantic Layer Editor
// and view-mode behavior with a 1254x1254 source fixture. Synthetic PNG only.
const { _electron: electron, expect } = require("@playwright/test");
const { PNG } = require("pngjs");
const fs = require("node:fs/promises"),
  path = require("node:path"),
  os = require("node:os");
const { field, nav } = require("./smoke-ui.cjs");
const { reviewImport } = require("./historical-master-fixture.cjs");

(async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "laceframe-real-"));
  const dir = path.join(root, "project");
  await fs.mkdir(dir);

  // 1254x1254 fixture: transparent border, colored quadrants in center
  const width = 1254,
    height = 1254;
  const png = new PNG({ width, height });
  for (let i = 0; i < width * height * 4; i += 4) {
    png.data[i] = 0;
    png.data[i + 1] = 0;
    png.data[i + 2] = 0;
    png.data[i + 3] = 0;
  }
  const cx = Math.floor(width / 2),
    cy = Math.floor(height / 2);
  for (let y = cy - 50; y < cy + 50; y++) {
    for (let x = cx - 50; x < cx + 50; x++) {
      const i = (y * width + x) * 4;
      if (y < cy) {
        if (x < cx) png.data.set([255, 0, 0, 255], i); // red
        else png.data.set([0, 255, 0, 255], i); // green
      } else {
        if (x < cx) png.data.set([0, 0, 255, 255], i); // blue
        else png.data.set([255, 255, 255, 255], i); // white
      }
    }
  }
  const bytes = PNG.sync.write(png),
    file = path.join(root, "master.png");
  await fs.writeFile(file, bytes);
  const screenshots = path.resolve("artifacts/real-canvas-rendering");
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
    page.setDefaultTimeout(30000);
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
    await field(page, "Projektname", { exact: true }).fill("Real Canvas");
    await page
      .getByRole("button", { name: "Projekt erstellen …", exact: true })
      .click();
    await field(page, "Neue Figur", { exact: true }).fill("Real Fixture");
    await page
      .getByRole("button", { name: "Figur erstellen", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Real Fixture", exact: true }),
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
    await expect(
      editor.getByLabel("Layername 1", { exact: true }),
    ).toBeVisible();
    const canvas = () =>
      editor.getByLabel("Semantische Layer Bildfläche", { exact: true });
    const vp = () => editor.locator(".pixel-camera-viewport");

    // --- Canvas geometry checks ---
    const canvasBox = await canvas().boundingBox();
    const vpBox = await vp().boundingBox();
    if (!canvasBox || !vpBox)
      throw new Error("Missing bounding boxes");
    if (canvasBox.width <= 0 || canvasBox.height <= 0)
      throw new Error(`Canvas zero-size: ${canvasBox.width}x${canvasBox.height}`);
    if (vpBox.width <= 0 || vpBox.height <= 0)
      throw new Error(`Viewport zero-size: ${vpBox.width}x${vpBox.height}`);
    const intersects =
      canvasBox.x < vpBox.x + vpBox.width &&
      canvasBox.x + canvasBox.width > vpBox.x &&
      canvasBox.y < vpBox.y + vpBox.height &&
      canvasBox.y + canvasBox.height > vpBox.y;
    if (!intersects) throw new Error("Canvas does not intersect viewport");

    const native = await canvas().evaluate((c) => ({
      width: c.width,
      height: c.height,
    }));
    if (native.width !== width || native.height !== height)
      throw new Error(
        `Canvas bitmap ${native.width}x${native.height} != ${width}x${height}`,
      );

    // --- 1. Default "all" view: source pixels visible at center ---
    const allViewPixel = await canvas().evaluate(
      (c, { cx, cy }) =>
        [...c.getContext("2d").getImageData(cx, cy, 1, 1).data],
      { cx, cy },
    );
    if (allViewPixel[3] === 0)
      throw new Error(
        `Default "all" view center pixel transparent: [${allViewPixel}]`,
      );

    // --- 2. "active" view with zero-weight active layer: ALL pixels transparent ---
    await editor
      .getByLabel("Layeransicht", { exact: true })
      .selectOption("active");
    const activeViewPixel = await canvas().evaluate(
      (c, { cx, cy }) =>
        [...c.getContext("2d").getImageData(cx, cy, 1, 1).data],
      { cx, cy },
    );
    if (activeViewPixel[3] !== 0)
      throw new Error(
        `"active" view center pixel not transparent (expected alpha=0 for zero-weight active layer): [${activeViewPixel}]`,
      );
    // Verify a non-center pixel is also transparent (entire canvas empty)
    const offCenterPixel = await canvas().evaluate(
      (c) => [...c.getContext("2d").getImageData(10, 10, 1, 1).data],
    );
    if (offCenterPixel[3] !== 0)
      throw new Error(
        `"active" view off-center pixel not transparent: [${offCenterPixel}]`,
      );

    // --- 3. "original" view: source pixels restored ---
    await editor
      .getByLabel("Layeransicht", { exact: true })
      .selectOption("original");
    const originalViewPixel = await canvas().evaluate(
      (c, { cx, cy }) =>
        [...c.getContext("2d").getImageData(cx, cy, 1, 1).data],
      { cx, cy },
    );
    if (originalViewPixel[3] === 0)
      throw new Error(
        `"original" view center pixel transparent: [${originalViewPixel}]`,
      );

    // --- 4. Switch back to "all": source pixels restored ---
    await editor
      .getByLabel("Layeransicht", { exact: true })
      .selectOption("all");
    const restoredAllPixel = await canvas().evaluate(
      (c, { cx, cy }) =>
        [...c.getContext("2d").getImageData(cx, cy, 1, 1).data],
      { cx, cy },
    );
    if (restoredAllPixel[3] === 0)
      throw new Error(
        `Restored "all" view center pixel transparent: [${restoredAllPixel}]`,
      );

    // --- 5. Zoom and pan preserve visibility ---
    const stage = () => editor.locator(".pixel-camera-stage");
    const beforeZoom = await stage().evaluate((n) => n.style.width);
    await vp().click();
    await page.mouse.wheel(0, -100);
    const afterZoom = await stage().evaluate((n) => n.style.width);
    if (afterZoom === beforeZoom)
      throw new Error("Zoom did not change stage scale");
    const afterZoomPixel = await canvas().evaluate(
      (c, { cx, cy }) =>
        [...c.getContext("2d").getImageData(cx, cy, 1, 1).data],
      { cx, cy },
    );
    if (afterZoomPixel[3] === 0)
      throw new Error("After zoom, center pixel transparent");

    // Pan
    const box = await vp().boundingBox();
    if (!box) throw new Error("Viewport box null for pan");
    await page.mouse.move(box.x + 10, box.y + 10);
    await page.mouse.down();
    await page.mouse.move(box.x + 60, box.y + 60);
    await page.mouse.up();
    const afterPanPixel = await canvas().evaluate(
      (c, { cx, cy }) =>
        [...c.getContext("2d").getImageData(cx, cy, 1, 1).data],
      { cx, cy },
    );
    if (afterPanPixel[3] === 0)
      throw new Error("After pan, center pixel transparent");

    // --- 7. Not obscured ---
    const point = await canvas().evaluate((c, { cx, cy }) => {
      const rect = c.getBoundingClientRect();
      // Use center of canvas bitmap, mapped to client coords
      const scaleX = rect.width / c.width;
      const scaleY = rect.height / c.height;
      return {
        x: rect.left + cx * scaleX,
        y: rect.top + cy * scaleY,
      };
    }, { cx, cy });
    const topAtPoint = await page.evaluate(
      ({ x, y }) => document.elementFromPoint(x, y)?.tagName,
      point,
    );
    if (topAtPoint !== "CANVAS")
      throw new Error(`Canvas obscured; top element: <${topAtPoint}>`);

    await page.screenshot({ path: path.join(screenshots, "real-canvas.png") });
    expect(errors).toEqual([]);
    console.log(
      "PASS Real Semantic Canvas: default 'all' view shows source pixels, 'active' view with zero-weight layer correctly hides all pixels (intentional UX), 'original'/'all' restore pixels, zoom/pan preserve visibility, canvas unobscured.",
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
