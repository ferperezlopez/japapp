import { DeletePhotoButton } from "./DeletePhotoButton";

interface Photo {
  id: string;
  storagePath: string;
  url: string | null;
  uploadedBy: string;
}

// Rotación leve determinística (efecto "polaroid"), no random en cada
// render: se deriva del id de la foto para que sea estable.
function rotationFor(id: string) {
  const hash = Array.from(id).reduce((acc, c) => acc + c.charCodeAt(0), 0);
  return (hash % 9) - 4;
}

export function PhotoGrid({
  eventId,
  photos,
  currentUserId,
  eventCreatorId,
}: {
  eventId: string;
  photos: Photo[];
  currentUserId: string | undefined;
  eventCreatorId: string;
}) {
  if (photos.length === 0) {
    return <p className="text-sm text-zinc-500">Todavía no hay fotos.</p>;
  }

  return (
    <div className="flex flex-wrap gap-4 pt-2">
      {photos.map((photo) => (
        <div
          key={photo.id}
          className="group relative h-28 w-28 overflow-hidden rounded-lg border border-coral-mid/50 bg-zinc-100 shadow-[0_1px_3px_rgba(0,0,0,0.08)] dark:border-coral/25 dark:bg-zinc-800"
          style={{ transform: `rotate(${rotationFor(photo.id)}deg)` }}
        >
          {photo.url ? (
            // eslint-disable-next-line @next/next/no-img-element -- fotos de usuario via URL firmada de Supabase Storage, no vale el pipeline de next/image para esto
            <img src={photo.url} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-xs text-zinc-400">
              Sin vista previa
            </div>
          )}
          {(photo.uploadedBy === currentUserId ||
            eventCreatorId === currentUserId) && (
            <div className="absolute right-1 top-1 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
              <DeletePhotoButton
                eventId={eventId}
                mediaId={photo.id}
                storagePath={photo.storagePath}
              />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
