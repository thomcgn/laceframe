// Actual packaged Electron workflow; synthetic portraits only, no image generation.
const { _electron: electron, expect } = require("@playwright/test");
const fs = require("node:fs/promises"),
  path = require("node:path"),
  os = require("node:os"),
  { createHash } = require("node:crypto");
const { PNG } = require("pngjs");
const { seedHistoricalMaster } = require("./historical-master-fixture.cjs");
const { nav } = require("./smoke-ui.cjs");
(async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "laceframe-colors-ui-")),
    project = path.join(root, "project"),
    exportsDir = path.join(root, "exports");
  await fs.mkdir(project);
  await fs.mkdir(exportsDir);
  let app, page;
  const errors = [];
  const read = async () =>
    JSON.parse(await fs.readFile(path.join(project, "laceframe.json"), "utf8"));
  const choose = async (dir) =>
    app.evaluate(({ dialog }, dir) => {
      dialog.showOpenDialog = async () => ({
        canceled: false,
        filePaths: [dir],
      });
    }, dir);
  async function launch() {
    const env = { ...process.env };
    delete env.ELECTRON_RUN_AS_NODE;
    app = await electron.launch({
      executablePath: path.resolve("out/Laceframe-linux-x64/laceframe"),
      args: ["--user-data-dir=" + path.join(root, "user")],
      env,
    });
    page = await app.firstWindow();
    page.setDefaultTimeout(15000);
    page.on("pageerror", (e) => errors.push(e.message));
    await expect(
      page.getByRole("heading", { name: "Characters", exact: true }),
    ).toBeVisible();
  }
  const make = (shade) => {
    const p = new PNG({ width: 32, height: 32 });
    p.data.fill(0);
    for (let y = 1; y < 31; y++)
      for (let x = 1; x < 31; x++) {
        const v = shade + (y % 4) * 3;
        p.data.set([v, v, v, 255], (y * 32 + x) * 4);
      }
    return PNG.sync.write(p);
  };
  async function paintMask(name, rename) {
    const editor = page.getByRole("dialog", { name, exact: true });
    await expect(editor).toBeVisible();
    if (rename) {
      await editor.locator("summary").filter({ hasText: "Erweitert" }).click();
      await editor.getByLabel("Maskenname", { exact: true }).fill(rename);
    } else
      await expect(
        editor.getByLabel("Maskenname", { exact: true }),
      ).toHaveAttribute("readonly", "");
    const canvas = editor.getByLabel("Maskenzeichenfläche", { exact: true });
    await expect(
      editor.getByRole("button", {
        name: "In Farbentwurf übernehmen",
        exact: true,
      }),
    ).toBeEnabled();
    await editor.getByLabel("Pinselgröße", { exact: true }).fill("32");
    const box = await canvas.boundingBox();
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await editor
      .getByRole("button", { name: "In Farbentwurf übernehmen", exact: true })
      .click();
    await expect(editor).not.toBeVisible();
  }
  try {
    await launch();
    await choose(project);
    await page
      .getByLabel("Projektname", { exact: true })
      .fill("Synthetic color consistency");
    await page
      .getByRole("button", { name: "Projekt erstellen …", exact: true })
      .click();
    await page
      .getByLabel("Neue Figur", { exact: true })
      .fill("Palette fixture");
    await page
      .getByRole("button", { name: "Figur erstellen", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Palette fixture", exact: true }),
    ).toBeVisible();
    await app.close();
    const bytes = make(80),
      masterHash = createHash("sha256").update(bytes).digest("hex");
    await seedHistoricalMaster(project, bytes);
    await launch();
    await choose(project);
    await page
      .getByRole("button", { name: "Projekt öffnen …", exact: true })
      .click();
    await expect(
      page.getByAltText("Freigegebener Master V1", { exact: true }),
    ).toBeVisible();
    const initial = await read();
    const input = [...make(150)];
    await page.evaluate(
      async ({ bytes, characterId, variantId }) => {
        const s = await window.laceframe.stageImage(
          new Uint8Array(bytes),
          "synthetic-expression.png",
        );
        if (!s.ok) throw new Error(s.error);
        const r = await window.laceframe.command({
          type: "importCandidate",
          characterId,
          variantId,
          action: "silent",
          token: s.value.token,
        });
        if (!r.ok) throw new Error(r.error);
      },
      {
        bytes: input,
        characterId: initial.selectedCharacterId,
        variantId: initial.variants[0].id,
      },
    );
    // Restart and use real project open to show persisted data without renderer state injection.
    await app.close();
    await launch();
    await choose(project);
    await page
      .getByRole("button", { name: "Projekt öffnen …", exact: true })
      .click();
    await nav(page, "Library");
    await page
      .getByLabel("Library Assettyp", { exact: true })
      .selectOption("expression");
    let quality = page.locator('[data-testid="asset-quality"]:visible').first();
    await quality.locator("summary").first().click();
    await quality
      .getByRole("button", { name: "Farbkonsistenz prüfen", exact: true })
      .click();
    let dialog = page.getByRole("dialog", {
      name: "Farbkonsistenz",
      exact: true,
    });
    await expect(dialog).toBeVisible();
    await dialog
      .getByRole("button", { name: "Haare / Bart zuweisen", exact: true })
      .click();
    await paintMask("Farbregion", "Manuell zugewiesene Haare");
    await dialog
      .getByRole("button", {
        name: "Masterpalette als neue Revision speichern",
        exact: true,
      })
      .click();
    await expect(
      dialog.getByLabel("Farbregion", { exact: true }),
    ).toBeVisible();
    await dialog
      .getByRole("button", { name: "Kandidatenregion zuordnen", exact: true })
      .click();
    await paintMask("Farbregion");
    await expect(
      dialog.getByLabel("Farbmessungen", { exact: true }),
    ).toContainText("Farbabweichung");
    const before = await fs.readFile(path.join(project, "laceframe.json"));
    await dialog.getByLabel("Ausgangsfarbe", { exact: true }).fill("#969696");
    await dialog
      .getByLabel(
        "Helligkeitsversatz ausdrücklich mit korrigieren (z. B. aufgehellte Haare)",
        { exact: true },
      )
      .check();
    await dialog
      .getByLabel("Kandidatenregionen und Pose manuell geprüft", {
        exact: true,
      })
      .check();
    const save = dialog.getByRole("button", {
      name: "Als separaten Farbkandidaten speichern",
      exact: true,
    });
    await expect(save).toBeEnabled();
    const preview = async () =>
      dialog
        .getByLabel("Farbvorschau", { exact: true })
        .evaluate((c) => [
          ...c.getContext("2d").getImageData(0, 0, c.width, c.height).data,
        ]);
    await expect
      .poll(preview)
      .not.toEqual([...PNG.sync.read(Buffer.from(input)).data]);
    const corrected = await preview();
    await dialog
      .getByRole("button", { name: "Farbe rückgängig", exact: true })
      .click();
    await expect(save).toBeEnabled();
    expect(await preview()).toEqual([
      ...PNG.sync.read(Buffer.from(input)).data,
    ]);
    await dialog
      .getByRole("button", { name: "Farbe wiederholen", exact: true })
      .click();
    await expect(save).toBeEnabled();
    await expect.poll(preview).toEqual(corrected);
    expect(await fs.readFile(path.join(project, "laceframe.json"))).toEqual(
      before,
    );
    for (const [width, height] of [
      [960, 720],
      [1440, 900],
      [1920, 1080],
    ]) {
      await app.evaluate(
        ({ BrowserWindow }, { width, height }) =>
          BrowserWindow.getAllWindows()[0].setContentSize(width, height),
        { width, height },
      );
      await expect(dialog).toBeVisible();
      expect(
        await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth + 2),
      ).toBe(true);
      await fs.mkdir("artifacts/color-consistency", { recursive: true });
      await page.screenshot({
        path: `artifacts/color-consistency/${width}x${height}.png`,
      });
    }
    await save.click();
    await expect(dialog).not.toBeVisible();
    const after = await read(),
      q = after.qualityAssets.at(-1);
    expect(after.masterPalettes[0].regions[0].name).toBe(
      "Manuell zugewiesene Haare",
    );
    expect(q.operation).toBe("color-correction");
    expect(q.status).toBe("candidate");
    expect([
      ...PNG.sync.read(await fs.readFile(path.join(project, q.file))).data,
    ]).toEqual(corrected);
    expect(after.masters).toEqual(initial.masters);
    quality = page.locator('[data-testid="asset-quality"]:visible').first();
    await expect(
      quality.getByLabel("Qualitätsnotiz", { exact: true }),
    ).toBeVisible();
    await quality
      .getByLabel("Qualitätsnotiz", { exact: true })
      .fill("Synthetic human palette, alpha and silhouette review");
    await quality
      .getByLabel(
        "Identität, Outfit, Konturen, Stil und Alpha-Kanten visuell geprüft",
        { exact: true },
      )
      .check();
    page.once("dialog", (d) => d.accept());
    await quality
      .getByRole("button", { name: "Qualitätsversion freigeben", exact: true })
      .click();
    await expect
      .poll(async () => (await read()).qualityAssets.at(-1).status)
      .toBe("approved");
    const reviewed = await read();
    await expect(page.getByLabel("Library Asset", { exact: true })).toHaveValue(
      reviewed.qualityAssets.at(-1).approvedExpressionId,
    );
    if (!(await quality.getAttribute("open")))
      await quality.locator("summary").first().click();
    await choose(exportsDir);
    await quality
      .getByRole("button", {
        name: "Transparentes PNG exportieren",
        exact: true,
      })
      .click();
    await expect
      .poll(
        async () =>
          (await fs.readdir(exportsDir)).filter((f) => f.endsWith(".png"))
            .length,
      )
      .toBe(1);
    const file = (await fs.readdir(exportsDir)).find((f) => f.endsWith(".png"));
    expect(await fs.readFile(path.join(exportsDir, file))).toEqual(
      await fs.readFile(path.join(project, q.file)),
    );
    expect(
      createHash("sha256")
        .update(await fs.readFile(path.join(project, initial.masters[0].file)))
        .digest("hex"),
    ).toBe(masterHash);
    await app.close();
    await launch();
    await choose(project);
    await page
      .getByRole("button", { name: "Projekt öffnen …", exact: true })
      .click();
    await nav(page, "Library");
    await page
      .getByLabel("Library Assettyp", { exact: true })
      .selectOption("expression");
    quality = page.locator('[data-testid="asset-quality"]:visible').first();
    await quality.locator("summary").first().click();
    await quality
      .getByRole("button", { name: "Farbkonsistenz prüfen", exact: true })
      .click();
    dialog = page.getByRole("dialog", { name: "Farbkonsistenz", exact: true });
    await expect(
      dialog.getByLabel("Masterpalette", { exact: true }),
    ).toHaveValue(after.masterPalettes[0].id);
    await dialog
      .getByRole("button", { name: "Schließen / verwerfen", exact: true })
      .click();
    await page
      .getByLabel("Library Assettyp", { exact: true })
      .selectOption("quality");
    await page.getByLabel("Library Asset", { exact: true }).selectOption(q.id);
    quality = page.locator('[data-testid="asset-quality"]:visible').first();
    if (!(await quality.getAttribute("open")))
      await quality.locator("summary").first().click();
    await quality
      .getByRole("button", { name: "Farbkonsistenz prüfen", exact: true })
      .click();
    dialog = page.getByRole("dialog", { name: "Farbkonsistenz", exact: true });
    await expect(
      dialog.getByLabel("Farbmessungen", { exact: true }),
    ).toContainText("sichtbare Pixel");
    await expect.poll(preview).toEqual(corrected);
    await expect(
      dialog.getByRole("button", {
        name: "Als separaten Farbkandidaten speichern",
        exact: true,
      }),
    ).toBeDisabled();
    expect(
      await page.evaluate(() => ({
        node: typeof window.require,
        fs: typeof window.laceframe.readFile,
      })),
    ).toEqual({ node: "undefined", fs: "undefined" });
    expect(errors).toEqual([]);
    console.log(
      "PASS LF-03A: real manual region masks, measured light drift, live selective correction, undo/redo, no intermediate writes, immutable original/master, human approval, exact PNG export, 960/1440/1920 and reopen. No live ImageGen.",
    );
  } finally {
    await app?.close();
  }
})().catch((e) => {
  console.error(String(e.message).slice(0, 1500));
  console.error(
    e.stack
      ?.split("\n")
      .filter((l) => l.trim().startsWith("at "))
      .join("\n"),
  );
  process.exitCode = 1;
});
