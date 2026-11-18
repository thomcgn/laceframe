import { tr } from "../../shared/locales";
import { measureStyle, type AnalysisInput } from "../../shared/style-analysis";
self.onmessage = (
  event: MessageEvent<{
    input: AnalysisInput;
    image: { width: number; height: number; data: Uint8Array; sha256: string };
  }>,
) => {
  try {
    const { input, image } = event.data;
    self.postMessage({
      ok: true,
      value: {
        ...input,
        sha256: image.sha256,
        metrics: measureStyle(image, input.roi),
      },
    });
  } catch (error) {
    self.postMessage({
      ok: false,
      error: error instanceof Error ? error.message : tr("editing.mc30667e750"),
    });
  }
};
