import { describe, expect, it } from "vitest";
import {
  fullRegion,
  fitScale,
  identityTransform,
  zoomAt,
  linkedIdentityView,
  visibleRegion,
} from "../src/shared/identity-comparison";
function pixels(
  w: number,
  h: number,
  rect?: { x: number; y: number; width: number; height: number },
  alpha = 255,
) {
  const data = new Uint8Array(w * h * 4);
  if (rect)
    for (let y = rect.y; y < rect.y + rect.height; y++)
      for (let x = rect.x; x < rect.x + rect.width; x++)
        data[(y * w + x) * 4 + 3] = alpha;
  return data;
}
describe("identity view geometry", () => {
  it("fits distinct sizes/aspects independently without distortion", () => {
    const a = fullRegion({ width: 3024, height: 4032 }),
      b = fullRegion({ width: 1254, height: 1254 }),
      viewport = { width: 460, height: 480 };
    const av = identityTransform(a, viewport, { zoom: "fit" }),
      bv = identityTransform(b, viewport, { zoom: "fit" });
    expect(av.scale).not.toBe(bv.scale);
    expect(a.height * av.scale).toBeCloseTo(464);
    expect(b.width * bv.scale).toBeCloseTo(444);
    expect(av.x + (a.width * av.scale) / 2).toBeCloseTo(230);
    expect(bv.y + (b.height * bv.scale) / 2).toBeCloseTo(240);
  });
  it("keeps the cursor's source pixel fixed across zoom and HiDPI CSS coordinates", () => {
    const region = { x: 100, y: 60, width: 500, height: 600 },
      vp = { width: 500, height: 400 },
      point = { x: 150.5, y: 91.25 },
      old = { zoom: "fit" as const };
    const a = identityTransform(region, vp, old),
      next = zoomAt(region, vp, old, 200, point),
      b = identityTransform(region, vp, next);
    expect((point.x - a.x) / a.scale).toBeCloseTo((point.x - b.x) / b.scale, 8);
    expect((point.y - a.y) / a.scale).toBeCloseTo((point.y - b.y) / b.scale, 8);
    // CSS geometry intentionally does not multiply by devicePixelRatio.
    expect(b.scale).toBe(2);
  });
  it("retains focus on resize, supports exact zoom presets, and links relative fit rather than raw dimensions", () => {
    const src = fullRegion({ width: 3024, height: 4032 }),
      dst = { x: 400, y: 200, width: 500, height: 900 },
      vp = { width: 480, height: 450 };
    for (const zoom of [100, 200, 400]) {
      const state = { zoom, center: { x: 900, y: 1800 } },
        a = identityTransform(src, vp, state),
        b = identityTransform(src, { width: 700, height: 600 }, state);
      expect(a.center).toEqual(b.center);
      expect(a.scale).toBe(zoom / 100);
    }
    const next = { zoom: fitScale(src, vp) * 200, center: { x: 756, y: 2016 } };
    const linked = linkedIdentityView(next, src, vp, dst, vp),
      transform = identityTransform(dst, vp, linked);
    expect(transform.scale / fitScale(dst, vp)).toBeCloseTo(2);
    expect(transform.center).toEqual({ x: 525, y: 650 });
    expect(linkedIdentityView({ zoom: "fit" }, src, vp, dst, vp)).toEqual({
      zoom: "fit",
    });
  });
});
describe("bounded alpha auto-fit", () => {
  it("includes partial edges and safety padding, ignores remote isolated pixels, leaves input immutable", () => {
    const data = pixels(100, 100, { x: 30, y: 15, width: 40, height: 70 }, 128);
    data[3] = 255;
    data[(99 * 100 + 99) * 4 + 3] = 255;
    const before = data.slice(),
      r = visibleRegion(100, 100, data);
    expect(r.status).toBe("bounded");
    expect(r.ignored).toBe(2);
    expect(r.region).toEqual({ x: 27, y: 12, width: 46, height: 76 });
    expect(data).toEqual(before);
  });
  it("keeps meaningful disconnected regions while suppressing tiny islands", () => {
    const data = pixels(100, 100, { x: 30, y: 20, width: 30, height: 60 });
    for (let y = 40; y < 50; y++)
      for (let x = 70; x < 75; x++) data[(y * 100 + x) * 4 + 3] = 255;
    data[3] = 255;
    expect(visibleRegion(100, 100, data).region.x).toBeGreaterThan(0);
    expect(visibleRegion(100, 100, data).region.width).toBeGreaterThan(45);
  });
  it("handles opaque, transparent, wholly sparse and sub-threshold noise", () => {
    expect(
      visibleRegion(
        10,
        20,
        pixels(10, 20, { x: 0, y: 0, width: 10, height: 20 }),
      ),
    ).toMatchObject({
      status: "opaque",
      region: { x: 0, y: 0, width: 10, height: 20 },
    });
    expect(visibleRegion(10, 20, pixels(10, 20))).toMatchObject({
      status: "empty",
      region: { x: 0, y: 0, width: 10, height: 20 },
    });
    const sparse = pixels(10, 20);
    sparse[3] = 8;
    expect(visibleRegion(10, 20, sparse).status).toBe("sparse");
    sparse[3] = 7;
    expect(visibleRegion(10, 20, sparse).status).toBe("empty");
  });
  it("handles a one-pixel-wide silhouette and rejects unbounded/malformed requests", () => {
    expect(
      visibleRegion(
        20,
        100,
        pixels(20, 100, { x: 10, y: 10, width: 1, height: 80 }),
      ).region,
    ).toEqual({ x: 6, y: 6, width: 9, height: 88 });
    expect(() => visibleRegion(4001, 4000, new Uint8Array())).toThrow(
      "16 Megapixel",
    );
    expect(() => visibleRegion(0, 10, new Uint8Array())).toThrow();
  });
  it("processes an actual 4MP transparent portrait with bounded typed scratch buffers", () => {
    const data = pixels(2000, 2000, {
        x: 600,
        y: 300,
        width: 800,
        height: 1400,
      }),
      start = performance.now();
    const r = visibleRegion(2000, 2000, data);
    expect(r.region).toEqual({ x: 544, y: 244, width: 912, height: 1512 });
    console.log(
      JSON.stringify({
        alphaFit4mpMs: Math.round(performance.now() - start),
        rgbaBytes: data.byteLength,
        scratchBytes: 2000 * 2000 * 5,
      }),
    );
  });
});
