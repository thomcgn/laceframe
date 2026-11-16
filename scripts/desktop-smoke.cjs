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
      page.getByText("Ein sicherer Ort für deine Charaktere."),
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
        "cancelGeneration",
        "checkCodex",
        "chooseImage",
        "command",
        "copyPrompt",
        "createProject",
        "cutoutMask",
        "discardImage",
        "exportAsset",
        "generationStatus",
        "openChatGPT",
        "openProject",
        "preview",
        "providers",
        "qualityReport",
        "revealMaster",
        "stageImage",
        "startGeneration",
      ],
    });
    const bytes = await app.evaluate(({ nativeImage }) => [
      ...nativeImage
        .createFromBitmap(Buffer.alloc(24 * 32 * 4, 160), {
          width: 24,
          height: 32,
        })
        .toPNG(),
    ]);
    const source = path.join(root, "synthetic-portrait.png");
    await fs.writeFile(source, Buffer.from(bytes));
    const sourceHash = createHash("sha256")
      .update(Buffer.from(bytes))
      .digest("hex");
    await setDialog(project);
    await page.getByLabel("Projektname", { exact: true }).fill("Desktop Smoke");
    await page
      .getByRole("button", { name: "Projekt erstellen …", exact: true })
      .click();
    await expect(
      page.getByText("Desktop Smoke", { exact: true }),
    ).toBeVisible();
    await page.getByLabel("Neue Figur", { exact: true }).fill("Ada Voss");
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
    await page
      .getByRole("button", {
        name: "Freigegebenen Master sperren",
        exact: true,
      })
      .click();
    await expect(
      page.getByText("Master V1 · gesperrt", { exact: true }),
    ).toBeVisible();
    await expect(page.getByAltText("Freigegebener Master V1")).toBeVisible();
    await page.getByRole("button", { name: /Expressions$/ }).click();
    await page
      .getByLabel("Emotionsfamilie", { exact: true })
      .selectOption({ label: "Wütend" });
    await page
      .getByLabel("Variante", { exact: true })
      .selectOption({ label: "Anbrüllen / shouting" });
    await page
      .getByLabel("Bildanweisung · nur lokale Notiz", { exact: true })
      .fill("Manuell geprüfte kontrollierte Wut.");
    await page
      .getByRole("button", { name: "Variante speichern", exact: true })
      .click();
    await expect(page.locator(".notice")).toHaveText("Gespeichert.");
    await setDialog(source);
    await page
      .getByRole("button", { name: "Kandidaten-PNG auswählen …", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Kandidat importieren", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Freigeben", exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Freigeben", exact: true }).click();
    await expect(page.locator(".notice")).toHaveText("Ausdruck freigegeben.");
    await page
      .getByRole("button", { name: "Kandidaten-PNG auswählen …", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Kandidat importieren", exact: true })
      .click();
    await page.getByRole("button", { name: "Ablehnen", exact: true }).click();
    await expect(page.locator(".notice")).toHaveText("Ausdruck abgelehnt.");
    await page.getByText("Eigene Familie hinzufügen", { exact: true }).click();
    await page.getByLabel("Neue Familie", { exact: true }).fill("Erleichtert");
    await page
      .locator("details")
      .getByLabel("Kennung", { exact: true })
      .fill("relieved");
    await page
      .getByRole("button", { name: "Familie hinzufügen", exact: true })
      .click();
    await expect(page.locator(".notice")).toHaveText("Gespeichert.");
    await page
      .getByLabel("Emotionsfamilie", { exact: true })
      .selectOption({ label: "Erleichtert" });
    await page.getByLabel("Neue Variante", { exact: true }).fill("Aufatmen");
    await page
      .getByRole("button", { name: "Variante hinzufügen", exact: true })
      .click();
    await expect(page.getByLabel("Variante", { exact: true })).toContainText(
      "Aufatmen",
    );
    await page.getByLabel("Neue Figur", { exact: true }).fill("WebP Probe");
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
      canvas.getContext("2d").fillRect(0, 0, 8, 10);
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
    await page
      .getByRole("button", {
        name: "Freigegebenen Master sperren",
        exact: true,
      })
      .click();
    await expect(page.getByRole("dialog")).not.toBeVisible();
    await expect(
      page.getByText("8 × 10 px · WEBP · bestätigt", { exact: false }),
    ).toBeVisible();
    await page
      .getByLabel("Aktive Figur", { exact: true })
      .selectOption({ label: "Ada Voss" });
    await expect(
      page.getByRole("heading", { name: "Ada Voss", exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: /Create$/ }).click();
    await expect(page.getByAltText("Create · Masterreferenz")).toBeVisible();
    await expect(
      page.getByLabel("Create Anbieter", { exact: true }),
    ).toBeVisible();
    await expect(page.getByAltText("Create · Ergebnisvorschau")).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Ergebnis importieren …", exact: true }),
    ).toBeEnabled();
    await page.evaluate(() => {
      const transfer = new DataTransfer();
      transfer.items.add(
        new File(["invalid image bytes"], "bad.png", { type: "image/png" }),
      );
      document
        .querySelector(".create-result")
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
    await page
      .getByLabel("Create Familie", { exact: true })
      .selectOption({ label: "Amüsiert" });
    await page
      .getByLabel("Create Variante", { exact: true })
      .selectOption({ label: "half-smile / half-smile" });
    await page.getByText("Prompteditor", { exact: true }).click();
    await page
      .getByLabel("Ergänzende Anweisung", { exact: true })
      .fill("Keep the original framing.");
    const prompt = page.getByLabel("Arbeits-Prompt", { exact: true });
    await expect(prompt).toHaveValue(/Keep the original framing/);
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
    await page
      .getByText("Inspector · Stimmaktion, Intensität und Herkunft", {
        exact: true,
      })
      .click();
    await page
      .getByRole("button", { name: "Referenz im Ordner zeigen", exact: true })
      .click();
    await expect(page.locator(".notice")).toContainText(
      "Referenz im Dateimanager",
    );
    expect(await app.evaluate(() => globalThis.__revealed)).toMatch(
      /assets[/\\]originals[/\\][a-f0-9]{64}\.png$/,
    );
    const dropResult = async (webp = false) =>
      page.evaluate(
        async ({ bytes, webp }) => {
          let blob = new window.Blob([new Uint8Array(bytes)], {
            type: "image/png",
          });
          if (webp) {
            const c = document.createElement("canvas");
            c.width = 8;
            c.height = 10;
            c.getContext("2d").fillRect(0, 0, 8, 10);
            blob = await new Promise((r) => c.toBlob(r, "image/webp"));
          }
          const transfer = new DataTransfer();
          transfer.items.add(
            new File([blob], webp ? "result.webp" : "result.png", {
              type: blob.type,
            }),
          );
          document
            .querySelector(".create-result")
            .dispatchEvent(
              new DragEvent("drop", { bubbles: true, dataTransfer: transfer }),
            );
        },
        { bytes, webp },
      );
    await dropResult();
    await expect(page.getByAltText("Create · Ergebnisvorschau")).toBeVisible();
    await page
      .getByRole("button", { name: "Als Expression freigeben", exact: true })
      .click();
    await expect(page.locator(".notice")).toHaveText(
      "Als Expression freigegeben.",
    );
    await page.getByRole("button", { name: /Expressions$/ }).click();
    await expect(
      page.getByText("Importierte Ausdrücke (3)", { exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: /Create$/ }).click();
    await page
      .getByLabel("Create Familie", { exact: true })
      .selectOption({ label: "Wütend" });
    await expect(
      page.getByRole("button", {
        name: "Eigenen Prompt behalten",
        exact: true,
      }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Neue Vorlage übernehmen", exact: true })
      .click();
    await page
      .getByLabel("Create Variante", { exact: true })
      .selectOption({ label: "Anbrüllen / shouting" });
    await expect(prompt).toHaveValue(/VOCAL ACTION .*: shouting/);
    await expect(prompt).toHaveValue(/Manuell geprüfte kontrollierte Wut/);
    await dropResult(true);
    await expect(
      page.getByText(
        /Abweichende Abmessungen: Master 24 × 32, Ergebnis 8 × 10/,
      ),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Kandidat verwerfen", exact: true })
      .click();
    await expect(page.locator(".notice")).toContainText("Kandidat verworfen.");
    await dropResult();
    await expect(
      page.getByText("Ergebnis ersetzen?", { exact: true }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Ersetzen bestätigen", exact: true })
      .click();
    await expect(
      page.getByRole("button", {
        name: "Als Expression freigeben",
        exact: true,
      }),
    ).toBeVisible();
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
      .getByRole("button", { name: "An Inspect senden", exact: true })
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
    await expect(page.getByAltText("Freigegebener Master V1")).toBeVisible();
    await page.getByRole("button", { name: /Expressions$/ }).click();
    await expect(
      page.getByText("Importierte Ausdrücke (5)", { exact: true }),
    ).toBeVisible();
    await page
      .getByLabel("Emotionsfamilie", { exact: true })
      .selectOption({ label: "Erleichtert" });
    await expect(page.getByLabel("Variante", { exact: true })).toContainText(
      "Aufatmen",
    );
    expect(
      JSON.parse(
        await fs.readFile(path.join(project, "laceframe.json"), "utf8"),
      ),
    ).toEqual(before);
    await page.getByRole("button", { name: /Create$/ }).click();
    await expect(page.getByAltText("Create · Ergebnisvorschau")).toBeVisible();
    await expect(
      page.getByLabel("Arbeits-Prompt", { exact: true }),
    ).toHaveValue(/VOCAL ACTION .*: shouting/);
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
      page.getByRole("heading", { name: "Motion kommt in Task 03." }),
    ).toBeVisible();
    expect(rendererErrors).toEqual([]);
    console.log(
      "PASS Linux packaged Electron: sandbox/preload, create, character, drop, immutable master, editable expressions, WebP master, PNG candidate, protocol/IPC rejection, approve/reject, source hash, close/relaunch/reopen. Create prompt/copy/browser allowlist, real PNG/WebP result drops, replace history, approval, dimension warning, Inspect, responsive layout and provider capabilities. No renderer exceptions.",
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
