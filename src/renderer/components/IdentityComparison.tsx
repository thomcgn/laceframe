import { useEffect, useRef, useState } from "react";
import {
  fullRegion,
  identityTransform,
  zoomAt,
  linkedIdentityView,
  type Region,
  type IdentityView,
} from "../../shared/identity-comparison";
import { usePreview } from "./useImagePreview";
type Image = { id: string; width: number; height: number };
type Bounds = { region: Region; status: string; ignored: number };
const INITIAL: IdentityView = { zoom: "fit" };
function useBounds(src: string, image?: Image) {
  const [result, setResult] = useState<Bounds>();
  useEffect(() => {
    let live = true,
      worker: Worker | undefined;
    setResult(undefined);
    if (!src || !image) return;
    const fallback = (status: string) => {
      if (live) setResult({ region: fullRegion(image), status, ignored: 0 });
    };
    if (image.width * image.height > 16_000_000) {
      fallback("limit");
      return;
    }
    const img = new window.Image();
    img.src = src;
    void (async () => {
      await img.decode();
      if (!live) return;
      if (
        img.naturalWidth !== image.width ||
        img.naturalHeight !== image.height
      )
        throw new Error("Dimensions");
      const canvas = document.createElement("canvas");
      canvas.width = image.width;
      canvas.height = image.height;
      const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
      ctx.drawImage(img, 0, 0);
      const data = ctx.getImageData(0, 0, image.width, image.height).data;
      canvas.width = 0;
      canvas.height = 0;
      worker = new Worker(
        new URL("../workers/identity-bounds.worker.ts", import.meta.url),
        { type: "module" },
      );
      worker.onmessage = (e: MessageEvent<Bounds & { ok: boolean }>) => {
        if (e.data.ok && live) setResult(e.data);
        else fallback("failed");
        worker?.terminate();
      };
      worker.onerror = () => {
        fallback("failed");
        worker?.terminate();
      };
      worker.postMessage({ width: image.width, height: image.height, data }, [
        data.buffer,
      ]);
    })().catch(() => fallback("failed"));
    return () => {
      live = false;
      worker?.terminate();
      img.src = "";
    };
  }, [src, image?.id, image?.width, image?.height]);
  return result;
}
function PortraitPane({
  label,
  alt,
  image,
  src,
  region,
  view,
  setView,
  onSize,
  backdrop,
}: {
  label: string;
  alt: string;
  image?: Image;
  src: string;
  region: Region;
  view: IdentityView;
  setView: (v: IdentityView) => void;
  onSize: (s: { width: number; height: number }) => void;
  backdrop: string;
}) {
  const viewport = useRef<HTMLDivElement>(null),
    [size, setSize] = useState({ width: 1, height: 1 }),
    [hand, setHand] = useState(true),
    [temporary, setTemporary] = useState(false);
  const drag = useRef<{
      id: number;
      x: number;
      y: number;
      center: { x: number; y: number };
      scale: number;
    } | null>(null),
    held = useRef(false);
  const transform = identityTransform(region, size, view);
  const current = useRef({ view, region, size, setView });
  current.current = { view, region, size, setView };
  useEffect(() => {
    const element = viewport.current!;
    const resize = () => {
      const s = { width: element.clientWidth, height: element.clientHeight };
      setSize(s);
      onSize(s);
    };
    const observer = new ResizeObserver(resize);
    resize();
    observer.observe(element);
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      const c = current.current,
        rect = element.getBoundingClientRect();
      const scale = identityTransform(c.region, c.size, c.view).scale;
      c.setView(
        zoomAt(
          c.region,
          c.size,
          c.view,
          Math.min(
            1600,
            Math.max(0.1, scale * 100 * Math.exp(-e.deltaY * 0.001)),
          ),
          { x: e.clientX - rect.left, y: e.clientY - rect.top },
        ),
      );
    };
    element.addEventListener("wheel", wheel, { passive: false });
    const release = (e?: KeyboardEvent) => {
      if (!e || e.code === "Space" || e.key === "Alt") {
        held.current = false;
        setTemporary(false);
        if (!e) drag.current = null;
      }
    };
    const blur = () => release();
    window.addEventListener("blur", blur);
    window.addEventListener("keyup", release);
    return () => {
      observer.disconnect();
      element.removeEventListener("wheel", wheel);
      window.removeEventListener("blur", blur);
      window.removeEventListener("keyup", release);
    };
  }, [onSize]);
  const zoom = (value: number) =>
    setView(zoomAt(region, size, view, Math.min(1600, Math.max(0.1, value))));
  return (
    <section className="identity-pane" aria-label={`${label} Bildansicht`}>
      <header>
        <strong>{label}</strong>
        <small>{image ? `${image.width} × ${image.height} Pixel` : "—"}</small>
      </header>
      <div className="identity-zoom-controls">
        <button
          aria-label={`${label} verkleinern`}
          onClick={() => zoom(transform.scale * 80)}
        >
          −
        </button>
        <label>
          Zoom{" "}
          <input
            aria-label={`${label} Zoom`}
            type="range"
            min="0.1"
            max="1600"
            step="0.1"
            value={Math.min(1600, Math.max(0.1, transform.scale * 100))}
            onChange={(e) => zoom(Number(e.target.value))}
          />
        </label>
        <output aria-label={`${label} Zoomfaktor`}>
          {(transform.scale * 100).toFixed(1)}%
        </output>
        <button
          aria-label={`${label} vergrößern`}
          onClick={() => zoom(transform.scale * 125)}
        >
          +
        </button>
        <button onClick={() => setView(INITIAL)}>Einpassen</button>
        {[100, 200, 400].map((n) => (
          <button key={n} onClick={() => zoom(n)}>
            {n}%
          </button>
        ))}
        <button
          aria-label={`${label} Hand-Werkzeug`}
          aria-pressed={hand}
          onClick={() => setHand((v) => !v)}
        >
          Hand
        </button>
      </div>
      <div
        ref={viewport}
        className={`identity-viewport checker compare-backdrop-${backdrop}`}
        tabIndex={0}
        aria-label={`${label} verschieben und zoomen`}
        data-scale={transform.scale}
        data-region={JSON.stringify(region)}
        style={{ cursor: hand || temporary ? "grab" : "default" }}
        onPointerDown={(e) => {
          if (e.button !== 0 || !(hand || held.current || e.altKey)) return;
          e.currentTarget.focus();
          e.currentTarget.setPointerCapture(e.pointerId);
          drag.current = {
            id: e.pointerId,
            x: e.clientX,
            y: e.clientY,
            center: transform.center,
            scale: transform.scale,
          };
        }}
        onPointerMove={(e) => {
          const d = drag.current;
          if (d?.id === e.pointerId)
            setView({
              zoom: d.scale * 100,
              center: {
                x: d.center.x - (e.clientX - d.x) / d.scale,
                y: d.center.y - (e.clientY - d.y) / d.scale,
              },
            });
        }}
        onPointerUp={() => {
          drag.current = null;
        }}
        onPointerCancel={() => {
          drag.current = null;
        }}
        onLostPointerCapture={() => {
          drag.current = null;
        }}
        onKeyDown={(e) => {
          if (e.target !== e.currentTarget) return;
          if (e.code === "Space" || e.key === "Alt") {
            e.preventDefault();
            held.current = true;
            setTemporary(true);
            return;
          }
          if (e.key === "+" || e.key === "=" || e.key === "-") {
            e.preventDefault();
            zoom(transform.scale * (e.key === "-" ? 80 : 125));
          }
          const delta: Record<string, [number, number]> = {
            ArrowLeft: [24, 0],
            ArrowRight: [-24, 0],
            ArrowUp: [0, 24],
            ArrowDown: [0, -24],
          };
          if (delta[e.key]) {
            e.preventDefault();
            const [x, y] = delta[e.key];
            setView({
              zoom: transform.scale * 100,
              center: {
                x: transform.center.x - x / transform.scale,
                y: transform.center.y - y / transform.scale,
              },
            });
          }
          if (e.key === "0") {
            e.preventDefault();
            setView(INITIAL);
          }
        }}
      >
        {src && image ? (
          <img
            alt={alt}
            src={src}
            draggable={false}
            width={image.width}
            height={image.height}
            style={{
              transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})`,
            }}
          />
        ) : (
          <p>Kein Bild verfügbar.</p>
        )}
      </div>
    </section>
  );
}
export function IdentityComparison({
  master,
  candidate,
  prefix,
  requested,
}: {
  master?: Image;
  candidate?: Image;
  prefix: string;
  requested?: { width: number; height: number };
}) {
  const before = usePreview(master?.id),
    after = usePreview(candidate?.id),
    bounds = useBounds(after.src, candidate);
  const [autoFit, setAutoFit] = useState(true),
    [sync, setSync] = useState(false),
    [backdrop, setBackdrop] = useState("checker");
  const [views, setViews] = useState<[IdentityView, IdentityView]>([
    INITIAL,
    INITIAL,
  ]);
  const sizes = useRef([
    { width: 1, height: 1 },
    { width: 1, height: 1 },
  ]);
  const onSizes = useRef([
    (s: { width: number; height: number }) => {
      sizes.current[0] = s;
    },
    (s: { width: number; height: number }) => {
      sizes.current[1] = s;
    },
  ]);
  const regions = [
    fullRegion(master ?? { width: 1, height: 1 }),
    autoFit && bounds
      ? bounds.region
      : fullRegion(candidate ?? { width: 1, height: 1 }),
  ];
  useEffect(() => setViews([INITIAL, INITIAL]), [master?.id, candidate?.id]);
  const update = (index: number, next: IdentityView) =>
    setViews((old) => {
      const result: [IdentityView, IdentityView] = [...old];
      result[index] = next;
      if (sync)
        result[1 - index] = linkedIdentityView(
          next,
          regions[index],
          sizes.current[index],
          regions[1 - index],
          sizes.current[1 - index],
        );
      return result;
    });
  return (
    <section
      className="master-compare identity-compare"
      aria-label="Identität und Masterkandidat vergleichen"
    >
      <div className="compare-toolbar">
        <label>
          <input
            type="checkbox"
            checked={sync}
            onChange={(e) => setSync(e.target.checked)}
          />
          Zoom/Pan synchronisieren
        </label>
        <label>
          <input
            type="checkbox"
            checked={autoFit}
            onChange={(e) => {
              setAutoFit(e.target.checked);
              setViews((v) => [v[0], INITIAL]);
            }}
          />
          Sichtbare Figur einpassen
        </label>
        <label>
          Prüfhintergrund{" "}
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
        <button onClick={() => setViews([INITIAL, INITIAL])}>
          Ansicht zurücksetzen
        </button>
      </div>
      <div className="identity-panes">
        <PortraitPane
          label="Identitätsreferenz"
          alt={`${prefix} · Identitätsreferenz`}
          image={master}
          src={before.src}
          region={regions[0]}
          view={views[0]}
          setView={(v) => update(0, v)}
          onSize={onSizes.current[0]}
          backdrop={backdrop}
        />
        <PortraitPane
          label="Masterkandidat"
          alt={`${prefix} · Ergebnisvorschau`}
          image={candidate}
          src={after.src}
          region={regions[1]}
          view={views[1]}
          setView={(v) => update(1, v)}
          onSize={onSizes.current[1]}
          backdrop={backdrop}
        />
      </div>
      <div className="compare-caption">
        <span>
          Angefordert:{" "}
          {requested ? `${requested.width} × ${requested.height} Pixel` : "—"}
        </span>
        <small>
          Unterschiedliche Auflösungen sind für den Identitätsvergleich kein
          Problem. Die Originaldateien bleiben unverändert.
        </small>
      </div>
      {autoFit && (
        <p className="identity-fit-note" role="status">
          {!bounds
            ? "Sichtbaren Bereich prüfen …"
            : bounds.status === "bounded"
              ? `Alpha-Bereich eingepasst · ${bounds.ignored} vereinzelte Randpixel ignoriert (nur Ansicht).`
              : bounds.status === "empty"
                ? "Vollständig transparent · gesamte Leinwand angezeigt."
                : bounds.status === "opaque"
                  ? "Deckendes Bild · gesamte Leinwand eingepasst."
                  : bounds.status === "sparse"
                    ? "Keine zusammenhängende Silhouette · gesamte Leinwand angezeigt."
                    : "Auto-Fit nicht verfügbar (max. 16 MP) · gesamte Leinwand angezeigt."}{" "}
          Keine semantische Figurenerkennung.
        </p>
      )}
      {(before.error || after.error) && (
        <p role="alert">{before.error || after.error}</p>
      )}
      <p className="comparison-review-note">
        Ähnliches Aussehen bestätigt keine freigegebene Identität. Hand ziehen,
        Alt/Leertaste oder Pfeiltasten zum Schwenken; Mausrad zoomt am Cursor.
      </p>
    </section>
  );
}
