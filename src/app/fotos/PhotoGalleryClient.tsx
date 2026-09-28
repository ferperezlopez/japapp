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

// Estilo Google Photos: agrupado por mes, toggle grilla/lista, click abre
// el detalle grande (ImageZoomModal con footer de metadata). Recibe los
// grupos ya armados y ordenados desde el server component — no vuelve a
// pedir datos, ambas vistas usan el mismo array.
export function PhotoGalleryClient({ groups }: { groups: [string, GalleryPhoto[]][] }) {
  const [view, setView] = useState<"grid" | "list">("grid");
  const [openPhoto, setOpenPhoto] = useState<GalleryPhoto | null>(null);

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
                <button
                  key={photo.id}
                  type="button"
                  onClick={() => setOpenPhoto(photo)}
                  className="aspect-square overflow-hidden rounded-lg bg-surface"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element -- fotos de Google Photos / Supabase Storage, no vale next/image para esto */}
                  <img src={photo.thumbUrl} alt="" className="h-full w-full object-cover" />
                </button>
              ))}
            </div>
          ) : (
            <ul className="mt-2 divide-y divide-surface-border">
              {photos.map((photo) => (
                <li key={photo.id}>
                  <button
                    type="button"
                    onClick={() => setOpenPhoto(photo)}
                    className="flex w-full items-center gap-3 py-2 text-left"
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
                </li>
              ))}
            </ul>
          )}
        </section>
      ))}

      {openPhoto && (
        <ImageZoomModal
          src={openPhoto.detailUrl}
          alt={openPhoto.eventName}
          onClose={() => setOpenPhoto(null)}
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
                  Descargar original
                </a>
              )}
            </div>
          }
        />
      )}
    </div>
  );
}
