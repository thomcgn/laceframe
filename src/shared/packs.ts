import { tr } from "./locales/index";
import { z } from "zod";
import { metricsSchema, ANALYSIS_VERSION } from "./style-analysis";
import type { ArtDirection, Project } from "./domain";

export const MAX_PACK_BYTES = 512 * 1024;
const text = z.string().max(8000);
const short = z
  .string()
  .min(1)
  .max(120)
  .refine((t) => t === t.trim() && !/[\r\n]/.test(t), tr("common.m8810e0d214"));
const sha = z.string().regex(/^[a-f0-9]{64}$/);
const slug = z
  .string()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  .max(120);
export const legacyStyleSchema = z
  .object({
    renderRules: text.refine(
      (t) => t.trim().length > 0,
      "Leere Rendering-Regeln",
    ),
    description: z.string().max(4000).optional(),
    lightingRules: z.string().max(4000).optional(),
    colorRules: z.string().max(4000).optional(),
    framingRules: z.string().max(4000).optional(),
  })
  .strict();
export const styleContentSchema = z
  .object({
    name: short,
    category: z.enum(["portrait", "sprite", "scene"]),
    intent: text,
    positiveRules: z.array(text).max(100),
    negativeRules: z.array(text).max(100),
    contours: text,
    pixelClusters: text,
    apparentDensity: text,
    shading: text,
    materials: text,
    colorTreatment: text,
    lighting: text,
    composition: text,
    additionalRules: z
      .array(z.object({ label: short, text }).strict())
      .max(100),
    legacy: legacyStyleSchema,
    referenceHashes: z.array(sha).max(128),
    findings: z
      .array(
        z
          .object({
            algorithm: z.literal(ANALYSIS_VERSION),
            sha256: sha,
            metrics: metricsSchema,
          })
          .strict(),
      )
      .max(100),
  })
  .strict();
export const packProvenanceSchema = z
  .object({ application: z.literal("laceframe"), note: z.string().max(2000) })
  .strict();
export const portableOriginSchema = z
  .object({
    id: z.uuid(),
    revision: z.number().int().positive(),
    provenance: packProvenanceSchema,
  })
  .strict();
const envelope = {
  schemaVersion: z.literal(1),
  id: z.uuid(),
  revision: z.number().int().positive(),
  provenance: z
    .object({ application: z.literal("laceframe"), note: z.string().max(2000) })
    .strict(),
};
export const stylePackSchema = z
  .object({
    ...envelope,
    format: z.literal("laceframe.style"),
    style: styleContentSchema,
  })
  .strict();
const variant = z
  .object({
    id: z.uuid(),
    slug,
    label: short,
    prompt: text,
    intensity: z.number().min(0).max(1).optional(),
    suggestedAction: z.enum(["silent", "speaking", "shouting"]),
  })
  .strict();
export const expressionFamilyPackSchema = z
  .object({
    id: z.uuid(),
    slug,
    label: short,
    variants: z.array(variant).min(1).max(100),
  })
  .strict()
  .refine(
    (f) =>
      new Set(f.variants.map((v) => v.slug)).size === f.variants.length &&
      new Set(f.variants.map((v) => v.id)).size === f.variants.length,
    "Doppelte Variantenkennung",
  );
export const expressionPackSchema = z
  .object({
    ...envelope,
    format: z.literal("laceframe.expressions"),
    families: z.array(expressionFamilyPackSchema).min(1).max(100),
  })
  .strict()
  .refine(
    (p) =>
      new Set(p.families.map((f) => f.slug)).size === p.families.length &&
      new Set(p.families.map((f) => f.id)).size === p.families.length &&
      new Set(p.families.flatMap((f) => f.variants.map((v) => v.id))).size ===
        p.families.flatMap((f) => f.variants).length,
    "Doppelte Familien-/Variantenkennung",
  );
export const packSchema = z.union([stylePackSchema, expressionPackSchema]);
export type Pack = z.infer<typeof packSchema>;
export type StyleContent = z.infer<typeof styleContentSchema>;
export type PackKind = "style" | "expressions";
export const packSelectionSchema = z
  .object({
    kind: z.enum(["style", "expressions"]),
    styleScopeReviewed: z.literal(true).optional(),
    profileId: z.uuid().optional(),
    familyIds: z.array(z.uuid()).min(1).max(100).optional(),
  })
  .strict();
