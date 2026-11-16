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
  preparing: "Versuch und Masterreferenz werden vorbereitet.",
  "checking-account": "Codex prüft die bestehende ChatGPT-Anmeldung.",
  "checking-capability": "Codex prüft die verfügbare Bildfunktion.",
  "starting-model": "Codex-Modell und Thread werden gestartet.",
  processing: "Codex bearbeitet den Auftrag.",
  "generating-image": "Das Codex-Bildwerkzeug arbeitet.",
  "validating-image": "Codex-Ergebnis wird sicher geprüft.",
  importing: "Bild wird als Kandidat im Projekt gespeichert.",
  stopping: "Abbruch angefordert · Codex wird beendet.",
};
/** A single job owns the project until result/terminal metadata are durably stored. */
export class GenerationController {
  private state: CodexStatus = {
    state: "unavailable",
    message: "Codex-Verfügbarkeit noch nicht geprüft.",
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
    if (this.running) throw new Error("Es läuft bereits ein Bildauftrag.");
    const draft = z
      .union([characterCreationDraftSchema, generationDraftSchema])
      .parse(input);
    const creation = "operation" in draft;
    if (!creation && draft.providerId !== "codex-native")
      throw new Error("Codex-Anbieter auswählen.");
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
        : this.provider.prepare(saved.project, draft);
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
          if (this.cancelled) throw new Error("Cancelled");
          const bytes = await this.provider.resultBytes(result);
          if (this.cancelled) throw new Error("Cancelled");
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
            message:
              "Generierung abgeschlossen · Kandidat importiert. Identität vor der Freigabe prüfen.",
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
                ? "Generierung fehlgeschlagen. Projekt und Verbindung prüfen."
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
        message:
          "Generierung konnte nicht gestartet werden. Master und Projektdaten prüfen.",
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
