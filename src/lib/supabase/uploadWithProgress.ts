import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

// supabase-js (storage-js) manda sus uploads con fetch nativo — sin
// onUploadProgress, sin XHR, sin soporte de TUS/resumable (confirmado
// leyendo node_modules/@supabase/storage-js/dist/index.mjs). No hay forma
// de obtener un porcentaje real con `.upload()`. Esta función replica el
// mismo mecanismo que usa internamente `uploadToSignedUrl` (misma forma
// de request: PUT a la signed URL con un FormData de un campo
// `cacheControl` + el archivo bajo field name ""), pero a mano con
// XMLHttpRequest para poder engancharse a `xhr.upload.onprogress`.
export async function uploadFileWithProgress(
  supabase: SupabaseClient<Database>,
  bucket: string,
  path: string,
  file: File,
  onProgress: (percent: number) => void,
): Promise<{ error?: string }> {
  const { data: signed, error: signError } = await supabase.storage
    .from(bucket)
    .createSignedUploadUrl(path);
  if (signError || !signed) {
    return { error: signError?.message ?? "No se pudo preparar la subida." };
  }

  const {
    data: { session },
  } = await supabase.auth.getSession();

  const body = new FormData();
  body.append("cacheControl", "3600");
  body.append("", file);

  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", signed.signedUrl);
    xhr.setRequestHeader("apikey", process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
    if (session?.access_token) {
      xhr.setRequestHeader("Authorization", `Bearer ${session.access_token}`);
    }
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        onProgress(Math.round((event.loaded / event.total) * 100));
      }
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve({});
      else resolve({ error: `No se pudo subir el archivo (${xhr.status}).` });
    };
    xhr.onerror = () => resolve({ error: "No se pudo subir el archivo." });
    xhr.send(body);
  });
}
