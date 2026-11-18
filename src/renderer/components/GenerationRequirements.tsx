import { displayMessage } from "../../shared/locales";
import { tr } from "../../shared/locales/index";
import type { Requirement } from "../../shared/studio";
export function GenerationRequirements({
  items,
  onFix,
}: {
  items: Requirement[];
  onFix?: (target: string) => void;
}) {
  return (
    <div
      className="generation-requirements"
      aria-live="polite"
      aria-label={tr("common.m7f746fc447")}
    >
      {items.length ? (
        <ul>
          {items.map((r, i) => (
            <li key={i}>
              {r.target ? (
                <button
                  type="button"
                  className="text-link"
                  onClick={() => {
                    focusGenerationRequirement(r.target!, onFix);
                  }}
                >
                  {displayMessage(r.message)}
                </button>
              ) : (
                r.message
              )}
            </li>
          ))}
        </ul>
      ) : (
        <small>{tr("common.m4186f297d7")}</small>
      )}
    </div>
  );
}

export function focusGenerationRequirement(
  target: string,
  onFix?: (target: string) => void,
) {
  onFix?.(target);
  requestAnimationFrame(() => {
    const element =
      document
        .querySelector(".studio-editor:not([hidden])")
        ?.querySelector<HTMLElement>(`[data-focus-target="${target}"]`) ??
      document.getElementById(target);
    for (
      let parent: HTMLElement | null = element;
      parent;
      parent = parent.parentElement
    ) {
      if (parent instanceof HTMLDetailsElement) parent.open = true;
    }
    element?.scrollIntoView({ block: "center" });
    (
      element?.querySelector<HTMLElement>("input,textarea,select,button") ??
      element?.nextElementSibling?.querySelector<HTMLElement>(
        "input,textarea,select,button",
      )
    )?.focus();
  });
}
