// Real offline worker, IPC, persistence and review; synthetic PNG/WebP only. No generation requests.
const { _electron: electron, expect } = require("@playwright/test");
const fs = require("node:fs/promises"),
  path = require("node:path"),
  os = require("node:os");
const { PNG } = require("pngjs");
const { createHash } = require("node:crypto");
const { nav } = require("./smoke-ui.cjs");
(async () => {
  const root = await fs.mkdtemp(
      path.join(os.tmpdir(), "laceframe-analysis-ui-"),
    ),
    project = path.join(root, "project");
  await fs.mkdir(project);
  // Any inherited Studio availability probe stays offline and unauthenticated.
  const bin = path.join(root, "bin");
  await fs.mkdir(bin);
  const quote = (s) => "'" + s.replaceAll("'", "'\\''") + "'";
  await fs.writeFile(
    path.join(bin, "codex"),
    "#!/bin/sh\nexec " +
      quote(process.execPath) +
      " " +
      quote(path.resolve("tests/support/fake-codex.mjs")) +
      ' "$@"\n',
    { mode: 0o700 },
  );

  let app, page, workerUrl;
  const errors = [];
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
    const env = {
      ...process.env,
      PATH: bin + path.delimiter + process.env.PATH,
      CODEX_HOME: root,
      LACEFRAME_TEST_ROOT: root,
      LACEFRAME_TEST_SCENARIO: "no-auth",
    };
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
      if (w.url().includes("style-analysis.worker")) workerUrl = w.url();
    });
    await expect(
      page.getByRole("heading", { name: "Characters", exact: true }),
    ).toBeVisible();
  };
  try {
    await launch();
    await chooser(project);
    await page
      .getByLabel("Projektname", { exact: true })
      .fill("Synthetic style analysis");
    await page
      .getByRole("button", { name: "Projekt erstellen …", exact: true })
      .click();
    await page
      .getByLabel("Neue Figur", { exact: true })
      .fill("Synthetic Ada Test");
    await page
      .getByRole("button", { name: "Figur erstellen", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Synthetic Ada Test", exact: true }),
    ).toBeVisible();
    const png = new PNG({ width: 64, height: 80 });
    for (let y = 0; y < 80; y++)
      for (let x = 0; x < 64; x++)
        png.data.set(
          [x < 32 ? 80 : 160, y < 40 ? 120 : 180, 90, x < 4 || y < 4 ? 0 : 255],
          (y * 64 + x) * 4,
        );
    const bytes = PNG.sync.write(png);
    await page.evaluate(
      async (bytes) => {
        const s = await window.laceframe.stageImage(
          new Uint8Array(bytes),
          "master.png",
        );
        if (!s.ok) throw new Error(s.error);
        const r = await window.laceframe.command({
          type: "addCharacter",
          name: "Independent B",
        });
        if (!r.ok) throw new Error(r.error);
        const c = r.value.project.characters[0].id;
        await window.laceframe.command({ type: "selectCharacter", id: c });
        const m = await window.laceframe.command({
          type: "confirmMaster",
          characterId: c,
          token: s.value.token,
          review: {
            sourceSha256: s.value.sha256,
            identityConfirmed: true,
            silhouetteConfirmed: true,
            activationConfirmed: true,
            notes: "Synthetic silhouette and identity review",
          },
        });
        if (!m.ok) throw new Error(m.error);
      },
      [...bytes],
    );
    await app.close();
    await launch();
    await chooser(project);
    await page
      .getByRole("button", { name: "Projekt öffnen …", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Synthetic Ada Test", exact: true }),
    ).toBeVisible();
    await nav(page, "Art Direction");
    await page
      .getByLabel("Stilname", { exact: true })
      .fill("Measured Game Style");
    await page
      .getByLabel("Rendering-Regeln (ohne Charakter- oder Outfitmerkmale)", {
        exact: true,
      })
      .fill("Original manual contours");
    await page
      .getByRole("button", { name: "Stil anlegen und auswählen", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Stilrevision speichern", exact: true }),
    ).toBeVisible();
    const a = () =>
      page.getByRole("region", { name: "Stil analysieren", exact: true });
    await a()
      .getByLabel("Analysereferenz hinzufügen", { exact: true })
      .selectOption((await manifest()).masters[0].id);
    // Multiple real file input imports, including browser-decoded WebP through production pipeline.
    const webp = await page.evaluate(async () => {
      const c = document.createElement("canvas");
      c.width = 40;
      c.height = 24;
      const ctx = c.getContext("2d");
      ctx.fillStyle = "#343c88";
      ctx.fillRect(0, 0, 40, 24);
      const b = await new Promise((resolve) =>
        c.toBlob(resolve, "image/webp", 1),
      );
      return [...new Uint8Array(await b.arrayBuffer())];
    });
    const file1 = path.join(root, "reference.png"),
      file2 = path.join(root, "scene.webp");
    await fs.writeFile(file1, bytes);
    await fs.writeFile(file2, Buffer.from(webp));
    await a()
      .getByLabel("Analysereferenzen importieren", { exact: true })
      .setInputFiles([file1, file2]);
    await expect(
      a().getByRole("status", { name: "Stilanalyse-Status", exact: true }),
    ).toHaveText("Referenzen importiert. Typen und ROI prüfen.");
    await a()
      .getByLabel("Referenztyp 3", { exact: true })
      .selectOption("environment");
    await a().locator(".analysis-reference").first().locator("summary").click();
    await a().getByLabel("ROI 1 x", { exact: true }).fill("4");
    await a().getByLabel("ROI 1 y", { exact: true }).fill("4");
    await a().getByLabel("ROI 1 width", { exact: true }).fill("60");
    await a().getByLabel("ROI 1 height", { exact: true }).fill("76");
    const before = await fs.readFile(path.join(project, "laceframe.json"));
    await a()
      .getByRole("button", { name: "Lokal analysieren", exact: true })
      .click();
    await expect(
      a().getByRole("status", { name: "Stilanalyse-Status", exact: true }),
    ).toContainText("Analyse abgeschlossen");
    expect(await fs.readFile(path.join(project, "laceframe.json"))).toEqual(
      before,
    );
    await expect(
      a()
        .getByText(/Virtuelle Originalauflösung: unbekannt/)
        .first(),
    ).toBeVisible();
    await a().getByRole("button", { name: "3 · Regeln", exact: true }).click();
    await a()
      .getByLabel("Regeltext portrait:renderRules", { exact: true })
      .fill(
        "Manually reviewed graphic clusters; retain independent identities.",
      );
    const colorRule = a()
      .locator("details")
      .filter({
        has: page.getByLabel("Regel aktiv portrait:colorRules", {
          exact: true,
        }),
      });
    await colorRule.locator("summary").first().click();
    await a()
      .getByLabel("Regel aktiv portrait:colorRules", { exact: true })
      .uncheck();
    await a().getByLabel("Prüfpalette 1", { exact: true }).fill("#cc8844");
    await a()
      .getByLabel("Eigene künstlerische Regeln", { exact: true })
      .fill("No automatic material inference.");
    await a()
      .getByRole("button", { name: "Zur Freigabe", exact: true })
      .click();
    await a()
      .getByRole("button", {
        name: "Geprüfte Regeln als Stilrevision übernehmen",
        exact: true,
      })
      .click();
    await expect(
      a().getByRole("status", { name: "Stilanalyse-Status", exact: true }),
    ).toContainText("neue Stilrevision gespeichert");
    const saved = await manifest(),
      record = saved.styleAnalyses[0];
    expect(record.references).toHaveLength(3);
    expect(record.references[2].type).toBe("environment");
    expect(record.edits.palette[0]).toBe("#cc8844");
    expect(saved.artDirections[0].renderRules).toContain(
      "Manually reviewed graphic clusters",
    );
    expect(saved.artDirections[0].colorRules).not.toContain(
      "Portrait / Character Master only:",
    );
    expect(saved.masters[0].sha256).toBe(
      createHash("sha256").update(bytes).digest("hex"),
    );
    // Same real comparison widget as Quality, actual candidate metrics and native dimensions.
    const compare = a().locator(".analysis-comparison");
    await compare.locator("summary").first().click();
    await compare
      .getByLabel("Stilvergleich Charakterasset", { exact: true })
      .selectOption(saved.masters[0].id);
    await compare
      .getByRole("button", { name: "Stilabweichungen messen", exact: true })
      .click();
    await expect(
      compare.getByRole("status", {
        name: "Stilvergleich-Status",
        exact: true,
      }),
    ).toContainText("Gemessen");
    await expect(
      compare.getByText("meanLuminance", { exact: true }),
    ).toBeVisible();
    await expect(compare.locator(".master-compare")).toBeVisible();
    await a()
      .getByRole("button", { name: "2 · Ergebnisse", exact: true })
      .click();
    await compare.locator("summary").first().click();
    await fs.mkdir("artifacts", { recursive: true });
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
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      ).toBe(true);
      await a().evaluate((e) => e.scrollIntoView({ block: "start" }));
      await page.screenshot({
        path: `artifacts/style-analysis-${width}.png`,
        fullPage: false,
      });
    }
    // Reanalysis cancellation keeps old persisted record byte-exact, can run again afterwards.
    await a()
      .getByRole("button", { name: "1 · Referenzen", exact: true })
      .click();
    await a()
      .getByRole("button", { name: "Lokal analysieren", exact: true })
      .click();
    await a()
      .getByRole("button", { name: "Analyse abbrechen", exact: true })
      .click();
    await expect(
      a().getByRole("status", { name: "Stilanalyse-Status", exact: true }),
    ).toContainText("abgebrochen");
    expect((await manifest()).styleAnalyses).toEqual(saved.styleAnalyses);
    await a()
      .getByRole("button", { name: "Lokal analysieren", exact: true })
      .click();
    await expect(
      a().getByRole("status", { name: "Stilanalyse-Status", exact: true }),
    ).toContainText("Analyse abgeschlossen");
    page.once("dialog", (d) => d.accept());
    await a()
      .getByLabel("Historische Analyse", { exact: true })
      .selectOption(record.id);
    await expect(
      a().getByLabel("Eigene künstlerische Regeln", { exact: true }),
    ).toBeDisabled();
    expect(
      await a()
        .getByLabel("Eigene künstlerische Regeln", { exact: true })
        .inputValue(),
    ).toBe("No automatic material inference.");
    await app.close();
    await launch();
    await chooser(project);
    await page
      .getByRole("button", { name: "Projekt öffnen …", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Synthetic Ada Test", exact: true }),
    ).toBeVisible();
    await nav(page, "Art Direction");
    await a()
      .getByLabel("Historische Analyse", { exact: true })
      .selectOption(record.id);
    await expect(
      a().getByLabel("Regeltext portrait:renderRules", { exact: true }),
    ).toHaveValue(
      "Manually reviewed graphic clusters; retain independent identities.",
    );
    expect((await manifest()).styleAnalyses).toEqual(saved.styleAnalyses);
    // Both current Studio prompt composers consume the actual adopted revision without a generation.
    await nav(page, "Studio");
    await page
      .getByRole("button", { name: "Expression erstellen", exact: true })
      .click();
    const expression = page.locator(
      '.studio-editor[data-operation="expression"]:visible',
    );
    await expect(
      expression.getByLabel("Arbeits-Prompt", { exact: true }),
    ).toHaveValue(/Manually reviewed graphic clusters/);
    await page
      .getByRole("button", { name: "Master erstellen", exact: true })
      .click();
    const creator = page.locator(
      '.studio-editor[data-operation="master"]:visible',
    );
    await page
      .getByLabel("Studio Figur", { exact: true })
      .selectOption(
        saved.characters.find((c) => c.name === "Independent B").id,
      );
    await expect(
      creator.getByText("Independent B", { exact: true }),
    ).toBeVisible();
    await chooser(file1);
    await creator
      .getByRole("button", {
        name: "Identitätsbild importieren …",
        exact: true,
      })
      .click();
    await expect(
      creator.getByAltText("Identität 1", { exact: true }),
    ).toBeVisible();
    await creator
      .getByLabel("Creator Outfit", { exact: true })
      .fill("Independent blue coat, no borrowed clothing.");
    await expect(
      creator.getByLabel("Creator Arbeits-Prompt", { exact: true }),
    ).toHaveValue(/Manually reviewed graphic clusters/);
    await nav(page, "Art Direction");
    // Actual worker performance on maximum image, bounded transferred RGBA; no images saved.
    const performance = await page.evaluate(async (url) => {
      const worker = new window.Worker(url, { type: "module" });
      const bytes = new Uint8Array(2048 * 2048 * 4).fill(255);
      const start = window.performance.now();
      const result = await new Promise((resolve, reject) => {
        worker.onmessage = (e) =>
          e.data.ok ? resolve(e.data.value) : reject(new Error(e.data.error));
        worker.onerror = () => reject(new Error("Worker failed"));
        worker.postMessage(
          {
            input: { id: window.crypto.randomUUID(), type: "sprite" },
            image: {
              width: 2048,
              height: 2048,
              data: bytes,
              sha256: "a".repeat(64),
            },
          },
          [bytes.buffer],
        );
      });
      worker.terminate();
      return {
        worker4mpMs: Math.round(window.performance.now() - start),
        visible: result.metrics.visible,
        rgbaBytes: 2048 * 2048 * 4,
        colorScratchBytes: 2048 * 2048 * 4,
        paletteScratchBytes: 32768 * 4,
      };
    }, workerUrl);
    expect(performance.visible).toBe(2048 * 2048);

    const metrics = await app.evaluate(({ app }) =>
      app.getAppMetrics().map((p) => ({ type: p.type, memory: p.memory })),
    );
    await fs.writeFile(
      "artifacts/style-analysis-performance.json",
      JSON.stringify({ memory: metrics, performance }, null, 2),
    );
    const trace = (
      await fs.readFile(path.join(root, "trace.jsonl"), "utf8").catch(() => "")
    )
      .split("\n")
      .filter(Boolean)
      .map((s) => JSON.parse(s));
    expect(trace.some((m) => m.method === "turn/start")).toBe(false);
    expect(errors).toEqual([]);
    console.log(
      "Style analysis smoke passed: multi PNG/WebP import, approved master ROI, worker metrics, manual edits/adoption, comparison, cancel/retry, 960/1440, restart; no generation.",
    );
  } finally {
    if (app) await app.close();
    console.log("Synthetic style analysis project:", root);
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
