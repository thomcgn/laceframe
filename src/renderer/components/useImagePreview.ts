import { useEffect, useState } from "react";
export function usePreview(id?: string) {
  const [value, setValue] = useState({ src: "", error: "" });
  useEffect(() => {
    let live = true;
    setValue({ src: "", error: "" });
    if (id)
      void window.laceframe
        .preview(id)
        .then((r) => {
          if (live)
            setValue(
              r.ok ? { src: r.value, error: "" } : { src: "", error: r.error },
            );
        })
        .catch(() => {
          if (live)
            setValue({
              src: "",
              error: "Vorschau konnte nicht geladen werden.",
            });
        });
    return () => {
      live = false;
    };
  }, [id]);
  return value;
}
