import { tr } from "../../shared/locales/index";
export const editorTools = [
  {
    id: "pick",
    get name() {
      return tr("common.mbb05d31837");
    },
    key: "I",
    path: "m16 3 5 5-3 3-5-5Zm-3 3L3 16v5h5L18 11M6 15l3 3",
  },
  {
    id: "auto",
    get name() {
      return tr("common.m33339c367e");
    },
    key: "",
    path: "m4 20 12-12 4 4-12 12M16 2v4M14 4h4M4 3v4M2 5h4M20 18v4M18 20h4",
  },
  {
    id: "paint",
    get name() {
      return tr("common.m7a33cf442e");
    },
    key: "B",
    path: "m14 5 5-3 3 3-3 5-6 6-5-5ZM8 13c-6 0-1 7-6 7 6 3 10-1 8-5",
  },
  {
    id: "erase",
    get name() {
      return tr("common.m98d38938ec");
    },
    key: "E",
    path: "m14 3 7 7-10 11H7l-5-5ZM7 11l7 7M11 21h11",
  },
  {
    id: "protect",
    get name() {
      return tr("common.m641a8b7525");
    },
    key: "",
    path: "M9 3h6v6h6v6h-6v6H9v-6H3V9h6Z",
  },
  {
    id: "protect-erase",
    get name() {
      return tr("common.m7b5f4f3329");
    },
    key: "",
    path: "M9 3h6v6h6v6h-6v6H9v-6H3V9h6ZM2 22 22 2",
  },
  {
    id: "force",
    get name() {
      return tr("common.m8c4b169e0b");
    },
    key: "",
    path: "M4 4h16v16H4ZM8 12h8",
  },
  {
    id: "force-erase",
    get name() {
      return tr("common.m7be731bedc");
    },
    key: "",
    path: "M4 4h16v16H4ZM8 12h8M2 22 22 2",
  },
  {
    id: "polygon",
    get name() {
      return tr("common.m24aefe441c");
    },
    key: "L",
    path: "m4 4 15 2 2 12-13 3ZM3 3h2v2H3ZM18 5h2v2h-2ZM20 17h2v2h-2ZM7 20h2v2H7Z",
  },
  {
    id: "pan",
    get name() {
      return tr("common.m22f50c5a8e");
    },
    key: "H",
    path: "M7 12V6a2 2 0 0 1 4 0v6-8a2 2 0 0 1 4 0v8-6a2 2 0 0 1 4 0v8-4a2 2 0 0 1 3 0v6c0 5-3 7-7 7h-2c-3 0-5-3-6-5l-4-5a2 2 0 0 1 3-2Z",
  },
];
export function EditorTools({
  automatic,
  tool,
  onSelect,
  disabled,
}: {
  automatic: boolean;
  tool: string;
  onSelect: (id: string) => void;
  disabled: boolean;
}) {
  return (
    <div
      className="editor-tools"
      role="toolbar"
      aria-label={tr("common.mdfddc617bf")}
    >
      {editorTools
        .filter((t) => automatic || ["paint", "erase", "pan"].includes(t.id))
        .map((t) => (
          <button
            key={t.id}
            type="button"
            disabled={disabled}
            aria-label={t.name}
            aria-keyshortcuts={t.key || undefined}
            aria-pressed={tool === t.id}
            title={tr("common.m255c5feafc", {
              v0: t.name,
              v1: t.key ? tr("common.m80d14c6b7e", { v0: t.key }) : "",
            })}
            onClick={() => onSelect(t.id)}
            className={t.id === "protect" ? "protect-tool" : ""}
          >
            <svg
              width="21"
              height="21"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.7"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d={t.path} />
            </svg>
            <span>{t.name}</span>
          </button>
        ))}
    </div>
  );
}
