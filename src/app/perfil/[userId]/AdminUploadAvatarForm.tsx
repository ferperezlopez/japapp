"use client";

import { useState, useTransition } from "react";
import { createClient } from "@/lib/supabase/client";
import { ZoomableAvatar } from "@/components/ui/ZoomableAvatar";
import { Spinner } from "@/components/ui/Spinner";
import { resizeImage } from "@/lib/images/resizeImage";
import { withMinDuration } from "@/lib/withMinDuration";
import { adminUpdateAvatar } from "../actions";

const ALLOWED_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
];
const MAX_SIZE_BYTES = 5 * 1024 * 1024;

// Calcado de UploadAvatarForm.tsx, pero para que un admin suba/reemplace
// la foto de OTRA persona: sube al path `${targetUserId}/avatar` (no el
// propio) — la policy RLS "Un admin puede subir avatar de cualquiera"
// (0023_admin_role.sql) es la que permite esto, ya que la subida corre con
// la sesión real del admin (no requiere "actuar como").
export function AdminUploadAvatarForm({
  targetUserId,
  name,
  avatarUrl,
}: {
  targetUserId: string;
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
          const resized = await resizeImage(file, { maxDimension: 320, quality: 0.82 });

          const supabase = createClient();
          const path = `${targetUserId}/avatar`;

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
          const versionedUrl = `${publicUrl}?v=${Date.now()}`;

          const result = await adminUpdateAvatar(targetUserId, versionedUrl);
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
          {pending ? "Subiendo..." : "Cambiar foto (admin)"}
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
