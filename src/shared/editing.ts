import { z } from "zod";
import { tr } from "./locales";
import type { ColorPixels } from "./color-consistency";
import { pixelLab as rgbToLab } from "./smart-cutout";
import { visitStrokePixels, type Point } from "./masking";
export const EDITING_MAX_PIXELS = 4194304;
export type SelectionOperation = "replace" | "add" | "subtract" | "intersect";
const point = z.object({ x: z.number().finite().min(-32768).max(32768), y: z.number().finite().min(-32768).max(32768) }).strict();
export const vectorPathSchema = z.object({
    closed: z.boolean(),
    nodes: z.array(z.object({ p: point, in: point, out: point, symmetric: z.boolean() }).strict()).max(128),
}).strict();
export type VectorPath = z.infer<typeof vectorPathSchema>;
export const emptyPath = (): VectorPath => ({ closed: false, nodes: [] });
export function selectionSize(width: number, height: number) {
    if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width * height > EDITING_MAX_PIXELS)
        throw new Error(tr("canvas.invalid"));
    return width * height;
}
export function checkMask(mask: Uint8Array, n: number) {
    if (!(mask instanceof Uint8Array) || mask.length !== n)
        throw new Error(tr("canvas.invalid"));
}
/** Weighted operations preserve existing weights; no smoothing or implicit alpha multiplication. */
export function combineSelection(a: Uint8Array, b: Uint8Array, op: SelectionOperation) {
    checkMask(b, a.length);
    if (!["replace", "add", "subtract", "intersect"].includes(op))
        throw new Error(tr("canvas.invalid"));
    return a.map((v, i) => op === "replace" ? b[i] : op === "add" ? Math.max(v, b[i]) : op === "subtract" ? Math.min(v, 255 - b[i]) : Math.min(v, b[i]));
}
export function constrainSelection(mask: Uint8Array, source: ColorPixels, allowed?: Uint8Array) {
    const n = selectionSize(source.width, source.height);
    checkMask(mask, n);
    if (source.data.length !== n * 4)
        throw new Error(tr("canvas.invalid"));
    if (allowed)
        checkMask(allowed, n);
    return mask.map((v, i) => source.data[i * 4 + 3] && (!allowed || allowed[i]) ? v : 0);
}
/** Pixel-centre parity, half-open Y intersections, left inclusive/right exclusive. Self intersections use even-odd. */
export function polygonSelection(width: number, height: number, points: Point[]) {
    const out = new Uint8Array(selectionSize(width, height));
    if (points.length < 3)
        return out;
    if (points.length > 8192 || points.some(p => !Number.isFinite(p.x) || !Number.isFinite(p.y)))
        throw new Error(tr("canvas.invalid"));
    for (let y = Math.max(0, Math.ceil(Math.min(...points.map(p => p.y)) - .5)); y < Math.min(height, Math.ceil(Math.max(...points.map(p => p.y)) - .5)); y++) {
        const xs: number[] = [], scan = y + .5;
        for (let i = 0; i < points.length; i++) {
            const a = points[i], b = points[(i + 1) % points.length];
            if ((a.y <= scan && scan < b.y) || (b.y <= scan && scan < a.y))
                xs.push(a.x + (scan - a.y) * (b.x - a.x) / (b.y - a.y));
        }
        xs.sort((a, b) => a - b);
        for (let i = 0; i + 1 < xs.length; i += 2)
            out.fill(255, y * width + Math.max(0, Math.min(width, Math.ceil(xs[i] - .5))), y * width + Math.max(0, Math.min(width, Math.ceil(xs[i + 1] - .5))));
    }
    return out;
}
export function boxSelection(width: number, height: number, from: Point, to: Point, ellipse = false) {
    const out = new Uint8Array(selectionSize(width, height));
    const left = Math.min(from.x, to.x), right = Math.max(from.x, to.x), top = Math.min(from.y, to.y), bottom = Math.max(from.y, to.y);
    for (let y = Math.max(0, Math.ceil(top - .5)); y < Math.min(height, Math.ceil(bottom - .5)); y++)
        for (let x = Math.max(0, Math.ceil(left - .5)); x < Math.min(width, Math.ceil(right - .5)); x++)
            if (!ellipse || ((x + .5 - (left + right) / 2) / ((right - left) / 2)) ** 2 + ((y + .5 - (top + bottom) / 2) / ((bottom - top) / 2)) ** 2 <= 1)
                out[y * width + x] = 255;
    return out;
}
export function editAnchor(path: VectorPath, index: number, part: "p" | "in" | "out", position: Point) {
    const next = structuredClone(path), n = next.nodes[index];
    if (!n)
        return next;
    if (part === "p") {
        for (const side of ["in", "out"] as const)
            n[side] = { x: n[side].x + position.x - n.p.x, y: n[side].y + position.y - n.p.y };
    }
    else if (n.symmetric)
        n[part === "in" ? "out" : "in"] = { x: 2 * n.p.x - position.x, y: 2 * n.p.y - position.y };
    n[part] = position;
    return vectorPathSchema.parse(next);
}
export function translatePath(path: VectorPath, delta: Point): VectorPath {
    return vectorPathSchema.parse({ ...path, nodes: path.nodes.map(n => ({ ...n, ...Object.fromEntries((["p", "in", "out"] as const).map(k => [k, { x: n[k].x + delta.x, y: n[k].y + delta.y }])) })) });
}
const mid = (a: Point, b: Point): Point => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
export function flattenPath(input: VectorPath) {
    const path = vectorPathSchema.parse(input), points: Point[] = [];
    if (!path.nodes.length)
        return points;
    const flatten = (a: Point, b: Point, c: Point, d: Point, depth: number) => {
        const dx = d.x - a.x, dy = d.y - a.y, length = dx * dx + dy * dy;
        const distance = (p: Point) => { const t = length ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / length)) : 0; return (p.x - a.x - t * dx) ** 2 + (p.y - a.y - t * dy) ** 2; };
        if (depth === 12 || (distance(b) <= 1 / 256 && distance(c) <= 1 / 256)) {
            points.push(d);
            return;
        }
        const ab = mid(a, b), bc = mid(b, c), cd = mid(c, d), abc = mid(ab, bc), bcd = mid(bc, cd), centre = mid(abc, bcd);
        flatten(a, ab, abc, centre, depth + 1);
        flatten(centre, bcd, cd, d, depth + 1);
        if (points.length > 8192)
            throw new Error(tr("canvas.pathLimit"));
    };
    points.push(path.nodes[0].p);
    const count = path.closed ? path.nodes.length : path.nodes.length - 1;
    for (let i = 0; i < count; i++) {
        const a = path.nodes[i], b = path.nodes[(i + 1) % path.nodes.length];
        flatten(a.p, a.out, b.in, b.p, 0);
    }
    return points;
}
export function bezierSelection(width: number, height: number, path: VectorPath) {
    if (!path.closed || path.nodes.length < 3)
        throw new Error(tr("canvas.closeFirst"));
    return polygonSelection(width, height, flattenPath(path));
}
export type RangeOptions = {
    seeds: number[];
    tolerance: number;
    connected: boolean;
    diagonal: boolean;
    alpha: boolean;
    allowed?: Uint8Array;
};
/** Deterministic CIE76 in D65 Lab; tolerance 0 tests original RGB and optionally alpha exactly. Iterative bounded queue. */
export function rangeSelection(source: ColorPixels, options: RangeOptions, cancelled: () => boolean = () => false) {
    const n = selectionSize(source.width, source.height), out = new Uint8Array(n), eligible = new Uint8Array(n);
    if (source.data.length !== n * 4 || options.seeds.length > 32 || !Number.isFinite(options.tolerance) || options.tolerance < 0 || options.tolerance > 100)
        throw new Error(tr("canvas.invalid"));
    if (options.allowed)
        checkMask(options.allowed, n);
    const seeds = options.seeds.map(i => {
        if (!Number.isInteger(i) || i < 0 || i >= n)
            throw new Error(tr("canvas.invalid"));
        return { i, rgb: Array.from(source.data.subarray(i * 4, i * 4 + 3)), alpha: source.data[i * 4 + 3], lab: rgbToLab(...Array.from(source.data.subarray(i * 4, i * 4 + 3)) as [
                number,
                number,
                number
            ]) };
    });
    for (let i = 0; i < n; i++) {
        if ((i & 4095) === 0 && cancelled())
            throw new Error(tr("canvas.cancelled"));
        if (!source.data[i * 4 + 3] || (options.allowed && !options.allowed[i]))
            continue;
        const rgb = source.data.subarray(i * 4, i * 4 + 3), lab = options.tolerance ? rgbToLab(rgb[0], rgb[1], rgb[2]) : undefined;
        if (seeds.some(s => s.alpha > 0 && (!options.alpha || s.alpha === source.data[i * 4 + 3]) && (lab ? lab.reduce((sum, v, c) => sum + (v - s.lab[c]) ** 2, 0) <= options.tolerance ** 2 : rgb.every((v, c) => v === s.rgb[c]))))
            eligible[i] = 255;
    }
    if (!options.connected)
        return eligible;
    const queue = new Uint32Array(n);
    let head = 0, tail = 0;
    const push = (i: number) => { if (eligible[i] && !out[i]) {
        out[i] = 255;
        queue[tail++] = i;
    } };
    seeds.forEach(s => push(s.i));
    while (head < tail) {
        if ((head & 4095) === 0 && cancelled())
            throw new Error(tr("canvas.cancelled"));
        const i = queue[head++], x = i % source.width, y = Math.floor(i / source.width);
        for (let dy = -1; dy <= 1; dy++)
            for (let dx = -1; dx <= 1; dx++) {
                if ((!dx && !dy) || (!options.diagonal && dx && dy))
                    continue;
                if (x + dx >= 0 && x + dx < source.width && y + dy >= 0 && y + dy < source.height)
                    push(i + dx + dy * source.width);
            }
    }
    return out;
}
export function pixelPerfect(points: Point[]) {
    const result: Point[] = [];
    for (const p of points) {
        const v = { x: Math.floor(p.x) + .5, y: Math.floor(p.y) + .5 };
        if (result.at(-1)?.x === v.x && result.at(-1)?.y === v.y)
            continue;
        const a = result.at(-2), b = result.at(-1);
        if (a && b && Math.abs(a.x - v.x) === 1 && Math.abs(a.y - v.y) === 1 && (a.x === b.x || a.y === b.y) && (b.x === v.x || b.y === v.y))
            result.pop();
        result.push(v);
    }
    return result;
}
export function brushSelection(mask: Uint8Array, width: number, height: number, points: Point[], size: number, square: boolean, value: number, allowed?: Uint8Array) {
    checkMask(mask, selectionSize(width, height));
    if (allowed)
        checkMask(allowed, mask.length);
    if (!Number.isFinite(size) || size < 1 || size > 256)
        throw new Error(tr("canvas.invalid"));
    const visit = (i: number) => { if (!allowed || allowed[i])
        mask[i] = value; };
    for (let i = 0; i < points.length; i++) {
        const from = points[Math.max(0, i - 1)], to = points[i];
        if (!square)
            visitStrokePixels(width, height, from, to, size / 2, visit);
        else {
            const steps = Math.max(1, Math.ceil(Math.max(Math.abs(to.x - from.x), Math.abs(to.y - from.y)) * 2));
            for (let s = 0; s <= steps; s++) {
                const x = Math.floor(from.x + (to.x - from.x) * s / steps), y = Math.floor(from.y + (to.y - from.y) * s / steps), low = Math.floor((size - 1) / 2);
                for (let yy = Math.max(0, y - low); yy < Math.min(height, y - low + size); yy++)
                    for (let xx = Math.max(0, x - low); xx < Math.min(width, x - low + size); xx++)
                        visit(yy * width + xx);
            }
        }
    }
}
export type EditingState = {
    mask: Uint8Array;
    path: VectorPath;
};
type Packed = {
    size: number;
    binary: boolean;
    bytes: Uint8Array;
    path: VectorPath;
};
function pack(s: EditingState): Packed {
    const binary = s.mask.every(v => v === 0 || v === 255), bytes = binary ? new Uint8Array(Math.ceil(s.mask.length / 8)) : new Uint8Array(s.mask);
    if (binary)
        s.mask.forEach((v, i) => { if (v)
            bytes[i >> 3] |= 1 << (i & 7); });
    return { size: s.mask.length, binary, bytes, path: structuredClone(s.path) };
}
function unpack(p: Packed): EditingState { return { mask: p.binary ? Uint8Array.from({ length: p.size }, (_, i) => p.bytes[i >> 3] & (1 << (i & 7)) ? 255 : 0) : new Uint8Array(p.bytes), path: structuredClone(p.path) }; }
export type EditingHistory = {
    present: EditingState;
    past: Packed[];
    future: Packed[];
};
export const editingHistory = (mask: Uint8Array): EditingHistory => ({ present: { mask: new Uint8Array(mask), path: emptyPath() }, past: [], future: [] });
export function commitEditing(h: EditingHistory, next: EditingState): EditingHistory { return { present: next, past: [...h.past, pack(h.present)].slice(-20), future: [] }; }
export function undoEditing(h: EditingHistory): EditingHistory { return h.past.length ? { present: unpack(h.past.at(-1)!), past: h.past.slice(0, -1), future: [pack(h.present), ...h.future] } : h; }
export function redoEditing(h: EditingHistory): EditingHistory { return h.future.length ? { present: unpack(h.future[0]), past: [...h.past, pack(h.present)].slice(-20), future: h.future.slice(1) } : h; }
export const savedSelectionInputSchema = z.object({ sourceId: z.uuid(), sourceSha256: z.string().regex(/^[a-f0-9]{64}$/), name: z.string().trim().min(1).max(120), weights: z.instanceof(Uint8Array).refine(v => v.length <= EDITING_MAX_PIXELS), path: vectorPathSchema }).strict();
export const savedSelectionSchema = savedSelectionInputSchema.omit({ weights: true }).extend({ id: z.uuid(), width: z.number().int().positive(), height: z.number().int().positive(), revision: z.number().int().positive(), createdAt: z.iso.datetime(), mask: z.object({ file: z.string(), sha256: z.string().regex(/^[a-f0-9]{64}$/) }).strict() }).strict().refine(v => v.width * v.height <= EDITING_MAX_PIXELS);
export type SavedSelection = z.infer<typeof savedSelectionSchema>;
