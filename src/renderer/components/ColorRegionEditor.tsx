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
    w.onerror = () =>
      setError("Farbauswahl-Worker ausgefallen; nichts gespeichert.");
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
      setError("Farbe von einem ausreichend sichtbaren Pixel aufnehmen.");
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
      setError("Farbauswahl fehlgeschlagen; nichts gespeichert.");
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
    if (
      !history.past.length ||
      window.confirm("Ungespeicherte Region verwerfen?")
    )
      onClose();
  };
  return (
    <div className="modal-backdrop">
      <section
        ref={modal}
        className="color-region-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Auswahl nach Farbe"
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
          <h2>Auswahl nach Farbe</h2>
          <button onClick={close}>Region verwerfen / schließen</button>
        </div>
        <p>
          Farben manuell zuweisen. Sage markiert die Region; Originalpixel
          bleiben unverändert. Keine automatische Haar- oder Hauterkennung.
        </p>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <div className="color-region-layout">
          <div className="color-region-controls">
            <label>
              Regionname
              <input
                aria-label="Regionname"
                value={name}
                maxLength={120}
                onChange={(e) => setName(e.target.value)}
              />
            </label>
            <strong>Farbe aufnehmen</strong>
            <p>
              Klick ins Bild oder auf ein Farbfeld. Bei „zusammenhängend“
              bestimmt der aufgenommene Pixel den Startpunkt.
            </p>
            <div className="button-row" aria-label="Dominante Bildfarben">
              {dominant.map((c) => (
                <button
                  key={c.hex}
                  aria-label={`Bildfarbe ${c.hex}`}
                  title={`${c.count} Pixel in Farbgruppe`}
                  style={{ borderBottom: `8px solid ${c.hex}` }}
                  onClick={() => pickSwatch(c.hex)}
                >
                  {c.hex}
                </button>
              ))}
            </div>
            <p role="status">
              {picked
                ? `Farbe aufgenommen: ${picked.hex} · ${picked.x}, ${picked.y}`
                : "Werkzeug: Pipette · noch keine Farbe aufgenommen"}
            </p>
            <label>
              Toleranz (ΔE76) · {tolerance}
              <input
                aria-label="Auswahltoleranz"
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
              Zusammenhängend (sonst global)
            </label>
            <div className="button-row">
              <button
                disabled={
                  !picked || !preview || history.present.seeds.length >= 32
                }
                onClick={() => apply("add")}
              >
                Zur Region hinzufügen
              </button>
              <button
                disabled={
                  !picked || !preview || history.present.seeds.length >= 32
                }
                onClick={() => apply("subtract")}
              >
                Von Region entfernen
              </button>
            </div>
            <small>
              Toleranz und Modus gelten für den nächsten Farbschritt. Maximal 32
              Schritte; Pinselkorrekturen anschließend möglich.
            </small>
            <strong>Aktuelle Regionspalette</strong>
            <div className="button-row" aria-label="Ausgewählte Regionsfarben">
              {preview?.colors.map((c) => (
                <button
                  key={c.hex}
                  aria-label={`Regionsfarbe ${c.hex}`}
                  style={{ borderBottom: `8px solid ${c.hex}` }}
                  onClick={() => pickSwatch(c.hex, preview.weights)}
                >
                  {c.hex} · {c.count}
                </button>
              ))}
            </div>
            <p aria-label="Regionsabdeckung">
              {count} sichtbare Pixel ·{" "}
              {((100 * count) / (pixels.width * pixels.height)).toFixed(1)} %
              der Zeichenfläche
            </p>
            <ol aria-label="Gespeicherte Farbschritte">
              {history.present.seeds.map((s, i) => (
                <li key={i}>
                  {s.operation === "add" ? "+" : "−"} {s.hex} · ΔE {s.tolerance}{" "}
                  · {s.connected ? `verbunden ab ${s.x},${s.y}` : "global"}
                </li>
              ))}
            </ol>
            <button disabled={!preview} onClick={() => setBrush(true)}>
              Pinsel für Feinkorrekturen
            </button>
            <div className="button-row">
              {(["x", "y"] as const).map((k) => (
                <label key={k}>
                  {k}
                  <input
                    type="number"
                    aria-label={`Regionspipette ${k}`}
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
              Farbe an Koordinate aufnehmen
            </button>
          </div>
          <figure>
            <figcaption>
              {name} · {pixels.width}×{pixels.height} · Pipette /
              Auswahlvorschau
            </figcaption>
            <canvas
              ref={canvas}
              width={pixels.width}
              height={pixels.height}
              aria-label="Farbauswahlfläche"
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
          </figure>
        </div>
        <div className="button-row color-actions">
          <button
            disabled={mutating || !history.past.length}
            onClick={() => setHistory(undoRegion)}
          >
            Region rückgängig
          </button>
          <button
            disabled={mutating || !history.future.length}
            onClick={() => setHistory(redoRegion)}
          >
            Region wiederholen
          </button>
          <button
            disabled={!preview || !name.trim() || !count || !!error}
            className="primary"
            onClick={() =>
              preview && onSave(preview.weights, name.trim(), history.present)
            }
          >
            Region speichern
          </button>
        </div>
        {brush && preview && (
          <MaskEditor
            master={{ id: assetId, width: pixels.width, height: pixels.height }}
            initialName={name}
            initialWeights={preview.weights}
            contextLabel={{
              title: "Farbregion",
              description:
                "Weiß wählt Pixel für die Farbregion. Schwarz entfernt sie. Pinsel nur zur manuellen Feinkorrektur.",
              saveLabel: "In Farbentwurf übernehmen",
              readOnlyName: true,
            }}
            onClose={() => setBrush(false)}
            onSave={async (weights) => {
              setBrush(false);
              mutate({ brushWeights: weights });
            }}
          />
        )}
      </section>
    </div>
  );
}
