import { useEffect, useRef, useState, type ReactNode } from "react";
/** Camera only: native canvas pixels and export calculations are never changed. */
export function PixelViewport({
  width,
  height,
  children,
  zoom,
  onZoom,
}: {
  width: number;
  height: number;
  children: ReactNode;
  zoom?: number;
  onZoom?: (value: number) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 1, height: 1 });
  const [localZoom, setLocalZoom] = useState<number | undefined>();
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [hand, setHand] = useState(false);
  const drag = useRef<{
    id: number;
    x: number;
    y: number;
    pan: typeof pan;
  } | null>(null);
  const moved = useRef(false);
  useEffect(() => {
    const node = ref.current!;
    const update = () =>
      setSize({ width: node.clientWidth, height: node.clientHeight });
    update();
    const observer = new ResizeObserver(update);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  const fit = Math.min(size.width / width, size.height / height);
  const scale = zoom ?? localZoom ?? fit;
  const setZoom = (value: number) => {
    const next = Math.max(0.01, Math.min(32, value));
    if (onZoom) onZoom(next);
    else setLocalZoom(next);
  };
  const wheel = useRef<(event: WheelEvent) => void>(() => {});
  wheel.current = (event) => {
    event.preventDefault();
    setZoom(scale * Math.exp(-event.deltaY * 0.001));
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
        className="pixel-camera-tools"
        role="toolbar"
        aria-label="Bildansicht"
      >
        <button
          onClick={() => {
            if (onZoom) onZoom(fit);
            else setLocalZoom(undefined);
            setPan({ x: 0, y: 0 });
          }}
        >
          Einpassen
        </button>
        <button onClick={() => setZoom(1)}>1:1</button>
        <button
          aria-label="Bild verkleinern"
          onClick={() => setZoom(scale / 1.25)}
        >
          −
        </button>
        <output aria-label="Bildzoom">{Math.round(scale * 100)}%</output>
        <button
          aria-label="Bild vergrößern"
          onClick={() => setZoom(scale * 1.25)}
        >
          +
        </button>
        <button
          aria-label="Ansicht verschieben"
          title="Alt + Ziehen verschiebt ebenfalls die Ansicht"
          aria-pressed={hand}
          onClick={() => setHand((v) => !v)}
        >
          Hand
        </button>
      </div>
      <div
        className="pixel-camera-viewport checker"
        ref={ref}
        tabIndex={0}
        aria-label="Bildfläche · Alt ziehen zum Verschieben"
        onKeyDown={(e) => {
          if (e.target !== e.currentTarget) return;
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
            setZoom(fit);
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
          if (!(hand || e.altKey || e.button === 1)) return;
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
        onPointerCancel={() => {
          drag.current = null;
        }}
        onClickCapture={(e) => {
          if (moved.current || hand || e.altKey) {
            e.stopPropagation();
            e.preventDefault();
          }
        }}
      >
        <div
          className="pixel-camera-stage"
          style={{
            width: width * scale,
            height: height * scale,
            left: (size.width - width * scale) / 2 + pan.x,
            top: (size.height - height * scale) / 2 + pan.y,
          }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}
