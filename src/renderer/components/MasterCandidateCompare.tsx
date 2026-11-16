import { useEffect, useRef, useState } from "react";
import {
  comparisonCanvas,
  comparisonTransform,
  sliderPosition,
  sliderKey,
} from "../../shared/comparison";
type Image = { id: string; width: number; height: number };
function usePreview(id?: string) {
  const [value, setValue] = useState({ src: "", error: "" });
  useEffect(() => {
    let live = true;
    setValue({ src: "", error: "" });
    if (id)
      void window.laceframe
        .preview(id)
        .then((r) => {
          if (live)
            setValue(
              r.ok ? { src: r.value, error: "" } : { src: "", error: r.error },
            );
        })
        .catch(() => {
          if (live)
            setValue({
              src: "",
              error: "Vorschau konnte nicht geladen werden.",
            });
        });
    return () => {
      live = false;
    };
  }, [id]);
  return value;
}
export function MasterCandidateCompare({
  master,
  candidate,
  mask,
  beforeLabel = "Master",
  previewPrefix = "Create",
}: {
  beforeLabel?: string;
  previewPrefix?: string;
  master?: Image;
  candidate?: Image;
  mask?: Image;
}) {
  const maskPreview = usePreview(mask?.id);
  const [normalized, setNormalized] = useState(false);
  const before = usePreview(master?.id),
    after = usePreview(candidate?.id);
  const [mode, setMode] = useState("slider");
  const [position, setPosition] = useState(50),
    [opacity, setOpacity] = useState(50);
  const [zoom, setZoom] = useState<number | "fit">("fit"),
    [pan, setPan] = useState({ x: 0, y: 0 });
  const [size, setSize] = useState({ width: 1, height: 1 });
  const viewport = useRef<HTMLDivElement>(null),
    stage = useRef<HTMLDivElement>(null);
  const dragging = useRef<{
    id: number;
    kind: "slider" | "pan";
    x: number;
    y: number;
    pan: { x: number; y: number };
  } | null>(null);
  useEffect(() => {
    const element = viewport.current;
    if (!element) return;
    const resize = () =>
      setSize({ width: element.clientWidth, height: element.clientHeight });
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    setPan({ x: 0, y: 0 });
  }, [master?.id, candidate?.id]);
  const canvas = comparisonCanvas(
      master ?? { width: 1, height: 1 },
      normalized ? undefined : candidate,
    ),
    view = comparisonTransform(canvas, size, zoom, pan);
  function moveSlider(x: number) {
    const rect = stage.current?.getBoundingClientRect();
    if (rect) setPosition(sliderPosition(x, rect.left, rect.width));
  }
  return (
    <section
      className="master-compare"
      aria-label={
        beforeLabel === "Master"
          ? "Master und Kandidat vergleichen"
          : "Identität und Masterkandidat vergleichen"
      }
    >
      <div className="compare-toolbar">
        <span className="compare-legend">
          <b>{beforeLabel}</b>
          <span>↔</span>
          <b>Kandidat</b>
        </span>
        <label>
          Ansicht
          <select
            aria-label="Vergleichsmodus"
            value={mode}
            onChange={(e) => setMode(e.target.value)}
          >
            <option value="slider">Before / After</option>
            <option value="overlay">Overlay</option>
          </select>
        </label>
        <label>
          Registrierung
          <select
            aria-label="Vergleichsregistrierung"
            value={normalized ? "visual" : "native"}
            onChange={(e) => {
              setNormalized(e.target.value === "visual");
              setPan({ x: 0, y: 0 });
            }}
          >
            <option value="native">Native Pixel · Ursprung 0,0</option>
            <option value="visual">
              Visuell normalisiert · keine Pixelgarantie
            </option>
          </select>
        </label>
        <label>
          Zoom
          <select
            aria-label="Create Zoom"
            value={zoom}
            onChange={(e) =>
              setZoom(e.target.value === "fit" ? "fit" : Number(e.target.value))
            }
          >
            <option value="fit">Einpassen</option>
            {[25, 50, 100, 200, 400].map((n) => (
              <option key={n} value={n}>
                {n}%
              </option>
            ))}
          </select>
        </label>
        {mode === "overlay" && (
          <label>
            Deckkraft {opacity}%
            <input
              aria-label="Overlay-Deckkraft"
              type="range"
              min={0}
              max={100}
              value={opacity}
              onChange={(e) => setOpacity(Number(e.target.value))}
            />
          </label>
        )}
        <button
          onClick={() => {
            setPan({ x: 0, y: 0 });
            setZoom("fit");
            setPosition(50);
            setOpacity(50);
          }}
        >
          Ansicht zurücksetzen
        </button>
      </div>
      <div
        className="compare-viewport checker"
        ref={viewport}
        tabIndex={0}
        aria-label="Vergleichsfläche · ziehen zum Verschieben, Pfeiltasten zum Schwenken"
        onPointerDown={(e) => {
          if (e.button !== 0) return;
          e.currentTarget.focus();
          e.currentTarget.setPointerCapture(e.pointerId);
          dragging.current = {
            id: e.pointerId,
            kind: "pan",
            x: e.clientX,
            y: e.clientY,
            pan,
          };
        }}
        onPointerMove={(e) => {
          const d = dragging.current;
          if (!d || d.id !== e.pointerId) return;
          if (d.kind === "slider") moveSlider(e.clientX);
          else
            setPan({
              x: d.pan.x + e.clientX - d.x,
              y: d.pan.y + e.clientY - d.y,
            });
        }}
        onPointerUp={() => {
          dragging.current = null;
        }}
        onPointerCancel={() => {
          dragging.current = null;
        }}
        onKeyDown={(e) => {
          if (e.target !== e.currentTarget) return;
          const d = 24;
          if (
            ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)
          ) {
            e.preventDefault();
            setPan((old) => ({
              x:
                old.x +
                (e.key === "ArrowLeft" ? d : e.key === "ArrowRight" ? -d : 0),
              y:
                old.y +
                (e.key === "ArrowUp" ? d : e.key === "ArrowDown" ? -d : 0),
            }));
          }
        }}
      >
        <div
          ref={stage}
          className="compare-stage"
          data-scale={view.scale}
          style={{
            width: canvas.width,
            height: canvas.height,
            transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})`,
          }}
        >
          <div className="compare-layer checker">
            {before.src && master && (
              <img
                draggable={false}
                alt={`${previewPrefix} · ${beforeLabel === "Master" ? "Masterreferenz" : "Identitätsreferenz"}`}
                src={before.src}
                width={master.width}
                height={master.height}
              />
            )}
          </div>
          {candidate && after.src && (
            <div
              className={`compare-layer ${mode === "slider" ? "checker" : ""}`}
              style={{
                clipPath:
                  mode === "slider" && candidate
                    ? `inset(0 0 0 ${position}%)`
                    : undefined,
              }}
            >
              {after.src && candidate && (
                <img
                  draggable={false}
                  alt={`${previewPrefix} · Ergebnisvorschau`}
                  src={after.src}
                  width={normalized && master ? master.width : candidate.width}
                  height={
                    normalized && master ? master.height : candidate.height
                  }
                  style={{ opacity: mode === "overlay" ? opacity / 100 : 1 }}
                />
              )}
            </div>
          )}
          {maskPreview.src && mask && (
            <div className="compare-layer mask-preview-overlay">
              <img
                alt="Gespeicherte Maske"
                src={maskPreview.src}
                width={mask.width}
                height={mask.height}
              />
            </div>
          )}
          {mode === "slider" && candidate && (
            <div
              className="compare-divider"
              role="slider"
              aria-label="Before/After-Vergleich"
              aria-orientation="horizontal"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(position)}
              aria-valuetext={`${Math.round(position)}% Master, ${Math.round(100 - position)}% Kandidat`}
              tabIndex={0}
              style={{
                left: `${position}%`,
                width: 2 / Math.max(view.scale, 0.001),
              }}
              onKeyDown={(e) => {
                if (
                  [
                    "Home",
                    "End",
                    "ArrowLeft",
                    "ArrowRight",
                    "ArrowUp",
                    "ArrowDown",
                  ].includes(e.key)
                ) {
                  e.preventDefault();
                  e.stopPropagation();
                  setPosition((value) => sliderKey(value, e.key, e.shiftKey));
                }
              }}
              onPointerDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
                e.currentTarget.focus();
                e.currentTarget.setPointerCapture(e.pointerId);
                dragging.current = {
                  id: e.pointerId,
                  kind: "slider",
                  x: e.clientX,
                  y: e.clientY,
                  pan,
                };
                moveSlider(e.clientX);
              }}
            >
              <span
                style={{
                  transform: `translate(-50%, -50%) scale(${1 / Math.max(view.scale, 0.001)})`,
                }}
              >
                ↔
              </span>
            </div>
          )}
        </div>
        {(!master || !candidate) && (
          <p className="compare-empty">
            {!master
              ? "Freigegebenen Master auswählen."
              : "Noch kein Kandidat · PNG/WebP ablegen oder generieren."}
          </p>
        )}
      </div>
      {(before.error || after.error) && (
        <p role="alert" className="error">
          {before.error || after.error}
        </p>
      )}
      <div className="compare-caption">
        <span>
          {beforeLabel} {master ? `${master.width} × ${master.height}` : "—"}
        </span>
        <span>
          Kandidat{" "}
          {candidate ? `${candidate.width} × ${candidate.height}` : "—"}
        </span>
        <small>
          Gemeinsamer Ursprung (0, 0) · Zoom und Pan synchron · Ziehen oder
          Pfeiltasten
        </small>
      </div>
      {normalized && (
        <p className="warning">
          Nur visuelle Normalisierung auf Mastergröße. Darstellung kann verzerrt
          sein; keine Änderung der Dateien, keine Pixelregistrierung und keine
          Freigabe für Hard Lock.
        </p>
      )}
      {comparisonCanvas(master ?? { width: 1, height: 1 }, candidate)
        .mismatch && (
        <p className="warning">
          Abweichende Abmessungen: Master {master?.width} × {master?.height},
          Ergebnis {candidate?.width} × {candidate?.height}. Keine automatische
          Skalierung. Fehlende Bildbereiche bleiben sichtbar leer.
        </p>
      )}
      <p className="comparison-review-note">
        Der Vergleich zeigt Bildunterschiede. Ähnliches Aussehen bestätigt keine
        freigegebene Identität.
      </p>
    </section>
  );
}
