import { describe, it, expect } from "vitest";
import {
  fitScale,
  nativePoint,
  anchoredPan,
  toolShortcut,
  brushTools,
} from "../src/renderer/components/editor-geometry";
const image = { width: 1254, height: 1254 };
describe("precision editor CSS/native geometry", () => {
  it("fits both axes, including a small desktop and a maximized portrait", () => {
    expect(fitScale({ width: 600, height: 500 }, image)).toBe(500 / 1254);
    expect(fitScale({ width: 1600, height: 900 }, image)).toBe(900 / 1254);
    expect(fitScale({ width: 0, height: 0 }, image)).toBeGreaterThan(0);
  });
  it("keeps continuous subpixel brush positions separate from integer seed/polygon sampling", () => {
    expect(
      nativePoint(
        { x: 150.25, y: 100.5 },
        { left: 100, top: 50, width: 627, height: 627 },
        image,
      ),
    ).toEqual({ x: 100.5, y: 101 });
    expect(
      nativePoint(
        { x: 20, y: 25 },
        { left: 100, top: 50, width: 627, height: 627 },
        image,
      ),
    ).toEqual({ x: -160, y: -50 });
  });
  it("keeps the anchored native pixel fixed through repeated zoom and pan", () => {
    const view = { width: 800, height: 600 },
      anchor = { x: 123, y: 457 };
    let pan = { x: 37, y: -22 },
      scale = 0.4;
    const at = (s: number, p: typeof pan) => ({
      x: (anchor.x - (view.width - image.width * s) / 2 - p.x) / s,
      y: (anchor.y - (view.height - image.height * s) / 2 - p.y) / s,
    });
    const start = at(scale, pan);
    for (const next of [0.8, 1, 2, 0.02, 0.4]) {
      pan = anchoredPan(view, image, pan, scale, next, anchor);
      scale = next;
      expect(at(scale, pan).x).toBeCloseTo(start.x, 9);
      expect(at(scale, pan).y).toBeCloseTo(start.y, 9);
    }
  });
  it("maps exact CSS 1:1 and resized continuous coordinates", () => {
    const css = { left: 50, top: 70, width: 1254, height: 1254 };
    expect(nativePoint({ x: 75, y: 101 }, css, image)).toEqual({
      x: 25,
      y: 31,
    });
    expect(
      nativePoint(
        { x: 150.25, y: 100.5 },
        { left: 100, top: 50, width: 313.5, height: 313.5 },
        image,
      ),
    ).toEqual({ x: 201, y: 202 });
  });
  it("maps conflict-free case-insensitive tools and distinguishes brush cursors", () => {
    expect(["b", "E", "i", "h", "L"].map(toolShortcut)).toEqual([
      "paint",
      "erase",
      "pick",
      "pan",
      "polygon",
    ]);
    expect(toolShortcut("z")).toBeUndefined();
    expect(brushTools.has("protect-erase")).toBe(true);
    expect(brushTools.has("polygon")).toBe(false);
  });
});
