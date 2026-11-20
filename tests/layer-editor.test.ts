import { expect, it } from "vitest";
import {
  layerHistory,
  commitLayers,
  undoLayers,
  redoLayers,
  paintLayer,
  blockedPixels,
  selectLayerRegion,
} from "../src/shared/layer-editor";
import type { LayerDraft } from "../src/shared/semantic-layers";
import { paintStroke } from "../src/shared/masking";
const p = { width: 32, height: 16, data: new Uint8Array(32 * 16 * 4) };
for (let y = 1; y < 15; y++)
  for (let x = 1; x < 31; x++) p.data.set([80, 60, 40, 255], (y * 32 + x) * 4);
const row = (id = "hair"): LayerDraft => ({
  id,
  name: id,
  role: "hair",
  order: 0,
  visible: true,
  locked: false,
  weights: new Uint8Array(512),
});
it("uses the existing hard brush rasterizer without mutating source bytes or allocating a full mask per point", () => {
  const source = new Uint8Array(p.data),
    weights = new Uint8Array(512),
    from = { x: 5.5, y: 5.5 },
    to = { x: 8.5, y: 6.5 };
  paintLayer(p, weights, new Uint8Array(512), from, to, 2, 255);
  expect(weights).toEqual(
    paintStroke(new Uint8Array(512), 32, 16, from, to, 2, 255),
  );
  expect(p.data).toEqual(source);
  expect([...weights].every((v) => v === 0 || v === 255)).toBe(true);
});
it("does not paint transparency or locked regions; eraser affects only the active layer", () => {
  const protectedLayer = row("protected");
  protectedLayer.locked = true;
  protectedLayer.weights[165] = 255;
  const active = row();
  active.weights[165] = 255;
  const blocked = blockedPixels([active, protectedLayer], active.id, 512);
  paintLayer(
    p,
    active.weights,
    blocked,
    { x: 5.5, y: 5.5 },
    { x: 5.5, y: 5.5 },
    1,
    0,
  );
  expect(active.weights[165]).toBe(0);
  expect(protectedLayer.weights[165]).toBe(255);
  paintLayer(
    p,
    active.weights,
    blocked,
    { x: 0, y: 0 },
    { x: 6, y: 6 },
    2,
    255,
  );
  expect(active.weights[0]).toBe(0);
  expect(active.weights[165]).toBe(0);
});
it("connected fill cannot cross transparency or protected pixels; global selection is explicit", () => {
  const blocked = new Uint8Array(512);
  for (let y = 0; y < 16; y++) blocked[y * 32 + 8] = 255;
  const left = selectLayerRegion(p, blocked, {
    kind: "seed",
    x: 3,
    y: 3,
    tolerance: 0,
    connected: true,
  });
  expect(left[3 * 32 + 6]).toBe(255);
  expect(left[3 * 32 + 12]).toBe(0);
  expect(left[0]).toBe(0);
  const global = selectLayerRegion(p, blocked, {
    kind: "seed",
    x: 3,
    y: 3,
    tolerance: 1,
    connected: false,
  });
  expect(global[3 * 32 + 12]).toBe(255);
  expect(global[3 * 32 + 8]).toBe(0);
});
it("polygon uses existing pixel-center rasterization and clips invisible/protected pixels", () => {
  const blocked = new Uint8Array(512);
  blocked[34] = 255;
  const mask = selectLayerRegion(p, blocked, {
    kind: "polygon",
    points: [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
    ],
  });
  expect(mask[0]).toBe(0);
  expect(mask[34]).toBe(0);
  expect(mask[99]).toBe(255);
});
it("retains twenty full operations, undo/redo masks and metadata with compact binary history", () => {
  let h = layerHistory([row()]);
  for (let i = 0; i < 20; i++) {
    const weights = new Uint8Array(h.present[0].weights);
    weights[33 + i] = 255;
    h = commitLayers(h, [{ ...h.present[0], name: `Hair ${i}`, weights }]);
  }
  expect(h.past).toHaveLength(20);
  expect(h.past[0][0].data.length).toBe(64);
  for (let i = 0; i < 20; i++) h = undoLayers(h);
  expect(h.present[0].weights.some(Boolean)).toBe(false);
  expect(h.present[0].name).toBe("hair");
  for (let i = 0; i < 20; i++) h = redoLayers(h);
  expect(h.present[0].weights.filter(Boolean)).toHaveLength(20);
  expect(h.present[0].name).toBe("Hair 19");
  h = undoLayers(h);
  h = commitLayers(h, [{ ...h.present[0], locked: true }]);
  expect(h.future).toHaveLength(0);
  expect(h.present[0].locked).toBe(true);
});
it("preserves imported soft weights exactly while supporting layer add/remove undo", () => {
  const first = row();
  first.weights[33] = 91;
  let h = layerHistory([first]);
  h = commitLayers(h, [first, { ...row("other"), order: 1 }]);
  h = undoLayers(h);
  expect(h.present).toHaveLength(1);
  expect(h.present[0].weights[33]).toBe(91);
  h = redoLayers(h);
  expect(h.present).toHaveLength(2);
});
it("bounds twenty 4 MP binary undo masks to ten MiB of packed history",()=>{
 const n=2048*2048,start=performance.now();let h=layerHistory([{...row(),weights:new Uint8Array(n)}]);
 for(let i=0;i<20;i++){const weights=new Uint8Array(h.present[0].weights);weights[i]=255;h=commitLayers(h,[{...h.present[0],weights}]);}
 expect(h.past).toHaveLength(20);expect(h.past.reduce((sum,rows)=>sum+rows[0].data.byteLength,0)).toBe(10*1024*1024);
 for(let i=0;i<20;i++)h=undoLayers(h);expect(h.present[0].weights.some(Boolean)).toBe(false);
 console.log(`4 MP semantic history: ${Math.round(performance.now()-start)} ms; 10 MiB packed masks`);
}, 30_000);
