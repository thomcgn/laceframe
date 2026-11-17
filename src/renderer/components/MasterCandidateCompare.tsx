import { IdentityComparison } from "./IdentityComparison";
import { usePreview } from "./useImagePreview";
import { useEffect, useRef, useState } from "react";
import {
  comparisonCanvas,
  comparisonTransform,
  sliderPosition,
  sliderKey,
} from "../../shared/comparison";
type Image = { id: string; width: number; height: number };
function PixelComparison({
  master,
  candidate,
  mask,
  beforeLabel = "Master",
  previewPrefix = "Create",
  enhanced = false,
}: {
  enhanced?: boolean;
  beforeLabel?: string;
  previewPrefix?: string;
  master?: Image;
  candidate?: Image;
  mask?: Image;
}) {
  const maskPreview = usePreview(mask?.id);
  const [backdrop, setBackdrop] = useState("checker");
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
  const pixelZoomRef = useRef<
    (value: number, point?: { x: number; y: number }) => void
  >(() => {});
  const [hand, setHand] = useState(true),
    held = useRef(false);
  function pixelZoom(
    value: number,
    point = { x: size.width / 2, y: size.height / 2 },
  ) {
    const next = Math.max(0.1, Math.min(1600, value)),
      scale = next / 100;
    setPan({
      x:
        point.x -
        ((point.x - view.x) / view.scale) * scale -
        (size.width - canvas.width * scale) / 2,
      y:
        point.y -
        ((point.y - view.y) / view.scale) * scale -
        (size.height - canvas.height * scale) / 2,
    });
    setZoom(next);
  }
  pixelZoomRef.current = pixelZoom;
  const scaleRef = useRef(view.scale);
  scaleRef.current = view.scale;
  useEffect(() => {
    if (!enhanced) return;
    const element = viewport.current!;
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = element.getBoundingClientRect();
      pixelZoomRef.current(
        scaleRef.current * 100 * Math.exp(-e.deltaY * 0.001),
        { x: e.clientX - r.left, y: e.clientY - r.top },
      );
    };
    const release = () => {
      held.current = false;
    };
    element.addEventListener("wheel", wheel, { passive: false });
    window.addEventListener("keyup", release);
    window.addEventListener("blur", release);
    return () => {
      element.removeEventListener("wheel", wheel);
      window.removeEventListener("keyup", release);
      window.removeEventListener("blur", release);
    };
  }, [enhanced]);
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
          Prüfhintergrund
          <select
            aria-label="Vergleich Prüfhintergrund"
            value={backdrop}
            onChange={(e) => setBackdrop(e.target.value)}
          >
            <option value="checker">Schachbrett</option>
            <option value="light">Hell</option>
            <option value="dark">Dunkel</option>
          </select>
        </label>
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
            onChange={(e) => {
              if (!enhanced)
                setZoom(
                  e.target.value === "fit" ? "fit" : Number(e.target.value),
                );
              else if (e.target.value === "fit") {
                setZoom("fit");
                setPan({ x: 0, y: 0 });
              } else pixelZoom(Number(e.target.value));
            }}
          >
            <option value="fit">Einpassen</option>
            {[25, 50, 100, 200, 400].map((n) => (
              <option key={n} value={n}>
                {n}%
              </option>
            ))}
          </select>
        </label>
        {enhanced && (
          <>
            <button
              aria-label="Pixelvergleich verkleinern"
              onClick={() => pixelZoom(view.scale * 80)}
            >
              −
            </button>
            <input
              aria-label="Pixelvergleich Zoom"
              type="range"
              min="0.1"
              max="1600"
              step="0.1"
              value={view.scale * 100}
              onChange={(e) => pixelZoom(Number(e.target.value))}
            />
            <output>{(view.scale * 100).toFixed(1)}%</output>
            <button
              aria-label="Pixelvergleich vergrößern"
              onClick={() => pixelZoom(view.scale * 125)}
            >
              +
            </button>
            <button aria-pressed={hand} onClick={() => setHand((v) => !v)}>
              Hand-Werkzeug
            </button>
          </>
        )}
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
        className={`compare-viewport checker compare-backdrop-${backdrop}`}
        ref={viewport}
        tabIndex={0}
        aria-label="Vergleichsfläche · ziehen zum Verschieben, Pfeiltasten zum Schwenken"
        onPointerDown={(e) => {
          if (
            e.button !== 0 ||
            (enhanced && !hand && !held.current && !e.altKey)
          )
            return;
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
          if (enhanced && (e.code === "Space" || e.key === "Alt")) {
            e.preventDefault();
            held.current = true;
            return;
          }
          if (enhanced && ["+", "=", "-"].includes(e.key)) {
            e.preventDefault();
            pixelZoom(view.scale * (e.key === "-" ? 80 : 125));
          }
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
          <div className={`compare-layer checker compare-backdrop-${backdrop}`}>
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
              className={`compare-layer compare-backdrop-${backdrop} ${mode === "slider" ? "checker" : ""}`}
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

export function MasterCandidateCompare(
  props: Parameters<typeof PixelComparison>[0] & {
    identityComparison?: boolean;
    requested?: { width: number; height: number };
  },
) {
  const [kind, setKind] = useState("identity");
  if (!props.identityComparison) return <PixelComparison {...props} />;
  return (
    <div className="identity-comparison-switch">
      <label>
        Vergleich{" "}
        <select
          aria-label="Identitätsvergleich oder Pixelvergleich"
          value={kind}
          onChange={(e) => setKind(e.target.value)}
        >
          <option value="identity">Identitätsvergleich</option>
          <option value="pixel">Pixelvergleich · erweitert</option>
        </select>
      </label>
      {kind === "identity" ? (
        <IdentityComparison
          master={props.master}
          candidate={props.candidate}
          prefix={props.previewPrefix ?? "Create"}
          requested={props.requested}
        />
      ) : (
        <PixelComparison {...props} enhanced />
      )}
    </div>
  );
}
