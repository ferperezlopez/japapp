"use client";

import { useState, useTransition } from "react";
import { createClient } from "@/lib/supabase/client";
import { addEventMedia } from "../actions";
import { Spinner } from "@/components/ui/Spinner";
import { resizeImage } from "@/lib/images/resizeImage";
import { extractVideoFrame } from "@/lib/images/extractVideoFrame";
import { uploadFileWithProgress } from "@/lib/supabase/uploadWithProgress";
import { withMinDuration } from "@/lib/withMinDuration";

const ALLOWED_IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
];
const ALLOWED_VIDEO_TYPES = ["video/mp4", "video/quicktime", "video/webm"];
const ALLOWED_TYPES = [...ALLOWED_IMAGE_TYPES, ...ALLOWED_VIDEO_TYPES];
// El original (sin comprimir) va a un bucket de tránsito de hasta 45MB
// (ver 0036_event_media_google_photos.sql) antes de guardarse en tamaño
// completo en Google Photos — margen amplio sobre una foto de celular, y
// el mismo tope que se decidió aceptar para video (sin chunked upload).
const MAX_SIZE_BYTES = 45 * 1024 * 1024;

export function UploadPhotoForm({ eventId }: { eventId: string }) {
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [pending, startTransition] = useTransition();

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setError(null);

    if (!ALLOWED_TYPES.includes(file.type)) {
      setError("Solo se aceptan fotos o videos.");
      return;
    }
    if (file.size > MAX_SIZE_BYTES) {
      setError("El archivo no puede pesar más de 45MB.");
      return;
    }
    const isVideo = ALLOWED_VIDEO_TYPES.includes(file.type);

    startTransition(async () => {
      await withMinDuration(
        (async () => {
          const supabase = createClient();
          const uuid = crypto.randomUUID();

          // Preview: alimenta la galería del evento y el carrusel de la
          // landing sin depender de Google Photos. Para una foto, bajarla
          // a 1600px de lado más largo alcanza de sobra para pantalla.
          // Para un video, el "preview" es un frame real extraído del
          // propio archivo (no hay nada que resamplear).
          const resized = isVideo
            ? await extractVideoFrame(file, { maxDimension: 1600, quality: 0.82 })
            : await resizeImage(file, { maxDimension: 1600, quality: 0.82 });
          const previewExt = resized.name.split(".").pop() || "jpg";
          const previewPath = `${eventId}/${uuid}.${previewExt}`;

          const { error: previewError } = await supabase.storage
            .from("event-photos")
            .upload(previewPath, resized, { contentType: resized.type });

          if (previewError) {
            setError(isVideo ? "No se pudo subir el video." : "No se pudo subir la foto.");
            return;
          }

          // Original sin tocar: va a un bucket de tránsito, el servidor
          // lo toma de ahí para guardarlo en tamaño completo en Google
          // Photos (ver specs/019-fotos-y-google-photos.md). Si esto
          // falla, no bloquea nada — el preview ya quedó guardado.
          const originalExt = file.name.split(".").pop() || previewExt;
          const originalPath = `${eventId}/${uuid}-original.${originalExt}`;
          setProgress(0);
          const { error: originalError } = await uploadFileWithProgress(
            supabase,
            "event-photos-originals",
            originalPath,
            file,
            setProgress,
          );
          setProgress(null);

          const result = await addEventMedia(
            eventId,
            previewPath,
            originalError ? undefined : originalPath,
            isVideo ? "video" : "photo",
          );
          if (result.error) setError(result.error);
        })(),
      );
    });
  };

  return (
    <div>
      <label
        className={`inline-flex cursor-pointer items-center gap-2 rounded-lg bg-eventos px-4 py-2 text-sm font-medium text-white transition-colors duration-200 hover:bg-eventos-hover ${
          pending ? "pointer-events-none opacity-60" : ""
        }`}
      >
        {pending && <Spinner />}
        {pending
          ? progress !== null
            ? `Subiendo... ${progress}%`
            : "Subiendo..."
          : "+ Subir foto o video"}
        <input
          type="file"
          accept={ALLOWED_TYPES.join(",")}
          onChange={handleChange}
          disabled={pending}
          className="hidden"
        />
      </label>
      {error && (
        <p className="mt-2 text-sm text-red-600 dark:text-red-400">{error}</p>
      )}
    </div>
  );
}
