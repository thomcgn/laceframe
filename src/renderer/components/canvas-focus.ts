import { useEffect, type RefObject } from "react";
/** Native DOM focus is the single authority; wheel must bubble while another control is active. */
export function canvasOwnsFocus(element: HTMLElement | null) {
  return Boolean(
    element && element.contains(element.ownerDocument.activeElement),
  );
}
export function bindCanvasFocus(element: HTMLElement) {
  const pointer = (event: PointerEvent) => {
    if (event.target instanceof Node && element.contains(event.target))
      element.focus({ preventScroll: true });
    else if (canvasOwnsFocus(element))
      (element.ownerDocument.activeElement as HTMLElement)?.blur();
  };
  element.ownerDocument.addEventListener("pointerdown", pointer, true);
  return () =>
    element.ownerDocument.removeEventListener("pointerdown", pointer, true);
}
export function useCanvasFocus(ref: RefObject<HTMLElement | null>) {
  // A canvas may mount only after an asynchronous image read. Rebind to the actual node.
  useEffect(() => {
    const element = ref.current;
    if (element) return bindCanvasFocus(element);
  });
}
