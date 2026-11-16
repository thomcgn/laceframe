import type { Requirement } from "../../shared/studio";
export function GenerationRequirements({ items }: { items: Requirement[] }) {
  return (
    <div
      className="generation-requirements"
      aria-live="polite"
      aria-label="Voraussetzungen"
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
                    const element =
                      document
                        .querySelector(".studio-editor:not([hidden])")
                        ?.querySelector<HTMLElement>(
                          `[data-focus-target="${r.target}"]`,
                        ) ?? document.getElementById(r.target!);
                    for (
                      let parent: HTMLElement | null = element;
                      parent;
                      parent = parent.parentElement
                    ) {
                      if (parent instanceof HTMLDetailsElement)
                        parent.open = true;
                    }
                    element?.scrollIntoView({ block: "center" });
                    (
                      element?.querySelector<HTMLElement>(
                        "input,textarea,select,button",
                      ) ??
                      element?.nextElementSibling?.querySelector<HTMLElement>(
                        "input,textarea,select,button",
                      )
                    )?.focus();
                  }}
                >
                  {r.message}
                </button>
              ) : (
                r.message
              )}
            </li>
          ))}
        </ul>
      ) : (
        <small>
          Bereit · Auftrag wird ausschließlich durch deinen Klick gestartet.
        </small>
      )}
    </div>
  );
}
