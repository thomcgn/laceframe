// Packaged Electron integration with a protocol fixture. No live AI calls.
const { _electron: electron, expect } = require("@playwright/test");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
(async () => {
  const root = await fs.mkdtemp(
    path.join(os.tmpdir(), "laceframe-native-desktop-"),
  );
  const project = path.join(root, "project");
  const bin = path.join(root, "bin");
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
    LACEFRAME_TEST_SCENARIO: "success",
  };
  delete env.ELECTRON_RUN_AS_NODE;
  let app;
  const errors = [];
  try {
    app = await electron.launch({
      executablePath: path.resolve("out/Laceframe-linux-x64/laceframe"),
      args: ["--user-data-dir=" + path.join(root, "user-data")],
      env,
    });
    const page = await app.firstWindow();
    page.setDefaultTimeout(15000);
    page.on("pageerror", (error) => errors.push(error.message));
    await expect(
      page.getByRole("heading", { name: "Characters", exact: true }),
    ).toBeVisible();
    await app.evaluate(({ dialog }, directory) => {
      dialog.showOpenDialog = async () => ({
        canceled: false,
        filePaths: [directory],
      });
    }, project);
    await page.getByLabel("Projektname", { exact: true }).fill("Native smoke");
    await page
      .getByRole("button", { name: "Projekt erstellen …", exact: true })
      .click();
    await page
      .getByLabel("Neue Figur", { exact: true })
      .fill("Synthetic Native");
    await page
      .getByRole("button", { name: "Figur erstellen", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Synthetic Native", exact: true }),
    ).toBeVisible();
    const bytes = await app.evaluate(({ nativeImage }) => [
      ...nativeImage
        .createFromBitmap(Buffer.alloc(24 * 32 * 4, 160), {
          width: 24,
          height: 32,
        })
        .toPNG(),
    ]);
    await page.evaluate(async (bytes) => {
      const transfer = new DataTransfer();
      transfer.items.add(
        new File([new Uint8Array(bytes)], "source.png", { type: "image/png" }),
      );
      document
        .querySelector(".app")
        .dispatchEvent(
          new DragEvent("drop", { bubbles: true, dataTransfer: transfer }),
        );
    }, bytes);
    await page
      .getByRole("button", {
        name: "Freigegebenen Master sperren",
        exact: true,
      })
      .click();
    const thread = "00000000-0000-4000-8000-000000000123";
    const output = path.join(root, "generated_images", thread);
    await fs.mkdir(output, { recursive: true });
    await fs.writeFile(path.join(output, "result.png"), Buffer.from(bytes));
    await page.getByRole("button", { name: /Create$/ }).click();
    await expect(
      page.getByRole("status", { name: "Codex Status" }),
    ).toContainText("Codex bereit");
    await page
      .getByLabel("Create Anbieter", { exact: true })
      .selectOption("codex-native");
    await page
      .getByLabel("Ergänzende Anweisung", { exact: true })
      .fill("Native pipeline assertion.");
    const generate = page.getByRole("button", {
      name: "Mit Masterreferenz generieren",
      exact: true,
    });
    await expect(generate).toBeEnabled();
    await generate.click();
    await expect(
      page.getByRole("status", { name: "Codex Status" }),
    ).toContainText("Generierung abgeschlossen", { timeout: 15000 });
    await expect(page.getByAltText("Create · Ergebnisvorschau")).toBeVisible();
    await page
      .getByRole("button", { name: "Als Expression freigeben", exact: true })
      .click();
    await expect(page.locator(".notice")).toHaveText(
      "Als Expression freigegeben.",
    );
    const manifest = async () =>
      JSON.parse(
        await fs.readFile(path.join(project, "laceframe.json"), "utf8"),
      );
    let p = await manifest();
    expect(p.assets[0]).toMatchObject({
      providerId: "codex-native",
      status: "approved",
      masterId: p.masters[0].id,
      masterSha256: p.masters[0].sha256,
      attemptId: p.attempts[0].id,
      promptRevisionId: p.attempts[0].promptRevision.id,
    });
    expect(p.attempts[0].promptRevision.prompt).toContain(
      "Native pipeline assertion.",
    );
    await fs.writeFile(path.join(root, "scenario"), "image-failed");
    await generate.click();
    await expect(
      page.getByRole("status", { name: "Codex Status" }),
    ).toContainText("fehlgeschlagen", { timeout: 15000 });
    p = await manifest();
    expect(p.assets).toHaveLength(1);
    expect(p.attempts).toHaveLength(2);
    await fs.writeFile(path.join(root, "scenario"), "hang");
    await page
      .getByRole("button", { name: "Codex-Verfügbarkeit prüfen", exact: true })
      .click();
    await expect(
      page.getByRole("status", { name: "Codex Status" }),
    ).toContainText("Codex bereit");
    await expect(generate).toBeEnabled();
    await generate.click();
    await expect(
      page.getByRole("button", { name: "Generierung abbrechen", exact: true }),
    ).toBeVisible();
    const locked = await page.evaluate(() =>
      window.laceframe.command({
        type: "addCharacter",
        name: "Should be blocked",
      }),
    );
    expect(locked.ok).toBe(false);
    await page
      .getByRole("button", { name: "Generierung abbrechen", exact: true })
      .click();
    await expect(
      page.getByRole("status", { name: "Codex Status" }),
    ).toContainText("abgebrochen", { timeout: 15000 });
    expect((await manifest()).assets).toHaveLength(1);
    await fs.writeFile(path.join(root, "scenario"), "no-auth");
    await page
      .getByRole("button", { name: "Codex-Verfügbarkeit prüfen", exact: true })
      .click();
    await expect(
      page.getByRole("status", { name: "Codex Status" }),
    ).toContainText("Nicht mit ChatGPT angemeldet");
    await expect(generate).toBeDisabled();
    await fs.mkdir("artifacts", { recursive: true });
    await page.screenshot({
      path: "artifacts/native-provider-smoke.png",
      fullPage: true,
    });
    expect(errors).toEqual([]);
    console.log(
      "PASS packaged native-provider UI: actual IPC/process lifecycle, fixture success/failure/cancel, project lock, provenance, approval, auth gating. No live AI calls.",
    );
  } catch (error) {
    if (app) {
      const p = await app.firstWindow();
      console.error(await p.locator("body").innerText());
      await fs.mkdir("artifacts", { recursive: true });
      await p.screenshot({
        path: "artifacts/native-smoke-failure.png",
        fullPage: true,
      });
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
