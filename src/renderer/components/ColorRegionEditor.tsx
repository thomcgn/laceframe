import { SelectionEditor } from "../editing/SelectionEditor";
import { displayMessage } from "../../shared/locales";
import { tr } from "../../shared/locales/index";
import { PixelViewport } from "./PixelViewport";
import { EditorWorkspace } from "./EditorWorkspace";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  commitRegion,
  emptyRegionSelection,
  pixelHex,
  redoRegion,
  undoRegion,
  type RegionSelection,
  type ColorSeed,
  type RegionHistory,
} from "../../shared/color-region";
import {
  extractPalette,
  type ColorPixels,
} from "../../shared/color-consistency";
import { MaskEditor } from "./MaskEditor";
export function ColorRegionEditor({
  pixels,
  assetId,
  initialWeights,
  initialSelection,
  initialName,
  onSave,
  onClose,
}: {
  pixels: ColorPixels;
  assetId: string;
  initialWeights: Uint8Array;
  initialSelection?: RegionSelection;
  initialName: string;
  onSave: (
    weights: Uint8Array,
    name: string,
    selection: RegionSelection,
  ) => void;
  onClose: () => void;
}) {
  const [history, setHistory] = useState<RegionHistory>(() => ({
    past: [],
    present: initialSelection ?? emptyRegionSelection(initialWeights),
    future: [],
  }));
  const [name, setName] = useState(initialName),
    [picked, setPicked] = useState<{ x: number; y: number; hex: string }>(),
    [tolerance, setTolerance] = useState(8),
    [connected, setConnected] = useState(false),
    [brush, setBrush] = useState(false),
    [error, setError] = useState("");
  const [sharedSelection,setSharedSelection]=useState(false);
  const [mutating, setMutating] = useState(false);
  const mutation = useRef<Worker | undefined>(undefined);
  const cached = useRef<
    | {
        selection: RegionSelection;
        weights: Uint8Array;
        colors: { hex: string; count: number }[];
      }
    | undefined
  >(undefined);
  useEffect(() => () => mutation.current?.terminate(), []);
  const [preview, setPreview] = useState<{
      weights: Uint8Array;
      colors: { hex: string; count: number }[];
    }>(),
    [coords, setCoords] = useState({ x: 0, y: 0 });
  const canvas = useRef<HTMLCanvasElement>(null),
    modal = useRef<HTMLElement>(null);
  const dominant = useMemo(() => {
    try {
      return extractPalette(
        pixels,
        new Uint8Array(pixels.width * pixels.height).fill(255),
      );
    } catch {
      return [];
    }
  }, [pixels]);
  useEffect(() => {
    const old = document.activeElement as HTMLElement | null;
    modal.current?.focus();
    return () => old?.focus();
  }, []);
  useEffect(() => {
    setPreview(undefined);
    setError("");
    if (cached.current?.selection === history.present) {
      setPreview(cached.current);
      cached.current = undefined;
      return;
    }
    const w = new Worker(
      new URL("../workers/color-region.worker.ts", import.meta.url),
      { type: "module" },
    );
    w.onmessage = (e) => {
      if (e.data.error) setError(e.data.error);
      else setPreview(e.data);
    };
    w.onerror = () => setError(tr("editing.mbc988c742a"));
    w.postMessage({ pixels, selection: history.present });
    return () => w.terminate();
  }, [pixels, history.present]);
  useEffect(() => {
    const ctx = canvas.current?.getContext("2d");
    if (!ctx) return;
    const rgba = new Uint8ClampedArray(pixels.data);
    if (preview)
      for (let i = 0; i < preview.weights.length; i++)
        if (preview.weights[i] && rgba[i * 4 + 3]) {
          const mix = (preview.weights[i] / 255) * 0.45;
          [143, 173, 166].forEach(
            (c, k) =>
              (rgba[i * 4 + k] = Math.round(
                rgba[i * 4 + k] * (1 - mix) + c * mix,
              )),
          );
        }
    ctx.putImageData(new ImageData(rgba, pixels.width, pixels.height), 0, 0);
  }, [pixels, preview]);
  const pick = (x: number, y: number) => {
    if (
      !Number.isInteger(x) ||
      !Number.isInteger(y) ||
      x < 0 ||
      y < 0 ||
      x >= pixels.width ||
      y >= pixels.height
    )
      return;
    const i = y * pixels.width + x;
    if (pixels.data[i * 4 + 3] < 128) {
      setError(tr("editing.m8712692e38"));
      return;
    }
    setPicked({ x, y, hex: pixelHex(pixels, i) });
    setError("");
  };
  const mutate = (change: { seed?: ColorSeed; brushWeights?: Uint8Array }) => {
    setMutating(true);
    setPreview(undefined);
    setError("");
    const w = new Worker(
      new URL("../workers/color-region.worker.ts", import.meta.url),
      { type: "module" },
    );
    mutation.current = w;
    w.onmessage = (e) => {
      if (e.data.error) setError(e.data.error);
      else {
        cached.current = e.data;
        setHistory((h) => commitRegion(h, e.data.selection));
      }
      setMutating(false);
      w.terminate();
      mutation.current = undefined;
    };
    w.onerror = () => {
      setError(tr("editing.mdbf7138ce2"));
      setMutating(false);
      w.terminate();
      mutation.current = undefined;
    };
    w.postMessage({ pixels, selection: history.present, ...change });
  };
  const apply = (operation: "add" | "subtract") => {
    if (picked)
      mutate({ seed: { ...picked, tolerance, connected, operation } });
  };
  const pickSwatch = (hex: string, weights?: Uint8Array) => {
    const rgb = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
    for (let i = 0; i < pixels.width * pixels.height; i++)
      if (
        (!weights || weights[i] >= 128) &&
        pixels.data[i * 4 + 3] >= 128 &&
        rgb.every((v, k) => pixels.data[i * 4 + k] === v)
      ) {
        pick(i % pixels.width, Math.floor(i / pixels.width));
        break;
      }
  };
  const count =
    preview?.weights.reduce(
      (sum, v, i) => sum + Number(v >= 128 && pixels.data[i * 4 + 3] >= 128),
      0,
    ) ?? 0;
  const close = () => {
    if (!history.past.length || window.confirm(tr("editing.m65e16b0b60")))
      onClose();
  };
  return (
    <EditorWorkspace title={tr("editing.mbe7ed3a938")} className="">
      <section
        ref={modal}
        className="color-region-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={tr("editing.mbe7ed3a938")}
        tabIndex={-1}
        onKeyDown={(e) => {
          if (brush) return;
          if (e.key === "Escape") {
            e.stopPropagation();
            close();
          }
          if (e.key === "Tab") {
            const items = [
                ...e.currentTarget.querySelectorAll<HTMLElement>(
                  'button:not(:disabled),input:not(:disabled),[tabindex="0"]',
                ),
              ].filter((n) => n.getClientRects().length),
              first = items[0],
              last = items.at(-1);
            if (e.shiftKey && document.activeElement === first) {
              e.preventDefault();
              last?.focus();
            } else if (!e.shiftKey && document.activeElement === last) {
              e.preventDefault();
              first?.focus();
            }
          }
        }}
      >
        <div className="section-head">
          <h2>{tr("editing.mbe7ed3a938")}</h2>
          <button disabled={!preview||mutating} onClick={()=>setSharedSelection(true)}>{tr("canvas.open")}</button>
          <button onClick={close}>{tr("editing.m945010968c")}</button>
        </div>
        <p>{tr("editing.m22803a458d")}</p>
        {error && (
          <p className="error" role="alert">
            {displayMessage(error)}
          </p>
        )}
        <div className="color-region-layout">
          <div className="color-region-controls">
            <label>
              {tr("editing.m7208d15f9f")}
              <input
                aria-label={tr("editing.m7208d15f9f")}
                value={name}
                maxLength={120}
                onChange={(e) => setName(e.target.value)}
              />
            </label>
            <strong>{tr("editing.mac7a08390d")}</strong>
            <p>{tr("editing.m0401f508f3")}</p>
            <div className="button-row" aria-label={tr("editing.m936cf147d4")}>
              {dominant.map((c) => (
                <button
                  key={c.hex}
                  aria-label={tr("editing.m191f7ddab0", { v0: c.hex })}
                  title={tr("editing.md10a207b2b", { v0: c.count })}
                  style={{ borderBottom: `8px solid ${c.hex}` }}
                  onClick={() => pickSwatch(c.hex)}
                >
                  {c.hex}
                </button>
              ))}
            </div>
            <p role="status">
              {picked
                ? tr("editing.m2ec37f166e", {
                    v0: picked.hex,
                    v1: picked.x,
                    v2: picked.y,
                  })
                : tr("editing.m48866b2f6a")}
            </p>
            <label>
              {tr("editing.m7bd0af1a86")}
              {tolerance}
              <input
                aria-label={tr("editing.mfe284ab8f6")}
                type="range"
                min="0"
                max="100"
                value={tolerance}
                onChange={(e) => setTolerance(Number(e.target.value))}
              />
            </label>
            <label>
              <input
                type="checkbox"
                checked={connected}
                onChange={(e) => setConnected(e.target.checked)}
              />
              {tr("editing.mad8769ae0b")}
            </label>
            <div className="button-row">
              <button
                disabled={
                  !picked || !preview || history.present.seeds.length >= 32
                }
                onClick={() => apply("add")}
              >
                {tr("editing.mfae4cc249a")}
              </button>
              <button
                disabled={
                  !picked || !preview || history.present.seeds.length >= 32
                }
                onClick={() => apply("subtract")}
              >
                {tr("editing.mcc881fd72c")}
              </button>
            </div>
            <small>{tr("editing.m82b9660041")}</small>
            <strong>{tr("editing.m749edd8837")}</strong>
            <div className="button-row" aria-label={tr("editing.m460c38ab1e")}>
              {preview?.colors.map((c) => (
                <button
                  key={c.hex}
                  aria-label={tr("editing.m54fad24ae6", { v0: c.hex })}
                  style={{ borderBottom: `8px solid ${c.hex}` }}
                  onClick={() => pickSwatch(c.hex, preview.weights)}
                >
                  {c.hex} · {c.count}
                </button>
              ))}
            </div>
            <p aria-label={tr("editing.mf0750a834d")}>
              {count} {tr("editing.ma545dfb506")}{" "}
              {((100 * count) / (pixels.width * pixels.height)).toFixed(1)}{" "}
              {tr("editing.m6911c38624")}
            </p>
            <ol aria-label={tr("editing.m0a69487488")}>
              {history.present.seeds.map((s, i) => (
                <li key={i}>
                  {s.operation === "add" ? "+" : "−"} {s.hex}{" "}
                  {tr("editing.m3f86452c2a")}
                  {s.tolerance} ·{" "}
                  {s.connected
                    ? tr("editing.m697d6f3c96", { v0: s.x, v1: s.y })
                    : "global"}
                </li>
              ))}
            </ol>
            <button disabled={!preview} onClick={() => setBrush(true)}>
              {tr("editing.med8d3a7f00")}
            </button>
            <div className="button-row">
              {(["x", "y"] as const).map((k) => (
                <label key={k}>
                  {k}
                  <input
                    type="number"
                    aria-label={tr("editing.md736189315", { v0: k })}
                    min="0"
                    max={k === "x" ? pixels.width - 1 : pixels.height - 1}
                    value={coords[k]}
                    onChange={(e) =>
                      setCoords((c) => ({ ...c, [k]: Number(e.target.value) }))
                    }
                  />
                </label>
              ))}
            </div>
            <button onClick={() => pick(coords.x, coords.y)}>
              {tr("editing.m7e955c4f76")}
            </button>
          </div>
          <figure>
            <figcaption>
              {name} · {pixels.width}×{pixels.height}{" "}
              {tr("editing.m1ca8348b89")}
            </figcaption>
            <PixelViewport width={pixels.width} height={pixels.height}>
              <canvas
                ref={canvas}
                width={pixels.width}
                height={pixels.height}
                aria-label={tr("editing.m44bcb3b721")}
                onClick={(e) => {
                  const r = e.currentTarget.getBoundingClientRect(),
                    scale = Math.min(
                      r.width / pixels.width,
                      r.height / pixels.height,
                    );
                  pick(
                    Math.floor(
                      (e.clientX -
                        r.left -
                        (r.width - pixels.width * scale) / 2) /
                        scale,
                    ),
                    Math.floor(
                      (e.clientY -
                        r.top -
                        (r.height - pixels.height * scale) / 2) /
                        scale,
                    ),
                  );
                }}
              />
            </PixelViewport>
          </figure>
        </div>
        <div className="button-row color-actions">
          <button
            disabled={mutating || !history.past.length}
            onClick={() => setHistory(undoRegion)}
          >
            {tr("editing.m4f4d826007")}
          </button>
          <button
            disabled={mutating || !history.future.length}
            onClick={() => setHistory(redoRegion)}
          >
            {tr("editing.mf0ecf88402")}
          </button>
          <button
            disabled={!preview || !name.trim() || !count || !!error}
            className="primary"
            onClick={() =>
              preview && onSave(preview.weights, name.trim(), history.present)
            }
          >
            {tr("editing.m68e4f9a4e6")}
          </button>
        </div>
        {brush && preview && (
          <MaskEditor
            master={{ id: assetId, width: pixels.width, height: pixels.height }}
            initialName={name}
            initialWeights={preview.weights}
            contextLabel={{
              title: tr("editing.m4281a9366b"),
              description: tr("editing.mb812b1f1e1"),
              saveLabel: tr("editing.m6776e0bb5f"),
              readOnlyName: true,
            }}
            onClose={() => setBrush(false)}
            onSave={async (weights) => {
              setBrush(false);
              mutate({ brushWeights: weights });
            }}
          />
        )}
        {sharedSelection && preview && <SelectionEditor sourceId={assetId} initialMask={preview.weights}
          references={[{id:"region",name,weights:preview.weights}]}
          onApply={weights=>mutate({brushWeights:weights})} onClose={()=>setSharedSelection(false)} />}
      </section>
    </EditorWorkspace>
  );
}
