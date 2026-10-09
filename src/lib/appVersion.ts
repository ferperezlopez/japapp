// Versión que se muestra en la barra superior, para saber de un vistazo si
// la app abierta es la última. package.json dice "0.1.0" y nunca cambia, así
// que sale de los datos del deploy: Vercel expone VERCEL_GIT_COMMIT_SHA y
// VERCEL_GIT_COMMIT_MESSAGE durante el build, y next.config.ts los reenvía
// al bundle como BUILD_* junto con la hora del build.
//
// El número de PR sale del mensaje del commit de producción — `Merge pull
// request #75 from ...` (merge commit) o `Título (#75)` (squash) — y es el
// mismo número que tiene el link del PR, así que no hay que comparar hashes.

export interface AppVersion {
  label: string;
  title: string;
}

const MERGE_COMMIT = /^Merge pull request #(\d+)\b/;
const SQUASH_COMMIT = /\(#(\d+)\)\s*$/;

const BUILD_TIME_ZONE = "America/Argentina/Buenos_Aires";

function formatBuildTime(builtAt: string | undefined, withYear: boolean): string | null {
  if (!builtAt) return null;
  const date = new Date(builtAt);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("es-AR", {
    day: "numeric",
    month: "short",
    ...(withYear ? { year: "numeric" } : {}),
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: BUILD_TIME_ZONE,
  }).format(date);
}

export function resolveAppVersion({
  sha,
  message,
  builtAt,
  isProduction,
}: {
  sha?: string;
  message?: string;
  builtAt?: string;
  isProduction: boolean;
}): AppVersion {
  const firstLine = (message ?? "").split("\n")[0].trim();
  const pr = firstLine.match(MERGE_COMMIT)?.[1] ?? firstLine.match(SQUASH_COMMIT)?.[1];
  const shortSha = sha ? sha.slice(0, 7) : null;

  // Sin SHA ni PR: en local no hay nada que mostrar ("dev"); en producción
  // cae a la hora del build para que la barra nunca quede vacía (si se ve
  // una fecha en vez de "v76", las variables de Vercel no llegaron al build).
  const label = pr
    ? `v${pr}`
    : (shortSha ?? (isProduction ? (formatBuildTime(builtAt, false) ?? "?") : "dev"));

  // En `next dev` la hora es la de arranque del servidor, no la de un deploy.
  const builtFull = isProduction ? formatBuildTime(builtAt, true) : null;
  const title = [
    `JAPApp ${label}`,
    shortSha ? `commit ${shortSha}` : null,
    builtFull ? `desplegada ${builtFull}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return { label, title };
}

// Valores ya inlineados en el build (ver next.config.ts). Es el único lugar
// que lee process.env.BUILD_*: el Header solo importa este resultado.
export const appVersion = resolveAppVersion({
  sha: process.env.BUILD_COMMIT_SHA,
  message: process.env.BUILD_COMMIT_MESSAGE,
  builtAt: process.env.BUILD_TIME,
  isProduction: process.env.NODE_ENV === "production",
});
