import {
  editComposer,
  keepComposer,
  resetComposer,
  type ComposerState,
} from "../../shared/generation";
export function PromptComposer({
  state,
  onChange,
}: {
  state: ComposerState;
  onChange: (state: ComposerState) => void;
}) {
  return (
    <div className="prompt-composer">
      <div className="section-head">
        <h2>Character-Lock-Prompt</h2>
        <span className="badge">
          {state.edited ? "Eigene Bearbeitung" : "Automatische Vorlage"}
        </span>
      </div>
      {state.pendingBase !== undefined && (
        <div className="prompt-conflict" role="alert">
          <strong>Auswahl oder Vorlage geändert.</strong>
          <p>
            Dein bearbeiteter Text bleibt erhalten. Übernimm die neue Vorlage
            oder behalte deinen Text ausdrücklich für die neue Auswahl. Prüfe
            dabei Master, Emotion und Stimmaktion.
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
      <label>
        Arbeits-Prompt
        <textarea
          aria-label="Arbeits-Prompt"
          rows={12}
          maxLength={24000}
          value={state.text}
          onChange={(e) => onChange(editComposer(state, e.target.value))}
        />
      </label>
      <button onClick={() => onChange(resetComposer(state))}>
        Auf Vorlage zurücksetzen
      </button>
      <details>
        <summary>Automatische Basis ansehen</summary>
        <pre className="prompt-base">{state.pendingBase ?? state.base}</pre>
      </details>
    </div>
  );
}
