import { pixelReview } from "../../shared/pixel-review";
import { analyzeSnap } from "../../shared/pixel-snap";
import { applyPixelEdit, type PixelEdit } from "../../shared/pixel-snap";
import type { ColorPixels } from "../../shared/color-consistency";
const worker = self as unknown as {
  onmessage: (e: MessageEvent) => void;
  postMessage: (data: unknown, transfer?: Transferable[]) => void;
};
let source: ColorPixels;
worker.onmessage = async (
  e: MessageEvent<{
    id: number;
    source?: ColorPixels;
    edit?: PixelEdit;
    analyze?: boolean;
    protectedWeights?: Uint8Array;
  }>,
) => {
  const { id } = e.data;
  try {
    if (e.data.source) {
      source = e.data.source;
      return;
    }
    if (!source) throw new Error("Quelle fehlt.");
    if (e.data.analyze) {
      worker.postMessage({ id, analysis: analyzeSnap(source) });
      return;
    }
    if (!e.data.edit) throw new Error("Bearbeitungsparameter fehlen.");
    const result = applyPixelEdit(
      source,
      e.data.edit,
      e.data.protectedWeights!,
    );
    const hash = await crypto.subtle.digest(
      "SHA-256",
      new Uint8Array(result.data).buffer,
    );
    const sha256 = Array.from(new Uint8Array(hash), (v) =>
      v.toString(16).padStart(2, "0"),
    ).join("");
    worker.postMessage(
      { id, result, sha256, review: pixelReview(source, result) },
      [result.data.buffer as ArrayBuffer],
    );
  } catch (error) {
    worker.postMessage({
      id,
      error:
        error instanceof Error
          ? error.message
          : "Pixelbearbeitung fehlgeschlagen.",
    });
  }
};
