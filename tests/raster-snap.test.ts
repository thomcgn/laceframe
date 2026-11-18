import { expect, it } from "vitest";
import {
  rasterPixels,
  visibleColors,
  type RasterSettings,
} from "../src/shared/raster-snap";
import {
  applyPixelEdit,
  pixelEditRecordSchema,
} from "../src/shared/pixel-snap";
import { encodePixels, decodePixels } from "../src/main/mask-composite";
const base: RasterSettings = {
  width: 8,
  height: 6,
  sampling: "dominant",
  offsetX: 0,
  offsetY: 0,
  alpha: "preserve",
};
function fixture(width = 32, height = 24) {
  const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++)
      data.set(
        [
          (Math.floor(x / 4) % 2) * 180,
          Math.floor(y / 4) * 30,
          90,
          x < 4 ? 0 : y < 4 ? 90 : 255,
        ],
        (y * width + x) * 4,
      );
  return { width, height, data };
}
it.each([16, 32, 64, 7, undefined])(
  "produces exact target dimensions, palette bound %s and identical PNG RGBA",
  (colors) => {
    const source = fixture(1254, 1254),
      original = new Uint8Array(source.data);
    const out = rasterPixels(source, {
      ...base,
      width: 64,
      height: 64,
      colors,
    });
    expect([out.width, out.height]).toEqual([64, 64]);
    expect(new Uint8Array(decodePixels(encodePixels(out)).data)).toEqual(
      out.data,
    );
    if (colors) expect(visibleColors(out)).toBeLessThanOrEqual(colors);
    expect(source.data).toEqual(original);
  },
);
it("clean upscaled art reconstructs exact native pixels; center and dominant never interpolate", () => {
  const source = fixture();
  for (const sampling of ["dominant", "nearest"] as const) {
    const out = rasterPixels(source, { ...base, sampling });
    for (let y = 0; y < 6; y++)
      for (let x = 0; x < 8; x++)
        expect(out.data.slice((y * 8 + x) * 4, (y * 8 + x + 1) * 4)).toEqual(
          source.data.slice(
            ((y * 4 + 2) * 32 + x * 4 + 2) * 4,
            ((y * 4 + 2) * 32 + x * 4 + 2) * 4 + 4,
          ),
        );
    const enlarged = rasterPixels({ ...out }, { ...base });
    expect(enlarged.data).toEqual(out.data);
  }
});
it("majority removes an isolated AA fragment; center sampling preserves a deliberately small detail", () => {
  const source = fixture();
  source.data.set([17, 18, 19, 255], (6 * 32 + 6) * 4);
  const majority = rasterPixels(source, base),
    center = rasterPixels(source, { ...base, sampling: "nearest" });
  expect([...majority.data.slice(36, 40)]).toEqual([180, 30, 90, 255]);
  expect([...center.data.slice(36, 40)]).toEqual([17, 18, 19, 255]);
});
it("sampling offsets change phase deterministically without averaging", () => {
  const source = fixture();
  const left = rasterPixels(source, {
    ...base,
    sampling: "nearest",
    offsetX: -0.5,
  });
  const right = rasterPixels(source, {
    ...base,
    sampling: "nearest",
    offsetX: 0.5,
  });
  expect(left.data).not.toEqual(right.data);
  expect(
    rasterPixels(source, { ...base, sampling: "nearest", offsetX: 0.5 }).data,
  ).toEqual(right.data);
});
it("preserves selected alpha and hidden RGB; hard alpha is explicit, palette never adds a matte", () => {
  const source = fixture(),
    plain = rasterPixels(source, base),
    quantized = rasterPixels(source, { ...base, colors: 4 });
  for (let i = 0; i < plain.data.length; i += 4) {
    expect(quantized.data[i + 3]).toBe(plain.data[i + 3]);
    if (!plain.data[i + 3])
      expect(quantized.data.slice(i, i + 4)).toEqual(
        plain.data.slice(i, i + 4),
      );
  }
  const hard = rasterPixels(source, { ...base, alpha: "binary" });
  expect(
    [...hard.data]
      .filter((_, i) => i % 4 === 3)
      .every((a) => a === 0 || a === 255),
  ).toBe(true);
});
it("uses the independent original palette mapper without changing target geometry", () => {
  const out = rasterPixels(fixture(), {
    ...base,
    colors: 2,
    palette: ["#102030", "#e0d0b0"],
  });
  expect([out.width, out.height]).toEqual([8, 6]);
  for (let i = 0; i < out.data.length; i += 4)
    if (out.data[i + 3])
      expect(["16,32,48", "224,208,176"]).toContain(
        [...out.data.slice(i, i + 3)].join(","),
      );
});
it("rejects invalid geometry, work, palette and protected inputs", () => {
  const source = fixture();
  for (const patch of [
    { width: 0 },
    { height: 100 },
    { width: 4096, height: 4096 },
    { colors: 0 },
    { offsetX: NaN },
    { palette: ["red"] },
    { colors: 1, palette: ["#123456", "#ffffff"] },
  ])
    expect(() => rasterPixels(source, { ...base, ...patch })).toThrow();
  const protection = new Uint8Array(32 * 24);
  protection[0] = 255;
  expect(() =>
    applyPixelEdit(source, { kind: "raster", settings: base }, protection),
  ).toThrow("Schutzmasken");
  expect(
    pixelEditRecordSchema.safeParse({
      algorithm: "spritefusion-original-wasm-v1",
      edit: { kind: "raster", settings: base },
    }).success,
  ).toBe(false);
});

