import { tr } from "../../shared/locales/index";
export type ToolbarTool = {
  id: string;
  label: string;
  key?: string;
  icon: string;
  disabled?: boolean;
  pressed?: boolean;
  title?: string;
};
/** Shared toolbar renderer used by every editor that needs a consistent tool row. */
export function EditorToolbar({
  tools,
  ariaLabel,
  onActivate,
  className = "",
}: {
  tools: ToolbarTool[];
  ariaLabel: string;
  onActivate: (id: string) => void;
  className?: string;
}) {
  return (
    <div
      className={`editor-toolbar ${className}`}
      role="toolbar"
      aria-label={ariaLabel}
    >
      {tools.map((t) => (
        <button
          key={t.id}
          type="button"
          disabled={t.disabled ?? false}
          aria-label={t.label}
          aria-keyshortcuts={t.key || undefined}
          aria-pressed={t.pressed ?? false}
          title={t.title ?? `${t.label}${t.key ? ` (${t.key})` : ""}`}
          onClick={() => onActivate(t.id)}
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d={t.icon} />
          </svg>
          <span>{t.label}</span>
        </button>
      ))}
    </div>
  );
}
/** Shared zoom controls rendered inside every PixelViewport tool row. */
export function ZoomControls({
  scale,
  onFit,
  onZoom,
  onPanToggle,
  panActive,
  showHandTool = true,
}: {
  scale: number;
  onFit: () => void;
  onZoom: (value: number) => void;
  onPanToggle?: () => void;
  panActive?: boolean;
  showHandTool?: boolean;
}) {
  return (
    <div className="zoom-controls" role="toolbar" aria-label={tr("editing.mdc6710c419")}>
      <button onClick={onFit} title={tr("editing.m6697a0f7da")}>{tr("editing.m6697a0f7da")}</button>
      <button onClick={() => onZoom(1)}>1:1</button>
      <button onClick={() => onZoom(2)}>200%</button>
      <button onClick={() => onZoom(4)}>400%</button>
      <input
        aria-label={tr("editing.m574db8099d")}
        type="range"
        min="1"
        max="800"
        value={Math.max(1, Math.min(800, scale * 100))}
        onChange={(e) => onZoom(Number(e.target.value) / 100)}
      />
      <output aria-label={tr("editing.m1487a4bca5")}>{Math.round(scale * 100)}%</output>
      {showHandTool && onPanToggle && (
        <button
          aria-label={tr("editing.mfd0d09a508")}
          title={tr("editing.md74050edae")}
          aria-pressed={panActive ?? false}
          onClick={onPanToggle}
        >
          {tr("editing.mfa18c06733")}
        </button>
      )}
    </div>
  );
}