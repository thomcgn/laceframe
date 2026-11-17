import { identityImportSchema } from "../shared/identity-import";
import { ImageDialogService } from "./image-dialog";
import { MAX_PACK_BYTES, packSelectionSchema } from "../shared/packs";
import { exportAssetSchema } from "../shared/asset-quality";
import { writeExport } from "./asset-export";
import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  session,
  protocol,
  net,
  clipboard,
  shell,
} from "electron";
import type { IpcMainInvokeEvent } from "electron";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { z } from "zod";
import { commandSchema, idSchema, MAX_IMAGE_BYTES } from "../shared/domain";
import { ProjectService, readLimited } from "./project-service";
import { validateExternalURL } from "../shared/generation";
import { chatgptPlanProvider } from "./services/providers/chatgptPlan";
import { manualImportProvider } from "./services/providers/manualImport";
import { CodexImageGenerationProvider } from "./services/providers/codexImageGeneration";
import { GenerationController } from "./services/generation-controller";
import { decodeImage, decodeAssetPixels } from "./decode-image";
import type { Result } from "../shared/bridge";

declare const MAIN_WINDOW_VITE_DEV_SERVER_URL: string | undefined;
declare const MAIN_WINDOW_VITE_NAME: string;
protocol.registerSchemesAsPrivileged([
  {
    scheme: "laceframe",
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
    },
  },
]);
let window: BrowserWindow;
const service = new ProjectService(decodeImage, decodeAssetPixels);
const generation = new GenerationController(
  service,
  new CodexImageGenerationProvider(),
);
let queue: Promise<unknown> = Promise.resolve();
function handle<T>(
  channel: string,
  operation: (input: unknown) => T | Promise<T>,
) {
  ipcMain.handle(
    channel,
    (event: IpcMainInvokeEvent, input: unknown): Promise<Result<T>> => {
      const task = queue.then(async (): Promise<Result<T>> => {
        try {
          if (
            !window ||
            event.sender !== window.webContents ||
            event.senderFrame !== window.webContents.mainFrame ||
            event.senderFrame.url !== rendererURL()
          )
            throw new Error("Unzulässiger IPC-Absender.");
          if (
            generation.running &&
            ![
              "generation:status",
              "generation:cancel",
              "generation:providers",
              "image:preview",
              "image:quality",
            ].includes(channel)
          )
            throw new Error(
              "Während der Generierung ist das Projekt gesperrt. Erst abbrechen oder auf das Ergebnis warten.",
            );
          return { ok: true, value: await operation(input) };
        } catch (error) {
          return {
            ok: false,
            error:
              error instanceof z.ZodError
                ? "Ungültige Projektdaten oder Eingabe. Schema/Referenzen prüfen."
                : error instanceof Error
                  ? error.message
                  : "Vorgang fehlgeschlagen.",
          };
        }
      });
      queue = task;
      return task;
    },
  );
}
function rendererURL() {
  return MAIN_WINDOW_VITE_DEV_SERVER_URL
    ? new URL(MAIN_WINDOW_VITE_DEV_SERVER_URL).href
    : "laceframe://app/index.html";
}
function registerIPC() {
  const imageDialogs = new ImageDialogService(
    app.getPath("userData"),
    (options) => dialog.showOpenDialog(window, options),
  );
  handle("identity:import", async (input) => {
    const request = identityImportSchema.parse(input);
    const slots = service.identitySlots(request.characterId, request.replaceId);
    if (!slots) throw new Error("Maximal drei aktive Identitätsreferenzen.");
    if (!request.files) {
      const files = await imageDialogs.choose({
        title: "Identitätsbilder hinzufügen",
        properties: ["openFile", "multiSelections"],
        filters: [
          {
            name: "Identitätsbilder",
            extensions: ["png", "jpg", "jpeg", "webp"],
          },
        ],
      });
      if (!files) return null;
      if (files.length > slots)
        throw new Error(
          `Noch ${slots} von 3 Plätzen verfügbar. Die gesamte Auswahl wurde abgelehnt.`,
        );
      const inputs = [],
        errors = [];
      for (const file of files) {
        try {
          inputs.push({
            name: path.basename(file),
            bytes: new Uint8Array(await readLimited(file, 16 * 1024 * 1024)),
          });
        } catch {
          errors.push(
            `${path.basename(file)}: Datei fehlt, ist unsicher oder größer als 16 MiB.`,
          );
        }
      }
      if (errors.length) throw new Error(errors.join("\n"));
      request.files = inputs;
    }
    return service.importIdentityImages(request);
  });
  handle("pack:choose", async (input) => {
    const kind = z.enum(["style", "expressions"]).parse(input);
    service.snapshot();
    const selected = await dialog.showOpenDialog(window, {
      title: "JSON-Pack prüfen",
      properties: ["openFile"],
      filters: [{ name: "Laceframe JSON", extensions: ["json"] }],
    });
    if (selected.canceled) return null;
    const bytes = await readLimited(selected.filePaths[0], MAX_PACK_BYTES);
    const preview = service.previewPack(
      new TextDecoder("utf-8", { fatal: true }).decode(bytes),
    );
    if (preview.pack.format !== `laceframe.${kind}`)
      throw new Error("Falscher Pack-Typ für diesen Workspace.");
    return preview;
  });
  handle("pack:export", async (input) => {
    const payload = service.exportPack(packSelectionSchema.parse(input));
    const selected = await dialog.showOpenDialog(window, {
      title: "JSON-Exportordner (außerhalb des Projekts)",
      properties: ["openDirectory", "createDirectory"],
    });
    if (selected.canceled) return null;
    await writeExport(
      selected.filePaths[0],
      service.snapshot().directory,
      payload,
    );
    return { name: payload.name };
  });
  handle("image:cutout-source", (input) =>
    service.cutoutSource(idSchema.parse(input)),
  );
  handle("image:smart-cutout-recipe", (input) =>
    service.smartCutoutRecipe(idSchema.parse(input)),
  );
  handle("image:analysis-source", (input) =>
    service.analysisSource(idSchema.parse(input)),
  );
  handle("image:relight-eligibility", (input) =>
    service.relightEligibility(idSchema.parse(input)),
  );
  handle("image:relight-source", (input) =>
    service.relightSource(idSchema.parse(input)),
  );
  handle("image:relight-recipe", (input) =>
    service.relightRecipe(idSchema.parse(input)),
  );
  handle("image:cutout-mask", (input) =>
    service.cutoutMask(idSchema.parse(input)),
  );
  handle("image:quality", (input) =>
    service.qualityReport(idSchema.parse(input)),
  );
  handle("image:export", async (input) => {
    const payload = await service.exportPayload(exportAssetSchema.parse(input));
    const selected = await dialog.showOpenDialog(window, {
      title: "Exportordner auswählen (neue Dateien, kein Überschreiben)",
      properties: ["openDirectory", "createDirectory"],
    });
    if (selected.canceled) return null;
    await writeExport(
      selected.filePaths[0],
      service.snapshot().directory,
      payload,
    );
    return { name: payload.name };
  });
  handle("generation:check", (input) => {
    z.undefined().parse(input);
    return generation.check();
  });
  handle("generation:start", (input) => generation.start(input));
  handle("generation:status", (input) => {
    z.undefined().parse(input);
    return { status: generation.status(), snapshot: service.snapshot() };
  });
  handle("generation:cancel", (input) => {
    z.undefined().parse(input);
    return generation.cancel();
  });
  handle("generation:reveal-master", async (input) => {
    shell.showItemInFolder(await service.masterFile(idSchema.parse(input)));
    return null;
  });
  handle("generation:providers", (input) => {
    z.undefined().parse(input);
    return [
      generation.provider.descriptor,
      chatgptPlanProvider.descriptor,
      manualImportProvider.descriptor,
    ];
  });
  handle("generation:copy-prompt", (input) => {
    const id = idSchema.parse(input);
    const attempt = service
      .snapshot()
      .project.attempts.find((a) => a.id === id);
    if (!attempt) throw new Error("Gespeicherten Versuch auswählen.");
    clipboard.writeText(attempt.promptRevision.prompt);
    return null;
  });
  handle("generation:open-external", async (input) => {
    await shell.openExternal(validateExternalURL(input));
    return null;
  });
  handle("project:create", async (input) => {
    const name = z.string().trim().min(1).max(120).parse(input);
    const selected = await dialog.showOpenDialog(window, {
      title: "Leeren Projektordner auswählen",
      properties: ["openDirectory", "createDirectory"],
    });
    return selected.canceled
      ? null
      : service.create(selected.filePaths[0], name);
  });
  handle("project:open", async (input) => {
    z.undefined().parse(input);
    const selected = await dialog.showOpenDialog(window, {
      title: "Laceframe-Projekt öffnen",
      properties: ["openDirectory"],
    });
    return selected.canceled ? null : service.open(selected.filePaths[0]);
  });
  handle("project:command", (input) =>
    service.command(commandSchema.parse(input)),
  );
  handle("image:choose", async (input) => {
    const identity =
      z.literal("identity").optional().parse(input) === "identity";
    service.snapshot();
    const selected = await imageDialogs.choose({
      title: identity
        ? "Private Identitätsreferenz importieren"
        : "PNG/WebP importieren",
      properties: ["openFile"],
      filters: [
        {
          name: "Portrait",
          extensions: identity
            ? ["png", "jpg", "jpeg", "webp"]
            : ["png", "webp"],
        },
      ],
    });
    if (!selected) return null;
    const file = selected[0];
    return (
      identity
        ? service.stageIdentity.bind(service)
        : service.stage.bind(service)
    )(
      await readLimited(file, identity ? 16 * 1024 * 1024 : MAX_IMAGE_BYTES),
      path.basename(file),
    );
  });
  handle("image:stage", (input) => {
    const data = z
      .object({
        bytes: z
          .instanceof(Uint8Array)
          .refine((b) => b.length > 0 && b.length <= MAX_IMAGE_BYTES),
        name: z.string().min(1).max(255),
        purpose: z.literal("identity").optional(),
      })
      .strict()
      .parse(input);
    return data.purpose === "identity"
      ? service.stageIdentity(data.bytes, data.name)
      : service.stage(data.bytes, data.name);
  });
  handle("image:discard", (input) => {
    service.discard(idSchema.parse(input));
    return null;
  });
  handle("image:preview", (input) => service.preview(idSchema.parse(input)));
}
function createWindow() {
  window = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 960,
    minHeight: 640,
    backgroundColor: "#141820",
    title: "Laceframe",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      navigateOnDragDrop: false,
    },
  });
  window.setMenuBarVisibility(false);
  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  window.webContents.on("will-navigate", (event) => {
    // Vite can navigate to its own entry URL while preparing dependencies.
    if (!MAIN_WINDOW_VITE_DEV_SERVER_URL || event.url !== rendererURL())
      event.preventDefault();
  });
  window.webContents.on("will-redirect", (event) => event.preventDefault());
  void window.loadURL(rendererURL());
}
if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on("second-instance", () => {
    if (window && !window.isDestroyed()) {
      window.restore();
      window.focus();
    }
  });
  void app.whenReady().then(() => {
    session.defaultSession.setPermissionRequestHandler(
      (_webContents, _permission, callback) => callback(false),
    );
    session.defaultSession.setPermissionCheckHandler(() => false);
    protocol.handle("laceframe", async (request) => {
      const url = new URL(request.url);
      if (
        request.method !== "GET" ||
        url.host !== "app" ||
        url.search ||
        !/^\/(index\.html|assets\/[a-zA-Z0-9_.-]+)$/.test(url.pathname)
      )
        return new Response("Forbidden", { status: 403 });
      const file = path.join(
        __dirname,
        `../renderer/${MAIN_WINDOW_VITE_NAME}`,
        url.pathname.slice(1),
      );
      const response = await net.fetch(pathToFileURL(file).href);
      const headers = new Headers(response.headers);
      headers.set(
        "Content-Security-Policy",
        "default-src 'none'; script-src 'self'; worker-src 'self'; style-src 'self' 'unsafe-inline'; img-src data:; font-src 'self'; connect-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'; object-src 'none'",
      );
      return new Response(response.body, { status: response.status, headers });
    });
    registerIPC();
    createWindow();
    app.on("activate", () => {
      if (!BrowserWindow.getAllWindows().length) createWindow();
    });
  });
  let shuttingDown = false;
  app.on("before-quit", (event) => {
    if (!shuttingDown) {
      event.preventDefault();
      shuttingDown = true;
      void generation.close().finally(() => app.quit());
    }
  });
  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
  });
}
