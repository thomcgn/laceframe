import type { SavedSelection } from "./editing";
import type { CharacterLayerSet, LayerDraft } from "./semantic-layers";
import type {
  StyleDraftImage,
  StyleDraftReference,
  SemanticStatus,
  SemanticRecord,
} from "./style-semantics";
import type { RegionSelection } from "./color-region";
import type { ColorDraft, MasterPalette } from "./color-consistency";
import type { IdentityImport } from "./identity-import";
import type { PackKind, PackPreview, PackSelection } from "./packs";
import type { CutoutDraft, CutoutImage } from "./smart-cutout";
import type {
  RelightPixels,
  RelightRecord,
  RelightEligibility,
} from "./relighting";
import type { QualityReport, ExportAssetRequest } from "./asset-quality";
import type { CharacterCreationDraft } from "./character-creation";
import type {
  ProviderDescriptor,
  CodexStatus,
  GenerationDraft,
} from "./generation";
import type {
  Command,
  Snapshot,
  StagedImage,
  StagedIdentityImage,
} from "./domain";
export type Result<T> = { ok: true; value: T } | { ok: false; error: string };
export interface LaceframeBridge {
  selectionReferences(sourceId:string):Promise<Result<{id:string;name:string;weights:Uint8Array}[]>>;
  editingContext(active:boolean):Promise<Result<null>>;
  editorSelections(sourceId:string):Promise<Result<SavedSelection[]>>;
  editorSelection(id: string): Promise<Result<{record: SavedSelection; weights: Uint8Array}>>;
  deleteEditorSelection(id: string): Promise<Result<Snapshot>>;
  semanticLayers(
    id: string,
  ): Promise<Result<{ set: CharacterLayerSet; layers: LayerDraft[] }>>;
  importStyleImages(input: {
    files?: { name: string; bytes: Uint8Array }[];
    replaceToken?: string;
  }): Promise<Result<StyleDraftImage[] | null>>;
  discardStyleImage(token: string): Promise<Result<null>>;
  styleDraftSource(
    token: string,
  ): Promise<Result<RelightPixels & { sha256: string }>>;
  checkStyleAnalysis(): Promise<Result<SemanticStatus>>;
  startStyleAnalysis(
    references: StyleDraftReference[],
  ): Promise<Result<SemanticStatus>>;
  styleAnalysisStatus(): Promise<Result<SemanticStatus>>;
  cancelStyleAnalysis(): Promise<Result<SemanticStatus>>;
  importStyleSemantic(input: {
    json: string;
    references: StyleDraftReference[];
  }): Promise<Result<{ receipt: string; record: SemanticRecord }>>;
  preferences(): Promise<Result<{ language: string }>>;
  setLanguage(language: string): Promise<Result<{ language: string }>>;
  closeProject(): Promise<Result<null>>;
  pixelEditSource(
    id: string,
  ): Promise<
    Result<RelightPixels & { sha256: string; protectedWeights: Uint8Array }>
  >;
  colorPalette(id: string): Promise<
    Result<{
      palette: MasterPalette;
      regions: (Omit<MasterPalette["regions"][number], "selection"> & {
        weights: Uint8Array;
        selection?: RegionSelection;
      })[];
    }>
  >;
  colorRecipe(id: string): Promise<Result<ColorDraft>>;
  choosePack(kind: PackKind): Promise<Result<PackPreview | null>>;
  exportPack(
    selection: PackSelection,
  ): Promise<Result<{ name: string } | null>>;
  cutoutSource(id: string): Promise<Result<CutoutImage>>;
  smartCutoutRecipe(id: string): Promise<Result<CutoutDraft>>;
  analysisSource(
    id: string,
  ): Promise<Result<RelightPixels & { sha256: string }>>;
  relightEligibility(id: string): Promise<Result<RelightEligibility>>;
  relightSource(
    id: string,
  ): Promise<Result<RelightPixels & { sha256: string }>>;
  relightRecipe(
    id: string,
  ): Promise<Result<{ recipe: RelightRecord; weights: Uint8Array[] }>>;
  cutoutMask(id: string): Promise<Result<Uint8Array>>;
  qualityReport(id: string): Promise<Result<QualityReport>>;
  exportAsset(
    request: ExportAssetRequest,
  ): Promise<Result<{ name: string } | null>>;
  checkCodex(): Promise<Result<CodexStatus>>;
  startGeneration(
    draft: GenerationDraft | CharacterCreationDraft,
  ): Promise<Result<CodexStatus>>;
  generationStatus(): Promise<
    Result<{ status: CodexStatus; snapshot: Snapshot }>
  >;
  cancelGeneration(): Promise<Result<CodexStatus>>;
  revealMaster(id: string): Promise<Result<null>>;
  providers(): Promise<Result<ProviderDescriptor[]>>;
  copyPrompt(attemptId: string): Promise<Result<null>>;
  openChatGPT(url: string): Promise<Result<null>>;
  createProject(name: string): Promise<Result<Snapshot | null>>;
  openProject(): Promise<Result<Snapshot | null>>;
  command(command: Command): Promise<Result<Snapshot>>;
  importIdentityImages(input: IdentityImport): Promise<Result<Snapshot | null>>;
  chooseImage(): Promise<Result<StagedImage | null>>;
  chooseImage(purpose: "identity"): Promise<Result<StagedIdentityImage | null>>;
  stageImage(bytes: Uint8Array, name: string): Promise<Result<StagedImage>>;
  stageImage(
    bytes: Uint8Array,
    name: string,
    purpose: "identity",
  ): Promise<Result<StagedIdentityImage>>;
  discardImage(token: string): Promise<Result<null>>;
  preview(id: string): Promise<Result<string>>;
}
declare global {
  interface Window {
    laceframe: LaceframeBridge;
  }
}
