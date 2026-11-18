import type { PromptMode } from "../../shared/studio";
import {
  editComposer,
  keepComposer,
  resetComposer,
  type ComposerState,
} from "../../shared/generation";
export function PromptComposer({
  state,
  onChange,
  labelPrefix,
  mode,
  onModeChange,
  sources,
  extraInstructions,
  onExtraChange,
}: {
  sources?: { layer: string; source: string }[];
  labelPrefix?: string;
  state: ComposerState;
  onChange: (s: ComposerState) => void;
  mode: PromptMode;
  onModeChange: (mode: PromptMode) => void;
  extraInstructions: string;
  onExtraChange: (text: string) => void;
}) {
  return (
    <div
      className="prompt-composer"
      data-focus-target={
        labelPrefix ? "creator-prompt-builder" : "prompt-builder"
      }
    >
      {sources && (
        <details className="prompt-sources">
          <summary>Welche Quelle liefert welche Regel?</summary>
          <p>
            Technische Systemregeln, Freigabe und Provenienz bleiben
            verbindlich, auch im Expert Override. Der vollständige tatsächlich
            gespeicherte Prompt ist am Versuch einsehbar.
          </p>
          <dl>
            {sources.map((s) => (
              <div key={s.layer}>
                <dt>{s.layer}</dt>
                <dd>{s.source}</dd>
              </div>
            ))}
          </dl>
        </details>
      )}
      <label>
        Promptmodus
        <select
          aria-label={
            labelPrefix ? `${labelPrefix} Promptmodus` : "Promptmodus"
          }
          value={mode}
          onChange={(e) => onModeChange(e.target.value as PromptMode)}
        >
          <option value="automatic">Automatisch</option>
          <option value="supplement">Ergänzen</option>
          <option value="expert">Expert Override</option>
        </select>
      </label>
      <p className="muted">
        {mode === "expert"
          ? "Manueller Override. Änderungen an Figur, Stil oder Referenzen müssen bei Konflikten bestätigt werden. Verbindliche Providerregeln bleiben erhalten."
          : mode === "supplement"
            ? "Kreative Ergänzungen werden zur aktuellen strukturierten Vorlage hinzugefügt. Identity Lock, Stil und Transparenz bleiben erhalten."
            : "Aktuelle Einstellungen erzeugen den Prompt automatisch. Keine zusätzliche Promptbestätigung nötig."}
      </p>
      {mode === "supplement" && (
        <label>
          Zusätzliche kreative Anweisungen
          <textarea
            aria-label={
              labelPrefix
                ? `${labelPrefix} Ergänzende Anweisung`
                : "Ergänzende Anweisung"
            }
            rows={3}
            maxLength={labelPrefix ? 4000 : 8000}
            value={extraInstructions}
            onChange={(e) => onExtraChange(e.target.value)}
          />
        </label>
      )}
      <div className="section-head">
        <h3>Prompt Builder</h3>
        <span className="badge">
          {mode === "expert"
            ? "Expert Override · manuell"
            : state.saved
              ? "Gespeicherte Revision"
              : "Automatische Vorlage"}
        </span>
      </div>
      <PromptConflict state={state} onChange={onChange} />
      <details className="full-prompt" open={mode === "expert"}>
        <summary>
          Vollständigen Prompt ansehen
          {mode === "expert" ? " und bearbeiten" : ""}
        </summary>
        <label>
          Arbeits-Prompt
          <textarea
            aria-label={
              labelPrefix ? `${labelPrefix} Arbeits-Prompt` : "Arbeits-Prompt"
            }
            readOnly={mode !== "expert"}
            rows={8}
            maxLength={labelPrefix ? 30000 : 24000}
            value={state.text}
            onChange={(e) => onChange(editComposer(state, e.target.value))}
          />
        </label>
      </details>
      {mode === "expert" && (
        <button onClick={() => onChange(resetComposer(state))}>
          Auf Vorlage zurücksetzen
        </button>
      )}
      <details>
        <summary>Automatische Basis ansehen</summary>
        <pre className="prompt-base">{state.pendingBase ?? state.base}</pre>
      </details>
    </div>
  );
}

export function PromptConflict({
  state,
  onChange,
}: {
  state: ComposerState;
  onChange: (state: ComposerState) => void;
}) {
  return (
    <>
      {state.pendingBase !== undefined && (
        <div className="prompt-conflict" role="alert">
          <strong>Auswahl oder Vorlage geändert.</strong>
          <p>
            Dein Expert Override bleibt erhalten. Übernimm die neue Vorlage oder
            bestätige den eigenen Text für die neue Auswahl. Master,
            Stilrevision, Emotion und Stimmaktion prüfen.
          </p>
          <div className="button-row">
            <button onClick={() => onChange(resetComposer(state))}>
              Neue Vorlage übernehmen
            </button>
            <button onClick={() => onChange(keepComposer(state))}>
              Eigenen Prompt behalten
            </button>
          </div>
        </div>
      )}
    </>
  );
}
