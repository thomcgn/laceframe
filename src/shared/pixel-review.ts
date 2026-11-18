import type { ColorPixels } from "./color-consistency";
export function pixelReview(source: ColorPixels, output: ColorPixels) {
  const alpha = (p: ColorPixels) => {
    if (
      p.data.length !== p.width * p.height * 4 ||
      p.width * p.height > 4_194_304
    )
      throw new Error("Ungültige Vergleichsmaße.");
    let transparent = 0,
      partial = 0;
    for (let i = 3; i < p.data.length; i += 4) {
      if (p.data[i] === 0) transparent++;
      else if (p.data[i] < 255) partial++;
    }
    return { transparent, partial };
  };
  const before = alpha(source),
    after = alpha(output),
    sameDimensions =
      source.width === output.width && source.height === output.height;
  let changedPixels: number | undefined,
    alphaChanged: number | undefined,
    difference: ColorPixels | undefined;
  if (sameDimensions) {
    changedPixels = 0;
    alphaChanged = 0;
    const data = new Uint8Array(output.data.length);
    for (let i = 0; i < data.length; i += 4) {
      if (
        source.data.subarray(i, i + 4).some((v, c) => v !== output.data[i + c])
      )
        changedPixels++;
      const a = Math.abs(source.data[i + 3] - output.data[i + 3]);
      if (a) alphaChanged++;
      data.set(
        [
          Math.max(a, Math.abs(source.data[i] - output.data[i])),
          Math.abs(source.data[i + 1] - output.data[i + 1]),
          Math.abs(source.data[i + 2] - output.data[i + 2]),
          255,
        ],
        i,
      );
    }
    difference = { width: output.width, height: output.height, data };
  }
  return {
    before,
    after,
    sameDimensions,
    changedPixels,
    alphaChanged,
    difference,
  };
}
export type PixelReview = ReturnType<typeof pixelReview>;
