const { studioStep, studioExpert } = require("./smoke-ui.cjs");
const { reviewImport } = require("./historical-master-fixture.cjs");
const { selectMaskTool, zoomMask } = require("./smoke-ui.cjs");
const { field, image, text, nav } = require("./smoke-ui.cjs");
// Packaged Electron integration with a protocol fixture. No live AI calls.
const { _electron: electron, expect } = require("@playwright/test");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
(async () => {
  const root = await fs.mkdtemp(
    path.join(os.tmpdir(), "laceframe-native-desktop-"),
  );
  const project = path.join(root, "project");
  const bin = path.join(root, "bin");
  await fs.mkdir(project);
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
  const env = {
    ...process.env,
    PATH: bin + path.delimiter + process.env.PATH,
    CODEX_HOME: root,
    LACEFRAME_TEST_ROOT: root,
    LACEFRAME_TEST_SCENARIO: "delayed",
  };
  delete env.ELECTRON_RUN_AS_NODE;
  let app;
  const errors = [];
  try {
    app = await electron.launch({
      executablePath: path.resolve("out/Laceframe-linux-x64/laceframe"),
      args: ["--user-data-dir=" + path.join(root, "user-data")],
      env,
    });
    let page = await app.firstWindow();
    await page.getByRole("combobox", {name:/^(Language|Sprache)$/}).selectOption("de");
    page.setDefaultTimeout(15000);
    page.on("pageerror", (error) => errors.push(error.message));
    await expect(
      page.getByRole("button", { name: "Neues Projekt", exact: true }),
    ).toBeVisible({ timeout: 25000 });
    await app.evaluate(({ dialog }, directory) => {
      dialog.showOpenDialog = async () => ({
        canceled: false,
        filePaths: [directory],
      });
    }, project);
    await require("./smoke-ui.cjs").prepareProjectCreation(page);
    await field(page, "Projektname", { exact: true }).fill("Native smoke");
    await page
      .getByRole("button", { name: "Projekt erstellen …", exact: true })
      .click();
    await field(page, "Neue Figur", { exact: true }).fill("Synthetic Native");
    await page
      .getByRole("button", { name: "Figur erstellen", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Synthetic Native", exact: true }),
    ).toBeVisible();
    const bytes = await app.evaluate(({ nativeImage }) => [
      ...nativeImage
        .createFromBitmap(
          (() => {
            const b = Buffer.alloc(600 * 400 * 4, 160);
            for (let y = 0; y < 400; y++)
              for (let x = 0; x < 600; x++)
                if (!x || !y || x === 599 || y === 399)
                  b[(y * 600 + x) * 4 + 3] = 0;
            return b;
          })(),
          {
            width: 600,
            height: 400,
          },
        )
        .toPNG(),
    ]);
    await page.evaluate(async (bytes) => {
      const transfer = new DataTransfer();
      transfer.items.add(
        new File([new Uint8Array(bytes)], "source.png", { type: "image/png" }),
      );
      document
        .querySelector(".app")
        .dispatchEvent(
          new DragEvent("drop", { bubbles: true, dataTransfer: transfer }),
        );
    }, bytes);
    await reviewImport(page);
    await page
      .getByRole("button", {
        name: "Freigegebenen Master sperren",
        exact: true,
      })
      .click();
    const thread = "00000000-0000-4000-8000-000000000123";
    const output = path.join(root, "generated_images", thread);
    await fs.mkdir(output, { recursive: true });
    const resultBytes = await app.evaluate(({ nativeImage }) => [
      ...nativeImage
        .createFromBitmap(
          (() => {
            const b = Buffer.alloc(400 * 600 * 4, 210);
            for (let y = 0; y < 600; y++)
              for (let x = 0; x < 400; x++)
                if (!x || !y || x === 399 || y === 599)
                  b[(y * 400 + x) * 4 + 3] = 0;
            return b;
          })(),
          {
            width: 400,
            height: 600,
          },
        )
        .toPNG(),
    ]);
    await fs.writeFile(
      path.join(output, "result.png"),
      Buffer.from(resultBytes),
    );
    await nav(page, "Studio");
    await require("./smoke-ui.cjs").studioMode(page, "expression");
    await studioStep(page, "Auswählen");
    await field(page, "Studio Anbieter", { exact: true }).selectOption(
      "codex-native",
    );
    await studioStep(page, "Erzeugen");
    await expect(
      page.getByRole("status", { name: "Codex Status" }),
    ).toContainText("Codex bereit");
    // Exercise actual style/profile UI before the explicit fixture generation.
    await nav(page, "Art Direction");
    await page.getByRole("button", {name:"Stildetails",exact:true}).click();
    await field(page, "Stilname", { exact: true }).fill("Shared Noir");
    await field(
      page,
      "Darstellung-Regeln (ohne Charakter- oder Outfitmerkmale)",
      {
        exact: true,
      },
    ).fill("Shared crisp contours only.");
    await page
      .getByRole("button", { name: "Stil anlegen und auswählen", exact: true })
      .click();
    await expect(
      field(page, "Stilbibliothek Profil", { exact: true }),
    ).toContainText("Shared Noir");
    await page
      .getByRole("button", { name: "Weiteren Stil anlegen", exact: true })
      .click();
    await field(page, "Stilname", { exact: true }).fill("Alternate Ink");
    await field(
      page,
      "Darstellung-Regeln (ohne Charakter- oder Outfitmerkmale)",
      {
        exact: true,
      },
    ).fill("Alternate fine ink contours.");
    await page
      .getByRole("button", { name: "Stil anlegen und auswählen", exact: true })
      .click();
    await expect(
      field(page, "Stilbibliothek Profil", { exact: true }),
    ).toContainText("Alternate Ink");
    await field(page, "Stilbibliothek Profil", { exact: true }).selectOption({
      label: "Shared Noir",
    });
    await page
      .getByRole("button", {
        name: "Als Projektstandard festlegen",
        exact: true,
      })
      .click();
    // Real file chooser and WebP drop into the style library; no portrait data.
    const styleSource = path.join(root, "style-a.png");
    await fs.writeFile(styleSource, Buffer.from(bytes));
    await app.evaluate(({ dialog }, file) => {
      dialog.showOpenDialog = async () => ({
        canceled: false,
        filePaths: [file],
      });
    }, styleSource);
    await page
      .getByRole("button", { name: "Stilbild importieren …", exact: true })
      .click();
    await expect(
      image(page, "Stil 1 · style-a.png", { exact: true }),
    ).toBeVisible();
    await page.evaluate(async (bytes) => {
      const bitmap = await window.createImageBitmap(
        new window.Blob([new Uint8Array(bytes)], { type: "image/png" }),
      );
      const canvas = document.createElement("canvas");
      canvas.width = 16;
      canvas.height = 24;
      canvas.getContext("2d").drawImage(bitmap, 0, 0, 16, 24);
      const blob = await new Promise((resolve) =>
        canvas.toBlob(resolve, "image/webp"),
      );
      const transfer = new DataTransfer();
      transfer.items.add(
        new File([blob], "style-b.webp", { type: "image/webp" }),
      );
      document
        .querySelector(".style-reference-drop")
        .dispatchEvent(
          new DragEvent("drop", { bubbles: true, dataTransfer: transfer }),
        );
    }, resultBytes);
    await expect(
      image(page, "Stil 2 · style-b.webp", { exact: true }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Stilreferenz 1 entfernen", exact: true })
      .click();
    await expect(
      image(page, "Stil 1 · style-b.webp", { exact: true }),
    ).toBeVisible();
    const reuse = field(page, "Stilreferenz wiederverwenden", {
      exact: true,
    });
    await reuse.selectOption(
      await reuse
        .locator("option")
        .filter({ hasText: /style-a.png/ })
        .getAttribute("value"),
    );
    await expect(
      image(page, "Stil 2 · style-a.png", { exact: true }),
    ).toBeVisible();
    const styleRevision = JSON.parse(
      await fs.readFile(path.join(project, "laceframe.json"), "utf8"),
    ).artDirections.find((a) => a.name === "Shared Noir").revision;
    await field(page, "Stilrevision ansehen", { exact: true }).selectOption(
      "2",
    );
    await expect(
      page.getByRole("button", { name: "Stilrevision speichern", exact: true }),
    ).toBeDisabled();
    await expect(
      image(page, "Stil 1 · style-a.png", { exact: true }),
    ).toBeVisible();
    await field(page, "Stilrevision ansehen", { exact: true }).selectOption(
      String(styleRevision),
    );
    await expect(
      page.getByRole("button", { name: "Stilrevision speichern", exact: true }),
    ).toBeEnabled();
    await app.evaluate(({ dialog }, directory) => {
      dialog.showOpenDialog = async () => ({
        canceled: false,
        filePaths: [directory],
      });
    }, project);
    await nav(page, "Studio");
    await studioStep(page, "Auswählen");
    await page
      .locator(".studio-editor:visible")
      .getByRole("button", { name: "Expression bearbeiten", exact: true })
      .click();
    await field(page, "Persönlicher Ausdruck", { exact: true }).fill(
      "Direct unwavering gaze for first character.",
    );
    await page
      .getByRole("button", {
        name: "Persönlichen Ausdruck speichern",
        exact: true,
      })
      .click();
    await page
      .getByRole("button", { name: "Zurück zum Studio", exact: true })
      .filter({ visible: true })
      .click();
    await studioExpert(page);
    await field(page, "Promptmodus", { exact: true }).selectOption(
      "supplement",
    );
    await studioExpert(page);
    await field(page, "Ergänzende Anweisung", { exact: true }).fill(
      "Native pipeline assertion.",
    );
    await studioExpert(page);
    await field(page, "Promptmodus", { exact: true }).selectOption("expert");
    await studioExpert(page);
    await field(page, "Arbeits-Prompt", { exact: true }).fill(
      (await field(page, "Arbeits-Prompt", { exact: true }).inputValue()) +
        "\nReviewed expert override.",
    );
    const generate = page.getByRole("button", {
      name: "Expression generieren",
      exact: true,
    });
    await studioStep(page, "Erzeugen");
    await expect(generate).toBeEnabled();
    await generate.click();
    await expect(generate).toBeDisabled();
    await expect(
      page.getByRole("status", { name: "Codex Status" }),
    ).toContainText("Bildwerkzeug arbeitet");
    await expect(
      field(page, "Generierungszeit", { exact: true }),
    ).toContainText(/Laufzeit 00:00:0[1-9]/);
    await expect(
      page.getByRole("status", { name: "Codex Status" }),
    ).toContainText("Generierung abgeschlossen", { timeout: 15000 });
    await expect(image(page, "Neuer Expressionentwurf · ungeprüft")).toBeVisible();
    await expect(generate).toBeEnabled();
    await expect(
      field(page, "Generierungszeit", { exact: true }),
    ).toContainText(/Generiert in 00:00:0[1-9]/);
    await studioStep(page, "Bearbeiten");
    // Actual registered canvas, native dimensions, keyboard/mouse/touch and shared zoom/pan.
    const comparison = page.locator(".studio-editor:visible .create-result > .master-compare");
    const slider = comparison.getByRole("slider", {
      name: "Before/After-Vergleich",
      exact: true,
    });
    await expect(slider).toHaveAttribute("aria-valuenow", "50");
    await slider.focus();
    await page.keyboard.press("ArrowRight");
    await expect(slider).toHaveAttribute("aria-valuenow", "51");
    await page.keyboard.press("Shift+ArrowLeft");
    await expect(slider).toHaveAttribute("aria-valuenow", "41");
    await page.keyboard.press("Home");
    await expect(slider).toHaveAttribute("aria-valuenow", "0");
    await page.keyboard.press("End");
    await expect(slider).toHaveAttribute("aria-valuenow", "100");
    await comparison
      .getByRole("button", { name: "Ansicht zurücksetzen", exact: true })
      .click();
    await slider.scrollIntoViewIfNeeded();
    let canvas = await comparison.locator(".compare-stage").boundingBox();
    let handle = await slider.locator("span").boundingBox();
    await page.mouse.move(
      handle.x + handle.width / 2,
      handle.y + handle.height / 2,
    );
    await page.mouse.down();
    await page.mouse.move(
      canvas.x + canvas.width * 0.75,
      handle.y + handle.height / 2,
      { steps: 8 },
    );
    await page.mouse.up();
    await expect(slider).toHaveAttribute("aria-valuenow", /7[45]/);
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Emulation.setTouchEmulationEnabled", { enabled: true });
    handle = await slider.locator("span").boundingBox();
    const y = handle.y + handle.height / 2;
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{ x: handle.x + handle.width / 2, y }],
    });
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{ x: canvas.x + canvas.width * 0.25, y }],
    });
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });
    await expect(slider).toHaveAttribute("aria-valuenow", /2[45]/);
    await cdp.send("Emulation.setTouchEmulationEnabled", { enabled: false });
    await cdp.detach();
    await comparison.getByLabel("Studio Zoom", { exact: true }).selectOption("100");
    const rects = () =>
      comparison.locator(".compare-stage img").evaluateAll((images) =>
        images.map((img) => {
          const r = img.getBoundingClientRect();
          return { x: r.x, y: r.y, width: r.width, height: r.height };
        }),
      );
    let registered = await rects();
    expect(registered[0]).toMatchObject({
      x: registered[1].x,
      y: registered[1].y,
      width: 600,
      height: 400,
    });
    expect(registered[1]).toMatchObject({ width: 400, height: 600 });
    const viewport = comparison.locator(".compare-viewport");
    await viewport.focus();
    await page.keyboard.press("ArrowRight");
    const panned = await rects();
    expect(panned[0].x).toBe(registered[0].x - 24);
    expect(panned[1].x).toBe(panned[0].x);
    const box = await viewport.boundingBox();
    await page.mouse.move(box.x + 20, box.y + 30);
    await page.mouse.down();
    await page.mouse.move(box.x + 50, box.y + 50);
    await page.mouse.up();
    registered = await rects();
    expect(registered[0].x).toBe(panned[0].x + 30);
    expect(registered[1].y).toBe(registered[0].y);
    await comparison.getByLabel("Vergleichsmodus", { exact: true }).selectOption(
      "overlay",
    );
    await comparison.getByLabel("Overlay-Deckkraft", { exact: true }).fill("25");
    await expect(comparison.getByAltText("Create · Ergebnisvorschau")).toHaveCSS(
      "opacity",
      "0.25",
    );
    await expect(comparison.getByText(/Abweichende Abmessungen: Master/)).toBeVisible();
    await comparison
      .getByRole("button", { name: "Ansicht zurücksetzen", exact: true })
      .click();
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].setSize(960, 720),
    );
    await expect
      .poll(() =>
        page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      )
      .toBe(true);
    await fs.mkdir("artifacts", { recursive: true });
    await studioExpert(page);
    await expect(page.locator(".studio-editor:visible .prompt-drawer")).toBeVisible();
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({
      path: "artifacts/create-quality-960.png",
      fullPage: true,
    });
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].setSize(1440, 900),
    );
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({
      path: "artifacts/create-quality-1440.png",
      fullPage: true,
    });
    await studioStep(page, "Freigeben");
    await page
      .getByRole("button", { name: "Als Expression freigeben", exact: true })
      .click();
    await expect(page.locator(".notice")).toHaveText(
      "Als Expression freigegeben.",
    );
    const manifest = async () =>
      JSON.parse(
        await fs.readFile(path.join(project, "laceframe.json"), "utf8"),
      );
    let p = await manifest();
    expect(p.assets[0]).toMatchObject({
      providerId: "codex-native",
      status: "approved",
      masterId: p.masters[0].id,
      masterSha256: p.masters[0].sha256,
      attemptId: p.attempts[0].id,
      promptRevisionId: p.attempts[0].promptRevision.id,
    });
    expect(p.attempts[0].promptRevision.prompt).toContain(
      "Native pipeline assertion.",
    );
    expect(p.attempts[0]).toMatchObject({
      artDirectionId: p.defaultArtDirectionId,
      artDirectionRevision: styleRevision,
      expressionPerformance: "Direct unwavering gaze for first character.",
    });
    expect(p.attempts[0].promptRevision.prompt).toContain(
      "Shared crisp contours only.",
    );
    expect(p.attempts[0].promptRevision.prompt).toContain(
      "Direct unwavering gaze for first character.",
    );
    const rpc = (await fs.readFile(path.join(root, "trace.jsonl"), "utf8"))
      .trim()
      .split("\n")
      .map(JSON.parse);
    expect(
      rpc.find((m) => m.method === "turn/start").params.input[0].text,
    ).toContain("Shared crisp contours only.");
    expect(
      rpc
        .find((m) => m.method === "turn/start")
        .params.input.filter((i) => i.type === "localImage"),
    ).toHaveLength(3);
    expect(p.attempts[0].styleReferences).toHaveLength(2);
    expect(
      rpc
        .find((m) => m.method === "turn/start")
        .params.input.filter((i) => i.type === "localImage"),
    ).toHaveLength(3);
    expect(p.attempts[0].styleReferences).toHaveLength(2);
    await fs.writeFile(path.join(root, "scenario"), "image-failed");
    await studioStep(page, "Erzeugen");
    await generate.click();
    await expect(
      page.getByRole("status", { name: "Codex Status" }),
    ).toContainText("fehlgeschlagen", { timeout: 15000 });
    p = await manifest();
    expect(p.assets).toHaveLength(1);
    expect(p.attempts).toHaveLength(2);
    expect(p.attempts[0].execution).toMatchObject({
      status: "completed",
      durationMs: expect.any(Number),
      startedAt: expect.any(String),
      endedAt: expect.any(String),
    });
    expect(p.attempts[1].execution.status).toBe("failed");
    await expect(
      field(page, "Generierungszeit", { exact: true }),
    ).toContainText("Fehlgeschlagen in");
    await expect(generate).toBeEnabled();
    await fs.writeFile(path.join(root, "scenario"), "hang");
    await studioStep(page, "Erzeugen");
    await expect(generate).toBeEnabled();
    await generate.click();
    await expect(
      page.getByRole("button", { name: "Generierung abbrechen", exact: true }),
    ).toBeVisible();
    await nav(page, "Library");
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    const cancel = page.getByRole("button", {
      name: "Generierung abbrechen",
      exact: true,
    });
    await expect(cancel).toBeInViewport();
    await expect(cancel).toBeEnabled();
    await expect(generate).toBeDisabled();
    const locked = await page.evaluate(() =>
      window.laceframe.command({
        type: "addCharacter",
        name: "Should be blocked",
      }),
    );
    expect(locked.ok).toBe(false);
    await page
      .getByRole("button", { name: "Generierung abbrechen", exact: true })
      .click();
    await expect
      .poll(async () => (await manifest()).attempts[2].execution.status)
      .toBe("cancelled");
    await nav(page, "Studio");
    await expect(
      page.getByRole("status", { name: "Codex Status" }),
    ).toContainText("abgebrochen", { timeout: 15000 });
    expect((await manifest()).assets).toHaveLength(1);
    expect((await manifest()).attempts[2].execution.status).toBe("cancelled");
    await expect(
      field(page, "Generierungszeit", { exact: true }),
    ).toContainText("Abgebrochen in");
    await expect(generate).toBeEnabled();
    await fs.writeFile(path.join(root, "scenario"), "success");
    await generate.click();
    await expect(
      page.getByRole("status", { name: "Codex Status" }),
    ).toContainText("Generierung läuft");
    await expect(
      page.getByRole("status", { name: "Codex Status" }),
    ).toContainText("Generierung abgeschlossen");
    await expect(generate).toBeEnabled();
    expect((await manifest()).assets).toHaveLength(2);
    expect((await manifest()).attempts[3].execution.status).toBe("completed");
    // Editing style creates a new revision without rewriting saved attempts.
    await nav(page, "Art Direction");
    await page.getByRole("button", {name:"Stildetails",exact:true}).click();
    const historical = (await manifest()).attempts;
    await field(
      page,
      "Darstellung-Regeln (ohne Charakter- oder Outfitmerkmale)",
      {
        exact: true,
      },
    ).fill("Revised crisp contours only.");
    await page
      .getByRole("button", { name: "Stilrevision speichern", exact: true })
      .click();
    await expect(
      field(page, "Stilrevision ansehen", { exact: true }),
    ).toHaveValue(String(styleRevision + 1));
    await nav(page, "Studio");
    await studioExpert(page);
    await expect(
      page.getByRole("button", {
        name: "Neue Vorlage übernehmen",
        exact: true,
      }),
    ).toBeVisible();
    await require("./smoke-ui.cjs").blockedGeneration(page, generate);
    await page
      .getByRole("button", { name: "Neue Vorlage übernehmen", exact: true })
      .click();
    await expect(generate).toBeEnabled();
    expect((await manifest()).attempts).toEqual(historical);
    // Inspect history without replacing the current working prompt or settings.
    const workingText = await field(page, "Arbeits-Prompt", {
      exact: true,
    }).inputValue();
    await studioStep(page, "Auswählen");
    const workingMaster = await field(page, "Studio Masterversion", {
      exact: true,
    }).inputValue();
    await studioExpert(page);
    const history = page.locator(
      ".studio-editor:not([hidden]) .attempt-history",
    );
    await expect(history.getByRole("heading", {name:/Versuchsverlauf/})).toBeVisible();
    await history.locator(":scope > button").last().click();
    await expect(field(page, "Arbeits-Prompt", { exact: true })).toHaveValue(
      workingText,
    );
    await studioStep(page, "Auswählen");
    await expect(
      field(page, "Studio Masterversion", { exact: true }),
    ).toHaveValue(workingMaster);
    await studioExpert(page);
    await history
      .getByText("Historischen Prompt ansehen", { exact: true })
      .click();
    await expect(
      history.getByLabel("Historischer Expression-Prompt", { exact: true }),
    ).toHaveText(historical[0].promptRevision.prompt);
    expect((await manifest()).attempts).toEqual(historical);

    // A second identity uses its own immutable master and personal direction.
    await page.getByRole("button", { name: /Characters$/ }).click();
    await field(page, "Neue Figur", { exact: true }).fill("Synthetic Other");
    await page
      .getByRole("button", { name: "Figur erstellen", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Synthetic Other", exact: true }),
    ).toBeVisible();
    await page.evaluate((bytes) => {
      const transfer = new DataTransfer();
      transfer.items.add(
        new File([new Uint8Array(bytes)], "other.png", { type: "image/png" }),
      );
      document
        .querySelector(".app")
        .dispatchEvent(
          new DragEvent("drop", { bubbles: true, dataTransfer: transfer }),
        );
    }, resultBytes);
    await reviewImport(page);
    await page
      .getByRole("button", {
        name: "Freigegebenen Master sperren",
        exact: true,
      })
      .click();
    await nav(page, "Studio");
    await studioStep(page, "Auswählen");
    await field(page, "Studio Anbieter", { exact: true }).selectOption(
      "codex-native",
    );
    await studioStep(page, "Auswählen");
    await page
      .locator(".studio-editor:visible")
      .getByRole("button", { name: "Expression bearbeiten", exact: true })
      .click();
    await expect(
      field(page, "Persönlicher Ausdruck", { exact: true }),
    ).toHaveValue("");
    await field(page, "Persönlicher Ausdruck", { exact: true }).fill(
      "Lowered gaze for second character.",
    );
    await page
      .getByRole("button", {
        name: "Persönlichen Ausdruck speichern",
        exact: true,
      })
      .click();
    await page
      .getByRole("button", { name: "Zurück zum Studio", exact: true })
      .filter({ visible: true })
      .click();

    await studioStep(page, "Erzeugen");
    await expect(generate).toBeEnabled();
    await generate.click();
    await expect(
      page.getByRole("status", { name: "Codex Status" }),
    ).toContainText("Generierung läuft");
    await expect(
      page.getByRole("status", { name: "Codex Status" }),
    ).toContainText("Generierung abgeschlossen");
    const two = await manifest(),
      second = two.attempts.at(-1);
    expect(two.attempts.slice(0, 4)).toEqual(historical);
    expect(second.artDirectionId).toBe(two.defaultArtDirectionId);
    expect(second.artDirectionRevision).toBe(styleRevision + 1);
    expect(second.promptRevision.prompt).toContain(
      "Lowered gaze for second character.",
    );
    expect(second.promptRevision.prompt).not.toContain(
      "Direct unwavering gaze for first character.",
    );
    expect(second.masterId).toBe(two.masters[1].id);
    expect(two.assets.at(-1).masterId).toBe(two.masters[1].id);
    await field(page, "Studio Figur", { exact: true }).selectOption(
      two.masters[0].characterId,
    );
    await expect(
      page.locator(".studio-editor:visible .studio-reference"),
    ).toContainText("Synthetic Native");
    await page.evaluate(() => window.scrollTo(0, 0));

    await studioStep(page, "Auswählen");
    await page
      .locator(".studio-editor:visible")
      .getByRole("button", { name: "Expression bearbeiten", exact: true })
      .click();
    await expect(
      field(page, "Persönlicher Ausdruck", { exact: true }),
    ).toHaveValue("Direct unwavering gaze for first character.");
    await page
      .getByRole("button", { name: "Zurück zum Studio", exact: true })
      .filter({ visible: true })
      .click();
    // Latest historical prompt still needs explicit adoption after style revision.
    const adopt = page.getByRole("button", {
      name: "Neue Vorlage übernehmen",
      exact: true,
    });
    if (await adopt.isVisible()) await adopt.click();
    await studioStep(page, "Auswählen");
    await field(page, "Charakter Stilzuordnung", { exact: true }).selectOption(
      "master",
    );
    await expect(field(page, "Charakter Stilzuordnung", {exact: true})).toHaveValue("master");
    await studioExpert(page);
    await expect(
      field(page, "Arbeits-Prompt", { exact: true }),
    ).not.toHaveValue(/STYLE LOCK —/);
    await studioStep(page, "Erzeugen");
    await expect(generate).toBeEnabled();
    await generate.click();
    await expect(
      page.getByRole("status", { name: "Codex Status" }),
    ).toContainText("Generierung läuft");
    await expect(
      page.getByRole("status", { name: "Codex Status" }),
    ).toContainText("Generierung abgeschlossen");
    const masterOnly = (await manifest()).attempts.at(-1);
    expect(masterOnly.styleReferences).toEqual([]);
    expect(masterOnly.artDirectionId).toBeUndefined();
    const lastRpc = (await fs.readFile(path.join(root, "trace.jsonl"), "utf8"))
      .trim()
      .split("\n")
      .map(JSON.parse)
      .filter((m) => m.method === "turn/start")
      .at(-1);
    expect(
      lastRpc.params.input.filter((i) => i.type === "localImage"),
    ).toHaveLength(1);
    {
      // 02D: actual editor -> persisted mask -> fixture raw -> deterministic composite.
      const { PNG } = require("pngjs");
      await studioStep(page, "Bearbeiten");
      await field(page, "Bearbeitungsmodus", { exact: true }).selectOption(
        "hard",
      );
      await studioStep(page, "Erzeugen");
      await require("./smoke-ui.cjs").blockedGeneration(page, generate);
      await studioStep(page, "Bearbeiten");
      await page
        .getByRole("button", { name: "Maske erstellen", exact: true })
        .click();
      const editor = page.getByRole("dialog", {
        name: "Bearbeitungsmaske",
        exact: true,
      });
      await expect(editor.getByAltText("Masken-Master")).toBeVisible();
      if (
        (await editor.locator(".editor-advanced").getAttribute("open")) === null
      )
        await editor.locator(".editor-advanced summary").click();
      await editor
        .getByLabel("Maskenname", { exact: true })
        .fill("Synthetic expression region");
      await editor.getByLabel("Pinselgröße", { exact: true }).fill("80");
      await editor.getByLabel("Maskenwert", { exact: true }).fill("128");
      const maskImage = editor.getByAltText("Masken-Master");
      let box = await maskImage.boundingBox();
      await page.mouse.move(box.x + box.width * 0.45, box.y + box.height * 0.5);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width * 0.6, box.y + box.height * 0.5, {
        steps: 8,
      });
      await expect
        .poll(() =>
          editor.locator("canvas").evaluate((c) => {
            const a = c
              .getContext("2d")
              .getImageData(0, 0, c.width, c.height).data;
            return a.some((v, i) => i % 4 === 3 && v > 0);
          }),
        )
        .toBe(true);
      await expect(
        editor.getByRole("button", {
          name: "Maskenrevision speichern",
          exact: true,
        }),
      ).toBeDisabled();
      await page.mouse.up();
      const maskAlpha = () =>
        editor.locator("canvas").evaluate((c) => {
          const data = c
            .getContext("2d")
            .getImageData(0, 0, c.width, c.height).data;
          let sum = 0;
          for (let i = 3; i < data.length; i += 4) sum += data[i];
          return sum;
        });
      await page.evaluate(
        () =>
          new Promise((resolve) =>
            window.requestAnimationFrame(() =>
              window.requestAnimationFrame(resolve),
            ),
          ),
      );
      const painted = await maskAlpha();
      expect(painted).toBeGreaterThan(0);
      await app.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows()[0].setSize(960, 720),
      );
      await expect
        .poll(() => editor.evaluate((el) => el.scrollWidth <= el.clientWidth))
        .toBe(true);
      await fs.mkdir("artifacts", { recursive: true });
      await page.screenshot({ path: "artifacts/mask-editor-960.png" });
      await app.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows()[0].setSize(1440, 900),
      );

      await editor
        .getByRole("button", { name: "Rückgängig", exact: true })
        .click();
      await expect.poll(maskAlpha).toBe(0);
      await editor
        .getByRole("button", { name: "Wiederholen", exact: true })
        .click();
      await expect.poll(maskAlpha).toBe(painted);
      box = await maskImage.boundingBox();
      await selectMaskTool(editor, "erase");
      await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.5);
      await expect.poll(maskAlpha).toBeLessThan(painted);
      await editor
        .getByRole("button", { name: "Rückgängig", exact: true })
        .click();
      await expect.poll(maskAlpha).toBe(painted);
      if (
        (await editor.locator(".editor-advanced").getAttribute("open")) === null
      )
        await editor.locator(".editor-advanced summary").click();
      await editor
        .getByRole("button", { name: "Maske zurücksetzen", exact: true })
        .click();
      await expect.poll(maskAlpha).toBe(0);
      await editor
        .getByRole("button", { name: "Rückgängig", exact: true })
        .click();
      await expect.poll(maskAlpha).toBe(painted);
      await selectMaskTool(editor, "paint");
      const touch = await page.context().newCDPSession(page);
      const touchPoint = {
        x: box.x + box.width * 0.25,
        y: box.y + box.height * 0.25,
        radiusX: 1,
        radiusY: 1,
        force: 1,
        id: 7,
      };
      await touch.send("Input.dispatchTouchEvent", {
        type: "touchStart",
        touchPoints: [touchPoint],
      });
      await touch.send("Input.dispatchTouchEvent", {
        type: "touchEnd",
        touchPoints: [],
      });
      await expect.poll(maskAlpha).toBeGreaterThan(painted);
      await editor
        .getByLabel("Maskenzeichenfläche", { exact: true })
        .press("Control+z");
      await expect.poll(maskAlpha).toBe(painted);
      await touch.detach();
      await zoomMask(editor, 2);
      await selectMaskTool(editor, "pan");
      const previousTransform = await editor
        .locator(".mask-stage")
        .getAttribute("style");
      await page.mouse.move(box.x + 100, box.y + 100);
      await page.mouse.down();
      await page.mouse.move(box.x + 140, box.y + 120);
      await page.mouse.up();
      expect(
        await editor.locator(".mask-stage").getAttribute("style"),
      ).not.toBe(previousTransform);
      await editor
        .getByRole("button", {
          name: "Einpassen",
          exact: true,
        })
        .click();
      await editor
        .getByRole("button", { name: "Maskenrevision speichern", exact: true })
        .click();
      await expect(editor).not.toBeVisible();
      const maskRecord = (await manifest()).masks.at(-1);
      expect(maskRecord).toMatchObject({
        width: 600,
        height: 400,
        revision: 1,
        masterId: (await manifest()).masters[0].id,
      });
      await page
        .getByRole("button", { name: "Neue Vorlage übernehmen", exact: true })
        .click();
      await studioStep(page, "Erzeugen");
      await expect(generate).toBeEnabled();
      await generate.click();
      await expect(
        page.getByRole("status", { name: "Codex Status" }),
      ).toContainText("Generierung läuft");
      await expect(
        page.getByRole("status", { name: "Codex Status" }),
      ).toContainText("Generierung abgeschlossen");
      await studioStep(page, "Bearbeiten");
      await expect(
        text(page, /Hard Lock blockiert: unterschiedliche Abmessungen/),
      ).toBeVisible();
      await studioStep(page, "Freigeben");
      await expect(
        page.getByRole("button", {
          name: "Als Expression freigeben",
          exact: true,
        }),
      ).toBeDisabled();
      await page
        .getByRole("region", {
          name: "Master und Kandidat vergleichen",
          exact: true,
        })
        .getByLabel("Vergleichsregistrierung", { exact: true })
        .selectOption("visual");
      await expect(text(page, /Nur visuelle Normalisierung/)).toBeVisible();
      await page
        .getByRole("region", {
          name: "Master und Kandidat vergleichen",
          exact: true,
        })
        .getByLabel("Vergleichsregistrierung", { exact: true })
        .selectOption("native");
      // A new synthetic same-size raw result; no scaling of either source.
      const fixture = new PNG({ width: 600, height: 400 });
      for (let i = 0; i < fixture.data.length; i += 4) {
        fixture.data[i] = 210;
        fixture.data[i + 1] = 110;
        fixture.data[i + 2] = 80;
        fixture.data[i + 3] = 255;
      }
      await fs.writeFile(
        path.join(output, "result.png"),
        PNG.sync.write(fixture),
      );
      await studioStep(page, "Erzeugen");
      await expect(generate).toBeEnabled();
      await generate.click();
      await expect(
        page.getByRole("status", { name: "Codex Status" }),
      ).toContainText("Generierung läuft");
      await expect(
        page.getByRole("status", { name: "Codex Status" }),
      ).toContainText("Generierung abgeschlossen");
      await studioStep(page, "Bearbeiten");
      page.once("dialog", (dialog) => dialog.accept());
      await page
        .getByRole("button", {
          name: "Registrierung bestätigen & geschütztes Ergebnis erstellen",
          exact: true,
        })
        .click();
      await expect(page.locator(".notice")).toContainText(
        "Geschütztes Ergebnis erstellt",
      );
      const compositeProject = await manifest(),
        compositeRecord = compositeProject.assets.at(-1);
      expect(compositeRecord.status).toBe("candidate");
      expect(compositeRecord.composite.maskId).toBe(maskRecord.id);
      const readPixels = async (image) =>
        PNG.sync.read(await fs.readFile(path.join(project, image.file)));
      const mp = await readPixels(compositeProject.masters[0]),
        rp = await readPixels(
          compositeProject.assets.find(
            (a) => a.id === compositeRecord.composite.rawId,
          ),
        );
      const cp = await readPixels(compositeRecord),
        wp = await readPixels(maskRecord);
      let protectedPixels = 0,
        editablePixels = 0;
      for (let i = 0; i < wp.data.length; i += 4) {
        const w = wp.data[i];
        if (!w) protectedPixels++;
        else editablePixels++;
        for (let c = 0; c < 4; c++) {
          const expected =
            w === 0
              ? mp.data[i + c]
              : w === 255
                ? rp.data[i + c]
                : c === 3
                  ? Math.round(
                      (mp.data[i + 3] * (255 - w) + rp.data[i + 3] * w) / 255,
                    )
                  : mp.data[i + 3] * (255 - w) + rp.data[i + 3] * w
                    ? Math.round(
                        (mp.data[i + c] * mp.data[i + 3] * (255 - w) +
                          rp.data[i + c] * rp.data[i + 3] * w) /
                          (mp.data[i + 3] * (255 - w) + rp.data[i + 3] * w),
                      )
                    : mp.data[i + c];
          if (cp.data[i + c] !== expected)
            throw new Error(`Composite pixel mismatch ${i}/${c}`);
        }
      }
      expect(protectedPixels).toBeGreaterThan(0);
      expect(editablePixels).toBeGreaterThan(0);
      await page.screenshot({
        path: "artifacts/hard-pixel-composite.png",
        fullPage: true,
      });
      await field(page, "Rohkandidat oder Composite", {
        exact: true,
      }).selectOption("raw");
      await studioStep(page, "Freigeben");
      await expect(
        page.getByRole("button", {
          name: "Als Expression freigeben",
          exact: true,
        }),
      ).toBeDisabled();
      await field(page, "Rohkandidat oder Composite", {
        exact: true,
      }).selectOption("composite");
      await text(page, "Gespeicherte Maskenüberlagerung", {
        exact: true,
      }).click();
      await expect(image(page, "Gespeicherte Maske")).toBeVisible();
      await studioStep(page, "Freigeben");
      await page
        .getByRole("button", { name: "Als Expression freigeben", exact: true })
        .click();
      expect((await manifest()).assets.at(-1).status).toBe("approved");
      await page
        .getByRole("button", { name: "In Bibliothek prüfen", exact: true })
        .click();
      await expect(
        page.getByRole("slider", {
          name: "Before/After-Vergleich",
          exact: true,
        }),
      ).toBeVisible();
      await page
        .getByRole("region", {
          name: "Master und Kandidat vergleichen",
          exact: true,
        })
        .getByLabel("Vergleichsregistrierung", { exact: true })
        .selectOption("visual");
      await expect(text(page, /Nur visuelle Normalisierung/)).toBeVisible();
      await nav(page, "Studio");
      await studioStep(page, "Bearbeiten");
      await page
        .getByRole("button", { name: "Maske bearbeiten", exact: true })
        .click();
      await expect(editor.getByAltText("Masken-Master")).toBeVisible();
      await expect.poll(maskAlpha).toBe(painted);
      await editor
        .getByRole("button", { name: "Editor schließen", exact: true })
        .click();
      await studioStep(page, "Bearbeiten");
      await field(page, "Bearbeitungsmodus", { exact: true }).selectOption(
        "soft",
      );
      await expect(text(page, /Soft Lock nicht verfügbar/)).toBeVisible();
      await studioStep(page, "Erzeugen");
      await require("./smoke-ui.cjs").blockedGeneration(page, generate);
      await studioStep(page, "Bearbeiten");
      await field(page, "Bearbeitungsmodus", { exact: true }).selectOption(
        "none",
      );
      await page
        .getByRole("button", { name: "Neue Vorlage übernehmen", exact: true })
        .click();
    }
    // An unconfirmed schema blocks style-image submission, with an explicit master-only route.
    const turnsBefore = (
      await fs.readFile(path.join(root, "trace.jsonl"), "utf8")
    )
      .trim()
      .split("\n")
      .map(JSON.parse)
      .filter((m) => m.method === "turn/start").length;
    await fs.writeFile(path.join(root, "scenario"), "no-multi");
    await studioStep(page, "Auswählen");
    await field(page, "Charakter Stilzuordnung", { exact: true }).selectOption(
      "project",
    );
    // The mask-mode template was explicitly adopted above and is pristine;
    // switching style now updates it automatically rather than asking twice.
    await studioExpert(page);
    await expect(field(page, "Arbeits-Prompt", { exact: true })).toHaveValue(
      /STYLE LOCK — Shared Noir/,
    );
    await studioExpert(page);
    await expect(
      page.getByRole("heading", {
        name: "Technische Details · Herkunft",
        exact: true,
      }),
    ).toBeVisible();
    await studioExpert(page);
    await page
      .getByRole("button", { name: "Codex-Verfügbarkeit prüfen", exact: true })
      .click();
    await expect(
      page
        .locator(".generation-requirements")
        .getByText(/Mehrfachreferenzen nicht bestätigt/),
    ).toBeVisible();
    await require("./smoke-ui.cjs").blockedGeneration(page, generate);
    await studioStep(page, "Auswählen");
    await field(page, "Charakter Stilzuordnung", { exact: true }).selectOption(
      "master",
    );
    await studioStep(page, "Erzeugen");
    await expect(generate).toBeEnabled();
    expect(
      (await fs.readFile(path.join(root, "trace.jsonl"), "utf8"))
        .trim()
        .split("\n")
        .map(JSON.parse)
        .filter((m) => m.method === "turn/start"),
    ).toHaveLength(turnsBefore);
    await fs.writeFile(path.join(root, "scenario"), "no-auth");
    await studioExpert(page);
    await page
      .getByRole("button", { name: "Codex-Verfügbarkeit prüfen", exact: true })
      .click();
    await expect(
      page.getByRole("status", { name: "Codex Status" }),
    ).toContainText("Nicht mit ChatGPT angemeldet");
    await require("./smoke-ui.cjs").blockedGeneration(page, generate);
    // Close/relaunch/reopen the actual project: masks, composites, reviews and prompts persist exactly.
    const beforeMaskRestart = await manifest();
    await app.close();
    app = await electron.launch({
      executablePath: path.resolve("out/Laceframe-linux-x64/laceframe"),
      args: ["--user-data-dir=" + path.join(root, "user-data")],
      env,
    });
    page = await app.firstWindow();
    await page.getByRole("combobox", {name:/^(Language|Sprache)$/}).selectOption("de");
    page.setDefaultTimeout(15000);
    page.on("pageerror", (error) => errors.push(error.message));
    await app.evaluate(({ dialog }, directory) => {
      dialog.showOpenDialog = async () => ({
        canceled: false,
        filePaths: [directory],
      });
    }, project);
    await page.getByRole("button", { name: /^Projekt öffnen(?: …)?$/ }).click();
    await expect(
      page.getByRole("heading", { name: "Synthetic Native", exact: true }),
    ).toBeVisible();
    await nav(page, "Studio");
    await studioStep(page, "Bearbeiten");
    await expect(field(page, "Bearbeitungsmodus", { exact: true })).toHaveValue(
      "hard",
    );
    await expect(field(page, "Maskenrevision", { exact: true })).toHaveValue(
      beforeMaskRestart.masks.at(-1).id,
    );
    await expect(
      page
        .locator(".create-result .badge.approved")
        .filter({ hasText: "Freigegeben" }),
    ).toBeVisible();
    expect(await manifest()).toEqual(beforeMaskRestart);
    await studioStep(page, "Bearbeiten");
    await page
      .getByRole("button", { name: "Maske bearbeiten", exact: true })
      .click();
    const reopenedEditor = page.getByRole("dialog", {
      name: "Bearbeitungsmaske",
      exact: true,
    });
    await expect(reopenedEditor.getByAltText("Masken-Master")).toBeVisible();
    await expect(
      reopenedEditor.getByLabel("Maskenname", { exact: true }),
    ).toHaveValue("Synthetic expression region");
    await reopenedEditor
      .getByRole("button", { name: "Editor schließen", exact: true })
      .click();
    await fs.mkdir("artifacts", { recursive: true });
    await page.screenshot({
      path: "artifacts/native-provider-smoke.png",
      fullPage: true,
    });
    expect(errors).toEqual([]);
    console.log(
      "PASS packaged native-provider UI: actual IPC/process lifecycle, fixture success/failure/cancel/regeneration, monotonic timer metadata, real slider keyboard/mouse/touch, shared zoom/pan/overlay, PNG/WebP style chooser/drop/thumbnails/history/reuse, ordered multi-reference and master-only jobs, isolated character expression prompts/master references, 960x720/1440x900 layout, retained character drafts and read-only history without working-prompt replacement, project lock, provenance, approval, auth gating. Mask editor draw/erase/undo/redo, immutable mask snapshot, mismatch block, exact RGBA composite assertions, raw/composite approval, shared Library comparison, soft-lock gate. No live AI calls.",
    );
  } catch (error) {
    if (app) {
      const p = await app.firstWindow();
      console.error(await p.locator("body").innerText());
      await fs.mkdir("artifacts", { recursive: true });
      await p.screenshot({
        path: "artifacts/native-smoke-failure.png",
        fullPage: true,
      });
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
