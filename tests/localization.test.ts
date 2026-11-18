import { afterEach, expect, it } from "vitest";
import * as fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import ts from "typescript";
import { AppPreferences } from "../src/main/app-preferences";
import {
  i18n,
  resources,
  resolveLanguage,
  setLanguage,
  tr,
  displayMessage,
} from "../src/shared/locales";
import { validateCatalogue } from "../src/shared/locales/validation";
import { executionLabel } from "../src/shared/generation";
import { createPresets } from "../src/shared/presets";
const dirs: string[] = [];
async function directory() {
  const d = await fs.mkdtemp(path.join(os.tmpdir(), "laceframe-language-"));
  dirs.push(d);
  return d;
}
afterEach(async () => {
  await setLanguage("de");
  await Promise.all(
    dirs.splice(0).map((d) => fs.rm(d, { recursive: true, force: true })),
  );
});
it("validates all installed language JSON, placeholders, referenced and obsolete keys", async () => {
  const references = new Set<string>();
  for (const folder of [
    "src/main",
    "src/preload",
    "src/shared",
    "src/renderer",
  ]) {
    for (const file of await fs.readdir(folder, { recursive: true })) {
      if (
        !/\.tsx?$/.test(file) ||
        file.includes("locales/") ||
        file.includes("generated")
      )
        continue;
      const source = await fs.readFile(path.join(folder, file), "utf8");
      for (const m of source.matchAll(
        /"((?:common|characters|studio|expressions|styles|editing|errors)\.[\w]+)"/g,
      ))
        references.add(m[1]);
    }
  }
  // The fixed presentation map itself is a consumer of catalogue keys.
  for (const m of (
    await fs.readFile("src/shared/locales/index.ts", "utf8")
  ).matchAll(
    /"((?:common|characters|studio|expressions|styles|editing|errors)\.[\w]+)"/g,
  ))
    references.add(m[1]);
  const english = resources.en.translation;
  for (const [language, resource] of Object.entries(resources)) {
    expect(Object.keys(resource.translation).sort(), language).toEqual(
      Object.keys(english).sort(),
    );
    for (const [namespace, catalogue] of Object.entries(english))
      expect(
        validateCatalogue(catalogue, resource.translation[namespace]),
        `${language}/${namespace}`,
      ).toEqual([]);
  }
  const available = new Set(
    Object.entries(english).flatMap(([ns, m]) =>
      Object.keys(m).map((k) => `${ns}.${k}`),
    ),
  );
  expect([...references].filter((k) => !available.has(k))).toEqual([]);
  expect([...available].filter((k) => !references.has(k))).toEqual([]);
});
it("rejects malformed catalogues, missing/obsolete keys and altered placeholders", () => {
  expect(
    validateCatalogue(
      { message: "Hello {{name}}" },
      { message: "Hello {{other}}", old: "Old" },
    ),
  ).toEqual(["Placeholder mismatch: message", "Obsolete key: old"]);
  expect(validateCatalogue({ message: "Hello" }, {})).toEqual([
    "Missing key: message",
  ]);
  for (const value of [
    [],
    null,
    { message: 42 },
    { message: { nested: "unsupported" } },
    { message: "" },
  ])
    expect(validateCatalogue({ message: "Hello" }, value)).toEqual([
      "Invalid catalogue structure",
    ]);
});
it("contains no hardcoded React presentation text except technical symbols", async () => {
  const allowed = new Set(["L", "V", "SHA-256", "/ Y"]);
  const issues: string[] = [];
  for (const file of await fs.readdir("src/renderer", { recursive: true })) {
    if (!file.endsWith(".tsx")) continue;
    const source = await fs.readFile(path.join("src/renderer", file), "utf8"),
      root = ts.createSourceFile(
        file,
        source,
        ts.ScriptTarget.Latest,
        true,
        ts.ScriptKind.TSX,
      );
    function visit(n: ts.Node) {
      if (ts.isJsxText(n)) {
        const text = n.text.trim().replace(/\s+/g, " ");
        if (/[A-Za-zäöü]/.test(text) && !allowed.has(text))
          issues.push(`${file}: ${text}`);
      }
      if (
        ts.isJsxAttribute(n) &&
        ["title", "aria-label", "alt", "placeholder"].includes(
          n.name.getText(root),
        ) &&
        n.initializer &&
        ts.isStringLiteral(n.initializer) &&
        /[A-Za-z]/.test(n.initializer.text) &&
        !n.initializer.text.startsWith("#")
      )
        issues.push(`${file}: ${n.initializer.text}`);
      ts.forEachChild(n, visit);
    }
    visit(root);
  }
  expect(issues).toEqual([]);
});
it("switches built-in diagnostics and timing live, preserves variables and user content, falls back to English", async () => {
  const user = "Ada <script> {{v0}}",
    before = createPresets(() => crypto.randomUUID());
  await setLanguage("en");
  expect(tr("common.navCharacters")).toBe("Characters");
  expect(displayMessage("Bildprüfung fehlgeschlagen.")).toBe(
    "Image check failed.",
  );
  expect(displayMessage("Exportiert: Ada <script> {{v0}}")).toBe(
    "Exported: Ada <script> {{v0}}",
  );
  expect(displayMessage(user)).toBe(user);
  expect(
    executionLabel({
      startedAt: "2026-11-18T00:00:00.000Z",
      endedAt: "2026-11-18T00:00:02.000Z",
      durationMs: 2000,
      status: "completed",
    }),
  ).toBe("Generated in 00:00:02");
  const prompts = createPresets(() => crypto.randomUUID()).variants.map(
    (v) => v.prompt,
  );
  expect(prompts).toEqual(before.variants.map((v) => v.prompt));
  i18n.addResource(
    "en",
    "translation",
    "temporaryFallback",
    "English fallback",
  );
  await setLanguage("de");
  expect(tr("temporaryFallback")).toBe("English fallback");
  delete (
    i18n.getResourceBundle("en", "translation") as Record<string, unknown>
  ).temporaryFallback;
  expect(() => setLanguage("unknown")).toThrow();
});
it("uses the OS language on first start and persists only a validated language across restart", async () => {
  const d = await directory(),
    prefs = new AppPreferences(d, ["fr-FR", "de-AT"]);
  expect(await prefs.load()).toEqual({ language: "de" });
  expect(resolveLanguage(["en_US"])).toBe("en");
  expect(resolveLanguage(["ja-JP"])).toBe("en");
  await prefs.set("en");
  expect(await new AppPreferences(d, ["de-DE"]).load()).toEqual({
    language: "en",
  });
  expect(
    JSON.parse(await fs.readFile(path.join(d, "preferences.json"), "utf8")),
  ).toEqual({ language: "en" });
  await expect(
    prefs.set({ language: "de", directory: "/private" }),
  ).rejects.toThrow();
  expect(prefs.get()).toEqual({ language: "en" });
  expect(await fs.readdir(d)).toEqual(["preferences.json"]);
});
it("rejects symlink writes, ignores malformed/oversize preferences, and retains last valid choice on failure", async () => {
  const d = await directory(),
    prefs = new AppPreferences(d, ["en-GB"]),
    target = path.join(d, "preferences.json"),
    outside = path.join(d, "untouched.json");
  await fs.writeFile(
    target,
    JSON.stringify({ language: "de", extra: "unsafe" }),
  );
  expect(await prefs.load()).toEqual({ language: "en" });
  await fs.writeFile(target, " ".repeat(1025));
  expect(await prefs.load()).toEqual({ language: "en" });
  await fs.writeFile(target, "broken");
  expect(await prefs.load()).toEqual({ language: "en" });
  await fs.writeFile(outside, '{"language":"de"}');
  await fs.unlink(target);
  await fs.symlink(outside, target);
  expect(await prefs.load()).toEqual({ language: "en" });
  await expect(prefs.set("de")).rejects.toThrow();
  expect(await fs.readFile(outside, "utf8")).toBe('{"language":"de"}');
  expect(prefs.get()).toEqual({ language: "en" });
  expect((await fs.readdir(d)).some((f) => f.endsWith(".tmp"))).toBe(false);
});
