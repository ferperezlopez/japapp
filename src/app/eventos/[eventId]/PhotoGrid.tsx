import Link from "next/link";
import { DeletePhotoButton } from "./DeletePhotoButton";

interface Photo {
  id: string;
  storagePath: string;
  url: string | null;
  uploadedBy: string;
  mediaType: "photo" | "video";
}

function PlayIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="h-6 w-6 drop-shadow" aria-hidden="true">
      <path d="M8 5.14v13.72a1 1 0 0 0 1.5.86l11-6.86a1 1 0 0 0 0-1.72l-11-6.86A1 1 0 0 0 8 5.14Z" />
    </svg>
  );
}

// Mosaico tipo galería editorial: una foto "grande" cada 5, una "ancha"
// cada 5, el resto en tiles parejos. grid-flow-row-dense acomoda el resto
// alrededor sin dejar huecos.
const SPAN_PATTERN = ["col-span-2 row-span-2", "", "", "col-span-2", ""];

function spanFor(index: number) {
  return SPAN_PATTERN[index % SPAN_PATTERN.length];
}

export function PhotoGrid({
  eventId,
  photos,
  currentUserId,
  eventCreatorId,
  isAdmin,
}: {
  eventId: string;
  photos: Photo[];
  currentUserId: string | undefined;
  eventCreatorId: string;
  isAdmin: boolean;
}) {
  if (photos.length === 0) {
    return <p className="text-sm text-foreground/50">Todavía no hay fotos.</p>;
  }

  return (
    <div className="grid grid-flow-row-dense grid-cols-3 auto-rows-[5.5rem] gap-2 pt-2 sm:auto-rows-[6.5rem]">
      {photos.map((photo, index) => (
        <div
          key={photo.id}
          className={`animate-reveal group relative overflow-hidden rounded-lg border border-surface-border bg-surface ${spanFor(index)}`}
          style={{ animationDelay: `${index * 40}ms` }}
        >
          {/* Lleva a la galería completa (/fotos), que ya tiene su propio
              visor con zoom, flechas y descarga — no hace falta un
              segundo lightbox acá para una sola foto. */}
          <Link href={`/fotos?event=${eventId}`} className="block h-full w-full">
            {photo.url ? (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element -- fotos de usuario via URL firmada de Supabase Storage, no vale el pipeline de next/image para esto */}
                <img src={photo.url} alt="" className="h-full w-full object-cover" />
                {photo.mediaType === "video" && (
                  <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-white">
                    <PlayIcon />
                  </span>
                )}
              </>
            ) : (
              <div className="flex h-full w-full items-center justify-center text-xs text-foreground/40">
                Sin vista previa
              </div>
            )}
          </Link>
          {(photo.uploadedBy === currentUserId ||
            eventCreatorId === currentUserId ||
            isAdmin) && (
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
