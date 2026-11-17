import { MAX_MASK_PIXELS } from "../../shared/masking";
export type PreviewSource = {
  width: number;
  height: number;
  data: Uint8Array | Uint8ClampedArray;
};
/** Straight original RGBA; backgrounds and overlays never enter canonical/export pixels. */
export function cutoutFrame(
  source: PreviewSource,
  retention: Uint8Array,
  view: string,
) {
  const count = source.width * source.height;
  if (
    !Number.isInteger(count) ||
    source.width < 1 ||
    source.height < 1 ||
    count > MAX_MASK_PIXELS ||
    source.data.length !== count * 4 ||
    retention.length !== count
  )
    throw new Error("Bildquelle oder Pixelmaske hat ungültige Abmessungen.");
  const data = new Uint8ClampedArray(source.data);
  for (let i = 0; i < count; i++) {
    const k = i * 4;
    if (view !== "original")
      data[k + 3] = Math.round((source.data[k + 3] * retention[i]) / 255);
    if (view === "alpha") {
      data[k] = data[k + 1] = data[k + 2] = data[k + 3];
      data[k + 3] = 255;
    }
  }
  return data;
}
