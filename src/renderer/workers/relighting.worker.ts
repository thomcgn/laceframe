import {
  relightPixels,
  type RelightPixels,
  type Light,
  type LightRegion,
} from "../../shared/relighting";
let source: RelightPixels;
const worker = self as unknown as {
  onmessage: (event: MessageEvent) => void;
  postMessage: (value: unknown, transfer?: Transferable[]) => void;
};
worker.onmessage = async (
  event: MessageEvent<{
    source?: RelightPixels;
    serial: number;
    light: Light;
    regions: LightRegion[];
  }>,
) => {
  const { serial, light, regions } = event.data;
  if (event.data.source) source = event.data.source;
  try {
    const start = performance.now();
    const result = relightPixels(source, light, regions);
    const hash = await crypto.subtle.digest(
      "SHA-256",
      new Uint8Array(result.data).buffer,
    );
    const sha256 = [...new Uint8Array(hash)]
      .map((n) => n.toString(16).padStart(2, "0"))
      .join("");
    worker.postMessage(
      { serial, result, sha256, durationMs: performance.now() - start },
      [result.data.buffer as ArrayBuffer],
    );
  } catch (e) {
    worker.postMessage({
      serial,
      error: e instanceof Error ? e.message : "Lichtberechnung fehlgeschlagen.",
    });
  }
};
