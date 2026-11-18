import { tr } from "./locales/index";
import {
  initSync,
  process_rgba,
  decode_png,
  quantize_rgba,
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
  if (poisoned) throw new Error(tr("common.m07f2427e28"));
  const count = p.width * p.height;
  if (
    p.width < 2 ||
    p.height < 2 ||
    count > 4_194_304 ||
    p.data.length !== count * 4 ||
    count * s.colors > 67_108_864
  )
    throw new Error(tr("common.m5f80be6cad"));
  if (
    s.pixelSize !== undefined &&
    s.pixelSize > Math.min(p.width, p.height) / 2
  )
    throw new Error(tr("common.m635d965b99"));
  ensureSpriteFusion();
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
      throw new Error(tr("common.m84a06c2f78"));
    const view = new DataView(png.buffer, png.byteOffset, png.byteLength),
      width = view.getUint32(16),
      height = view.getUint32(20);
    if (!width || !height || width * height > 4_194_304)
      throw new Error(tr("common.m76cccac895"));
    const data = decode_png(png);
    if (data.length !== width * height * 4)
      throw new Error(tr("common.m6dae756c98"));
    return { width, height, data, png };
  } catch (error) {
    // A trapped instance is not reused; normal validation errors allow another explicit request.
    if (error instanceof WebAssembly.RuntimeError) poisoned = true;
    throw new Error(tr("common.m441e33731b", { v0: String(error) }), {
      cause: error,
    });
  }
}

function ensureSpriteFusion() {
  if (!ready) {
    initSync({
      module: Uint8Array.from(atob(SPRITEFUSION_WASM_BASE64), (c) =>
        c.charCodeAt(0),
      ),
    });
    ready = true;
  }
}
export function spriteFusionQuantize(
  p: ColorPixels,
  colors: number,
  palette?: string[],
): ColorPixels {
  if (poisoned || p.width * p.height * colors > 67_108_864)
    throw new Error(tr("common.m5f80be6cad"));
  ensureSpriteFusion();
  try {
    const data = quantize_rgba(
      p.data,
      p.width,
      p.height,
      colors,
      palette?.map((c) => c.slice(1)).join(","),
    );
    return { width: p.width, height: p.height, data };
  } catch (error) {
    if (error instanceof WebAssembly.RuntimeError) poisoned = true;
    throw error;
  }
}
