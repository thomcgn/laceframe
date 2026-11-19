export const tools = [
    { id: "brush", label: "canvas.brush", key: "B", icon: "M4 20 18 6l2-4-4 2L2 18Z" },
    { id: "eraser", label: "canvas.eraser", key: "E", icon: "m4 14 9-10 7 7-9 10H8Zm7 7h10" },
    { id: "wand", label: "canvas.wand", key: "W", icon: "m3 21 14-14 4 4L7 25M4 3v6M1 6h6M17 1v4M15 3h4" },
    { id: "range", label: "canvas.range", key: "", icon: "M3 3h18v18H3ZM8 3v18M16 3v18" },
    { id: "rectangle", label: "canvas.rectangle", key: "M", icon: "M3 5h18v14H3Z" },
    { id: "ellipse", label: "canvas.ellipse", key: "", icon: "M21 12a9 7 0 1 1-18 0 9 7 0 1 1 18 0Z" },
    { id: "lasso", label: "canvas.lasso", key: "L", icon: "M12 3C0 3 0 16 12 16s12-13 0-13ZM8 16c0 8 6 6 6 3" },
    { id: "polygon", label: "canvas.polygon", key: "", icon: "m3 4 17 2-4 15-11-5Z" },
    { id: "bezier", label: "canvas.bezier", key: "P", icon: "M3 19C4 1 20 23 21 5M2 19h2M20 5h2M5 3h3M17 21h3" },
    { id: "eyedropper", label: "canvas.eyedropper", key: "I", icon: "m16 3 5 5-3 3-5-5ZM13 6 3 16v5h5l10-10" },
    { id: "pan", label: "canvas.pan", key: "H", icon: "M4 13V8h4V3h4v5h4V5h4v11c0 8-12 8-16-3Z" },
] as const;
export type ToolId = typeof tools[number]["id"];
export function editorShortcut(e: Pick<KeyboardEvent, "key" | "ctrlKey" | "metaKey" | "shiftKey" | "altKey">, textInput: boolean) {
    if (textInput || e.altKey)
        return;
    const key = e.key.toLowerCase(), mod = e.ctrlKey || e.metaKey;
    if (mod)
        return key === "z" ? e.shiftKey ? "redo" : "undo" : key === "a" ? "all" : key === "d" ? "clear" : key === "i" && e.shiftKey ? "invert" : undefined;
    return key === "escape" ? "cancel" : key === "enter" ? "closePath" : key === "backspace" ? "removeNode" : key === "f" ? "fit" : tools.find(t => t.key.toLowerCase() === key)?.id;
}
export const selectionLabels: Record<string, string> = { replace: "canvas.replace", add: "canvas.add", subtract: "canvas.subtract", intersect: "canvas.intersect", undo: "canvas.undo", redo: "canvas.redo", all: "canvas.all", clear: "canvas.clear", invert: "canvas.invert", fit: "canvas.fit" };
