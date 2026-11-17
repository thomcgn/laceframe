// Real pixel pipeline/worker/editor. Synthetic 1254px fixture only; no generation.
const { _electron: electron, expect } = require("@playwright/test");
const fs = require("node:fs/promises"),
  path = require("node:path"),
  os = require("node:os"),
  { createHash } = require("node:crypto"),
  { PNG } = require("pngjs");
(async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "laceframe-smart-ui-")),
    project = path.join(root, "project"),
    exports = path.join(root, "exports");
  await fs.mkdir(project);
  await fs.mkdir(exports);
  let app, page, workerUrl;
  const errors = [];
  const hash = (b) => createHash("sha256").update(b).digest("hex");
  const chooser = (file) =>
    app.evaluate(({ dialog }, file) => {
      dialog.showOpenDialog = async () => ({
        canceled: false,
        filePaths: [file],
      });
    }, file);
  const manifest = async () =>
    JSON.parse(await fs.readFile(path.join(project, "laceframe.json"), "utf8"));
  const launch = async () => {
    const env = { ...process.env };
    delete env.ELECTRON_RUN_AS_NODE;
    app = await electron.launch({
      executablePath: path.resolve("out/Laceframe-linux-x64/laceframe"),
      args: ["--user-data-dir=" + path.join(root, "user")],
      env,
    });
    page = await app.firstWindow();
    page.setDefaultTimeout(20000);
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("worker", (w) => {
      if (w.url().includes("smart-cutout.worker")) workerUrl = w.url();
    });
    await expect(
      page.getByRole("heading", { name: "Characters", exact: true }),
    ).toBeVisible();
  };
  const dialog = () =>
    page.getByRole("dialog", { name: "Freistellungsmaske", exact: true });
  const ready = async () => {
    await expect(
      dialog().getByRole("status", {
        name: "Freistellung Berechnung",
        exact: true,
      }),
    ).toContainText("Vorschau bereit");
    await expect(
      dialog().getByRole("button", {
        name: "Freigestellten Kandidaten speichern",
        exact: true,
      }),
    ).toBeEnabled();
  };
  const clickPixel = async (x, y) => {
    await dialog()
      .getByLabel("Maskenzeichenfläche", { exact: true })
      .scrollIntoViewIfNeeded();
    const rect = await dialog().locator("canvas").boundingBox();
    await page.mouse.click(
      rect.x + ((x + 0.5) / 1254) * rect.width,
      rect.y + ((y + 0.5) / 1254) * rect.height,
    );
  };
  const brush = async (tool, x, y) => {
    await dialog()
      .getByLabel("Maskenwerkzeug", { exact: true })
      .selectOption(tool);
    await clickPixel(x, y);
    await ready();
  };
  const rgba = async (x, y) =>
    dialog()
      .locator("canvas")
      .evaluate(
        (c, { x, y }) => [...c.getContext("2d").getImageData(x, y, 1, 1).data],
        { x, y },
      );
  try {
    await launch();
    await chooser(project);
    await page
      .getByLabel("Projektname", { exact: true })
      .fill("Smart synthetic");
    await page
      .getByRole("button", { name: "Projekt erstellen …", exact: true })
      .click();
    await page
      .getByLabel("Neue Figur", { exact: true })
      .fill("Protected portrait");
    await page
      .getByRole("button", { name: "Figur erstellen", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Protected portrait", exact: true }),
    ).toBeVisible();
    const p = new PNG({ width: 1254, height: 1254 });
    for (let y = 0; y < 1254; y++)
      for (let x = 0; x < 1254; x++) {
        const k = (y * 1254 + x) * 4,
          v = (x + y) % 5;
        p.data.set([v, v, v, 255], k);
        if (x >= 420 && x < 830 && y >= 180 && y < 800)
          p.data.set([165, 115, 90, 255], k);
        if (x >= 485 && x < 765 && y >= 780 && y < 1190)
          p.data.set([0, 0, 0, 255], k);
        if (x >= 430 && x < 820 && y >= 180 && y < 300)
          p.data.set([9, 5, 4, 255], k);
        if (
          ((x >= 500 && x < 550) || (x >= 690 && x < 740)) &&
          y >= 425 &&
          y < 445
        )
          p.data.set([0, 0, 0, 255], k);
      }
    p.data.set([77, 44, 22, 128], (600 * 1254 + 600) * 4);
    const original = PNG.sync.write(p);
    await page.evaluate(
      async (bytes) => {
        const s = await window.laceframe.stageImage(
          new Uint8Array(bytes),
          "synthetic.png",
        );
        if (!s.ok) throw new Error(s.error);
        const q = await window.laceframe.command({
          type: "addCharacter",
          name: "temporary draft",
        });
        if (!q.ok) throw new Error(q.error);
        const id = q.value.project.characters[0].id;
        await window.laceframe.command({ type: "selectCharacter", id });
        const r = await window.laceframe.command({
          type: "confirmMaster",
          characterId: id,
          token: s.value.token,
        });
        if (!r.ok) throw new Error(r.error);
      },
      [...original],
    );
    await app.close();
    await launch();
    await chooser(project);
    await page
      .getByRole("button", { name: "Projekt öffnen …", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Protected portrait", exact: true }),
    ).toBeVisible();
    let quality = page.locator('[data-testid="asset-quality"]:visible').first();
    await quality.locator("summary").first().click();
    await quality
      .getByRole("button", { name: "Hintergrund freistellen", exact: true })
      .click();
    await ready();
    expect(await rgba(625, 950)).toEqual([0, 0, 0, 255]);
    const before = await fs.readFile(path.join(project, "laceframe.json"));
    // Polygon input uses the real transformed canvas and exact original pixels.
    const toolSelect = () =>
      dialog().getByLabel("Maskenwerkzeug", { exact: true });
    const area = () =>
      dialog().getByLabel("Maskenzeichenfläche", { exact: true });
    const polygonStatus = () =>
      dialog().getByRole("status", { name: "Polygonstatus", exact: true });
    const applyPolygon = () =>
      dialog().getByRole("button", { name: "Polygon anwenden", exact: true });
    const discardPolygon = () =>
      dialog().getByRole("button", { name: "Auswahl verwerfen", exact: true });
    await toolSelect().selectOption("polygon");
    await clickPixel(550, 550);
    await clickPixel(700, 550);
    await clickPixel(700, 700);
    await area().press("Backspace");
    await expect(polygonStatus()).toContainText("2 / 128");
    await area().press("Control+z");
    await expect(polygonStatus()).toContainText("3 / 128");
    await area().press("Control+Shift+z");
    await expect(polygonStatus()).toContainText("2 / 128");
    await area().press("Escape");
    await expect(polygonStatus()).toContainText("0 / 128");
    // Zoom + pan: vertices remain in source coordinates, never CSS coordinates.
    await dialog().getByLabel("Maskenzoom", { exact: true }).selectOption("2");
    await area().scrollIntoViewIfNeeded();
    const polygonBox = await area().boundingBox();
    await page.keyboard.down("Alt");
    await page.mouse.move(polygonBox.x + polygonBox.width / 2, polygonBox.y + polygonBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(
      polygonBox.x + polygonBox.width / 2 + 15,
      polygonBox.y + polygonBox.height / 2 + 10,
    );
    await page.mouse.up();
    await page.keyboard.up("Alt");
    for (const [x, y] of [
      [550, 550],
      [700, 550],
      [700, 700],
    ])
      await clickPixel(x, y);
    const nativePoints = await dialog()
      .locator("svg circle")
      .evaluateAll((nodes) =>
        nodes.map((n) => [+n.getAttribute("cx"), +n.getAttribute("cy")]),
      );
    expect(nativePoints).toHaveLength(3);
    for (let i = 0; i < 3; i++)
      for (let c = 0; c < 2; c++)
        expect(
          Math.abs(
            nativePoints[i][c] -
              [
                [550, 550],
                [700, 550],
                [700, 700],
              ][i][c],
          ),
        ).toBeLessThan(3);
    await area().press("Enter");
    await expect(polygonStatus()).toContainText("geschlossen");
    await discardPolygon().click();
    await dialog()
      .getByRole("button", { name: "Maskenansicht zurücksetzen", exact: true })
      .click();
    // Browser double-click sends duplicate pointerdown: only one corner is kept.
    await clickPixel(550, 550);
    await clickPixel(700, 550);
    await area().scrollIntoViewIfNeeded();
    const cr = await dialog().locator("canvas").boundingBox();
    await page.mouse.dblclick(
      cr.x + (700.5 / 1254) * cr.width,
      cr.y + (700.5 / 1254) * cr.height,
    );
    await expect(polygonStatus()).toContainText("3 / 128 Ecken · geschlossen");
    await discardPolygon().click();
    for (const [x, y] of [
      [500, 500],
      [750, 750],
      [500, 750],
      [750, 500],
    ])
      await clickPixel(x, y);
    await area().press("Enter");
    await expect(dialog().getByRole("alert")).toContainText(
      "Selbstüberschneidung",
    );
    await expect(applyPolygon()).toBeDisabled();
    await discardPolygon().click();
    await toolSelect().selectOption("pick");
    await clickPixel(100, 100);
    await ready();
    expect((await rgba(625, 960))[3]).toBe(0); // Jacket touches same-color background.
    await toolSelect().selectOption("polygon");
    for (const [x, y] of [
      [410, 170],
      [840, 170],
      [840, 1210],
      [410, 1210],
    ])
      await clickPixel(x, y);
    await area().press("Enter");
    await expect(polygonStatus()).toContainText("geschlossen");
    await expect(
      dialog().getByRole("button", {
        name: "Freigestellten Kandidaten speichern",
        exact: true,
      }),
    ).toBeDisabled();
    for (const width of [960, 1440]) {
      await page.setViewportSize({ width, height: width === 960 ? 720 : 900 });
      await area().scrollIntoViewIfNeeded();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      ).toBe(true);
      await fs.mkdir("artifacts", { recursive: true });
      await page.screenshot({ path: `artifacts/cutout-polygon-${width}.png` });
    }
    await applyPolygon().click();
    await ready();
    await dialog()
      .getByLabel("Schutzmaske anzeigen", { exact: true })
      .uncheck();
    expect((await rgba(625, 960))[3]).toBe(255);
    expect((await rgba(100, 100))[3]).toBe(0);
    await dialog()
      .getByRole("button", { name: "Rückgängig", exact: true })
      .click();
    await ready();
    expect((await rgba(625, 960))[3]).toBe(0);
    await dialog()
      .getByRole("button", { name: "Wiederholen", exact: true })
      .click();
    await ready();
    expect((await rgba(625, 960))[3]).toBe(255);
    // Force then protect the same region; human operation, not semantic detection.
    for (const operation of ["force", "protect"]) {
      await dialog()
        .getByLabel("Polygonoperation", { exact: true })
        .selectOption(operation);
      for (const [x, y] of [
        [580, 580],
        [620, 580],
        [620, 620],
        [580, 620],
      ])
        await clickPixel(x, y);
      await area().press("Enter");
      await applyPolygon().click();
      await ready();
      await dialog()
        .getByLabel("Schutzmaske anzeigen", { exact: true })
        .uncheck();
      expect((await rgba(600, 600))[3]).toBe(operation === "force" ? 0 : 128);
    }
    await dialog()
      .getByRole("button", { name: "Rückgängig", exact: true })
      .click();
    await ready();
    await dialog()
      .getByRole("button", { name: "Rückgängig", exact: true })
      .click();
    await ready();
    // Remove the extra seed, retaining just the limit polygon for existing checks.
    await dialog()
      .getByText("Seeds und erweiterte Auswahl", { exact: true })
      .click();
    await dialog()
      .getByRole("button", { name: "Seed 1 entfernen", exact: true })
      .click();
    await ready();
    await dialog()
      .getByText("Seeds und erweiterte Auswahl", { exact: true })
      .click();
    // Protected coat and hair are explicitly painted; no semantic inference.
    await dialog().getByLabel("Pinselgröße", { exact: true }).fill("200");
    await brush("protect", 625, 960);
    expect(await rgba(625, 960)).toEqual([40, 100, 70, 255]);
    await dialog().getByLabel("Pinselgröße", { exact: true }).fill("90");
    await brush("protect", 625, 230);
    await dialog()
      .getByLabel("Maskenwerkzeug", { exact: true })
      .selectOption("pick");
    await clickPixel(100, 100);
    await ready();
    await expect(
      dialog().getByLabel("Aufgenommene Farbe", { exact: true }),
    ).toContainText(/RGBA [0-4], [0-4], [0-4], 255/);
    await dialog()
      .getByLabel("Schutzmaske anzeigen", { exact: true })
      .uncheck();
    expect((await rgba(100, 100))[3]).toBe(0);
    expect(await rgba(625, 960)).toEqual([0, 0, 0, 255]);
    expect(await rgba(625, 230)).toEqual([9, 5, 4, 255]);
    expect(await rgba(520, 430)).toEqual([0, 0, 0, 255]);
    await dialog().getByLabel("Pinselgröße", { exact: true }).fill("12");
    await brush("force", 600, 650);
    await dialog()
      .getByLabel("Schutzmaske anzeigen", { exact: true })
      .uncheck();
    expect((await rgba(600, 650))[3]).toBe(0);
    // Force on the protected coat is a visible conflict; protection wins.
    await brush("force", 625, 960);
    await expect(
      dialog().getByRole("status", {
        name: "Freistellung Berechnung",
        exact: true,
      }),
    ).toContainText(/[1-9]\d* Konflikte \(Schutz gewinnt\)/);
    await dialog()
      .getByLabel("Schutzmaske anzeigen", { exact: true })
      .uncheck();
    expect((await rgba(625, 960))[3]).toBe(255);
    await dialog()
      .getByRole("button", { name: "Rückgängig", exact: true })
      .click();
    await ready();
    await expect(
      dialog().getByRole("status", {
        name: "Freistellung Berechnung",
        exact: true,
      }),
    ).toContainText("0 Konflikte");
    await dialog()
      .getByRole("button", { name: "Wiederholen", exact: true })
      .click();
    await ready();
    await dialog().getByLabel("Kantenweichheit", { exact: true }).fill("2");
    await ready();
    await dialog().getByLabel("Farbtoleranz", { exact: true }).fill("14");
    await ready();
    // Zoom/pan are tested before another native seed is sampled. The canvas bounding rect is authoritative.
    await dialog().getByLabel("Maskenzoom", { exact: true }).selectOption("2");
    await dialog()
      .getByLabel("Maskenwerkzeug", { exact: true })
      .selectOption("pan");
    const box = await dialog()
      .getByLabel("Maskenzeichenfläche", { exact: true })
      .boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(
      box.x + box.width / 2 + 20,
      box.y + box.height / 2 + 10,
    );
    await page.mouse.up();
    await dialog()
      .getByLabel("Maskenwerkzeug", { exact: true })
      .selectOption("pick");
    await clickPixel(250, 450);
    await ready();
    await dialog()
      .getByRole("button", { name: "Maskenansicht zurücksetzen", exact: true })
      .click();
    await dialog()
      .getByLabel("Freistellung Prüfansicht", { exact: true })
      .selectOption("original");
    expect((await rgba(100, 100))[3]).toBe(255);
    await dialog()
      .getByLabel("Freistellung Prüfansicht", { exact: true })
      .selectOption("alpha");
    expect(await rgba(100, 100)).toEqual([0, 0, 0, 255]);
    await dialog()
      .getByLabel("Freistellung Prüfansicht", { exact: true })
      .selectOption("result");
    for (const [width, height] of [
      [960, 720],
      [1440, 900],
    ]) {
      await app.evaluate(
        ({ BrowserWindow }, { width, height }) =>
          BrowserWindow.getAllWindows()
            .find((w) => w.isVisible())
            .setSize(width, height),
        { width, height },
      );
      await dialog()
        .getByLabel("Freistellung Prüfhintergrund", { exact: true })
        .selectOption(width === 960 ? "light" : "dark");
      await fs.mkdir("artifacts", { recursive: true });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      ).toBe(true);
      await page.screenshot({ path: `artifacts/smart-cutout-${width}.png` });
    }
    expect(await fs.readFile(path.join(project, "laceframe.json"))).toEqual(
      before,
    );
    await dialog()
      .getByRole("button", {
        name: "Freigestellten Kandidaten speichern",
        exact: true,
      })
      .click();
    await expect(dialog()).toHaveCount(0);
    const first = (await manifest()).qualityAssets[0];
    expect(first.smartCutout.settings.polygons).toHaveLength(1);
    expect(first.smartCutout.settings.polygons[0].operation).toBe("limit");
    expect(first.smartCutout.settings.polygons[0].algorithm).toBe(
      "pixel-center-even-odd-v1",
    );
    expect(first.smartCutout.settings.seeds).toHaveLength(2);
    for (const s of first.smartCutout.settings.seeds)
      expect(s.rgba).toEqual([
        ...p.data.slice((s.y * 1254 + s.x) * 4, (s.y * 1254 + s.x) * 4 + 4),
      ]);
    expect(Math.abs(first.smartCutout.settings.seeds[1].x - 250)).toBeLessThan(
      3,
    );
    expect(Math.abs(first.smartCutout.settings.seeds[1].y - 450)).toBeLessThan(
      3,
    );
    const result = PNG.sync.read(
      await fs.readFile(path.join(project, first.file)),
    );
    expect([
      ...result.data.slice((625 + 960 * 1254) * 4, (625 + 960 * 1254) * 4 + 4),
    ]).toEqual([0, 0, 0, 255]);
    expect(result.data[3]).toBe(0);
    expect(hash(result.data)).toBe(first.smartCutout.pixelSha256);
    await app.close();
    await launch();
    await chooser(project);
    await page
      .getByRole("button", { name: "Projekt öffnen …", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Protected portrait", exact: true }),
    ).toBeVisible();
    quality = page.locator('[data-testid="asset-quality"]:visible').first();
    await quality.locator("summary").first().click();
    await quality
      .getByRole("button", { name: "Hintergrund freistellen", exact: true })
      .click();
    await ready();
    await expect(
      dialog().getByLabel("Farbtoleranz", { exact: true }),
    ).toHaveValue("14");
    await expect(
      dialog().getByLabel("Kantenweichheit", { exact: true }),
    ).toHaveValue("2");
    await expect(
      dialog().getByText("Angewendete Polygone (1/32)", { exact: true }),
    ).toBeVisible();
    await dialog().getByLabel("Pinselgröße", { exact: true }).fill("20");
    await brush("protect", 600, 650);
    await dialog()
      .getByLabel("Schutzmaske anzeigen", { exact: true })
      .uncheck();
    expect((await rgba(600, 650))[3]).toBe(255);
    // Cancel invalidates save; explicit retry restores a usable current preview.
    await dialog()
      .getByRole("button", { name: "Auswahl neu berechnen", exact: true })
      .click();
    await dialog()
      .getByRole("button", { name: "Auswahl abbrechen", exact: true })
      .click();
    await expect(
      dialog().getByRole("button", {
        name: "Freigestellten Kandidaten speichern",
        exact: true,
      }),
    ).toBeDisabled();
    await dialog()
      .getByRole("button", { name: "Auswahl neu berechnen", exact: true })
      .click();
    await ready();
    await dialog()
      .getByRole("button", {
        name: "Freigestellten Kandidaten speichern",
        exact: true,
      })
      .click();
    await expect(dialog()).toHaveCount(0);
    const second = (await manifest()).qualityAssets[1];
    expect(second.smartCutout.revision).toBe(2);
    expect(second.smartCutout.masks.protected.revision).toBe(2);
    expect((await manifest()).qualityAssets[0]).toEqual(first);
    await quality
      .getByLabel("Qualitätsnotiz", { exact: true })
      .fill("Synthetic protected coat, frames, alpha and edges reviewed.");
    await quality
      .getByLabel(
        /Identität, Outfit, Konturen, Stil und Alpha-Kanten visuell geprüft/,
      )
      .check();
    page.once("dialog", (d) => d.accept());
    await quality
      .getByRole("button", { name: "Qualitätsversion freigeben", exact: true })
      .click();
    await expect.poll(async () => (await manifest()).masters.length).toBe(2);
    quality = page.locator('[data-testid="asset-quality"]:visible').first();
    if ((await quality.getAttribute("open")) === null)
      await quality.locator("summary").first().click();
    await chooser(exports);
    await quality
      .getByRole("button", {
        name: "Transparentes PNG exportieren",
        exact: true,
      })
      .click();
    await expect
      .poll(
        async () =>
          (await fs.readdir(exports)).filter((f) => f.endsWith(".png")).length,
      )
      .toBe(1);
    const file = (await fs.readdir(exports)).find((f) => f.endsWith(".png"));
    expect(await fs.readFile(path.join(exports, file))).toEqual(
      await fs.readFile(path.join(project, second.file)),
    );
    const final = await manifest();
    expect(
      hash(await fs.readFile(path.join(project, final.masters[0].file))),
    ).toBe(hash(original));
    expect(final.masters[1].version).toBe(2);
    // Actual maximum-size worker job; browser animation frames keep running during Lab/flood calculation.
    const maximum = await page.evaluate(async (url) => {
      const worker = new window.Worker(url, { type: "module" }),
        n = 2048 * 2048,
        data = new Uint8Array(n * 4).fill(255),
        manual = new Uint8Array(n).fill(255),
        protectedMask = new Uint8Array(n),
        forced = new Uint8Array(n);
      protectedMask[n / 2] = 255;
      forced[n / 2] = 255;
      let frames = 0,
        active = true;
      const heartbeat = () => {
        if (active) {
          frames++;
          window.requestAnimationFrame(heartbeat);
        }
      };
      window.requestAnimationFrame(heartbeat);
      const start = window.performance.now();
      const result = await new Promise((resolve, reject) => {
        const timer = window.setTimeout(
          () => reject(new Error("4MP worker timeout")),
          20000,
        );
        worker.onerror = () => {
          window.clearTimeout(timer);
          reject(new Error("4MP worker failed"));
        };
        worker.onmessage = (e) => {
          window.clearTimeout(timer);
          if (e.data.error) reject(new Error(e.data.error));
          else resolve(e.data);
        };
        worker.postMessage(
          {
            serial: 1,
            image: { width: 2048, height: 2048, data },
            draft: {
              settings: {
                seeds: [{ x: 0, y: 0, rgba: [255, 255, 255, 255] }],
                tolerance: 8,
                connected: true,
                softness: 2,
                expand: 0,
              },
              manual,
              protected: protectedMask,
              forced,
            },
          },
          [data.buffer, manual.buffer, protectedMask.buffer, forced.buffer],
        );
      });
      active = false;
      worker.terminate();
      return {
        endToEndMs: Math.round(window.performance.now() - start),
        selectionMs: Math.round(result.durationMs),
        frames,
        conflicts: result.conflicts,
        protectedWeight: result.weights[n / 2],
        inputBytes: n * 4,
        labBytes: n * 12,
        queueBytes: n * 4,
      };
    }, workerUrl);
    expect(maximum.protectedWeight).toBe(255);
    expect(maximum.conflicts).toBe(1);
    expect(maximum.frames).toBeGreaterThan(0);
    const memory = await app.evaluate(({ app }) =>
      app.getAppMetrics().map((p) => ({ type: p.type, memory: p.memory })),
    );
    await fs.writeFile(
      "artifacts/smart-cutout-performance.json",
      JSON.stringify(
        { memory, maximum, workerUrl, sourcePixels: 1254 * 1254 },
        null,
        2,
      ),
    );
    expect(errors).toEqual([]);
    console.log(
      "PASS smart cutout: actual 1254px worker, pipette/zoom/pan, protected/forced conflicts, threshold/feather/undo/redo, no intermediate writes, recipe restart/revision, Master V2, exact PNG export, original hash and both desktop sizes.",
    );
  } finally {
    if (app) {
      await page
        .screenshot({ path: "artifacts/smart-cutout-last.png" })
        .catch(() => {});
      await app.close();
    }
    console.log("Smart cutout synthetic project:", root);
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
