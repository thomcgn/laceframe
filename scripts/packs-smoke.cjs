const { studioExpert } = require("./smoke-ui.cjs");
// Real packaged Electron + typed IPC + JSON bytes; synthetic projects only, no ImageGen.
const { _electron: electron, expect } = require("@playwright/test");
const fs = require("node:fs/promises"),
  path = require("node:path"),
  os = require("node:os");
const { PNG } = require("pngjs");
const { field, nav } = require("./smoke-ui.cjs");
const { reviewImport } = require("./historical-master-fixture.cjs");
(async () => {
  const root = await fs.mkdtemp(
    path.join(os.tmpdir(), "laceframe-packs-desktop-"),
  );
  const first = path.join(root, "source"),
    second = path.join(root, "target"),
    exports = path.join(root, "exports");
  for (const dir of [first, second, exports]) await fs.mkdir(dir);
  let app, page;
  const errors = [];
  const chooser = async (file) =>
    app.evaluate(({ dialog }, file) => {
      dialog.showOpenDialog = async () => ({
        canceled: false,
        filePaths: [file],
      });
    }, file);
  const launch = async () => {
    const env = { ...process.env };
    delete env.ELECTRON_RUN_AS_NODE;
    app = await electron.launch({
      executablePath: path.resolve("out/Laceframe-linux-x64/laceframe"),
      args: [`--user-data-dir=${path.join(root, "user-data")}`],
      env,
    });
    page = await app.firstWindow();
    page.on("pageerror", (e) => errors.push(e.message));
    await expect(
      page.getByRole("button", { name: "Neues Projekt", exact: true }),
    ).toBeVisible({ timeout: 25000 });
  };
  const manifest = async (dir) =>
    JSON.parse(await fs.readFile(path.join(dir, "laceframe.json"), "utf8"));
  const create = async (dir, name) => {
    await require("./smoke-ui.cjs").prepareProjectCreation(page);
    await field(page, "Projektname", { exact: true }).fill(name);
    await chooser(dir);
    await page
      .getByRole("button", { name: "Projekt erstellen …", exact: true })
      .click();
    await expect
      .poll(async () => {
        try {
          return (await manifest(dir)).name;
        } catch {
          return "";
        }
      })
      .toBe(name);
  };
  try {
    await launch();
    await create(first, "Pack source synthetic");
    await nav(page, "Art Direction");
    await field(page, "Stilname", { exact: true }).fill(
      "Synthetic legacy game style",
    );
    const original =
      "Illustrated pixel contours\nkeep black leather jacket\nUse selfie identity\nNeutral expression\nCentered framing";
    await field(
      page,
      "Darstellung-Regeln (ohne Charakter- oder Outfitmerkmale)",
      { exact: true },
    ).fill(original);
    await page
      .getByRole("button", { name: "Stil anlegen und auswählen", exact: true })
      .click();
    await expect
      .poll(async () => (await manifest(first)).artDirections.length)
      .toBe(1);
    await expect(
      page.locator('[aria-label="style Packs"]:visible'),
    ).toHaveCount(1);
    await expect(
      page.locator('[aria-label="Strukturierte Stilregeln"]:visible'),
    ).toHaveCount(1);
    await page
      .getByRole("button", {
        name: "Freitext-Migrationsassistent (Ada Voss / andere Stile)",
        exact: true,
      })
      .click();
    await expect(
      page.getByLabel("Migration Kategorie 2", { exact: true }),
    ).toHaveValue("outfit");
    await expect(
      page.getByLabel("Migration Kategorie 3", { exact: true }),
    ).toHaveValue("identity");
    await expect(
      page.getByLabel("Migration Kategorie 4", { exact: true }),
    ).toHaveValue("expression");
    await expect(
      page.getByRole("button", {
        name: "Migration als neue Stilrevision übernehmen",
        exact: true,
      }),
    ).toBeDisabled();
    await page.getByLabel("Stilmigration geprüft", { exact: true }).check();
    for (const [width, height] of [
      [960, 720],
      [1440, 900],
      [1920, 1080],
    ]) {
      await app.evaluate(
        ({ BrowserWindow }, { width, height }) =>
          BrowserWindow.getAllWindows()
            .find((w) => w.isVisible())
            .setContentSize(width, height),
        { width, height },
      );
      await page
        .getByLabel("Stilmigration geprüft", { exact: true })
        .scrollIntoViewIfNeeded();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth + 1,
        ),
      ).toBe(true);
      await fs.mkdir("artifacts", { recursive: true });
      await page.screenshot({
        path: `artifacts/lf02-migration-${width}.png`,
        fullPage: true,
      });
    }
    await page
      .getByRole("button", {
        name: "Migration als neue Stilrevision übernehmen",
        exact: true,
      })
      .click();
    await expect
      .poll(async () => (await manifest(first)).artDirections[0].revision)
      .toBe(2);
    const migrated = await manifest(first);
    expect(migrated.styleMigrations[0].sources[0].text).toBe(original);
    expect(migrated.artDirectionRevisions[0].renderRules).toBe(original);
    expect(JSON.stringify(migrated.artDirections[0])).not.toMatch(
      /black leather jacket|selfie|Neutral expression/,
    );
    await page
      .getByText("Strukturierte Rendering-Regeln bearbeiten", { exact: true })
      .click();
    await page
      .getByLabel("Material-Rendering", { exact: true })
      .fill("Render leather as grouped highlights");
    await expect(
      page.getByRole("button", {
        name: "Strukturierte Stilrevision speichern",
        exact: true,
      }),
    ).toBeEnabled();
    await page
      .getByRole("button", {
        name: "Strukturierte Änderungen verwerfen",
        exact: true,
      })
      .click();
    await expect(
      page.getByLabel("Material-Rendering", { exact: true }),
    ).toHaveValue("");
    await page
      .getByLabel("Material-Rendering", { exact: true })
      .fill("Render leather as grouped highlights");
    await page
      .getByRole("button", {
        name: "Strukturierte Stilrevision speichern",
        exact: true,
      })
      .click();
    await expect
      .poll(async () => (await manifest(first)).artDirections[0].revision)
      .toBe(3);
    await page.getByLabel("Stilpaket Inhaltsprüfung", { exact: true }).check();
    await chooser(exports);
    await page
      .locator('[aria-label="style Packs"]')
      .getByRole("button", { name: "JSON-Pack exportieren …", exact: true })
      .click();
    await expect
      .poll(
        async () =>
          (await fs.readdir(exports)).filter((f) => f.startsWith("style-"))
            .length,
      )
      .toBe(1);
    const styleFile = path.join(
        exports,
        (await fs.readdir(exports)).find((f) => f.startsWith("style-")),
      ),
      stylePack = JSON.parse(await fs.readFile(styleFile, "utf8"));
    expect(stylePack.style.materials).toBe(
      "Render leather as grouped highlights",
    );
    expect(JSON.stringify(stylePack)).not.toMatch(
      /black leather jacket|selfie|Neutral expression|sourceCandidateId/,
    );
    await nav(page, "Expressions");
    await chooser(exports);
    await page
      .locator('[aria-label="expressions Packs"]')
      .getByRole("button", { name: "JSON-Pack exportieren …", exact: true })
      .click();
    await expect
      .poll(
        async () =>
          (await fs.readdir(exports)).filter((f) =>
            f.startsWith("expressions-"),
          ).length,
      )
      .toBe(1);
    const expressionFile = path.join(
        exports,
        (await fs.readdir(exports)).find((f) => f.startsWith("expressions-")),
      ),
      expressionPack = JSON.parse(await fs.readFile(expressionFile, "utf8"));
    const originalBytes = await fs.readFile(path.join(first, "laceframe.json"));
    await create(second, "Pack target synthetic");
    await nav(page, "Characters");
    await field(page, "Neue Figur", { exact: true }).fill(
      "Synthetic pack user",
    );
    await page
      .getByRole("button", { name: "Figur erstellen", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Synthetic pack user", exact: true }),
    ).toBeVisible();
    const png = new PNG({ width: 32, height: 40 });
    png.data.fill(120);
    for (let y = 0; y < 40; y++)
      for (let x = 0; x < 32; x++)
        png.data[(y * 32 + x) * 4 + 3] =
          !x || !y || x === 31 || y === 39 ? 0 : 255;
    await page.evaluate(
      (bytes) => {
        const dt = new DataTransfer();
        dt.items.add(
          new File([new Uint8Array(bytes)], "synthetic.png", {
            type: "image/png",
          }),
        );
        document
          .querySelector(".app")
          .dispatchEvent(
            new DragEvent("drop", { bubbles: true, dataTransfer: dt }),
          );
      },
      [...PNG.sync.write(png)],
    );
    await reviewImport(page);
    await page
      .getByRole("button", {
        name: "Freigegebenen Master sperren",
        exact: true,
      })
      .click();
    await expect
      .poll(async () => (await manifest(second)).masters.length)
      .toBe(1);
    await nav(page, "Art Direction");
    const before = await fs.readFile(path.join(second, "laceframe.json"));
    const bad = path.join(root, "invalid.json");
    await fs.writeFile(
      bad,
      JSON.stringify({ ...stylePack, schemaVersion: 999 }),
    );
    await chooser(bad);
    await page
      .locator('[aria-label="style Packs"]')
      .getByRole("button", { name: "JSON-Pack importieren …", exact: true })
      .click();
    await expect(page.getByRole("alert")).toBeVisible();
    expect(await fs.readFile(path.join(second, "laceframe.json"))).toEqual(
      before,
    );
    await chooser(styleFile);
    await page
      .locator('[aria-label="style Packs"]')
      .getByRole("button", { name: "JSON-Pack importieren …", exact: true })
      .click();
    await expect(
      page.getByLabel("Pack Importvorschau", { exact: true }),
    ).toContainText("neu");
    expect(await fs.readFile(path.join(second, "laceframe.json"))).toEqual(
      before,
    );
    await page
      .getByRole("button", { name: "Pack-Import abbrechen", exact: true })
      .click();
    expect(await fs.readFile(path.join(second, "laceframe.json"))).toEqual(
      before,
    );
    await chooser(styleFile);
    await page
      .locator('[aria-label="style Packs"]')
      .getByRole("button", { name: "JSON-Pack importieren …", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Geprüften Import übernehmen", exact: true })
      .click();
    await expect
      .poll(async () => (await manifest(second)).artDirections.length)
      .toBe(1);
    const targetStyle = (await manifest(second)).artDirections[0];
    expect(targetStyle.id).not.toBe(stylePack.id);
    expect(targetStyle.portableStyle.materials).toBe(stylePack.style.materials);
    await chooser(styleFile);
    await page
      .locator('[aria-label="style Packs"]')
      .getByRole("button", { name: "JSON-Pack importieren …", exact: true })
      .click();
    await expect(
      page.getByLabel("Pack Importvorschau", { exact: true }),
    ).toContainText("identisch");
    await expect(
      page.getByRole("button", {
        name: "Geprüften Import übernehmen",
        exact: true,
      }),
    ).toBeDisabled();
    await page
      .getByRole("button", { name: "Pack-Import abbrechen", exact: true })
      .click();
    await nav(page, "Expressions");
    await chooser(expressionFile);
    await page
      .locator('[aria-label="expressions Packs"]')
      .getByRole("button", { name: "JSON-Pack importieren …", exact: true })
      .click();
    const family = expressionPack.families[0];
    await expect(
      page.getByLabel("Pack Importvorschau", { exact: true }),
    ).toContainText("Konflikt");
    await page
      .getByLabel(`Importentscheidung ${family.label}`, { exact: true })
      .selectOption("new");
    for (const [width, height] of [
      [960, 720],
      [1440, 900],
      [1920, 1080],
    ]) {
      await app.evaluate(
        ({ BrowserWindow }, { width, height }) =>
          BrowserWindow.getAllWindows()
            .find((w) => w.isVisible())
            .setContentSize(width, height),
        { width, height },
      );
      await page
        .getByLabel("Pack Importvorschau", { exact: true })
        .scrollIntoViewIfNeeded();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth + 1,
        ),
      ).toBe(true);
      await page.screenshot({
        path: `artifacts/lf02-import-${width}.png`,
        fullPage: true,
      });
    }
    await page
      .getByRole("button", { name: "Geprüften Import übernehmen", exact: true })
      .click();
    await expect
      .poll(
        async () =>
          (await manifest(second)).families.filter((f) => f.portableId).length,
      )
      .toBe(1);
    const imported = (await manifest(second)).families.find(
      (f) => f.portableId === family.id,
    );
    expect(imported.slug).not.toBe(family.slug);
    expect(imported.portableSlug).toBe(family.slug);
    await field(page, "Emotionsfamilie", { exact: true }).selectOption(
      imported.id,
    );
    await page
      .getByRole("button", { name: "Im Studio verwenden", exact: true })
      .click();
    const variant = (await manifest(second)).variants.find(
      (v) => v.familyId === imported.id,
    );
    await expect(field(page, "Studio Variante", { exact: true })).toHaveValue(
      variant.id,
    );
    await studioExpert(page);
    await page
      .getByRole("button", {
        name: "Generierungsanweisung speichern",
        exact: true,
      })
      .click();
    await expect
      .poll(async () => (await manifest(second)).attempts.length)
      .toBe(1);
    expect(
      (await manifest(second)).attempts[0].promptRevision.prompt,
    ).toContain("Render leather as grouped highlights");
    expect(await fs.readFile(path.join(first, "laceframe.json"))).toEqual(
      originalBytes,
    );
    await app.close();
    await launch();
    await chooser(second);
    await page.getByRole("button", { name: /^Projekt öffnen(?: …)?$/ }).click();
    await expect(
      page.getByRole("heading", { name: "Synthetic pack user", exact: true }),
    ).toBeVisible();
    await nav(page, "Expressions");
    await expect(
      field(page, "Emotionsfamilie", { exact: true }).locator(
        `option[value="${imported.id}"]`,
      ),
    ).toHaveCount(1);
    expect(await page.evaluate(() => typeof window.require)).toBe("undefined");
    expect(errors).toEqual([]);
    console.log(
      "PASS LF-02 packs: real JSON export/import, immutable legacy text migration, structured style reset/save, two-project UUID/slug mapping, explicit conflicts/skip/cancel, invalid schema rejection without writes, immediate imported expression in Studio, prompt layers, reopen and 960/1440/1920 layouts. No live generation.",
    );
  } catch (e) {
    if (page)
      await page
        .screenshot({
          path: "artifacts/lf02-packs-failure.png",
          fullPage: true,
        })
        .catch(() => {});
    throw e;
  } finally {
    if (app) await app.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
