const { studioStep, studioExpert } = require("./smoke-ui.cjs");
const checkIdentityComparison = require("./identity-comparison-checks.cjs");
const { PNG } = require("pngjs");
const { field, image, nav } = require("./smoke-ui.cjs");
// Packaged Character Creator with synthetic images and explicit Codex protocol double only.
const { _electron: electron, expect } = require("@playwright/test");
const fs = require("node:fs/promises"),
  os = require("node:os"),
  path = require("node:path");
const { createHash } = require("node:crypto");
(async () => {
  const root = await fs.mkdtemp(
      path.join(os.tmpdir(), "laceframe-creator-desktop-"),
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
  let app, page;
  const errors = [];
  const manifest = async () =>
    JSON.parse(await fs.readFile(path.join(project, "laceframe.json"), "utf8"));
  const turns = async () =>
    (await fs.readFile(path.join(root, "trace.jsonl"), "utf8").catch(() => ""))
      .trim()
      .split("\n")
      .filter(Boolean)
      .map(JSON.parse)
      .filter((m) => m.method === "turn/start");
  const launch = async () => {
    app = await electron.launch({
      executablePath: path.resolve("out/Laceframe-linux-x64/laceframe"),
      args: ["--user-data-dir=" + path.join(root, "user-data")],
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
      dialog.showOpenDialog = async (...args) => {
        dialog.showOpenDialog.lastOptions = args[1];
        return {
          canceled: file === null,
          filePaths: file === null ? [] : Array.isArray(file) ? file : [file],
        };
      };
    }, file);
  const drop = async (selector, bytes, name, type) =>
    page.evaluate(
      ({ selector, bytes, name, type }) => {
        const transfer = new DataTransfer();
        transfer.items.add(new File([new Uint8Array(bytes)], name, { type }));
        document
          .querySelector(selector)
          .dispatchEvent(
            new DragEvent("drop", { bubbles: true, dataTransfer: transfer }),
          );
      },
      { selector, bytes, name, type },
    );
  try {
    await launch();
    await chooser(project);
    await require("./smoke-ui.cjs").prepareProjectCreation(page);
    await field(page, "Projektname", { exact: true }).fill("Cameo synthetic");
    await page
      .getByRole("button", { name: "Projekt erstellen …", exact: true })
      .click();
    const makeImage = async (shade, jpg = false) =>
      app.evaluate(
        ({ nativeImage }, { shade, jpg }) => {
          const width = jpg ? 4032 : 72,
            height = jpg ? 3024 : 96;
          const b = Buffer.alloc(width * height * 4, shade);
          for (let i = 3; i < b.length; i += 4) b[i] = 255;
          const image = nativeImage.createFromBitmap(b, {
            width,
            height,
          });
          return [...(jpg ? image.toJPEG(95) : image.toPNG())];
        },
        { shade, jpg },
      );
    const rawPhoto = await makeImage(80, true),
      other = await makeImage(140),
      style = await makeImage(190),
      result = await makeImage(110);
    const transparentResult = PNG.sync.read(Buffer.from(result));
    for (let y = 0; y < 96; y++)
      for (let x = 0; x < 72; x++)
        if (!x || !y || x === 71 || y === 95)
          transparentResult.data[(y * 72 + x) * 4 + 3] = 0;
    const approvedResult = [...PNG.sync.write(transparentResult)];
    // Synthetic phone JPEG with EXIF orientation 6; source bytes are never rotated/re-encoded.
    const exif = Buffer.from(
      "45786966000049492a0008000000010012010300010000000600000000000000",
      "hex",
    );
    const photo = [
      ...Buffer.concat([
        Buffer.from(rawPhoto).subarray(0, 2),
        Buffer.from([255, 225, 0, 34]),
        exif,
        Buffer.from(rawPhoto).subarray(2),
      ]),
    ];
    const selfiePath = path.join(root, "synthetic-selfie.jpg"),
      stylePath = path.join(root, "synthetic-style.png");
    await fs.writeFile(selfiePath, Buffer.from(photo));
    await fs.writeFile(stylePath, Buffer.from(style));
    const sourceHash = createHash("sha256")
      .update(Buffer.from(photo))
      .digest("hex");
    const thread = "00000000-0000-4000-8000-000000000123",
      output = path.join(root, "generated_images", thread);
    await fs.mkdir(output, { recursive: true });
    const hi = new PNG({ width: 1254, height: 1254 });
    for (let y = 150; y < 1150; y++)
      for (let x = 400; x < 850; x++)
        hi.data.set([170, 120, 90, 255], (y * 1254 + x) * 4);
    hi.data.set([170, 120, 90, 255], 0);
    await fs.writeFile(path.join(output, "result.png"), PNG.sync.write(hi));
    // Populate a real project style through the existing editor; no identity character yet.
    await nav(page, "Art Direction");
    await field(page, "Stilname", { exact: true }).fill(
      "Ada Voss · Illustrated Noir",
    );
    await field(
      page,
      "Darstellung-Regeln (ohne Charakter- oder Outfitmerkmale)",
      {
        exact: true,
      },
    ).fill("Illustrated noir, graphic contours, restrained pixel clusters.");
    await page
      .getByRole("button", { name: "Stil anlegen und auswählen", exact: true })
      .click();
    await chooser(stylePath);
    await page
      .getByRole("button", { name: "Stilbild importieren …", exact: true })
      .click();
    await expect(
      image(page, "Stil 1 · synthetic-style.png", { exact: true }),
    ).toBeVisible();
    await page
      .getByRole("navigation", { name: "Hauptnavigation" })
      .getByRole("button", { name: /Characters$/ })
      .click();
    await page
      .getByRole("button", { name: "Neuen Charakter erstellen", exact: true })
      .click();
    await field(page, "Name der Entwurfsfigur", { exact: true }).fill(
      "Synthetic Cameo",
    );
    await page
      .getByRole("button", { name: "Figurenentwurf anlegen", exact: true })
      .click();
    await expect(
      page
        .locator(".studio-editor:visible .character-creator")
        .getByText("Synthetic Cameo", { exact: true }),
    ).toBeVisible();
    await studioStep(page, "Erzeugen");
    // Header click explains missing prerequisites, focuses the fix and creates no attempt.
    await require("./smoke-ui.cjs").blockedGeneration(page, page.getByRole("button", {
        name: "Master generieren",
        exact: true,
      }));
    await expect(page.locator(".generation-requirements")).toContainText(
      "Identitätsbild fehlt",
    );
    await expect(page.locator(".generation-requirements")).toContainText(
      "Outfit ist unvollständig",
    );
    await page
      .getByRole("button", { name: "Outfit ist unvollständig.", exact: true })
      .click();
    await expect(field(page, "Figurenerstellung Outfit", { exact: true })).toBeFocused();
    const webp = await page.evaluate(() => {
      const c = document.createElement("canvas");
      c.width = 72;
      c.height = 96;
      const ctx = c.getContext("2d");
      ctx.fillStyle = "#b28060";
      ctx.fillRect(0, 0, 72, 96);
      return [
        ...Uint8Array.from(
          window.atob(c.toDataURL("image/webp").split(",")[1]),
          (c) => c.charCodeAt(0),
        ),
      ];
    });
    const pngPath = path.join(root, "identity.png"),
      webpPath = path.join(root, "identity.webp"),
      brokenPath = path.join(root, "broken.png");
    await fs.writeFile(pngPath, Buffer.from(other));
    await fs.writeFile(webpPath, Buffer.from(webp));
    await fs.writeFile(brokenPath, "broken");
    const addIdentities = () =>
      page.getByRole("button", {
        name: "Identitätsbilder hinzufügen …",
        exact: true,
      });
    const pristine = await fs.readFile(path.join(project, "laceframe.json"));
    for (const selection of [
      null,
      [selfiePath, pngPath, webpPath, selfiePath],
      [selfiePath, selfiePath],
      [selfiePath, brokenPath],
    ]) {
      await chooser(selection);
      await addIdentities().click();
      if (selection)
        await expect(page.getByRole("alert").first()).toContainText(
          selection.length === 4
            ? "3 von 3"
            : selection[1] === brokenPath
              ? "broken.png"
              : "doppelt",
        );
      await expect(addIdentities()).toBeEnabled();
      expect(await fs.readFile(path.join(project, "laceframe.json"))).toEqual(
        pristine,
      );
    }
    await chooser([selfiePath, pngPath, webpPath]);
    await addIdentities().click();
    await expect(image(page, "Identität 3", { exact: true })).toBeVisible();
    await expect(page.locator(".creator-identity")).toContainText(
      "3 von 3 Bildern",
    );
    expect((await manifest()).identityAssets.map((a) => a.format)).toEqual([
      "jpg",
      "png",
      "webp",
    ]);
    const options = await app.evaluate(
      ({ dialog }) => dialog.showOpenDialog.lastOptions,
    );
    expect(options.properties).toContain("multiSelections");
    expect(options.defaultPath).toBe(root);
    await expect(addIdentities()).toBeDisabled();
    const clearIdentities = async () => {
      for (let remaining = 2; remaining >= 0; remaining--) {
        page.once("dialog", (d) => d.accept());
        await page
          .locator(".creator-identity")
          .getByRole("button", { name: "Referenz entfernen", exact: true })
          .first()
          .click();
        await expect
          .poll(async () => (await manifest()).identityAssets.length)
          .toBe(remaining);
        await expect(page.locator(".creator-identity")).toContainText(
          `${remaining} von 3 Bildern`,
        );
      }
    };
    await clearIdentities();
    // Multi-file drop follows the identical atomic import path, without staging tokens.
    await page.evaluate(
      (files) => {
        const dataTransfer = new DataTransfer();
        for (const f of files)
          dataTransfer.items.add(
            new File([new Uint8Array(f.bytes)], f.name, { type: f.type }),
          );
        document
          .querySelector(".creator-identity")
          .dispatchEvent(
            new DragEvent("drop", { bubbles: true, dataTransfer }),
          );
      },
      [
        { bytes: photo, name: "one.jpg", type: "image/jpeg" },
        { bytes: other, name: "two.png", type: "image/png" },
        { bytes: webp, name: "three.webp", type: "image/webp" },
      ],
    );
    await expect(image(page, "Identität 3", { exact: true })).toBeVisible();
    await clearIdentities();
    await chooser(selfiePath);
    await page
      .getByRole("button", {
        name: "Identitätsbilder hinzufügen …",
        exact: true,
      })
      .click();
    await expect(image(page, "Identität 1", { exact: true })).toBeVisible();
    expect((await manifest()).identityAssets[0].format).toBe("jpg");
    expect((await manifest()).identityAssets[0]).toMatchObject({
      width: 3024,
      height: 4032,
    });
    expect(
      await image(page, "Identität 1", { exact: true }).evaluate((img) => ({
        width: img.naturalWidth,
        height: img.naturalHeight,
      })),
    ).toEqual({ width: 3024, height: 4032 });
    expect((await manifest()).identityAssets[0].sha256).toBe(sourceHash);
    await chooser([pngPath, webpPath]);
    await addIdentities().click();
    await expect(image(page, "Identität 3", { exact: true })).toBeVisible();
    for (let i = 0; i < 2; i++) {
      page.once("dialog", (d) => d.accept());
      await page
        .locator(".creator-identity")
        .getByRole("button", { name: "Referenz entfernen", exact: true })
        .last()
        .click();
      await expect
        .poll(async () => (await manifest()).identityAssets.length)
        .toBe(2 - i);
    }
    // The manifest write can finish before React clears the removal's busy state.
    // A synthetic drop dispatched while disabled is intentionally ignored by production.
    await expect(addIdentities()).toBeEnabled();
    await drop(".creator-identity", other, "identity.png", "image/png");
    await expect(image(page, "Identität 2", { exact: true })).toBeVisible();
    await drop(".creator-identity", webp, "identity.webp", "image/webp");
    await expect(image(page, "Identität 3", { exact: true })).toBeVisible();
    await expect(
      page.getByRole("button", {
        name: "Identitätsbilder hinzufügen …",
        exact: true,
      }),
    ).toBeDisabled();
    expect((await manifest()).masters).toEqual([]);
    expect(await turns()).toEqual([]);
    await expect(
      page
        .locator(".creator-identity")
        .getByRole("button", { name: "Vergleichen", exact: true })
        .first(),
    ).toBeDisabled();
    await studioStep(page, "Auswählen");
    await field(page, "Figurenerstellung Outfit", { exact: true }).fill(
      "Blue jacket and plain white shirt, no pendant or plaid.",
    );
    await studioStep(page, "Auswählen");
    await field(page, "Figurenerstellung Identitätsmerkmale", {
      exact: true,
    }).fill("Use only the individual in the identity photos.");
    await studioExpert(page);
    await expect(
      field(page, "Creator Promptmodus", { exact: true }),
    ).toHaveValue("automatic");
    await expect(
      field(page, "Creator Arbeits-Prompt", { exact: true }),
    ).toHaveValue(/IDENTITY REFERENCE/);
    await expect(
      field(page, "Creator Arbeits-Prompt", { exact: true }),
    ).toHaveValue(/Images 4–4 are STYLE ONLY/);
    // A retained draft survives style editing, mode changes and Library round trips.
    await studioStep(page, "Auswählen");
    const originalOutfit = await field(page, "Figurenerstellung Outfit", {
      exact: true,
    }).inputValue();
    await expect(
      field(page, "Creator Arbeits-Prompt", { exact: true }),
    ).toBeHidden();
    await studioStep(page, "Auswählen");
    await page
      .getByRole("button", { name: "Stilgestaltung bearbeiten", exact: true })
      .click();
    await field(page, "Licht und Schattierung", { exact: true }).fill(
      "Soft directional light, retained draft R3.",
    );
    await page
      .getByRole("button", { name: "Stilrevision speichern", exact: true })
      .click();
    await expect(page.locator(".notice")).toContainText("aktualisiert");
    await fs.mkdir("artifacts", { recursive: true });
    for (const [width, height] of [
      [1440, 900],
      [960, 720],
    ]) {
      await app.evaluate(
        ({ BrowserWindow }, { width, height }) =>
          BrowserWindow.getAllWindows()[0].setSize(width, height),
        { width, height },
      );
      await expect
        .poll(() =>
          page.evaluate(
            () => document.documentElement.scrollWidth <= window.innerWidth,
          ),
        )
        .toBe(true);
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.screenshot({
        path: `artifacts/ux01-art-direction-${width}.png`,
        fullPage: true,
      });
    }
    await page
      .getByRole("button", { name: "Zurück zum Studio", exact: true })
      .click();
    await expect(
      field(page, "Figurenerstellung Outfit", { exact: true }),
    ).toHaveValue(originalOutfit);
    await studioExpert(page);
    await expect(
      field(page, "Creator Arbeits-Prompt", { exact: true }),
    ).toHaveValue(/retained draft R3/);
    await studioExpert(page);
    await expect(
      page.getByRole("button", {
        name: "Neue Vorlage übernehmen",
        exact: true,
      }),
    ).toHaveCount(0);
    await studioExpert(page);
    await field(page, "Creator Promptmodus", { exact: true }).selectOption(
      "supplement",
    );
    await studioExpert(page);
    await field(page, "Creator Ergänzende Anweisung", { exact: true }).fill(
      "A calm confident presence.",
    );
    await expect(
      field(page, "Creator Arbeits-Prompt", { exact: true }),
    ).toHaveValue(/calm confident presence/);
    await studioExpert(page);
    await field(page, "Creator Promptmodus", { exact: true }).selectOption(
      "expert",
    );
    const expertText =
      (await field(page, "Creator Arbeits-Prompt", {
        exact: true,
      }).inputValue()) + "\nReviewed expert instruction.";
    await studioExpert(page);
    await field(page, "Creator Arbeits-Prompt", { exact: true }).fill(
      expertText,
    );
    await nav(page, "Library");
    await nav(page, "Characters");
    await nav(page, "Studio");
    await expect(
      field(page, "Creator Arbeits-Prompt", { exact: true }),
    ).toHaveValue(expertText);
    await studioStep(page, "Auswählen");
    await page
      .getByRole("button", { name: "Stilgestaltung bearbeiten", exact: true })
      .click();
    await field(page, "Licht und Schattierung", { exact: true }).fill(
      "Soft directional light, expert conflict R4.",
    );
    await page
      .getByRole("button", { name: "Stilrevision speichern", exact: true })
      .click();
    await expect(page.locator(".notice")).toContainText("aktualisiert");
    await page
      .getByRole("button", { name: "Zurück zum Studio", exact: true })
      .click();
    await studioExpert(page);
    await expect(
      field(page, "Creator Arbeits-Prompt", { exact: true }),
    ).toHaveValue(expertText);
    await require("./smoke-ui.cjs").blockedGeneration(page, page.getByRole("button", {
        name: "Master generieren",
        exact: true,
      }));
    await page
      .getByRole("button", { name: "Neue Vorlage übernehmen", exact: true })
      .click();
    await expect(
      field(page, "Creator Arbeits-Prompt", { exact: true }),
    ).toHaveValue(/expert conflict R4/);
    await studioExpert(page);
    await field(page, "Creator Promptmodus", { exact: true }).selectOption(
      "automatic",
    );
    await expect(
      field(page, "Creator Arbeits-Prompt", { exact: true }),
    ).not.toHaveValue(/calm confident presence/);
    await require("./smoke-ui.cjs").studioMode(page, "expression");
    await studioStep(page, "Erzeugen");
    await expect(page.locator(".generation-requirements")).toContainText(
      "Kein freigegebener Master",
    );
    await require("./smoke-ui.cjs").studioMode(page, "master");
    await studioStep(page, "Auswählen");
    await expect(
      field(page, "Figurenerstellung Outfit", { exact: true }),
    ).toHaveValue(originalOutfit);
    expect(await turns()).toEqual([]);
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
    await page.screenshot({
      path: "artifacts/character-creator-960.png",
      fullPage: true,
    });
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].setSize(1440, 900),
    );
    await expect
      .poll(() =>
        page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      )
      .toBe(true);
    await page.screenshot({
      path: "artifacts/ux01-master-1440.png",
      fullPage: true,
    });
    const generate = page.getByRole("button", {
      name: "Master generieren",
      exact: true,
    });
    await studioStep(page, "Erzeugen");
    await expect(generate).toBeEnabled();
    await studioStep(page, "Erzeugen");
    await generate.click();
    await expect(
      page.getByRole("status", {
        name: "Character Figurenerstellung Status",
        exact: true,
      }),
    ).toContainText("Mastergenerierung läuft");
    await expect(generate).toBeDisabled();
    await expect(
      page.getByRole("button", {
        name: "Mastergenerierung abbrechen",
        exact: true,
      }),
    ).toBeEnabled();
    const lock = await page.evaluate(() =>
      window.laceframe.command({
        type: "addCharacter",
        name: "Blocked during generation",
      }),
    );
    expect(lock.ok).toBe(false);
    await page
      .getByRole("navigation", { name: "Hauptnavigation" })
      .getByRole("button", { name: /Studio$/ })
      .click();
    await expect(
      page.getByRole("button", {
        name: "Mastergenerierung abbrechen",
        exact: true,
      }),
    ).toBeVisible();
    await expect
      .poll(async () => (await manifest()).masterCandidates.length)
      .toBe(1);
    await expect(page.locator("main > fieldset.workspace")).toBeEnabled();
    await page
      .getByRole("navigation", { name: "Hauptnavigation" })
      .getByRole("button", { name: /Studio$/ })
      .click();
    await expect(
      page.getByRole("status", {
        name: "Character Figurenerstellung Status",
        exact: true,
      }),
    ).toContainText("Mastergenerierung abgeschlossen");
    await studioStep(page, "Erzeugen");
    await expect(
      image(page, "Character Figurenerstellung · Ergebnisvorschau", {
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      field(page, "Mastergenerierungszeit", { exact: true }),
    ).toContainText("Generiert in");
    await studioStep(page, "Bearbeiten");
    await checkIdentityComparison({ page, app, project });
    await fs.writeFile(
      path.join(output, "result.png"),
      Buffer.from(approvedResult),
    );
    const rpc = (await turns()).at(-1);
    expect(
      rpc.params.input
        .filter((i) => i.type === "localImage")
        .map((i) => path.basename(i.path)),
    ).toEqual([
      "identity-1.jpg",
      "identity-2.png",
      "identity-3.webp",
      "style-1.png",
    ]);
    expect((await manifest()).masters).toEqual([]);
    expect((await manifest()).assets).toEqual([]);
    await studioStep(page, "Freigeben");
    await page
      .getByRole("button", { name: "Masterkandidat ablehnen", exact: true })
      .click();
    await expect(page.locator(".notice")).toContainText("abgelehnt");
    await studioStep(page, "Erzeugen");
    await expect(generate).toBeEnabled();
    await fs.writeFile(path.join(root, "scenario"), "image-failed");
    await studioStep(page, "Erzeugen");
    await generate.click();
    await expect(
      page.getByRole("status", { name: "Character Figurenerstellung Status" }),
    ).toContainText("fehlgeschlagen");
    await studioStep(page, "Erzeugen");
    await expect(generate).toBeEnabled();
    await fs.writeFile(path.join(root, "scenario"), "hang");
    await studioStep(page, "Erzeugen");
    await generate.click();
    await expect(
      page.getByRole("button", {
        name: "Mastergenerierung abbrechen",
        exact: true,
      }),
    ).toBeVisible();
    for (const workspace of ["Characters", "Art Direction", "Library"]) {
      await nav(page, workspace);
      await expect(
        page.getByRole("button", {
          name: "Mastergenerierung abbrechen",
          exact: true,
        }),
      ).toBeInViewport();
      await expect(
        page.getByRole("status", {
          name: "Character Figurenerstellung Status",
        }),
      ).toContainText("Mastergenerierung läuft");
    }
    await page
      .getByRole("button", { name: "Mastergenerierung abbrechen", exact: true })
      .click();
    await expect
      .poll(
        async () => (await manifest()).masterAttempts.at(-1).execution.status,
      )
      .toBe("cancelled");
    await nav(page, "Studio");
    await expect(
      page.getByRole("status", { name: "Character Figurenerstellung Status" }),
    ).toContainText("abgebrochen");
    await studioStep(page, "Erzeugen");
    await expect(generate).toBeEnabled();
    await fs.writeFile(path.join(root, "scenario"), "delayed");
    await studioStep(page, "Erzeugen");
    await generate.click();
    await expect(
      page.getByRole("status", { name: "Character Figurenerstellung Status" }),
    ).toContainText("Mastergenerierung läuft");
    await expect(
      page.getByRole("status", { name: "Character Figurenerstellung Status" }),
    ).toContainText("Mastergenerierung abgeschlossen");
    await page
      .getByRole("button", { name: "In Bibliothek prüfen", exact: true })
      .click();
    const latestCandidate = (await manifest()).masterCandidates.at(-1);
    await expect(field(page, "Bibliothek Asset", { exact: true })).toHaveValue(
      latestCandidate.id,
    );
    await page
      .getByRole("button", {
        name: "Im Studio prüfen und bearbeiten",
        exact: true,
      })
      .click();
    await studioStep(page, "Auswählen");
    await expect(
      field(page, "Figurenerstellung Outfit", { exact: true }),
    ).toHaveValue(originalOutfit);
    await studioStep(page, "Freigeben");
    await field(page, "Master Identität bestätigt", { exact: true }).check();
    await field(page, "Master Silhouette geprüft", { exact: true }).check();
    await field(page, "Master Rasterqualität geprüft", { exact: true }).check();
    await field(page, "Master Aktivierung bestätigen", { exact: true }).check();
    await field(page, "Master Prüfnotiz", { exact: true }).fill(
      "Synthetic silhouette and identity reviewed",
    );
    // Review state must survive every Studio step; project switching must warn.
    for (const name of ["Bearbeiten", "Auswählen", "Erzeugen", "Freigeben"])
      await studioStep(page, name);
    await expect(field(page, "Master Prüfnotiz", { exact: true })).toHaveValue(
      "Synthetic silhouette and identity reviewed",
    );
    for (const label of [
      "Master Identität bestätigt",
      "Master Silhouette geprüft",
      "Master Aktivierung bestätigen",
    ])
      await expect(field(page, label, { exact: true })).toBeChecked();
    await expect(
      page.getByRole("button", { name: /^Projekt öffnen(?: …)?$/ }),
    ).toBeVisible();
    const beforeReviewSwitch = await fs.readFile(
      path.join(project, "laceframe.json"),
    );
    let reviewWarning;
    page.once("dialog", (d) => {
      reviewWarning = d.message();
      void d.dismiss();
    });
    await page.getByRole("button", { name: /^Projekt öffnen(?: …)?$/ }).click();
    expect(reviewWarning).toContain("Ungespeicherte");
    await expect(field(page, "Master Prüfnotiz", { exact: true })).toHaveValue(
      "Synthetic silhouette and identity reviewed",
    );
    expect(await fs.readFile(path.join(project, "laceframe.json"))).toEqual(
      beforeReviewSwitch,
    );

    await page
      .getByRole("button", {
        name: "Als Master V1 freigeben & sperren",
        exact: true,
      })
      .click();
    await expect(page.locator(".notice")).toContainText(
      "Master V1 freigegeben und gesperrt",
    );
    await studioStep(page, "Erzeugen");
    await require("./smoke-ui.cjs").blockedGeneration(page, generate);
    const approved = await manifest();
    expect(approved.masterCandidates.map((c) => c.status)).toEqual([
      "rejected",
      "approved",
    ]);
    expect(approved.masterAttempts.map((a) => a.execution.status)).toEqual([
      "completed",
      "failed",
      "cancelled",
      "completed",
    ]);
    const master = approved.masters[0];
    expect(master.sha256).toBe(approved.masterCandidates.at(-1).sha256);
    expect(
      createHash("sha256")
        .update(await fs.readFile(path.join(project, master.file)))
        .digest("hex"),
    ).toBe(master.sha256);
    expect(
      createHash("sha256")
        .update(await fs.readFile(selfiePath))
        .digest("hex"),
    ).toBe(sourceHash);
    await page.screenshot({
      path: "artifacts/character-creator-approved.png",
      fullPage: true,
    });
    await page
      .getByRole("button", {
        name: "Expressions mit diesem Master erstellen",
        exact: true,
      })
      .click();
    await expect(
      field(page, "Studio Masterversion", { exact: true }),
    ).toHaveValue(master.id);
    await studioStep(page, "Auswählen");
    await field(page, "Studio Anbieter", { exact: true }).selectOption(
      "codex-native",
    );
    const expression = page.getByRole("button", {
      name: "Expression generieren",
      exact: true,
    });
    await studioStep(page, "Erzeugen");
    await expect(expression).toBeEnabled();
    await expression.click();
    await expect(
      page.getByRole("status", { name: "Codex Status" }),
    ).toContainText("Generierung läuft");
    await expect(
      page.getByRole("status", { name: "Codex Status" }),
    ).toContainText("Generierung abgeschlossen");
    expect((await manifest()).assets[0].masterId).toBe(master.id);
    await studioStep(page, "Freigeben");
    await page
      .getByRole("button", { name: "Als Expression freigeben", exact: true })
      .click();
    await expect(page.locator(".notice")).toContainText(
      "Als Expression freigegeben",
    );
    await page
      .getByRole("button", { name: "In Bibliothek prüfen", exact: true })
      .click();
    const expressionAsset = (await manifest()).assets[0];
    await expect(field(page, "Bibliothek Asset", { exact: true })).toHaveValue(
      expressionAsset.id,
    );
    const exportDir = path.join(root, "exports");
    await fs.mkdir(exportDir);
    await chooser(exportDir);
    const quality = page.locator('[data-testid="asset-quality"]:visible');
    await expect(
      quality.getByRole("heading", { name: "Bild bearbeiten", exact: true }),
    ).toBeVisible();
    await quality
      .getByRole("button", {
        name: "Ausdrücklich Rohbild exportieren",
        exact: true,
      })
      .click();
    await expect(quality).toContainText("Exportiert:");
    const files = await fs.readdir(exportDir);
    expect(files.some((f) => f.endsWith(".png"))).toBe(true);
    expect(files.some((f) => f.endsWith(".json"))).toBe(true);
    expect(
      createHash("sha256")
        .update(
          await fs.readFile(
            path.join(
              exportDir,
              files.find((f) => f.endsWith(".png")),
            ),
          ),
        )
        .digest("hex"),
    ).toBe(expressionAsset.sha256);
    await page
      .getByRole("button", {
        name: "Mit demselben Master weitere Expression erstellen",
        exact: true,
      })
      .click();
    await expect(
      field(page, "Studio Masterversion", { exact: true }),
    ).toHaveValue(master.id);
    // Returning to creator never replaces the locked master. Referenced photo removal retains history.
    await page
      .getByRole("navigation", { name: "Hauptnavigation" })
      .getByRole("button", { name: /Characters$/ })
      .click();
    await page
      .getByRole("button", { name: "Neuen Charakter erstellen", exact: true })
      .click();
    page.once("dialog", (d) => d.accept());
    await studioStep(page, "Auswählen");
    await page
      .getByRole("button", { name: "Referenz entfernen", exact: true })
      .first()
      .click();
    await expect(page.locator(".notice")).toContainText("Referenz entfernt");
    expect((await manifest()).identityAssets[0].removedAt).toBeDefined();
    const saved = await manifest();
    await app.close();
    await launch();
    await chooser(project);
    await page.getByRole("button", { name: /^Projekt öffnen(?: …)?$/ }).click();
    await expect(
      image(page, "Freigegebener Master V1", { exact: true }),
    ).toBeVisible();
    expect(await manifest()).toEqual(saved);
    await page
      .getByRole("button", { name: "Neuen Charakter erstellen", exact: true })
      .click();
    await studioStep(page, "Erzeugen");
    await expect(
      image(page, "Character Figurenerstellung · Ergebnisvorschau", {
        exact: true,
      }),
    ).toBeVisible();
    await require("./smoke-ui.cjs").blockedGeneration(page, page.getByRole("button", {
        name: "Master generieren",
        exact: true,
      }));
    // Master Rebuild: only deterministic local protocol jobs, never a real Codex image request.
    await nav(page, "Characters");
    const rebuildBefore = await manifest(),
      v1 = rebuildBefore.masters.at(-1),
      oldExpressions = rebuildBefore.assets,
      oldMasks = rebuildBefore.masks,
      identityBefore = rebuildBefore.identityAssets;
    const turnCount = async () =>
      (await fs.readFile(path.join(root, "trace.jsonl"), "utf8"))
        .split("\n")
        .filter((l) => l.includes('"method":"turn/start"')).length;
    const turnsBefore = await turnCount();
    await page
      .getByRole("button", { name: "Master neu aufbauen", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Master neu aufbauen", exact: true }),
    ).toBeVisible();
    await expect(
      page
        .locator(".studio-editor:visible")
        .getByRole("button", { name: "1. Auswählen", exact: true }),
    ).toHaveAttribute("aria-current", "step");
    await expect(
      field(page, "Figurenerstellung Outfit", { exact: true }),
    ).toHaveValue(originalOutfit);
    expect(await turnCount()).toBe(turnsBefore);
    expect((await manifest()).characters[0].masterId).toBe(v1.id);
    const gen = () =>
      page.getByRole("button", {
        name: "Master generieren",
        exact: true,
      });
    const job = () =>
      page.getByRole("status", {
        name: "Character Figurenerstellung Status",
        exact: true,
      });
    const approveButton = () =>
      page.getByRole("button", {
        name: "Als Master V2 freigeben & aktivieren",
        exact: true,
      });
    const assertOld = async () => {
      const p = await manifest();
      expect(p.characters[0].masterId).toBe(v1.id);
      expect(p.assets).toEqual(oldExpressions);
      expect(p.masks).toEqual(oldMasks);
      expect(p.identityAssets).toEqual(identityBefore);
    };
    await studioExpert(page);
    await field(page, "Creator Promptmodus", { exact: true }).selectOption(
      "supplement",
    );
    await studioExpert(page);
    await field(page, "Creator Ergänzende Anweisung", { exact: true }).fill(
      "Use a solid black background",
    );
    await require("./smoke-ui.cjs").blockedGeneration(page, gen());
    await expect(page.locator(".create-action-bar")).toContainText(
      "widerspricht",
    );
    await studioExpert(page);
    await field(page, "Creator Ergänzende Anweisung", { exact: true }).fill(
      "Restrained illustrated contours",
    );
    await studioExpert(page);
    await field(page, "Creator Promptmodus", { exact: true }).selectOption(
      "automatic",
    );
    await fs.writeFile(path.join(output, "result.png"), Buffer.from(result)); // real opaque PNG fixture
    await fs.writeFile(path.join(root, "scenario"), "delayed");
    await studioStep(page, "Erzeugen");
    await gen().click();
    await expect(job()).toContainText("läuft");
    await assertOld();
    await expect(gen()).toBeDisabled();
    const parallel = await page.evaluate(async () => {
      const r = await window.laceframe.generationStatus();
      if (!r.ok) throw new Error(r.error);
      const a = r.value.snapshot.project.masterAttempts.at(-1);
      return window.laceframe.startGeneration({
        ...a,
        operation: "create-character-master",
      });
    });
    expect(parallel.ok).toBe(false);
    await expect(job()).toContainText("abgeschlossen");
    await assertOld();
    await studioStep(page, "Freigeben");
    const opaque = (await manifest()).masterCandidates.at(-1);
    await expect(
      page.getByRole("status", {
        name: "Master Transparenzprüfung",
        exact: true,
      }),
    ).toContainText("keinen echten transparenten Hintergrund");
    await expect(approveButton()).toBeDisabled();
    const denied = await page.evaluate(
      (c) =>
        window.laceframe.command({
          type: "reviewMasterCandidate",
          id: c.id,
          status: "approved",
          review: {
            sourceSha256: c.sha256,
            identityConfirmed: true,
            silhouetteConfirmed: true,
            activationConfirmed: true,
            rasterConfirmed: true,
            notes: "Direct IPC must still fail transparency",
          },
        }),
      opaque,
    );
    expect(denied.ok).toBe(false);
    expect(denied.error).toContain("transparenten Hintergrund");
    await fs.mkdir("artifacts", { recursive: true });
    await page.locator(".master-approval:visible").scrollIntoViewIfNeeded();
    await page.screenshot({
      path: "artifacts/master-rebuild-opaque.png",
      fullPage: true,
    });
    await page
      .locator(".master-approval:visible")
      .getByRole("button", { name: "Hintergrund freistellen", exact: true })
      .click();
    const editor = page.getByRole("dialog", {
      name: "Freistellungsmaske",
      exact: true,
    });
    await expect(editor).toBeVisible();
    await expect(
      editor.getByRole("status", {
        name: "Freistellung Berechnung",
        exact: true,
      }),
    ).toContainText("Vorschau bereit");
    await editor
      .getByRole("button", { name: "Editor schließen", exact: true })
      .click();
    await studioStep(page, "Freigeben");
    await page
      .getByRole("button", { name: "Masterkandidat ablehnen", exact: true })
      .click();
    await assertOld();
    await fs.writeFile(path.join(root, "scenario"), "image-failed");
    await studioStep(page, "Erzeugen");
    await gen().click();
    await expect(job()).toContainText("fehlgeschlagen");
    await assertOld();
    await expect(gen()).toBeEnabled();
    await fs.writeFile(path.join(root, "scenario"), "hang");
    await studioStep(page, "Erzeugen");
    await gen().click();
    await expect(job()).toContainText("läuft");
    await page
      .getByRole("button", { name: "Mastergenerierung abbrechen", exact: true })
      .click();
    await expect(job()).toContainText("abgebrochen");
    await assertOld();
    await expect(gen()).toBeEnabled();
    await fs.writeFile(
      path.join(output, "result.png"),
      Buffer.from(approvedResult),
    );
    await fs.writeFile(path.join(root, "scenario"), "delayed");
    await studioStep(page, "Erzeugen");
    await gen().click();
    await expect(job()).toContainText("läuft");
    await expect(job()).toContainText("abgeschlossen");
    await assertOld();
    const pending = (await manifest()).masterCandidates.at(-1),
      attempt = (await manifest()).masterAttempts.at(-1);
    expect(attempt.mode).toBe("rebuild");
    expect(attempt.baseMasterId).toBe(v1.id);
    expect(attempt.promptRevision.prompt).toContain("NOT an edit/cutout");
    expect(attempt.promptRevision.prompt).toContain(
      "genuinely transparent background",
    );
    // Reopen a pending rebuild in the existing Creator; active V1 must persist until human approval.
    await app.close();
    await launch();
    await chooser(project);
    await page.getByRole("button", { name: /^Projekt öffnen(?: …)?$/ }).click();
    await expect(
      image(page, "Freigegebener Master V1", { exact: true }),
    ).toBeVisible();
    await assertOld();
    await nav(page, "Library");
    await field(page, "Bibliothek Asset", { exact: true }).selectOption(
      pending.id,
    );
    await expect(
      page.getByRole("status", {
        name: "Master Transparenzprüfung",
        exact: true,
      }),
    ).toContainText("Transparenz vorhanden");
    await page
      .getByRole("button", {
        name: "Im Studio prüfen und bearbeiten",
        exact: true,
      })
      .click();
    await expect(approveButton()).toBeDisabled();
    await studioStep(page, "Freigeben");
    await field(page, "Master Identität bestätigt", { exact: true }).check();
    await field(page, "Master Silhouette geprüft", { exact: true }).check();
    await field(page, "Master Rasterqualität geprüft", { exact: true }).check();
    await field(page, "Master Aktivierung bestätigen", { exact: true }).check();
    await field(page, "Master Prüfnotiz", { exact: true }).fill(
      "Synthetic rebuild identity, silhouette, outfit and alpha approved",
    );
    await expect(approveButton()).toBeEnabled();
    for (const [width, height] of [
      [960, 720],
      [1280, 800],
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
      await studioStep(page, "Freigeben");
      await page.locator(".master-approval:visible").scrollIntoViewIfNeeded();
      const rejectBounds = await page
        .getByRole("button", { name: "Masterkandidat ablehnen", exact: true })
        .boundingBox();
      expect(rejectBounds.height).toBeLessThan(64);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth + 1,
        ),
      ).toBe(true);
      for (const background of ["light", "dark", "checker"])
        await field(page, "Vergleich Prüfhintergrund", {
          exact: true,
        }).selectOption(background);
      await page.screenshot({
        path: `artifacts/master-rebuild-${width}.png`,
        fullPage: true,
      });
    }
    await approveButton().click();
    await expect(page.locator(".notice")).toContainText(
      "Neuer Master aktiviert",
    );
    const activated = await manifest(),
      v2 = activated.masters.at(-1);
    expect(v2.version).toBe(2);
    expect(v2.previousMasterId).toBe(v1.id);
    expect(v2.sourceCandidateId).toBe(pending.id);
    expect(v2.qualitySourceId).toBeUndefined();
    expect(v2.masterReview.sourceSha256).toBe(v2.sha256);
    expect(activated.characters).toHaveLength(rebuildBefore.characters.length);
    expect(activated.assets).toEqual(oldExpressions);
    expect(activated.masks).toEqual(oldMasks);
    expect(activated.identityAssets).toEqual(identityBefore);
    await page
      .getByRole("button", {
        name: "Expressions mit diesem Master erstellen",
        exact: true,
      })
      .click();
    await expect(
      field(page, "Studio Masterversion", { exact: true }),
    ).toHaveValue(v2.id);
    await nav(page, "Characters");
    await expect(
      image(page, "Freigegebener Master V2", { exact: true }),
    ).toBeVisible();
    await page
      .getByLabel("Historische Masterversion", { exact: true })
      .selectOption(v1.id);
    await expect(page.locator(".master-history")).toContainText(
      "Master V1 · historisch archiviert",
    );
    await page
      .getByLabel("Historische Masterversion", { exact: true })
      .selectOption(v2.id);
    await expect(page.locator(".master-history")).toContainText(
      "Master V2 · aktuell aktiv",
    );
    await expect(page.locator(".master-history")).toContainText(
      "Vollständige Rebuild-Generation",
    );
    await page.screenshot({
      path: "artifacts/master-rebuild-history.png",
      fullPage: true,
    });
    expect(
      (
        await page.evaluate(
          (id) => window.laceframe.relightEligibility(id),
          v2.id,
        )
      ).value.allowed,
    ).toBe(false);
    console.log(
      "PASS Master Rebuild: same character, retained references/outfit, zero turns on preparation, opaque RGBA gate and direct IPC denial, cutout rescue editor, rejection/failure/cancel/retry, restart pending review, explicit V2 activation with genuine generation provenance, unchanged V1 expressions/masks, active Studio version, history and 960/1280/1440/1920 backgrounds. Protocol fixture only.",
    );
    await chooser(null);
    const selectedCharacter = (await manifest()).selectedCharacterId;
    const cancelled = await page.evaluate(
      (characterId) => window.laceframe.importIdentityImages({ characterId }),
      selectedCharacter,
    );
    expect(cancelled).toEqual({ ok: true, value: null });
    const remembered = await app.evaluate(
      ({ dialog }) => dialog.showOpenDialog.lastOptions.defaultPath,
    );
    expect(remembered).toBe(root);
    expect(
      (
        await fs.readFile(path.join(project, "laceframe.json"), "utf8")
      ).includes(root),
    ).toBe(false);
    console.log(
      "PASS identity import: native three-file selection, one plus two, multi-drop, capacity/cancel/duplicate/corrupt atomic rejection, previews/counts, remembered defaultPath after real app restart. No live generation.",
    );
    expect(errors).toEqual([]);
    console.log(
      "PASS Character Creator: JPEG chooser + PNG/WebP drops, three identity/one style input order, no-master generation, neutral/outfit prompt, single-job lock, timer/failure/cancel/retry, rejected/approved candidates, immutable Master V1, native Expression handoff, archived private sources, close/relaunch/reopen, 960px layout and secure typed IPC. UX-01: missing prerequisites/focus, retained master draft across mode/workspace/style revisions, automatic/supplement/expert conflict, sticky cancel across Characters/Art Direction/Library, exact candidate handoff, Library raw PNG+JSON export and same-master return, 960x720/1440x900 layout. Explicit protocol fixture only; no live AI calls.",
    );
  } catch (e) {
    if (page && !page.isClosed()) {
      console.error(await page.locator("body").innerText());
      await fs.mkdir("artifacts", { recursive: true });
      await page.screenshot({
        path: "artifacts/creator-smoke-failure.png",
        fullPage: true,
      });
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
