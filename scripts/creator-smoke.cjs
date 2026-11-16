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
      page.getByRole("heading", { name: "Characters", exact: true }),
    ).toBeVisible();
  };
  const chooser = (file) =>
    app.evaluate(({ dialog }, file) => {
      dialog.showOpenDialog = async () => ({
        canceled: false,
        filePaths: [file],
      });
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
    await page
      .getByLabel("Projektname", { exact: true })
      .fill("Cameo synthetic");
    await page
      .getByRole("button", { name: "Projekt erstellen …", exact: true })
      .click();
    const makeImage = async (shade, jpg = false) =>
      app.evaluate(
        ({ nativeImage }, { shade, jpg }) => {
          const b = Buffer.alloc(72 * 96 * 4, shade);
          for (let i = 3; i < b.length; i += 4) b[i] = 255;
          const image = nativeImage.createFromBitmap(b, {
            width: 72,
            height: 96,
          });
          return [...(jpg ? image.toJPEG(95) : image.toPNG())];
        },
        { shade, jpg },
      );
    const rawPhoto = await makeImage(80, true),
      other = await makeImage(140),
      style = await makeImage(190),
      result = await makeImage(110);
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
    await fs.writeFile(path.join(output, "result.png"), Buffer.from(result));
    // Populate a real project style through the existing editor; no identity character yet.
    await page.getByRole("button", { name: /Create$/ }).click();
    await page
      .getByText("Art Direction · gemeinsamer Spielstil", { exact: true })
      .click();
    await page
      .getByLabel("Stilname", { exact: true })
      .fill("Ada Voss · Illustrated Noir");
    await page
      .getByLabel("Rendering-Regeln (ohne Charakter- oder Outfitmerkmale)", {
        exact: true,
      })
      .fill("Illustrated noir, graphic contours, restrained pixel clusters.");
    await page
      .getByRole("button", { name: "Stil anlegen und auswählen", exact: true })
      .click();
    await chooser(stylePath);
    await page
      .getByRole("button", { name: "Stilbild importieren …", exact: true })
      .click();
    await expect(
      page.getByAltText("Stil 1 · synthetic-style.png", { exact: true }),
    ).toBeVisible();
    await page
      .getByRole("navigation", { name: "Hauptnavigation" })
      .getByRole("button", { name: /Characters$/ })
      .click();
    await page
      .getByRole("button", { name: "Neuen Charakter erstellen", exact: true })
      .click();
    await page
      .getByLabel("Name der Entwurfsfigur", { exact: true })
      .fill("Synthetic Cameo");
    await page
      .getByRole("button", { name: "Figurenentwurf anlegen", exact: true })
      .click();
    await expect(
      page
        .locator(".character-creator")
        .getByText("Synthetic Cameo", { exact: true }),
    ).toBeVisible();
    await chooser(selfiePath);
    await page
      .getByRole("button", {
        name: "Identitätsbild importieren …",
        exact: true,
      })
      .click();
    await expect(
      page.getByAltText("Identität 1", { exact: true }),
    ).toBeVisible();
    expect((await manifest()).identityAssets[0].format).toBe("jpg");
    expect((await manifest()).identityAssets[0]).toMatchObject({
      width: 96,
      height: 72,
    });
    expect(
      await page
        .getByAltText("Identität 1", { exact: true })
        .evaluate((img) => ({
          width: img.naturalWidth,
          height: img.naturalHeight,
        })),
    ).toEqual({ width: 96, height: 72 });
    expect((await manifest()).identityAssets[0].sha256).toBe(sourceHash);
    await drop(".creator-identity", other, "identity.png", "image/png");
    await expect(
      page.getByAltText("Identität 2", { exact: true }),
    ).toBeVisible();
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
    await drop(".creator-identity", webp, "identity.webp", "image/webp");
    await expect(
      page.getByAltText("Identität 3", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", {
        name: "Identitätsbild importieren …",
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
    await page
      .getByLabel("Creator Outfit", { exact: true })
      .fill("Blue jacket and plain white shirt, no pendant or plaid.");
    await page
      .getByLabel("Creator Identitätsmerkmale", { exact: true })
      .fill("Use only the individual in the identity photos.");
    await page
      .getByText("5 · Prompt und Generierungsdetails", { exact: true })
      .click();
    await expect(
      page.getByLabel("Creator Arbeits-Prompt", { exact: true }),
    ).toHaveValue(/IDENTITY REFERENCE/);
    await expect(
      page.getByLabel("Creator Arbeits-Prompt", { exact: true }),
    ).toHaveValue(/Images 4–4 are STYLE ONLY/);
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
      BrowserWindow.getAllWindows()[0].setSize(1440, 1000),
    );
    const generate = page.getByRole("button", {
      name: "Neutralen Masterkandidaten generieren",
      exact: true,
    });
    await expect(generate).toBeEnabled();
    await generate.click();
    await expect(
      page.getByRole("status", {
        name: "Character Creator Status",
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
      .getByRole("button", { name: /Create$/ })
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
      .getByRole("button", { name: /Characters$/ })
      .click();
    await expect(
      page.getByRole("status", {
        name: "Character Creator Status",
        exact: true,
      }),
    ).toContainText("Mastergenerierung abgeschlossen");
    await expect(
      page.getByAltText("Character Creator · Ergebnisvorschau", {
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      page.getByLabel("Mastergenerierungszeit", { exact: true }),
    ).toContainText("Generiert in");
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
    await page
      .getByRole("button", { name: "Masterkandidat ablehnen", exact: true })
      .click();
    await expect(page.locator(".notice")).toContainText("abgelehnt");
    await expect(generate).toBeEnabled();
    await fs.writeFile(path.join(root, "scenario"), "image-failed");
    await generate.click();
    await expect(
      page.getByRole("status", { name: "Character Creator Status" }),
    ).toContainText("fehlgeschlagen");
    await expect(generate).toBeEnabled();
    await fs.writeFile(path.join(root, "scenario"), "hang");
    await generate.click();
    await expect(
      page.getByRole("button", {
        name: "Mastergenerierung abbrechen",
        exact: true,
      }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Mastergenerierung abbrechen", exact: true })
      .click();
    await expect(
      page.getByRole("status", { name: "Character Creator Status" }),
    ).toContainText("abgebrochen");
    await expect(generate).toBeEnabled();
    await fs.writeFile(path.join(root, "scenario"), "delayed");
    await generate.click();
    await expect(
      page.getByRole("status", { name: "Character Creator Status" }),
    ).toContainText("Mastergenerierung läuft");
    await expect(
      page.getByRole("status", { name: "Character Creator Status" }),
    ).toContainText("Mastergenerierung abgeschlossen");
    page.once("dialog", (d) => d.accept());
    await page
      .getByRole("button", {
        name: "Als Master V1 freigeben & sperren",
        exact: true,
      })
      .click();
    await expect(page.locator(".notice")).toContainText(
      "Master V1 freigegeben und gesperrt",
    );
    await expect(generate).toBeDisabled();
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
      page.getByLabel("Create Masterversion", { exact: true }),
    ).toHaveValue(master.id);
    await page
      .getByLabel("Create Anbieter", { exact: true })
      .selectOption("codex-native");
    const expression = page.getByRole("button", {
      name: "Mit Masterreferenz generieren",
      exact: true,
    });
    await expect(expression).toBeEnabled();
    await expression.click();
    await expect(
      page.getByRole("status", { name: "Codex Status" }),
    ).toContainText("Generierung läuft");
    await expect(
      page.getByRole("status", { name: "Codex Status" }),
    ).toContainText("Generierung abgeschlossen");
    expect((await manifest()).assets[0].masterId).toBe(master.id);
    await page
      .getByRole("button", { name: "Als Expression freigeben", exact: true })
      .click();
    await expect(page.locator(".notice")).toContainText(
      "Als Expression freigegeben",
    );
    // Returning to creator never replaces the locked master. Referenced photo removal retains history.
    await page
      .getByRole("navigation", { name: "Hauptnavigation" })
      .getByRole("button", { name: /Characters$/ })
      .click();
    await page
      .getByRole("button", { name: "Neuen Charakter erstellen", exact: true })
      .click();
    page.once("dialog", (d) => d.accept());
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
    await page
      .getByRole("button", { name: "Projekt öffnen …", exact: true })
      .click();
    await expect(
      page.getByAltText("Freigegebener Master V1", { exact: true }),
    ).toBeVisible();
    expect(await manifest()).toEqual(saved);
    await page
      .getByRole("button", { name: "Neuen Charakter erstellen", exact: true })
      .click();
    await expect(
      page.getByAltText("Character Creator · Ergebnisvorschau", {
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", {
        name: "Neutralen Masterkandidaten generieren",
        exact: true,
      }),
    ).toBeDisabled();
    expect(errors).toEqual([]);
    console.log(
      "PASS Character Creator: JPEG chooser + PNG/WebP drops, three identity/one style input order, no-master generation, neutral/outfit prompt, single-job lock, timer/failure/cancel/retry, rejected/approved candidates, immutable Master V1, native Expression handoff, archived private sources, close/relaunch/reopen, 960px layout and secure typed IPC. Explicit protocol fixture only; no live AI calls.",
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
