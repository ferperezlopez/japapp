import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Datos del build para mostrar la versión en la barra superior (ver
  // src/lib/appVersion.ts). Vercel expone VERCEL_GIT_* durante el build; en
  // local no existen y quedan vacíos. La clave `env` los inlinea en el bundle.
  env: {
    BUILD_COMMIT_SHA: process.env.VERCEL_GIT_COMMIT_SHA ?? "",
    BUILD_COMMIT_MESSAGE: process.env.VERCEL_GIT_COMMIT_MESSAGE ?? "",
    BUILD_TIME: new Date().toISOString(),
  },
};

export default nextConfig;
