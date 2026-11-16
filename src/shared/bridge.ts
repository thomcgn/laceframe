import type { ProviderDescriptor } from "./generation";
import type { Command, Snapshot, StagedImage } from "./domain";
export type Result<T> = { ok: true; value: T } | { ok: false; error: string };
export interface LaceframeBridge {
  revealMaster(id: string): Promise<Result<null>>;
  providers(): Promise<Result<ProviderDescriptor[]>>;
  copyPrompt(attemptId: string): Promise<Result<null>>;
  openChatGPT(url: string): Promise<Result<null>>;
  createProject(name: string): Promise<Result<Snapshot | null>>;
  openProject(): Promise<Result<Snapshot | null>>;
  command(command: Command): Promise<Result<Snapshot>>;
  chooseImage(): Promise<Result<StagedImage | null>>;
  stageImage(bytes: Uint8Array, name: string): Promise<Result<StagedImage>>;
  discardImage(token: string): Promise<Result<null>>;
  preview(id: string): Promise<Result<string>>;
}
declare global {
  interface Window {
    laceframe: LaceframeBridge;
  }
}
