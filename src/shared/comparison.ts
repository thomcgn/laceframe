export const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));
export function comparisonCanvas(
  master: { width: number; height: number },
  candidate?: { width: number; height: number },
) {
  return {
    width: Math.max(master.width, candidate?.width ?? 0),
    height: Math.max(master.height, candidate?.height ?? 0),
    mismatch: Boolean(
      candidate &&
        (master.width !== candidate.width ||
          master.height !== candidate.height),
    ),
  };
}
export function comparisonTransform(
  canvas: { width: number; height: number },
  viewport: { width: number; height: number },
  zoom: number | "fit",
  pan: { x: number; y: number },
) {
  const scale =
    zoom === "fit"
      ? Math.min(
          viewport.width / canvas.width,
          viewport.height / canvas.height,
          1,
        )
      : zoom / 100;
  return {
    scale,
    x: (viewport.width - canvas.width * scale) / 2 + pan.x,
    y: (viewport.height - canvas.height * scale) / 2 + pan.y,
  };
}
export function sliderPosition(clientX: number, left: number, width: number) {
  return clamp(((clientX - left) / Math.max(width, 1)) * 100, 0, 100);
}
export function sliderKey(value: number, key: string, shift = false) {
  if (key === "Home") return 0;
  if (key === "End") return 100;
  return clamp(
    value +
      (["ArrowLeft", "ArrowDown"].includes(key)
        ? -1
        : ["ArrowRight", "ArrowUp"].includes(key)
          ? 1
          : 0) *
        (shift ? 10 : 1),
    0,
    100,
  );
}