export type PackSelection = z.infer<typeof packSelectionSchema>;
export const importChoicesSchema = z
  .array(
    z
      .object({ key: z.uuid(), action: z.enum(["new", "update", "skip"]) })
      .strict(),
  )
  .min(1)
  .max(100);
export type PackRow = {
  key: string;
  label: string;
  status: "neu" | "identisch" | "geändert" | "Konflikt";
  targetId?: string;
  reason: string;
};
export type PackPreview = { pack: Pack; rows: PackRow[]; projectHash: string };
const unsafePath =
  /(?:file:|data:|https?:\/\/|(?:^|[\s"'])\/[^\s/]|[A-Za-z]:[\\/]|\\\\|(?:^|[\s"'])\.\.[\\/])/i;
/** Bounds before JSON.parse/Zod, including ignored/unknown input. No executable or path fields. */
export function parsePackJSON(json: string): Pack {
  if (new TextEncoder().encode(json).length > MAX_PACK_BYTES)
    throw new Error(tr("styles.mf1d98c6e8d"));
  let depth = 0,
    quoted = false,
    escaped = false;
  for (const c of json) {
    if (quoted) {
      if (escaped) escaped = false;
      else if (c === "\\") escaped = true;
      else if (c === '"') quoted = false;
    } else if (c === '"') quoted = true;
    else if (c === "[" || c === "{") {
      if (++depth > 20) throw new Error(tr("styles.m10ccb921ec"));
    } else if (c === "]" || c === "}") depth--;
  }
  const raw: unknown = JSON.parse(json);
  let nodes = 0;
  function visit(v: unknown) {
    if (++nodes > 30000) throw new Error(tr("styles.m991879caa7"));
    if (typeof v === "string" && (unsafePath.test(v) || v.includes("\0")))
      throw new Error(tr("styles.m0359b7e148"));
    if (v && typeof v === "object")
      for (const [k, x] of Object.entries(v)) {
        if (["__proto__", "prototype", "constructor"].includes(k))
          throw new Error(tr("styles.m5a33b43a26"));
        visit(x);
      }
  }
  visit(raw);
  return packSchema.parse(raw);
}
export function serializePack(pack: Pack) {
  return JSON.stringify(parsePackJSON(JSON.stringify(pack)), null, 2) + "\n";
}
export function emptyStyle(name: string): StyleContent {
  return {
    name,
    category: "portrait",
    intent: "",
    positiveRules: [],
    negativeRules: [],
    contours: "",
    pixelClusters: "",
    apparentDensity: "",
    shading: "",
    materials: "",
    colorTreatment: "",
    lighting: "",
    composition: "",
    additionalRules: [],
    legacy: { renderRules: tr("styles.m9329a688b9") },
    referenceHashes: [],
    findings: [],
  };
}
export function structuredStyleText(s?: StyleContent): string {
  if (!s) return "";
  return [
    `ASSET CATEGORY: ${s.category}`,
    ...(
      [
        ["Intent", s.intent],
        ["Contours", s.contours],
        ["Pixel clusters", s.pixelClusters],
        [
          "Apparent pixel density (author guidance, not a measurement)",
          s.apparentDensity,
        ],
        ["Shading", s.shading],
        ["Material rendering", s.materials],
        ["Color treatment", s.colorTreatment],
        [tr("common.m07607d609f"), s.lighting],
        [tr("common.m47fca483c8"), s.composition],
      ] as const
    )
      .filter(([, v]) => v)
      .map(([k, v]) => `${k}: ${v}`),
    ...s.positiveRules.map((t) => `Positive rendering rule: ${t}`),
    ...s.negativeRules.map((t) => `Avoid rendering: ${t}`),
    ...s.additionalRules.map(
      (r) => `Additional style rule (${r.label}): ${r.text}`,
    ),
  ].join("\n");
}
export function exportStyle(
  p: Project,
  profile: ArtDirection,
): z.infer<typeof stylePackSchema> {
  const {
    name,
    renderRules,
    description,
    lightingRules,
    colorRules,
    framingRules,
  } = profile;
  const style = structuredClone(profile.portableStyle ?? emptyStyle(name));
  style.name = profile.portableName ?? name;
  style.legacy = {
    renderRules,
    ...(description !== undefined ? { description } : {}),
    ...(lightingRules !== undefined ? { lightingRules } : {}),
    ...(colorRules !== undefined ? { colorRules } : {}),
    ...(framingRules !== undefined ? { framingRules } : {}),
  };
  style.referenceHashes = [
    ...new Set([
      ...style.referenceHashes,
      ...(profile.styleReferenceIds ?? []).map(
        (id) => p.styleAssets.find((a) => a.id === id)!.sha256,
      ),
    ]),
  ];
  const measured = p.styleAnalyses
    .filter(
      (a) =>
        a.profileId === profile.id && a.profileRevision === profile.revision,
    )
    .flatMap((a) =>
      a.references.map((r) => ({
        algorithm: a.version,
        sha256: r.sha256,
        metrics: r.metrics,
      })),
    );
  for (const finding of measured)
    if (
      !style.findings.some((f) => JSON.stringify(f) === JSON.stringify(finding))
    )
      style.findings.push(finding);
  return {
    format: "laceframe.style",
    schemaVersion: 1,
    id: profile.portableId ?? profile.id,
    revision: profile.portableRevision ?? profile.revision,
    style,
    provenance: profile.portableProvenance ?? {
      application: "laceframe",
      note: tr("styles.m12e62f6a33"),
    },
  };
}
export function exportExpressions(
  p: Project,
  familyIds: string[],
): z.infer<typeof expressionPackSchema> {
  const origins = familyIds.map(
    (id) => p.families.find((f) => f.id === id)?.portableOrigin,
  );
  const origin =
    origins.length && origins.every((o) => o && o.id === origins[0]?.id)
      ? origins[0]
      : undefined;
  return {
    format: "laceframe.expressions",
    schemaVersion: 1,
    id: origin?.id ?? p.id,
    revision: origin ? Math.max(...origins.map((o) => o!.revision)) : 1,
    provenance: origin?.provenance ?? {
      application: "laceframe",
      note: tr("styles.mc30ca442e0"),
    },
    families: familyIds.map((id) => {
      const f = p.families.find((f) => f.id === id);
      if (!f) throw new Error(tr("styles.me5d9a7f08c"));
      return {
        id: f.portableId ?? f.id,
        slug: f.portableSlug ?? f.slug,
        label: f.label,
        variants: p.variants
          .filter((v) => v.familyId === id)
          .map((v) => ({
            id: v.portableId ?? v.id,
            slug: v.slug,
            label: v.label,
            prompt: v.prompt,
            ...(v.intensity !== undefined ? { intensity: v.intensity } : {}),
            suggestedAction: v.suggestedAction,
          })),
      };
    }),
  };
}
export function localImportName(base: string, used: string[]): string {
  if (!used.some((n) => n.toLowerCase() === base.toLowerCase())) return base;
  for (let i = 2; i <= 10000; i++) {
    const suffix = `-import-${i}`,
      candidate = base.slice(0, 120 - suffix.length) + suffix;
    if (!used.some((n) => n.toLowerCase() === candidate.toLowerCase()))
      return candidate;
  }
  throw new Error(tr("styles.mca3a03629b"));
}
export function planPack(p: Project, pack: Pack): PackRow[] {
  if (pack.format === "laceframe.style") {
    const targets = p.artDirections.filter(
      (s) => (s.portableId ?? s.id) === pack.id,
    );
    const target = targets.length === 1 ? targets[0] : undefined;
    const same =
      target &&
      JSON.stringify(exportStyle(p, target).style) ===
        JSON.stringify(pack.style);
    return [
      {
        key: pack.id,
        label: pack.style.name,
        status:
          targets.length > 1
            ? "Konflikt"
            : same
              ? "identisch"
              : target
                ? "geändert"
                : p.artDirections.some(
                      (s) =>
                        s.name.toLowerCase() === pack.style.name.toLowerCase(),
                    )
                  ? "Konflikt"
                  : "neu",
        targetId: target?.id,
        reason: target
          ? tr("common.m7d8dedd147")
          : `Keine eindeutige Pack-ID; gleiche Namen werden nicht automatisch zugeordnet. Als neu: ${localImportName(
              pack.style.name,
              p.artDirections.map((s) => s.name),
            )}.`,
      },
    ];
  }
  return pack.families.map((f) => {
    const targets = p.families.filter((a) => (a.portableId ?? a.id) === f.id),
      target = targets.length === 1 ? targets[0] : undefined;
    const local = target
      ? exportExpressions(p, [target.id]).families[0]
      : undefined;
    const variantConflict =
      local &&
      f.variants.some((v) =>
        local.variants.some((a) => a.slug === v.slug && a.id !== v.id),
      );
    return {
      key: f.id,
      label: f.label,
      status:
        targets.length > 1 || variantConflict
          ? "Konflikt"
          : local && JSON.stringify(local) === JSON.stringify(f)
            ? "identisch"
            : target
              ? "geändert"
              : p.families.some((a) => a.slug === f.slug)
                ? "Konflikt"
                : "neu",
      targetId: target?.id,
      reason: target
        ? tr("common.macd9abc73c")
        : `Keine eindeutige Familien-ID. Namens-/Sluggleichheit ist keine Identität. Als neu: ${localImportName(
            f.slug,
            p.families.map((a) => a.slug),
          )}.`,
    };
  });
}
export const migrationCategories = [
  "style",
  "identity",
  "outfit",
  "expression",
  "composition",
  "unclear",
] as const;
export type MigrationCategory = (typeof migrationCategories)[number];
export function lintStyle(text: string): {
  category: MigrationCategory;
  reason: string;
} {
  if (
    /(?:wear|plaid|jacket|shirt|pendant|outfit|kleidung|jacke|hemd)/i.test(
      text,
    ) &&
    !/(?:do not|never|no|nicht|keine) (?:copy|transfer|infer|übernehmen)/i.test(
      text,
    )
  )
    return {
      category: "outfit",
      reason: tr("styles.m037a3a9f97"),
    };
  if (
    /selfie|freckle|hair|face shape|same person|identit|haare|sommerspross/i.test(
      text,
    )
  )
    return { category: "identity", reason: tr("styles.m582b54b7d3") };
  if (/neutral expression|emotion|smil|shout|mouth|mimik|lächel/i.test(text))
    return {
      category: "expression",
      reason: tr("styles.m59302aa2ef"),
    };
  if (/framing|composition|centered|camera|komposition|ausschnitt/i.test(text))
    return {
      category: "composition",
      reason: tr("styles.m58d932028c"),
    };
  if (
    /render|pixel|cluster|shad|light|color|palette|contour|illustrat|outline|material|licht|farbe/i.test(
      text,
    )
  )
    return {
      category: "style",
      reason: tr("styles.m5c0bd6e682"),
    };
  return {
    category: "unclear",
    reason: tr("styles.m2a6cb9a6d5"),
  };
}
export function migrationLines(profile: ArtDirection) {
  return (
    [
      "renderRules",
      "description",
      "lightingRules",
      "colorRules",
      "framingRules",
    ] as const
  ).flatMap((field) =>
    (profile[field] ?? "")
      .split(/\r?\n/)
      .filter((t) => t.trim())
      .map((raw) => ({ field, raw, ...lintStyle(raw) })),
  );
}
export const migrationChoiceSchema = z
  .array(
    z
      .object({
        index: z.number().int().nonnegative(),
        category: z.enum(migrationCategories),
        text,
      })
      .strict(),
  )
  .min(1)
  .max(500);
export const migrationRecordSchema = z
  .object({
    id: z.uuid(),
    profileId: z.uuid(),
    sourceRevision: z.number().int().positive(),
    createdAt: z.iso.datetime(),
    sources: z
      .array(
        z
          .object({
            field: z.enum([
              "renderRules",
              "description",
              "lightingRules",
              "colorRules",
              "framingRules",
            ]),
            text,
            sha256: sha,
          })
          .strict(),
      )
      .max(5),
    choices: migrationChoiceSchema,
  })
  .strict();
