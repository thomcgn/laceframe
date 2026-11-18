import { tr } from "../../shared/locales/index";
import { useEffect, useState } from "react";
export function ImagePreview({
  id,
  caption,
  zoom,
}: {
  id?: string;
  caption: string;
  zoom: number | "fit";
}) {
  const [image, setImage] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    setImage("");
    setError("");
    if (id)
      void window.laceframe
        .preview(id)
        .then((result) => {
          if (active) {
            if (result.ok) setImage(result.value);
            else setError(result.error);
          }
        })
        .catch(() => {
          if (active) setError(tr("common.m5ed069822e"));
        });
    return () => {
      active = false;
    };
  }, [id]);
  return (
    <figure>
      <figcaption>{caption}</figcaption>
      <div className="checker preview">
        {image ? (
          <img
            src={image}
            alt={caption}
            style={
              zoom === "fit"
                ? {
                    maxWidth: "100%",
                    maxHeight: "100%",
                    width: "auto",
                    height: "auto",
                    objectFit: "contain",
                    margin: "auto",
                  }
                : { zoom: zoom / 100, maxWidth: "none" }
            }
          />
        ) : (
          <p>
            {error ||
              (id ? tr("common.mab9f00032e") : tr("common.mc675a2270e"))}
          </p>
        )}
      </div>
    </figure>
  );
}
