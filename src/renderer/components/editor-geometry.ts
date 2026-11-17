import type { Point } from "../../shared/masking";
export type ViewSize = { width: number; height: number };
export function fitScale(view: ViewSize, image: ViewSize) {
  return Math.max(
    0.00001,
    Math.min(view.width / image.width, view.height / image.height),
  );
}
export function nativePoint(
  client: Point,
  rect: { left: number; top: number; width: number; height: number },
  image: ViewSize,
): Point {
  return {
    x: ((client.x - rect.left) * image.width) / rect.width,
    y: ((client.y - rect.top) * image.height) / rect.height,
  };
}
// Keep the image coordinate below anchor fixed as CSS-pixel scale changes.
export function anchoredPan(
  view: ViewSize,
  image: ViewSize,
  pan: Point,
  from: number,
  to: number,
  anchor: Point,
): Point {
  const left = (view.width - image.width * from) / 2 + pan.x,
    top = (view.height - image.height * from) / 2 + pan.y;
  return {
    x:
      anchor.x -
      ((anchor.x - left) / from) * to -
      (view.width - image.width * to) / 2,
    y:
      anchor.y -
      ((anchor.y - top) / from) * to -
      (view.height - image.height * to) / 2,
  };
}
export const brushTools = new Set([
  "paint",
  "erase",
  "protect",
  "protect-erase",
  "force",
  "force-erase",
]);
export function toolShortcut(key: string) {
  return (
    { b: "paint", e: "erase", i: "pick", h: "pan", l: "polygon" } as Record<
      string,
      string
    >
  )[key.toLowerCase()];
}
