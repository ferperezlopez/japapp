// Ubicación (latitud y longitud) de una sede, sacada del campo «dirección» (`venues.address`),
// que acepta una dirección escrita, un link de Google Maps o, ahora, unas coordenadas
// tipeadas. Sirve para pronosticar el clima del lugar donde se hace el evento (spec 024):
// de un link no se puede pronosticar nada, hacen falta coordenadas.
//
// Una dirección escrita («Av. Cabildo 2394, CABA») no se geocodifica: sirve para navegar
// (buildMapsLink la manda a Google Maps), pero no hay coordenadas que sacarle.

export interface Coordinates {
  lat: number;
  lng: number;
}

/** Cómo quedó la ubicación de una sede al guardarla. */
export type VenueLocationStatus = "found" | "missing" | "none";

const NUMBER = String.raw`-?\d{1,3}(?:\.\d+)?`;

// Para armar los patrones sin repetir el número.
const pair = (separator: string) => `(${NUMBER})${separator}(${NUMBER})`;

// De más a menos preciso. `!3d…!4d…` es el punto exacto del lugar; `@lat,lng` es el centro del
// mapa que se está mirando (casi siempre el mismo, pero no siempre).
const PATTERNS: RegExp[] = [
  new RegExp(`!3d(${NUMBER})!4d(${NUMBER})`),
  new RegExp(`/(?:place|search|dir)/${pair(String.raw`,\s*`)}(?:[/?@#]|$)`),
  new RegExp(
    String.raw`[?&](?:q|ll|query|center|destination|daddr|saddr|sll)=${pair(String.raw`(?:[,\s+]|%2[Cc])+`)}`,
  ),
  new RegExp(`@${pair(",")}`),
];

// «-34.6037, -58.3816» tipeado a mano (coma, punto y coma o espacio de separador).
const TYPED_PAIR = new RegExp(`^${pair(String.raw`\s*[,;\s]\s*`)}$`);

function validCoordinates(lat: number, lng: number): Coordinates | null {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  // 0,0 («Null Island») es lo que sale cuando algo falló, no una sede.
  if (lat === 0 && lng === 0) return null;
  const round = (value: number) => Math.round(value * 1e6) / 1e6;
  return { lat: round(lat), lng: round(lng) };
}

function safeDecode(text: string): string {
  try {
    return decodeURIComponent(text);
  } catch {
    return text;
  }
}

/**
 * Las coordenadas que trae el texto, o null. Entiende «lat, lng» tipeado y los links de Google
 * Maps largos (`@lat,lng`, `!3d…!4d…`, `?q=lat,lng`, `/place/lat,lng`...). Un link corto
 * (`maps.app.goo.gl/…`) no las trae: hay que seguirlo (resolveVenueCoordinates).
 */
export function parseCoordinates(text: string): Coordinates | null {
  const trimmed = text.trim();
  if (!trimmed) return null;

  const typed = TYPED_PAIR.exec(trimmed);
  if (typed) return validCoordinates(Number(typed[1]), Number(typed[2]));

  const decoded = safeDecode(trimmed);
  for (const pattern of PATTERNS) {
    const match = pattern.exec(decoded);
    if (!match) continue;
    const found = validCoordinates(Number(match[1]), Number(match[2]));
    if (found) return found;
  }
  return null;
}

// Los únicos hosts a los que el servidor va a pedirle algo. El texto lo escribe una persona
// y el servidor lo pide: sin una lista fija sería un SSRF (pedirle a la red interna, por
// ejemplo). Se compara el host entero, nunca «termina en».
const GOOGLE_HOSTS = new Set([
  "maps.app.goo.gl",
  "goo.gl",
  "www.google.com",
  "google.com",
  "maps.google.com",
  "www.google.com.ar",
  "google.com.ar",
  "maps.google.com.ar",
]);

function allowedGoogleUrl(raw: string, base?: URL): URL | null {
  let url: URL;
  try {
    url = new URL(raw, base);
  } catch {
    return null;
  }
  if (url.protocol !== "https:") return null;
  if (url.username || url.password || url.port) return null;
  return GOOGLE_HOSTS.has(url.hostname) ? url : null;
}

const MAX_BODY_CHARS = 200_000;

/** Los primeros MAX_BODY_CHARS caracteres del cuerpo, sin bajarse el resto de la página. */
async function readCapped(response: Response): Promise<string> {
  const body = response.body;
  if (!body) return (await response.text()).slice(0, MAX_BODY_CHARS);

  const reader = body.getReader();
  const decoder = new TextDecoder();
  let text = "";
  while (text.length < MAX_BODY_CHARS) {
    const { done, value } = await reader.read();
    if (done) break;
    text += decoder.decode(value, { stream: true });
  }
  await reader.cancel().catch(() => {});
  return text.slice(0, MAX_BODY_CHARS);
}

export interface ResolveOptions {
  fetchImpl?: typeof fetch;
  /** Tiempo total para toda la resolución (todas las redirecciones juntas). */
  timeoutMs?: number;
  maxRedirects?: number;
}

/**
 * Las coordenadas de la sede a partir de lo que se cargó en «dirección». Primero lo que se
 * puede leer sin red (coordenadas tipeadas, link largo de Google); si es un link de Google
 * (los cortos que da «Compartir», `maps.app.goo.gl/…`), se siguen las redirecciones a mano,
 * revisando cada salto, hasta ver un link con coordenadas; como último recurso se mira la
 * página final. Nunca tira: sin poder resolverlo devuelve null.
 */
export async function resolveVenueCoordinates(
  address: string | null | undefined,
  { fetchImpl = fetch, timeoutMs = 2500, maxRedirects = 4 }: ResolveOptions = {},
): Promise<Coordinates | null> {
  const text = address?.trim();
  if (!text) return null;

  const direct = parseCoordinates(text);
  if (direct) return direct;

  let url = allowedGoogleUrl(text);
  if (!url) return null;

  try {
    const signal = AbortSignal.timeout(timeoutMs);
    for (let hop = 0; hop <= maxRedirects; hop++) {
      const response = await fetchImpl(url.toString(), {
        redirect: "manual",
        cache: "no-store",
        signal,
        headers: {
          "user-agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
          "accept-language": "es-AR,es;q=0.9",
        },
      });

      const location = response.headers.get("location");
      if (response.status >= 300 && response.status < 400 && location) {
        // Las coordenadas se pueden leer del destino aunque no se vaya a pedir (por ejemplo, la
        // página de consentimiento de Google las lleva dentro de `continue=`).
        const found = parseCoordinates(location);
        if (found) return found;
        const next = allowedGoogleUrl(location, url);
        if (!next) return null;
        url = next;
        continue;
      }

      if (!response.ok) return null;
      // Una página final sin más redirecciones: a veces trae el centro del mapa en el HTML.
      const html = (await readCapped(response)).replaceAll("&amp;", "&");
      return parseCoordinates(html);
    }
    return null;
  } catch {
    return null;
  }
}

/** Qué decirle a quien guarda una sede: encontré la ubicación, no pude leerla del link, o no puso link. */
export function venueLocationStatus(
  address: string | null | undefined,
  coordinates: Coordinates | null,
): VenueLocationStatus {
  if (coordinates) return "found";
  return address?.trim() ? "missing" : "none";
}
