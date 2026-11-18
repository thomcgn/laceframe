const { studioStep, studioExpert } = require("./smoke-ui.cjs");
const { reviewImport } = require("./historical-master-fixture.cjs");
const { field, image, text, nav } = require("./smoke-ui.cjs");
const { _electron: electron, expect } = require("@playwright/test");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { createHash } = require("node:crypto");

(async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "laceframe-desktop-"));
  const project = path.join(root, "project");
  await fs.mkdir(project);
  const executablePath =
    process.env.LACEFRAME_EXECUTABLE ||
    path.resolve("out/Laceframe-linux-x64/laceframe");
  let app;
  const rendererErrors = [];
  const launch = async () => {
    const env = { ...process.env };
    delete env.ELECTRON_RUN_AS_NODE;
    app = await electron.launch({
      executablePath,
      args: [`--user-data-dir=${path.join(root, "user-data")}`],
      env,
    });
    const page = await app.firstWindow();
    page.on("pageerror", (error) => rendererErrors.push(error.message));
    await expect(
      page.getByRole("heading", { name: "Characters", exact: true }),
    ).toBeVisible();
    await expect(
      text(page, "Ein sicherer Ort für deine Charaktere."),
    ).toBeVisible();
    return page;
  };
  const setDialog = async (file) =>
    app.evaluate(({ dialog }, selected) => {
      dialog.showOpenDialog = async () => ({
        canceled: false,
        filePaths: [selected],
      });
    }, file);
  try {
    let page = await launch();
    const security = await app.evaluate(({ BrowserWindow }) => {
      const wc = BrowserWindow.getAllWindows()[0].webContents;
      const p = wc.getLastWebPreferences();
      return {
        isolation: p.contextIsolation,
        node: p.nodeIntegration,
        sandbox: p.sandbox,
      };
    });
    expect(security).toEqual({ isolation: true, node: false, sandbox: true });
    const forbidden = await app.evaluate(
      async ({ net, BrowserWindow, app }) => {
        const main = BrowserWindow.getAllWindows()[0];
        const url = main.webContents.getURL();
        const preload = app.getAppPath() + "/.vite/build/preload.cjs";
        const other = new BrowserWindow({
          show: false,
          webPreferences: {
            preload,
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true,
          },
        });
        await other.loadURL(url);
        const result = await other.webContents.executeJavaScript(
          "window.laceframe.preview('00000000-0000-4000-8000-000000000000')",
        );
        other.destroy();
        return {
          status: (await net.fetch("laceframe://app/private/file.png")).status,
          result,
        };
      },
    );
    expect(forbidden.status).toBe(403);
    expect(forbidden.result).toEqual({
      ok: false,
      error: "Unzulässiger IPC-Absender.",
    });
    expect(
      await page.evaluate(() => ({
        node: typeof window.require,
        bridge: Object.keys(window.laceframe).sort(),
      })),
    ).toEqual({
      node: "undefined",
      bridge: [
        "analysisSource",
        "cancelGeneration",
        "checkCodex",
        "chooseImage",
        "choosePack",
        "colorPalette",
        "colorRecipe",
        "command",
        "copyPrompt",
        "createProject",
        "cutoutMask",
        "cutoutSource",
        "discardImage",
        "exportAsset",
        "exportPack",
        "generationStatus",
        "importIdentityImages",
        "openChatGPT",
        "openProject",
        "preview",
        "providers",
        "qualityReport",
        "relightEligibility",
        "relightRecipe",
        "relightSource",
        "revealMaster",
        "smartCutoutRecipe",
        "stageImage",
        "startGeneration",
      ],
    });
    const bytes = await app.evaluate(({ nativeImage }) => [
      ...nativeImage
        .createFromBitmap(
          (() => {
            const b = Buffer.alloc(24 * 32 * 4, 160);
            for (let y = 0; y < 32; y++)
              for (let x = 0; x < 24; x++)
                if (!x || !y || x === 23 || y === 31)
                  b[(y * 24 + x) * 4 + 3] = 0;
            return b;
          })(),
          {
            width: 24,
            height: 32,
          },
        )
        .toPNG(),
    ]);
    const source = path.join(root, "synthetic-portrait.png");
    await fs.writeFile(source, Buffer.from(bytes));
    const sourceHash = createHash("sha256")
      .update(Buffer.from(bytes))
      .digest("hex");
    await setDialog(project);
    await field(page, "Projektname", { exact: true }).fill("Desktop Smoke");
    await page
      .getByRole("button", { name: "Projekt erstellen …", exact: true })
      .click();
    await expect(text(page, "Desktop Smoke", { exact: true })).toBeVisible();
    await field(page, "Neue Figur", { exact: true }).fill("Ada Voss");
    await page
      .getByRole("button", { name: "Figur erstellen", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Ada Voss", exact: true }),
    ).toBeVisible();
    // Real dropped File bytes, not a mocked bridge or project service.
    await page.evaluate(
      ({ bytes }) => {
        const transfer = new DataTransfer();
        transfer.items.add(
          new File([new Uint8Array(bytes)], "synthetic-portrait.png", {
            type: "image/png",
          }),
        );
        document
          .querySelector(".app")
          .dispatchEvent(
            new DragEvent("drop", { bubbles: true, dataTransfer: transfer }),
          );
      },
      { bytes },
    );
    await expect(page.getByRole("dialog")).toBeVisible();
    expect(
      JSON.parse(
        await fs.readFile(path.join(project, "laceframe.json"), "utf8"),
      ).masters,
    ).toHaveLength(0);
    await reviewImport(page);
    await page
      .getByRole("button", {
        name: "Freigegebenen Master sperren",
        exact: true,
      })
      .click();
    await expect(
      text(page, "Master V1 · gesperrt", { exact: true }),
    ).toBeVisible();
    await expect(image(page, "Freigegebener Master V1")).toBeVisible();
    await nav(page, "Expressions");
    await field(page, "Emotionsfamilie", { exact: true }).selectOption({
      label: "Wütend",
    });
    await field(page, "Variante", { exact: true }).selectOption({
      label: "Anbrüllen / shouting",
    });
    await field(page, "Globale Generierungsanweisung", { exact: true }).fill(
      "Manuell geprüfte kontrollierte Wut.",
    );
    await page
      .getByRole("button", { name: "Variante speichern", exact: true })
      .click();
    await expect(page.locator(".notice")).toHaveText("Gespeichert.");
    // Compatibility fixture: existing projects may contain imports predating Create attempts.
    // Exercise the real legacy IPC command; all new user imports below use Studio.
    const legacy = JSON.parse(
      await fs.readFile(path.join(project, "laceframe.json"), "utf8"),
    );
    const legacyVariant = legacy.variants.find((v) => v.slug === "shouting");
    await setDialog(source);
    for (const status of ["approved", "rejected"]) {
      const result = await page.evaluate(
        async ({ characterId, variantId, status }) => {
          const staged = await window.laceframe.chooseImage();
          if (!staged.ok || !staged.value)
            throw new Error("Fixture import failed");
          const imported = await window.laceframe.command({
            type: "importCandidate",
            characterId,
            variantId,
            action: "shouting",
            token: staged.value.token,
          });
          if (!imported.ok) throw new Error(imported.error);
          return window.laceframe.command({
            type: "review",
            id: imported.value.project.assets.at(-1).id,
            status,
          });
        },
        {
          characterId: legacy.selectedCharacterId,
          variantId: legacyVariant.id,
          status,
        },
      );
      expect(result.ok).toBe(true);
    }
    await setDialog(project);
    await page.locator(".project-management summary").click();
    await page
      .getByRole("button", { name: "Projekt öffnen …", exact: true })
      .click();
    await nav(page, "Expressions");
    await text(page, "Eigene Familie hinzufügen", { exact: true }).click();
    await field(page, "Neue Familie", { exact: true }).fill("Erleichtert");
    await page
      .locator("form")
      .filter({ has: page.getByLabel("Neue Familie", { exact: true }) })
      .getByLabel("Kennung", { exact: true })
      .fill("relieved");
    await page
      .getByRole("button", { name: "Familie hinzufügen", exact: true })
      .click();
    await expect(page.locator(".notice")).toHaveText("Gespeichert.");
    await field(page, "Emotionsfamilie", { exact: true }).selectOption({
      label: "Erleichtert",
    });
    await page
      .locator(".designer-navigation summary")
      .filter({ hasText: "Variante hinzufügen" })
      .click();
    await field(page, "Neue Variante", { exact: true }).fill("Aufatmen");
    await field(page, "Neue Variantenkennung", { exact: true }).fill(
      "aufatmen",
    );
    await page
      .getByRole("button", { name: "Variante hinzufügen", exact: true })
      .click();
    await expect(field(page, "Variante", { exact: true })).toContainText(
      "Aufatmen",
    );
    await nav(page, "Characters");
    await field(page, "Neue Figur", { exact: true }).fill("WebP Probe");
    await page
      .getByRole("button", { name: "Figur erstellen", exact: true })
      .click();
    await page.getByRole("button", { name: /Characters$/ }).click();
    await expect(
      page.getByRole("heading", { name: "WebP Probe", exact: true }),
    ).toBeVisible();
    await page.evaluate(async () => {
      const canvas = document.createElement("canvas");
      canvas.width = 8;
      canvas.height = 10;
      canvas.getContext("2d").fillRect(1, 1, 6, 8);
      const blob = await new Promise((resolve) =>
        canvas.toBlob(resolve, "image/webp"),
      );
      const transfer = new DataTransfer();
      transfer.items.add(
        new File([blob], "probe.webp", { type: "image/webp" }),
      );
      document
        .querySelector(".app")
        .dispatchEvent(
          new DragEvent("drop", { bubbles: true, dataTransfer: transfer }),
        );
    });
    await expect(page.getByRole("dialog")).toBeVisible();
    await reviewImport(page);
    await page
      .getByRole("button", {
        name: "Freigegebenen Master sperren",
        exact: true,
      })
      .click();
    await expect(page.getByRole("dialog")).not.toBeVisible();
    await expect(
      text(page, "8 × 10 px · WEBP · bestätigt", { exact: false }),
    ).toBeVisible();
    await field(page, "Aktive Figur", { exact: true }).selectOption({
      label: "Ada Voss",
    });
    await expect(
      page.getByRole("heading", { name: "Ada Voss", exact: true }),
    ).toBeVisible();
    await nav(page, "Studio");
    await page
      .getByRole("button", { name: "Expression erstellen", exact: true })
      .click();
    await studioStep(page, "Erzeugen");
    await expect(image(page, "Create · Masterreferenz")).toBeVisible();
    await studioStep(page, "Auswählen");
    await expect(field(page, "Create Anbieter", { exact: true })).toBeVisible();
    await studioStep(page, "Erzeugen");
    await expect(image(page, "Create · Ergebnisvorschau")).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Ergebnis importieren …", exact: true }),
    ).toBeEnabled();
    await page.evaluate(() => {
      const transfer = new DataTransfer();
      transfer.items.add(
        new File(["invalid image bytes"], "bad.png", { type: "image/png" }),
      );
      document
        .querySelector(".studio-editor:not([hidden]) .create-result")
        .dispatchEvent(
          new DragEvent("drop", { bubbles: true, dataTransfer: transfer }),
        );
    });
    await expect(page.getByRole("alert")).toBeVisible();
    const afterInvalid = JSON.parse(
      await fs.readFile(path.join(project, "laceframe.json"), "utf8"),
    );
    expect(afterInvalid.attempts).toHaveLength(0);
    expect(afterInvalid.assets).toHaveLength(2);
    const providers = await page.evaluate(() => window.laceframe.providers());
    expect(providers.ok).toBe(true);
    expect(
      providers.value
        .filter((p) => p.id !== "codex-native")
        .map((p) => [p.id, p.capabilities.canGenerate]),
    ).toEqual([
      ["chatgpt-plan", false],
      ["manual-import", false],
    ]);
    await studioStep(page, "Auswählen");
    await field(page, "Create Familie", { exact: true }).selectOption({
      label: "Amüsiert",
    });
    await studioStep(page, "Auswählen");
    await field(page, "Create Variante", { exact: true }).selectOption({
      label: "half-smile / half-smile",
    });
    await studioExpert(page);
    await field(page, "Promptmodus", { exact: true }).selectOption(
      "supplement",
    );
    await studioExpert(page);
    await field(page, "Ergänzende Anweisung", { exact: true }).fill(
      "Keep the original framing.",
    );
    // UX-06: task navigation is keyboard accessible and never discards a working draft.
    const draftBeforeSteps = await fs.readFile(
      path.join(project, "laceframe.json"),
    );
    for (const [width, height] of [
      [960, 720],
      [1280, 800],
      [1920, 1080],
    ]) {
      await app.evaluate(
        ({ BrowserWindow }, size) =>
          BrowserWindow.getAllWindows()[0].setSize(...size),
        [width, height],
      );
      const stepBounds = await page
        .locator(".studio-editor:visible .studio-flow nav button")
        .evaluateAll((nodes) =>
          nodes.map((n) => {
            const r = n.getBoundingClientRect();
            return { y: r.y, height: r.height };
          }),
        );
      expect(stepBounds).toHaveLength(4);
      expect(
        Math.max(...stepBounds.map((r) => r.y)) -
          Math.min(...stepBounds.map((r) => r.y)),
      ).toBeLessThan(2);
      expect(Math.max(...stepBounds.map((r) => r.height))).toBeLessThan(50);
      for (const name of ["Auswählen", "Erzeugen", "Bearbeiten", "Freigeben"]) {
        const tab = page
          .locator(".studio-editor:visible")
          .getByRole("navigation", { name: "Studio Schritte" })
          .getByRole("button", { name: new RegExp(name + "$") });
        await tab.focus();
        await page.keyboard.press("Enter");
        await expect(tab).toHaveAttribute("aria-current", "step");
        await expect(tab).toBeInViewport();
        await expect(
          field(page, "Ergänzende Anweisung", { exact: true }),
        ).toHaveValue("Keep the original framing.");
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= window.innerWidth,
          ),
        ).toBe(true);
      }
      await studioExpert(page);
      const expert = page
        .locator(".studio-editor:visible")
        .getByRole("checkbox", { name: "Expertenansicht", exact: true });
      await expert.uncheck();
      await expect(field(page, "Promptmodus", { exact: true })).toBeHidden();
      await expert.check();
      await expect(
        field(page, "Ergänzende Anweisung", { exact: true }),
      ).toHaveValue("Keep the original framing.");
      await fs.mkdir("artifacts/ux06", { recursive: true });
      await page.screenshot({
        path: `artifacts/ux06/studio-${width}x${height}.png`,
      });
    }
    expect(await fs.readFile(path.join(project, "laceframe.json"))).toEqual(
      draftBeforeSteps,
    );
    const prompt = field(page, "Arbeits-Prompt", { exact: true });
    await expect(prompt).toHaveValue(/Keep the original framing/);
    await studioExpert(page);
    await field(page, "Promptmodus", { exact: true }).selectOption("expert");
    await prompt.fill((await prompt.inputValue()) + "\nMy reviewed prompt.");
    // Substitute the OS shell boundary only; real bridge validation, clipboard,
    // storage and renderer interactions remain in use.
    await app.evaluate(({ shell }) => {
      globalThis.__opened = [];
      shell.openExternal = async (url) => {
        globalThis.__opened.push(url);
      };
      shell.showItemInFolder = (file) => {
        globalThis.__revealed = file;
      };
    });
    await page
      .getByRole("button", {
        name: "Prompt kopieren & ChatGPT öffnen",
        exact: true,
      })
      .click();
    await expect(page.locator(".notice")).toContainText("Prompt kopiert.");
    expect(await app.evaluate(({ clipboard }) => clipboard.readText())).toBe(
      await prompt.inputValue(),
    );
    expect(await app.evaluate(() => globalThis.__opened)).toEqual([
      "https://chatgpt.com/",
    ]);
    const blocked = await page.evaluate(() =>
      window.laceframe.openChatGPT("file:///etc/passwd"),
    );
    expect(blocked.ok).toBe(false);
    expect(await app.evaluate(() => globalThis.__opened)).toHaveLength(1);
    await studioExpert(page);
    await text(page, "Technische Details · Herkunft", {
      exact: true,
    }).click();
    await page
      .getByRole("button", { name: "Referenz im Ordner zeigen", exact: true })
      .click();
    await expect(page.locator(".notice")).toContainText(
      "Referenz im Dateimanager",
    );
    expect(await app.evaluate(() => globalThis.__revealed)).toMatch(
      /assets[/\\]originals[/\\][a-f0-9]{64}\.png$/,
    );
    const dropResult = async (webp = false) => {
      await studioStep(page, "Erzeugen");
      return page.evaluate(
        async ({ bytes, webp }) => {
          let blob = new window.Blob([new Uint8Array(bytes)], {
            type: "image/png",
          });
          if (webp) {
            const c = document.createElement("canvas");
            c.width = 8;
            c.height = 10;
            c.getContext("2d").fillRect(1, 1, 6, 8);
            blob = await new Promise((r) => c.toBlob(r, "image/webp"));
          }
          const transfer = new DataTransfer();
          transfer.items.add(
            new File([blob], webp ? "result.webp" : "result.png", {
              type: blob.type,
            }),
          );
          document
            .querySelector(".studio-editor:not([hidden]) .create-result")
            .dispatchEvent(
              new DragEvent("drop", { bubbles: true, dataTransfer: transfer }),
            );
        },
        { bytes, webp },
      );
    };
    await dropResult();
    await expect(image(page, "Create · Ergebnisvorschau")).toBeVisible();
    await studioStep(page, "Freigeben");
    await page
      .getByRole("button", { name: "Als Expression freigeben", exact: true })
      .click();
    await expect(page.locator(".notice")).toHaveText(
      "Als Expression freigegeben.",
    );
    await nav(page, "Library");
    await expect(
      field(page, "Library Asset", { exact: true }).locator("option"),
    ).toHaveCount(4);
    await nav(page, "Studio");
    await studioStep(page, "Auswählen");
    await field(page, "Create Familie", { exact: true }).selectOption({
      label: "Wütend",
    });
    await studioExpert(page);
    await expect(
      page.getByRole("button", {
        name: "Eigenen Prompt behalten",
        exact: true,
      }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Neue Vorlage übernehmen", exact: true })
      .click();
    await studioStep(page, "Auswählen");
    await field(page, "Create Variante", { exact: true }).selectOption({
      label: "Anbrüllen / shouting",
    });
    await expect(prompt).toHaveValue(/VOCAL ACTION .*: shouting/);
    await expect(prompt).toHaveValue(/Manuell geprüfte kontrollierte Wut/);
    await dropResult(true);
    await expect(
      text(page, /Abweichende Abmessungen: Master 24 × 32, Ergebnis 8 × 10/),
    ).toBeVisible();
    await studioStep(page, "Freigeben");
    await page
      .getByRole("button", { name: "Entwurf verwerfen", exact: true })
      .click();
    await expect(page.locator(".notice")).toContainText("Entwurf verworfen.");
    await dropResult();
    await expect(
      text(page, "Ergebnis ersetzen?", { exact: true }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Ersetzen bestätigen", exact: true })
      .click();
    await studioStep(page, "Freigeben");
    await expect(
      page.getByRole("button", {
        name: "Als Expression freigeben",
        exact: true,
      }),
    ).toBeVisible();
    await studioStep(page, "Freigeben");
    await page
      .getByRole("button", { name: "Als Expression freigeben", exact: true })
      .click();
    await expect(page.locator(".notice")).toHaveText(
      "Als Expression freigegeben.",
    );
    await fs.mkdir("artifacts", { recursive: true });
    await page.screenshot({
      path: "artifacts/desktop-create.png",
      fullPage: true,
    });
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].setSize(960, 720),
    );
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: "artifacts/desktop-create-small.png",
      fullPage: true,
    });
    await page
      .getByRole("button", { name: "In Library prüfen", exact: true })
      .click();

    await fs.mkdir("artifacts", { recursive: true });
    await page.screenshot({
      path: "artifacts/desktop-inspect.png",
      fullPage: true,
    });
    const before = JSON.parse(
      await fs.readFile(path.join(project, "laceframe.json"), "utf8"),
    );
    expect(before.assets.map((a) => a.status)).toEqual([
      "approved",
      "rejected",
      "approved",
      "rejected",
      "approved",
    ]);
    expect(
      before.assets.every(
        (a) =>
          a.masterSha256 === sourceHash && a.masterId === before.masters[0].id,
      ),
    ).toBe(true);
    expect(before.assets[0].action).toBe("shouting");
    expect(
      createHash("sha256")
        .update(await fs.readFile(source))
        .digest("hex"),
    ).toBe(sourceHash);
    await app.close();
    app = undefined;
    page = await launch();
    await setDialog(project);
    await page
      .getByRole("button", { name: "Projekt öffnen …", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Ada Voss", exact: true }),
    ).toBeVisible();
    await expect(image(page, "Freigegebener Master V1")).toBeVisible();
    await nav(page, "Library");
    await expect(
      field(page, "Library Asset", { exact: true }).locator("option"),
    ).toHaveCount(6);
    await nav(page, "Expressions");
    await field(page, "Emotionsfamilie", { exact: true }).selectOption({
      label: "Erleichtert",
    });
    await expect(field(page, "Variante", { exact: true })).toContainText(
      "Aufatmen",
    );
    expect(
      JSON.parse(
        await fs.readFile(path.join(project, "laceframe.json"), "utf8"),
      ),
    ).toEqual(before);
    await nav(page, "Studio");
    await studioExpert(page);
    await expect(image(page, "Create · Ergebnisvorschau")).toBeVisible();
    await expect(field(page, "Arbeits-Prompt", { exact: true })).toHaveValue(
      /VOCAL ACTION .*: shouting/,
    );
    expect(before.attempts).toHaveLength(3);
    expect(
      before.assets
        .slice(2)
        .every(
          (a) =>
            a.attemptId &&
            a.promptRevisionId &&
            a.providerId === "manual-import",
        ),
    ).toBe(true);
    await page.getByRole("button", { name: /Motion$/ }).click();
    await expect(
      page.getByRole("heading", { name: "Motion · späterer Meilenstein." }),
    ).toBeVisible();
    expect(rendererErrors).toEqual([]);
    console.log(
      "PASS Linux packaged Electron: sandbox/preload, create, character, drop, immutable master, editable expressions, WebP master, PNG candidate, protocol/IPC rejection, approve/reject, source hash, close/relaunch/reopen. Create prompt/copy/browser allowlist, real PNG/WebP result drops, replace history, approval, dimension warning, Library, responsive layout and provider capabilities. No renderer exceptions.",
    );
  } catch (error) {
    if (app) {
      const page = await app.firstWindow();
      await fs.mkdir("artifacts", { recursive: true });
      await page.screenshot({
        path: "artifacts/desktop-failure.png",
        fullPage: true,
      });
      console.error(await page.locator("body").innerText());
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
