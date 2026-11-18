import {
  initSync,
  process_rgba,
  decode_png,
} from "./spritefusion-generated/spritefusion.js";
import { SPRITEFUSION_WASM_BASE64 } from "./spritefusion-generated/wasm";
import type { ColorPixels } from "./color-consistency";
import type { SpriteFusionSettings } from "./pixel-snap";
let ready = false;
let poisoned = false;
/** Transport only: all detection, quantization, resampling and PNG encoding are upstream Rust. */
export function spriteFusionPixels(
  p: ColorPixels,
  s: SpriteFusionSettings,
): ColorPixels & { png: Uint8Array } {
  if (poisoned)
    throw new Error(
      "Sprite Fusion WASM wurde angehalten. Anwendung neu starten; kein Ergebnis gespeichert.",
    );
  const count = p.width * p.height;
  if (
    p.width < 2 ||
    p.height < 2 ||
    count > 4_194_304 ||
    p.data.length !== count * 4 ||
    count * s.colors > 67_108_864
  )
    throw new Error(
      "Sprite Fusion: maximal 4 MP und 67.108.864 Pixel×Farben. Weniger Farben oder eine kleinere separate Quelle wählen; keine automatische Skalierung.",
    );
  if (
    s.pixelSize !== undefined &&
    s.pixelSize > Math.min(p.width, p.height) / 2
  )
    throw new Error(
      "Rastergröße darf höchstens die Hälfte der kleineren Bildkante betragen.",
    );
  if (!ready) {
    initSync({
      module: Uint8Array.from(atob(SPRITEFUSION_WASM_BASE64), (c) =>
        c.charCodeAt(0),
      ),
    });
    ready = true;
  }
  try {
    const png = process_rgba(
      p.data,
      p.width,
      p.height,
      s.colors,
      s.pixelSize,
      s.palette?.map((c) => c.slice(1)).join(","),
    );
    if (
      png.length < 33 ||
      png.length > 32 * 1024 * 1024 ||
      png[0] !== 137 ||
      png[1] !== 80 ||
      png[2] !== 78 ||
      png[3] !== 71
    )
      throw new Error("Ungültiges Engine-PNG.");
    const view = new DataView(png.buffer, png.byteOffset, png.byteLength),
      width = view.getUint32(16),
      height = view.getUint32(20);
    if (!width || !height || width * height > 4_194_304)
      throw new Error("Ungültige Ausgabemaße.");
    const data = decode_png(png);
    if (data.length !== width * height * 4)
      throw new Error("Ungültige RGBA-Ausgabe.");
    return { width, height, data, png };
  } catch (error) {
    // A trapped instance is not reused; normal validation errors allow another explicit request.
    if (error instanceof WebAssembly.RuntimeError) poisoned = true;
    throw new Error(`Sprite Fusion fehlgeschlagen: ${String(error)}`, { cause: error });
  }
}
