-- Revierte 0018_remove_event_futbol.sql: el usuario decidió que alcanza
-- con destildar "¿Hay fútbol además de la juntada?" desde "Editar evento"
-- (solo el creador) — el botón abierto a cualquiera que se sumó en el
-- PR #33 sobra. Como 0018 ya está aplicada al proyecto real, esto se
-- revierte con una migración nueva en vez de editarla.
revoke execute on function public.remove_event_futbol(uuid) from authenticated;
drop function public.remove_event_futbol(uuid);
