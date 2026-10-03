// Miniatura de un video: un frame real, no un ícono genérico. Mismo
// espíritu que resizeImage.ts (todo pasa en el browser, Supabase Free no
// tiene transformación de media del lado del servidor). Busca al 10% de
// la duración para evitar el frame negro/en blanco con el que arrancan
// muchos videos de celular.
export async function extractVideoFrame(
  file: File,
  { maxDimension, quality }: { maxDimension: number; quality: number },
): Promise<File> {
  const url = URL.createObjectURL(file);
  try {
    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.src = url;

    await new Promise<void>((resolve, reject) => {
      video.onloadedmetadata = () => resolve();
      video.onerror = () => reject(new Error("No se pudo leer el video."));
    });

    video.currentTime = video.duration * 0.1;
    await new Promise<void>((resolve, reject) => {
      video.onseeked = () => resolve();
      video.onerror = () => reject(new Error("No se pudo leer el video."));
    });

    const scale = Math.min(1, maxDimension / Math.max(video.videoWidth, video.videoHeight));
    const width = Math.round(video.videoWidth * scale);
    const height = Math.round(video.videoHeight * scale);

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("No se pudo generar la miniatura del video.");
    ctx.drawImage(video, 0, 0, width, height);

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", quality),
    );
    if (!blob) throw new Error("No se pudo generar la miniatura del video.");

    const newName = file.name.replace(/\.\w+$/, "") + ".jpg";
    return new File([blob], newName, { type: "image/jpeg" });
  } finally {
    URL.revokeObjectURL(url);
  }
}
