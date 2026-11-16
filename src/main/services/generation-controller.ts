import {
  generationDraftSchema,
  type CodexStatus,
} from "../../shared/generation";
import { ProjectService } from "../project-service";
import { CodexImageGenerationProvider } from "./providers/codexImageGeneration";

/** One job owns the project until result ingestion or failure; every start is explicit IPC. */
export class GenerationController {
  private state: CodexStatus = {
    state: "unavailable",
    message: "Codex-Verfügbarkeit noch nicht geprüft.",
  };
  private cancelled = false;
  private importing = false;
  private task?: Promise<void>;
  constructor(
    private service: ProjectService,
    readonly provider: CodexImageGenerationProvider,
  ) {}
  get running() {
    return this.state.state === "running";
  }
  status() {
    return { ...this.state };
  }
  async check() {
    if (this.running) return this.status();
    this.state = await this.provider.check();
    return this.status();
  }
  async start(input: unknown) {
    if (this.running) throw new Error("Es läuft bereits ein Bildauftrag.");
    const draft = generationDraftSchema.parse(input);
    if (draft.providerId !== "codex-native")
      throw new Error("Codex-Anbieter auswählen.");
    this.cancelled = false;
    this.importing = false;
    this.state = {
      state: "running",
      message:
        "Generierung läuft · Anmeldung wird vor der Bildanfrage geprüft.",
    };
    try {
      const saved = await this.service.command({
        type: "prepareAttempt",
        draft,
      });
      const attempt = saved.project.attempts.at(-1)!;
      const request = this.provider.prepare(saved.project, draft);
      request.referenceAssetPath = await this.service.masterFile(
        draft.masterId,
      );
      this.state.attemptId = attempt.id;
      this.task = (async () => {
        try {
          const result = await this.provider.editImage(request);
          if (this.cancelled) return;
          const bytes = await this.provider.resultBytes(result);
          if (this.cancelled) return;
          this.importing = true;
          await this.service.importGeneratedResult(attempt.id, bytes);
          this.state = {
            state: "completed",
            message:
              "Generierung abgeschlossen · Kandidat importiert. Master und Ergebnis vor der Freigabe vergleichen.",
            attemptId: attempt.id,
          };
        } catch {
          const status = this.provider.status;
          this.state = {
            state: this.cancelled
              ? "cancelled"
              : status.state === "not-installed" ||
                  status.state === "not-authenticated" ||
                  status.state === "unavailable"
                ? status.state
                : "failed",
            message: this.cancelled
              ? "Generierung abgebrochen."
              : status.state === "completed"
                ? "Generierung fehlgeschlagen: Ergebnis konnte nicht sicher im Projekt gespeichert werden."
                : status.message,
            attemptId: attempt.id,
          };
        }
      })();
      return this.status();
    } catch (error) {
      this.state = {
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
    await this.provider.cancelGeneration("");
    await this.task;
    this.state = {
      ...this.state,
      state: "cancelled",
      message:
        "Generierung abgebrochen. Späte Ergebnisse werden nicht importiert.",
    };
    return this.status();
  }
  async close() {
    await this.cancel();
    await this.provider.dispose();
  }
}
