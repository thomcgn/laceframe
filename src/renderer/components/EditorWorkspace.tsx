import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
const WorkspaceContext = createContext<{
  path: string;
  enter: (delta: number) => void;
} | null>(null);
/** Retain parent drafts, but replace the visible workspace when a subtool opens. */
export function EditorWorkspace({
  title,
  className = "",
  children,
}: {
  title: string;
  className?: string;
  children: ReactNode;
}) {
  const parent = useContext(WorkspaceContext);
  const [opener] = useState(() => document.activeElement as HTMLElement | null);
  useEffect(
    () => () => {
      requestAnimationFrame(() => {
        if (opener?.isConnected) opener.focus();
      });
    },
    [opener],
  );
  const [childCount, setChildCount] = useState(0);
  const [enter] = useState(
    () => (delta: number) => setChildCount((n) => n + delta),
  );
  const path = parent ? `${parent.path} / ${title}` : title;
  useEffect(() => {
    parent?.enter(1);
    return () => parent?.enter(-1);
  }, [parent?.enter]);
  useEffect(() => {
    if (parent) return;
    const root = document.getElementById("root");
    const previous = root?.inert;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    if (root) root.inert = true;
    return () => {
      if (root) root.inert = previous ?? false;
      document.body.style.overflow = overflow;
    };
  }, [!!parent]);
  return createPortal(
    <WorkspaceContext.Provider value={{ path, enter }}>
      <div
        className={`modal-backdrop editor-workspace-screen ${className}`}
        hidden={childCount > 0}
        onKeyDown={(e) => e.stopPropagation()}
      >
        <div className="editor-workspace-path" aria-label="Editorpfad">
          {path}
        </div>
        {children}
      </div>
    </WorkspaceContext.Provider>,
    document.body,
  );
}
