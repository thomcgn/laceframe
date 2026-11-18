// Synthetic RGBA fixtures, real worker/render/storage/export. No generation/provider request.
const { _electron: electron, expect } = require("@playwright/test");
const fs = require("node:fs/promises"),
  path = require("node:path"),
  os = require("node:os");
const { PNG } = require("pngjs");
const { createHash } = require("node:crypto");
(async () => {
  const root = await fs.mkdtemp(
      path.join(os.tmpdir(), "laceframe-relighting-ui-"),
    ),
    project = path.join(root, "project"),
    exports = path.join(root, "exports");
  await fs.mkdir(project);
  await fs.mkdir(exports);
  let app, page;
  const errors = [];
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
    page.setDefaultTimeout(15000);
    page.on("pageerror", (e) => errors.push(e.message));
    await expect(
      page.getByRole("button", { name: "Neues Projekt", exact: true }),
    ).toBeVisible({ timeout: 25000 });
  };
  const chooser = (file) =>
    app.evaluate(({ dialog }, file) => {
      dialog.showOpenDialog = async () => ({
        canceled: false,
        filePaths: [file],
      });
    }, file);
  const hash = (b) => createHash("sha256").update(b).digest("hex");
  const ready = async () => {
    await expect(
      page.getByRole("status", { name: "Lichtberechnung", exact: true }),
    ).toContainText("Vorschau bereit");
    await expect(
      page.getByRole("button", {
        name: "Als Lichtkandidat übernehmen",
        exact: true,
      }),
    ).toBeEnabled();
  };
  const getFramebuffer = async () =>
    page
      .getByRole("dialog", { name: "Live Relighting", exact: true })
      .locator(".relight-canvas canvas")
      .evaluate((c) => {
        const gl = c.getContext("webgl");
        if (gl) {
          const p = new Uint8Array(c.width * c.height * 4);
          gl.readPixels(0, 0, c.width, c.height, gl.RGBA, gl.UNSIGNED_BYTE, p);
          return { gpu: true, width: c.width, height: c.height, bytes: [...p] };
        }
        return {
          gpu: false,
          width: c.width,
          height: c.height,
          bytes: [
            ...c.getContext("2d").getImageData(0, 0, c.width, c.height).data,
          ],
        };
      });
  try {
    await launch();
    await chooser(project);
    await require("./smoke-ui.cjs").prepareProjectCreation(page);
    await page
      .getByLabel("Projektname", { exact: true })
      .fill("Relight synthetic");
    await page
      .getByRole("button", { name: "Projekt erstellen …", exact: true })
      .click();
    await page
      .getByLabel("Neue Figur", { exact: true })
      .fill("Relight Character");
    await page
      .getByRole("button", { name: "Figur erstellen", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Relight Character", exact: true }),
    ).toBeVisible();
    const source = new PNG({ width: 128, height: 96 });
    for (let y = 0; y < 96; y++)
      for (let x = 0; x < 128; x++) {
        const k = (y * 128 + x) * 4;
        source.data.set([70, 120, 160, 0], k);
        if (x > 15 && x < 112 && y > 10 && y < 85)
          source.data.set(
            [80 + (x % 16), 110, 150, x === 16 || x === 111 ? 128 : 255],
            k,
          );
      }
    const bytes = PNG.sync.write(source);
    await page.evaluate(
      async (bytes) => {
        const r = await window.laceframe.stageImage(
          new Uint8Array(bytes),
          "synthetic.png",
        );
        if (!r.ok) throw new Error(r.error);
        const p = await window.laceframe.command({
          type: "addCharacter",
          name: "Temporary secondary",
        });
        if (!p.ok) throw new Error(p.error); // command validation/source selection stays real
        const original = p.value.project.characters[0].id;
        await window.laceframe.command({
          type: "selectCharacter",
          id: original,
        });
        const c = await window.laceframe.command({
          type: "confirmMaster",
          characterId: original,
          token: r.value.token,
          review: {
            sourceSha256: r.value.sha256,
            identityConfirmed: true,
            silhouetteConfirmed: true,
            activationConfirmed: true, rasterConfirmed: true,
            notes: "Synthetic silhouette and identity review",
          },
        });
        if (!c.ok) throw new Error(c.error);
        const cut = await window.laceframe.command({
          type: "createCutout",
          sourceId: c.value.project.masters.at(-1).id,
          name: "Reviewed transparent fixture",
          weights: new Uint8Array(128 * 96).fill(255),
        });
        if (!cut.ok) throw new Error(cut.error);
        const checked = await window.laceframe.command({
          type: "reviewQuality",
          id: cut.value.project.qualityAssets.at(-1).id,
          status: "approved",
          notes: "Synthetic silhouette and alpha manually reviewed",
          confirmStyleAndSilhouette: true, rasterConfirmed: true,
        });
        if (!checked.ok) throw new Error(checked.error);
      },
      [...bytes],
    );
    // Reopen through the UI so all renderer state is from the persisted real project.
    await app.close();
    await launch();
    await chooser(project);
    await page
      .getByRole("button", { name: /^Projekt öffnen(?: …)?$/ })
      .click();
    await expect(
      page.getByRole("heading", { name: "Relight Character", exact: true }),
    ).toBeVisible();
    let quality = page.locator('[data-testid="asset-quality"]:visible').first();
    await expect(quality.getByRole("heading", {name: "Bild bearbeiten", exact: true})).toBeVisible();
    await quality
      .getByRole("button", { name: "Live Relighting öffnen", exact: true })
      .click();
    await ready();
    let dialog = page.getByRole("dialog", {
      name: "Live Relighting",
      exact: true,
    });
    const baseline = await fs.readFile(path.join(project, "laceframe.json"));
    const files = await fs
      .readdir(path.join(project, "assets", "quality"))
      .catch(() => []);
    const originalFrame = await getFramebuffer();
    // A camera-only zoom retains the actual GPU/CPU canvas and its canonical pixels.
    const lightCanvas = await dialog
      .locator(".relight-canvas canvas")
      .elementHandle();
    await dialog
      .getByRole("button", { name: "Bild vergrößern", exact: true })
      .click();
    await expect(dialog.getByLabel("Lichtzoom", { exact: true })).toHaveValue(
      "1.25",
    );
    expect(
      await lightCanvas.evaluate(
        (c) => c === document.querySelector(".relight-canvas canvas"),
      ),
    ).toBe(true);
    expect((await getFramebuffer()).bytes).toEqual(originalFrame.bytes);
    await dialog.getByRole("button", { name: "1:1", exact: true }).click();
    await expect(dialog.getByLabel("Lichtzoom", { exact: true })).toHaveValue(
      "1",
    );

    await dialog.getByLabel("Intensität", { exact: true }).fill("0.8");
    await dialog.getByLabel("Farbtemperatur", { exact: true }).fill("0.5");
    await dialog.getByLabel("Schattenstärke", { exact: true }).fill("0.3");
    await ready();
    const lit = await getFramebuffer();
    expect(lit.bytes).not.toEqual(originalFrame.bytes);
    await dialog
      .getByRole("button", { name: "Licht rückgängig", exact: true })
      .click();
    await ready();
    await dialog
      .getByRole("button", { name: "Licht wiederholen", exact: true })
      .click();
    await ready();
    expect((await getFramebuffer()).bytes).toEqual(lit.bytes);
    await dialog.getByLabel("Pixelart-Licht", { exact: true }).check();
    await dialog.getByLabel("Lichtstufen", { exact: true }).fill("3");
    await ready();
    await dialog.getByLabel("Lichtzoom", { exact: true }).selectOption("4");
    await expect(dialog.locator("canvas").first()).toHaveCSS(
      "image-rendering",
      "pixelated",
    );
    const gpu = await getFramebuffer();
    console.log("Relighting GPU path actually used:", gpu.gpu);
    await dialog.getByLabel("CPU-Anzeige erzwingen", { exact: true }).check();
    await expect(
      dialog.getByRole("status", { name: "Lichtdarstellung", exact: true }),
    ).toContainText("CPU Canvas2D");
    const cpu = await getFramebuffer();
    // GPU readback is premultiplied and vertically flipped; CPU readback is unpremultiplied.
    if (gpu.gpu)
      for (let y = 0; y < cpu.height; y++)
        for (let x = 0; x < cpu.width; x++) {
          const k = (y * cpu.width + x) * 4,
            g = ((cpu.height - 1 - y) * cpu.width + x) * 4,
            a = cpu.bytes[k + 3];
          expect(gpu.bytes[g + 3]).toBe(a);
          for (let c = 0; c < 3; c++)
            expect(
              Math.abs(
                gpu.bytes[g + c] - Math.round((cpu.bytes[k + c] * a) / 255),
              ),
            ).toBeLessThanOrEqual(1);
        }
    expect(await fs.readFile(path.join(project, "laceframe.json"))).toEqual(
      baseline,
    );
    expect(
      await fs.readdir(path.join(project, "assets", "quality")).catch(() => []),
    ).toEqual(files);
    // Both layouts, accessible sticky actions, no modal/document overflow.
    await fs.mkdir("artifacts", { recursive: true });
    for (const [width, height] of [
      [960, 720],
      [1440, 900],
    ]) {
      await app.evaluate(
        ({ BrowserWindow }, { width, height }) =>
          BrowserWindow.getAllWindows()[0].setSize(width, height),
        { width, height },
      );
      await expect
        .poll(() => dialog.evaluate((el) => el.scrollWidth <= el.clientWidth))
        .toBe(true);
      await expect(
        dialog.getByRole("button", {
          name: "Als Lichtkandidat übernehmen",
          exact: true,
        }),
      ).toBeInViewport();
      await page.screenshot({ path: `artifacts/relighting-${width}.png` });
    }
    await dialog
      .getByRole("button", {
        name: "Original / Vorschau vergleichen",
        exact: true,
      })
      .click();
    expect((await getFramebuffer()).bytes).not.toEqual(cpu.bytes);
    await dialog
      .getByRole("button", {
        name: "Original / Vorschau vergleichen",
        exact: true,
      })
      .click();
    await dialog
      .getByRole("button", {
        name: "Als Lichtkandidat übernehmen",
        exact: true,
      })
      .click();
    await expect(dialog).not.toBeVisible();
    let p = await manifest(),
      q = p.qualityAssets.at(-1);
    expect(q.status).toBe("candidate");
    expect(p.masters).toHaveLength(2);
    expect(q.sourceSha256).toBe(
      p.qualityAssets.find((q) => q.operation === "cutout").sha256,
    );
    const rendered = PNG.sync.read(
      await fs.readFile(path.join(project, q.file)),
    );
    expect(hash(rendered.data)).toBe(q.relighting.pixelSha256);
    for (let i = 0; i < 128 * 96; i++) {
      expect(rendered.data[i * 4 + 3]).toBe(source.data[i * 4 + 3]);
      if (source.data[i * 4 + 3] === 0)
        expect([...rendered.data.slice(i * 4, i * 4 + 4)]).toEqual([
          ...source.data.slice(i * 4, i * 4 + 4),
        ]);
      else
        for (let c = 0; c < 3; c++)
          expect(
            Math.abs(rendered.data[i * 4 + c] - cpu.bytes[i * 4 + c]),
          ).toBeLessThanOrEqual(source.data[i * 4 + 3] === 255 ? 0 : 1);
    }
    quality = page.locator('[data-testid="asset-quality"]:visible').first();
    await quality
      .getByRole("textbox", {
        name: "Qualitätsnotiz",
        exact: true,
      })
      .fill("Manually checked fixture, alpha and identity unchanged");
    await quality
      .getByLabel(
        "Identität, Outfit, Konturen, Raster, Stil und Alpha-Kanten visuell geprüft",
        { exact: true },
      )
      .check();
    page.once("dialog", (d) => d.accept());
    await quality
      .getByRole("button", { name: "Qualitätsversion freigeben", exact: true })
      .click();
    await expect.poll(async () => (await manifest()).masters.length).toBe(3);
    await expect(
      page.getByAltText("Freigegebener Master V3", { exact: true }),
    ).toBeVisible();
    quality = page.locator('[data-testid="asset-quality"]:visible').first();
    if ((await quality.getAttribute("open")) === null)
      await expect(quality.getByRole("heading", {name: "Bild bearbeiten", exact: true})).toBeVisible();
    // Reopen saved light recipe, reset, create and edit a manual semantic region.
    await quality
      .getByRole("button", { name: "Lichtrevision bearbeiten", exact: true })
      .click();
    await ready();
    await expect(dialog.getByLabel("Intensität", { exact: true })).toHaveValue(
      "0.8",
    );
    await dialog
      .getByRole("button", { name: "Licht zurücksetzen", exact: true })
      .click();
    await ready();
    await expect(dialog.getByLabel("Intensität", { exact: true })).toHaveValue(
      "0",
    );
    await dialog
      .locator("summary")
      .filter({ hasText: /Manuelle Lichtregionen/ })
      .click();
    await dialog
      .getByRole("button", { name: "Gesicht und Haut anlegen", exact: true })
      .click();
    const mask = page.getByRole("dialog", {
      name: "Bearbeitungsmaske",
      exact: true,
    });
    await expect(mask).toBeVisible();
    await mask.getByLabel("Pinselgröße", { exact: true }).fill("20");
    const picture = mask.getByAltText("Masken-Master");
    const b = await picture.boundingBox();
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
    await page.mouse.down();
    await page.mouse.move(b.x + b.width / 2 + 5, b.y + b.height / 2, {
      steps: 10,
    });
    await expect
      .poll(() =>
        mask
          .locator("canvas")
          .evaluate(
            (c) =>
              c
                .getContext("2d")
                .getImageData(
                  Math.floor(c.width / 2),
                  Math.floor(c.height / 2),
                  1,
                  1,
                ).data[3],
          ),
      )
      .toBeGreaterThan(0);
    await expect(
      mask.getByRole("button", {
        name: "Maskenrevision speichern",
        exact: true,
      }),
    ).toBeDisabled();
    await page.mouse.up();
    await mask
      .getByRole("button", { name: "Maskenrevision speichern", exact: true })
      .click();
    await expect(mask).not.toBeVisible();
    await dialog.getByLabel("Intensität", { exact: true }).fill("1");
    await ready();
    await dialog
      .getByRole("button", {
        name: "Als Lichtkandidat übernehmen",
        exact: true,
      })
      .click();
    await expect(dialog).not.toBeVisible();
    p = await manifest();
    q = p.qualityAssets.at(-1);
    expect(q.relighting.regions).toHaveLength(1);
    expect(q.relighting.regions[0].mask.type).toBe("lighting-weight");
    // Export the earlier approved exact preview, independent of newest candidate.
    const approved = p.masters[2];
    await chooser(exports);
    const exported = await page.evaluate(
      (id) =>
        window.laceframe.exportAsset({ id, raw: false, provenance: true }),
      approved.id,
    );
    expect(exported.ok).toBe(true);
    const exportedBytes = await fs.readFile(
      path.join(exports, exported.value.name),
    );
    expect(hash(exportedBytes)).toBe(approved.sha256);
    expect(hash(await fs.readFile(path.join(project, p.masters[0].file)))).toBe(
      hash(bytes),
    );
    const saved = await fs.readFile(path.join(project, "laceframe.json"));
    await app.close();
    await launch();
    await chooser(project);
    await page
      .getByRole("button", { name: /^Projekt öffnen(?: …)?$/ })
      .click();
    await expect(
      page.getByAltText("Freigegebener Master V3", { exact: true }),
    ).toBeVisible();
    expect(await fs.readFile(path.join(project, "laceframe.json"))).toEqual(
      saved,
    );
    quality = page.locator('[data-testid="asset-quality"]:visible').first();
    await expect(quality.getByRole("heading", {name: "Bild bearbeiten", exact: true})).toBeVisible();
    await quality
      .getByRole("button", { name: "Lichtrevision bearbeiten", exact: true })
      .click();
    await ready();
    dialog = page.getByRole("dialog", { name: "Live Relighting", exact: true });
    await dialog
      .getByRole("button", { name: "Verwerfen & schließen", exact: true })
      .click();
    expect(await fs.readFile(path.join(project, "laceframe.json"))).toEqual(
      saved,
    );
    // Saved regional recipe and painted weights are restored through the Library after restart.
    await page
      .getByRole("navigation", { name: "Hauptnavigation" })
      .getByRole("button", { name: /Library$/ })
      .click();
    await page
      .getByLabel("Library Assettyp", { exact: true })
      .selectOption("quality");
    await page.getByLabel("Library Asset", { exact: true }).selectOption(q.id);
    quality = page.locator('[data-testid="asset-quality"]:visible').first();
    await expect(quality.getByRole("heading", {name: "Bild bearbeiten", exact: true})).toBeVisible();
    await quality
      .getByRole("button", { name: "Lichtrevision bearbeiten", exact: true })
      .click();
    await ready();
    await dialog
      .getByLabel("Lichtregion", { exact: true })
      .selectOption(q.relighting.regions[0].id);
    await expect(dialog.getByLabel("Intensität", { exact: true })).toHaveValue(
      "1",
    );
    await dialog
      .locator("summary")
      .filter({ hasText: /Manuelle Lichtregionen/ })
      .click();
    await dialog
      .getByRole("button", { name: "Lichtmaske bearbeiten", exact: true })
      .click();
    const reopenedMask = page.getByRole("dialog", {
      name: "Bearbeitungsmaske",
      exact: true,
    });
    await expect
      .poll(() =>
        reopenedMask.locator("canvas").evaluate((c) => {
          const b = c
            .getContext("2d")
            .getImageData(0, 0, c.width, c.height).data;
          let sum = 0;
          for (let i = 3; i < b.length; i += 4) sum += b[i];
          return sum;
        }),
      )
      .toBeGreaterThan(0);
    await reopenedMask
      .getByRole("button", { name: "Editor schließen", exact: true })
      .click();
    await dialog
      .getByRole("button", { name: "Verwerfen & schließen", exact: true })
      .click();
    expect(await fs.readFile(path.join(project, "laceframe.json"))).toEqual(
      saved,
    );
    // Exercise the actual worker/GPU path at the accepted 4MP bound, with coalesced rapid changes.
    await page
      .getByRole("navigation", { name: "Hauptnavigation" })
      .getByRole("button", { name: /Characters$/ })
      .click();
    await page.getByLabel("Neue Figur", { exact: true }).fill("Large fixture");
    await page
      .getByRole("button", { name: "Figur erstellen", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Large fixture", exact: true }),
    ).toBeVisible();
    const large = new PNG({ width: 2048, height: 2048 });
    large.data.fill(120);
    for (let i = 3; i < large.data.length; i += 4) large.data[i] = 255;
    for (let y = 0; y < 2048; y++)
      for (let x = 0; x < 2048; x++)
        if (!x || !y || x === 2047 || y === 2047)
          large.data[(y * 2048 + x) * 4 + 3] = 0;
    for (let y = 0; y < 2048; y++)
      for (let x = 0; x < 2048; x++)
        if (!x || !y || x === 2047 || y === 2047)
          large.data[(y * 2048 + x) * 4 + 3] = 0;
    const selected = (await manifest()).selectedCharacterId;
    await page.evaluate(
      async ({ bytes, id }) => {
        const r = await window.laceframe.stageImage(
          new Uint8Array(bytes),
          "large.png",
        );
        if (!r.ok) throw new Error(r.error);
        const s = await window.laceframe.command({
          type: "confirmMaster",
          characterId: id,
          token: r.value.token,
          review: {
            sourceSha256: r.value.sha256,
            identityConfirmed: true,
            silhouetteConfirmed: true,
            activationConfirmed: true, rasterConfirmed: true,
            notes: "Synthetic silhouette and identity review",
          },
        });
        if (!s.ok) throw new Error(s.error);
        const weights = new Uint8Array(2048 * 2048).fill(255);
        for (let x = 0; x < 2048; x++) {
          weights[x] = 0;
          weights[2047 * 2048 + x] = 0;
          weights[x * 2048] = 0;
          weights[x * 2048 + 2047] = 0;
        }
        const cut = await window.laceframe.command({
          type: "createCutout",
          sourceId: s.value.project.masters.at(-1).id,
          name: "Large explicit cutout",
          weights,
        });
        if (!cut.ok) throw new Error(cut.error);
        const checked = await window.laceframe.command({
          type: "reviewQuality",
          id: cut.value.project.qualityAssets.at(-1).id,
          status: "approved",
          notes: "Large synthetic silhouette and alpha manually reviewed",
          confirmStyleAndSilhouette: true, rasterConfirmed: true,
        });
        if (!checked.ok) throw new Error(checked.error);
      },
      { bytes: [...PNG.sync.write(large)], id: selected },
    );
    // Reload the project view via real close/reopen to synchronize the direct typed fixture import.
    await app.close();
    await launch();
    await chooser(project);
    await page
      .getByRole("button", { name: /^Projekt öffnen(?: …)?$/ })
      .click();
    await expect(
      page.getByAltText("Freigegebener Master V2", { exact: true }),
    ).toBeVisible();
    const largeBefore = await fs.readFile(path.join(project, "laceframe.json"));
    quality = page.locator('[data-testid="asset-quality"]:visible').first();
    await expect(quality.getByRole("heading", {name: "Bild bearbeiten", exact: true})).toBeVisible();
    await quality
      .getByRole("button", { name: "Live Relighting öffnen", exact: true })
      .click();
    await ready();
    dialog = page.getByRole("dialog", { name: "Live Relighting", exact: true });
    await dialog.getByLabel("Intensität", { exact: true }).evaluate((input) => {
      for (let i = 0; i < 20; i++) {
        Object.getOwnPropertyDescriptor(
          window.HTMLInputElement.prototype,
          "value",
        ).set.call(input, String(i / 20));
        input.dispatchEvent(new window.Event("input", { bubbles: true }));
      }
    });
    await dialog.getByLabel("Intensität", { exact: true }).fill("0.9");
    await ready();
    console.log(
      "4MP actual worker:",
      await page
        .getByRole("status", { name: "Lichtberechnung", exact: true })
        .innerText(),
    );
    const metrics = await app.evaluate(({ app }) =>
      app.getAppMetrics().map((p) => ({
        type: p.type,
        workingSetKiB: p.memory.workingSetSize,
        peakWorkingSetKiB: p.memory.peakWorkingSetSize,
      })),
    );
    await fs.writeFile(
      "artifacts/relighting-performance.json",
      JSON.stringify(
        {
          worker: await page
            .getByRole("status", { name: "Lichtberechnung", exact: true })
            .innerText(),
          gpu: gpu.gpu,
          processes: metrics,
        },
        null,
        2,
      ),
    );
    expect(await fs.readFile(path.join(project, "laceframe.json"))).toEqual(
      largeBefore,
    );
    // UX-06: cancelling discard retains the live draft and project bytes.
    page.once("dialog", (d) => d.dismiss());
    await dialog
      .getByRole("button", { name: "Verwerfen & schließen", exact: true })
      .click();
    await expect(dialog).toBeVisible();
    expect(await fs.readFile(path.join(project, "laceframe.json"))).toEqual(
      largeBefore,
    );
    page.once("dialog", (d) => d.accept());
    await dialog
      .getByRole("button", { name: "Verwerfen & schließen", exact: true })
      .click();
    await expect(dialog).toBeHidden();
    expect(await page.locator("#root").evaluate((el) => el.inert)).toBe(false);

    expect(errors).toEqual([]);
    console.log(
      "PASS relighting: worker live updates without disk writes, real GPU/CPU premultiplied agreement (GPU=" +
        gpu.gpu +
        "), nearest display, quantized light, alpha/hidden RGB, undo/redo/reset, manual region painting, exact preview PNG hash, separate candidate, human Master V3 review after reviewed cutout, recipe restore, export identity, discard/restart and both desktop sizes. No live generation.",
    );
  } catch (e) {
    if (page && !page.isClosed()) {
      console.error(await page.locator("body").innerText());
      await fs.mkdir("artifacts", { recursive: true });
      await page.screenshot({ path: "artifacts/relighting-failure.png" });
    }
    throw e;
  } finally {
    if (app) await app.close();
    await fs.rm(root, { recursive: true, force: true });
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
