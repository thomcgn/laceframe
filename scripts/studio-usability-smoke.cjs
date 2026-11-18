// Focused UX-06.1 Electron acceptance; synthetic artwork, no generation provider.
const { _electron: electron, expect } = require("@playwright/test");
const { PNG } = require("pngjs");
const { reviewImport } = require("./historical-master-fixture.cjs");
const { field, nav, studioStep } = require("./smoke-ui.cjs");
const fs = require("node:fs/promises"),
  path = require("node:path"),
  os = require("node:os");
const { createHash } = require("node:crypto");
(async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "laceframe-usability-"));
  const project = path.join(root, "project");
  await fs.mkdir(project);
  const png = new PNG({ width: 1024, height: 1536 });
  // Deliberately synthetic block portrait with transparent margin and preserved clusters.
  for (let y = 0; y < 1536; y++)
    for (let x = 0; x < 1024; x++) {
      const u = Math.floor(x / 8),
        v = Math.floor(y / 8);
      let c = [0, 0, 0, 0];
      if (u > 22 && u < 106 && v > 110 && v < 184) c = [67, 109, 110, 255];
      if (u > 40 && u < 88 && v > 26 && v < 115) c = [217, 167, 126, 255];
      if (u > 35 && u < 93 && v > 20 && v < 50) c = [53, 39, 51, 255];
      if (v > 65 && v < 72 && ((u > 47 && u < 54) || (u > 74 && u < 81)))
        c = [20, 24, 32, 255];
      if (v > 94 && v < 98 && u > 55 && u < 73) c = [120, 62, 67, 255];
      for (let k = 0; k < 4; k++) png.data[(y * 1024 + x) * 4 + k] = c[k];
    }
  const bytes = PNG.sync.write(png),
    file = path.join(root, "synthetic.png");
  await fs.writeFile(file, bytes);
  const screenshots = path.resolve(
    "artifacts/ux061" + (process.env.LACEFRAME_UX_AUDIT ? "record-before" : ""),
  );
  await fs.mkdir(screenshots, { recursive: true });
  let app;
  const errors = [];
  try {
    const env = { ...process.env };
    delete env.ELECTRON_RUN_AS_NODE;
    app = await electron.launch({
      executablePath: path.resolve("out/Laceframe-linux-x64/laceframe"),
      args: [`--user-data-dir=${path.join(root, "user-data")}`],
      env,
    });
    const page = await app.firstWindow();
    page.setDefaultTimeout(15000);
    page.on("pageerror", (e) => errors.push(e.message));
    const dialog = async (p) =>
      app.evaluate(({ dialog }, p) => {
        dialog.showOpenDialog = async () => ({
          canceled: false,
          filePaths: [p],
        });
      }, p);
    await dialog(project);
    await require("./smoke-ui.cjs").prepareProjectCreation(page);
    await field(page, "Projektname", { exact: true }).fill("Studio usability");
    await page
      .getByRole("button", { name: "Projekt erstellen …", exact: true })
      .click();
    await field(page, "Neue Figur", { exact: true }).fill("Synthetic Mira");
    await page
      .getByRole("button", { name: "Figur erstellen", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Synthetic Mira", exact: true }),
    ).toBeVisible();
    await dialog(file);
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
    await expect(
      page.getByAltText("Freigegebener Master V1", { exact: true }),
    ).toBeVisible();
    const manifest = () =>
      fs
        .readFile(path.join(project, "laceframe.json"), "utf8")
        .then(JSON.parse);
    const master = (await manifest()).masters[0];
    const original = await fs.readFile(path.join(project, master.file));
    for (const [width, height] of [
      [960, 720],
      [1280, 800],
      [1920, 1080],
    ]) {
      await app.evaluate(
        ({ BrowserWindow }, s) =>
          BrowserWindow.getAllWindows()[0].setContentSize(s.width, s.height),
        { width, height },
      );
      await nav(page, "Characters");
      if (!process.env.LACEFRAME_UX_AUDIT) {
        const preview = page.locator(".characters-workspace .portrait-preview");
        await expect(
          preview.getByRole("button", { name: "Einpassen", exact: true }),
        ).toBeVisible();
        await preview
          .getByRole("button", { name: "Einpassen", exact: true })
          .click();
        const image = preview.getByAltText("Freigegebener Master V1", {
          exact: true,
        });
        await expect
          .poll(async () =>
            image.evaluate((n) => n.complete && n.naturalWidth > 0),
          )
          .toBe(true);
        const fitted = await image.boundingBox(),
          viewport = await preview
            .locator(".pixel-camera-viewport")
            .boundingBox();
        expect(fitted.width).toBeLessThanOrEqual(viewport.width + 1);
        expect(fitted.height).toBeLessThanOrEqual(viewport.height + 1);
        const hash = await fs.readFile(path.join(project, master.file));
        expect(hash.equals(original)).toBe(true);
        await preview
          .getByRole("button", { name: "200%", exact: true })
          .click();
        await expect(
          preview.getByLabel("Bildzoom", { exact: true }),
        ).toHaveText("200%");
        const camera = preview.locator(".pixel-camera-viewport");
        await camera.scrollIntoViewIfNeeded();
        const box = await camera.boundingBox();
        console.log("camera", width, box);
        await page.mouse.move(
          box.x + box.width * 0.7,
          box.y + box.height * 0.4,
        );
        const anchor = await image.evaluate(
          (n, p) => {
            const r = n.getBoundingClientRect();
            return [(p.x - r.x) / r.width, (p.y - r.y) / r.height];
          },
          { x: box.x + box.width * 0.7, y: box.y + box.height * 0.4 },
        );
        await page.keyboard.down("Alt");
        await page.mouse.click(
          box.x + box.width * 0.7,
          box.y + box.height * 0.4,
        );
        await page.keyboard.up("Alt");
        await page.mouse.wheel(0, -140);
        await expect
          .poll(() =>
            preview.getByLabel("Bildzoom", { exact: true }).textContent(),
          )
          .not.toBe("200%");
        const after = await image.evaluate(
          (n, p) => {
            const r = n.getBoundingClientRect();
            return [(p.x - r.x) / r.width, (p.y - r.y) / r.height];
          },
          { x: box.x + box.width * 0.7, y: box.y + box.height * 0.4 },
        );
        expect(after[0]).toBeCloseTo(anchor[0], 2);
        expect(after[1]).toBeCloseTo(anchor[1], 2);
        await camera.focus();
        await page.keyboard.down("Space");
        const before = await image.boundingBox();
        await page.mouse.move(box.x + 50, box.y + 50);
        await page.mouse.down();
        await page.mouse.move(box.x + 80, box.y + 70);
        await page.mouse.up();
        await page.keyboard.up("Space");
        await expect
          .poll(async () =>
            Math.round((await image.boundingBox()).x - before.x),
          )
          .toBe(30);
        await preview
          .getByRole("button", { name: "Einpassen", exact: true })
          .click();
      }
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.screenshot({
        path: path.join(screenshots, `characters-${width}.png`),
      });
      await nav(page, "Studio");
      await page
        .getByRole("button", { name: "Expression erstellen", exact: true })
        .click();
      for (const step of ["Auswählen", "Erzeugen", "Bearbeiten", "Freigeben"]) {
        await studioStep(page, step);
        if (
          !process.env.LACEFRAME_UX_AUDIT &&
          ["Auswählen", "Erzeugen"].includes(step)
        ) {
          await expect(
            page
              .locator(".studio-editor:visible")
              .getByAltText("Synthetic Mira · Master V1", { exact: true }),
          ).toBeVisible();
          await expect(
            page.locator(".studio-editor:visible details:visible"),
          ).toHaveCount(0);
        }
        if (step === "Erzeugen" && width === 960) {
          await dialog(file);
          await page
            .getByRole("button", {
              name: "Ergebnis importieren …",
              exact: true,
            })
            .click();
          await expect
            .poll(async () => (await manifest()).assets.length)
            .toBe(1);
        }
        if (!process.env.LACEFRAME_UX_AUDIT) {
          await expect(
            page.locator(".studio-editor:visible details:visible"),
          ).toHaveCount(0);
          expect(
            await page.evaluate(
              () => document.documentElement.scrollWidth <= window.innerWidth,
            ),
          ).toBe(true);
        }
        await page.evaluate(() => window.scrollTo(0, 0));
        if (!process.env.LACEFRAME_UX_AUDIT && step === "Bearbeiten") {
          const tool = page.getByRole("button", {
            name: "Hintergrund freistellen",
            exact: true,
          });
          await expect(tool).toBeVisible();
          expect((await tool.boundingBox()).y).toBeLessThan(height - 30);
          await expect(
            page.getByRole("button", {
              name: "Farbkonsistenz prüfen",
              exact: true,
            }),
          ).toBeVisible();
          expect(
            (
              await page
                .getByRole("button", {
                  name: "Farbkonsistenz prüfen",
                  exact: true,
                })
                .boundingBox()
            ).y,
          ).toBeLessThan(height - 30);
          if (width === 960) {
            await page
              .getByRole("button", {
                name: "Farbkonsistenz prüfen",
                exact: true,
              })
              .click();
            const color = page.getByRole("dialog", {
              name: "Farbkonsistenz",
              exact: true,
            });
            await expect(color).toBeVisible();
            await expect(
              page.locator(".editor-workspace-screen:visible"),
            ).toHaveCount(1);
            await color
              .getByRole("button", {
                name: "Schließen / verwerfen",
                exact: true,
              })
              .click();
            await page
              .getByRole("button", {
                name: "Hintergrund freistellen",
                exact: true,
              })
              .click();
            const mask = page.getByRole("dialog", {
              name: "Freistellungsmaske",
              exact: true,
            });
            await expect(mask).toBeVisible();
            await expect(
              page.locator(".editor-workspace-screen:visible"),
            ).toHaveCount(1);
            await mask
              .getByRole("button", { name: "Editor schließen", exact: true })
              .click();
          }
        }
        await page.screenshot({
          path: path.join(screenshots, `expression-${step}-${width}.png`),
        });
      }
    }
    if (!process.env.LACEFRAME_UX_AUDIT) {
      await studioStep(page, "Freigeben");
      await page
        .getByRole("button", { name: "Als Expression freigeben", exact: true })
        .click();
      await expect
        .poll(async () => (await manifest()).assets[0].status)
        .toBe("approved");
      const asset = (await manifest()).assets[0];
      await page
        .getByRole("button", { name: "In Bibliothek prüfen", exact: true })
        .click();
      const destination = path.join(root, "exports");
      await fs.mkdir(destination);
      await dialog(destination);
      const quality = page.locator('[data-testid="asset-quality"]:visible');
      await quality
        .getByRole("button", {
          name: "Transparentes PNG exportieren",
          exact: true,
        })
        .click();
      await expect(quality).toContainText("Exportiert:");
      const exported = (await fs.readdir(destination)).find((n) =>
        n.endsWith(".png"),
      );
      expect(await fs.readFile(path.join(destination, exported))).toEqual(
        await fs.readFile(path.join(project, asset.file)),
      );
      await nav(page, "Characters");
      await page
        .getByRole("button", { name: "Master neu aufbauen", exact: true })
        .click();
      await dialog(file);
      await page
        .getByRole("button", {
          name: "Identitätsbilder hinzufügen …",
          exact: true,
        })
        .click();
      await expect(
        page.getByAltText("Identität 1", { exact: true }),
      ).toBeVisible();
      await field(page, "Figurenerstellung Outfit", { exact: true }).fill(
        "Retained blue coat draft",
      );
      for (const [width, height] of [
        [960, 720],
        [1280, 800],
        [1920, 1080],
      ]) {
        await app.evaluate(
          ({ BrowserWindow }, s) =>
            BrowserWindow.getAllWindows()[0].setContentSize(s.width, s.height),
          { width, height },
        );
        for (const step of ["Auswählen", "Erzeugen"]) {
          await studioStep(page, step);
          await expect(
            page.locator(".studio-editor:visible details:visible"),
          ).toHaveCount(0);
          await page.evaluate(() => window.scrollTo(0, 0));
          await page.screenshot({
            path: path.join(screenshots, `master-${step}-${width}.png`),
          });
        }
      }
      await studioStep(page, "Auswählen");
      await expect(
        field(page, "Figurenerstellung Outfit", { exact: true }),
      ).toHaveValue("Retained blue coat draft");
      expect((await manifest()).masterAttempts).toEqual([]);
      expect((await manifest()).characters[0].masterId).toBe(master.id);
    }
    for (const area of [
      "Characters",
      "Art Direction",
      "Expressions",
      "Library",
    ]) {
      await nav(page, area);
      await page.screenshot({
        path: path.join(screenshots, `audit-${area}.png`),
      });
    }
    expect(
      createHash("sha256")
        .update(await fs.readFile(path.join(project, master.file)))
        .digest("hex"),
    ).toBe(master.sha256);
    expect(errors).toEqual([]);
    console.log(
      process.env.LACEFRAME_UX_AUDIT
        ? "UX baseline screenshots recorded; no UX acceptance claim."
        : "Studio usability acceptance passed: cameras, steps, imports, immutable source, responsive screenshots.",
    );
  } catch (error) {
    if (app)
      await (
        await app.firstWindow()
      ).screenshot({ path: path.join(screenshots, "failure.png") });
    throw error;
  } finally {
    if (app) await app.close();
    await fs.rm(root, { recursive: true, force: true });
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
