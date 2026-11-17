import {
  POLYGON_VERSION,
  polygonOperationSchema,
  MAX_POLYGON_POINTS,
  type PolygonOperation,
} from "../../shared/cutout-polygon";
import { useSmartCutout } from "./useSmartCutout";
import {
  MAX_SMART_PIXELS,
  imagePoint,
  type CutoutDraft,
} from "../../shared/smart-cutout";
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
  recipeId,
}: {
  master: { id: string; width: number; height: number; version?: number };
  cutout?: boolean;
  initialWeights?: Uint8Array;
  initialName?: string;
  recipeId?: string;
  mask?: Mask;
  onSave: (
    weights: Uint8Array,
    name: string,
    smart?: CutoutDraft,
  ) => Promise<void>;
  onClose: () => void;
}) {
  const [history, setHistory] = useState<MaskHistory>({
    past: [],
    present: new Uint8Array(master.width * master.height).fill(
      cutout ? 255 : 0,
    ),
    future: [],
  });
  const automatic = cutout && master.width * master.height <= MAX_SMART_PIXELS;
  const smart = useSmartCutout(
    automatic,
    master.id,
    master.width,
    master.height,
    initialWeights,
    recipeId,
  );
  const [showProtected, setShowProtected] = useState(false),
    [showSelection, setShowSelection] = useState(false),
    [view, setView] = useState("result"),
    [backdrop, setBackdrop] = useState("checker");
  const [polygon, setPolygon] = useState<{ points: Point[]; closed: boolean }>({
    points: [],
    closed: false,
  });
  const [polygonPast, setPolygonPast] = useState<(typeof polygon)[]>([]),
    [polygonFuture, setPolygonFuture] = useState<(typeof polygon)[]>([]);
  const [polygonOperation, setPolygonOperation] =
    useState<PolygonOperation["operation"]>("limit");
  const editPolygon = (next: typeof polygon) => {
    setPolygonPast((p) => [...p, polygon].slice(-128));
    setPolygon(next);
    setPolygonFuture([]);
    setError("");
  };
  const discardPolygon = () => {
    setPolygon({ points: [], closed: false });
    setPolygonPast([]);
    setPolygonFuture([]);
    setError("");
  };
  const closePolygon = () => {
    const parsed = polygonOperationSchema.safeParse({
      algorithm: POLYGON_VERSION,
      operation: polygonOperation,
      points: polygon.points,
    });
    if (!parsed.success) {
      setError(
        "Polygon benötigt 3–128 eindeutige Ecken ohne flache Ecken oder Selbstüberschneidung.",
      );
      return;
    }
    editPolygon({ ...polygon, closed: true });
  };
  const undo = () => {
    if (tool === "polygon" && polygonPast.length) {
      setPolygonFuture((f) => [polygon, ...f]);
      setPolygon(polygonPast.at(-1)!);
      setPolygonPast((p) => p.slice(0, -1));
    } else if (automatic) smart.undo();
    else apply(undoMask(history));
  };
  const redo = () => {
    if (tool === "polygon" && polygonFuture.length) {
      setPolygonPast((p) => [...p, polygon]);
      setPolygon(polygonFuture[0]);
      setPolygonFuture((f) => f.slice(1));
    } else if (automatic) smart.redo();
    else apply(redoMask(history));
  };
  const pixels = useRef(history.present);
  const [src, setSrc] = useState(""),
    [error, setError] = useState("");
  const [ready, setReady] = useState(false),
    [saving, setSaving] = useState(false),
    [dirty, setDirty] = useState(false);
  const [name, setName] = useState(
      mask?.name ?? initialName ?? (cutout ? "Freistellung" : "Gesicht"),
    ),
    [tool, setTool] = useState(automatic ? "pick" : "paint");
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
    draft?: CutoutDraft;
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
      const draft = smart.current.current.present;
      const protectedMask = smart.result?.protectedMask ?? draft.protected;
      const forcedMask = smart.result?.forcedMask ?? draft.forced;
      if (automatic && smart.image) image.data.set(smart.image.data);
      weights.forEach((w, i) => {
        if (view !== "original")
          image.data[i * 4 + 3] = Math.round((image.data[i * 4 + 3] * w) / 255);
        if (view === "alpha") {
          image.data[i * 4] =
            image.data[i * 4 + 1] =
            image.data[i * 4 + 2] =
              image.data[i * 4 + 3];
          image.data[i * 4 + 3] = 255;
        }
        if (
          automatic &&
          ((showProtected && protectedMask[i]) ||
            (showSelection &&
              (smart.result?.selection[i] || smart.result?.limited[i])) ||
            (showProtected && forcedMask[i]))
        ) {
          const color = protectedMask[i]
            ? forcedMask[i]
              ? [220, 70, 210]
              : [80, 200, 140]
            : smart.result?.limited[i]
              ? [100, 155, 220]
              : [230, 130, 80];
          for (let c = 0; c < 3; c++)
            image.data[i * 4 + c] = Math.round(
              image.data[i * 4 + c] * 0.5 + color[c] * 0.5,
            );
          image.data[i * 4 + 3] = 255;
        }
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
    render(automatic && smart.result ? smart.result.weights : history.present);
  }, [history, overlay, ready]);
  useEffect(() => {
    if (automatic && smart.result) render(smart.result.weights);
  }, [
    automatic,
    smart.result,
    smart.history.present,
    ready,
    overlay,
    showProtected,
    showSelection,
    view,
  ]);
  function apply(next: MaskHistory) {
    setHistory(next);
    setDirty(true);
  }
  function point(e: { clientX: number; clientY: number }): Point {
    const rect = canvas.current!.getBoundingClientRect();
    return automatic
      ? imagePoint(e, rect, master.width, master.height)
      : {
          x: (e.clientX - rect.left) / scale,
          y: (e.clientY - rect.top) / scale,
        };
  }
  function smartStroke(from: Point, to: Point, kind: string) {
    const d = smart.current.current.present;
    const role = kind.startsWith("protect")
      ? "protected"
      : kind.startsWith("force")
        ? "forced"
        : "manual";
    const value =
      kind.endsWith("erase") || kind === "erase"
        ? 0
        : role === "manual"
          ? strength
          : 255;
    const next = {
      ...d,
      [role]: paintStroke(
        d[role],
        master.width,
        master.height,
        from,
        to,
        diameter / 2,
        value,
      ),
    };
    smart.update(next, false);
    setDirty(true);
  }
  function finish(id: number) {
    const g = gesture.current;
    if (!g || id !== g.id) return;
    if (automatic && g.draft && g.kind !== "pan" && g.kind !== "pick")
      smart.update(smart.current.current.present, true, g.draft);
    else if (g.kind !== "pan" && g.kind !== "pick")
      apply(commitMask({ ...history, present: g.before }, pixels.current));
    gesture.current = null;
  }
  return (
    <div className="modal-backdrop">
      <section
        ref={dialog}
        className={`modal mask-editor ${automatic ? "smart-mask-editor" : ""}`}
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
            ? "Weiß erhält die Figur · Schwarz entfernt · Grau reduziert Alpha. Pipette wählt Hintergrundfarben; Schutz gewinnt. Farbe allein erkennt keine Haare oder Silhouetten."
            : "Weiß erlaubt · Schwarz schützt · Grau überblendet."}{" "}
          Gespeichert in {master.width} × {master.height} Masterpixeln.{" "}
          {cutout
            ? "Keine automatische Erkennung von Haaren oder Silhouetten."
            : "Keine KI-Inpainting-Garantie."}
        </p>
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        {automatic && smart.error && (
          <p role="alert" className="error">
            {smart.error}
          </p>
        )}
        <fieldset disabled={!ready || saving || (automatic && !smart.image)}>
          {automatic && (
            <div className="smart-cutout-controls">
              {tool === "polygon" && (
                <div className="polygon-controls">
                  <p>
                    Linksklick: Ecke · Enter/Doppelklick: schließen · Backspace:
                    letzte Ecke · Escape: verwerfen. Alt+Ziehen verschiebt.
                  </p>
                  <p role="status" aria-label="Polygonstatus">
                    {polygon.points.length} / 128 Ecken ·{" "}
                    {polygon.closed ? "geschlossen" : "offen"}
                  </p>
                  <label>
                    Polygonoperation
                    <select
                      aria-label="Polygonoperation"
                      value={polygonOperation}
                      onChange={(e) =>
                        setPolygonOperation(
                          e.target.value as PolygonOperation["operation"],
                        )
                      }
                    >
                      <option value="limit">
                        Auswahl begrenzen – Automatik nur außerhalb
                      </option>
                      <option value="protect">
                        Figur schützen – innen erhalten
                      </option>
                      <option value="force">
                        Hintergrund entfernen – innen erzwingen
                      </option>
                    </select>
                  </label>
                  <button
                    disabled={polygon.closed || polygon.points.length < 3}
                    onClick={closePolygon}
                  >
                    Polygon schließen
                  </button>
                  <button
                    disabled={
                      !polygon.closed ||
                      (smart.history.present.settings.polygons?.length ?? 0) >=
                        32
                    }
                    onClick={() => {
                      const op = polygonOperationSchema.parse({
                        algorithm: POLYGON_VERSION,
                        operation: polygonOperation,
                        points: polygon.points,
                      });
                      smart.update({
                        ...smart.history.present,
                        settings: {
                          ...smart.history.present.settings,
                          polygons: [
                            ...(smart.history.present.settings.polygons ?? []),
                            op,
                          ],
                        },
                      });
                      discardPolygon();
                      setShowProtected(true);
                    }}
                  >
                    Polygon anwenden
                  </button>
                  <button
                    disabled={!polygon.points.length}
                    onClick={discardPolygon}
                  >
                    Auswahl verwerfen
                  </button>
                </div>
              )}
              {!!smart.history.present.settings.polygons?.length && (
                <details>
                  <summary>
                    Angewendete Polygone (
                    {smart.history.present.settings.polygons.length}/32)
                  </summary>
                  <p>
                    Polygonmasken ergänzen Pinselmasken. Schutz gewinnt. Zum
                    Korrigieren Polygon entfernen oder rückgängig machen.
                  </p>
                  {smart.history.present.settings.polygons.map((op, i) => (
                    <div key={i}>
                      {i + 1}:{" "}
                      {op.operation === "limit"
                        ? "Automatik nur außerhalb"
                        : op.operation === "protect"
                          ? "Figur schützen"
                          : "Hintergrund entfernen"}{" "}
                      · {op.points.length} Ecken
                      <button
                        onClick={() =>
                          smart.update({
                            ...smart.history.present,
                            settings: {
                              ...smart.history.present.settings,
                              polygons:
                                smart.history.present.settings.polygons!.filter(
                                  (_, j) => j !== i,
                                ),
                            },
                          })
                        }
                      >
                        Polygon {i + 1} entfernen
                      </button>
                    </div>
                  ))}
                </details>
              )}

              <label>
                Farbtoleranz · ΔE76 {smart.history.present.settings.tolerance}
                <input
                  aria-label="Farbtoleranz"
                  type="range"
                  min={0}
                  max={100}
                  step={0.5}
                  value={smart.history.present.settings.tolerance}
                  onChange={(e) =>
                    smart.update({
                      ...smart.history.present,
                      settings: {
                        ...smart.history.present.settings,
                        tolerance: Number(e.target.value),
                      },
                    })
                  }
                />
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={smart.history.present.settings.connected}
                  onChange={(e) =>
                    smart.update({
                      ...smart.history.present,
                      settings: {
                        ...smart.history.present.settings,
                        connected: e.target.checked,
                      },
                    })
                  }
                />
                Zusammenhängende Auswahl (4 Nachbarn)
              </label>
              {!smart.history.present.settings.connected && (
                <p className="warning">
                  Globale Farbauswahl aktiv: ähnliche Farben in Kleidung und
                  Haaren zuerst schützen.
                </p>
              )}
              <label>
                Kantenweichheit {smart.history.present.settings.softness} px
                <input
                  aria-label="Kantenweichheit"
                  type="range"
                  min={0}
                  max={8}
                  value={smart.history.present.settings.softness}
                  onChange={(e) =>
                    smart.update({
                      ...smart.history.present,
                      settings: {
                        ...smart.history.present.settings,
                        softness: Number(e.target.value),
                      },
                    })
                  }
                />
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={showProtected}
                  onChange={(e) => setShowProtected(e.target.checked)}
                />
                Schutzmaske anzeigen
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={showSelection}
                  onChange={(e) => setShowSelection(e.target.checked)}
                />
                Auswahl anzeigen
              </label>
              <label>
                Prüfansicht
                <select
                  aria-label="Freistellung Prüfansicht"
                  value={view}
                  onChange={(e) => setView(e.target.value)}
                >
                  <option value="result">Ergebnis</option>
                  <option value="original">Original</option>
                  <option value="alpha">Alpha</option>
                </select>
              </label>
              <label>
                Prüfhintergrund
                <select
                  aria-label="Freistellung Prüfhintergrund"
                  value={backdrop}
                  onChange={(e) => setBackdrop(e.target.value)}
                >
                  <option value="checker">Schachbrett</option>
                  <option value="light">Hell</option>
                  <option value="dark">Dunkel</option>
                </select>
              </label>
              {smart.history.present.settings.seeds.at(-1) && (
                <div className="cutout-seed" aria-label="Aufgenommene Farbe">
                  <i
                    style={{
                      background: `rgb(${smart.history.present.settings.seeds.at(-1)!.rgba.slice(0, 3).join(",")})`,
                    }}
                  />
                  Original ({smart.history.present.settings.seeds.at(-1)!.x},{" "}
                  {smart.history.present.settings.seeds.at(-1)!.y}) · RGBA{" "}
                  {smart.history.present.settings.seeds.at(-1)!.rgba.join(", ")}
                </div>
              )}
              <details>
                <summary>Seeds und erweiterte Auswahl</summary>
                <p>
                  ΔE76: euklidischer Abstand in CIE L*a*b* (sRGB, D65).
                  Vergleich mit den Originalfarben aller Seeds. Kein
                  semantisches Haar-/Kleidungsmodell.
                </p>
                <label>
                  Auswahl erweitern/verkleinern{" "}
                  {smart.history.present.settings.expand} px
                  <input
                    aria-label="Auswahl erweitern"
                    type="range"
                    min={-3}
                    max={3}
                    value={smart.history.present.settings.expand}
                    onChange={(e) =>
                      smart.update({
                        ...smart.history.present,
                        settings: {
                          ...smart.history.present.settings,
                          expand: Number(e.target.value),
                        },
                      })
                    }
                  />
                </label>
                {smart.history.present.settings.seeds.map((seed, i) => (
                  <div className="cutout-seed" key={i}>
                    <i
                      style={{
                        background: `rgba(${seed.rgba[0]},${seed.rgba[1]},${seed.rgba[2]},${seed.rgba[3] / 255})`,
                      }}
                    />
                    Seed {i + 1} · ({seed.x}, {seed.y}) · RGBA{" "}
                    {seed.rgba.join(", ")}
                    <button
                      onClick={() =>
                        smart.update({
                          ...smart.history.present,
                          settings: {
                            ...smart.history.present.settings,
                            seeds: smart.history.present.settings.seeds.filter(
                              (_, k) => k !== i,
                            ),
                          },
                        })
                      }
                    >
                      Seed {i + 1} entfernen
                    </button>
                  </div>
                ))}
              </details>
            </div>
          )}
          {automatic && polygon.points.length > 0 && (
            <p role="status">
              Ungespeichertes Polygon: zum Anwenden oder Verwerfen Polygon/Lasso
              wählen. Speichern erst danach möglich.
            </p>
          )}
          {cutout && !automatic && (
            <p className="warning">
              Über 4 MP: vorhandene manuelle Freistellung bleibt verfügbar;
              automatische Auswahl ohne Skalierung begrenzt.
            </p>
          )}
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
                onChange={(e) => {
                  setTool(e.target.value);
                  if (e.target.value === "auto") smart.resume();
                  if (
                    e.target.value.startsWith("protect") ||
                    e.target.value.startsWith("force")
                  )
                    setShowProtected(true);
                }}
              >
                {automatic && (
                  <>
                    <option value="polygon">Polygon/Lasso</option>
                    <option value="pick">Pipette</option>
                    <option value="auto">Automatischer Hintergrund</option>
                    <option value="protect">Schützen</option>
                    <option value="protect-erase">Schutz radieren</option>
                    <option value="force">Hintergrund erzwingen</option>
                    <option value="force-erase">
                      Erzwungenen Hintergrund radieren
                    </option>
                  </>
                )}
                <option value="paint">
                  {automatic ? "Manuell wiederherstellen" : "Pinsel"}
                </option>
                <option value="erase">
                  {automatic ? "Manuell radieren" : "Radierer"}
                </option>
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
              disabled={
                automatic
                  ? !smart.history.past.length && !polygonPast.length
                  : !history.past.length
              }
              onClick={undo}
            >
              Rückgängig
            </button>
            <button
              disabled={
                automatic
                  ? !smart.history.future.length && !polygonFuture.length
                  : !history.future.length
              }
              onClick={redo}
            >
              Wiederholen
            </button>
            <button
              onClick={() => {
                discardPolygon();
                return automatic
                  ? smart.update({
                      ...smart.history.present,
                      manual: new Uint8Array(master.width * master.height).fill(
                        255,
                      ),
                      protected: new Uint8Array(master.width * master.height),
                      forced: new Uint8Array(master.width * master.height),
                      settings: {
                        seeds: [],
                        tolerance: 8,
                        connected: true,
                        softness: 0,
                        expand: 0,
                      },
                    })
                  : apply(
                      commitMask(
                        history,
                        new Uint8Array(history.present.length).fill(
                          cutout ? 255 : 0,
                        ),
                      ),
                    );
              }}
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
            className={`mask-viewport ${backdrop === "checker" ? "checker" : "cutout-" + backdrop}`}
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
              if (automatic && tool === "polygon") {
                if (e.key === "Escape") {
                  e.preventDefault();
                  discardPolygon();
                  return;
                }
                if (e.key === "Enter") {
                  e.preventDefault();
                  if (!polygon.closed) closePolygon();
                  return;
                }
                if (e.key === "Backspace") {
                  e.preventDefault();
                  editPolygon({
                    points: polygon.points.slice(0, -1),
                    closed: false,
                  });
                  return;
                }
              }
              if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
                e.preventDefault();
                if (e.shiftKey) redo();
                else undo();
              }
            }}
            onDoubleClick={(e) => {
              if (
                automatic &&
                tool === "polygon" &&
                !e.altKey &&
                !polygon.closed
              )
                closePolygon();
            }}
            onPointerDown={(e) => {
              if (!ready || saving || gesture.current || e.button !== 0) return;
              e.preventDefault();
              e.currentTarget.focus();
              if (automatic && tool === "polygon" && !e.altKey) {
                const p = point(e);
                if (
                  polygon.closed ||
                  p.x < 0 ||
                  p.y < 0 ||
                  p.x >= master.width ||
                  p.y >= master.height
                )
                  return;
                if (polygon.points.length >= MAX_POLYGON_POINTS) {
                  setError("Maximal 128 Polygonecken.");
                  return;
                }
                const last = polygon.points.at(-1);
                if (!last || last.x !== p.x || last.y !== p.y)
                  editPolygon({
                    points: [...polygon.points, p],
                    closed: false,
                  });
                return;
              }
              if (
                automatic &&
                (tool === "pick" || tool === "auto") &&
                !e.altKey
              ) {
                const p = point(e);
                const img = smart.image;
                if (
                  !img ||
                  p.x < 0 ||
                  p.y < 0 ||
                  p.x >= master.width ||
                  p.y >= master.height
                )
                  return;
                const rgba = Array.from(
                  img.data.slice(
                    (p.y * master.width + p.x) * 4,
                    (p.y * master.width + p.x) * 4 + 4,
                  ),
                ) as [number, number, number, number];
                if (!rgba[3]) {
                  setError("Pipette: einen sichtbaren Originalpixel wählen.");
                  return;
                }
                if (smart.history.present.settings.seeds.length >= 32) {
                  setError("Maximal 32 Farbseeds.");
                  return;
                }
                setError("");
                smart.update({
                  ...smart.history.present,
                  settings: {
                    ...smart.history.present.settings,
                    seeds: [
                      ...smart.history.present.settings.seeds,
                      { ...p, rgba },
                    ],
                  },
                });
                setDirty(true);
                return;
              }
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
                ...(automatic ? { draft: smart.current.current.present } : {}),
              };
              if (automatic && kind !== "pan") {
                smartStroke(p, p, kind);
              } else if (kind !== "pan") {
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
              else if (automatic) {
                const p = point(e);
                smartStroke(g.previous, p, g.kind);
                g.previous = p;
              } else {
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
              {automatic && (
                <svg
                  className="cutout-polygons"
                  width={master.width}
                  height={master.height}
                  viewBox={`0 0 ${master.width} ${master.height}`}
                  aria-label="Polygonvorschau"
                >
                  {(smart.history.present.settings.polygons ?? []).map(
                    (op, i) => (
                      <polygon
                        key={i}
                        points={op.points.map((p) => `${p.x},${p.y}`).join(" ")}
                        fill="none"
                        stroke={
                          op.operation === "force" ? "#D9A77E" : "#8FADA6"
                        }
                        strokeWidth={1.5 / scale}
                      />
                    ),
                  )}
                  {polygon.points.length > 0 && (
                    <>
                      {polygon.closed ? (
                        <polygon
                          points={polygon.points
                            .map((p) => `${p.x},${p.y}`)
                            .join(" ")}
                          fill="#8FADA640"
                          stroke="#F0E5D3"
                          strokeWidth={2 / scale}
                        />
                      ) : (
                        <polyline
                          points={polygon.points
                            .map((p) => `${p.x},${p.y}`)
                            .join(" ")}
                          fill="none"
                          stroke="#F0E5D3"
                          strokeWidth={2 / scale}
                        />
                      )}
                      {polygon.points.map((p, i) => (
                        <circle
                          key={i}
                          cx={p.x}
                          cy={p.y}
                          r={3 / scale}
                          fill="#D9A77E"
                        />
                      ))}
                    </>
                  )}
                </svg>
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
        {automatic && (
          <p role="status" aria-label="Freistellung Berechnung">
            {smart.cancelled
              ? "Auswahl abgebrochen. Neu berechnen, bevor gespeichert werden kann."
              : smart.running
                ? "Auswahl wird berechnet …"
                : smart.result
                  ? `Vorschau bereit · ${Math.round(smart.result.durationMs)} ms · ${smart.result.removed} reduzierte Maskenpixel · ${smart.result.conflicts} Konflikte (Schutz gewinnt)`
                  : "Original wird geladen …"}
          </p>
        )}
        <div className="button-row">
          {automatic && (
            <>
              <button disabled={!smart.running} onClick={smart.cancel}>
                Auswahl abbrechen
              </button>
              <button
                disabled={smart.running || !smart.image}
                onClick={smart.resume}
              >
                Auswahl neu berechnen
              </button>
            </>
          )}
          <button
            disabled={saving}
            onClick={() => {
              if (
                (!dirty && !smart.dirty && !polygon.points.length) ||
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
              (automatic && (!smart.ready || polygon.points.length > 0)) ||
              saving ||
              !name.trim() ||
              master.width * master.height > MAX_MASK_PIXELS ||
              gesture.current !== null
            }
            onClick={() => {
              setSaving(true);
              void onSave(
                automatic ? smart.result!.weights : history.present,
                name,
                automatic ? smart.history.present : undefined,
              )
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
