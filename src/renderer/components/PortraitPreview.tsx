import { PixelViewport } from "./PixelViewport";
import { usePreview } from "./useImagePreview";
/** Read-only image presentation through the existing validated preview IPC. */
export function PortraitPreview({
  image,
  caption,
}: {
  image?: { id: string; width: number; height: number };
  caption: string;
}) {
  const preview = usePreview(image?.id);
  return (
    <figure className="portrait-preview">
      <figcaption>{caption}</figcaption>
      {image && preview.src ? (
        <PixelViewport key={image.id} width={image.width} height={image.height}>
          <img src={preview.src} alt={caption} draggable={false} />
        </PixelViewport>
      ) : (
        <p className="portrait-empty">
          {preview.error ||
            (image ? "Lade Bild …" : "Noch kein Bild ausgewählt")}
        </p>
      )}
    </figure>
  );
}
