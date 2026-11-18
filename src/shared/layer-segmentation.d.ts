import type { ColorPixels } from "./color-consistency";
import type { SemanticLayerRole } from "./semantic-layers";

/** Extension contract only. No segmentation model/provider is installed or invoked by v1. */
export interface LayerSegmentationProvider {
  readonly id: string;
  getCapabilities(): Promise<{
    available: boolean;
    reason?: string;
    model: string;
    modelVersion: string;
    maxPixels: number;
    /** Report only verified environments; CPU fallback is required for this product. */
    verifiedPlatforms: ("linux" | "win32" | "darwin")[];
    cpuSupported: boolean;
    optionalGpu: boolean;
    roles: SemanticLayerRole[];
  }>;
  analyze(input: {
    pixels: ColorPixels;
    sourceId: string;
    sourceSha256: string;
    roles: SemanticLayerRole[];
    signal?: AbortSignal;
  }): Promise<LayerSegmentationProposal>;
}

/** Untrusted draft. Validate dimensions, source hash, visibility/overlap and review manually. */
export interface LayerSegmentationProposal {
  providerId: string;
  model: string;
  modelVersion: string;
  sourceId: string;
  sourceSha256: string;
  width: number;
  height: number;
  regions: {
    name: string;
    role: SemanticLayerRole;
    weights: Uint8Array;
    evidence?: string;
  }[];
}
