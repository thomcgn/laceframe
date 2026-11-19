import { expect, it } from "vitest";
import { bezierSelection, boxSelection, brushSelection, combineSelection, constrainSelection, editAnchor, editingHistory, commitEditing, undoEditing, redoEditing, emptyPath, flattenPath, pixelPerfect, polygonSelection, rangeSelection, selectionSize, translatePath, type VectorPath } from "../src/shared/editing";
const m = (...v: number[]) => new Uint8Array(v);
const pixels = (w = 5, h = 5) => ({ width: w, height: h, data: new Uint8Array(w * h * 4).fill(255) });
it("combines weighted selections without modifying inputs", () => {
    const a = m(0, 128, 255), b = m(255, 128, 0);
    expect(combineSelection(a, b, "replace")).toEqual(b);
    expect(combineSelection(a, b, "add")).toEqual(m(255, 128, 255));
    expect(combineSelection(a, b, "subtract")).toEqual(m(0, 127, 255));
    expect(combineSelection(a, b, "intersect")).toEqual(m(0, 128, 0));
    expect(a).toEqual(m(0, 128, 255));
    expect(() => combineSelection(a, m(1), "add")).toThrow();
});
it("clips invisible and protected pixels, rejects mismatched dimensions", () => {
    const p = pixels(2, 1);
    p.data[3] = 0;
    expect(constrainSelection(m(255, 128), p)).toEqual(m(0, 128));
    expect(constrainSelection(m(255, 128), p, m(255, 0))).toEqual(m(0, 0));
    expect(() => constrainSelection(m(0), p)).toThrow();
    expect(() => selectionSize(0, 5)).toThrow();
    expect(() => selectionSize(4096, 4096)).toThrow();
});
it("rasterizes bounded rectangles/ellipses at pixel centres, including reversed drags", () => {
    expect(boxSelection(3, 2, { x: 0, y: 0 }, { x: 2, y: 2 })).toEqual(m(255, 255, 0, 255, 255, 0));
    expect(boxSelection(3, 2, { x: 2, y: 2 }, { x: 0, y: 0 })).toEqual(m(255, 255, 0, 255, 255, 0));
    expect(boxSelection(5, 5, { x: 0, y: 0 }, { x: 5, y: 5 }, true).filter(Boolean)).toHaveLength(21);
    expect(boxSelection(5, 5, { x: 1, y: 1 }, { x: 1, y: 1 }, true).some(Boolean)).toBe(false);
});
const path: VectorPath = { closed: true, nodes: [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 4 }, { x: 0, y: 4 }].map(p => ({ p, in: { ...p }, out: { ...p }, symmetric: true })) };
it("closed straight Bézier segments match polygon masks exactly; open paths cannot become areas", () => {
    expect(bezierSelection(5, 5, path)).toEqual(boxSelection(5, 5, { x: 0, y: 0 }, { x: 4, y: 4 }));
    expect(() => bezierSelection(5, 5, { ...path, closed: false })).toThrow();
});
it("edits anchors/tangents, translates and deletes nodes without rewriting the original", () => {
    const curved = editAnchor(path, 0, "out", { x: 2, y: -2 });
    expect(curved.nodes[0].in).toEqual({ x: -2, y: 2 });
    const moved = editAnchor(curved, 0, "p", { x: 1, y: 1 });
    expect(moved.nodes[0].out).toEqual({ x: 3, y: -1 });
    expect(translatePath(moved, { x: 2, y: 3 }).nodes[0].p).toEqual({ x: 3, y: 4 });
    expect(flattenPath(curved).length).toBeGreaterThan(5);
    expect(bezierSelection(6, 6, curved)).toEqual(bezierSelection(6, 6, curved));
    const independent = editAnchor({ ...path, nodes: path.nodes.map(n => ({ ...n, symmetric: false })) }, 0, "out", { x: 2, y: 2 });
    expect(independent.nodes[0].in).toEqual({ x: 0, y: 0 });
    expect(bezierSelection(5, 5, { ...path, nodes: path.nodes.slice(1) }).some(Boolean)).toBe(true);
    expect(path.nodes[0].out).toEqual({ x: 0, y: 0 });
});
it("handles self intersections and outside contours deterministically without AA", () => {
    const p = [{ x: -2, y: -2 }, { x: 6, y: 6 }, { x: -2, y: 6 }, { x: 6, y: -2 }];
    const mask = polygonSelection(4, 4, p);
    expect(mask).toEqual(polygonSelection(4, 4, p));
    expect([...new Set(mask)].sort()).toEqual([0, 255]);
    expect(polygonSelection(4, 4, []).some(Boolean)).toBe(false);
});
it("wand defaults can separate identical disconnected/diagonal regions and honor alpha/selection barriers", () => {
    const p = pixels(3, 3);
    for (let i = 0; i < 9; i++)
        p.data.set([0, 0, 0, 255], i * 4);
    [0, 4, 8].forEach(i => p.data.set([80, 60, 40, 255], i * 4));
    const o = { seeds: [0], tolerance: 0, connected: true, diagonal: false, alpha: true };
    expect(rangeSelection(p, o).filter(Boolean)).toHaveLength(1);
    expect(rangeSelection(p, { ...o, diagonal: true }).filter(Boolean)).toHaveLength(3);
    expect(rangeSelection(p, { ...o, connected: false }).filter(Boolean)).toHaveLength(3);
    p.data[4 * 4 + 3] = 128;
    expect(rangeSelection(p, { ...o, diagonal: true, alpha: false }).filter(Boolean)).toHaveLength(3);
    expect(rangeSelection(p, { ...o, diagonal: true }).filter(Boolean)).toHaveLength(1);
    expect(rangeSelection(p, { ...o, diagonal: true, alpha: false, allowed: m(255, 255, 255, 255, 0, 255, 255, 255, 255) }).filter(Boolean)).toHaveLength(1);
});
it("zero tolerance tests exact original RGB; multiple seeds and CIE76 tolerance remain deterministic", () => {
    const p = pixels(3, 1);
    p.data.set([80, 60, 40, 255, 81, 60, 40, 255, 220, 220, 220, 255]);
    const o = { seeds: [0], tolerance: 0, connected: false, diagonal: false, alpha: true };
    expect(rangeSelection(p, o)).toEqual(m(255, 0, 0));
    expect(rangeSelection(p, { ...o, tolerance: 2 })).toEqual(m(255, 255, 0));
    expect(rangeSelection(p, { ...o, seeds: [0, 2] })).toEqual(m(255, 0, 255));
    p.data[3] = 0;
    expect(rangeSelection(p, o).some(Boolean)).toBe(false);
});
it("large iterative fill cannot overflow stack and supports cancellation", () => {
    const p = pixels(512, 512), o = { seeds: [0], tolerance: 0, connected: true, diagonal: true, alpha: true };
    expect(rangeSelection(p, o).filter(Boolean)).toHaveLength(512 * 512);
    let checks = 0;
    expect(() => rangeSelection(p, o, () => ++checks > 5)).toThrow();
});
it("circle/square brush and eraser stay continuous, clipped and selection-bound", () => {
    for (const square of [false, true]) {
        const mask = new Uint8Array(100);
        brushSelection(mask, 10, 10, [{ x: .5, y: .5 }, { x: 9.5, y: 9.5 }], 1, square, 255);
        for (let i = 0; i < 10; i++)
            expect(mask[i * 11]).toBe(255);
        brushSelection(mask, 10, 10, [{ x: .5, y: .5 }], 3, square, 0);
        expect(mask[0]).toBe(0);
        expect(mask[99]).toBe(255);
        const old = new Uint8Array(mask);
        brushSelection(mask, 10, 10, [{ x: 5, y: 5 }], 8, square, 255, new Uint8Array(100));
        expect(mask).toEqual(old);
    }
    expect(pixelPerfect([{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }])).toEqual([{ x: .5, y: .5 }, { x: 1.5, y: 1.5 }]);
});
it("history restores at least twenty mask/path actions including weighted values", () => {
    let h = editingHistory(m(0, 128));
    for (let i = 0; i < 20; i++)
        h = commitEditing(h, { mask: m(i, 128), path: translatePath(path, { x: i, y: 0 }) });
    for (let i = 0; i < 20; i++)
        h = undoEditing(h);
    expect(h.present.mask).toEqual(m(0, 128));
    for (let i = 0; i < 20; i++)
        h = redoEditing(h);
    expect(h.present.mask).toEqual(m(19, 128));
    expect(h.present.path.nodes[0].p.x).toBe(19);
    h = commitEditing(h, { mask: m(255, 0), path: emptyPath() });
    expect(h.future).toHaveLength(0);
});

it("central shortcuts honor text inputs, modifiers and platform command keys",async()=>{
 const {editorShortcut}=await import("../src/renderer/editing/tools");
 const event=(key:string,options:Partial<KeyboardEvent>={})=>({key,ctrlKey:false,metaKey:false,shiftKey:false,altKey:false,...options});
 expect(editorShortcut(event("b"),false)).toBe("brush");expect(editorShortcut(event("p"),false)).toBe("bezier");
 expect(editorShortcut(event("b"),true)).toBeUndefined();expect(editorShortcut(event("b",{altKey:true}),false)).toBeUndefined();
 for(const mod of [{ctrlKey:true},{metaKey:true}]){
 expect(editorShortcut(event("z",mod),false)).toBe("undo");expect(editorShortcut(event("z",{...mod,shiftKey:true}),false)).toBe("redo");
 expect(editorShortcut(event("a",mod),false)).toBe("all");expect(editorShortcut(event("i",{...mod,shiftKey:true}),false)).toBe("invert");
 }
});
