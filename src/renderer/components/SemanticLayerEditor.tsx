import { useEffect, useMemo, useRef, useState } from "react";
import type { Project, Snapshot } from "../../shared/domain";
import { tr, displayMessage } from "../../shared/locales";
import {
  type LayerDraft,
  type SemanticLayerRole,
  validateLayerMasks,
  MAX_LAYERS,
  layerFromColorRegion,
  expressionLayerDraft,
} from "../../shared/semantic-layers";
import {
  layerHistory,
  commitLayers,
  undoLayers,
  redoLayers,
  paintLayer,
  blockedPixels,
  type LayerHistory,
  selectLayerRegion,
} from "../../shared/layer-editor";
import type { ColorPixels } from "../../shared/color-consistency";
import type { Point } from "../../shared/masking";
import { nativePoint } from "./editor-geometry";
import { PixelViewport } from "./PixelViewport";
import { EditorWorkspace } from "./EditorWorkspace";
export const layerRoleLabels: Record<SemanticLayerRole, string> = {
  hair: "layers.hair",
  skin: "layers.skin",
  eyes: "layers.eyes",
  mouth: "layers.mouth",
  clothing: "layers.clothing",
  accessory: "layers.accessory",
  custom: "layers.custom",
};
const colors: Record<SemanticLayerRole, number[]> = {
  hair: [217, 167, 126],
  skin: [180, 120, 150],
  eyes: [100, 180, 220],
  mouth: [225, 105, 105],
  clothing: [90, 185, 130],
  accessory: [160, 120, 220],
  custom: [220, 200, 100],
};
function defaults(n: number): LayerDraft[] {
  return (Object.keys(layerRoleLabels) as SemanticLayerRole[]).map(
    (role, order) => ({
      id: crypto.randomUUID(),
      role,
      name: tr(layerRoleLabels[role]),
      order,
      visible: true,
      locked: false,
      weights: new Uint8Array(n),
    }),
  );
}
export function SemanticLayerEditor({
  sourceId,
  project,
  onSaved,
  onClose,
}: {
  sourceId: string;
  project: Project;
  onSaved: (s: Snapshot) => void;
  onClose: () => void;
}) {
  const expression = project.assets.find((a) => a.id === sourceId);
  const templates = expression
    ? project.semanticLayerSets.filter(
        (s) => s.sourceId === expression.masterId,
      )
    : [];
  const revisions = project.semanticLayerSets.filter(
      (s) => s.sourceId === sourceId,
    ),
    latest = revisions.at(-1);
  const [templateId, setTemplateId] = useState(
    expression ? (latest?.templateSetId ?? templates.at(-1)?.id ?? "") : "",
  );
  const [importRegion, setImportRegion] = useState("");
  const paletteRegions = project.masterPalettes
    .filter((p) => p.masterId === sourceId)
    .flatMap((p) => p.regions.map((r) => ({ palette: p, region: r })));
  const [source, setSource] = useState<ColorPixels & { sha256: string }>(),
    [history, setHistory] = useState<LayerHistory>(),
    [active, setActive] = useState(""),
    [revision, setRevision] = useState(latest?.id ?? ""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [saving, setSaving] = useState(false);
  const [tool, setTool] = useState("paint"),
    [diameter, setDiameter] = useState(5),
    [tolerance, setTolerance] = useState(8),
    [connected, setConnected] = useState(true),
    [view, setView] = useState("all"),
    [polygon, setPolygon] = useState<Point[]>([]);
  const canvas = useRef<HTMLCanvasElement>(null),
    original = useRef<ImageData | undefined>(undefined),
    worker = useRef<Worker | undefined>(undefined),
    dirty = useRef(false),
    space = useRef(false),
    frame = useRef(0),
    draw = useRef<() => void>(() => {}),
    working = useRef<LayerDraft[] | undefined>(undefined),
    gesture = useRef<
      { id: number; point: Point; blocked: Uint8Array } | undefined
    >(undefined),
    pendingRect = useRef<
      { x0: number; y0: number; x1: number; y1: number } | undefined
    >(undefined);
  const rows = history?.present ?? [],
    current = rows.find((l) => l.id === active);
  const blocked = useMemo(
    () =>
      source
        ? blockedPixels(rows, active, source.width * source.height)
        : new Uint8Array(),
    [rows, active, source],
  );
  const stats = useMemo(
    () => (source && history ? validateLayerMasks(source, rows) : undefined),
    [source, history],
  );
  function requestDraw(rect?: {
    x0: number;
    y0: number;
    x1: number;
    y1: number;
  }) {
    if (!rect && source)
      rect = { x0: 0, y0: 0, x1: source.width - 1, y1: source.height - 1 };
    if (rect) {
      const old = pendingRect.current;
      pendingRect.current = old
        ? {
            x0: Math.min(old.x0, rect.x0),
            y0: Math.min(old.y0, rect.y0),
            x1: Math.max(old.x1, rect.x1),
            y1: Math.max(old.y1, rect.y1),
          }
        : rect;
    }
    if (!frame.current)
      frame.current = requestAnimationFrame(() => {
        frame.current = 0;
        draw.current();
      });
  }
  draw.current = () => {
    const ctx = canvas.current?.getContext("2d"),
      pixels = original.current,
      area = pendingRect.current;
    pendingRect.current = undefined;
    if (!source || !ctx || !pixels || !area) return;
    const layers = working.current ?? rows,
      x0 = Math.max(0, Math.floor(area.x0)),
      y0 = Math.max(0, Math.floor(area.y0)),
      x1 = Math.min(source.width - 1, Math.ceil(area.x1)),
      y1 = Math.min(source.height - 1, Math.ceil(area.y1));
    for (let y = y0; y <= y1; y++)
      for (let x = x0; x <= x1; x++) {
        const i = y * source.width + x,
          k = i * 4;
        let count = 0,
          selected: LayerDraft | undefined;
        for (const layer of layers)
          if (layer.weights[i]) {
            count++;
            if (layer.visible && (view !== "active" || layer.id === active))
              selected = layer;
          }
        for (let c = 0; c < 4; c++) pixels.data[k + c] = source.data[k + c];
        if (
          (view === "active" &&
            !layers.find((l) => l.id === active)?.weights[i]) ||
          (view === "unclassified" && count)
        )
          pixels.data[k + 3] = 0;
        if (
          (view === "all" || view === "active") &&
          selected &&
          source.data[k + 3]
        ) {
          const rgb = count > 1 ? [255, 50, 50] : colors[selected.role];
          for (let c = 0; c < 3; c++)
            pixels.data[k + c] = Math.round(
              source.data[k + c] * 0.5 + rgb[c] * 0.5,
            );
        }
      }
    ctx.putImageData(pixels, 0, 0, x0, y0, x1 - x0 + 1, y1 - y0 + 1);
  };
  useEffect(() => {
    let live = true;
    void window.laceframe
      .analysisSource(sourceId)
      .then(async (r) => {
        if (!r.ok) throw new Error(r.error);
        if (r.value.width * r.value.height > 4_194_304)
          throw new Error(tr("layers.invalidMask"));
        let layers = defaults(r.value.width * r.value.height);
        if (latest) {
          const saved = await window.laceframe.semanticLayers(latest.id);
          if (!saved.ok) throw new Error(saved.error);
          layers = saved.value.layers;
        }
        if (expression && !latest) {
          const template = templates.find((t) => t.id === templateId);
          if (!template) throw new Error(tr("layers.needsTemplate"));
          layers = expressionLayerDraft(
            template,
            r.value.width,
            r.value.height,
            () => crypto.randomUUID(),
          );
        }
        if (live) {
          original.current = new ImageData(r.value.width, r.value.height);
          setSource(r.value);
          setHistory(layerHistory(layers));
          setActive(layers[0]?.id ?? "");
        }
      })
      .catch((e) => {
        if (live) setError(String(e));
      });
    return () => {
      live = false;
      worker.current?.terminate();
      cancelAnimationFrame(frame.current);
    };
  }, [sourceId]);
  useEffect(() => {
    requestDraw();
  }, [source, history, active, view]);
  function change(next: LayerDraft[]) {
    if (!history) return;
    dirty.current = true;
    setHistory(
      commitLayers(
        history,
        next.map((l, order) => ({ ...l, order })),
      ),
    );
    setError("");
  }
  function update(id: string, patch: Partial<LayerDraft>) {
    change(rows.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  }
  function finish() {
    if (!working.current || !history) return;
    const next = working.current;
    working.current = undefined;
    gesture.current = undefined;
    change(next);
  }
  function close() {
    if (saving) return;
    if (!dirty.current || window.confirm(tr("layers.discard"))) onClose();
  }
  function point(e: { clientX: number; clientY: number }) {
    return nativePoint(
      { x: e.clientX, y: e.clientY },
      canvas.current!.getBoundingClientRect(),
      source!,
    );
  }
  function paint(from: Point, to: Point) {
    const g = gesture.current,
      row = working.current?.find((l) => l.id === active);
    if (!g || !row || !source) return;
    paintLayer(
      source,
      row.weights,
      g.blocked,
      from,
      to,
      diameter / 2,
      tool === "erase" ? 0 : 255,
    );
    requestDraw({
      x0: Math.min(from.x, to.x) - diameter,
      y0: Math.min(from.y, to.y) - diameter,
      x1: Math.max(from.x, to.x) + diameter,
      y1: Math.max(from.y, to.y) + diameter,
    });
  }
  function select(options: Parameters<typeof selectLayerRegion>[2]) {
    if (!source || !current || current.locked || busy) return;
    const w = new Worker(
      new URL("../workers/semantic-layers.worker.ts", import.meta.url),
      { type: "module" },
    );
    worker.current = w;
    setBusy(true);
    setError("");
    w.onmessage = (e) => {
      if (worker.current !== w) return;
      w.terminate();
      worker.current = undefined;
      setBusy(false);
      if (e.data.error) {
        setError(e.data.error);
        return;
      }
      const weights = new Uint8Array(current.weights);
      (e.data.weights as Uint8Array).forEach((v, i) => {
        if (v && source.data[i * 4 + 3] && !blocked[i]) weights[i] = 255;
      });
      update(active, { weights });
      setPolygon([]);
    };
    w.onerror = () => {
      w.terminate();
      worker.current = undefined;
      setBusy(false);
      setError(tr("layers.workerError"));
    };
    w.postMessage([source, blocked, options]);
  }
  async function load(id: string) {
    if (dirty.current && !window.confirm(tr("layers.discard"))) return;
    setBusy(true);
    try {
      const r = await window.laceframe.semanticLayers(id);
      if (!r.ok) throw new Error(r.error);
      setHistory(layerHistory(r.value.layers));
      setActive(r.value.layers[0]?.id ?? "");
      setRevision(id);
      if (expression) setTemplateId(r.value.set.templateSetId!);
      dirty.current = id !== latest?.id;
      setError("");
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }
  function changeTemplate(id: string) {
    const template = templates.find((t) => t.id === id);
    if (!source || !template) return;
    if (
      (dirty.current || latest) &&
      !window.confirm(tr("layers.changeTemplate"))
    )
      return;
    try {
      const layers = expressionLayerDraft(
        template,
        source.width,
        source.height,
        () => crypto.randomUUID(),
      );
      setHistory(layerHistory(layers));
      setActive(layers[0]?.id ?? "");
      setTemplateId(id);
      setRevision("");
      dirty.current = true;
      setError("");
    } catch (error) {
      setError(String(error));
    }
  }
  async function importPaletteRegion() {
    const entry = paletteRegions.find(
      (e) => `${e.palette.id}:${e.region.id}` === importRegion,
    );
    if (!entry || !source) return;
    setBusy(true);
    setError("");
    try {
      const result = await window.laceframe.colorPalette(entry.palette.id);
      if (!result.ok) throw new Error(result.error);
      const region = result.value.regions.find(
        (r) => r.id === entry.region.id,
      )!;
      const outside = region.weights.some(
        (v, i) => v && !source.data[i * 4 + 3],
      );
      if (outside && !window.confirm(tr("layers.clipImport"))) return;
      const imported = layerFromColorRegion(
        source,
        region,
        entry.palette.id,
        crypto.randomUUID(),
        rows.length,
        outside,
      );
      change([...rows, imported]);
      setActive(imported.id);
    } catch (error) {
      setError(String(error));
    } finally {
      setBusy(false);
    }
  }
  async function save() {
    if (!source || !history || gesture.current) return;
    setSaving(true);
    try {
      const r = await window.laceframe.command({
        type: "saveSemanticLayers",
        sourceId,
        sourceSha256: source.sha256,
        baseSetId: latest?.id,
        templateSetId: expression ? templateId : undefined,
        layers: rows,
      });
      if (!r.ok) throw new Error(r.error);
      dirty.current = false;
      onSaved(r.value);
      onClose();
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  }
  return (
    <EditorWorkspace
      title={tr("layers.title")}
      className="semantic-layer-workspace"
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-label={tr("layers.title")}
        className="semantic-layer-editor"
        onKeyDownCapture={(e) => {
          if (
            e.code === "Space" &&
            !(e.target as HTMLElement).matches("input,select,textarea")
          )
            space.current = true;
        }}
        onKeyUpCapture={(e) => {
          if (e.code === "Space") space.current = false;
        }}
        onKeyDown={(e) => {
          if ((e.target as HTMLElement).matches("input,select,textarea"))
            return;
          if (e.key === "Escape") {
            e.preventDefault();
            close();
          }
          if (
            (e.ctrlKey || e.metaKey) &&
            e.key.toLowerCase() === "z" &&
            history &&
            !gesture.current &&
            !busy
          ) {
            e.preventDefault();
            dirty.current = true;
            setHistory(e.shiftKey ? redoLayers(history) : undoLayers(history));
          }
        }}
      >
        <header>
          <h2>{tr("layers.title")}</h2>
          <span>{source && `${source.width} × ${source.height}`}</span>
          <button onClick={close} disabled={saving}>
            {tr("layers.close")}
          </button>
        </header>
        {error && (
          <p role="alert" className="error">
            {displayMessage(error)}
          </p>
        )}
        {source && history && (
          <>
            {expression && (
              <div className="semantic-template">
                <label>
                  {tr("layers.template")}
                  <select
                    aria-label={tr("layers.template")}
                    value={templateId}
                    disabled={busy || saving}
                    onChange={(e) => changeTemplate(e.target.value)}
                  >
                    {templates.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.revision}
                      </option>
                    ))}
                  </select>
                </label>
                <span>{tr("layers.templateHint")}</span>
              </div>
            )}
            <div className="semantic-layout">
              <div className="semantic-image">
                <div
                  className="button-row"
                  role="toolbar"
                  aria-label={tr("layers.tools")}
                >
                  {["paint", "erase", "fill", "pick", "polygon", "pan"].map(
                    (id) => (
                      <button
                        key={id}
                        disabled={busy || saving}
                        aria-pressed={tool === id}
                        onClick={() => {
                          setTool(id);
                          setPolygon([]);
                        }}
                      >
                        {tr(
                          (
                            {
                              paint: "layers.paint",
                              erase: "layers.erase",
                              fill: "layers.fill",
                              pick: "layers.pick",
                              polygon: "layers.polygon",
                              pan: "layers.pan",
                            } as Record<string, string>
                          )[id],
                        )}
                      </button>
                    ),
                  )}
                  <label>
                    {tr("layers.size")}
                    <input
                      type="number"
                      min={1}
                      max={128}
                      value={diameter}
                      onChange={(e) =>
                        setDiameter(
                          Math.max(1, Math.min(128, Number(e.target.value))),
                        )
                      }
                    />
                  </label>
                  <label>
                    {tr("layers.tolerance")}
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={tolerance}
                      onChange={(e) =>
                        setTolerance(
                          Math.max(0, Math.min(100, Number(e.target.value))),
                        )
                      }
                    />
                  </label>
                  <label>
                    <input
                      type="checkbox"
                      checked={connected}
                      onChange={(e) => setConnected(e.target.checked)}
                    />
                    {tr("layers.connected")}
                  </label>
                </div>
                <div className="button-row">
                  <label>
                    {tr("layers.preview")}
                    <select
                      aria-label={tr("layers.preview")}
                      value={view}
                      onChange={(e) => setView(e.target.value)}
                    >
                      <option value="all">{tr("layers.all")}</option>
                      <option value="active">{tr("layers.onlyActive")}</option>
                      <option value="original">{tr("layers.original")}</option>
                      <option value="unclassified">
                        {tr("layers.unclassified")}
                      </option>
                    </select>
                  </label>
                  {tool === "polygon" && (
                    <>
                      <button
                        disabled={polygon.length < 3 || busy || current?.locked}
                        onClick={() =>
                          select({ kind: "polygon", points: polygon })
                        }
                      >
                        {tr("layers.applyPolygon")}
                      </button>
                      <button
                        disabled={!polygon.length}
                        onClick={() => setPolygon([])}
                      >
                        {tr("layers.clearPolygon")}
                      </button>
                      <span>
                        {polygon.length} {tr("layers.points")}
                      </span>
                    </>
                  )}
                </div>
                <PixelViewport
                  width={source.width}
                  height={source.height}
                  panMode={tool === "pan"}
                  showHandTool={false}
                >
                  <canvas
                    ref={canvas}
                    width={source.width}
                    height={source.height}
                    aria-label={tr("layers.canvas")}
                    onPointerDown={(e) => {
                      if (
                        e.button !== 0 ||
                        e.altKey ||
                        space.current ||
                        tool === "pan" ||
                        busy ||
                        saving ||
                        !current ||
                        current.locked
                      )
                        return;
                      const p = point(e);
                      if (
                        p.x < 0 ||
                        p.y < 0 ||
                        p.x >= source.width ||
                        p.y >= source.height
                      )
                        return;
                      if (tool === "polygon") {
                        if (polygon.length < 128)
                          setPolygon([
                            ...polygon,
                            { x: Math.floor(p.x), y: Math.floor(p.y) },
                          ]);
                        return;
                      }
                      if (tool === "fill" || tool === "pick") {
                        select({
                          kind: "seed",
                          x: p.x,
                          y: p.y,
                          tolerance,
                          connected: tool === "fill" || connected,
                        });
                        return;
                      }
                      e.preventDefault();
                      e.currentTarget.setPointerCapture(e.pointerId);
                      working.current = rows.map((l) =>
                        l.id === active
                          ? { ...l, weights: new Uint8Array(l.weights) }
                          : l,
                      );
                      gesture.current = { id: e.pointerId, point: p, blocked };
                      paint(p, p);
                    }}
                    onPointerMove={(e) => {
                      const g = gesture.current;
                      if (!g || g.id !== e.pointerId) return;
                      const p = point(e);
                      paint(g.point, p);
                      g.point = p;
                    }}
                    onPointerUp={finish}
                    onPointerCancel={finish}
                    style={{ imageRendering: "pixelated" }}
                  />
                  {polygon.length > 0 && (
                    <svg
                      className="semantic-polygon"
                      viewBox={`0 0 ${source.width} ${source.height}`}
                      aria-hidden="true"
                    >
                      <polyline
                        points={polygon.map((p) => `${p.x},${p.y}`).join(" ")}
                        fill="none"
                        stroke="#D9A77E"
                        strokeWidth={1}
                      />
                    </svg>
                  )}
                </PixelViewport>
              </div>
              <aside aria-label={tr("layers.list")}>
                <div className="button-row">
                  <button
                    disabled={
                      busy ||
                      saving ||
                      rows.length >= MAX_LAYERS ||
                      source.width * source.height * (rows.length + 1) >
                        64 * 1024 * 1024
                    }
                    onClick={() => {
                      const next = {
                        ...defaults(source.width * source.height).at(-1)!,
                        order: rows.length,
                      };
                      change([...rows, next]);
                      setActive(next.id);
                    }}
                  >
                    {tr("layers.add")}
                  </button>
                </div>
                {revisions.length > 0 && (
                  <label>
                    {tr("layers.revision")}
                    <select
                      aria-label={tr("layers.revision")}
                      disabled={busy || saving}
                      value={revision}
                      onChange={(e) => void load(e.target.value)}
                    >
                      <option value="" disabled>
                        {tr("layers.newDraft")}
                      </option>
                      {revisions.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.revision}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                {paletteRegions.length > 0 && (
                  <section className="semantic-import">
                    <label>
                      {tr("layers.importRegion")}
                      <select
                        aria-label={tr("layers.importRegion")}
                        value={importRegion}
                        disabled={busy || saving}
                        onChange={(e) => setImportRegion(e.target.value)}
                      >
                        <option value="">—</option>
                        {paletteRegions.map(({ palette, region }) => (
                          <option
                            key={`${palette.id}:${region.id}`}
                            value={`${palette.id}:${region.id}`}
                          >
                            {palette.revision} · {region.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <button
                      disabled={
                        !importRegion ||
                        busy ||
                        saving ||
                        rows.length >= MAX_LAYERS ||
                        source.width * source.height * (rows.length + 1) >
                          64 * 1024 * 1024
                      }
                      onClick={() => void importPaletteRegion()}
                    >
                      {tr("layers.importButton")}
                    </button>
                    <small>{tr("layers.importHint")}</small>
                  </section>
                )}
                <fieldset disabled={busy || saving}>
                  {rows.map((layer, index) => (
                    <section
                      className="semantic-row"
                      key={layer.id}
                      data-active={active === layer.id}
                    >
                      <button
                        aria-pressed={active === layer.id}
                        onClick={() => setActive(layer.id)}
                      >
                        {layer.name}
                      </button>
                      <label>
                        {tr("layers.name")}
                        <input
                          aria-label={`${tr("layers.name")} ${index + 1}`}
                          disabled={layer.locked}
                          value={layer.name}
                          maxLength={120}
                          onChange={(e) =>
                            update(layer.id, { name: e.target.value })
                          }
                        />
                      </label>
                      {layer.masterLayerId && (
                        <small title={layer.masterLayerId}>
                          {tr("layers.mapped", {
                            id: layer.masterLayerId.slice(0, 8),
                          })}
                        </small>
                      )}
                      <select
                        aria-label={`${tr("layers.role")} ${index + 1}`}
                        disabled={layer.locked}
                        value={layer.role}
                        onChange={(e) =>
                          update(layer.id, {
                            role: e.target.value as SemanticLayerRole,
                            masterLayerId: undefined,
                          })
                        }
                      >
                        {(
                          Object.keys(layerRoleLabels) as SemanticLayerRole[]
                        ).map((role) => (
                          <option key={role} value={role}>
                            {tr(layerRoleLabels[role])}
                          </option>
                        ))}
                      </select>
                      <div className="button-row">
                        <label>
                          <input
                            type="checkbox"
                            aria-label={`${tr("layers.visible")} ${index + 1}`}
                            checked={layer.visible}
                            onChange={(e) =>
                              update(layer.id, { visible: e.target.checked })
                            }
                          />
                          {tr("layers.visible")}
                        </label>
                        <label>
                          <input
                            type="checkbox"
                            aria-label={`${tr("layers.locked")} ${index + 1}`}
                            checked={layer.locked}
                            onChange={(e) =>
                              update(layer.id, { locked: e.target.checked })
                            }
                          />
                          {tr("layers.locked")}
                        </label>
                        <button
                          disabled={layer.locked || index === 0}
                          aria-label={`${tr("layers.up")} ${index + 1}`}
                          onClick={() => {
                            const next = [...rows];
                            [next[index - 1], next[index]] = [
                              next[index],
                              next[index - 1],
                            ];
                            change(next);
                          }}
                        >
                          ↑
                        </button>
                        <button
                          disabled={layer.locked || index === rows.length - 1}
                          aria-label={`${tr("layers.down")} ${index + 1}`}
                          onClick={() => {
                            const next = [...rows];
                            [next[index + 1], next[index]] = [
                              next[index],
                              next[index + 1],
                            ];
                            change(next);
                          }}
                        >
                          ↓
                        </button>
                        <button
                          disabled={layer.locked || rows.length === 1}
                          aria-label={`${tr("layers.remove")} ${index + 1}`}
                          onClick={() => {
                            if (window.confirm(tr("layers.confirmRemove"))) {
                              change(rows.filter((l) => l.id !== layer.id));
                              if (active === layer.id)
                                setActive(
                                  rows.find((l) => l.id !== layer.id)!.id,
                                );
                            }
                          }}
                        >
                          {tr("layers.remove")}
                        </button>
                      </div>
                    </section>
                  ))}
                </fieldset>
              </aside>
            </div>
            <footer>
              <button
                disabled={!history.past.length || busy || saving}
                onClick={() => {
                  dirty.current = true;
                  setHistory(undoLayers(history));
                }}
              >
                {tr("layers.undo")}
              </button>
              <button
                disabled={!history.future.length || busy || saving}
                onClick={() => {
                  dirty.current = true;
                  setHistory(redoLayers(history));
                }}
              >
                {tr("layers.redo")}
              </button>
              <span role="status">{stats && tr("layers.stats", stats)}</span>
              {stats && stats.conflicts > 0 && (
                <strong role="alert">{tr("layers.overlap")}</strong>
              )}
              {busy && (
                <button
                  onClick={() => {
                    worker.current?.terminate();
                    worker.current = undefined;
                    setBusy(false);
                  }}
                >
                  {tr("layers.cancel")}
                </button>
              )}
              <button
                disabled={
                  busy ||
                  saving ||
                  !rows.length ||
                  rows.some((l) => !l.name.trim()) ||
                  !!stats?.conflicts
                }
                onClick={() => void save()}
              >
                {tr("layers.save")}
              </button>
            </footer>
          </>
        )}
      </section>
    </EditorWorkspace>
  );
}