// Optional explicitly authorized, read-only portrait acceptance. Outputs stay outside git.
if (process.env.RASTER_PORTRAIT && process.env.RASTER_OUTPUT) {
  it("compares a real authorized portrait at 64/128/256 pixels without changing its source", async () => {
    const fs = await import("node:fs/promises"),
      path = await import("node:path"),
      { createHash } = await import("node:crypto");
    const input = await fs.readFile(process.env.RASTER_PORTRAIT!),
      source = decodePixels(input);
    const hash = (b: Uint8Array) =>
      createHash("sha256").update(b).digest("hex");
    const evidence = [];
    for (const width of [64, 128, 256])
      for (const sampling of ["dominant", "nearest"] as const) {
        const start = performance.now();
        const out = rasterPixels(source, {
          ...base,
          width,
          height: Math.round((width * source.height) / source.width),
          sampling,
          colors: 32,
          alpha: "binary",
        });
        const png = encodePixels(out),
          decoded = decodePixels(png);
        expect(new Uint8Array(decoded.data)).toEqual(out.data);
        expect(visibleColors(out)).toBeLessThanOrEqual(32);
        await fs.writeFile(
          path.join(process.env.RASTER_OUTPUT!, `${sampling}-${width}.png`),
          png,
          { flag: "wx" },
        );
        evidence.push({
          width: out.width,
          height: out.height,
          sampling,
          colors: visibleColors(out),
          durationMs: Math.round(performance.now() - start),
          pixelSha256: hash(out.data),
        });
      }
    expect(await fs.readFile(process.env.RASTER_PORTRAIT!)).toEqual(input);
    await fs.writeFile(
      path.join(process.env.RASTER_OUTPUT!, "evidence.json"),
      JSON.stringify(
        {
          sourceSha256: hash(input),
          sourceDimensions: [source.width, source.height],
          results: evidence,
        },
        null,
        2,
      ),
      { flag: "wx" },
    );
  });
}

it("supports exact asymmetric dimensions independently of colors and validates raw source shape", () => {
  const source = fixture();
  const out = rasterPixels(source, {
    ...base,
    width: 13,
    height: 7,
    colors: 16,
  });
  expect([out.width, out.height]).toEqual([13, 7]);
  expect(visibleColors(out)).toBeLessThanOrEqual(16);
  expect(() =>
    rasterPixels({ ...source, data: new Uint8Array(3) }, base),
  ).toThrow();
});
