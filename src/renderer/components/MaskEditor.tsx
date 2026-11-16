import { useEffect, useRef, useState } from "react";
import type { Project } from "../../shared/domain";
import {
  MAX_MASK_PIXELS,
  commitMask,
  undoMask,
  redoMask,
  paintStroke,
  type MaskHistory,
  type Point,
} from "../../shared/masking";
type Mask = Project["masks"][number];
export function MaskEditor({
  master,
  mask,
  onSave,
  onClose,
  cutout = false,
  initialWeights,
  initialName,
}: {
  master: { id: string; width: number; height: number; version?: number };
  cutout?: boolean;
  initialWeights?: Uint8Array;
  initialName?: string;
  mask?: Mask;
  onSave: (weights: Uint8Array, name: string) => Promise<void>;
  onClose: () => void;
}) {
  const [history, setHistory] = useState<MaskHistory>({
    past: [],
    present: new Uint8Array(master.width * master.height).fill(
      cutout ? 255 : 0,
    ),
    future: [],
  });
  const pixels = useRef(history.present);
  const [src, setSrc] = useState(""),
    [error, setError] = useState("");
  const [ready, setReady] = useState(false),
    [saving, setSaving] = useState(false),
    [dirty, setDirty] = useState(false);
  const [name, setName] = useState(
      mask?.name ?? initialName ?? (cutout ? "Freistellung" : "Gesicht"),
    ),
    [tool, setTool] = useState("paint");
  const [diameter, setDiameter] = useState(24),
    [strength, setStrength] = useState(255),
    [overlay, setOverlay] = useState(!cutout);
  const [zoom, setZoom] = useState(1),
    [pan, setPan] = useState({ x: 0, y: 0 });
  const [size, setSize] = useState({ width: 1, height: 1 });
  const dialog = useRef<HTMLElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null),
    viewport = useRef<HTMLDivElement>(null);
  const gesture = useRef<{
    id: number;
    previous: Point;
    before: Uint8Array;
    pan: Point;
    screen: Point;
    kind: string;
  } | null>(null);
  const fit = Math.min(size.width / master.width, size.height / master.height),
    scale = fit * zoom;
  const originalPixels = useRef<Uint8ClampedArray | null>(null);
  function render(weights: Uint8Array) {
    const ctx = canvas.current?.getContext("2d");
    if (!ctx) return;
    const image = ctx.createImageData(master.width, master.height);
    if (cutout && originalPixels.current) {
      image.data.set(originalPixels.current);
      weights.forEach((w, i) => {
        image.data[i * 4 + 3] = Math.round((image.data[i * 4 + 3] * w) / 255);
        // Tint the actual retained image; never replace it with a mask-only canvas.
        if (overlay) {
          const tint = 0.35;
          for (let channel = 0; channel < 3; channel++)
            image.data[i * 4 + channel] = Math.round(
              image.data[i * 4 + channel] * (1 - tint) +
                [143, 173, 166][channel] * tint,
            );
        }
      });
      ctx.putImageData(image, 0, 0);
      return;
    }
    weights.forEach((w, i) => {
      image.data[i * 4] = 143;
      image.data[i * 4 + 1] = 173;
      image.data[i * 4 + 2] = 166;
      image.data[i * 4 + 3] = Math.round(w * 0.6);
    });
    ctx.putImageData(image, 0, 0);
  }
  useEffect(() => {
    let live = true;
    void (async () => {
      const m = await window.laceframe.preview(master.id);
      if (!m.ok) throw new Error(m.error);
      let weights = initialWeights
        ? new Uint8Array(initialWeights)
        : new Uint8Array(master.width * master.height).fill(cutout ? 255 : 0);
      if (cutout) {
        const img = new Image();
        img.src = m.value;
        await img.decode();
        const c = document.createElement("canvas");
        c.width = master.width;
        c.height = master.height;
        const ctx = c.getContext("2d")!;
        ctx.drawImage(img, 0, 0);
        originalPixels.current = ctx.getImageData(0, 0, c.width, c.height).data;
      }
      if (mask) {
        const r = await window.laceframe.preview(mask.id);
        if (!r.ok) throw new Error(r.error);
        const img = new Image();
        img.src = r.value;
        await img.decode();
        if (
          img.naturalWidth !== master.width ||
          img.naturalHeight !== master.height
        )
          throw new Error("Falsche Maskengröße.");
        const c = document.createElement("canvas");
        c.width = master.width;
        c.height = master.height;
        const ctx = c.getContext("2d")!;
        ctx.drawImage(img, 0, 0);
        const data = ctx.getImageData(0, 0, c.width, c.height).data;
        weights = Uint8Array.from(weights, (_, i) => data[i * 4]);
      }
      if (live) {
        setSrc(m.value);
        setHistory({ past: [], present: weights, future: [] });
        pixels.current = weights;
        setReady(true);
      }
    })().catch((e) => {
      if (live) setError(String(e));
    });
    const element = viewport.current!;
    const resize = () =>
      setSize({ width: element.clientWidth, height: element.clientHeight });
    const observer = new ResizeObserver(resize);
    observer.observe(element);
    resize();
    return () => {
      live = false;
      observer.disconnect();
    };
  }, [master.id, master.width, master.height, mask?.id]);
  useEffect(() => {
    const previous = document.activeElement;
    dialog.current?.querySelector<HTMLInputElement>("input")?.focus();
    return () => {
      if (previous instanceof HTMLElement) previous.focus();
    };
  }, [ready]);
  useEffect(() => {
    pixels.current = history.present;
    render(history.present);
  }, [history, overlay, ready]);
  function apply(next: MaskHistory) {
    setHistory(next);
    setDirty(true);
  }
  function point(e: { clientX: number; clientY: number }): Point {
    const rect = canvas.current!.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) / scale,
      y: (e.clientY - rect.top) / scale,
    };
  }
  function finish(id: number) {
    const g = gesture.current;
    if (!g || id !== g.id) return;
    if (g.kind !== "pan")
      apply(commitMask({ ...history, present: g.before }, pixels.current));
    gesture.current = null;
  }
  return (
    <div className="modal-backdrop">
      <section
        ref={dialog}
        className="modal mask-editor"
        onKeyDown={(e) => {
          if (e.key !== "Tab") return;
          const nodes = Array.from(
            e.currentTarget.querySelectorAll<HTMLElement>(
              "button:not(:disabled), input:not(:disabled), select:not(:disabled), [tabindex='0']",
            ),
          ).filter(
            (n) => n.offsetParent !== null && !n.closest("fieldset:disabled"),
          );
          if (!nodes.length) {
            e.preventDefault();
            return;
          }
          const index = nodes.indexOf(document.activeElement as HTMLElement);
          if (e.shiftKey && index <= 0) {
            e.preventDefault();
            nodes.at(-1)!.focus();
          } else if (!e.shiftKey && (index < 0 || index === nodes.length - 1)) {
            e.preventDefault();
            nodes[0].focus();
          }
        }}
        role="dialog"
        aria-modal="true"
        aria-label={cutout ? "Freistellungsmaske" : "Bearbeitungsmaske"}
      >
        <h2>
          {cutout
            ? "Hintergrund freistellen"
            : "Maske · Master V" + master.version}
        </h2>
        <p>
          {cutout
            ? "Weiß erhält die Figur · Schwarz entfernt · Grau reduziert Alpha. Keine automatische Farbauswahl."
            : "Weiß erlaubt · Schwarz schützt · Grau überblendet."}{" "}
          Gespeichert in {master.width} × {master.height} Masterpixeln. Keine
          KI-Inpainting-Garantie.
        </p>
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        <fieldset disabled={!ready || saving}>
          <div className="mask-toolbar">
            <label>
              Name
              <input
                aria-label="Maskenname"
                value={name}
                maxLength={120}
                onChange={(e) => {
                  setName(e.target.value);
                  setDirty(true);
                }}
              />
            </label>
            <label>
              Werkzeug
              <select
                aria-label="Maskenwerkzeug"
                value={tool}
                onChange={(e) => setTool(e.target.value)}
              >
                <option value="paint">Pinsel</option>
                <option value="erase">Radierer</option>
                <option value="pan">Verschieben</option>
              </select>
            </label>
            <label>
              Pinsel {diameter} px
              <input
                aria-label="Pinselgröße"
                type="range"
                min={1}
                max={Math.max(
                  1,
                  Math.min(512, Math.max(master.width, master.height)),
                )}
                value={diameter}
                onChange={(e) => setDiameter(Number(e.target.value))}
              />
            </label>
            <label>
              Freigabewert {strength}
              <input
                aria-label="Maskenwert"
                type="range"
                min={1}
                max={255}
                value={strength}
                onChange={(e) => setStrength(Number(e.target.value))}
              />
            </label>
            <label>
              <input
                type="checkbox"
                checked={overlay}
                onChange={(e) => setOverlay(e.target.checked)}
              />
              Maskenüberlagerung
            </label>
            <label>
              Zoom
              <select
                aria-label="Maskenzoom"
                value={zoom}
                onChange={(e) => setZoom(Number(e.target.value))}
              >
                {![1, 2, 4, 8, 16].includes(zoom) && (
                  <option value={zoom}>{zoom.toFixed(2)}× Ansicht</option>
                )}
                {[1, 2, 4, 8, 16].map((v) => (
                  <option key={v} value={v}>
                    {v === 1 ? "Einpassen" : `${v}× Ansicht`}
                  </option>
                ))}
              </select>
            </label>
            <button
              disabled={!history.past.length}
              onClick={() => apply(undoMask(history))}
            >
              Rückgängig
            </button>
            <button
              disabled={!history.future.length}
              onClick={() => apply(redoMask(history))}
            >
              Wiederholen
            </button>
            <button
              onClick={() =>
                apply(
                  commitMask(
                    history,
                    new Uint8Array(history.present.length).fill(
                      cutout ? 255 : 0,
                    ),
                  ),
                )
              }
            >
              Maske zurücksetzen
            </button>
            <button
              onClick={() => {
                setPan({ x: 0, y: 0 });
                setZoom(1);
              }}
            >
              Maskenansicht zurücksetzen
            </button>
          </div>
          <div
            ref={viewport}
            className="mask-viewport checker"
            tabIndex={0}
            aria-label="Maskenzeichenfläche"
            onWheel={(e) => {
              if (e.ctrlKey || e.metaKey)
                setZoom((z) =>
                  Math.max(1, Math.min(16, z * (e.deltaY > 0 ? 0.9 : 1.1))),
                );
              else setPan((p) => ({ x: p.x - e.deltaX, y: p.y - e.deltaY }));
            }}
            onKeyDown={(e) => {
              if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
                e.preventDefault();
                apply(e.shiftKey ? redoMask(history) : undoMask(history));
              }
            }}
            onPointerDown={(e) => {
              if (!ready || saving || gesture.current || e.button !== 0) return;
              e.preventDefault();
              e.currentTarget.setPointerCapture(e.pointerId);
              const p = point(e),
                kind = e.altKey ? "pan" : tool;
              gesture.current = {
                id: e.pointerId,
                previous: p,
                before: pixels.current,
                pan,
                screen: { x: e.clientX, y: e.clientY },
                kind,
              };
              if (kind !== "pan") {
                pixels.current = paintStroke(
                  pixels.current,
                  master.width,
                  master.height,
                  p,
                  p,
                  diameter / 2,
                  kind === "erase" ? 0 : strength,
                );
                render(pixels.current);
              }
            }}
            onPointerMove={(e) => {
              const g = gesture.current;
              if (!g || e.pointerId !== g.id) return;
              if (g.kind === "pan")
                setPan({
                  x: g.pan.x + e.clientX - g.screen.x,
                  y: g.pan.y + e.clientY - g.screen.y,
                });
              else {
                const p = point(e);
                pixels.current = paintStroke(
                  pixels.current,
                  master.width,
                  master.height,
                  g.previous,
                  p,
                  diameter / 2,
                  g.kind === "erase" ? 0 : strength,
                );
                g.previous = p;
                render(pixels.current);
              }
            }}
            onPointerUp={(e) => finish(e.pointerId)}
            onPointerCancel={(e) => finish(e.pointerId)}
            onLostPointerCapture={(e) => finish(e.pointerId)}
          >
            <div
              className="mask-stage"
              style={{
                width: master.width,
                height: master.height,
                transform: `translate(${(size.width - master.width * scale) / 2 + pan.x}px, ${(size.height - master.height * scale) / 2 + pan.y}px) scale(${scale})`,
              }}
            >
              {src && !cutout && (
                <img
                  draggable={false}
                  alt="Masken-Master"
                  src={src}
                  width={master.width}
                  height={master.height}
                />
              )}
              <canvas
                ref={canvas}
                width={master.width}
                height={master.height}
                style={{ opacity: cutout || overlay ? 1 : 0 }}
              />
            </div>
          </div>
          <small>
            Rad/Trackpad: verschieben · Strg+Rad: Zoom · Alt+Ziehen: Pan ·
            Strg+Z / Strg+Umschalt+Z.{" "}
            {cutout
              ? "Das Bild wird mit echter Alpha-Transparenz angezeigt. Die optionale Sage-Tönung markiert erhaltene Pixel."
              : "Sage zeigt die erlaubten Pixel."}
          </small>
        </fieldset>
        <div className="button-row">
          <button
            disabled={saving}
            onClick={() => {
              if (
                !dirty ||
                window.confirm("Ungespeicherte Maskenänderungen verwerfen?")
              )
                onClose();
            }}
          >
            Editor schließen
          </button>
          <button
            className="primary"
            disabled={
              !ready ||
              saving ||
              !name.trim() ||
              master.width * master.height > MAX_MASK_PIXELS ||
              gesture.current !== null
            }
            onClick={() => {
              setSaving(true);
              void onSave(history.present, name)
                .then(() => {
                  setDirty(false);
                  onClose();
                })
                .catch((e) => setError(String(e)))
                .finally(() => setSaving(false));
            }}
          >
            {cutout
              ? "Freigestellten Kandidaten speichern"
              : "Maskenrevision speichern"}
          </button>
        </div>
      </section>
    </div>
  );
}
