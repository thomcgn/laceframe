import { createInstance } from "i18next";
const files = import.meta.glob("./*/*.json", {
  eager: true,
  import: "default",
});
export const resources: Record<
  string,
  { translation: Record<string, Record<string, string>> }
> = {};
for (const [file, value] of Object.entries(files)) {
  const [, language, namespace] = file.match(/^\.\/([^/]+)\/([^/]+)\.json$/)!;
  (resources[language] ??= { translation: {} }).translation[namespace] =
    value as Record<string, string>;
}
export const languages = Object.keys(resources).sort();
export function resolveLanguage(locales: readonly string[]) {
  for (const locale of locales) {
    const normalized = locale.toLowerCase().replaceAll("_", "-");
    const exact = languages.find((l) => l.toLowerCase() === normalized),
      base = normalized.split("-")[0];
    if (exact) return exact;
    if (languages.includes(base)) return base;
  }
  return "en";
}
export const i18n = createInstance();
void i18n.init({
  resources,
  lng: "de",
  fallbackLng: "en",
  initAsync: false,
  interpolation: { escapeValue: false, skipOnVariables: true },
  returnNull: false,
});
export function tr(key: string, values: Record<string, unknown> = {}) {
  return i18n.t(key, values) as string;
}
export function setLanguage(language: string) {
  if (!languages.includes(language)) throw new Error("Unsupported language");
  return i18n.changeLanguage(language);
}

/** Translate only built-in diagnostics, never project names/prompts or arbitrary DOM text. */
const direct = new Map<string, string>();
const patterns: {
  key: string;
  expression: RegExp;
  names: string[];
  score: number;
}[] = [];
for (const resource of Object.values(resources))
  for (const [namespace, messages] of Object.entries(resource.translation))
    for (const [key, text] of Object.entries(messages)) {
      direct.set(text, `${namespace}.${key}`);
      const names = [...text.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]);
      if (!names.length) continue;
      const chunks = text.split(/\{\{\w+\}\}/g),
        score = chunks.join("").length;
      if (score < 8) continue;
      patterns.push({
        key: `${namespace}.${key}`,
        names,
        score,
        expression: new RegExp(
          "^" +
            chunks
              .map((c) => c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
              .join("([\\s\\S]*?)") +
            "$",
        ),
      });
    }
patterns.sort((a, b) => b.score - a.score);
export function displayMessage(text: string) {
  const key = direct.get(text);
  if (key) return tr(key);
  for (const p of patterns) {
    const match = p.expression.exec(text);
    if (match)
      return tr(
        p.key,
        Object.fromEntries(p.names.map((n, i) => [n, match[i + 1]])),
      );
  }
  return text;
}

const labelKeys: Record<string, string> = {
  Auswählen: "common.m0bf1eddb22",
  Erzeugen: "common.mcd7fd99c02",
  Bearbeiten: "common.m84e45ee734",
  Freigeben: "studio.m4bdc165968",
  neu: "common.mb1688cbab7",
  identisch: "common.me47f4d15d0",
  geändert: "common.m1abf4a5e17",
  Konflikt: "common.ma55bfc47cd",
  System: "common.m6725e7bbcd",
  Style: "common.m7e744141b4",
  "Character Identity": "common.m2770dce311",
  "Expression Performance": "common.m1279850d20",
  Composition: "common.m47fca483c8",
  "Creative Supplements": "common.m1c9b1f80be",
};
export function uiLabel(identifier: string) {
  return (labelKeys[identifier] ?? fixedLabels[identifier])
    ? tr(labelKeys[identifier] ?? fixedLabels[identifier])
    : displayMessage(identifier);
}

const fixedLabels: Record<string, string> = {
  "pixel-snap": "editing.mee2eeb1aef",
  "color-correction": "common.labelcolor",
  relighting: "common.labelrelight",
  candidate: "common.labelcandidate",
  approved: "common.labelapproved",
  rejected: "common.labelrejected",
  running: "common.labelrunning",
  completed: "common.labelcompleted",
  failed: "common.labelfailed",
  cancelled: "common.labelcancelled",
  silent: "common.labelsilent",
  speaking: "common.labelspeaking",
  shouting: "common.labelshouting",
  cutout: "common.labelcutout",
  relight: "common.labelrelight",
  resize: "common.labelresize",
  color: "common.labelcolor",
  "pixel-edit": "common.labelpixeledit",
  x: "common.labelx",
  y: "common.labely",
  width: "common.labelwidth",
  height: "common.labelheight",
};
