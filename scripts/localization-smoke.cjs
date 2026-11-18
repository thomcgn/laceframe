// Focused offline DE/EN acceptance. Synthetic project only; never submits an ImageGen job.
const { _electron: electron, expect } = require("@playwright/test");
const fs = require("node:fs/promises"),
  path = require("node:path"),
  os = require("node:os");
const { PNG } = require("pngjs");
(async () => {
  const root = await fs.mkdtemp(
      path.join(os.tmpdir(), "laceframe-locales-ui-"),
    ),
    project = path.join(root, "project"),
    userData = path.join(root, "user-data");
  await fs.mkdir(project);
  const png = new PNG({ width: 64, height: 64 });
  for (let y = 8; y < 56; y++)
    for (let x = 16; x < 48; x++)
      png.data.set([130, 90, 65, 255], (y * 64 + x) * 4);
  const file = path.join(root, "synthetic.png");
  await fs.writeFile(file, PNG.sync.write(png));
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  let app;
  const errors = [];
  const launch = async () => {
    app = await electron.launch({
      executablePath: path.resolve("out/Laceframe-linux-x64/laceframe"),
      args: ["--user-data-dir=" + userData],
      env,
    });
    const page = await app.firstWindow();
    page.setDefaultTimeout(15000);
    page.on("pageerror", (e) => errors.push(e.message));
    return page;
  };
  const choose = async (p) =>
    app.evaluate(({ dialog }, p) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [p] });
    }, p);
  const nav = (page) =>
    page.getByRole("navigation", {
      name: /^(Main navigation|Hauptnavigation)$/,
    });
  try {
    let page = await launch();
    const osLanguages = await app.evaluate(({ app }) =>
      app.getPreferredSystemLanguages(),
    );
    const expected =
      osLanguages
        .find((l) => /^(de|en)([-_]|$)/i.test(l))
        ?.slice(0, 2)
        .toLowerCase() ?? "en";
    await expect(
      page.getByRole("combobox", { name: /^(Language|Sprache)$/ }),
    ).toHaveValue(expected);
    await page
      .getByRole("combobox", { name: /^(Language|Sprache)$/ })
      .selectOption("en");
    await page
      .getByRole("button", { name: "New project", exact: true })
      .waitFor({ timeout: 25000 });
    expect(await page.locator("html").getAttribute("lang")).toBe("en");
    await page
      .getByRole("button", { name: "New project", exact: true })
      .click();
    await page
      .getByLabel("Project name", { exact: true })
      .fill("Privater Name ä {{v0}}");
    await choose(project);
    await page
      .getByRole("button", { name: "Create project …", exact: true })
      .click();
    await page.getByLabel("New character", { exact: true }).fill("Neue Figur");
    await page
      .getByRole("button", { name: "Create character", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Neue Figur", exact: true }),
    ).toBeVisible();
    expect(
      (await nav(page).getByRole("button").allTextContents()).map((t) =>
        t.replace(/^0\d\s*/, ""),
      ),
    ).toEqual([
      "Characters",
      "Studio",
      "Expressions",
      "Library",
      "Motion",
      "Art Direction",
    ]);
    await choose(file);
    await page
      .getByRole("button", { name: "Select master portrait …", exact: true })
      .click();
    const approve = page.getByRole("button", {
      name: "Lock approved master",
      exact: true,
    });
    await expect(approve).toBeDisabled();
    await page
      .getByLabel("Imported master visual check", { exact: true })
      .check();
    await page
      .getByLabel("Imported master review note", { exact: true })
      .fill(
        "Synthetic identity, grid, silhouette and alpha reviewed at 1:1 and 4x",
      );
    await approve.click();
    await expect(
      page.getByRole("img", { name: /Approved master V1/ }).first(),
    ).toBeVisible();
    const manifest = () =>
      fs.readFile(path.join(project, "laceframe.json"), "utf8");
    const unchanged = await manifest();
    await page
      .getByRole("combobox", { name: "Language", exact: true })
      .selectOption("de");
    await expect(nav(page).getByRole("button").last()).toContainText(
      "Stilgestaltung",
    );
    expect(
      (await nav(page).getByRole("button").allTextContents()).map((t) =>
        t.replace(/^0\d\s*/, ""),
      ),
    ).toEqual([
      "Figuren",
      "Studio",
      "Ausdrücke",
      "Bibliothek",
      "Animation",
      "Stilgestaltung",
    ]);
    await expect(
      page.getByRole("heading", { name: "Neue Figur", exact: true }),
    ).toBeVisible();
    expect(await manifest()).toBe(unchanged);
    await page
      .getByRole("button", {
        name: "Expressions im Studio erstellen",
        exact: true,
      })
      .click();
    const studio = page.locator(".studio-editor:visible");
    await expect(studio).toBeVisible();
    const model = JSON.parse(await manifest());
    await expect(
      studio.getByLabel("Studio Masterversion", { exact: true }),
    ).toHaveValue(model.masters[0].id);
    await studio
      .getByRole("navigation", { name: "Studio Schritte" })
      .getByRole("button", { name: /Erzeugen$/ })
      .click();
    await studio
      .getByRole("checkbox", { name: "Expertenansicht", exact: true })
      .check();
    // The supplementary field label is explicit; switching language must preserve its mounted draft.
    await studio
      .getByRole("combobox", { name: "Promptmodus", exact: true })
      .selectOption("supplement");
    const draft = studio.getByRole("textbox", {
      name: "Ergänzende Anweisung",
      exact: true,
    });
    await draft.fill(
      "Meine privaten Hinweise: Haare dunkel; {{v0}} bleibt Text",
    );
    await page
      .getByRole("combobox", { name: "Sprache", exact: true })
      .selectOption("en");
    await expect(
      studio.getByRole("textbox", {
        name: "Supplementary instruction",
        exact: true,
      }),
    ).toHaveValue("Meine privaten Hinweise: Haare dunkel; {{v0}} bleibt Text");
    await expect(
      studio.getByRole("checkbox", { name: "Expert view", exact: true }),
    ).toBeChecked();
    expect(await manifest()).toBe(unchanged);
    const bridge = await page.evaluate(async () => ({
      require: typeof window.require,
      preferences: await window.laceframe.preferences(),
      bad: await window.laceframe.setLanguage("../de"),
    }));
    expect(bridge.require).toBe("undefined");
    expect(bridge.preferences).toEqual({ ok: true, value: { language: "en" } });
    expect(bridge.bad.ok).toBe(false);
    const screenshots = path.resolve("artifacts/localization");
    await fs.mkdir(screenshots, { recursive: true });
    for (const [width, height] of [
      [960, 720],
      [1440, 900],
    ]) {
      await page.setViewportSize({ width, height });
      await page.screenshot({
        path: path.join(screenshots, `${width}x${height}.png`),
      });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      ).toBe(true);
    }
    await app.close();
    app = undefined;
    page = await launch();
    await page
      .getByRole("button", { name: "Open project", exact: true })
      .waitFor({ timeout: 25000 });
    await expect(
      page.getByRole("combobox", { name: "Language", exact: true }),
    ).toHaveValue("en");
    await choose(project);
    await page
      .getByRole("button", { name: "Open project", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Neue Figur", exact: true }),
    ).toBeVisible();
    expect(await manifest()).toBe(unchanged);
    expect(errors).toEqual([]);
    console.log(
      "DE/EN smoke passed: OS default, language switch, raster gate, Expression entry, expert controls, draft preservation, unchanged project/master, typed IPC, responsive layout and restart.",
    );
  } finally {
    if (app) await app.close();
    await fs.rm(root, { recursive: true, force: true });
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
