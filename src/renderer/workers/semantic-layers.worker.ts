import { selectLayerRegion } from "../../shared/layer-editor";
const worker = self as unknown as {
  onmessage: (e: MessageEvent<Parameters<typeof selectLayerRegion>>) => void;
  postMessage: (value: unknown, transfer?: Transferable[]) => void;
};
worker.onmessage = (e) => {
  try {
    const weights = selectLayerRegion(...e.data);
    worker.postMessage({ weights }, [weights.buffer]);
  } catch (error) {
    worker.postMessage({ error: String(error) });
  }
};
