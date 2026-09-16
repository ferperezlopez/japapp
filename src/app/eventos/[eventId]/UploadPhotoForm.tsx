"use client";

import { useState, useTransition } from "react";
import { createClient } from "@/lib/supabase/client";
import { addEventMedia } from "../actions";
import { Spinner } from "@/components/ui/Spinner";
import { resizeImage } from "@/lib/images/resizeImage";
import { withMinDuration } from "@/lib/withMinDuration";

const ALLOWED_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
];
const MAX_SIZE_BYTES = 15 * 1024 * 1024;

export function UploadPhotoForm({ eventId }: { eventId: string }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setError(null);

    if (!ALLOWED_TYPES.includes(file.type)) {
      setError("Solo se aceptan fotos (jpg, png, webp, heic).");
      return;
    }
    if (file.size > MAX_SIZE_BYTES) {
      setError("La foto no puede pesar más de 15MB.");
      return;
    }

    startTransition(async () => {
      await withMinDuration(
        (async () => {
          // Estas fotos alimentan la galería del evento y el carrusel de
          // la landing — bajarlas a 1600px de lado más largo alcanza de
          // sobra para pantalla y corta el peso de fotos de celular de
          // varios MB.
          const resized = await resizeImage(file, { maxDimension: 1600, quality: 0.82 });
          const supabase = createClient();
          const ext = resized.name.split(".").pop() || "jpg";
          const path = `${eventId}/${crypto.randomUUID()}.${ext}`;

          const { error: uploadError } = await supabase.storage
            .from("event-photos")
            .upload(path, resized, { contentType: resized.type });

          if (uploadError) {
            setError("No se pudo subir la foto.");
            return;
          }

          const result = await addEventMedia(eventId, path);
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
        {pending ? "Subiendo..." : "+ Subir foto"}
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
