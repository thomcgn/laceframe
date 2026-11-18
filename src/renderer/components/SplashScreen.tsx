import { displayMessage } from "../../shared/locales";
import { setLanguage } from "../../shared/locales";
import { LanguageSelector } from "./LanguageSelector";
import { tr } from "../../shared/locales/index";
import { useEffect, useRef, useState } from "react";
import { bootLabel, type LifecycleState } from "../app-lifecycle";
export const SPLASH_URL = `${import.meta.env.BASE_URL}images/splash.png`;
/** Vite public asset: relative base in dev and the whitelisted packaged laceframe protocol. */
export async function initializeApplication() {
  if (!window.laceframe) throw new Error(tr("common.mcb47c91c82"));
  const preferences = await window.laceframe.preferences();
  if (!preferences.ok) throw new Error(preferences.error);
  await setLanguage(preferences.value.language);
  document.documentElement.lang = preferences.value.language;
  const result = await window.laceframe.providers();
  if (!result.ok) throw new Error(result.error);
  if (!result.value.length) throw new Error(tr("common.mc679af2415"));
  await new Promise<void>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve();
    image.onerror = () => reject(new Error(tr("common.m3453725362")));
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
    <main className="splash-screen" aria-label={tr("common.mbba45cc6c6")}>
      <div className="splash-language">
        <LanguageSelector />
      </div>
      <div className="splash-art">
        <img
          className="splash-image"
          src={SPLASH_URL}
          alt={tr("common.m0ce7ff5454")}
          draggable={false}
        />
        <section
          className="splash-controls"
          aria-label={tr("common.md4c3fa244e")}
        >
          {state.phase === "booting" && (
            <div className="splash-boot">
              <p key={bootLabel(state)} className="splash-status" role="status">
                {bootLabel(state)}
              </p>
              <div className="splash-meter">
                <div
                  role="progressbar"
                  aria-label={tr("common.m45c5bc91a0")}
                  aria-valuenow={Math.floor(state.progress)}
                  aria-valuemin={0}
                  aria-valuemax={100}
                >
                  <span style={{ width: `${state.progress}%` }} />
                </div>
                <output>{Math.floor(state.progress)} %</output>
              </div>
              <small>{tr("common.mf97814a9fc")}</small>
            </div>
          )}
          {state.error && (
            <p role="alert" className="splash-error">
              {displayMessage(state.error)}
            </p>
          )}
          {state.errorKind === "boot" && (
            <button onClick={onRetry}>{tr("common.m948643cb59")}</button>
          )}
          {selecting && (
            <div className="splash-project-actions">
              <button className="primary" onClick={onOpen}>
                {tr("common.m323616007c")}
              </button>
              <button onClick={() => setCreating(true)}>
                {tr("common.md41a7a057b")}
              </button>
            </div>
          )}
          {loading && (
            <p role="status">
              {state.phase === "opening-project"
                ? tr("common.m50cd53847a")
                : state.phase === "creating-project"
                  ? tr("common.m34b9dda9b4")
                  : tr("common.m6eb10757e1")}
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
            <h2>{tr("common.md41a7a057b")}</h2>
            <label>
              {tr("common.m29ff0bdf52")}
              <input
                required
                maxLength={120}
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={loading}
              />
            </label>
            <p>{tr("common.ma64e7b050d")}</p>
            <div className="button-row">
              <button
                type="button"
                disabled={loading}
                onClick={() => {
                  dialog.current?.close();
                  setCreating(false);
                }}
              >
                {tr("common.mf7ff1178af")}
              </button>
              <button type="submit" disabled={loading || !name.trim()}>
                {tr("common.m3fa71a5641")}
              </button>
            </div>
          </form>
        </dialog>
      )}
    </main>
  );
}
