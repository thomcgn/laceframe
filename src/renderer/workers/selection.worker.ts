import { rangeSelection } from "../../shared/editing";
const worker = self as unknown as {
    onmessage: (e: MessageEvent<Parameters<typeof rangeSelection>>) => void;
    postMessage: (v: unknown, transfer?: Transferable[]) => void;
};
worker.onmessage = e => { try {
    const mask = rangeSelection(...e.data);
    worker.postMessage({ mask }, [mask.buffer]);
}
catch (error) {
    worker.postMessage({ error: String(error) });
} };
