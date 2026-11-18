import { tr } from "../shared/locales/index";
import { BrowserWindow, nativeImage } from "electron";

/** Validate pixels locally; never transform or replace the imported bytes. */
export async function decodeImage(
  bytes: Uint8Array,
  width: number,
  height: number,
  format: "png" | "webp" | "jpg",
): Promise<void> {
  if (format === "png" || format === "jpg") {
    const image = nativeImage.createFromBuffer(Buffer.from(bytes));
    const size = image.getSize();
    if (
      image.isEmpty() ||
      !(
        (size.width === width && size.height === height) ||
        (format === "jpg" && size.width === height && size.height === width)
      )
    )
      throw new Error(tr("errors.m2fab06a474"));
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
      throw new Error(tr("errors.m91c73d6775"));
  } catch (cause) {
    throw new Error(tr("errors.m076d642edc"), {
      cause,
    });
  } finally {
    clearTimeout(timeout);
    if (!decoder.isDestroyed()) decoder.destroy();
  }
}

/** PNG keeps exact hidden RGB; WebP uses Chromium's decoded RGBA, never changes source bytes. */
export async function decodeAssetPixels(bytes: Uint8Array) {
  const { decodePixels } = await import("./mask-composite");
  const { imageSize } = await import("image-size");
  const info = imageSize(bytes);
  if (!info.width || !info.height || info.width * info.height > 16_000_000)
    throw new Error(tr("errors.mf20fc17c90"));
  if (info.type === "png") return decodePixels(bytes);
  if (info.type !== "webp") throw new Error(tr("errors.m7d50e46fe5"));
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
  decoder.webContents.on("will-navigate", (e) => e.preventDefault());
  const timeout = setTimeout(() => {
    if (!decoder.isDestroyed()) decoder.destroy();
  }, 15000);
  try {
    await decoder.loadURL(
      "data:text/html," +
        encodeURIComponent(
          "<meta http-equiv=\"Content-Security-Policy\" content=\"default-src 'none'; base-uri 'none'; form-action 'none'\">",
        ),
    );
    const data: Uint8Array = await decoder.webContents.executeJavaScript(
      `(async()=>{const b=Uint8Array.from(atob(${JSON.stringify(Buffer.from(bytes).toString("base64"))}),c=>c.charCodeAt(0));const img=await createImageBitmap(new Blob([b],{type:'image/webp'}));const c=new OffscreenCanvas(img.width,img.height);const ctx=c.getContext('2d');ctx.drawImage(img,0,0);img.close();return new Uint8Array(ctx.getImageData(0,0,c.width,c.height).data);})()`,
    );
    if (data.length !== info.width * info.height * 4)
      throw new Error(tr("errors.md965aa9a1a"));
    return {
      width: info.width,
      height: info.height,
      data: new Uint8Array(data),
    };
  } finally {
    clearTimeout(timeout);
    if (!decoder.isDestroyed()) decoder.destroy();
  }
}
