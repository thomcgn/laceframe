import { tr } from "../../shared/locales";
import {
  prepareCutout,
  selectBackground,
  type CutoutImage,
  type CutoutDraft,
} from "../../shared/smart-cutout";
let image: CutoutImage, lab: Float32Array;
self.onmessage = (
  event: MessageEvent<{
    image?: CutoutImage;
    draft: CutoutDraft;
    serial: number;
  }>,
) => {
  try {
    if (event.data.image) {
      image = event.data.image;
      lab = prepareCutout(image);
    }
    const start = performance.now();
    const result = selectBackground(image, event.data.draft, lab);
    self.postMessage({
      serial: event.data.serial,
      ...result,
      durationMs: performance.now() - start,
    });
  } catch (e) {
    self.postMessage({
      serial: event.data.serial,
      error: e instanceof Error ? e.message : tr("editing.m2b58e179b6"),
    });
  }
};
