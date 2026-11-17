const { reviewImport } = require("./historical-master-fixture.cjs");
const { _electron: electron, expect } = require("@playwright/test");
const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");
const { PNG } = require("pngjs");
const { field, nav } = require("./smoke-ui.cjs");
(async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "laceframe-ux03-"));
  const project = path.join(root, "project");
  await fs.mkdir(project);
  let app;
  const errors = [];
  try {
    const env = { ...process.env };
    delete env.ELECTRON_RUN_AS_NODE;
    app = await electron.launch({
      executablePath:
        process.env.LACEFRAME_EXECUTABLE ||
        path.resolve("out/Laceframe-linux-x64/laceframe"),
      args: [`--user-data-dir=${path.join(root, "user")}`],
      env,
    });
    const page = await app.firstWindow();
    page.on("pageerror", (e) => errors.push(e.message));
    await app.evaluate(({ dialog }, dir) => {
      dialog.showOpenDialog = async () => ({
        canceled: false,
        filePaths: [dir],
      });
    }, project);
    await field(page, "Projektname", { exact: true }).fill("UX03 synthetic");
    await page
      .getByRole("button", { name: "Projekt erstellen …", exact: true })
      .click();
    await field(page, "Neue Figur", { exact: true }).fill("Synthetic One");
    await page
      .getByRole("button", { name: "Figur erstellen", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Synthetic One", exact: true }),
    ).toBeVisible();
    const png = new PNG({ width: 16, height: 16 });
    png.data.fill(180);
    for (let y = 0; y < 16; y++)
      for (let x = 0; x < 16; x++)
        if (!x || !y || x === 15 || y === 15)
          png.data[(y * 16 + x) * 4 + 3] = 0;
    await page.evaluate(
      (bytes) => {
        const dataTransfer = new DataTransfer();
        dataTransfer.items.add(
          new File([new Uint8Array(bytes)], "synthetic.png", {
            type: "image/png",
          }),
        );
        document
          .querySelector(".app")
          .dispatchEvent(
            new DragEvent("drop", { bubbles: true, dataTransfer }),
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
    const manifest = async () =>
      JSON.parse(
        await fs.readFile(path.join(project, "laceframe.json"), "utf8"),
      );
    const original = await manifest();
    await nav(page, "Expressions");
    expect(
      await page
        .getByRole("navigation", { name: "Hauptnavigation" })
        .getByRole("button")
        .allTextContents(),
    ).toEqual([
      "01Characters",
      "02Art Direction",
      "03Expressions",
      "04Studio",
      "05Library",
      "06Motion",
    ]);
    await field(page, "Familienname", { exact: true }).fill("Neutral edited");
    await expect(
      page.getByRole("button", { name: "Im Studio verwenden", exact: true }),
    ).toBeDisabled();
    await nav(page, "Library");
    await expect(
      page.getByText("Emotionsvorlagen & manueller Import", { exact: true }),
    ).toHaveCount(0);
    await nav(page, "Expressions");
    await expect(field(page, "Familienname", { exact: true })).toHaveValue(
      "Neutral edited",
    );
    await field(page, "Familienkennung", { exact: true }).fill(
      "neutral-family-edited",
    );
    await page
      .getByRole("button", { name: "Familie speichern", exact: true })
      .click();
    await expect
      .poll(async () => (await manifest()).families[0].label)
      .toBe("Neutral edited");
    await field(page, "Globale Generierungsanweisung", { exact: true }).fill(
      "Calm global expression.",
    );
    await field(page, "Variantenname", { exact: true }).fill(
      "Neutral variant edited",
    );
    await field(page, "Variantenkennung", { exact: true }).fill(
      "neutral-edited",
    );
    await field(page, "Vorgeschlagene Stimmaktion", {
      exact: true,
    }).selectOption("speaking");
    await field(page, "Intensität · optional (0–1)", { exact: true }).fill(
      "0.65",
    );
    const selected = await field(page, "Variante", {
      exact: true,
    }).inputValue();
    await field(page, "Emotionsfamilie", { exact: true }).selectOption({
      label: "Wütend",
    });
    await field(page, "Emotionsfamilie", { exact: true }).selectOption({
      label: "Neutral edited",
    });
    await expect(
      field(page, "Globale Generierungsanweisung", { exact: true }),
    ).toHaveValue("Calm global expression.");
    await page
      .getByRole("button", { name: "Variante speichern", exact: true })
      .click();
    await expect
      .poll(
        async () =>
          (await manifest()).variants.find((v) => v.id === selected).prompt,
      )
      .toBe("Calm global expression.");
    await field(page, "Persönlicher Ausdruck", { exact: true }).fill(
      "One: deliberate gaze.",
    );
    await page
      .getByRole("button", {
        name: "Persönlichen Ausdruck speichern",
        exact: true,
      })
      .click();
    await expect
      .poll(async () => (await manifest()).expressionPerformances.length)
      .toBe(1);
    await page
      .getByRole("button", { name: "Im Studio verwenden", exact: true })
      .click();
    await expect(field(page, "Create Variante", { exact: true })).toHaveValue(
      selected,
    );
    await expect(
      field(page, "Create Stimmaktion", { exact: true }),
    ).toHaveValue("speaking");
    await expect(field(page, "Create Intensität", { exact: true })).toHaveValue(
      "0.65",
    );
    const master = await field(page, "Create Masterversion", {
      exact: true,
    }).inputValue();
    await expect(
      page.getByRole("button", { name: "Ergebnis importieren …", exact: true }),
    ).toBeEnabled();
    await field(page, "Promptmodus", { exact: true }).selectOption(
      "supplement",
    );
    await field(page, "Ergänzende Anweisung", { exact: true }).fill(
      "Creative draft retained.",
    );
    await page
      .getByRole("button", { name: "Expression bearbeiten", exact: true })
      .click();
    await expect(field(page, "Variante", { exact: true })).toHaveValue(
      selected,
    );
    await field(page, "Globale Generierungsanweisung", { exact: true }).fill(
      "Updated global expression.",
    );
    await page
      .getByRole("button", { name: "Variante speichern", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Zurück zum Studio", exact: true })
      .filter({ visible: true })
      .click();
    await expect(
      field(page, "Create Masterversion", { exact: true }),
    ).toHaveValue(master);
    await expect(field(page, "Create Variante", { exact: true })).toHaveValue(
      selected,
    );
    await expect(
      field(page, "Ergänzende Anweisung", { exact: true }),
    ).toHaveValue("Creative draft retained.");
    await field(page, "Promptmodus", { exact: true }).selectOption("expert");
    const prompt = field(page, "Arbeits-Prompt", { exact: true });
    await expect(prompt).toHaveValue(/One: deliberate gaze/);
    await expect(prompt).not.toHaveValue(/Calm global expression/);
    await prompt.fill((await prompt.inputValue()) + "\nEXPERT DRAFT");
    await page
      .getByRole("button", { name: "Expression bearbeiten", exact: true })
      .click();
    // Scoped edits survive navigation without replacing the Studio working prompt.
    await field(page, "Persönlicher Ausdruck", { exact: true }).fill(
      "Unsaved personal draft",
    );
    await nav(page, "Library");
    await nav(page, "Expressions");
    await expect(
      field(page, "Persönlicher Ausdruck", { exact: true }),
    ).toHaveValue("Unsaved personal draft");
    const management = page.locator(".project-management");
    if ((await management.getAttribute("open")) === null)
      await management.locator("summary").click();
    page.once("dialog", (dialog) => dialog.dismiss());
    await page
      .getByRole("button", { name: "Projekt öffnen …", exact: true })
      .click();
    await expect(
      field(page, "Persönlicher Ausdruck", { exact: true }),
    ).toHaveValue("Unsaved personal draft");
    await management.locator("summary").click();

    await page
      .getByRole("button", { name: "Zurück zum Studio", exact: true })
      .filter({ visible: true })
      .click();
    await expect(prompt).toHaveValue(/EXPERT DRAFT/);
    await expect(
      field(page, "Create Masterversion", { exact: true }),
    ).toHaveValue(master);
    await nav(page, "Expressions");
    await field(page, "Persönlicher Ausdruck", { exact: true }).fill(
      "One: deliberate gaze.",
    );
    await nav(page, "Studio");
    page.once("dialog", (dialog) => dialog.accept());
    await field(page, "Promptmodus", { exact: true }).selectOption("automatic");
    await expect(field(page, "Promptmodus", { exact: true })).toHaveValue(
      "automatic",
    );
    await expect(field(page, "Arbeits-Prompt", { exact: true })).toBeHidden();
    await nav(page, "Expressions");
    await fs.mkdir("artifacts", { recursive: true });
    for (const [width, height] of [
      [960, 720],
      [1440, 900],
    ]) {
      await page.setViewportSize({ width, height });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      ).toBe(true);
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.screenshot({
        path: `artifacts/ux03-expressions-${width}.png`,
        fullPage: true,
      });
      await nav(page, "Studio");
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      ).toBe(true);
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.screenshot({
        path: `artifacts/ux03-studio-${width}.png`,
        fullPage: true,
      });
      await nav(page, "Expressions");
    }
    const after = await manifest();
    expect(after.masters).toEqual(original.masters);
    expect(after.assets).toEqual(original.assets);
    expect(after.attempts).toEqual(original.attempts);
    expect(after.schemaVersion).toBe(original.schemaVersion);
    expect(errors).toEqual([]);
    console.log(
      "PASS UX03 Expression Designer: family/variant edits, scoped drafts, global/personal rules, direct Studio context and creative/expert draft retention, manual-import availability, asset-only Library, 960x720 / 1440x900, immutable masters/history. Synthetic local project; no generation.",
    );
  } catch (error) {
    if (app) {
      const page = await app.firstWindow();
      await fs.mkdir("artifacts", { recursive: true });
      await page.screenshot({
        path: "artifacts/ux03-failure.png",
        fullPage: true,
      });
      console.error(await page.locator("body").innerText());
    }
    throw error;
  } finally {
    if (app) await app.close();
    await fs.rm(root, { recursive: true, force: true });
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
