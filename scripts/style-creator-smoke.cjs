// Packaged guided workflow, native decoding, worker measurements and protocol fixture only.
// No actual model inference or image generation.
const { _electron: electron, expect } = require("@playwright/test");
const fs = require("node:fs/promises"),
  path = require("node:path"),
  os = require("node:os");
const { nav, prepareProjectCreation } = require("./smoke-ui.cjs");
(async () => {
  const root = await fs.mkdtemp(
      path.join(os.tmpdir(), "laceframe-style-creator-ui-"),
    ),
    project = path.join(root, "project"),
    bin = path.join(root, "bin");
  await fs.mkdir(project);
  await fs.mkdir(bin);
  const quote = (s) => "'" + s.replaceAll("'", "'\\''") + "'";
  await fs.writeFile(
    path.join(bin, "codex"),
    "#!/bin/sh\nexec " +
      quote(process.execPath) +
      " " +
      quote(path.resolve("tests/support/fake-style-analyzer.mjs")) +
      ' "$@"\n',
    { mode: 0o700 },
  );
  let app, page;
  const errors = [];
  const chooser = (files) =>
    app.evaluate(({ dialog }, files) => {
      dialog.showOpenDialog = async () => ({
        canceled: false,
        filePaths: files,
      });
    }, files);
  const manifest = async () =>
    JSON.parse(await fs.readFile(path.join(project, "laceframe.json"), "utf8"));
  const launch = async () => {
    const env = {
      ...process.env,
      PATH: bin + path.delimiter + process.env.PATH,
      LACEFRAME_STYLE_ROOT: root,
      LACEFRAME_STYLE_SCENARIO: "success",
    };
    delete env.ELECTRON_RUN_AS_NODE;
    app = await electron.launch({
      executablePath: path.resolve("out/Laceframe-linux-x64/laceframe"),
      args: ["--user-data-dir=" + path.join(root, "user")],
      env,
    });
    page = await app.firstWindow();
    await page
      .getByRole("combobox", { name: /^(Language|Sprache)$/ })
      .selectOption("de");
    page.setDefaultTimeout(20000);
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("dialog", (d) => d.accept());
    await expect(
      page.getByRole("button", { name: "Neues Projekt", exact: true }),
    ).toBeVisible({ timeout: 25000 });
  };
  try {
    await launch();
    console.log("launched");
    await chooser([project]);
    await prepareProjectCreation(page);
    await page
      .getByLabel("Projektname", { exact: true })
      .fill("Synthetic Style Creator");
    await page
      .getByRole("button", { name: "Projekt erstellen …", exact: true })
      .click();
    await nav(page, "Art Direction");
    await page
      .getByRole("button", { name: "Stil erstellen", exact: true })
      .click();
    expect(
      await page
        .locator(".style-creator nav")
        .evaluate((el) => window.getComputedStyle(el).flexDirection),
    ).toBe("row");
    const start = await manifest();
    console.log("project ready");
    const png = await app.evaluate(({ nativeImage }) => [
      ...nativeImage
        .createFromBitmap(
          Buffer.from(
            Array.from({ length: 32 * 40 }, () => [80, 120, 160, 255]).flat(),
          ),
          { width: 32, height: 40 },
        )
        .toPNG(),
    ]);
    const jpg = await app.evaluate(
      ({ nativeImage }, png) => [
        ...nativeImage.createFromBuffer(Buffer.from(png)).toJPEG(90),
      ],
      png,
    );
    const webp = await page.evaluate(async () => {
      const canvas = document.createElement("canvas");
      canvas.width = 20;
      canvas.height = 24;
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#907050";
      ctx.fillRect(0, 0, 20, 24);
      const blob = await new Promise((resolve) =>
        canvas.toBlob(resolve, "image/webp", 1),
      );
      return [...new Uint8Array(await blob.arrayBuffer())];
    });
    const paths = [
      path.join(root, "reference.png"),
      path.join(root, "reference.jpg"),
    ];
    await fs.writeFile(paths[0], Buffer.from(png));
    await fs.writeFile(paths[1], Buffer.from(jpg));
    await chooser(paths);
    await page
      .getByRole("button", { name: "Referenzbilder hinzufügen …", exact: true })
      .click();
    const creator = page.locator(".style-creator");
    await expect(
      creator.getByText("2 von 6 Bildern", { exact: true }),
    ).toBeVisible();
    await creator
      .locator("fieldset > div")
      .first()
      .evaluate((element, bytes) => {
        const transfer = new DataTransfer();
        transfer.items.add(
          new File([new Uint8Array(bytes)], "reference.webp", {
            type: "image/webp",
          }),
        );
        element.dispatchEvent(
          new DragEvent("drop", {
            bubbles: true,
            cancelable: true,
            dataTransfer: transfer,
          }),
        );
      }, webp);
    await expect(
      creator.getByText("3 von 6 Bildern", { exact: true }),
    ).toBeVisible();
    expect(await manifest()).toEqual(start);
    await creator.getByRole("button", { name: "Weiter", exact: true }).click();
    await creator
      .getByRole("button", { name: "Lokal analysieren", exact: true })
      .click();
    await expect(
      creator.getByLabel("Vorgeschlagener Stilname", { exact: true }),
    ).toBeVisible();
    expect(await manifest()).toEqual(start);
    await creator
      .getByLabel("Vorgeschlagener Stilname", { exact: true })
      .fill("Independent creator study");
    await creator.getByLabel(/Ich habe die Vorschläge geprüft/).check();
    await creator
      .getByRole("button", { name: "Als neuen Stil speichern", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: /Independent creator study/ }),
    ).toBeVisible();
    const saved = await manifest();
    console.log("style saved");
    expect(saved.artDirections).toHaveLength(start.artDirections.length + 1);
    expect(saved.defaultArtDirectionId).toBe(start.defaultArtDirectionId);
    expect(saved.masters).toEqual(start.masters);
    expect(saved.styleAssets.map((a) => a.format).sort()).toEqual([
      "jpg",
      "png",
      "webp",
    ]);
    expect(saved.artDirections.at(-1).portableStyle.creator).toMatchObject({
      version: "lf-style-creator-v1",
      scopeReviewed: true,
    });
    // Separate native semantic fixture: explicit check and analyze clicks, never a real Codex process.
    await page
      .getByRole("button", { name: "Stil erstellen", exact: true })
      .click();
    await chooser([paths[0]]);
    await creator
      .getByRole("button", { name: "Referenzbilder hinzufügen …", exact: true })
      .click();
    await expect(
      creator.getByText("1 von 6 Bildern", { exact: true }),
    ).toBeVisible();
    await creator.getByRole("button", { name: "Weiter", exact: true }).click();
    await creator
      .getByRole("button", { name: "Codex-Bildanalyse prüfen", exact: true })
      .click();
    await expect(
      creator.getByRole("button", {
        name: "Mit Codex analysieren",
        exact: true,
      }),
    ).toBeEnabled();
    await creator
      .getByRole("button", { name: "Mit Codex analysieren", exact: true })
      .click();
    await expect(
      creator.getByText(/Semantische Analyse abgeschlossen/).first(),
    ).toBeVisible();
    await fs.writeFile(path.join(root, "scenario"), "hang");
    await creator
      .getByRole("button", { name: "Codex-Bildanalyse prüfen", exact: true })
      .click();
    await creator
      .getByRole("button", { name: "Mit Codex analysieren", exact: true })
      .click();
    const cancel = page.getByRole("button", {
      name: "Analyse abbrechen",
      exact: true,
    });
    await expect(cancel).toBeEnabled();
    await expect
      .poll(
        async () =>
          (await fs.readFile(path.join(root, "trace"), "utf8"))
            .trim()
            .split("\n")
            .map((line) => JSON.parse(line))
            .filter((m) => m.method === "turn/start").length,
      )
      .toBe(2);
    await expect(
      page.getByRole("button", { name: "Projekt schließen", exact: true }),
    ).toBeDisabled();
    await cancel.click();
    await expect(
      creator.getByText(/Codex-Analyse abgebrochen/).first(),
    ).toBeVisible();
    await expect(
      creator.getByRole("button", { name: "Lokal analysieren", exact: true }),
    ).toBeEnabled();
    await creator
      .getByRole("button", { name: "Lokal analysieren", exact: true })
      .click();
    await expect(
      creator.getByLabel("Vorgeschlagener Stilname", { exact: true }),
    ).toHaveValue("Fixture rendering study");
    await fs.mkdir("artifacts", { recursive: true });
    await page.setViewportSize({ width: 960, height: 720 });
    await page.screenshot({ path: "artifacts/style-creator-960.png" });
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.screenshot({ path: "artifacts/style-creator-1440.png" });
    const trace = (await fs.readFile(path.join(root, "trace"), "utf8"))
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
    expect(trace.filter((m) => m.method === "turn/start")).toHaveLength(2);
    expect(
      trace
        .find((m) => m.method === "turn/start")
        .params.input.filter((i) => i.type === "localImage"),
    ).toHaveLength(1);
    // Explicitly discard transient second draft before restart.
    await creator
      .getByRole("button", { name: "Stilentwurf verwerfen", exact: true })
      .click();
    await app.close();
    app = undefined;
    await launch();
    await chooser([project]);
    await page.getByRole("button", { name: /^Projekt öffnen(?: …)?$/ }).click();
    await nav(page, "Art Direction");
    await expect(
      page.getByRole("heading", { name: /Independent creator study/ }),
    ).toBeVisible();
    expect(await manifest()).toEqual(saved);
    expect(
      await page.evaluate(() => window.laceframe.styleAnalysisStatus()),
    ).toMatchObject({ ok: true, value: { state: "idle" } });
    expect(errors).toEqual([]);
    console.log(
      JSON.stringify({
        passed: true,
        formats: ["png", "jpg", "webp"],
        technicalWorker: true,
        semantic: "protocol-fixture-only",
        modelTurns: 0,
        originalProjectPreserved: true,
        cancellation: true,
        restart: true,
        root,
      }),
    );
  } finally {
    if (app) await app.close();
    await fs.rm(root, { recursive: true, force: true });
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
