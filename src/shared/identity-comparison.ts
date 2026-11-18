import { tr } from "./locales/index";
export type Region = { x: number; y: number; width: number; height: number };
export type IdentityView = {
  zoom: number | "fit";
  center?: { x: number; y: number };
};
export const fullRegion = (image: {
  width: number;
  height: number;
}): Region => ({ x: 0, y: 0, width: image.width, height: image.height });
export function fitScale(
  region: Region,
  viewport: { width: number; height: number },
) {
  return Math.max(
    0.001,
    Math.min(
      16,
      Math.min(
        Math.max(1, viewport.width - 16) / region.width,
        Math.max(1, viewport.height - 16) / region.height,
      ),
    ),
  );
}
export function identityTransform(
  region: Region,
  viewport: { width: number; height: number },
  view: IdentityView,
) {
  const scale =
    view.zoom === "fit" ? fitScale(region, viewport) : view.zoom / 100;
  const center = view.center ?? {
    x: region.x + region.width / 2,
    y: region.y + region.height / 2,
  };
  return {
    scale,
    center,
    x: viewport.width / 2 - center.x * scale,
    y: viewport.height / 2 - center.y * scale,
  };
}
export function zoomAt(
  region: Region,
  viewport: { width: number; height: number },
  view: IdentityView,
  percent: number,
  point = { x: viewport.width / 2, y: viewport.height / 2 },
): IdentityView {
  const old = identityTransform(region, viewport, view),
    scale = Math.min(16, Math.max(0.001, percent / 100));
  return {
    zoom: scale * 100,
    center: {
      x: (point.x - old.x) / old.scale - (point.x - viewport.width / 2) / scale,
      y:
        (point.y - old.y) / old.scale - (point.y - viewport.height / 2) / scale,
    },
  };
}
export function linkedIdentityView(
  view: IdentityView,
  region: Region,
  viewport: { width: number; height: number },
  other: Region,
  otherViewport: { width: number; height: number },
): IdentityView {
  if (view.zoom === "fit") return { zoom: "fit" };
  const transform = identityTransform(region, viewport, view);
  return {
    zoom: Math.min(
      1600,
      Math.max(
        0.1,
        (transform.scale / fitScale(region, viewport)) *
          fitScale(other, otherViewport) *
          100,
      ),
    ),
    center: {
      x:
        other.x +
        ((transform.center.x - region.x) / region.width) * other.width,
      y:
        other.y +
        ((transform.center.y - region.y) / region.height) * other.height,
    },
  };
}
/** 8-connected alpha components, not semantic figure recognition. No source pixel is changed. */
export function visibleRegion(
  width: number,
  height: number,
  rgba: Uint8Array | Uint8ClampedArray,
) {
  const count = width * height;
  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width < 1 ||
    height < 1 ||
    count > 16_000_000 ||
    rgba.length !== count * 4
  )
    throw new Error(tr("common.mb6953380c2"));
  const whole = fullRegion({ width, height });
  let visible = 0,
    opaque = 0;
  for (let i = 3; i < rgba.length; i += 4) {
    if (rgba[i] >= 8) visible++;
    if (rgba[i] === 255) opaque++;
  }
  if (!visible) return { region: whole, status: "empty" as const, ignored: 0 };
  if (opaque === count)
    return { region: whole, status: "opaque" as const, ignored: 0 };
  const seen = new Uint8Array(count),
    queue = new Uint32Array(count);
  let largest = 0,
    minX = width,
    minY = height,
    maxX = -1,
    maxY = -1,
    retained = 0;
  for (let pass = 0; pass < 2; pass++) {
    seen.fill(0);
    for (let seed = 0; seed < count; seed++) {
      if (seen[seed] || rgba[seed * 4 + 3] < 8) continue;
      let head = 0,
        tail = 1,
        left = width,
        top = height,
        right = -1,
        bottom = -1;
      queue[0] = seed;
      seen[seed] = 1;
      while (head < tail) {
        const i = queue[head++],
          x = i % width,
          y = Math.floor(i / width);
        left = Math.min(left, x);
        right = Math.max(right, x);
        top = Math.min(top, y);
        bottom = Math.max(bottom, y);
        for (
          let yy = Math.max(0, y - 1);
          yy <= Math.min(height - 1, y + 1);
          yy++
        )
          for (
            let xx = Math.max(0, x - 1);
            xx <= Math.min(width - 1, x + 1);
            xx++
          ) {
            const next = yy * width + xx;
            if (!seen[next] && rgba[next * 4 + 3] >= 8) {
              seen[next] = 1;
              queue[tail++] = next;
            }
          }
      }
      if (!pass) largest = Math.max(largest, tail);
      else if (tail >= Math.max(2, Math.ceil(largest * 0.001))) {
        minX = Math.min(minX, left);
        minY = Math.min(minY, top);
        maxX = Math.max(maxX, right);
        maxY = Math.max(maxY, bottom);
        retained += tail;
      }
    }
  }
  // A wholly sparse image has no reliable silhouette: show its entire canvas.
  if (maxX < minX)
    return { region: whole, status: "sparse" as const, ignored: 0 };
  const padding = Math.max(
    2,
    Math.ceil(Math.max(maxX - minX + 1, maxY - minY + 1) * 0.04),
  );
  const x = Math.max(0, minX - padding),
    y = Math.max(0, minY - padding);
  return {
    region: {
      x,
      y,
      width: Math.min(width, maxX + padding + 1) - x,
      height: Math.min(height, maxY + padding + 1) - y,
    },
    status: "bounded" as const,
    ignored: visible - retained,
  };
}
