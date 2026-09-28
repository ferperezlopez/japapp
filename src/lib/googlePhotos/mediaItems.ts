import { googlePhotosFetch, googlePhotosConfigured } from "./client";

// Las `baseUrl` que devuelve Google expiran ~1h — nunca se persisten en
// la base, se piden de nuevo cada vez que hace falta mostrar o descargar
// una foto (galería /fotos, detalle de evento). batchGet acepta hasta 50
// ids por llamada. Se les puede agregar un sufijo al armar el <img src>:
// "=w500-h500-c" (thumbnail recortado), "=w2000" (detalle grande) o "=d"
// (descarga del original real, servida directo desde Google).
export async function getBaseUrls(mediaItemIds: string[]): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  if (!googlePhotosConfigured() || mediaItemIds.length === 0) return result;

  for (let i = 0; i < mediaItemIds.length; i += 50) {
    const chunk = mediaItemIds.slice(i, i + 50);
    const params = new URLSearchParams();
    for (const id of chunk) params.append("mediaItemIds", id);

    const response = await googlePhotosFetch(`mediaItems:batchGet?${params.toString()}`);
    if (!response.ok) continue;

    const data = (await response.json()) as {
      mediaItemResults: { mediaItem?: { id: string; baseUrl: string } }[];
    };
    for (const item of data.mediaItemResults) {
      if (item.mediaItem) result.set(item.mediaItem.id, item.mediaItem.baseUrl);
    }
  }

  return result;
}
