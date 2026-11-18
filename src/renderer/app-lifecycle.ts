import type { Result } from "../shared/bridge";
import type { Snapshot } from "../shared/domain";
export type AppPhase =
  | "booting"
  | "project-selection"
  | "opening-project"
  | "creating-project"
  | "closing-project"
  | "workspace"
  | "error";
export type LifecycleState = {
  phase: AppPhase;
  progress: number;
  waiting: boolean;
  error: string;
  errorKind?: "boot" | "project";
};
export const BOOT_DURATION = 10_000;
const labels: [number, string][] = [
  [0, "Wecke die Pixel auf …"],
  [12, "Sortiere Pixel nach Farbe …"],
  [25, "Entwirre Haarsträhnen …"],
  [38, "Suche verlorene Semikolons …"],
  [50, "Koche Kaffee … ☕"],
  [62, "Überrede die GPU zur Mitarbeit …"],
  [74, "Bügle Antialiasing glatt …"],
  [84, "Zähle transparente Pixel …"],
  [92, "Überprüfe die letzte Kaffeetasse …"],
  [100, "Alles an seinem Platz. Fast."],
];
export function bootLabel(state: LifecycleState) {
  return state.waiting
    ? "Noch einen Moment, die Pixel stellen sich quer …"
    : labels.filter(([p]) => state.progress >= p).at(-1)![1];
}
/** Phase only, never a second project store. Synchronous single-flight gates survive React re-renders. */
export class AppLifecycle {
  private state: LifecycleState = {
    phase: "booting",
    progress: 0,
    waiting: false,
    error: "",
  };
  private listeners = new Set<() => void>();
  private began?: number;
  private finishing?: number;
  private ready = false;
  private initialization?: Promise<void>;
  private initializing = false;
  private operating = false;
  constructor(
    private initializeWork: () => Promise<void>,
    private now: () => number = () => performance.now(),
  ) {}
  getSnapshot = () => this.state;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private update(patch: Partial<LifecycleState>) {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((l) => l());
  }
  displayed() {
    if (this.began === undefined) this.began = this.now();
  }
  initialize() {
    if (this.initialization) return this.initialization;
    this.initializing = true;
    this.initialization = Promise.resolve()
      .then(() => this.initializeWork())
      .then(
        () => {
          this.ready = true;
        },
        (error) => {
          this.update({
            phase: "error",
            errorKind: "boot",
            error:
              error instanceof Error
                ? error.message
                : "Start fehlgeschlagen. Bitte erneut versuchen.",
            waiting: false,
          });
        },
      )
      .finally(() => {
        this.initializing = false;
      });
    return this.initialization;
  }
  retry() {
    if (this.initializing || this.state.errorKind !== "boot") return;
    this.initialization = undefined;
    this.update({ phase: "booting", error: "", errorKind: undefined });
    void this.initialize();
  }
  tick() {
    if (this.state.phase !== "booting" || this.began === undefined) return;
    const elapsed = Math.max(0, this.now() - this.began);
    if (elapsed >= BOOT_DURATION && this.ready && this.finishing === undefined)
      this.finishing = this.now();
    const finishing =
      this.finishing === undefined ? undefined : this.now() - this.finishing;
    const progress = Math.max(
      this.state.progress,
      finishing === undefined
        ? Math.min(95, (elapsed / BOOT_DURATION) * 95)
        : Math.min(100, 95 + (finishing / 400) * 5),
    );
    this.update({
      progress,
      waiting: elapsed >= BOOT_DURATION && !this.ready,
      ...(finishing !== undefined && finishing >= 650
        ? { phase: "project-selection" as const }
        : {}),
    });
  }
  async project(
    kind: "opening-project" | "creating-project",
    work: () => Promise<Result<Snapshot | null>>,
    opened: (s: Snapshot) => void,
  ) {
    if (
      !this.ready ||
      this.state.phase === "booting" ||
      this.operating ||
      this.state.errorKind === "boot"
    )
      return;
    const previous =
      this.state.phase === "workspace" ? "workspace" : "project-selection";
    this.operating = true;
    this.update({ phase: kind, error: "", errorKind: undefined });
    try {
      const r = await work();
      if (!r.ok) throw new Error(r.error);
      if (r.value) {
        opened(r.value);
        this.update({ phase: "workspace" });
      } else this.update({ phase: previous });
    } catch (e) {
      this.update({
        phase: previous === "workspace" ? "workspace" : "error",
        errorKind: "project",
        error:
          e instanceof Error
            ? e.message
            : "Projekt konnte nicht geladen werden.",
      });
    } finally {
      this.operating = false;
    }
  }
  async close(work: () => Promise<Result<null>>, closed: () => void) {
    if (this.operating || this.state.phase !== "workspace") return;
    this.operating = true;
    this.update({ phase: "closing-project", error: "", errorKind: undefined });
    try {
      const r = await work();
      if (!r.ok) throw new Error(r.error);
      closed();
      this.update({ phase: "project-selection" });
    } catch (e) {
      this.update({
        phase: "workspace",
        errorKind: "project",
        error:
          e instanceof Error
            ? e.message
            : "Projekt konnte nicht geschlossen werden.",
      });
    } finally {
      this.operating = false;
    }
  }
}
