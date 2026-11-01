-- Fija el search_path de private.event_closes_at: el aviso
-- "function_search_path_mutable" del linter de seguridad de Supabase que dejó
-- la 0044.
--
-- Es la única de las seis funciones que sumó la 0044 sin `set search_path`: las
-- otras cinco son security definer y ya lo traían. Es una función pura (le suma
-- 24 h a una fecha), no usa ninguna tabla ni función propia, así que no había
-- forma de aprovecharla; se fija igual, con el mismo valor que el resto
-- (`public`), para que el proyecto siga sin avisos de esa categoría.
--
-- Solo cambia un ajuste de la función: mismo resultado, mismas policies, sin
-- tocar datos. Se revierte con
--   alter function private.event_closes_at(timestamptz) reset search_path;
--
-- Ver specs/022-eventos-cerrados.md.

alter function private.event_closes_at(timestamptz) set search_path = public;
