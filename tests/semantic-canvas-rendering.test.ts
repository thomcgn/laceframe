import { afterEach, beforeEach, expect, it } from "vitest";
import * as fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { ProjectService } from "../src/main/project-service";
import { encodePixels } from "../src/main/mask-composite";
import { seedHistoricalMaster } from "./historical-master";

let dir: string, s: ProjectService, masterId: string;

/** 6x6 PNG fixture with known non-transparent RGBA pixels:
 *  Border: transparent [0, 0, 0, 0]
 *  Row 1:  [0,0,0,0] [255,0,0,255] [0,255,0,255] [0,0,0,0]
 *  Row 2:  [0,0,0,0] [0,0,255,255] [255,255,255,255] [0,0,0,0]
 *  Rows 0,3: all transparent
 */
const fixture = () => {
  const width = 6,
    height = 6;
  const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      if (y === 0 || y === 3 || y === 4 || y === 5 || x === 0 || x === 5)
        data.set([0, 0, 0, 0], i);
      else if (y === 1) {
        if (x === 1) data.set([255, 0, 0, 255], i);
        else if (x === 2) data.set([0, 255, 0, 255], i);
        else data.set([0, 0, 0, 0], i);
      } else if (y === 2) {
        if (x === 1) data.set([0, 0, 255, 255], i);
        else if (x === 2) data.set([255, 255, 255, 255], i);
        else data.set([0, 0, 0, 0], i);
      } else data.set([0, 0, 0, 0], i);
    }
  return { width, height, data };
};

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), "laceframe-canvas-"));
  s = new ProjectService();
  await s.create(dir, "Canvas rendering fixture");
  await s.command({ type: "addCharacter", name: "Canvas Test" });
  const staged = await s.stage(encodePixels(fixture()), "master.png");
  await seedHistoricalMaster(
    s,
    staged,
    s.snapshot().project.selectedCharacterId,
  );
  masterId = s.snapshot().project.masters[0].id;
});

afterEach(async () => fs.rm(dir, { recursive: true, force: true }));

it("analysisSource returns expected RGBA pixels from the source image", async () => {
  const src = await s.analysisSource(masterId);
  expect(src.width).toBe(6);
  expect(src.height).toBe(6);
  expect(src.data.length).toBe(6 * 6 * 4);
  // Border pixel (0,0): transparent [0,0,0,0]
  expect([src.data[0], src.data[1], src.data[2], src.data[3]]).toEqual([
    0,
    0,
    0,
    0,
  ]);
  // (1,1): red [255,0,0,255]
  expect([src.data[7 * 4], src.data[7 * 4 + 1], src.data[7 * 4 + 2], src.data[7 * 4 + 3]]).toEqual([
    255,
    0,
    0,
    255,
  ]);
  // (2,1): green [0,255,0,255]
  expect([src.data[8 * 4], src.data[8 * 4 + 1], src.data[8 * 4 + 2], src.data[8 * 4 + 3]]).toEqual([
    0,
    255,
    0,
    255,
  ]);
  // (1,2): blue [0,0,255,255]
  expect([src.data[13 * 4], src.data[13 * 4 + 1], src.data[13 * 4 + 2], src.data[13 * 4 + 3]]).toEqual([
    0,
    0,
    255,
    255,
  ]);
  // (2,2): white [255,255,255,255]
  expect([src.data[14 * 4], src.data[14 * 4 + 1], src.data[14 * 4 + 2], src.data[14 * 4 + 3]]).toEqual([
    255,
    255,
    255,
    255,
  ]);
  // Non-transparent pixels exist
  let visibleAlpha = 0;
  for (let i = 0; i < 36; i++) if (src.data[i * 4 + 3] > 0) visibleAlpha++;
  expect(visibleAlpha).toBe(4);
});
