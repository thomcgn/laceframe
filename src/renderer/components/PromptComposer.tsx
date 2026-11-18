import { uiLabel } from "../../shared/locales";
import { tr } from "../../shared/locales/index";
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
        <section>
          <h3>{tr("studio.m69b69130d1")}</h3>
          <p>{tr("studio.m0e45d2a144")}</p>
          <dl>
            {sources.map((s) => (
              <div key={uiLabel(s.layer)}>
                <dt>{uiLabel(s.layer)}</dt>
                <dd>{s.source}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}
      <label>
        {tr("studio.m6dc6371437")}
        <select
          aria-label={
            labelPrefix
              ? tr("studio.m4e3eca8fa1", { v0: labelPrefix })
              : tr("studio.m6dc6371437")
          }
          value={mode}
          onChange={(e) => onModeChange(e.target.value as PromptMode)}
        >
          <option value="automatic">{tr("studio.m4c2a3993c1")}</option>
          <option value="supplement">{tr("studio.m4cf5595ee5")}</option>
          <option value="expert">{tr("studio.m770c9c49e0")}</option>
        </select>
      </label>
      <p className="muted">
        {mode === "expert"
          ? tr("studio.m48f374e263")
          : mode === "supplement"
            ? tr("studio.ma6062a4426")
            : tr("studio.m71be68c2ae")}
      </p>
      {mode === "supplement" && (
        <label>
          {tr("studio.macbee67c04")}
          <textarea
            aria-label={
              labelPrefix
                ? tr("studio.m45bf30d5cc", { v0: labelPrefix })
                : tr("studio.mf68da4bc07")
            }
            rows={3}
            maxLength={labelPrefix ? 4000 : 8000}
            value={extraInstructions}
            onChange={(e) => onExtraChange(e.target.value)}
          />
        </label>
      )}
      <div className="section-head">
        <h3>{tr("studio.mb5129ac6ab")}</h3>
        <span className="badge">
          {mode === "expert"
            ? tr("studio.m36e2931765")
            : state.saved
              ? tr("studio.mfa9d6122bf")
              : tr("studio.md18b70eec7")}
        </span>
      </div>
      <PromptConflict state={state} onChange={onChange} />
      <section>
        <h3>
          {tr("studio.m070964c58f")}
          {mode === "expert" ? tr("studio.m1d1b822bff") : ""}
        </h3>
        <label>
          {tr("studio.m736c50059e")}
          <textarea
            aria-label={
              labelPrefix
                ? tr("studio.mef37484b89", { v0: labelPrefix })
                : tr("studio.m736c50059e")
            }
            readOnly={mode !== "expert"}
            rows={8}
            maxLength={labelPrefix ? 30000 : 24000}
            value={state.text}
            onChange={(e) => onChange(editComposer(state, e.target.value))}
          />
        </label>
      </section>
      {mode === "expert" && (
        <button onClick={() => onChange(resetComposer(state))}>
          {tr("studio.m2234d31b99")}
        </button>
      )}
      <section>
        <h3>{tr("studio.m83394415fc")}</h3>
        <pre className="prompt-base">{state.pendingBase ?? state.base}</pre>
      </section>
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
          <strong>{tr("studio.m89905add01")}</strong>
          <p>{tr("studio.m59d67981d1")}</p>
          <div className="button-row">
            <button onClick={() => onChange(resetComposer(state))}>
              {tr("studio.m4de69328d8")}
            </button>
            <button onClick={() => onChange(keepComposer(state))}>
              {tr("studio.m965f186eef")}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
