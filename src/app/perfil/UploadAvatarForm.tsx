"use client";

import { useState, useTransition } from "react";
import { createClient } from "@/lib/supabase/client";
import { ZoomableAvatar } from "@/components/ui/ZoomableAvatar";
import { Spinner } from "@/components/ui/Spinner";
import { resizeImage } from "@/lib/images/resizeImage";
import { withMinDuration } from "@/lib/withMinDuration";
import { updateAvatar } from "./actions";

const ALLOWED_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
];
const MAX_SIZE_BYTES = 5 * 1024 * 1024;

export function UploadAvatarForm({
  userId,
  name,
  avatarUrl,
}: {
  userId: string;
  name: string | null;
  avatarUrl: string | null;
}) {
  const [preview, setPreview] = useState(avatarUrl);
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
      setError("La foto no puede pesar más de 5MB.");
      return;
    }

    startTransition(async () => {
      await withMinDuration(
        (async () => {
          // Un avatar nunca se muestra a más de 64px en la app — bajarlo a
          // 320px de lado evita mandar fotos de varios MB por una imagen
          // que termina chiquita, sin resignar nitidez.
          const resized = await resizeImage(file, { maxDimension: 320, quality: 0.82 });

          const supabase = createClient();
          // Path fijo por usuario (sin extensión) + upsert: reemplazar el
          // avatar nunca deja archivos huérfanos en el bucket.
          const path = `${userId}/avatar`;

          const { error: uploadError } = await supabase.storage
            .from("avatars")
            .upload(path, resized, { contentType: resized.type, upsert: true });

          if (uploadError) {
            setError("No se pudo subir la foto.");
            return;
          }

          const {
            data: { publicUrl },
          } = supabase.storage.from("avatars").getPublicUrl(path);
          // Query param de versión: el path es siempre el mismo, así que
          // sin esto el navegador podría seguir mostrando la imagen vieja
          // cacheada.
          const versionedUrl = `${publicUrl}?v=${Date.now()}`;

          const result = await updateAvatar(versionedUrl);
          if (result.error) setError(result.error);
          else setPreview(versionedUrl);
        })(),
      );
    });
  };

  return (
    <div className="flex items-center gap-4">
      <ZoomableAvatar src={preview} name={name} size="lg" />
      <div>
        <label
          className={`inline-flex cursor-pointer items-center gap-2 rounded-lg border border-surface-border px-4 py-2 text-sm font-medium text-foreground/70 transition-colors duration-200 hover:bg-surface ${
            pending ? "pointer-events-none opacity-60" : ""
          }`}
        >
          {pending && <Spinner />}
          {pending ? "Subiendo..." : "Cambiar foto"}
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
    </div>
  );
}
