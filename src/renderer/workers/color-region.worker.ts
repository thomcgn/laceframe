import { tr } from "../../shared/locales";
import {
  replayRegionSelection,
  appendColorSeed,
  refineRegionSelection,
  type ColorSeed,
  type RegionSelection,
} from "../../shared/color-region";
import {
  extractPalette,
  type ColorPixels,
} from "../../shared/color-consistency";
const worker = self as unknown as {
  onmessage: (e: MessageEvent) => void;
  postMessage: (v: unknown) => void;
};
worker.onmessage = (
  e: MessageEvent<{
    pixels: ColorPixels;
    selection: RegionSelection;
    seed?: ColorSeed;
    brushWeights?: Uint8Array;
  }>,
) => {
  try {
    const selection = e.data.seed
      ? appendColorSeed(e.data.pixels, e.data.selection, e.data.seed)
      : e.data.brushWeights
        ? refineRegionSelection(
            e.data.pixels,
            e.data.selection,
            e.data.brushWeights,
          )
        : e.data.selection;
    const weights = replayRegionSelection(e.data.pixels, selection);
    let colors: ReturnType<typeof extractPalette> = [];
    try {
      colors = extractPalette(e.data.pixels, weights);
    } catch {
      /* Empty selection is editable. */
    }
    worker.postMessage({ weights, colors, selection });
  } catch (e) {
    worker.postMessage({
      error: e instanceof Error ? e.message : tr("editing.mcc84bd2f58"),
    });
  }
};
