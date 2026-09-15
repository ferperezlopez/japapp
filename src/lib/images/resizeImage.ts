// Redimensiona y comprime una imagen en el browser antes de subirla, para no
// mandar fotos de varios MB directo a Storage — Supabase Free no tiene
// transformación de imágenes del lado del servidor, así que esto tiene que
// pasar en el cliente, antes del upload.
export async function resizeImage(
  file: File,
  { maxDimension, quality }: { maxDimension: number; quality: number },
): Promise<File> {
  // HEIC/HEIF no lo puede decodificar createImageBitmap en la mayoría de
  // browsers todavía — se sube tal cual, sin resize.
  if (file.type === "image/heic" || file.type === "image/heif") return file;

  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return file;
  ctx.drawImage(bitmap, 0, 0, width, height);

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", quality),
  );
  if (!blob) return file;

  const newName = file.name.replace(/\.\w+$/, "") + ".jpg";
  return new File([blob], newName, { type: "image/jpeg" });
}
