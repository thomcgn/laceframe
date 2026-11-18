import { uiLabel } from "../../shared/locales";
import { tr } from "../../shared/locales/index";
import { useState } from "react";
export const studioSteps = [
  "Auswählen",
  "Erzeugen",
  "Bearbeiten",
  "Freigeben",
] as const;
export type StudioStep = (typeof studioSteps)[number];
export function useStudioSteps() {
  const [step, setStep] = useState<StudioStep>("Auswählen");
  const [expert, setExpert] = useState(false);
  return { step, setStep, expert, setExpert };
}
export function StudioSteps({
  step,
  setStep,
  expert,
  setExpert,
}: ReturnType<typeof useStudioSteps>) {
  return (
    <div className="studio-flow">
      <nav aria-label={tr("common.m4fec37bb32")}>
        {studioSteps.map((name, index) => (
          <button
            key={name}
            aria-current={step === name ? "step" : undefined}
            onClick={() => setStep(name)}
          >
            {index + 1}. {uiLabel(name)}
          </button>
        ))}
      </nav>
      <label>
        <input
          type="checkbox"
          aria-label={tr("common.md40a40bb26")}
          checked={expert}
          onChange={(e) => setExpert(e.target.checked)}
        />
        {tr("common.md40a40bb26")}
      </label>
      <p role="status" aria-label={tr("common.m932092fda7")}>
        {
          {
            Auswählen: tr("common.m9056ebdf8b"),
            Erzeugen: tr("common.ma8bd25b5ca"),
            Bearbeiten: tr("common.m245629b756"),
            Freigeben: tr("common.mf64f3a97b2"),
          }[step]
        }
      </p>
    </div>
  );
}
