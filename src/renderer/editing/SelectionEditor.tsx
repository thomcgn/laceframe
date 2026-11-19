import { useEffect, useMemo, useRef, useState } from "react";
import { tr, displayMessage } from "../../shared/locales";
import { PixelViewport } from "../components/PixelViewport";
import { EditorWorkspace } from "../components/EditorWorkspace";
import type { ColorPixels } from "../../shared/color-consistency";
import { bezierSelection, boxSelection, brushSelection, combineSelection, constrainSelection, editAnchor, editingHistory, commitEditing, undoEditing, redoEditing, emptyPath, pixelPerfect, polygonSelection, translatePath, type EditingHistory, type EditingState, type SelectionOperation } from "../../shared/editing";
import type { Point } from "../../shared/masking";
import { tools, selectionLabels, editorShortcut, type ToolId } from "./tools";
type Reference = {
    id: string;
    name: string;
    weights: Uint8Array;
};
type Props = {
    sourceId: string;
    initialMask: Uint8Array;
    allowedMask?: Uint8Array;
    references?: Reference[];
    includeStoredReferences?:boolean;
    onApply: (mask: Uint8Array) => void;
    onClose: () => void;
};
type Gesture = {
    id: number;
    start: Point;
    points: Point[];
    before: EditingState;
    working: EditingState;
    part?: "p" | "in" | "out" | "translate";
    index?: number;
    allowed?: Uint8Array;
    stroke?: Uint8Array;
    brushOperation?:SelectionOperation;
};
/** Shared pixel-selection workspace. Hosts own mask meaning, approval, and result-asset creation. */
export function SelectionEditor({ sourceId, initialMask, allowedMask, references = [], includeStoredReferences=true, onApply, onClose }: Props) {
    const [storedReferences,setStoredReferences]=useState<Reference[]>([]);
    const availableReferences=[...references,...storedReferences.filter(r=>!references.some(local=>local.id===r.id))];
    const [source, setSource] = useState<ColorPixels & {
        sha256: string;
    }>();
    const [history, setHistory] = useState<EditingHistory>();
    const [tool, setTool] = useState<ToolId>("wand"), [operation, setOperation] = useState<SelectionOperation>("replace");
    const [size, setSize] = useState(1), [square, setSquare] = useState(false), [perfect, setPerfect] = useState(false), [limitBrush, setLimitBrush] = useState(false);
    const [tolerance, setTolerance] = useState(0), [connected, setConnected] = useState(true), [diagonal, setDiagonal] = useState(false), [alpha, setAlpha] = useState(false);
    const [seeds, setSeeds] = useState<number[]>([]), [restrict, setRestrict] = useState(false), [reference, setReference] = useState("");
    const [symmetric, setSymmetric] = useState(true), [moveWhole, setMoveWhole] = useState(false), [selectedNode, setSelectedNode] = useState(0);
    const [grid, setGrid] = useState(false), [borders, setBorders] = useState(true), [opacity, setOpacity] = useState(.45), [original, setOriginal] = useState(false), [collapsed, setCollapsed] = useState(false);
    const [temporaryPan,setTemporaryPan]=useState(false);
    const [zoom, setZoom] = useState(1), [picked, setPicked] = useState(""), [busy, setBusy] = useState(false), [error, setError] = useState("");
    const [name, setName] = useState(""), [saved, setSaved] = useState<{
        id: string;
        name: string;
        revision: number;
    }[]>([]), [savedId, setSavedId] = useState("");
    const [context, setContext] = useState(false), [dirty, setDirty] = useState(false), [saving, setSaving] = useState(false);
    const section = useRef<HTMLElement>(null), base = useRef<HTMLCanvasElement>(null), overlay = useRef<HTMLCanvasElement>(null), vectors = useRef<HTMLCanvasElement>(null);
    const viewport = useRef<{
        fit: () => void;
        zoom: (n: number) => void;
    }>(null), frame = useRef(0), worker = useRef<Worker | undefined>(undefined), gesture = useRef<Gesture | undefined>(undefined), space = useRef(false), cursor = useRef<Point | undefined>(undefined);
    const rgba = useRef<ImageData | undefined>(undefined);
    const repaint = useRef<(rect?: {
        left: number;
        top: number;
        right: number;
        bottom: number;
    }) => void>(() => { });
    const allowed = useMemo(() => source ? constrainSelection(new Uint8Array(source.width * source.height).fill(255), source, allowedMask) : undefined, [source, allowedMask]);
    function draw(rect?: {
        left: number;
        top: number;
        right: number;
        bottom: number;
    }) {
        if (!source || !history)
            return;
        const state = gesture.current?.working ?? history.present, w = source.width, h = source.height, ctx = overlay.current?.getContext("2d"), v = vectors.current?.getContext("2d");
        if (!ctx || !v)
            return;
        const pixels = rgba.current ??= new ImageData(w, h), left = Math.max(0, Math.floor(rect?.left ?? 0)), top = Math.max(0, Math.floor(rect?.top ?? 0)), right = Math.min(w, Math.ceil(rect?.right ?? w)), bottom = Math.min(h, Math.ceil(rect?.bottom ?? h));
const strokeGesture=gesture.current;
        const at=(i:number)=>{const g=strokeGesture;if(!g?.stroke)return state.mask[i];const a=g.before.mask[i],b=g.stroke[i];return g.brushOperation==="replace"?b:g.brushOperation==="add"?Math.max(a,b):g.brushOperation==="subtract"?Math.min(a,255-b):Math.min(a,b);};
        for (let y = top; y < bottom; y++)
            for (let x = left; x < right; x++) {
                const i = y * w + x, k = i * 4, weight = at(i), edge = borders && weight > 0 && (x === 0 || y === 0 || x === w - 1 || y === h - 1 || !at(i-1)||!at(i+1)||!at(i-w)||!at(i+w));
                pixels.data[k] = edge ? 240 : 143;
                pixels.data[k + 1] = edge ? 229 : 173;
                pixels.data[k + 2] = edge ? 211 : 166;
                pixels.data[k + 3] = weight ? (edge ? 255 : Math.round(weight * opacity)) : 0;
            }
        if (right > left && bottom > top)
            ctx.putImageData(pixels, 0, 0, left, top, right - left, bottom - top);
        v.clearRect(0, 0, w, h);
        const scale = (vectors.current?.getBoundingClientRect().width ?? w) / w;
        v.strokeStyle = "#f0e5d3";
        v.fillStyle = "#d9a77e";
        v.lineWidth = 1 / Math.max(.01, scale);
        const path = state.path;
        if (path.nodes.length) {
            v.beginPath();
            v.moveTo(path.nodes[0].p.x, path.nodes[0].p.y);
            for (let i = 1; i < path.nodes.length + (path.closed ? 1 : 0); i++) {
                const a = path.nodes[i - 1], b = path.nodes[i % path.nodes.length];
                v.bezierCurveTo(a.out.x, a.out.y, b.in.x, b.in.y, b.p.x, b.p.y);
            }
            v.stroke();
            if (tool === "bezier")
                path.nodes.forEach((n, i) => { for (const p of [n.in, n.out]) {
                    v.beginPath();
                    v.moveTo(n.p.x, n.p.y);
                    v.lineTo(p.x, p.y);
                    v.stroke();
                    v.strokeRect(p.x - 3 / scale, p.y - 3 / scale, 6 / scale, 6 / scale);
                } v.fillStyle = i === selectedNode ? "#d9a77e" : "#f0e5d3"; v.fillRect(n.p.x - 4 / scale, n.p.y - 4 / scale, 8 / scale, 8 / scale); });
        }
        const g = gesture.current;
        if (g && ["rectangle", "ellipse", "lasso", "polygon"].includes(tool)) {
            v.beginPath();
            if (tool === "lasso") {
                g.points.forEach((p, i) => i ? v.lineTo(p.x, p.y) : v.moveTo(p.x, p.y));
                v.closePath();
            }
            else if (tool === "polygon") {
                // Draw committed vertices and edges
                const path = g.working.path;
                if (path.nodes.length > 0) {
                    // Draw edges between committed vertices
                    v.beginPath();
                    v.moveTo(path.nodes[0].p.x, path.nodes[0].p.y);
                    for (let i = 1; i < path.nodes.length; i++) {
                        v.lineTo(path.nodes[i].p.x, path.nodes[i].p.y);
                    }
                    // Dual-tone stroke for edges
                    v.strokeStyle = "#141820"; // Ink - dark
                    v.lineWidth = 2 / Math.max(.01, scale);
                    v.stroke();
                    v.beginPath();
                    v.moveTo(path.nodes[0].p.x, path.nodes[0].p.y);
                    for (let i = 1; i < path.nodes.length; i++) {
                        v.lineTo(path.nodes[i].p.x, path.nodes[i].p.y);
                    }
                    v.strokeStyle = "#f0e5d3"; // Ivory - light
                    v.lineWidth = 1 / Math.max(.01, scale);
                    v.stroke();
                    
                    // Draw vertex markers
                    const markerSize = 4 / Math.max(.01, scale);
                    path.nodes.forEach((node, i) => {
                        const px = node.p.x;
                        const py = node.p.y;
                        
                        // Dark outer ring
                        v.beginPath();
                        v.arc(px, py, markerSize * 1.5, 0, Math.PI * 2);
                        v.fillStyle = "#141820"; // Ink
                        v.fill();
                        
                        // Light inner fill
                        v.beginPath();
                        v.arc(px, py, markerSize, 0, Math.PI * 2);
                        v.fillStyle = i === path.nodes.length - 1 ? "#d9a77e" : "#f0e5d3"; // Copper for last vertex, Ivory for others
                        v.fill();
                    });
                    
                    // Draw rubber-band line from last vertex to cursor
                    if (cursor.current) {
                        const lastVertex = path.nodes[path.nodes.length - 1];
                        v.beginPath();
                        v.moveTo(lastVertex.p.x, lastVertex.p.y);
                        v.lineTo(cursor.current.x, cursor.current.y);
                        // Dashed dual-tone line for rubber-band
                        v.setLineDash([4 / Math.max(.01, scale), 4 / Math.max(.01, scale)]);
                        v.strokeStyle = "#141820"; // Ink - dark
                        v.lineWidth = 2 / Math.max(.01, scale);
                        v.stroke();
                        v.beginPath();
                        v.moveTo(lastVertex.p.x, lastVertex.p.y);
                        v.lineTo(cursor.current.x, cursor.current.y);
                        v.setLineDash([4 / Math.max(.01, scale), 4 / Math.max(.01, scale)]);
                        v.strokeStyle = "#f0e5d3"; // Ivory - light
                        v.lineWidth = 1 / Math.max(.01, scale);
                        v.stroke();
                        v.setLineDash([]);
                        
                        // Show close indicator when near first vertex and have 3+ vertices
                        if (path.nodes.length >= 3) {
                            const firstVertex = path.nodes[0];
                            const dx = cursor.current.x - firstVertex.p.x;
                            const dy = cursor.current.y - firstVertex.p.y;
                            const dist = Math.hypot(dx, dy);
                            const closeThreshold = 15 / Math.max(.01, scale); // 15 CSS pixels
                            if (dist < closeThreshold) {
                                // Draw close indicator (circle around first vertex)
                                v.beginPath();
                                v.arc(firstVertex.p.x, firstVertex.p.y, markerSize * 3, 0, Math.PI * 2);
                                v.strokeStyle = "#d9a77e"; // Copper
                                v.lineWidth = 2 / Math.max(.01, scale);
                                v.setLineDash([6 / Math.max(.01, scale), 4 / Math.max(.01, scale)]);
                                v.stroke();
                                v.setLineDash([]);
                            }
                        }
                    }
                }
            }
            else {
                const p = g.points.at(-1)!;
                if (tool === "rectangle")
                    v.rect(g.start.x, g.start.y, p.x - g.start.x, p.y - g.start.y);
                else
                    v.ellipse((g.start.x + p.x) / 2, (g.start.y + p.y) / 2, Math.abs(p.x - g.start.x) / 2, Math.abs(p.y - g.start.y) / 2, 0, 0, 2 * Math.PI);
            }
            if (tool !== "polygon") {
                // Dual-tone stroke for rectangle/ellipse/lasso
                v.strokeStyle = "#141820"; // Ink - dark
                v.lineWidth = 2 / Math.max(.01, scale);
                v.stroke();
                v.strokeStyle = "#f0e5d3"; // Ivory - light
                v.lineWidth = 1 / Math.max(.01, scale);
                v.stroke();
            }
        }
        if (cursor.current && ["brush", "eraser"].includes(tool)) {
            const p = cursor.current;
            const radius = size / 2;
            const cursorX = p.x;
            const cursorY = p.y;
            
            // Draw dual-tone cursor outline for visibility on any background
            // Outer stroke (dark)
            v.beginPath();
            if (square)
                v.rect(cursorX - radius, cursorY - radius, size, size);
            else
                v.arc(cursorX, cursorY, radius, 0, Math.PI * 2);
            v.strokeStyle = "#141820"; // Ink - dark
            v.lineWidth = 2 / Math.max(.01, scale);
            v.stroke();
            
            // Inner stroke (light)
            v.beginPath();
            if (square)
                v.rect(cursorX - radius, cursorY - radius, size, size);
            else
                v.arc(cursorX, cursorY, radius, 0, Math.PI * 2);
            v.strokeStyle = "#f0e5d3"; // Ivory - light
            v.lineWidth = 1 / Math.max(.01, scale);
            v.stroke();
        }
    }
    repaint.current = draw;
    const fullDraw = useRef(false), dirtyRect = useRef<Parameters<typeof draw>[0]>(undefined);
    function requestDraw(input?: true | Parameters<typeof draw>[0]) {
        if (input === true)
            fullDraw.current = true;
        else if (input) {
            const old = dirtyRect.current;
            dirtyRect.current = old ? { left: Math.min(old.left, input.left), top: Math.min(old.top, input.top), right: Math.max(old.right, input.right), bottom: Math.max(old.bottom, input.bottom) } : input;
        }
        if (frame.current)
            return;
        frame.current = requestAnimationFrame(() => { frame.current = 0; const rect = fullDraw.current ? undefined : dirtyRect.current ?? { left: 0, top: 0, right: 0, bottom: 0 }; fullDraw.current = false; dirtyRect.current = undefined; repaint.current(rect); });
    }
    function commit(next: EditingState) { if (!history)
        return; setHistory(commitEditing(history, next)); setDirty(true); setError(""); }
    function useMask(mask: Uint8Array) { if (!source || !history)
        return; commit({ ...history.present, mask: constrainSelection(mask, source, allowed) }); }
    function applySelection(mask: Uint8Array) { if (!history)
        return; useMask(combineSelection(history.present.mask, mask, operation)); }
    function cancel() { worker.current?.terminate(); worker.current = undefined; setBusy(false); gesture.current = undefined; requestDraw(true); setError(""); }
    function close() { if (saving)
        return; if (busy) {
        cancel();
        return;
    } if (!dirty || window.confirm(tr("canvas.discard")))
        onClose(); }
    function closePath() { if (!history)
        return; const path = history.present.path; if (path.nodes.length < 3) {
        setError(tr("canvas.closeFirst"));
        return;
    } commit({ ...history.present, path: { ...path, closed: true } }); }
    function pathMask() { try {
        if (source && history)
            applySelection(bezierSelection(source.width, source.height, history.present.path));
    }
    catch (e) {
        setError(displayMessage(String(e)));
    } }
    function action(action: string) {
        if (!history || !source)
            return;
        if (action === "cancel") {
            if (busy || gesture.current) {
                cancel();
                return;
            }
            if (history.present.path.nodes.length) {
                commit({ ...history.present, path: emptyPath() });
                return;
            }
            close();
            return;
        }
        if (action === "undo" || action === "redo") {
            setHistory(action === "undo" ? undoEditing(history) : redoEditing(history));
            setDirty(true);
            return;
        }
        if (action === "fit") {
            viewport.current?.fit();
            return;
        }
        if (action === "all" || action === "clear" || action === "invert") {
            useMask(action === "invert" ? history.present.mask.map(v => 255 - v) : new Uint8Array(source.width * source.height).fill(action === "all" ? 255 : 0));
            return;
        }
        if (action === "closePath") {
            closePath();
            return;
        }
        if (action === "removeNode") {
            const path = structuredClone(history.present.path);
            path.nodes.splice(tool === "bezier" ? selectedNode : path.nodes.length - 1, 1);
            if (path.nodes.length < 3)
                path.closed = false;
            commit({ ...history.present, path });
            setSelectedNode(Math.max(0, selectedNode - 1));
            return;
        }
        if (tools.some(t => t.id === action)) {
            cancel();
            setTool(action as ToolId);
        }
    }
    useEffect(()=>{
      void window.laceframe.editingContext(true).then(r=>{if(!r.ok)setError(r.error);});
      return ()=>{void window.laceframe.editingContext(false);};
    },[]);
    useEffect(() => {
        let live = true;
        void window.laceframe.analysisSource(sourceId).then(async (r) => {
            if (!r.ok)
                throw new Error(r.error);
            if (!live)
                return;
            const mask = constrainSelection(initialMask, r.value, allowedMask);
            setSource(r.value);
            setHistory(editingHistory(mask));
            if(includeStoredReferences){const refs=await window.laceframe.selectionReferences(sourceId);if(live){if(!refs.ok)throw new Error(refs.error);setStoredReferences(refs.value);}}
            const s = await window.laceframe.editorSelections(sourceId);
            if (live && s.ok)
                setSaved(s.value);
        }).catch(e => { if (live)
            setError(displayMessage(String(e))); });
        section.current?.focus();
        return () => { live = false; worker.current?.terminate(); cancelAnimationFrame(frame.current); };
    }, [sourceId]);
    // React to host-supplied mask/reference changes while the workspace stays open.
    // A source change resets the editor; a reference-only change refreshes the list.
    useEffect(() => {
        if (!source)
            return;
        const mask = constrainSelection(initialMask, source, allowedMask);
        setHistory(editingHistory(mask));
        setDirty(false);
        setError("");
    }, [initialMask, allowedMask, source]);
    useEffect(() => {
        if (!source || !includeStoredReferences)
            return;
        let live = true;
        void window.laceframe.selectionReferences(sourceId).then(r => { if (live && r.ok) setStoredReferences(r.value); }).catch(() => { });
        return () => { live = false; };
    }, [references, sourceId, includeStoredReferences, source]);
    useEffect(() => { if (source && base.current) {
        const c = base.current.getContext("2d")!;
        c.putImageData(new ImageData(new Uint8ClampedArray(source.data), source.width, source.height), 0, 0);
    } }, [source]);
    useEffect(() => { requestDraw(true); }, [history, source, opacity, borders, tool, zoom, selectedNode]);
    useEffect(() => { const blur = () => { space.current = false; setTemporaryPan(false); cancel(); }; window.addEventListener("blur", blur); return () => window.removeEventListener("blur", blur); }, []);
    function point(e: {
        clientX: number;
        clientY: number;
    }) { const r = vectors.current!.getBoundingClientRect(); const p = { x: Math.max(0, Math.min(source!.width, (e.clientX - r.left) * source!.width / r.width)), y: Math.max(0, Math.min(source!.height, (e.clientY - r.top) * source!.height / r.height)) }; return ["brush", "eraser"].includes(tool) ? { x: Math.min(source!.width - 1, Math.floor(p.x)) + .5, y: Math.min(source!.height - 1, Math.floor(p.y)) + .5 } : p; }
    function range(indices: number[]) {
        if (!source || !history || busy)
            return;
        const w = new Worker(new URL("../workers/selection.worker.ts", import.meta.url), { type: "module" });
        worker.current = w;
        setBusy(true);
        setError("");
        let limit = allowed;
        const ref = availableReferences.find(r => r.id === reference)?.weights;
        if (ref && limit)
            limit = combineSelection(limit, ref, "intersect");
        if (restrict && limit)
            limit = combineSelection(limit, history.present.mask, "intersect");
        w.onmessage = e => { if (worker.current !== w)
            return; w.terminate(); worker.current = undefined; setBusy(false); if (e.data.error)
            setError(displayMessage(e.data.error));
        else
            applySelection(e.data.mask); };
        w.onerror = () => { if (worker.current !== w)
            return; w.terminate(); worker.current = undefined; setBusy(false); setError(tr("canvas.invalid")); };
        w.postMessage([source, { seeds: indices, tolerance, connected: tool === "wand" && connected, diagonal, alpha, allowed: limit }]);
    }
    function down(e: React.PointerEvent<HTMLCanvasElement>) {
        if (!source || !history || busy || tool === "pan" || space.current || e.altKey || e.button !== 0)
            return;
        e.preventDefault();
        e.currentTarget.closest<HTMLElement>(".pixel-camera-viewport")?.focus();
        const p = point(e), index = Math.min(source.height - 1, Math.floor(p.y)) * source.width + Math.min(source.width - 1, Math.floor(p.x));
        if (tool === "wand") {
            range([index]);
            return;
        }
        if (tool === "eyedropper" || tool === "range") {
            const rgb = Array.from(source.data.subarray(index * 4, index * 4 + 4));
            setPicked(tr("canvas.picked", { hex: "#" + rgb.slice(0, 3).map(v => v.toString(16).padStart(2, "0")).join(""), rgb: rgb.slice(0, 3).join(", "), alpha: rgb[3] }));
            if (tool === "range")
                setSeeds(s => s.includes(index) ? s : s.length < 32 ? [...s, index] : s);
            return;
        }
        const before = history.present, working = { mask: before.mask, path: structuredClone(before.path) };
        const g: Gesture = { id: e.pointerId, start: p, points: [p], before, working, allowed: limitBrush ? combineSelection(allowed!, before.mask, "intersect") : allowed };
        if (tool === "polygon") {
            if (working.path.closed)
                working.path = emptyPath();
            if (working.path.nodes.length >= 128)
                return;
            
            // Check if clicking near first vertex to close polygon (when 3+ vertices)
            if (working.path.nodes.length >= 3) {
                const firstVertex = working.path.nodes[0];
                const dx = p.x - firstVertex.p.x;
                const dy = p.y - firstVertex.p.y;
                const dist = Math.hypot(dx, dy);
                // 15 CSS pixels converted to image coordinates (matches visual indicator)
                const closeThreshold = 15 / Math.max(.01, (vectors.current?.getBoundingClientRect().width ?? source.width) / source.width);
                if (dist < closeThreshold) {
                    closePath();
                    return;
                }
            }
            
            working.path.nodes.push({ p, in: p, out: p, symmetric: true });
            commit(working);
            return;
        }
        if (tool === "bezier") {
            const scale = (vectors.current!.getBoundingClientRect().width) / source.width;
            if (moveWhole) {
                g.part = "translate";
            }
            else {
                let nearest=8;
                for (let i = 0; i < working.path.nodes.length; i++)
                    for (const part of ["p", "in", "out"] as const) {
                        const q = working.path.nodes[i][part];
                        if (Math.hypot(q.x - p.x, q.y - p.y) * scale < nearest) {
                            nearest=Math.hypot(q.x-p.x,q.y-p.y)*scale;
                            g.index = i;
                            g.part = part;
                        }
                    }
                if (g.index === undefined) {
                    if (working.path.nodes.length >= 128)
                        return;
                    working.path.nodes.push({ p, in: p, out: p, symmetric });
                    g.index = working.path.nodes.length - 1;
                    g.part = "out";
                }
                setSelectedNode(g.index!);
            }
        }
        if(tool==="brush"||tool==="eraser"){
          g.stroke=new Uint8Array(before.mask.length);g.working.mask=g.stroke;
          g.brushOperation=tool==="eraser"?"subtract":operation;
        }
        gesture.current = g;
        e.currentTarget.setPointerCapture(e.pointerId);
        if (tool === "brush" || tool === "eraser")
            brushSelection(working.mask, source.width, source.height, [p], size, square, 255, g.allowed);
        requestDraw(g.stroke?true:undefined);
    }
    function move(e: React.PointerEvent<HTMLCanvasElement>) {
        if (!source)
            return;
        const p = point(e);
        cursor.current = p;
        const status = section.current?.querySelector<HTMLOutputElement>(".selection-coordinates");
        if (status)
            status.textContent = `${Math.floor(p.x)}, ${Math.floor(p.y)}`;
        const g = gesture.current;
        if (!g) {
            requestDraw();
            return;
        }
        if (g.id !== e.pointerId)
            return;
        if(space.current||e.altKey){cancel();return;}
        const previous = g.points.at(-1)!;
        g.points.push(p);
        if (tool === "brush" || tool === "eraser")
            brushSelection(g.working.mask, source.width, source.height, [previous, p], size, square, 255, g.allowed);
        else if (tool === "bezier")
            g.working.path = g.part === "translate" ? translatePath(g.before.path, { x: p.x - g.start.x, y: p.y - g.start.y }) : editAnchor(g.working.path, g.index!, g.part!, p);
        requestDraw(tool === "brush" || tool === "eraser" ? { left: Math.min(previous.x, p.x) - size - 1, top: Math.min(previous.y, p.y) - size - 1, right: Math.max(previous.x, p.x) + size + 1, bottom: Math.max(previous.y, p.y) + size + 1 } : undefined);
    }
    function up(e: React.PointerEvent<HTMLCanvasElement>) {
        const g = gesture.current;
        if (!g || g.id !== e.pointerId || !source || !history)
            return;
        gesture.current = undefined;
        if (e.currentTarget.hasPointerCapture(e.pointerId))
            e.currentTarget.releasePointerCapture(e.pointerId);
        const last = g.points.at(-1)!;
        let mask = g.working.mask;
        if (tool === "rectangle" || tool === "ellipse") {
            const to = e.shiftKey ? { x: g.start.x + Math.sign(last.x - g.start.x) * Math.min(Math.abs(last.x - g.start.x), Math.abs(last.y - g.start.y)), y: g.start.y + Math.sign(last.y - g.start.y) * Math.min(Math.abs(last.x - g.start.x), Math.abs(last.y - g.start.y)) } : last;
            mask = combineSelection(g.before.mask, boxSelection(source.width, source.height, g.start, to, tool === "ellipse"), operation);
        }
        if (tool === "lasso")
            mask = combineSelection(g.before.mask, polygonSelection(source.width, source.height, g.points.filter((_, i) => i % Math.max(1, Math.ceil(g.points.length / 4096)) === 0)), operation);
        if ((tool === "brush" || tool === "eraser") && perfect && size === 1) {
            mask = new Uint8Array(g.before.mask.length);
            brushSelection(mask, source.width, source.height, pixelPerfect(g.points), size, square, 255, g.allowed);
        }
        if(g.stroke)mask=combineSelection(g.before.mask,mask,g.brushOperation!);
        commit({ ...g.working, mask: constrainSelection(mask, source, allowed) });
    }
    async function save() { if (!source || !history || !name.trim() || busy || saving)
        return; setSaving(true); setError(""); try {
        const r = await window.laceframe.command({ type: "saveEditorSelection", sourceId, sourceSha256: source.sha256, name, weights: new Uint8Array(history.present.mask), path: history.present.path });
        if (!r.ok)
            throw new Error(r.error);
        setSaved(r.value.project.editorSelections.filter(s => s.sourceId === sourceId));
        setDirty(false);
    }
    catch (e) {
        setError(displayMessage(String(e)));
    }
    finally {
        setSaving(false);
    } }
    async function load() { if (!savedId || busy || saving || !source)
        return; setSaving(true); try {
        const r = await window.laceframe.editorSelection(savedId);
        if (!r.ok)
            throw new Error(r.error);
        if (r.value.record.sourceId !== sourceId || r.value.record.sourceSha256 !== source.sha256)
            throw new Error(tr("canvas.invalid"));
        commit({ mask: constrainSelection(r.value.weights, source, allowed), path: r.value.record.path });
        setName(r.value.record.name);
        setSelectedNode(0);
    }
    catch (e) {
        setError(displayMessage(String(e)));
    }
    finally {
        setSaving(false);
    } }
    async function remove() { if (!savedId || busy || saving)
        return; setSaving(true); setError(""); try {
        const r = await window.laceframe.deleteEditorSelection(savedId);
        if (!r.ok)
            throw new Error(r.error);
        setSaved(s => s.filter(s => s.id !== savedId));
        setSavedId("");
        setDirty(false);
    }
    catch (e) {
        setError(displayMessage(String(e)));
    }
    finally {
        setSaving(false);
    } }
    const active = tools.find(t => t.id === tool)!;
    return <EditorWorkspace title={tr("canvas.title")} className=""><section ref={section} tabIndex={-1} role="dialog" aria-modal="true" aria-label={tr("canvas.title")} className={`selection-editor ${collapsed ? "panel-collapsed" : ""}`} onKeyDownCapture={e => { if (e.code === "Space" && !(e.target as HTMLElement).matches("input,textarea,select,button"))
        space.current = true; if((e.code==="Space"||e.key==="Alt")&&!(e.target as HTMLElement).closest("input,textarea,select,button"))setTemporaryPan(true); }} onKeyUp={e => { if (e.code === "Space")
        space.current = false; if(e.code==="Space"||e.key==="Alt")setTemporaryPan(false); }} onKeyDown={e => { if (e.defaultPrevented)
        return; 
        // Handle Escape for polygon tool - cancel unfinished polygon without modifying mask
        if (e.key === "Escape" && tool === "polygon" && history && history.present.path.nodes.length > 0) {
            e.preventDefault();
            e.stopPropagation();
            if (!saving && (!busy) && history) {
                commit({ ...history.present, path: emptyPath() });
            }
            return;
        }
        const a = editorShortcut(e, Boolean((e.target as HTMLElement).closest("input,textarea,select,[contenteditable=true]"))); if (a) {
        e.preventDefault();
        e.stopPropagation();
        if (!saving && (!busy || a === "cancel"))
            action(a);
    } }}>
 <header><h2>{tr("canvas.title")}</h2><span>{dirty ? tr("canvas.unsaved") : ""}</span><button onClick={() => setCollapsed(!collapsed)}>{tr("canvas.panel")}</button><button disabled={saving} onClick={close}>{busy?tr("canvas.cancel"):tr("canvas.close")}</button></header>
 {error && <p role="alert">{error}</p>}
 <div className="selection-layout"><nav className="selection-tools" aria-label={tr("canvas.tools")}>{tools.map(t => <button key={t.id} disabled={busy || saving} aria-label={tr(t.label)} title={`${tr(t.label)}${t.key ? ` (${t.key})` : ""}`} aria-keyshortcuts={t.key || undefined} aria-pressed={t.id === tool} onClick={() => { cancel(); setTool(t.id); }}><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d={t.icon}/></svg></button>)}</nav>
 <main className="selection-canvas">{source && history && <PixelViewport width={source.width} height={source.height} panMode={tool === "pan"||temporaryPan} showHandTool={false} controls={viewport} onScale={setZoom}>
 <canvas ref={base} width={source.width} height={source.height} aria-label={tr("canvas.source")}/>
 <canvas ref={overlay} width={source.width} height={source.height} className="selection-overlay" style={{ opacity: original ? 0 : 1 }} aria-hidden="true"/>
 <div className="selection-grid" hidden={!grid || zoom < 4 || original} style={{ backgroundSize: `${100 / source.width}% ${100 / source.height}%` }}/>
 <canvas ref={vectors} width={source.width} height={source.height} className="selection-vector" aria-label={tr("canvas.surface")} style={{ cursor: tool === "pan"||temporaryPan ? "grab" : "crosshair", opacity: original ? 0 : 1, pointerEvents: original ? "none" : "auto" }} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={cancel} onLostPointerCapture={() => { if (gesture.current)
            cancel(); }} onPointerLeave={() => { cursor.current = undefined; requestDraw(); }} onDoubleClick={() => { if (tool === "polygon")
            closePath(); }} onContextMenu={e => { e.preventDefault(); setContext(!context); }}/>
 </PixelViewport>}{context && <div className="selection-context" role="menu">{["undo", "redo", "all", "clear", "invert", "fit"].map(a => <button role="menuitem" key={a} onClick={() => { action(a); setContext(false); }}>{tr(selectionLabels[a])}</button>)}</div>}</main>
 <aside><fieldset disabled={busy || saving}><legend>{tr(active.label)}</legend>
 {!["eraser","eyedropper","pan"].includes(tool)&&<label>{tr("canvas.operation")}<select aria-label={tr("canvas.operation")} value={operation} onChange={e => setOperation(e.target.value as SelectionOperation)}>{(["replace", "add", "subtract", "intersect"] as const).map(op => <option key={op} value={op}>{tr(selectionLabels[op])}</option>)}</select></label>}
 {["brush", "eraser"].includes(tool) && <><label>{tr("canvas.size")}<input type="number" min={1} max={256} value={size} onChange={e => setSize(Math.max(1, Math.min(256, Number(e.target.value) || 1)))}/></label><label><input type="checkbox" checked={square} onChange={e => setSquare(e.target.checked)}/>{tr("canvas.square")}</label><label><input type="checkbox" checked={perfect} onChange={e => setPerfect(e.target.checked)}/>{tr("canvas.perfect")}</label><label><input type="checkbox" checked={limitBrush} onChange={e => setLimitBrush(e.target.checked)}/>{tr("canvas.limitBrush")}</label></>}
 {["wand", "range"].includes(tool) && <><label>{tr("canvas.tolerance")}<input type="number" min={0} max={100} value={tolerance} onChange={e => setTolerance(Math.max(0, Math.min(100, Number(e.target.value) || 0)))}/></label><small>{tr("canvas.distance")}</small>{tool === "wand" && <><label><input type="checkbox" checked={connected} onChange={e => setConnected(e.target.checked)}/>{tr("canvas.connected")}</label><label><input type="checkbox" checked={diagonal} onChange={e => setDiagonal(e.target.checked)}/>{tr("canvas.diagonal")}</label></>}<label><input type="checkbox" checked={alpha} onChange={e => setAlpha(e.target.checked)}/>{tr("canvas.alpha")}</label><label><input type="checkbox" checked={restrict} onChange={e => setRestrict(e.target.checked)}/>{tr("canvas.restrict")}</label>{tool === "range" && <><p>{tr("canvas.seeds", { count: seeds.length })}</p><button onClick={() => setSeeds([])}>{tr("canvas.clearSeeds")}</button><button disabled={!seeds.length} onClick={() => range(seeds)}>{tr("canvas.rangePreview")}</button></>}</>}
 {(tool === "polygon" || tool === "bezier") && <><button onClick={closePath}>{tr("canvas.closePath")}</button><button onClick={pathMask}>{tr("canvas.pathApply")}</button><button disabled={!history?.present.path.nodes.length} onClick={() => action("removeNode")}>{tr("canvas.removeNode")}</button>{tool === "bezier" && <><label><input type="checkbox" checked={history?.present.path.nodes[selectedNode]?.symmetric??symmetric} onChange={e => { setSymmetric(e.target.checked); if (history) {
        const path = structuredClone(history.present.path);
        if (path.nodes[selectedNode])
            path.nodes[selectedNode].symmetric = e.target.checked;
        commit({ ...history.present, path });
    } }}/>{tr("canvas.symmetric")}</label><label><input type="checkbox" checked={moveWhole} onChange={e => setMoveWhole(e.target.checked)}/>{tr("canvas.movePath")}</label>
 <details><summary>{tr("canvas.anchorCoordinates")}</summary>
 <label>{tr("canvas.anchor")}<select aria-label={tr("canvas.anchor")} value={selectedNode} onChange={e=>setSelectedNode(Number(e.target.value))}>{history?.present.path.nodes.map((_,i)=><option key={i} value={i}>{i+1}</option>)}</select></label>
 {history?.present.path.nodes[selectedNode] && (["p","in","out"] as const).map(part=><fieldset key={part}><legend>{tr(part==="p"?"canvas.anchor":part==="in"?"canvas.inHandle":"canvas.outHandle")}</legend>{(["x","y"] as const).map(axis=><label key={axis}>{axis.toUpperCase()}<input type="number" step="0.25" min={-32768} max={32768} value={history.present.path.nodes[selectedNode][part][axis]} onChange={e=>{const n=Number(e.target.value);if(Number.isFinite(n))commit({...history.present,path:editAnchor(history.present.path,selectedNode,part,{...history.present.path.nodes[selectedNode][part],[axis]:Math.max(-32768,Math.min(32768,n))})});}}/></label>)}</fieldset>)}
 </details></>}</>}
 {(tool === "eyedropper" || tool === "range") && <output>{picked}</output>}
 <label>{tr("canvas.region")}<select aria-label={tr("canvas.region")} value={reference} onChange={e => setReference(e.target.value)}><option value="">—</option>{availableReferences.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}</select></label><button disabled={!reference} onClick={() => { const r = availableReferences.find(r => r.id === reference); if (r)
        applySelection(r.weights); }}>{tr("canvas.fromMask")}</button>
 <button onClick={() => { if (source)
        applySelection(Uint8Array.from({ length: source.width * source.height }, (_, i) => source.data[i * 4 + 3])); }}>{tr("canvas.fromAlpha")}</button>
 <div className="selection-actions">{["all", "clear", "invert"].map(a => <button key={a} onClick={() => action(a)}>{tr(selectionLabels[a])}</button>)}</div>
 <label><input type="checkbox" checked={grid} onChange={e => setGrid(e.target.checked)}/>{tr("canvas.grid")}</label><label><input type="checkbox" checked={borders} onChange={e => setBorders(e.target.checked)}/>{tr("canvas.borders")}</label><label><input type="checkbox" checked={original} onChange={e => setOriginal(e.target.checked)}/>{tr("canvas.original")}</label><label>{tr("canvas.opacity")}<input type="range" min={0} max={1} step={.05} value={opacity} onChange={e => setOpacity(Number(e.target.value))}/></label>
 <label>{tr("canvas.selectionName")}<input maxLength={120} value={name} onChange={e => {setName(e.target.value);setDirty(true);}}/></label><button disabled={!name.trim()} onClick={() => void save()}>{tr("canvas.save")}</button><label>{tr("canvas.saved")}<select aria-label={tr("canvas.saved")} value={savedId} onChange={e => setSavedId(e.target.value)}><option value="">—</option>{saved.map(s => <option key={s.id} value={s.id}>{tr("canvas.revision", { name: s.name, revision: s.revision })}</option>)}</select></label><button disabled={!savedId} onClick={() => void load()}>{tr("canvas.load")}</button><button disabled={!savedId} onClick={() => void remove()}>{tr("canvas.delete")}</button>
 </fieldset>{busy && <button onClick={cancel}>{tr("canvas.cancel")}</button>}</aside></div>
 <footer><button disabled={!history?.past.length || busy || saving} onClick={() => action("undo")}>{tr("canvas.undo")}</button><button disabled={!history?.future.length || busy || saving} onClick={() => action("redo")}>{tr("canvas.redo")}</button><span>{tr(active.label)} · {Math.round(zoom * 100)}% · {source?.width} × {source?.height}</span><output className="selection-coordinates" aria-label={tr("canvas.coordinates")}>—</output><span>{tr("canvas.selected", { count: history?.present.mask.filter(Boolean).length ?? 0 })}</span><button disabled={!history || busy || saving} onClick={() => { if (history) {
        onApply(new Uint8Array(history.present.mask));
        onClose();
    } }}>{tr("canvas.apply")}</button></footer>
 </section></EditorWorkspace>;
}
