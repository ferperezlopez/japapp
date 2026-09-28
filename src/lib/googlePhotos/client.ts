// Cliente server-only para la Google Photos Library API — nunca importar
// desde código que corra en el browser (el token da acceso a la cuenta
// compartida del grupo). Mismo criterio que src/lib/push/send.ts: si los
// secretos no están configurados, la feature se desactiva sola en vez de
// romper — ver googlePhotosConfigured().
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const API_BASE = "https://photoslibrary.googleapis.com/v1/";

let cachedToken: { accessToken: string; expiresAt: number } | null = null;

export function googlePhotosConfigured() {
  return Boolean(
    process.env.GOOGLE_PHOTOS_CLIENT_ID &&
      process.env.GOOGLE_PHOTOS_CLIENT_SECRET &&
      process.env.GOOGLE_PHOTOS_REFRESH_TOKEN,
  );
}

// Intercambia el refresh token (generado una sola vez a mano con el
// OAuth Playground, ver specs/019-fotos-y-google-photos.md) por un
// access token de corta vida, cacheado en memoria del proceso mientras
// dure (~1h) para no pedir uno nuevo en cada foto.
async function getAccessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) {
    return cachedToken.accessToken;
  }

  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_PHOTOS_CLIENT_ID!,
      client_secret: process.env.GOOGLE_PHOTOS_CLIENT_SECRET!,
      refresh_token: process.env.GOOGLE_PHOTOS_REFRESH_TOKEN!,
      grant_type: "refresh_token",
    }),
  });

  if (!response.ok) {
    throw new Error(`No se pudo refrescar el token de Google Photos: ${response.status}`);
  }

  const data = (await response.json()) as { access_token: string; expires_in: number };
  cachedToken = {
    accessToken: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  };
  return cachedToken.accessToken;
}

export async function googlePhotosFetch(path: string, init: RequestInit = {}) {
  const accessToken = await getAccessToken();
  return fetch(`${API_BASE}${path}`, {
    ...init,
    headers: { ...init.headers, Authorization: `Bearer ${accessToken}` },
  });
}
