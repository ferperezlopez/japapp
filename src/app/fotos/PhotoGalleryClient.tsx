"use client";

import { useState } from "react";
import { ImageZoomModal } from "@/components/ui/ImageZoomModal";

export type GalleryPhoto = {
  id: string;
  eventName: string;
  takenAt: string;
  uploadedByName: string;
  thumbUrl: string;
  detailUrl: string;
  downloadUrl: string | null;
};

const detailDateFormatter = new Intl.DateTimeFormat("es-AR", {
  day: "numeric",
  month: "long",
  year: "numeric",
});

function GridIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} className="h-4 w-4" aria-hidden="true">
      <rect x="3.5" y="3.5" width="7" height="7" rx="1.25" />
      <rect x="13.5" y="3.5" width="7" height="7" rx="1.25" />
      <rect x="3.5" y="13.5" width="7" height="7" rx="1.25" />
      <rect x="13.5" y="13.5" width="7" height="7" rx="1.25" />
    </svg>
  );
}

function ListIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} className="h-4 w-4" aria-hidden="true">
      <path strokeLinecap="round" d="M8 6h12M8 12h12M8 18h12" />
      <path strokeLinecap="round" d="M4 6h.01M4 12h.01M4 18h.01" />
    </svg>
  );
}

function DownloadIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} className="h-3.5 w-3.5" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v10m0 0 3.5-3.5M12 14l-3.5-3.5M5 16.5V18a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-1.5" />
    </svg>
  );
}

// Estilo Google Photos: agrupado por mes, toggle grilla/lista, click abre
// el detalle grande (ImageZoomModal con footer de metadata). Recibe los
// grupos ya armados y ordenados desde el server component — no vuelve a
// pedir datos, ambas vistas usan el mismo array.
export function PhotoGalleryClient({ groups }: { groups: [string, GalleryPhoto[]][] }) {
  const [view, setView] = useState<"grid" | "list">("grid");
  // Índice sobre el array aplanado (no por grupo) — así ← → recorren
  // todas las fotos en orden cronológico sin importar el límite de mes,
  // igual que en Google Photos. Los grupos ya vienen en orden, así que
  // aplanarlos preserva el orden general.
  const flatPhotos = groups.flatMap(([, photos]) => photos);
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const openPhoto = openIndex !== null ? flatPhotos[openIndex] : null;

  return (
    <div>
      <div className="flex justify-end gap-1">
        <button
          type="button"
          onClick={() => setView("grid")}
          aria-pressed={view === "grid"}
          aria-label="Ver en grilla"
          className={`rounded-lg p-2 transition-colors duration-200 ${
            view === "grid" ? "bg-eventos-soft text-eventos" : "text-foreground/40 hover:bg-surface"
          }`}
        >
          <GridIcon />
        </button>
        <button
          type="button"
          onClick={() => setView("list")}
          aria-pressed={view === "list"}
          aria-label="Ver en lista"
          className={`rounded-lg p-2 transition-colors duration-200 ${
            view === "list" ? "bg-eventos-soft text-eventos" : "text-foreground/40 hover:bg-surface"
          }`}
        >
          <ListIcon />
        </button>
      </div>

      {groups.length === 0 && (
        <p className="mt-6 text-sm text-foreground/50">Todavía no hay fotos.</p>
      )}

      {groups.map(([monthLabel, photos]) => (
        <section key={monthLabel} className="mt-6">
          <h2 className="text-sm font-medium capitalize text-foreground/70">{monthLabel}</h2>
          {view === "grid" ? (
            <div className="mt-2 grid grid-cols-3 gap-1.5 sm:grid-cols-4">
              {photos.map((photo) => (
                <div
                  key={photo.id}
                  className="relative aspect-square overflow-hidden rounded-lg bg-surface"
                >
                  <button
                    type="button"
                    onClick={() => setOpenIndex(flatPhotos.indexOf(photo))}
                    className="block h-full w-full"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element -- fotos de Google Photos / Supabase Storage, no vale next/image para esto */}
                    <img src={photo.thumbUrl} alt="" className="h-full w-full object-cover" />
                  </button>
                  {photo.downloadUrl && (
                    <a
                      href={photo.downloadUrl}
                      download
                      onClick={(event) => event.stopPropagation()}
                      aria-label="Descargar"
                      className="absolute bottom-1 right-1 rounded-full bg-black/60 p-1.5 text-white transition-colors duration-200 hover:bg-black/80"
                    >
                      <DownloadIcon />
                    </a>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <ul className="mt-2 divide-y divide-surface-border">
              {photos.map((photo) => (
                <li key={photo.id} className="flex items-center gap-3 py-2">
                  <button
                    type="button"
                    onClick={() => setOpenIndex(flatPhotos.indexOf(photo))}
                    className="flex min-w-0 flex-1 items-center gap-3 text-left"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element -- ídem */}
                    <img
                      src={photo.thumbUrl}
                      alt=""
                      className="h-14 w-14 shrink-0 rounded-lg object-cover"
                    />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-foreground">
                        {photo.eventName}
                      </p>
                      <p className="text-xs text-foreground/50">
                        {detailDateFormatter.format(new Date(photo.takenAt))} ·{" "}
                        {photo.uploadedByName}
                      </p>
                    </div>
                  </button>
                  {photo.downloadUrl && (
                    <a
                      href={photo.downloadUrl}
                      download
                      aria-label="Descargar"
                      className="shrink-0 rounded-full p-2 text-foreground/40 transition-colors duration-200 hover:bg-surface hover:text-foreground"
                    >
                      <DownloadIcon />
                    </a>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      ))}

      {openPhoto && openIndex !== null && (
        <ImageZoomModal
          src={openPhoto.detailUrl}
          alt={openPhoto.eventName}
          onClose={() => setOpenIndex(null)}
          onPrev={openIndex > 0 ? () => setOpenIndex(openIndex - 1) : undefined}
          onNext={
            openIndex < flatPhotos.length - 1 ? () => setOpenIndex(openIndex + 1) : undefined
          }
          footer={
            <div className="max-w-full rounded-lg bg-black/60 px-4 py-2 text-center text-sm text-white">
              <p className="font-medium">{openPhoto.eventName}</p>
              <p className="text-xs text-white/70">
                {detailDateFormatter.format(new Date(openPhoto.takenAt))} ·{" "}
                {openPhoto.uploadedByName}
              </p>
              {openPhoto.downloadUrl && (
                <a
                  href={openPhoto.downloadUrl}
                  download
                  onClick={(event) => event.stopPropagation()}
                  className="mt-1 inline-block text-xs font-medium underline"
                >
                  Descargar
                </a>
              )}
            </div>
          }
        />
      )}
    </div>
  );
}
