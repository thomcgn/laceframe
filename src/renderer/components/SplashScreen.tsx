import { useEffect, useRef, useState } from "react";
import { bootLabel, type LifecycleState } from "../app-lifecycle";
export const SPLASH_URL = `${import.meta.env.BASE_URL}images/splash.png`;
/** Vite public asset: relative base in dev and the whitelisted packaged laceframe protocol. */
export async function initializeApplication() {
  if (!window.laceframe)
    throw new Error(
      "Die sichere Desktop-Schnittstelle fehlt. Anwendung neu starten.",
    );
  const result = await window.laceframe.providers();
  if (!result.ok) throw new Error(result.error);
  if (!result.value.length)
    throw new Error("Lokale Anbieter konnten nicht initialisiert werden.");
  await new Promise<void>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve();
    image.onerror = () =>
      reject(new Error("Startgrafik konnte nicht geladen werden."));
    image.src = SPLASH_URL;
  });
}
export function SplashScreen({
  state,
  onOpen,
  onCreate,
  onRetry,
}: {
  state: LifecycleState;
  onOpen: () => void;
  onCreate: (name: string) => Promise<void>;
  onRetry: () => void;
}) {
  const [creating, setCreating] = useState(false),
    [name, setName] = useState("Mein Portraitstudio");
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (creating && !dialog.current?.open) dialog.current?.showModal();
  }, [creating]);
  const loading = [
    "opening-project",
    "creating-project",
    "closing-project",
  ].includes(state.phase);
  const selecting =
    state.phase === "project-selection" ||
    (state.phase === "error" && state.errorKind === "project");
  return (
    <main className="splash-screen" aria-label="Laceframe Projektstart">
      <div className="splash-art">
        <img
          className="splash-image"
          src={SPLASH_URL}
          alt="LaceFrame Character Studio · Pixelart-Figur mit Brille und Laptop"
          draggable={false}
        />
        <section className="splash-controls" aria-label="Projektstart">
          {state.phase === "booting" && (
            <div className="splash-boot">
              <p key={bootLabel(state)} className="splash-status" role="status">
                {bootLabel(state)}
              </p>
              <div className="splash-meter">
                <div
                  role="progressbar"
                  aria-label="Inszenierte Startanimation"
                  aria-valuenow={Math.floor(state.progress)}
                  aria-valuemin={0}
                  aria-valuemax={100}
                >
                  <span style={{ width: `${state.progress}%` }} />
                </div>
                <output>{Math.floor(state.progress)} %</output>
              </div>
              <small>
                Startanimation · keine technische Fortschrittsmessung
              </small>
            </div>
          )}
          {state.error && (
            <p role="alert" className="splash-error">
              {state.error}
            </p>
          )}
          {state.errorKind === "boot" && (
            <button onClick={onRetry}>Erneut versuchen</button>
          )}
          {selecting && (
            <div className="splash-project-actions">
              <button className="primary" onClick={onOpen}>
                Projekt öffnen
              </button>
              <button onClick={() => setCreating(true)}>Neues Projekt</button>
            </div>
          )}
          {loading && (
            <p role="status">
              {state.phase === "opening-project"
                ? "Projekt wird geprüft und geöffnet …"
                : state.phase === "creating-project"
                  ? "Projekt wird angelegt …"
                  : "Projekt wird geschlossen …"}
            </p>
          )}
        </section>
      </div>
      {creating && (
        <dialog
          ref={dialog}
          className="splash-create"
          onCancel={(e) => {
            if (loading) e.preventDefault();
            else setCreating(false);
          }}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (loading) return;
              void onCreate(name).then(() => {
                dialog.current?.close();
                setCreating(false);
              });
            }}
          >
            <h2>Neues Projekt</h2>
            <label>
              Projektname
              <input
                required
                maxLength={120}
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={loading}
              />
            </label>
            <p>Wähle anschließend einen leeren lokalen Projektordner.</p>
            <div className="button-row">
              <button
                type="button"
                disabled={loading}
                onClick={() => {
                  dialog.current?.close();
                  setCreating(false);
                }}
              >
                Abbrechen
              </button>
              <button type="submit" disabled={loading || !name.trim()}>
                Projekt erstellen …
              </button>
            </div>
          </form>
        </dialog>
      )}
    </main>
  );
}
