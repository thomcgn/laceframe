import { tr } from "../../shared/locales/index";
import { z } from "zod";
import { characterCreationDraftSchema } from "../../shared/character-creation";
import {
  generationDraftSchema,
  type CodexStatus,
  type GenerationPhase,
  type GenerationExecution,
} from "../../shared/generation";
import { ProjectService } from "../project-service";
import { CodexImageGenerationProvider } from "./providers/codexImageGeneration";
import { GenerationClock } from "./generation-clock";
const phases: Record<GenerationPhase, string> = {
  get preparing() {
    return tr("errors.m505e1b126f");
  },
  get "checking-account"() {
    return tr("errors.m0d759f8f36");
  },
  get "checking-capability"() {
    return tr("errors.mc551f1ce1b");
  },
  get "starting-model"() {
    return tr("errors.m76fd1b1cab");
  },
  get processing() {
    return tr("errors.m84829f68ea");
  },
  get "generating-image"() {
    return tr("errors.m4f1f6c09e6");
  },
  get "validating-image"() {
    return tr("errors.ma137226094");
  },
  get importing() {
    return tr("errors.mddc1b7b01f");
  },
  get stopping() {
    return tr("errors.mae172dd073");
  },
};
/** A single job owns the project until result/terminal metadata are durably stored. */
export class GenerationController {
  private state: CodexStatus = {
    state: "unavailable",
    get message() {
      return tr("errors.m9f051e5efe");
    },
  };
  private cancelled = false;
  private importing = false;
  private task?: Promise<void>;
  private clock?: GenerationClock;
  constructor(
    private service: ProjectService,
    readonly provider: CodexImageGenerationProvider,
    private createClock: () => GenerationClock = () => new GenerationClock(),
  ) {
    provider.onProgress = (phase) => {
      if (this.running && !this.cancelled) this.phase(phase);
    };
  }
  get running() {
    return this.state.state === "running";
  }
  resetProject() {
    if (this.running) throw new Error(tr("errors.m1bf90fc9fe"));
    this.clock = undefined;
    this.state = {
      state: "unavailable",
      message: tr("errors.m9f051e5efe"),
    };
  }
  status(): CodexStatus {
    return {
      ...this.state,
      available: this.provider.getCapabilities().canGenerate,
      multipleReferences:
        this.provider.getCapabilities().supportsMultipleReferences,
      execution: this.clock?.snapshot(),
    };
  }
  private phase(phase: GenerationPhase) {
    this.state = { ...this.state, phase, message: phases[phase] };
  }
  async check() {
    if (this.running) return this.status();
    const previous = this.state.attemptId;
    this.state = { ...(await this.provider.check()), attemptId: previous };
    return this.status();
  }
  async start(input: unknown) {
    if (this.running) throw new Error(tr("errors.m1bf90fc9fe"));
    const draft = z
      .union([characterCreationDraftSchema, generationDraftSchema])
      .parse(input);
    const creation = "operation" in draft;
    if (!creation && draft.providerId !== "codex-native")
      throw new Error(tr("errors.m05a25a2c24"));
    this.cancelled = false;
    this.importing = false;
    this.clock = this.createClock();
    this.state = {
      state: "running",
      phase: "preparing",
      message: phases.preparing,
    };
    try {
      const saved = await this.service.command(
        creation
          ? { type: "prepareCharacterMaster", draft }
          : { type: "prepareAttempt", draft },
      );
      const attempt = creation
        ? saved.project.masterAttempts.at(-1)!
        : saved.project.attempts.at(-1)!;
      this.state.attemptId = attempt.id;
      await this.service.recordGeneration(attempt.id, this.clock.snapshot());
      const request = creation
        ? await this.service.creatorRequest(draft)
        : this.provider.prepare(saved.project, {
            ...draft,
            prompt: attempt.promptRevision.prompt,
          });
      if (!creation && "referenceAssetPath" in request) {
        request.referenceAssetPath = await this.service.masterFile(
          draft.masterId,
        );
        request.styleReferenceFiles = await Promise.all(
          (draft.styleReferences ?? []).map(async (r) => ({
            ...r,
            path: await this.service.styleFile(r.id, r.sha256),
          })),
        );
      }
      this.task = (async () => {
        try {
          const result =
            "operation" in request
              ? await this.provider.createCharacterMaster(request)
              : await this.provider.editImage(request);
          if (this.cancelled) throw new Error(tr("errors.md353a99eb4"));
          const bytes = await this.provider.resultBytes(result);
          if (this.cancelled) throw new Error(tr("errors.md353a99eb4"));
          this.importing = true;
          this.phase("importing");
          let completion: GenerationExecution | undefined;
          const complete = () => (completion = this.clock!.stamp("completed"));
          if (creation)
            await this.service.importMasterGeneration(
              attempt.id,
              bytes,
              complete,
            );
          else
            await this.service.importGeneratedResult(
              attempt.id,
              bytes,
              complete,
            );
          this.clock!.seal(completion!);
          this.state = {
            state: "completed",
            message: tr("errors.m33860efdf5"),
            attemptId: attempt.id,
          };
        } catch {
          const status = this.provider.status;
          const outcome = this.cancelled ? "cancelled" : "failed";
          const execution = this.clock!.finish(outcome);
          let message = this.cancelled
            ? "Generierung abgebrochen. Späte Ergebnisse werden nicht importiert."
            : status.state === "completed"
              ? "Generierung fehlgeschlagen: Ergebnis konnte nicht sicher gespeichert werden."
              : status.state === "running" || status.state === "ready"
                ? tr("common.m39b9a542ee")
                : status.message;
          try {
            await this.service.recordGeneration(attempt.id, execution);
          } catch {
            message +=
              " Abschlussmetadaten konnten nicht gespeichert werden; Projekt erneut öffnen.";
          }
          this.state = {
            state: this.cancelled
              ? "cancelled"
              : ["not-installed", "not-authenticated", "unavailable"].includes(
                    status.state,
                  )
                ? status.state
                : "failed",
            message,
            attemptId: attempt.id,
          };
        }
      })();
      return this.status();
    } catch (error) {
      const execution = this.clock.finish("failed");
      if (this.state.attemptId)
        await this.service
          .recordGeneration(this.state.attemptId, execution)
          .catch(() => {});
      this.state = {
        ...this.state,
        state: "failed",
        message: tr("errors.m4d3f54045f"),
      };
      throw error;
    }
  }
  async cancel() {
    if (!this.running) return this.status();
    if (this.importing) {
      await this.task;
      return this.status();
    }
    this.cancelled = true;
    this.phase("stopping");
    await this.provider.cancelGeneration(this.state.attemptId ?? "");
    await this.task;
    return this.status();
  }
  async close() {
    await this.cancel();
    await this.provider.dispose();
  }
}
