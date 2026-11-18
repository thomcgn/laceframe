import { it, expect, describe } from "vitest";
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  applyPixelEdit,
  pixelEditInputSchema,
  type PixelEdit,
} from "../src/shared/pixel-snap";
import { encodePixels, decodePixels } from "../src/main/mask-composite";
import type { ColorPixels } from "../src/shared/color-consistency";
const hash = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");
function grid(shift = false, transparent = false): ColorPixels {
  const width = 48,
    height = 64,
    data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const n =
        (Math.floor((x + (shift && y > 24 ? 1 : 0)) / 4) + Math.floor(y / 4)) %
        3;
      data.set(
        [
          [50, 35, 30, 255],
          [150, 95, 70, 255],
          [30, 75, 100, 255],
        ][n],
        (y * width + x) * 4,
      );
      if (transparent && (x < 8 || y < 8 || x >= width - 8 || y >= height - 8))
        data[(y * width + x) * 4 + 3] = 0;
      if (transparent && x === 12 && y === 12)
        data[(y * width + x) * 4 + 3] = 96;
    }
  return { width, height, data };
}
const cases: { name: string; p: ColorPixels; edit: PixelEdit }[] = [
  {
    name: "synthetic-grid-auto",
    p: grid(),
    edit: { kind: "spritefusion", settings: { colors: 3 } },
  },
  {
    name: "shifted-clusters",
    p: grid(true),
    edit: { kind: "spritefusion", settings: { colors: 3, pixelSize: 4 } },
  },
  {
    name: "transparent-sprite",
    p: grid(false, true),
    edit: { kind: "spritefusion", settings: { colors: 3, pixelSize: 4 } },
  },
  {
    name: "custom-palette",
    p: grid(),
    edit: {
      kind: "spritefusion",
      settings: { colors: 3, pixelSize: 4, palette: ["#102030", "#e0d0b0"] },
    },
  },
  {
    name: "clean-pixel-art",
    p: grid(),
    edit: { kind: "spritefusion", settings: { colors: 3, pixelSize: 4 } },
  },
];
if (process.env.SPRITEFUSION_PORTRAIT)
  cases.push({
    name: "external-ai-portrait-sample",
    p: decodePixels(readFileSync(process.env.SPRITEFUSION_PORTRAIT)),
    edit: { kind: "spritefusion", settings: { colors: 16, pixelSize: 4 } },
  });
const records: Record<string, unknown> = {};
let gold: Record<string, { png: string; width: number; height: number }> = {};
try {
  gold = JSON.parse(
    readFileSync("tests/fixtures/spritefusion-golden.json", "utf8"),
  );
} catch {
  /* recording first native baseline */
}
describe("unmodified Sprite Fusion engine conformance", () => {
  for (const c of cases)
    it(c.name, () => {
      const original = new Uint8Array(c.p.data),
        out = applyPixelEdit(
          c.p,
          c.edit,
          new Uint8Array(c.p.width * c.p.height),
        );
      expect(out.png?.subarray(0, 8)).toEqual(
        new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
      );
      expect(Buffer.from(c.p.data).equals(Buffer.from(original))).toBe(true);
      const decoded = decodePixels(out.png!);
      expect(decoded.width).toBe(out.width);
      expect(decoded.height).toBe(out.height);
      expect(Buffer.from(decoded.data).equals(Buffer.from(out.data))).toBe(
        true,
      );
      if (
        process.env.SPRITEFUSION_REFERENCE_CLI &&
        c.edit.kind === "spritefusion"
      ) {
        const root = mkdtempSync(
          path.join(os.tmpdir(), "laceframe-original-compare-"),
        );
        try {
          const input = path.join(root, "input.png"),
            output = path.join(root, "original.png");
          writeFileSync(input, encodePixels(c.p));
          const s = c.edit.settings;
          execFileSync(
            process.env.SPRITEFUSION_REFERENCE_CLI,
            [
              input,
              output,
              String(s.colors),
              ...(s.pixelSize ? ["--pixel-size", String(s.pixelSize)] : []),
              ...(s.palette
                ? ["--palette", s.palette.map((c) => c.slice(1)).join(",")]
                : []),
            ],
            { stdio: "pipe" },
          );
          const ref = readFileSync(output);
          expect(hash(out.png!)).toBe(hash(ref));
          expect(Buffer.from(out.png!).equals(ref)).toBe(true);
          records[c.name] = {
            png: hash(ref),
            width: out.width,
            height: out.height,
          };
          if (c.name === "external-ai-portrait-sample") {
            writeFileSync(
              path.join(
                process.env.SPRITEFUSION_TEST_OUTPUT ??
                  "artifacts/spritefusion",
                "portrait-result.png",
              ),
              ref,
            );
            writeFileSync(
              path.join(
                process.env.SPRITEFUSION_TEST_OUTPUT ??
                  "artifacts/spritefusion",
                "portrait-input.png",
              ),
              encodePixels(c.p),
            );
          }
        } finally {
          rmSync(root, { recursive: true, force: true });
        }
      } else {
        expect(
          gold[c.name],
          "Recorded original-engine fixture required",
        ).toBeDefined();
        expect(hash(out.png!)).toBe(gold[c.name].png);
        expect(out.width).toBe(gold[c.name].width);
        expect(out.height).toBe(gold[c.name].height);
      }
      if (c.name === "custom-palette")
        for (let i = 0; i < out.data.length; i += 4)
          if (out.data[i + 3])
            expect(["102030", "e0d0b0"]).toContain(
              Buffer.from(out.data.slice(i, i + 3)).toString("hex"),
            );
      if (c.name === "transparent-sprite") {
        expect(out.data[3]).toBe(0);
        expect(
          out.data.some((_, i) => i % 4 === 3 && out.data[i] === 255),
        ).toBe(true);
      }
      expect(out.width).toBeLessThan(c.p.width);
      expect(out.height).toBeLessThan(c.p.height);
    });
  it("fails closed on protection, malformed settings, geometry and work budget", () => {
    const p = grid(),
      mask = new Uint8Array(p.width * p.height);
    mask[20] = 255;
    expect(() => applyPixelEdit(p, cases[0].edit, mask)).toThrow(
      "Schutzmasken",
    );
    expect(() =>
      applyPixelEdit(
        p,
        { kind: "spritefusion", settings: { colors: 0 } },
        new Uint8Array(mask.length),
      ),
    ).toThrow();
    expect(() =>
      applyPixelEdit(
        p,
        { kind: "spritefusion", settings: { colors: 3, pixelSize: 999 } },
        new Uint8Array(mask.length),
      ),
    ).toThrow("Rastergröße");
    expect(() =>
      applyPixelEdit(
        { width: 1024, height: 1024, data: new Uint8Array(1024 * 1024 * 4) },
        { kind: "spritefusion", settings: { colors: 256 } },
        new Uint8Array(1024 * 1024),
      ),
    ).toThrow("Pixel×Farben");
    expect(
      pixelEditInputSchema.safeParse({
        edit: {
          kind: "spritefusion",
          settings: { colors: 16, palette: ["red"] },
        },
      }).success,
    ).toBe(false);
  });
  it("records reference hashes only from an explicitly provided unchanged native CLI", () => {
    if (process.env.SPRITEFUSION_RECORD === "1") {
      expect(process.env.SPRITEFUSION_REFERENCE_CLI).toBeTruthy();
      // The external portrait remains outside git; only synthetic reference hashes are committed.
      delete records["external-ai-portrait-sample"];
      writeFileSync(
        "tests/fixtures/spritefusion-golden.json",
        JSON.stringify(records, null, 2) + "\n",
      );
    }
  });
});
