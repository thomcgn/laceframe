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
    const page = await app.firstWindow();
    page.setDefaultTimeout(15000);
    page.on("pageerror", (error) => errors.push(error.message));
    await expect(
      page.getByRole("heading", { name: "Characters", exact: true }),
    ).toBeVisible();
    await app.evaluate(({ dialog }, directory) => {
      dialog.showOpenDialog = async () => ({
        canceled: false,
        filePaths: [directory],
      });
    }, project);
    await page.getByLabel("Projektname", { exact: true }).fill("Native smoke");
    await page
      .getByRole("button", { name: "Projekt erstellen …", exact: true })
      .click();
    await page
      .getByLabel("Neue Figur", { exact: true })
      .fill("Synthetic Native");
    await page
      .getByRole("button", { name: "Figur erstellen", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Synthetic Native", exact: true }),
    ).toBeVisible();
    const bytes = await app.evaluate(({ nativeImage }) => [
      ...nativeImage
        .createFromBitmap(Buffer.alloc(600 * 400 * 4, 160), {
          width: 600,
          height: 400,
        })
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
        .createFromBitmap(Buffer.alloc(400 * 600 * 4, 210), {
          width: 400,
          height: 600,
        })
        .toPNG(),
    ]);
    await fs.writeFile(
      path.join(output, "result.png"),
      Buffer.from(resultBytes),
    );
    await page.getByRole("button", { name: /Create$/ }).click();
    await page
      .getByLabel("Create Anbieter", { exact: true })
      .selectOption("codex-native");
    await expect(
      page.getByRole("status", { name: "Codex Status" }),
    ).toContainText("Codex bereit");
    // Exercise actual style/profile UI before the explicit fixture generation.
    await page
      .getByText("Art Direction · gemeinsamer Spielstil", { exact: true })
      .click();
    await page.getByLabel("Stilname", { exact: true }).fill("Shared Noir");
    await page
      .getByLabel("Rendering-Regeln (ohne Charakter- oder Outfitmerkmale)", {
        exact: true,
      })
      .fill("Shared crisp contours only.");
    await page
      .getByRole("button", { name: "Stil anlegen und auswählen", exact: true })
      .click();
    await expect(
      page.getByLabel("Create Art Direction", { exact: true }),
    ).toContainText("Shared Noir");
    await page
      .getByRole("button", { name: "Weiteren Stil anlegen", exact: true })
      .click();
    await page.getByLabel("Stilname", { exact: true }).fill("Alternate Ink");
    await page
      .getByLabel("Rendering-Regeln (ohne Charakter- oder Outfitmerkmale)", {
        exact: true,
      })
      .fill("Alternate fine ink contours.");
    await page
      .getByRole("button", { name: "Stil anlegen und auswählen", exact: true })
      .click();
    await expect(
      page.getByLabel("Create Art Direction", { exact: true }),
    ).toContainText("Alternate Ink");
    await page
      .getByLabel("Create Art Direction", { exact: true })
      .selectOption({ label: "Shared Noir · V1" });
    await page
      .locator("summary")
      .filter({ hasText: /^Expression Identity/ })
      .click();
    await page
      .getByLabel("Persönlicher Ausdruck", { exact: true })
      .fill("Direct unwavering gaze for first character.");
    await page
      .getByRole("button", {
        name: "Persönlichen Ausdruck speichern",
        exact: true,
      })
      .click();
    await page.getByText("Prompteditor", { exact: true }).click();
    await page
      .getByLabel("Ergänzende Anweisung", { exact: true })
      .fill("Native pipeline assertion.");
    const generate = page.getByRole("button", {
      name: "Mit Masterreferenz generieren",
      exact: true,
    });
    await expect(generate).toBeEnabled();
    await generate.click();
    await expect(generate).toBeDisabled();
    await expect(
      page.getByRole("status", { name: "Codex Status" }),
    ).toContainText("Bildwerkzeug arbeitet");
    await expect(
      page.getByLabel("Generierungszeit", { exact: true }),
    ).toContainText(/Laufzeit 00:00:0[1-9]/);
    await expect(
      page.getByRole("status", { name: "Codex Status" }),
    ).toContainText("Generierung abgeschlossen", { timeout: 15000 });
    await expect(page.getByAltText("Create · Ergebnisvorschau")).toBeVisible();
    await expect(generate).toBeEnabled();
    await expect(
      page.getByLabel("Generierungszeit", { exact: true }),
    ).toContainText(/Generiert in 00:00:0[1-9]/);
    // Actual registered canvas, native dimensions, keyboard/mouse/touch and shared zoom/pan.
    const slider = page.getByRole("slider", {
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
    await page
      .getByRole("button", { name: "Ansicht zurücksetzen", exact: true })
      .click();
    await slider.scrollIntoViewIfNeeded();
    let canvas = await page.locator(".compare-stage").boundingBox();
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
    await page.getByLabel("Create Zoom", { exact: true }).selectOption("100");
    const rects = () =>
      page.locator(".compare-stage img").evaluateAll((images) =>
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
    const viewport = page.locator(".compare-viewport");
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
    await page
      .getByLabel("Vergleichsmodus", { exact: true })
      .selectOption("overlay");
    await page.getByLabel("Overlay-Deckkraft", { exact: true }).fill("25");
    await expect(page.getByAltText("Create · Ergebnisvorschau")).toHaveCSS(
      "opacity",
      "0.25",
    );
    await expect(
      page.getByText(/Abweichende Abmessungen: Master/),
    ).toBeVisible();
    await page
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
    await page.getByText("Prompteditor", { exact: true }).click();
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({
      path: "artifacts/create-quality-960.png",
      fullPage: true,
    });
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].setSize(1440, 1000),
    );
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({
      path: "artifacts/create-quality-1440.png",
      fullPage: true,
    });
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
      artDirectionRevision: 1,
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
      rpc.find((m) => m.method === "turn/start").params.input[1].type,
    ).toBe("localImage");
    await fs.writeFile(path.join(root, "scenario"), "image-failed");
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
      page.getByLabel("Generierungszeit", { exact: true }),
    ).toContainText("Fehlgeschlagen in");
    await expect(generate).toBeEnabled();
    await fs.writeFile(path.join(root, "scenario"), "hang");
    await expect(generate).toBeEnabled();
    await generate.click();
    await expect(
      page.getByRole("button", { name: "Generierung abbrechen", exact: true }),
    ).toBeVisible();
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
    await expect(
      page.getByRole("status", { name: "Codex Status" }),
    ).toContainText("abgebrochen", { timeout: 15000 });
    expect((await manifest()).assets).toHaveLength(1);
    expect((await manifest()).attempts[2].execution.status).toBe("cancelled");
    await expect(
      page.getByLabel("Generierungszeit", { exact: true }),
    ).toContainText("Abgebrochen in");
    await expect(generate).toBeEnabled();
    await fs.writeFile(path.join(root, "scenario"), "success");
    await generate.click();
    await expect(
      page.getByRole("status", { name: "Codex Status" }),
    ).toContainText("Generierung abgeschlossen");
    await expect(generate).toBeEnabled();
    expect((await manifest()).assets).toHaveLength(2);
    expect((await manifest()).attempts[3].execution.status).toBe("completed");
    // Editing style creates a new revision without rewriting saved attempts.
    const historical = (await manifest()).attempts;
    await page
      .getByLabel("Rendering-Regeln (ohne Charakter- oder Outfitmerkmale)", {
        exact: true,
      })
      .fill("Revised crisp contours only.");
    await page
      .getByRole("button", { name: "Stilrevision speichern", exact: true })
      .click();
    await expect(
      page.getByRole("button", {
        name: "Neue Vorlage übernehmen",
        exact: true,
      }),
    ).toBeVisible();
    await expect(generate).toBeDisabled();
    await page
      .getByRole("button", { name: "Neue Vorlage übernehmen", exact: true })
      .click();
    await expect(generate).toBeEnabled();
    expect((await manifest()).attempts).toEqual(historical);
    // A second identity uses its own immutable master and personal direction.
    await page.getByRole("button", { name: /Characters$/ }).click();
    await page
      .getByLabel("Neue Figur", { exact: true })
      .fill("Synthetic Other");
    page.once("dialog", (dialog) => dialog.accept());
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
    await page
      .getByRole("button", {
        name: "Freigegebenen Master sperren",
        exact: true,
      })
      .click();
    await page.getByRole("button", { name: /Create$/ }).click();
    await page
      .getByLabel("Create Anbieter", { exact: true })
      .selectOption("codex-native");
    await page
      .locator("summary")
      .filter({ hasText: /^Expression Identity/ })
      .click();
    await expect(
      page.getByLabel("Persönlicher Ausdruck", { exact: true }),
    ).toHaveValue("");
    await page
      .getByLabel("Persönlicher Ausdruck", { exact: true })
      .fill("Lowered gaze for second character.");
    await page
      .getByRole("button", {
        name: "Persönlichen Ausdruck speichern",
        exact: true,
      })
      .click();
    await expect(generate).toBeEnabled();
    await generate.click();
    await expect(
      page.getByRole("status", { name: "Codex Status" }),
    ).toContainText("Generierung abgeschlossen");
    const two = await manifest(),
      second = two.attempts.at(-1);
    expect(two.attempts.slice(0, 4)).toEqual(historical);
    expect(second.artDirectionId).toBe(two.defaultArtDirectionId);
    expect(second.artDirectionRevision).toBe(2);
    expect(second.promptRevision.prompt).toContain(
      "Lowered gaze for second character.",
    );
    expect(second.promptRevision.prompt).not.toContain(
      "Direct unwavering gaze for first character.",
    );
    expect(second.masterId).toBe(two.masters[1].id);
    expect(two.assets.at(-1).masterId).toBe(two.masters[1].id);
    await page
      .getByLabel("Create Figur", { exact: true })
      .selectOption({ label: "Synthetic Native" });
    await page
      .locator("summary")
      .filter({ hasText: /^Expression Identity/ })
      .click();
    await expect(
      page.getByLabel("Persönlicher Ausdruck", { exact: true }),
    ).toHaveValue("Direct unwavering gaze for first character.");
    // Latest historical prompt still needs explicit adoption after style revision.
    const adopt = page.getByRole("button", {
      name: "Neue Vorlage übernehmen",
      exact: true,
    });
    await expect(adopt).toBeVisible();
    await adopt.click();
    await fs.writeFile(path.join(root, "scenario"), "no-auth");
    await page
      .getByText("Inspector · Stimmaktion, Intensität und Herkunft", {
        exact: true,
      })
      .click();
    await page
      .getByRole("button", { name: "Codex-Verfügbarkeit prüfen", exact: true })
      .click();
    await expect(
      page.getByRole("status", { name: "Codex Status" }),
    ).toContainText("Nicht mit ChatGPT angemeldet");
    await expect(generate).toBeDisabled();
    await fs.mkdir("artifacts", { recursive: true });
    await page.screenshot({
      path: "artifacts/native-provider-smoke.png",
      fullPage: true,
    });
    expect(errors).toEqual([]);
    console.log(
      "PASS packaged native-provider UI: actual IPC/process lifecycle, fixture success/failure/cancel/regeneration, monotonic timer metadata, real slider keyboard/mouse/touch, shared zoom/pan/overlay, two style profiles and isolated character expression prompts/master references, 960px layout, project lock, provenance, approval, auth gating. No live AI calls.",
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
