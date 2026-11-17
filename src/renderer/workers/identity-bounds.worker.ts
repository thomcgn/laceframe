import { visibleRegion } from "../../shared/identity-comparison";
self.onmessage = (
  event: MessageEvent<{
    width: number;
    height: number;
    data: Uint8ClampedArray;
  }>,
) => {
  try {
    const { width, height, data } = event.data;
    self.postMessage({ ok: true, ...visibleRegion(width, height, data) });
  } catch {
    self.postMessage({ ok: false });
  }
};
