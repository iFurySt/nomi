import { useEffect, useState } from "react";
import { FileText } from "lucide-react";
import type { CanvasNote } from "@nomi/core";
import type { CanvasRepository } from "@nomi/platform";
export function NoteIcon({
  note,
  repository,
}: {
  note: CanvasNote;
  repository: CanvasRepository;
}) {
  const asset = note.icon?.type === "image" ? note.icon.asset : undefined;
  const [image, setImage] = useState<{ id: string; url: string }>();
  useEffect(() => {
    if (!asset) return;
    let live = true,
      url = "";
    void repository
      .asset(asset)
      .then((blob) => {
        if (live && blob) {
          url = URL.createObjectURL(blob);
          setImage({ id: asset, url });
        }
      })
      .catch(() => {
        /* Keep the default document icon if the asset is unavailable. */
      });
    return () => {
      live = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [asset, repository]);
  return (
    <span className="note-icon-image" aria-hidden="true">
      {note.icon?.type === "emoji" ? (
        note.icon.value
      ) : asset && image?.id === asset ? (
        <img
          src={image.url}
          alt=""
          draggable={false}
          onError={() => setImage(undefined)}
        />
      ) : (
        <FileText size={16} />
      )}
    </span>
  );
}
