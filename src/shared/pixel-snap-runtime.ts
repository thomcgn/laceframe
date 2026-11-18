import { tr } from "./locales/index";
import { SNAP_WASM_BASE64 } from "./pixel-snap-wasm";
import type { ColorPixels } from "./color-consistency";
type Native = {
  quantize_rgba_to_palette: (
    p: number,
    n: number,
    c: number,
    cn: number,
    out: number,
  ) => number;
  memory: WebAssembly.Memory;
  allocate: (n: number) => number;
  release: (p: number, n: number) => void;
  analyze_rgba: (p: number, n: number, w: number, h: number) => number;
  clean_rgba: (
    p: number,
    n: number,
    m: number,
    mn: number,
    w: number,
    h: number,
    g: number,
    strong: number,
    out: number,
    stats: number,
  ) => number;
};
let native: Native | undefined;
function runtime() {
  if (!native) {
    const bytes = Uint8Array.from(atob(SNAP_WASM_BASE64), (c) =>
      c.charCodeAt(0),
    );
    const module = new WebAssembly.Module(bytes);
    if (WebAssembly.Module.imports(module).length)
      throw new Error(tr("editing.m8a78bee335"));
    native = new WebAssembly.Instance(module).exports as unknown as Native;
  }
  return native;
}
/** Owned bounded buffers; refreshed views after memory growth. Same WASM in Main and worker. */
export function withRaster<T>(
  p: ColorPixels,
  fn: (r: Native, ptr: number, allocate: (n: number) => number) => T,
): T {
  const r = runtime(),
    owned: { ptr: number; size: number }[] = [];
  const allocate = (size: number) => {
    const ptr = r.allocate(size);
    if (!ptr) throw new Error(tr("editing.m68b5be57fb"));
    owned.push({ ptr, size });
    return ptr;
  };
  try {
    const ptr = allocate(p.data.length);
    new Uint8Array(r.memory.buffer, ptr, p.data.length).set(p.data);
    return fn(r, ptr, allocate);
  } finally {
    for (const a of owned.reverse()) r.release(a.ptr, a.size);
  }
}
export function rasterGrid(p: ColorPixels) {
  return withRaster(
    p,
    (r, ptr) =>
      r.analyze_rgba(ptr, p.data.length, p.width, p.height) || undefined,
  );
}
export function rasterClean(
  p: ColorPixels,
  mask: Uint8Array,
  grid: number,
  strong: boolean,
) {
  return withRaster(p, (r, ptr, allocate) => {
    const mp = allocate(mask.length),
      out = allocate(p.data.length),
      stats = allocate(8);
    new Uint8Array(r.memory.buffer, mp, mask.length).set(mask);
    if (
      !r.clean_rgba(
        ptr,
        p.data.length,
        mp,
        mask.length,
        p.width,
        p.height,
        grid,
        Number(strong),
        out,
        stats,
      )
    )
      throw new Error(tr("editing.mc9c9b1693f"));
    const counts = new Uint32Array(r.memory.buffer, stats, 2);
    return {
      width: p.width,
      height: p.height,
      data: new Uint8Array(new Uint8Array(r.memory.buffer, out, p.data.length)),
      changed: counts[0],
      ambiguous: counts[1],
    };
  });
}

/** Separate explicit upstream palette operation, not used by Laceframe Pixel Snap. */
export function quantizeToPalette(p: ColorPixels, colors: Uint8Array) {
  if (
    p.data.length > 4_194_304 * 4 ||
    p.data.length !== p.width * p.height * 4 ||
    !colors.length ||
    colors.length > 768 ||
    colors.length % 3
  )
    throw new Error(tr("editing.m1ebc792ffd"));
  return withRaster(p, (r, ptr, allocate) => {
    const palette = allocate(colors.length),
      out = allocate(p.data.length);
    new Uint8Array(r.memory.buffer, palette, colors.length).set(colors);
    if (
      !r.quantize_rgba_to_palette(
        ptr,
        p.data.length,
        palette,
        colors.length,
        out,
      )
    )
      throw new Error(tr("editing.md8c1b38340"));
    return {
      width: p.width,
      height: p.height,
      data: new Uint8Array(new Uint8Array(r.memory.buffer, out, p.data.length)),
    };
  });
}
