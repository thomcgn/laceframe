import { afterEach, beforeEach, expect, it } from "vitest";
import * as fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { randomUUID } from "node:crypto";
import { ProjectService, hashBytes } from "../src/main/project-service";
import { encodePixels } from "../src/main/mask-composite";
import { seedHistoricalMaster } from "./historical-master";
import { emptyPath } from "../src/shared/editing";
let root: string, s: ProjectService, id: string, sha: string;
const pixels = { width: 8, height: 8, data: new Uint8Array(8 * 8 * 4).fill(255) };
beforeEach(async () => { root = await fs.mkdtemp(path.join(os.tmpdir(), "lf-selection-")); s = new ProjectService(); await s.create(root, "Synthetic selection"); await s.command({ type: "addCharacter", name: "Synthetic" }); const staged = await s.stage(encodePixels(pixels), "source.png"); await seedHistoricalMaster(s, staged, s.snapshot().project.selectedCharacterId); const m = s.snapshot().project.masters[0]; id = m.id; sha = m.sha256; });
afterEach(async () => fs.rm(root, { recursive: true, force: true }));
const save = (weights = new Uint8Array(64), sourceSha256 = sha) => s.command({ type: "saveEditorSelection", sourceId: id, sourceSha256, name: "Selection", weights, path: emptyPath() });
it("persists exact weighted selection and editable vectors as immutable source-bound revisions", async () => {
    const source = s.snapshot().project.masters[0], bytes = await fs.readFile(path.join(root, source.file));
    const weights = new Uint8Array(64);
    weights[2] = 128;
    weights[5] = 255;
    const curve = { closed: true, nodes: [{ x: 1, y: 1 }, { x: 7, y: 1 }, { x: 4, y: 7 }].map(p => ({ p, in: p, out: p, symmetric: true })) };
    await s.command({ type: "saveEditorSelection", sourceId: id, sourceSha256: sha, name: "Curve", weights, path: curve });
    const a = s.editorSelections(id)[0], mask = await fs.readFile(path.join(root, a.mask.file));
    expect(hashBytes(mask)).toBe(a.mask.sha256);
    expect((await fs.stat(path.join(root, a.mask.file))).mode & 0o222).toBe(0);
    await save();
    await s.open(root);
    expect(s.editorSelections(id).map(s => s.revision)).toEqual([1, 2]);
    expect((await s.editorSelection(a.id)).weights).toEqual(weights);
    expect((await s.editorSelection(a.id)).record.path).toEqual(curve);
    expect(await fs.readFile(path.join(root, a.mask.file))).toEqual(mask);
    expect(await fs.readFile(path.join(root, source.file))).toEqual(bytes);
});
it("opens pre-selection projects without writes and creates an exclusive backup before first selection save", async () => {
    const file = path.join(root, "laceframe.json"), raw = s.snapshot().project as unknown as Record<string, unknown>;
    delete raw.editorSelections;
    const original = JSON.stringify(raw);
    await fs.writeFile(file, original);
    await s.open(root);
    expect(await fs.readFile(file, "utf8")).toBe(original);
    await save();
    const backup = path.join(root, "laceframe.v2.pre-editor-selections.backup.json");
    expect(await fs.readFile(backup, "utf8")).toBe(original);
    await save();
    expect(await fs.readFile(backup, "utf8")).toBe(original);
});
it("rejects stale SHA, dimensions, foreign IDs, malformed vectors and preserves pending import tokens", async () => {
    const before = await fs.readFile(path.join(root, "laceframe.json"));
    await expect(save(new Uint8Array(63))).rejects.toThrow();
    await expect(save(new Uint8Array(64), "0".repeat(64))).rejects.toThrow();
    await expect(s.command({ type: "saveEditorSelection", sourceId: randomUUID(), sourceSha256: sha, name: "x", weights: new Uint8Array(64), path: emptyPath() })).rejects.toThrow();
    await expect(s.command({ type: "saveEditorSelection", sourceId: id, sourceSha256: sha, name: "x", weights: new Uint8Array(64), path: { closed: true, nodes: [{ p: { x: Infinity, y: 2 }, in: { x: 0, y: 0 }, out: { x: 0, y: 0 }, symmetric: true }] } })).rejects.toThrow();
    const staged = await s.stage(encodePixels(pixels), "pending.png");
    await expect(save()).rejects.toThrow();
    expect(await fs.readFile(path.join(root, "laceframe.json"))).toEqual(before);
    s.discard(staged.token);
    await save();
});
it.each(["path", "hash", "dimensions", "symlink", "foreign-source"])("rejects %s tampering before replacing the active project", async (kind) => {
    await save();
    const before = s.snapshot().project, p = structuredClone(before), a = p.editorSelections[0], file = path.join(root, a.mask.file);
    if (kind === "path")
        a.mask.file = "../outside.png";
    if (kind === "hash") {
        await fs.chmod(file, 0o600);
        await fs.writeFile(file, encodePixels(pixels));
    }
    if (kind === "dimensions")
        a.width++;
    if (kind === "foreign-source")
        a.sourceId = randomUUID();
    if (kind === "symlink") {
        const copy = path.join(root, "outside.png");
        await fs.copyFile(file, copy);
        await fs.unlink(file);
        await fs.symlink(copy, file);
    }
    await fs.writeFile(path.join(root, "laceframe.json"), JSON.stringify(p));
    await expect(s.open(root)).rejects.toThrow();
    expect(s.snapshot().project).toEqual(before);
});
it("offers only exact-source committed semantic masks to other editors, with verified immutable bytes",async()=>{
  const weights=new Uint8Array(64);weights[20]=255;const layerId=randomUUID();
  await s.command({type:"saveSemanticLayers",sourceId:id,sourceSha256:sha,layers:[{id:layerId,name:"Hair source",role:"hair",weights,visible:true,locked:false,order:0}]});
  const refs=await s.selectionReferences(id);expect(refs).toHaveLength(1);expect(refs[0]).toEqual({id:layerId,name:"Hair source",weights});
  const project=s.snapshot().project,staged=await s.stage(encodePixels(pixels),"expression.png");
  await s.command({type:"importCandidate",characterId:project.selectedCharacterId!,variantId:project.variants[0].id,action:"silent",token:staged.token});
  expect(await s.selectionReferences(s.snapshot().project.assets[0].id)).toEqual([]);
  const file=path.join(root,project.semanticLayerSets[0].layers[0].mask.file);await fs.chmod(file,0o600);await fs.writeFile(file,"corrupt");
  await expect(s.selectionReferences(id)).rejects.toThrow();await expect(s.selectionReferences(randomUUID())).rejects.toThrow();
});
it("deletes saved selection revisions and removes orphaned mask bytes",async()=>{
  await save();
  const before=s.snapshot().project.editorSelections;
  expect(before).toHaveLength(1);
  const maskPath=path.join(root,before[0].mask.file);
  expect(await fs.readFile(maskPath)).toBeInstanceOf(Buffer);
  await s.command({type:"deleteEditorSelection",id:before[0].id});
  expect(s.snapshot().project.editorSelections).toHaveLength(0);
  await expect(fs.readFile(maskPath)).rejects.toThrow();
  // Reload from disk: the manifest no longer references the deleted mask, so open succeeds.
  await s.open(root);
  expect(s.snapshot().project.editorSelections).toHaveLength(0);
});
it("rejects delete of unknown or already-deleted selection ids",async()=>{
  await save();
  await expect(s.command({type:"deleteEditorSelection",id:randomUUID()})).rejects.toThrow();
  const before=s.snapshot().project.editorSelections[0];
  await s.command({type:"deleteEditorSelection",id:before.id});
  await expect(s.command({type:"deleteEditorSelection",id:before.id})).rejects.toThrow();
});
