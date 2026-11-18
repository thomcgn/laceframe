// Focused P0 regression. Actual packaged UI/preload/controller/import; labelled protocol double only.
const { _electron: electron, expect } = require("@playwright/test");
const fs = require("node:fs/promises"),
  path = require("node:path"),
  os = require("node:os");
const { PNG } = require("pngjs");
const { createHash } = require("node:crypto");
const { nav, studioStep, prepareProjectCreation } = require("./smoke-ui.cjs");
(async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "laceframe-master-p0-")),
    project = path.join(root, "project"),
    bin = path.join(root, "bin"),
    thread = "00000000-0000-4000-8000-000000000123";
  await fs.mkdir(project);
  await fs.mkdir(bin);
  await fs.mkdir(path.join(root, "generated_images", thread), {
    recursive: true,
  });
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
  await fs.writeFile(path.join(root, "scenario"), "delayed");
  const image = (shade) => {
    const png = new PNG({ width: 72, height: 96 });
    for (let y = 1; y < 95; y++)
      for (let x = 1; x < 71; x++)
        png.data.set([shade, 100 + y, 80, 255], (y * 72 + x) * 4);
    return PNG.sync.write(png);
  };
  const identity = image(100),
    styleBytes = image(150),
    result = image(180),
    identityFile = path.join(root, "identity.png");
  await fs.writeFile(identityFile, identity);
  await fs.writeFile(
    path.join(root, "generated_images", thread, "result.png"),
    result,
  );
  let app, page;
  let acceptDialogs = true;
  const errors = [];
  const chooser = (files) =>
    app.evaluate(({ dialog }, files) => {
      dialog.showOpenDialog = async () => ({
        canceled: false,
        filePaths: files,
      });
    }, files);
  const manifest = async () =>
    JSON.parse(await fs.readFile(path.join(project, "laceframe.json"), "utf8"));
  const trace = async () => {
    try {
      return (await fs.readFile(path.join(root, "trace.jsonl"), "utf8"))
        .trim()
        .split("\n")
        .map((line) => JSON.parse(line));
    } catch {
      return [];
    }
  };
  const turns = async () =>
    (await trace()).filter((m) => m.method === "turn/start");
  const mode = async (master) => {
    if (
      await page
        .locator(".studio-context")
        .getByRole("button", {
          name: master ? "Master generieren" : "Expression generieren",
          exact: true,
        })
        .count()
    )
      return;
    await page
      .locator(".studio-context")
      .getByRole("button", {
        name: master ? "Zum Master wechseln" : "Zu Expressions wechseln",
        exact: true,
      })
      .click();
  };
  const launch = async () => {
    const env = {
      ...process.env,
      PATH: bin + path.delimiter + process.env.PATH,
      CODEX_HOME: root,
      LACEFRAME_TEST_ROOT: root,
      LACEFRAME_TEST_SCENARIO: "delayed",
    };
    delete env.ELECTRON_RUN_AS_NODE;
    app = await electron.launch({
      executablePath: path.resolve("out/Laceframe-linux-x64/laceframe"),
      args: ["--user-data-dir=" + path.join(root, "user")],
      env,
    });
    page = await app.firstWindow();
    page.setDefaultTimeout(15000);
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("dialog", (d) => (acceptDialogs ? d.accept() : d.dismiss()));
    await page
      .getByRole("combobox", { name: /^(Language|Sprache)$/ })
      .selectOption("de");
    await expect(
      page.getByRole("button", { name: "Neues Projekt", exact: true }),
    ).toBeVisible({ timeout: 25000 });
  };
  const primary = () =>
    page
      .locator(".studio-context")
      .getByRole("button", { name: "Master generieren", exact: true });
  try {
    await launch();
    await chooser([project]);
    await prepareProjectCreation(page);
    await page.getByLabel("Projektname", { exact: true }).fill("P0 synthetic");
    await page
      .getByRole("button", { name: "Projekt erstellen …", exact: true })
      .click();
    // Persist a real existing character and current style with ordered image references through typed IPC.
    console.log("P0: project ready");
    const setup = await page.evaluate(
      async (bytes) => {
        const command = async (input) => {
          const r = await window.laceframe.command(input);
          if (!r.ok) throw new Error(r.error);
          return r.value;
        };
        await command({
          type: "addCharacter",
          name: "Existing synthetic character",
        });
        let s = await command({
          type: "addArtDirection",
          name: "Independent test style",
          renderRules: "Grouped original contours; no borrowed identity.",
          description: "P0 style description",
        });
        const profile = s.project.artDirections[0];
        const staged = await window.laceframe.stageImage(
          new Uint8Array(bytes),
          "style.png",
        );
        if (!staged.ok) throw new Error(staged.error);
        s = await command({
          type: "importStyleReference",
          profileId: profile.id,
          token: staged.value.token,
        });
        return {
          characterId: s.project.selectedCharacterId,
          styleId: profile.id,
          styleRevision: s.project.artDirections[0].revision,
        };
      },
      [...styleBytes],
    );
    await chooser([project]);
    await page.getByRole("button", { name: /^Projekt öffnen(?: …)?$/ }).click();
    await nav(page, "Studio");
    await mode(true);
    console.log("P0: creator ready");
    const creator = () =>
      page.locator('.studio-editor[data-operation="master"]:visible');
    await expect(creator().locator(".creator-new-character")).toHaveCount(0);
    // Reproduce original symptom: primary used while still in Select, never enter Generate first.
    await primary().click();
    await expect(page.locator(".generation-requirements")).toContainText(
      "Identitätsbild fehlt",
    );
    expect(await turns()).toHaveLength(0);
    await chooser([identityFile]);
    await creator()
      .getByRole("button", {
        name: "Identitätsbilder hinzufügen …",
        exact: true,
      })
      .click();
    await expect(
      creator().getByAltText("Identität 1", { exact: true }),
    ).toBeVisible();
    const outfit = creator().getByLabel("Figurenerstellung Outfit", {
      exact: true,
    });
    await outfit.fill("Independent blue coat, no borrowed outfit.");
    await creator()
      .getByRole("checkbox", { name: "Expertenansicht", exact: true })
      .check();
    const width = creator().getByLabel("Figurenerstellung Zielbreite", {
        exact: true,
      }),
      height = creator().getByLabel("Figurenerstellung Zielhöhe", {
        exact: true,
      });
    await width.fill("72");
    await height.fill("96");
    await creator()
      .getByLabel("Figurenerstellung Neutrale Pose", { exact: true })
      .fill("Neutral upright portrait, hands outside frame.");
    await creator()
      .getByLabel("Figurenerstellung Identitätsmerkmale", { exact: true })
      .fill("Independent synthetic identity markers.");
    await studioStep(page, "Erzeugen");
    await creator()
      .getByLabel("Creator Promptmodus", { exact: true })
      .selectOption("supplement");
    await creator()
      .getByLabel("Creator Ergänzende Anweisung", { exact: true })
      .fill("Preserve deliberate graphic clusters.");
    await mode(false);await mode(true);
    await expect(creator().getByLabel("Creator Ergänzende Anweisung",{exact:true})).toHaveValue("Preserve deliberate graphic clusters.");
    await creator()
      .getByLabel("Creator Promptmodus", { exact: true })
      .selectOption("expert");
    const promptField = creator().getByLabel("Creator Arbeits-Prompt", {
      exact: true,
    });
    const expertPrompt =
      (await promptField.inputValue()) +
      "\nExplicit reviewed P0 expert direction.";
    await promptField.fill(expertPrompt);
    await studioStep(page, "Auswählen");
    await mode(false);
    await page
      .locator(".studio-context")
      .getByRole("button", { name: "Expression generieren", exact: true })
      .click();
    await expect(page.locator(".generation-requirements")).toContainText(
      "Kein freigegebener Master",
    );
    await mode(true);
    await expect(outfit).toHaveValue(
      "Independent blue coat, no borrowed outfit.",
    );
    await expect(width).toHaveValue("72");
    expect(await turns()).toHaveLength(0);
    await studioStep(page, "Erzeugen");
    await expect(
      creator().getByLabel("Creator Promptmodus", { exact: true }),
    ).toHaveValue("expert");
    await expect(
      creator().getByLabel("Creator Arbeits-Prompt", { exact: true }),
    ).toHaveValue(expertPrompt);
    expect(expertPrompt).toContain("Preserve deliberate graphic clusters.");
    await studioStep(page, "Auswählen");
    await fs.mkdir("artifacts/master-p0", { recursive: true });
    for (const [w, h] of [
      [960, 720],
      [1280, 800],
      [1920, 1080],
    ]) {
      await page.setViewportSize({ width: w, height: h });
      await primary().scrollIntoViewIfNeeded();
      const box = await primary().boundingBox();
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(w);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      ).toBe(true);
      await page.screenshot({ path: `artifacts/master-p0/${w}.png` });
    }
    await expect(primary()).toBeEnabled();
    await primary().click();
    await expect(
      page.getByRole("status", {
        name: "Character Figurenerstellung Status",
        exact: true,
      }),
    ).toContainText("Mastergenerierung läuft");
    await expect(primary()).toBeDisabled();
    await expect(
      page.getByRole("button", {
        name: "Mastergenerierung abbrechen",
        exact: true,
      }),
    ).toBeEnabled();
    await expect(
      page.getByLabel("Mastergenerierungszeit", { exact: true }),
    ).toContainText(/\d{2}:\d{2}:\d{2}/);
    await expect(
      creator().getByAltText("Character Figurenerstellung · Ergebnisvorschau", {
        exact: true,
      }),
    ).toBeVisible({ timeout: 20000 });
    const saved = await manifest(),
      attempt = saved.masterAttempts.at(-1),
      candidate = saved.masterCandidates.at(-1);
    expect(attempt).toMatchObject({
      characterId: setup.characterId,
      artDirectionId: setup.styleId,
      artDirectionRevision: setup.styleRevision,
      outfit: "Independent blue coat, no borrowed outfit.",
      composition: { targetWidth: 72, targetHeight: 96 },
      execution: { status: "completed" },
    });
    expect(attempt.promptRevision.prompt).toContain(
      "Grouped original contours",
    );
    expect(attempt.identityReferences.map((r) => r.sha256)).toEqual([
      createHash("sha256").update(identity).digest("hex"),
    ]);
    expect(attempt.styleReferences.map((r) => r.sha256)).toEqual([
      createHash("sha256").update(styleBytes).digest("hex"),
    ]);
    const turn = (await turns())[0];
    expect(
      turn.params.input.filter((i) => i.type === "localImage"),
    ).toHaveLength(2);
    expect(turn.params.input.filter(i=>i.type==="localImage").map(i=>path.basename(i.path))).toEqual(["identity-1.png","style-1.png"]);
    expect(saved.masters).toHaveLength(0);
    expect(candidate.status).toBe("candidate");
    await studioStep(page, "Bearbeiten");
    await expect(
      creator().getByRole("button", { name: "Pixel Snap öffnen", exact: true }),
    ).toBeVisible();
    const beforeEditor=await fs.readFile(path.join(project,"laceframe.json"));
    await creator().getByRole("button",{name:"Pixel Snap öffnen",exact:true}).click();
    const pixelEditor=page.getByRole("dialog",{name:"Pixel Snap",exact:true});
    await expect(pixelEditor.getByLabel("Farbanzahl",{exact:true})).toBeVisible();
    await pixelEditor.getByRole("button",{name:"Verwerfen",exact:true}).click();
    await expect(pixelEditor).toHaveCount(0);
    expect(await fs.readFile(path.join(project,"laceframe.json"))).toEqual(beforeEditor);
    await studioStep(page, "Freigeben");
    for (const label of [
      "Master Identität bestätigt",
      "Master Silhouette geprüft",
      "Master Rasterqualität geprüft",
      "Master Aktivierung bestätigen",
    ])
      await creator().getByLabel(label, { exact: true }).check();
    await creator()
      .getByLabel("Master Prüfnotiz", { exact: true })
      .fill(
        "Synthetic portrait and alpha manually reviewed for protocol fixture.",
      );
    const approve = creator().getByRole("button", {
      name: "Als Master V1 freigeben & sperren",
      exact: true,
    });
    await expect(approve).toBeEnabled();
    await approve.click();
    await expect.poll(async () => (await manifest()).masters.length).toBe(1);
    const approved = await manifest(),
      master = approved.masters[0],
      original = await fs.readFile(path.join(project, master.file));
    await primary().click();
    expect(await turns()).toHaveLength(1);
    expect((await manifest()).masters).toEqual(approved.masters);
    await expect(
      creator().getByRole("button", {
        name: "Neue Masterversion vorbereiten …",
        exact: true,
      }),
    ).toBeVisible();
    acceptDialogs = false;
    await creator()
      .getByRole("button", {
        name: "Neue Masterversion vorbereiten …",
        exact: true,
      })
      .click();
    expect(await turns()).toHaveLength(1);
    await mode(false);
    await studioStep(page, "Auswählen");
    await expect(
      page
        .locator('.studio-editor[data-operation="expression"]:visible')
        .getByLabel("Studio Masterversion", { exact: true }),
    ).toHaveValue(master.id);
    await mode(true);
    acceptDialogs = true;
    await creator()
      .getByRole("button", {
        name: "Neue Masterversion vorbereiten …",
        exact: true,
      })
      .click();
    // Expert text belongs to its old context. Rebuild must require explicit template review.
    await primary().click();
    expect(await turns()).toHaveLength(1);
    await creator().getByRole("button",{name:"Neue Vorlage übernehmen",exact:true}).click();
    await fs.writeFile(path.join(root, "scenario"), "hang");
    await primary().click();
    await expect.poll(async () => (await turns()).length).toBe(2);
    await page
      .getByRole("button", { name: "Mastergenerierung abbrechen", exact: true })
      .click();
    await expect(
      page.getByRole("status", {
        name: "Character Figurenerstellung Status",
        exact: true,
      }),
    ).toContainText("abgebrochen");
    await expect(primary()).toBeEnabled();
    expect((await manifest()).masters).toEqual(approved.masters);
    expect(await fs.readFile(path.join(project, master.file))).toEqual(
      original,
    );
    expect(errors).toEqual([]);
    await app.close();
    app = undefined;
    await launch();
    await chooser([project]);
    await page.getByRole("button", { name: /^Projekt öffnen(?: …)?$/ }).click();
    await nav(page, "Studio");
    await mode(true);
    await expect(primary()).toHaveCount(1);
    expect((await manifest()).masters).toEqual(approved.masters);
    expect(errors).toEqual([]);
    console.log(
      "PASS master P0: header reaches actual controller, exact references/prompt, status/timer, review/approval, expression master, draft retention, locked master/rebuild/cancel, responsive layouts and restart. Protocol fixture only; no live generation.",
    );
  } finally {
    if (app) await app.close();
    await fs.rm(root, { recursive: true, force: true });
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
