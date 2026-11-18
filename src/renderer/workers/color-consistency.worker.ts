import {
  correctColors,
  measureColors,
  type ColorDraft,
  type ColorPixels,
  type MasterPalette,
} from "../../shared/color-consistency";
const worker = self as unknown as {
  onmessage: (e: MessageEvent) => void;
  postMessage: (v: unknown, transfer?: Transferable[]) => void;
};
worker.onmessage = async (
  e: MessageEvent<{
    source: ColorPixels;
    draft: ColorDraft;
    palette: MasterPalette;
  }>,
) => {
  try {
    const { source, draft, palette } = e.data;
    const result = correctColors(source, draft);
    const measurements = draft.regions.map((r) => {
      const colors = palette.regions.find(
        (p) => p.id === r.paletteRegionId,
      )!.colors;
      try {
        return {
          before: measureColors(source, r.weights, colors),
          after: measureColors(result, r.weights, colors),
        };
      } catch {
        return null;
      }
    });
    const digest = await crypto.subtle.digest(
      "SHA-256",
      new Uint8Array(result.data).buffer,
    );
    const sha256 = [...new Uint8Array(digest)]
      .map((v) => v.toString(16).padStart(2, "0"))
      .join("");
    worker.postMessage({ result, measurements, sha256 }, [
      result.data.buffer as ArrayBuffer,
    ]);
  } catch (e) {
    worker.postMessage({
      error: e instanceof Error ? e.message : "Farbprüfung fehlgeschlagen.",
    });
  }
};
