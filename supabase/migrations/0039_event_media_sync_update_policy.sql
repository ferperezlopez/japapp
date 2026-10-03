-- Fix de un bug de pérdida de datos: `event_media` tiene RLS activado
-- desde 0004 pero nunca tuvo una policy de UPDATE. La sincronización con
-- Google Photos (src/lib/googlePhotos/sync.ts), cuando corre con el
-- cliente de la sesión del usuario (el caso inline, justo después de
-- subir — a diferencia del cron, que usa el cliente service-role), hacía
-- un `update` que Postgres aceptaba sin error pero afectaba 0 filas (RLS
-- sin policy deniega por default). El código interpretaba "sin error"
-- como éxito y borraba el archivo original de todos modos — perdiéndolo
-- para siempre, sin haber quedado nunca enlazado a Google Photos.
--
-- Mismo criterio de ownership que ya usa la policy de INSERT.
create policy "El uploader actualiza el estado de sync de su propia foto"
  on public.event_media for update
  to authenticated
  using (uploaded_by = auth.uid())
  with check (uploaded_by = auth.uid());
