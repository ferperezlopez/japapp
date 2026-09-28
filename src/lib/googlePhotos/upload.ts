import { googlePhotosFetch, googlePhotosConfigured } from "./client";

export type GooglePhotosUploadResult =
  | { mediaItemId: string; takenAt: string | null; width: number | null; height: number | null }
  | { error: string };

// Sube un archivo a Google Photos en los dos pasos que pide la Library
// API: 1) los bytes crudos, que devuelven un "upload token" de un solo
// uso; 2) mediaItems:batchCreate con ese token, que recién ahí crea el
// media item y devuelve su fecha real (EXIF) y dimensiones. Si
// GOOGLE_PHOTOS_ALBUM_ID está configurado, lo agrega a ese álbum para
// que no quede suelto en la biblioteca — es opcional, sin él sube igual
// a la raíz de la biblioteca.
export async function uploadOriginalToGooglePhotos(
  bytes: Buffer,
  mimeType: string,
  filename: string,
): Promise<GooglePhotosUploadResult> {
  if (!googlePhotosConfigured()) {
    return { error: "Google Photos no está configurado." };
  }

  const uploadResponse = await googlePhotosFetch("uploads", {
    method: "POST",
    headers: {
      "Content-Type": "application/octet-stream",
      "X-Goog-Upload-Content-Type": mimeType,
      "X-Goog-Upload-Protocol": "raw",
      "X-Goog-Upload-File-Name": filename,
    },
    // El fetch nativo de Node (undici) acepta un Buffer como body en
    // runtime sin problema — el cast es solo para esquivar un choque de
    // tipos conocido entre Buffer<ArrayBufferLike> (@types/node) y los
    // tipos de BodyInit/BlobPart del lib de DOM, que esperan
    // específicamente ArrayBuffer y no ArrayBufferLike.
    body: bytes as unknown as BodyInit,
  });

  if (!uploadResponse.ok) {
    return { error: `No se pudo subir el archivo a Google Photos: ${uploadResponse.status}` };
  }

  const uploadToken = await uploadResponse.text();
  const albumId = process.env.GOOGLE_PHOTOS_ALBUM_ID;

  const createResponse = await googlePhotosFetch("mediaItems:batchCreate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...(albumId ? { albumId } : {}),
      newMediaItems: [{ simpleMediaItem: { fileName: filename, uploadToken } }],
    }),
  });

  if (!createResponse.ok) {
    return { error: `No se pudo crear el media item en Google Photos: ${createResponse.status}` };
  }

  const data = (await createResponse.json()) as {
    newMediaItemResults: {
      status: { message: string };
      mediaItem?: {
        id: string;
        mediaMetadata?: { creationTime?: string; width?: string; height?: string };
      };
    }[];
  };

  const result = data.newMediaItemResults[0];
  if (!result?.mediaItem) {
    return { error: result?.status?.message ?? "Google Photos no devolvió el media item." };
  }

  const metadata = result.mediaItem.mediaMetadata;
  return {
    mediaItemId: result.mediaItem.id,
    takenAt: metadata?.creationTime ?? null,
    width: metadata?.width ? Number(metadata.width) : null,
    height: metadata?.height ? Number(metadata.height) : null,
  };
}
