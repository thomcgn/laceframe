import { SelectionEditor } from "../editing/SelectionEditor";
import { tr } from "../../shared/locales/index";
import { useCanvasFocus, canvasOwnsFocus } from "./canvas-focus";
import { EditorWorkspace } from "./EditorWorkspace";
import { cutoutFrame } from "./cutout-preview";
import { EditorTools, editorTools } from "./EditorTools";
import {
  fitScale,
  anchoredPan,
  nativePoint,
  brushTools,
  toolShortcut,
} from "./editor-geometry";
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
import { EDITING_MAX_PIXELS } from "../../shared/editing";
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
  contextLabel,
}: {
  master: { id: string; width: number; height: number; version?: number };
  cutout?: boolean;
  initialWeights?: Uint8Array;
  initialName?: string;
  recipeId?: string;
  contextLabel?: {
    title: string;
    description: string;
    saveLabel: string;
    readOnlyName?: boolean;
  };
  mask?: Mask;
  onSave: (
    weights: Uint8Array,
    name: string,
    smart?: CutoutDraft,
  ) => Promise<void>;
  onClose: () => void;
}) {
  const [sharedSelection,setSharedSelection]=useState(false);
  const [selectionTarget,setSelectionTarget]=useState<"manual"|"protected"|"forced">("protected");
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
    [showForced, setShowForced] = useState(false),
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
      setError(tr("editing.mc5f7517518"));
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
  const [sourceError, setSourceError] = useState("");
  const [paintError, setPaintError] = useState("");
  const [src, setSrc] = useState(""),
    [error, setError] = useState("");
  const [painted, setPainted] = useState(false);
  const [paintedResult, setPaintedResult] = useState<typeof smart.result>();
  const [paintedWeights, setPaintedWeights] = useState<Uint8Array>();
  const [loadRevision, setLoadRevision] = useState(0);
  const [ready, setReady] = useState(false),
    [saving, setSaving] = useState(false),
    [dirty, setDirty] = useState(false);
  const [name, setName] = useState(
      mask?.name ??
        initialName ??
        (cutout ? "Freistellung" : tr("common.m9e0bf93e1a")),
    ),
    [tool, setTool] = useState(automatic ? "pick" : "paint");
  const [diameter, setDiameter] = useState(24),
    [strength, setStrength] = useState(255),
    [overlay, setOverlay] = useState(!cutout);
  const [zoom, setZoom] = useState(1),
    [fitView, setFitView] = useState(true),
    [temporaryHand, setTemporaryHand] = useState(false),
    [strokeActive, setStrokeActive] = useState(false),
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
  const fit = fitScale(size, master),
    scale = fitView ? fit : zoom;
  const cursor = useRef<HTMLDivElement>(null),
    rubberBand = useRef<SVGLineElement>(null);
  const hover = useRef<{ clientX: number; clientY: number } | null>(null);
  const held = useRef({ alt: false, space: false });
  const frame = useRef(0),
    liveRender = useRef<() => void>(() => {});
  const finishRef = useRef<(id: number) => void>(() => {});
  function requestRender() {
    if (!frame.current)
      frame.current = requestAnimationFrame(() => {
        frame.current = 0;
        liveRender.current();
      });
  }
  function chooseTool(id: string) {
    if (gesture.current) finish(gesture.current.id);
    setTool(id);
    if (id === "auto") smart.resume();
    if (id.startsWith("protect")) setShowProtected(true);
    if (id.startsWith("force")) setShowForced(true);
  }
  function zoomAt(
    next: number,
    anchor = { x: size.width / 2, y: size.height / 2 },
  ) {
    next = Math.max(Math.min(fit, 1 / 64), Math.min(Math.max(16, fit), next));
    setPan(anchoredPan(size, master, pan, scale, next, anchor));
    setZoom(next);
    setFitView(false);
  }
  function fitImage() {
    setFitView(true);
    setPan({ x: 0, y: 0 });
  }
  function updateCursor() {
    const node = cursor.current,
      e = hover.current,
      rect = viewport.current?.getBoundingClientRect();
    if (!node || !e || !rect) return;
    const p = point(e),
      hand =
        tool === "pan" ||
        held.current.alt ||
        held.current.space ||
        gesture.current?.kind === "pan";
    node.hidden =
      hand ||
      !brushTools.has(tool) ||
      p.x < 0 ||
      p.y < 0 ||
      p.x >= master.width ||
      p.y >= master.height;
    node.style.left = `${e.clientX - rect.left - viewport.current!.clientLeft}px`;
    node.style.top = `${e.clientY - rect.top - viewport.current!.clientTop}px`;
    node.style.width = node.style.height = `${diameter * scale}px`;
    node.dataset.nativeX = String(p.x);
    node.dataset.nativeY = String(p.y);
    if (rubberBand.current) {
      rubberBand.current.setAttribute("x2", String(p.x));
      rubberBand.current.setAttribute("y2", String(p.y));
      rubberBand.current.style.display = hand ? "none" : "";
    }
  }
  useCanvasFocus(viewport);
  useEffect(() => {
    updateCursor();
  }, [tool, diameter, scale, pan, size, temporaryHand, polygon, strokeActive]);
  useEffect(() => {
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const blur = () => {
      if (gesture.current) finishRef.current(gesture.current.id);
      held.current = { alt: false, space: false };
      setTemporaryHand(false);
      hover.current = null;
      if (cursor.current) cursor.current.hidden = true;
    };
    const up = (e: KeyboardEvent) => {
      if (e.key === "Alt") held.current.alt = false;
      if (e.code === "Space") held.current.space = false;
      setTemporaryHand(held.current.alt || held.current.space);
    };
    window.addEventListener("blur", blur);
    window.addEventListener("keyup", up);
    return () => {
      cancelAnimationFrame(frame.current);
      frame.current = 0;
      document.body.style.overflow = overflow;
      window.removeEventListener("blur", blur);
      window.removeEventListener("keyup", up);
    };
  }, []);
  const originalPixels = useRef<Uint8ClampedArray | null>(null);
  function render(weights: Uint8Array) {
    const ctx = canvas.current?.getContext("2d");
    if (!ctx) return;
    const image = ctx.createImageData(master.width, master.height);
    if (cutout) {
      const source = automatic
        ? smart.image
        : originalPixels.current
          ? {
              width: master.width,
              height: master.height,
              data: originalPixels.current,
            }
          : undefined;
      if (!source) return;
      const draft = smart.current.current.present;
      const result = smart.result;
      const protectedMask = draft.protected,
        forcedMask = draft.forced;
      const protectedAt = (i: number) =>
        protectedMask[i] || result?.polygonProtected[i];
      const forcedAt = (i: number) => forcedMask[i] || result?.polygonForced[i];
      if (automatic && result && result.draft !== draft)
        weights = Uint8Array.from(weights, (_, i) =>
          protectedAt(i)
            ? 255
            : forcedAt(i)
              ? 0
              : Math.round(
                  (draft.manual[i] * (255 - result.selection[i])) / 255,
                ),
        );
      image.data.set(cutoutFrame(source, weights, view));
      weights.forEach((_, i) => {
        if (
          automatic &&
          view !== "original" &&
          ((showProtected && protectedAt(i)) ||
            (showSelection &&
              (smart.result?.selection[i] || smart.result?.limited[i])) ||
            (showForced && forcedAt(i)))
        ) {
          const color = protectedAt(i)
            ? forcedAt(i)
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
        if (overlay && view !== "original") {
          const tint = 0.35;
          for (let channel = 0; channel < 3; channel++)
            image.data[i * 4 + channel] = Math.round(
              image.data[i * 4 + channel] * (1 - tint) +
                [143, 173, 166][channel] * tint,
            );
        }
      });
      ctx.putImageData(image, 0, 0);
      setPainted(true);
      setPaintedResult(smart.result);
      setPaintedWeights(weights);
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
      setReady(false);
      setPainted(false);
      setPaintedResult(undefined);
      setPaintedWeights(undefined);
      setSourceError("");
      setPaintError("");
      originalPixels.current = null;
      if (automatic) {
        return;
      }
      const m = await window.laceframe.preview(master.id);
      if (!m.ok) throw new Error(m.error);
      let weights = initialWeights
        ? new Uint8Array(initialWeights)
        : new Uint8Array(master.width * master.height).fill(cutout ? 255 : 0);
      if (cutout) {
        const img = new Image();
        img.src = m.value;
        await img.decode();
        if (
          img.naturalWidth !== master.width ||
          img.naturalHeight !== master.height
        )
          throw new Error(tr("editing.m759c699781"));
        const c = document.createElement("canvas");
        c.width = master.width;
        c.height = master.height;
        const ctx = c.getContext("2d")!;
        ctx.drawImage(img, 0, 0);
        if (!live) return;
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
          throw new Error(tr("editing.m7bf8afb4b4"));
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
      if (live)
        setSourceError(
          e instanceof Error ? e.message : tr("editing.ma4c83dff0c"),
        );
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
  }, [
    master.id,
    master.width,
    master.height,
    mask?.id,
    automatic,
    loadRevision,
  ]);
  useEffect(() => {
    if (automatic) {
      setReady(Boolean(smart.image));
      if (!smart.image) {
        setPainted(false);
        setPaintedResult(undefined);
      }
    }
  }, [automatic, smart.image]);
  useEffect(() => {
    const previous = document.activeElement;
    dialog.current?.querySelector<HTMLInputElement>("input")?.focus();
    return () => {
      if (previous instanceof HTMLElement) previous.focus();
    };
  }, [ready]);
  liveRender.current = () => {
    try {
      render(
        automatic
          ? (smart.result?.weights ?? smart.history.present.manual)
          : pixels.current,
      );
    } catch (e) {
      setPainted(false);
      setPaintError(e instanceof Error ? e.message : tr("editing.m9c78b3cf6a"));
    }
  };
  useEffect(() => {
    pixels.current = history.present;
    requestRender();
  }, [history, overlay, ready, view]);
  useEffect(() => {
    if (automatic && smart.image) requestRender();
  }, [
    automatic,
    smart.image,
    smart.result,
    smart.history.present,
    ready,
    overlay,
    showProtected,
    showForced,
    showSelection,
    view,
  ]);
  function apply(next: MaskHistory) {
    setHistory(next);
    setDirty(true);
  }
  function point(e: { clientX: number; clientY: number }): Point {
    const rect = canvas.current!.getBoundingClientRect();
    return nativePoint({ x: e.clientX, y: e.clientY }, rect, master);
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
    requestRender();
  }
  function finish(id: number) {
    const g = gesture.current;
    if (!g || id !== g.id) return;
    if (automatic && g.draft && g.kind !== "pan" && g.kind !== "pick")
      smart.update(smart.current.current.present, true, g.draft);
    else if (g.kind !== "pan" && g.kind !== "pick")
      apply(commitMask({ ...history, present: g.before }, pixels.current));
    gesture.current = null;
    setStrokeActive(false);
    if (viewport.current?.hasPointerCapture(id))
      viewport.current.releasePointerCapture(id);
    requestRender();
  }
  finishRef.current = finish;
  return (
    <EditorWorkspace
      title={tr("editing.mc24995c6c3")}
      className="precision-backdrop"
    >
      <section
        ref={dialog}
        className={`modal mask-editor precision-editor ${automatic ? "smart-mask-editor" : ""}`}
        onKeyDown={(e) => {
          if (e.defaultPrevented) return;
          const target = e.target as HTMLElement;
          const text = target.matches(
            "input,textarea,select,[contenteditable=true]",
          );
          if (!text && e.key !== "Tab") {
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
              e.preventDefault();
              if (!gesture.current) {
                if (e.shiftKey) redo();
                else undo();
              }
              return;
            }
            if (
              e.key === "Alt" ||
              (e.code === "Space" && !target.closest("button"))
            ) {
              e.preventDefault();
              if (gesture.current && gesture.current.kind !== "pan")
                finish(gesture.current.id);
              if (e.key === "Alt") held.current.alt = true;
              else held.current.space = true;
              setTemporaryHand(true);
              return;
            }
            if (!e.ctrlKey && !e.metaKey && !(e.altKey || held.current.space)) {
              const next = toolShortcut(e.key);
              if (
                next &&
                (automatic || ["paint", "erase", "pan"].includes(next))
              ) {
                e.preventDefault();
                chooseTool(next);
                return;
              }
              if (e.key === "[" || e.key === "]") {
                e.preventDefault();
                setDiameter((d) =>
                  Math.max(1, Math.min(512, d + (e.key === "]" ? 1 : -1))),
                );
                return;
              }
            }
          }
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
        aria-label={
          contextLabel?.title ??
          (cutout ? tr("editing.mc2b3dac5f8") : tr("editing.macf9d2f8a2"))
        }
      >
        <h2>
          {contextLabel?.title ??
            (cutout
              ? tr("editing.m46746f197e")
              : tr("editing.md1e9772fdb") + master.version)}
        </h2>
        <div className="button-row">
          {automatic && <label>{tr("canvas.maskTarget")}<select aria-label={tr("canvas.maskTarget")} value={selectionTarget} onChange={e=>setSelectionTarget(e.target.value as typeof selectionTarget)}>
            <option value="protected">{tr("canvas.protected")}</option><option value="forced">{tr("canvas.forced")}</option><option value="manual">{tr("canvas.retained")}</option>
          </select></label>}
          {master.width*master.height>EDITING_MAX_PIXELS&&<small>{tr("canvas.limit")}</small>}
          <button disabled={!ready||saving||master.width*master.height>EDITING_MAX_PIXELS||automatic&&!smart.ready} onClick={()=>setSharedSelection(true)}>{tr("canvas.open")}</button>
        </div>
        <p className="editor-description">
          {contextLabel?.description ??
            (cutout
              ? tr("editing.m9f175304b7")
              : tr("editing.m09f975d26d"))}{" "}
          {master.width} × {master.height} {tr("editing.me46004ecb1")}
        </p>
        {(error || sourceError || paintError) && (
          <p role="alert" className="error">
            {error || sourceError || paintError}
          </p>
        )}
        {(error ||
          sourceError ||
          paintError ||
          (automatic && (smart.error || smart.loadError))) && (
          <button
            disabled={saving}
            onClick={() => {
              setError("");
              setSourceError("");
              setPaintError("");
              setPainted(false);
              if (automatic) {
                if (smart.loadError) smart.retryLoad();
                else smart.resume();
              } else setLoadRevision((v) => v + 1);
            }}
          >
            {tr("editing.m948643cb59")}
          </button>
        )}
        {automatic && (smart.error || smart.loadError) && (
          <p role="alert" className="error">
            {smart.loadError || smart.error}
          </p>
        )}
        <EditorTools
          automatic={automatic}
          tool={tool}
          onSelect={chooseTool}
          disabled={!ready || saving || !!(automatic && !smart.image)}
        />
        <fieldset
          className="editor-workspace"
          disabled={!ready || saving || (automatic && !smart.image)}
        >
          <aside
            className="editor-sidebar"
            aria-label={tr("editing.mc62add472a")}
          >
            <h3>{editorTools.find((t) => t.id === tool)?.name}</h3>
            <p className="tool-help">
              {tool.startsWith("protect")
                ? tr("editing.m4226f9cdc7")
                : tool.startsWith("force")
                  ? tr("editing.m0dbb2844bd")
                  : tool === "paint"
                    ? cutout
                      ? tr("editing.m0002330323")
                      : tr("editing.m0d2e262c81")
                    : tool === "erase"
                      ? cutout
                        ? tr("editing.md4cbd106cc")
                        : tr("editing.m7f07ea450c")
                      : tool === "pan"
                        ? tr("editing.ma51ee50487")
                        : tool === "polygon"
                          ? tr("editing.m25324458ec")
                          : tr("editing.mf8e4e12b56")}
            </p>
            {automatic && (
              <div className="smart-cutout-controls">
                {tool === "polygon" && (
                  <div className="polygon-controls">
                    <p>{tr("editing.md0ca940fca")}</p>
                    <p role="status" aria-label={tr("editing.m2115452e2a")}>
                      {polygon.points.length} {tr("common.mdb944f50f9")}{" "}
                      {polygon.closed ? "geschlossen" : "offen"}
                    </p>
                    <label>
                      {tr("editing.m2e66a6a768")}
                      <select
                        aria-label={tr("editing.m2e66a6a768")}
                        value={polygonOperation}
                        onChange={(e) =>
                          setPolygonOperation(
                            e.target.value as PolygonOperation["operation"],
                          )
                        }
                      >
                        <option value="limit">
                          {tr("editing.m15fcea76cb")}
                        </option>
                        <option value="protect">
                          {tr("editing.m0f192a1339")}
                        </option>
                        <option value="force">
                          {tr("editing.m375c329e9d")}
                        </option>
                      </select>
                    </label>
                    <button
                      disabled={polygon.closed || polygon.points.length < 3}
                      onClick={closePolygon}
                    >
                      {tr("editing.m941824a482")}
                    </button>
                    <button
                      disabled={
                        !polygon.closed ||
                        (smart.history.present.settings.polygons?.length ??
                          0) >= 32
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
                              ...(smart.history.present.settings.polygons ??
                                []),
                              op,
                            ],
                          },
                        });
                        discardPolygon();
                        setShowProtected(true);
                      }}
                    >
                      {tr("editing.m1a54bd6cee")}
                    </button>
                    <button
                      disabled={!polygon.points.length}
                      onClick={discardPolygon}
                    >
                      {tr("editing.m8c5fb043c1")}
                    </button>
                  </div>
                )}
                {tool === "polygon" &&
                  !!smart.history.present.settings.polygons?.length && (
                    <section className="applied-polygons">
                      <h4>
                        {tr("editing.ma86c640b95")}
                        {smart.history.present.settings.polygons.length}/32)
                      </h4>
                      <p>{tr("editing.m66499ed85b")}</p>
                      {smart.history.present.settings.polygons.map((op, i) => (
                        <div key={i}>
                          {i + 1}:{" "}
                          {op.operation === "limit"
                            ? tr("editing.m9324e9b3cd")
                            : op.operation === "protect"
                              ? tr("editing.m641a8b7525")
                              : tr("editing.m8c4b169e0b")}{" "}
                          · {op.points.length} {tr("editing.meb43e9f3bb")}
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
                            {tr("editing.m0ef705dd99")}
                            {i + 1} {tr("editing.mc64e600651")}
                          </button>
                        </div>
                      ))}
                    </section>
                  )}

                <div
                  className="color-selection-settings"
                  hidden={!["pick", "auto"].includes(tool)}
                >
                  <label>
                    {tr("editing.m554b6b4de2")}
                    {smart.history.present.settings.tolerance}
                    <input
                      aria-label={tr("editing.m554b6b4de2")}
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
                    {tr("editing.m3fb949a5eb")}
                  </label>
                  {!smart.history.present.settings.connected && (
                    <p className="warning">{tr("editing.mf69c437179")}</p>
                  )}
                  <label>
                    {tr("editing.mecbb5dfd36")}
                    {smart.history.present.settings.softness}{" "}
                    {tr("editing.m6ee2cc105a")}
                    <input
                      aria-label={tr("editing.mecbb5dfd36")}
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
                  <button
                    disabled={smart.running || !smart.image}
                    onClick={smart.resume}
                  >
                    {tr("editing.m0f6b69b015")}
                  </button>{" "}
                </div>
                {["pick", "auto"].includes(tool) && (
                  <>
                    {smart.history.present.settings.seeds.at(-1) && (
                      <div
                        className="cutout-seed"
                        aria-label={tr("editing.mf559a5e704")}
                      >
                        <i
                          style={{
                            background: `rgb(${smart.history.present.settings.seeds.at(-1)!.rgba.slice(0, 3).join(",")})`,
                          }}
                        />
                        {tr("editing.md835bf1b24")}
                        {smart.history.present.settings.seeds.at(-1)!.x},{" "}
                        {smart.history.present.settings.seeds.at(-1)!.y}
                        {tr("editing.m40c9c1a120")}{" "}
                        {smart.history.present.settings.seeds
                          .at(-1)!
                          .rgba.join(", ")}
                      </div>
                    )}
                    <section aria-label={tr("editing.m1dcc7a96cf")}>
                      <h4>{tr("editing.m1dcc7a96cf")}</h4>
                      {smart.history.present.settings.seeds.map((seed, i) => (
                        <div className="cutout-seed" key={i}>
                          <i
                            style={{
                              background: `rgba(${seed.rgba[0]},${seed.rgba[1]},${seed.rgba[2]},${seed.rgba[3] / 255})`,
                            }}
                          />
                          {tr("editing.mac31c0c1c7")}
                          {i + 1} · ({seed.x}, {seed.y}
                          {tr("editing.m40c9c1a120")} {seed.rgba.join(", ")}
                          <button
                            onClick={() =>
                              smart.update({
                                ...smart.history.present,
                                settings: {
                                  ...smart.history.present.settings,
                                  seeds:
                                    smart.history.present.settings.seeds.filter(
                                      (_, k) => k !== i,
                                    ),
                                },
                              })
                            }
                          >
                            {tr("editing.mac31c0c1c7")}
                            {i + 1} {tr("editing.mc64e600651")}
                          </button>
                        </div>
                      ))}
                    </section>
                  </>
                )}
              </div>
            )}
            {automatic && polygon.points.length > 0 && (
              <p role="status">{tr("editing.mf3ee2e4a05")}</p>
            )}
            {cutout && !automatic && (
              <p className="warning">{tr("editing.mc631ce26ea")}</p>
            )}
            <div className="mask-toolbar">
              <div hidden={!brushTools.has(tool)} className="brush-settings">
                <label>
                  {tr("editing.m7a33cf442e")}
                  {diameter} {tr("editing.m6ee2cc105a")}
                  <input
                    aria-label={tr("editing.m3c2a0aef71")}
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
                <label hidden={!["paint"].includes(tool)}>
                  {tr("editing.m02fbc19ead")}
                  {strength}/255
                  <input
                    aria-label={tr("editing.m935facf93b")}
                    type="range"
                    min={1}
                    max={255}
                    value={strength}
                    onChange={(e) => setStrength(Number(e.target.value))}
                  />
                </label>
              </div>
            </div>
            <details className="editor-advanced">
              <summary>{tr("editing.m25e56ee28c")}</summary>{" "}
              <label>
                {tr("editing.mdcd1d5223f")}
                <input
                  aria-label={tr("editing.md2a8e3aa01")}
                  readOnly={contextLabel?.readOnlyName}
                  value={name}
                  maxLength={120}
                  onChange={(e) => {
                    setName(e.target.value);
                    setDirty(true);
                  }}
                />
              </label>
              {automatic && ["pick", "auto"].includes(tool) && (
                <>
                  {" "}
                  <p>{tr("editing.m3ea4f370ce")}</p>
                  <label>
                    {tr("editing.m4ab7f93d0c")}{" "}
                    {smart.history.present.settings.expand}{" "}
                    {tr("editing.m6ee2cc105a")}
                    <input
                      aria-label={tr("editing.md9c5d6b96e")}
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
                </>
              )}{" "}
              <button
                onClick={() => {
                  discardPolygon();
                  return automatic
                    ? smart.update({
                        ...smart.history.present,
                        manual: new Uint8Array(
                          master.width * master.height,
                        ).fill(255),
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
                {tr("editing.m451cbb0d2f")}
              </button>
            </details>
            <small>
              {tr("editing.m2759c36ff5")}
              {editorTools.find((t) => t.id === tool)?.name}
            </small>
          </aside>
          <div className="editor-image-area">
            {cutout ? (
              <div
                className="editor-display"
                aria-label={tr("editing.mf1dd73c822")}
              >
                <label>
                  <input
                    type="checkbox"
                    checked={showProtected}
                    onChange={(e) => setShowProtected(e.target.checked)}
                  />
                  {tr("editing.m6bb8d06abf")}
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={showForced}
                    onChange={(e) => setShowForced(e.target.checked)}
                  />
                  {tr("editing.m7bf46f1127")}
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={showSelection}
                    onChange={(e) => setShowSelection(e.target.checked)}
                  />
                  {tr("editing.m28b3f6225d")}
                </label>
                <label>
                  {tr("editing.mdc6710c419")}
                  <select
                    aria-label={tr("editing.m3121894d49")}
                    value={view}
                    onChange={(e) => setView(e.target.value)}
                  >
                    <option value="result">{tr("editing.mcd8e22cf74")}</option>
                    <option value="original">
                      {tr("editing.m88d759ea02")}
                    </option>
                    <option value="alpha">{tr("editing.mb1a96dd646")}</option>
                  </select>
                </label>
                <label>
                  {tr("editing.mc4c1257fa2")}
                  <select
                    aria-label={tr("editing.m51a08de9a6")}
                    value={backdrop}
                    onChange={(e) => setBackdrop(e.target.value)}
                  >
                    <option value="checker">{tr("editing.m678c83f245")}</option>
                    <option value="light">{tr("editing.m8d586f8b60")}</option>
                    <option value="dark">{tr("editing.m368b231be4")}</option>
                  </select>
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={overlay}
                    onChange={(e) => setOverlay(e.target.checked)}
                  />
                  {tr("editing.m5fac9ed775")}
                </label>
              </div>
            ) : (
              <div className="editor-display">
                {" "}
                <label>
                  <input
                    type="checkbox"
                    checked={overlay}
                    onChange={(e) => setOverlay(e.target.checked)}
                  />
                  {tr("editing.m5fac9ed775")}
                </label>
              </div>
            )}
            <div
              ref={viewport}
              className={`mask-viewport ${backdrop === "checker" ? "checker" : "cutout-" + backdrop}`}
              tabIndex={0}
              aria-label={tr("editing.m9b2713981d")}
              style={{
                cursor:
                  tool === "pan" ||
                  temporaryHand ||
                  gesture.current?.kind === "pan"
                    ? strokeActive
                      ? "grabbing"
                      : "grab"
                    : brushTools.has(tool)
                      ? "none"
                      : "crosshair",
              }}
              onWheel={(e) => {
                if (!canvasOwnsFocus(e.currentTarget)) return;
                e.preventDefault();
                if (gesture.current) return;
                if (e.shiftKey || Math.abs(e.deltaX) > Math.abs(e.deltaY))
                  setPan((p) => ({ x: p.x - e.deltaX, y: p.y - e.deltaY }));
                else {
                  const rect = e.currentTarget.getBoundingClientRect();
                  zoomAt(scale * Math.exp(-e.deltaY * 0.002), {
                    x: e.clientX - rect.left - e.currentTarget.clientLeft,
                    y: e.clientY - rect.top - e.currentTarget.clientTop,
                  });
                }
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
                  !(e.altKey || held.current.space) &&
                  !polygon.closed
                )
                  closePolygon();
              }}
              onPointerDown={(e) => {
                if (!ready || saving || gesture.current || e.button !== 0)
                  return;
                e.preventDefault();
                e.currentTarget.focus();
                if (
                  automatic &&
                  tool === "polygon" &&
                  !(e.altKey || held.current.space)
                ) {
                  const p = imagePoint(
                    e,
                    canvas.current!.getBoundingClientRect(),
                    master.width,
                    master.height,
                  );
                  if (
                    polygon.closed ||
                    p.x < 0 ||
                    p.y < 0 ||
                    p.x >= master.width ||
                    p.y >= master.height
                  )
                    return;
                  if (polygon.points.length >= MAX_POLYGON_POINTS) {
                    setError(tr("editing.m0a63edd8a2"));
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
                  !(e.altKey || held.current.space)
                ) {
                  const p = imagePoint(
                    e,
                    canvas.current!.getBoundingClientRect(),
                    master.width,
                    master.height,
                  );
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
                    setError(tr("editing.m57912e24e5"));
                    return;
                  }
                  if (smart.history.present.settings.seeds.length >= 32) {
                    setError(tr("editing.m73b386d147"));
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
                setStrokeActive(true);
                const p = point(e),
                  kind = e.altKey || held.current.space ? "pan" : tool;
                gesture.current = {
                  id: e.pointerId,
                  previous: p,
                  before: pixels.current,
                  pan,
                  screen: { x: e.clientX, y: e.clientY },
                  kind,
                  ...(automatic
                    ? { draft: smart.current.current.present }
                    : {}),
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
                  requestRender();
                }
              }}
              onBlur={() => {
                if (gesture.current) finish(gesture.current.id);
              }}
              onPointerLeave={() => {
                hover.current = null;
                if (cursor.current) cursor.current.hidden = true;
                if (rubberBand.current)
                  rubberBand.current.style.display = "none";
              }}
              onPointerEnter={(e) => {
                hover.current = { clientX: e.clientX, clientY: e.clientY };
                updateCursor();
              }}
              onPointerMove={(e) => {
                hover.current = { clientX: e.clientX, clientY: e.clientY };
                updateCursor();
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
                  requestRender();
                }
              }}
              onPointerUp={(e) => finish(e.pointerId)}
              onPointerCancel={(e) => finish(e.pointerId)}
              onLostPointerCapture={(e) => {
                // Pointer IDs are reused. A delayed loss from the previous stroke
                // must not finish a new stroke that already owns capture.
                if (!e.currentTarget.hasPointerCapture(e.pointerId))
                  finish(e.pointerId);
              }}
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
                    alt={tr("editing.m8edd174636")}
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
                    aria-label={tr("editing.mc0213cc6ac")}
                  >
                    {(smart.history.present.settings.polygons ?? []).map(
                      (op, i) => (
                        <polygon
                          key={i}
                          points={op.points
                            .map((p) => `${p.x},${p.y}`)
                            .join(" ")}
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
                        {!polygon.closed && tool === "polygon" && (
                          <line
                            ref={rubberBand}
                            x1={polygon.points.at(-1)!.x}
                            y1={polygon.points.at(-1)!.y}
                            x2={polygon.points.at(-1)!.x}
                            y2={polygon.points.at(-1)!.y}
                            stroke="#F0E5D3"
                            strokeWidth={1.5 / scale}
                            strokeDasharray={`${4 / scale} ${3 / scale}`}
                            data-testid="polygon-rubber-band"
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
              <div
                ref={cursor}
                className="brush-cursor"
                hidden
                data-testid="brush-cursor"
              >
                <i />
              </div>
            </div>
            <div className="editor-zoom" aria-label={tr("editing.m8d44dbfd97")}>
              <output aria-label={tr("editing.m074d1cf977")}>
                {Math.round(scale * 100)} %
              </output>
              <input
                aria-label={tr("editing.mf1143d7bf0")}
                title={tr("editing.m3c0f9040b0")}
                type="range"
                min={-6}
                max={Math.max(4, Math.log2(fit))}
                step={0.02}
                value={Math.log2(scale)}
                onChange={(e) => zoomAt(2 ** Number(e.target.value))}
              />
              <button
                onClick={() => zoomAt(1)}
                title={tr("editing.m42bebf5ce0", {
                  v0: window.devicePixelRatio,
                })}
              >
                100 %
              </button>
              <button onClick={fitImage}>{tr("editing.m6697a0f7da")}</button>
              <small>
                {tr("editing.m5b84612148")}
                {window.devicePixelRatio}
                {tr("editing.m2a8016f6f1")}
              </small>
            </div>
          </div>
        </fieldset>
        {cutout && (
          <p role="status" aria-label={tr("editing.mb573d33f89")}>
            {sourceError || smart.loadError
              ? tr("editing.m7f466c91f9")
              : paintError || (automatic && smart.error)
                ? tr("editing.m7e9e97b014")
                : !ready
                  ? tr("editing.m3926ea81f2")
                  : !painted
                    ? tr("editing.m1bf175aa50")
                    : !automatic
                      ? tr("editing.m9e52190c1d")
                      : smart.cancelled
                        ? tr("editing.m5e6aaeb484")
                        : smart.running
                          ? tr("editing.m09e347923c")
                          : smart.result &&
                              smart.ready &&
                              paintedResult === smart.result
                            ? tr("editing.mb5d7f49387", {
                                v0: Math.round(smart.result.durationMs),
                                v1: smart.result.removed,
                                v2: smart.result.conflicts,
                              })
                            : tr("editing.mf5330fde46")}
          </p>
        )}
        <div className="button-row">
          {" "}
          <button
            disabled={
              saving ||
              !ready ||
              strokeActive ||
              (automatic
                ? !smart.history.past.length && !polygonPast.length
                : !history.past.length)
            }
            onClick={undo}
          >
            {tr("editing.mdd7bd2f68c")}
          </button>
          <button
            disabled={
              saving ||
              !ready ||
              strokeActive ||
              (automatic
                ? !smart.history.future.length && !polygonFuture.length
                : !history.future.length)
            }
            onClick={redo}
          >
            {tr("editing.me0ef009b54")}
          </button>
          {automatic && smart.running && (
            <>
              <button disabled={!smart.running} onClick={smart.cancel}>
                {tr("editing.ma5be5d1ff8")}
              </button>
            </>
          )}
          <button
            disabled={saving}
            onClick={() => {
              if (
                (!dirty && !smart.dirty && !polygon.points.length) ||
                window.confirm(tr("editing.m11435fb093"))
              )
                onClose();
            }}
          >
            {tr("editing.maf42e7cf28")}
          </button>
          <button
            className="primary"
            disabled={
              !ready ||
              !!sourceError ||
              !!paintError ||
              (cutout &&
                (!painted ||
                  (automatic
                    ? paintedResult !== smart.result
                    : paintedWeights !== history.present))) ||
              (automatic && (!smart.ready || polygon.points.length > 0)) ||
              saving ||
              !name.trim() ||
              master.width * master.height > MAX_MASK_PIXELS ||
              strokeActive
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
            {contextLabel?.saveLabel ??
              (cutout ? tr("editing.m9b8dd6aa96") : tr("editing.m99b165f30e"))}
          </button>
        </div>
        {sharedSelection && <SelectionEditor sourceId={master.id}
          initialMask={automatic?smart.current.current.present[selectionTarget]:history.present}
          onApply={weights=>{if(automatic)smart.update({...smart.current.current.present,[selectionTarget]:weights});else apply(commitMask(history,weights));}}
          onClose={()=>setSharedSelection(false)} />}
      </section>
    </EditorWorkspace>
  );
}
