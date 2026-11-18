import { tr } from "../../shared/locales/index";
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
              error: tr("common.m589ab0d8fd"),
            });
        });
    return () => {
      live = false;
    };
  }, [id]);
  return value;
}
