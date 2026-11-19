// Focused canvas pixel regression: Semantic Layer Editor displays visible source-image pixels.
// Synthetic PNG fixture; no generation provider.
const { _electron: electron, expect } = require("@playwright/test");
const { PNG } = require("pngjs");
const fs = require("node:fs/promises"),
  path = require("node:path"),
  os = require("node:os");
const { field, nav } = require("./smoke-ui.cjs");
const { reviewImport } = require("./historical-master-fixture.cjs");

(async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "laceframe-canvas-"));
  const dir = path.join(root, "project");
  await fs.mkdir(dir);

  // 1254x1254 fixture: transparent border, inner area with known non-transparent pixels
  const width = 1254,
    height = 1254;
  const png = new PNG({ width, height });
  // Fill all transparent first
  for (let i = 0; i < width * height * 4; i += 4) {
    png.data[i] = 0;
    png.data[i + 1] = 0;
    png.data[i + 2] = 0;
    png.data[i + 3] = 0;
  }
  // Place four distinct colored quadrants in the inner area
  const cx = Math.floor(width / 2),
    cy = Math.floor(height / 2);
  for (let y = cy - 50; y < cy + 50; y++) {
    for (let x = cx - 50; x < cx + 50; x++) {
      const i = (y * width + x) * 4;
      if (y < cy) {
        if (x < cx) png.data.set([255, 0, 0, 255], i); // top-left: red
        else png.data.set([0, 255, 0, 255], i); // top-right: green
      } else {
        if (x < cx) png.data.set([0, 0, 255, 255], i); // bottom-left: blue
        else png.data.set([255, 255, 255, 255], i); // bottom-right: white
      }
    }
  }
  const bytes = PNG.sync.write(png),
    file = path.join(root, "master.png");
  await fs.writeFile(file, bytes);
  const screenshots = path.resolve("artifacts/canvas-rendering");
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
    await field(page, "Projektname", { exact: true }).fill("Canvas Test");
    await page
      .getByRole("button", { name: "Projekt erstellen …", exact: true })
      .click();
    await field(page, "Neue Figur", { exact: true }).fill("Canvas Fixture");
    await page
      .getByRole("button", { name: "Figur erstellen", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Canvas Fixture", exact: true }),
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
    const viewport = () =>
      editor.locator(".pixel-camera-viewport");
    const stage = () => editor.locator(".pixel-camera-stage");

    // ---- DOM visibility checks ----
    // 2. Canvas and viewport have nonzero bounding rectangles
    const canvasBox = await canvas().boundingBox();
    const vpBox = await viewport().boundingBox();
    if (!canvasBox) throw new Error("Canvas bounding box is null");
    if (!vpBox) throw new Error("Viewport bounding box is null");
    if (canvasBox.width <= 0 || canvasBox.height <= 0)
      throw new Error(`Canvas has zero size: ${canvasBox.width}x${canvasBox.height}`);
    if (vpBox.width <= 0 || vpBox.height <= 0)
      throw new Error(`Viewport has zero size: ${vpBox.width}x${vpBox.height}`);

    // 3. Canvas rectangle intersects the viewport
    const intersects =
      canvasBox.x < vpBox.x + vpBox.width &&
      canvasBox.x + canvasBox.width > vpBox.x &&
      canvasBox.y < vpBox.y + vpBox.height &&
      canvasBox.y + canvasBox.height > vpBox.y;
    if (!intersects) throw new Error("Canvas does not intersect viewport");

    // 4. Canvas displays at the intended scaled size and position
    const native = await canvas().evaluate((c) => ({
      width: c.width,
      height: c.height,
    }));
    if (native.width !== width || native.height !== height)
      throw new Error(
        `Canvas bitmap is ${native.width}x${native.height}, expected ${width}x${height}`,
      );

    // 1. Canvas bitmap contains non-transparent source pixels
    // Center pixel (cy, cx): should be one of the quadrant colors (non-transparent)
    const centerPixel = await canvas().evaluate(
      (c, { cx, cy }) =>
        [...c.getContext("2d").getImageData(cx, cy, 1, 1).data],
      { cx, cy },
    );
    if (centerPixel[3] === 0)
      throw new Error("Center canvas pixel is transparent (alpha=0)");

    // 7. Rendered output is not obscured by another element
    const point = await canvas().evaluate(() => {
      const c = document.querySelector(
        'canvas[aria-label="Semantische Layer Bildfläche"]',
      );
      const rect = c.getBoundingClientRect();
      return { x: rect.left + 1, y: rect.top + 1 };
    });
    const topAtPoint = await page.evaluate(
      ({ x, y }) => document.elementFromPoint(x, y)?.tagName,
      point,
    );
    if (topAtPoint !== "CANVAS")
      throw new Error(
        `Canvas is obscured; top element at center is <${topAtPoint}>`,
      );

    // ---- View redraw checks ----
    // Switch to "original" view: source pixels must show without overlays
    await editor
      .getByLabel("Layeransicht", { exact: true })
      .selectOption("original");
    const originalPixel = await canvas().evaluate(
      (c, { cx, cy }) =>
        [...c.getContext("2d").getImageData(cx, cy, 1, 1).data],
      { cx, cy },
    );
    if (originalPixel[3] === 0)
      throw new Error("Original-view center pixel is transparent");

    // Switch to "active" view and back to verify redraw restores image
    await editor
      .getByLabel("Layeransicht", { exact: true })
      .selectOption("active");
    await canvas().evaluate(
      (c, { cx, cy }) =>
        [...c.getContext("2d").getImageData(cx, cy, 1, 1).data],
      { cx, cy },
    );
    await editor
      .getByLabel("Layeransicht", { exact: true })
      .selectOption("original");
    const restoredPixel = await canvas().evaluate(
      (c, { cx, cy }) =>
        [...c.getContext("2d").getImageData(cx, cy, 1, 1).data],
      { cx, cy },
    );
    if (restoredPixel[3] === 0)
      throw new Error("Restored original-view center pixel is transparent");

    // 5. Zoom and pan preserve visibility
    const beforeZoomScale = await stage().evaluate((n) => n.style.width);
    await viewport().click();
    await page.mouse.wheel(0, -100);
    const afterZoomScale = await stage().evaluate((n) => n.style.width);
    if (afterZoomScale === beforeZoomScale)
      throw new Error("Zoom did not change the stage scale");
    const afterZoomPixel = await canvas().evaluate(
      (c, { cx, cy }) =>
        [...c.getContext("2d").getImageData(cx, cy, 1, 1).data],
      { cx, cy },
    );
    if (afterZoomPixel[3] === 0)
      throw new Error("After zoom, center canvas pixel is transparent");

    // Pan the canvas
    const box = await viewport().boundingBox();
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
      throw new Error("After pan, center canvas pixel is transparent");

    // Fit view restores
    await editor
      .getByRole("button", { name: "Einpassen", exact: true })
      .click();
    const fitPixel = await canvas().evaluate(
      (c, { cx, cy }) =>
        [...c.getContext("2d").getImageData(cx, cy, 1, 1).data],
      { cx, cy },
    );
    if (fitPixel[3] === 0)
      throw new Error("After fit, center canvas pixel is transparent");

    await page.screenshot({
      path: path.join(screenshots, "canvas-pixels.png"),
    });
    expect(errors).toEqual([]);
    console.log(
      "PASS Semantic Canvas Rendering: visible source RGBA pixels reach the Canvas in the Semantic Layer Editor, with nonzero DOM bounds, intersection, correct bitmap size, unobscured output, and preserved visibility across zoom/pan/view-switch.",
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
