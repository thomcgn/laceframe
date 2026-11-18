import { tr } from "./locales/index";
import { z } from "zod";
export const MAX_POLYGON_POINTS = 128;
export const POLYGON_VERSION = "pixel-center-even-odd-v1" as const;
type Point = { x: number; y: number };
const cross = (a: Point, b: Point, c: Point) =>
  (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
function intersects(a: Point, b: Point, c: Point, d: Point) {
  const on = (p: Point, q: Point, r: Point) =>
    cross(p, q, r) === 0 &&
    r.x >= Math.min(p.x, q.x) &&
    r.x <= Math.max(p.x, q.x) &&
    r.y >= Math.min(p.y, q.y) &&
    r.y <= Math.max(p.y, q.y);
  return (
    on(a, b, c) ||
    on(a, b, d) ||
    on(c, d, a) ||
    on(c, d, b) ||
    (Math.sign(cross(a, b, c)) !== Math.sign(cross(a, b, d)) &&
      Math.sign(cross(c, d, a)) !== Math.sign(cross(c, d, b)))
  );
}
export function simplePolygon(points: Point[]) {
  const n = points.length;
  if (n < 3 || n > MAX_POLYGON_POINTS) return false;
  for (let i = 0; i < n; i++) {
    // Reject duplicate, flat and backtracking corners explicitly.
    if (!cross(points[(i + n - 1) % n], points[i], points[(i + 1) % n]))
      return false;
    for (let j = i + 1; j < n; j++) {
      if (j === i + 1 || (i === 0 && j === n - 1)) continue;
      if (
        intersects(
          points[i],
          points[(i + 1) % n],
          points[j],
          points[(j + 1) % n],
        )
      )
        return false;
    }
  }
  return true;
}
export const polygonOperationSchema = z
  .object({
    algorithm: z.literal(POLYGON_VERSION),
    operation: z.enum(["protect", "force", "limit"]),
    points: z
      .array(
        z
          .object({
            x: z.number().int().min(0).max(4_194_304),
            y: z.number().int().min(0).max(4_194_304),
          })
          .strict(),
      )
      .min(3)
      .max(MAX_POLYGON_POINTS)
      .refine(simplePolygon, tr("common.m8fa5eda4b2")),
  })
  .strict();
export type PolygonOperation = z.infer<typeof polygonOperationSchema>;
export function validatePolygonBounds(
  points: Point[],
  width: number,
  height: number,
) {
  if (points.some((p) => p.x > width || p.y > height))
    throw new Error(tr("editing.m70de91dc38"));
}
// Scanline parity at (x+.5,y+.5). Half-open edge Y range, left inclusive/right
// exclusive X interval. No antialiasing; winding-independent, concave supported.
export function rasterizePolygon(
  input: PolygonOperation,
  width: number,
  height: number,
) {
  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width < 1 ||
    height < 1 ||
    width * height > 4_194_304
  )
    throw new Error(tr("editing.med228eb6cd"));
  const { points } = polygonOperationSchema.parse(input);
  validatePolygonBounds(points, width, height);
  const out = new Uint8Array(width * height);
  const low = Math.max(0, Math.min(...points.map((p) => p.y))),
    high = Math.min(height, Math.max(...points.map((p) => p.y)));
  for (let y = low; y < high; y++) {
    const scan = y + 0.5,
      xs: number[] = [];
    for (let i = 0; i < points.length; i++) {
      const a = points[i],
        b = points[(i + 1) % points.length];
      if ((a.y <= scan && scan < b.y) || (b.y <= scan && scan < a.y))
        xs.push(a.x + ((scan - a.y) * (b.x - a.x)) / (b.y - a.y));
    }
    xs.sort((a, b) => a - b);
    for (let i = 0; i < xs.length; i += 2)
      out.fill(
        255,
        y * width + Math.max(0, Math.ceil(xs[i] - 0.5)),
        y * width + Math.min(width, Math.ceil(xs[i + 1] - 0.5)),
      );
  }
  return out;
}
