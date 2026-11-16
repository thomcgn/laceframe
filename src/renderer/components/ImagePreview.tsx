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
          if (active) setError("Bild konnte nicht geladen werden.");
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
          <p>{error || (id ? "Lade Bild …" : "Noch kein Bild importiert")}</p>
        )}
      </div>
    </figure>
  );
}
