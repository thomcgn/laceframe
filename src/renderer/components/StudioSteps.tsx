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
      <nav aria-label="Studio Schritte">
        {studioSteps.map((name, index) => (
          <button
            key={name}
            aria-current={step === name ? "step" : undefined}
            onClick={() => setStep(name)}
          >
            {index + 1}. {name}
          </button>
        ))}
      </nav>
      <label>
        <input
          type="checkbox"
          aria-label="Expertenansicht"
          checked={expert}
          onChange={(e) => setExpert(e.target.checked)}
        />
        Expertenansicht
      </label>
      <p role="status" aria-label="Nächster Studio-Schritt">
        {
          {
            Auswählen:
              "Figur und Bildkontext wählen. Danach zu Erzeugen wechseln.",
            Erzeugen:
              "Eingaben prüfen. Erst ein ausdrücklicher Klick startet die Generierung oder den Import.",
            Bearbeiten:
              "Entwurf vergleichen und bei Bedarf korrigieren. Originale bleiben unverändert.",
            Freigeben:
              "Ergebnis und Warnungen prüfen. Nur du entscheidest über die Freigabe.",
          }[step]
        }
      </p>
    </div>
  );
}
