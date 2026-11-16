import { BrowserWindow, nativeImage } from "electron";

/** Validate pixels locally; never transform or replace the imported bytes. */
export async function decodeImage(
  bytes: Uint8Array,
  width: number,
  height: number,
  format: "png" | "webp",
): Promise<void> {
  if (format === "png") {
    const image = nativeImage.createFromBuffer(Buffer.from(bytes));
    const size = image.getSize();
    if (image.isEmpty() || size.width !== width || size.height !== height)
      throw new Error("Das PNG kann nicht vollständig dekodiert werden.");
    return;
  }
  // nativeImage only supports PNG/JPEG buffers on Linux. Use Chromium's built-in
  // WebP decoder in a temporary sandbox with no preload, Node, files or network.
  const decoder = new BrowserWindow({
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
  });
  decoder.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  decoder.webContents.on("will-navigate", (event) => event.preventDefault());
  const timeout = setTimeout(() => {
    if (!decoder.isDestroyed()) decoder.destroy();
  }, 15000);
  try {
    const html = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; base-uri 'none'; form-action 'none'">`;
    await decoder.loadURL(`data:text/html,${encodeURIComponent(html)}`);
    const encoded = JSON.stringify(Buffer.from(bytes).toString("base64"));
    const size: { width: number; height: number } = await decoder.webContents
      .executeJavaScript(`(async () => {
      const binary = atob(${encoded});
      const bytes = Uint8Array.from(binary, char => char.charCodeAt(0));
      const image = await createImageBitmap(new Blob([bytes], { type: 'image/webp' }));
      const size = { width: image.width, height: image.height };
      image.close(); return size;
    })()`);
    if (size.width !== width || size.height !== height)
      throw new Error("WebP-Abmessungen stimmen nicht überein.");
  } catch (cause) {
    throw new Error("Das WebP kann nicht vollständig dekodiert werden.", {
      cause,
    });
  } finally {
    clearTimeout(timeout);
    if (!decoder.isDestroyed()) decoder.destroy();
  }
}
