import { it, expect } from "vitest";
import { pixelReview } from "../src/shared/pixel-review";
it("counts actual RGBA and alpha changes without modifying inputs", () => {
  const source = {
      width: 2,
      height: 1,
      data: new Uint8Array([10, 20, 30, 0, 40, 50, 60, 128]),
    },
    original = new Uint8Array(source.data);
  const review = pixelReview(source, {
    width: 2,
    height: 1,
    data: new Uint8Array([10, 20, 30, 0, 50, 50, 60, 255]),
  });
  expect(review.changedPixels).toBe(1);
  expect(review.alphaChanged).toBe(1);
  expect(review.before).toEqual({ transparent: 1, partial: 1 });
  expect(review.difference!.data).toEqual(
    new Uint8Array([0, 0, 0, 255, 127, 0, 0, 255]),
  );
  expect(source.data).toEqual(original);
});
it("never invents a pixel registration after geometry changes", () => {
  const r = pixelReview(
    { width: 2, height: 1, data: new Uint8Array(8) },
    { width: 1, height: 1, data: new Uint8Array(4) },
  );
  expect(r.sameDimensions).toBe(false);
  expect(r.changedPixels).toBeUndefined();
  expect(r.alphaChanged).toBeUndefined();
  expect(r.difference).toBeUndefined();
});
