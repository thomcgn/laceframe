import { z } from "zod";
import { emptyStyle, styleContentSchema, type StyleContent } from "./packs";
import { metricsSchema, type AnalysisResult } from "./style-analysis";
import {
  creatorProvenanceSchema,
  draftReferencesSchema,
  type SemanticRecord,
  validateSemanticResult,
} from "./style-semantics";
import { tr } from "./locales";
export const stylePresetInputSchema = z
  .object({
    references: draftReferencesSchema,
    semanticReceipt: z.uuid().optional(),
    style: styleContentSchema,
    scopeReviewed: z.literal(true),
  })
  .strict();
export type StylePresetInput = z.infer<typeof stylePresetInputSchema>;
/** Suggestions from existing measurements, never semantic classification from RGB statistics. */
export function proposeStyle(
  results: AnalysisResult[],
  semantic?: SemanticRecord,
): StyleContent {
  if (
    !results.length ||
    results.some((r) => !metricsSchema.safeParse(r.metrics).success) ||
    !results.some((r) => r.metrics.visible)
  )
    throw new Error(tr("styleCreator.noVisiblePixels"));
  if (semantic)
    validateSemanticResult(
      semantic.result,
      results.map((r) => r.sha256),
    );
  const visible = results.filter((r) => r.metrics.visible);
  const avg = (
    key:
      | "saturation"
      | "meanLuminance"
      | "contrast"
      | "edgeDensity"
      | "ditherLike",
  ) => visible.reduce((sum, r) => sum + r.metrics[key], 0) / visible.length;
  const muted = avg("saturation") < 0.35,
    dark = avg("meanLuminance") < 0.35,
    highContrast = avg("contrast") > 0.65;
  const name =
    semantic?.result.suggestedName ??
    tr(
      muted
        ? "styleCreator.nameMuted"
        : highContrast
          ? "styleCreator.nameContrast"
          : "styleCreator.nameBalanced",
    );
  const style = emptyStyle(name);
  style.intent =
    semantic?.result.description ?? tr("styleCreator.technicalDescription");
  style.contours = tr(
    avg("edgeDensity") < 0.35
      ? "styleCreator.groupedContours"
      : "styleCreator.detailedContours",
  );
  style.pixelClusters = tr("styleCreator.clusterProposal");
  style.apparentDensity = tr("styleCreator.noOriginalResolution");
  style.shading = tr("styleCreator.shadingProposal");
  style.materials = tr("styleCreator.materialProposal");
  style.colorTreatment = tr(
    muted ? "styleCreator.mutedColors" : "styleCreator.balancedColors",
  );
  style.lighting = tr(
    dark ? "styleCreator.darkTones" : "styleCreator.openTones",
  );
  style.composition = tr("styleCreator.compositionProposal");
  if (semantic) {
    for (const area of [
      "contours",
      "pixelClusters",
      "shading",
      "materials",
      "colorTreatment",
      "lighting",
      "composition",
    ] as const) {
      const texts = semantic.result.observations
        .filter((o) => o.area === area)
        .map((o) => o.text);
      if (texts.length) style[area] = texts.join("\n");
    }
    style.additionalRules = semantic.result.observations
      .filter((o) => o.area === "abstraction" || o.area === "texture")
      .map((o) => ({
        label: tr(
          o.area === "texture"
            ? "styleCreator.texture"
            : "styleCreator.abstraction",
        ),
        text: o.text,
      }));
  }
  style.positiveRules = [tr("styleCreator.positiveRule")];
  style.negativeRules = [tr("styleCreator.negativeRule")];
  style.legacy = {
    renderRules: [style.contours, style.pixelClusters, style.shading].join(
      "\n",
    ),
    description: style.intent,
    lightingRules: style.lighting,
    colorRules: style.colorTreatment,
    framingRules: style.composition,
  };
  style.referenceHashes = results.map((r) => r.sha256);
  style.findings = results.map((r) => ({
    algorithm: "rgba8-style-v1",
    sha256: r.sha256,
    metrics: r.metrics,
  }));
  return styleContentSchema.parse(style);
}
export function styleWithReview(
  style: StyleContent,
  input: {
    results: AnalysisResult[];
    roles: z.infer<typeof creatorProvenanceSchema>["references"];
    palette: string[];
    semantic?: SemanticRecord;
  },
): StyleContent {
  return styleContentSchema.parse({
    ...style,
    legacy: {
      renderRules: [
        style.contours,
        style.pixelClusters,
        style.shading,
        ...style.positiveRules,
      ]
        .filter(Boolean)
        .join("\n"),
      description: style.intent,
      lightingRules: style.lighting,
      colorRules: style.colorTreatment,
      framingRules: style.composition,
    },
    referenceHashes: input.results.map((r) => r.sha256),
    findings: input.results.map((r) => ({
      algorithm: "rgba8-style-v1",
      sha256: r.sha256,
      metrics: r.metrics,
    })),
    creator: {
      version: "lf-style-creator-v1",
      createdAt: new Date().toISOString(),
      references: input.roles,
      workingPalette: input.palette,
      scopeReviewed: true,
      ...(input.semantic ? { semantic: input.semantic } : {}),
    },
  });
}
