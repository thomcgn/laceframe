import type { Family, Variant } from "./domain";
// IDs are assigned once when a project is created; these are editable seed data.
const seeds = [
  ["skeptical", "Skeptisch", ["subtle", "suspicious", "incredulous"]],
  ["concerned", "Besorgt", ["quiet-concern", "worried", "distressed"]],
  ["angry", "Wütend", ["controlled", "irritated", "furious", "shouting"]],
  ["amused", "Amüsiert", ["half-smile", "smile", "chuckle"]],
] as const;
const prompts: Record<string, string> = {
  "angry.controlled":
    "Controlled, restrained anger. Lower and draw the eyebrows inward, sharpen the gaze, and gently press the lips together. No shouting, no exposed teeth, no exaggerated facial distortion.",
  "angry.shouting":
    "The SAME character shouting with controlled fury: deeply knitted brows and focused eyes, open mouth, tense jaw. Maintain all facial identity, hairstyle, clothes, palette and framing; do not redesign.",
  "skeptical.subtle":
    "Subtle skepticism. Raise one eyebrow slightly, narrow the eyes just a little, and introduce a very mild asymmetry to the closed lips. She looks unconvinced, not angry.",
  "concerned.quiet-concern":
    "Quiet concern. Draw the inner eyebrows slightly together and upward, soften the eyes, and add very subtle tension to the closed lips. No tears and no exaggerated sadness.",
  "amused.half-smile":
    "A restrained, genuine half-smile. Lift one mouth corner slightly, soften the eyelids, and add the faintest hint of warmth to the eyes. No broad grin or visible teeth.",
};
export function createPresets(uuid: () => string): {
  families: Family[];
  variants: Variant[];
} {
  const families: Family[] = [],
    variants: Variant[] = [];
  seeds.forEach(([slug, label, names], order) => {
    const familyId = uuid();
    families.push({ id: familyId, label, slug, order });
    names.forEach((name) =>
      variants.push({
        id: uuid(),
        familyId,
        label: name === "shouting" ? "Anbrüllen" : name,
        slug: name,
        prompt: prompts[`${slug}.${name}`] ?? "",
        suggestedAction: name === "shouting" ? "shouting" : "silent",
      }),
    );
  });
  return { families, variants };
}
