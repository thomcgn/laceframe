import { tr } from "../../shared/locales/index";
import { useCanvasFocus, canvasOwnsFocus } from "./canvas-focus";
import { anchoredPan, fitScale } from "./editor-geometry";
import { useEffect, useRef, useState, useImperativeHandle, type Ref, type ReactNode } from "react";
/** Camera only: native canvas pixels and export calculations are never changed. */
export function PixelViewport({
  width,
  height,
  children,
  zoom,
  onZoom,
  pan: sharedPan,
  onPan,
  onFit,
  hideTools = false,
  cameraWidth = width,
  cameraHeight = height,
  panMode = false,
  showHandTool = true,
  controls,
  onScale,
}: {
  controls?: Ref<{ fit: () => void; zoom: (scale: number) => void }>;
  onScale?: (scale: number) => void;
  panMode?: boolean;
  showHandTool?: boolean;
  hideTools?: boolean;
  cameraWidth?: number;
  cameraHeight?: number;
  width: number;
  height: number;
  children: ReactNode;
  zoom?: number;
  onZoom?: (value: number) => void;
  onFit?: () => void;
  pan?: { x: number; y: number };
  onPan?: (value: { x: number; y: number }) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 1, height: 1 });
  const [localZoom, setLocalZoom] = useState<number | undefined>();
  const [localPan, setLocalPan] = useState({ x: 0, y: 0 });
  const pan = sharedPan ?? localPan;
  const setPan = (value: typeof pan | ((p: typeof pan) => typeof pan)) => {
    const next = typeof value === "function" ? value(pan) : value;
    if (onPan) onPan(next);
    else setLocalPan(next);
  };
  const [localHand, setHand] = useState(false);
  const hand = localHand || panMode;
  const drag = useRef<{
    id: number;
    x: number;
    y: number;
    pan: typeof pan;
  } | null>(null);
  const moved = useRef(false);
  const held = useRef(false);
  useCanvasFocus(ref);
  useEffect(() => {
    const node = ref.current!;
    const update = () =>
      setSize({ width: node.clientWidth, height: node.clientHeight });
    update();
    const observer = new ResizeObserver(update);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  useEffect(()=>{const blur=()=>{held.current=false;const d=drag.current;drag.current=null;if(d&&ref.current?.hasPointerCapture(d.id))ref.current.releasePointerCapture(d.id);};window.addEventListener("blur",blur);return()=>window.removeEventListener("blur",blur);},[]);
  const fit = fitScale(size, { width: cameraWidth, height: cameraHeight });
  const scale = zoom ?? localZoom ?? fit;
  const setZoom = (
    value: number,
    point = { x: size.width / 2, y: size.height / 2 },
  ) => {
    const next = Math.max(0.01, Math.min(32, value));
    setPan(
      anchoredPan(
        size,
        { width: cameraWidth, height: cameraHeight },
        pan,
        scale,
        next,
        point,
      ),
    );
    if (onZoom) onZoom(next);
    else setLocalZoom(next);
  };
  const reset = () => {
    if (onFit) onFit(); else if (onZoom) onZoom(fit); else setLocalZoom(undefined);
    setPan({x:0,y:0});
  };
  useImperativeHandle(controls,()=>({fit:reset,zoom:setZoom}));
  useEffect(()=>{onScale?.(scale);},[scale]);
  const wheel = useRef<(event: WheelEvent) => void>(() => {});
  wheel.current = (event) => {
    if (!canvasOwnsFocus(ref.current)) return;
    event.preventDefault();
    const rect = ref.current!.getBoundingClientRect();
    setZoom(scale * Math.exp(-event.deltaY * 0.001), {
      x: event.clientX - rect.left - ref.current!.clientLeft,
      y: event.clientY - rect.top - ref.current!.clientTop,
    });
  };
  useEffect(() => {
    const element = ref.current!;
    const listener = (event: WheelEvent) => wheel.current(event);
    element.addEventListener("wheel", listener, { passive: false });
    return () => element.removeEventListener("wheel", listener);
  }, []);
  return (
    <div className="pixel-camera">
      <div
        hidden={hideTools}
        className="pixel-camera-tools"
        role="toolbar"
        aria-label={tr("editing.mdc6710c419")}
      >
        <button
          onClick={() => {
            if (onFit) onFit();
            else if (onZoom) onZoom(fit);
            else setLocalZoom(undefined);
            setPan({ x: 0, y: 0 });
          }}
        >
          {tr("editing.m6697a0f7da")}
        </button>
        <button onClick={() => setZoom(1)}>1:1</button>
        <button onClick={() => setZoom(2)}>200%</button>
        <button onClick={() => setZoom(4)}>400%</button>
        <button onClick={() => setZoom(8)}>800%</button>
        <input
          aria-label={tr("editing.m574db8099d")}
          type="range"
          min="1"
          max="800"
          value={Math.max(1, Math.min(800, scale * 100))}
          onChange={(e) => setZoom(Number(e.target.value) / 100)}
        />
        <button
          aria-label={tr("editing.mc0c03ab2e1")}
          onClick={() => setZoom(scale / 1.25)}
        >
          −
        </button>
        <output aria-label={tr("editing.m1487a4bca5")}>
          {Math.round(scale * 100)}%
        </output>
        <button
          aria-label={tr("editing.mfd0d09a508")}
          onClick={() => setZoom(scale * 1.25)}
        >
          +
        </button>
        <button
          hidden={!showHandTool}
          aria-label={tr("editing.m6a4768841c")}
          title={tr("editing.md74050edae")}
          aria-pressed={hand}
          onClick={() => setHand((v) => !v)}
        >
          {tr("editing.mfa18c06733")}
        </button>
      </div>
      <div
        className="pixel-camera-viewport checker"
        ref={ref}
        tabIndex={0}
        aria-label={tr("editing.m43dab86506")}
        onBlur={() => {
          held.current = false;
          drag.current = null;
        }}
        onKeyUp={(e) => {
          if (e.code === "Space") {
            held.current = false;
            e.preventDefault();
          }
        }}
        onKeyDown={(e) => {
          if (e.target !== e.currentTarget) return;
          if (e.code === "Space") {
            held.current = true;
            e.preventDefault();
            return;
          }
          if (
            [
              "+",
              "=",
              "-",
              "0",
              "ArrowLeft",
              "ArrowRight",
              "ArrowUp",
              "ArrowDown",
            ].includes(e.key)
          )
            e.preventDefault();
          if (e.key === "+" || e.key === "=") setZoom(scale * 1.25);
          if (e.key === "-") setZoom(scale / 1.25);
          if (e.key === "0") {
            if (onFit) onFit();
            else setZoom(fit);
            setPan({ x: 0, y: 0 });
          }
          const delta = {
            ArrowLeft: [-20, 0],
            ArrowRight: [20, 0],
            ArrowUp: [0, -20],
            ArrowDown: [0, 20],
          }[e.key];
          if (delta) setPan((p) => ({ x: p.x + delta[0], y: p.y + delta[1] }));
        }}
        onPointerDown={(e) => {
          moved.current = false;
          if (!(hand || held.current || e.altKey || e.button === 1)) return;
          e.preventDefault();
          e.currentTarget.setPointerCapture(e.pointerId);
          drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY, pan };
        }}
        onPointerMove={(e) => {
          const d = drag.current;
          if (!d || d.id !== e.pointerId) return;
          moved.current = true;
          setPan({
            x: d.pan.x + e.clientX - d.x,
            y: d.pan.y + e.clientY - d.y,
          });
        }}
        onPointerUp={() => {
          drag.current = null;
        }}
        onLostPointerCapture={() => { drag.current = null; }}
        onPointerCancel={() => {
          drag.current = null;
        }}
        onClickCapture={(e) => {
          if (moved.current || hand || held.current || e.altKey) {
            e.stopPropagation();
            e.preventDefault();
          }
        }}
      >
        <div
          className="pixel-camera-stage"
          style={{
            width: cameraWidth * scale,
            height: cameraHeight * scale,
            left: (size.width - cameraWidth * scale) / 2 + pan.x,
            top: (size.height - cameraHeight * scale) / 2 + pan.y,
          }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}
