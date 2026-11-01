-- Menú del evento: qué se come (Asado, Empanadas, Pizza...), opcional.
--
-- Hasta ahora el menú no existía como dato: solo había insumos asignados y gastos,
-- que sugieren qué se comió pero no lo dicen. Con el menú guardado en el evento, al
-- crear uno nuevo la app puede sugerir qué hacer según lo que se hizo antes y hace
-- cuánto (src/lib/eventos/menu.ts). Es texto libre: la app ofrece una lista corta
-- (Asado, Empanadas, Pizza, Pastas, Hamburguesas) pero acepta cualquier otro, y
-- normaliza mayúsculas, tildes y espacios al compararlos.
--
-- No cambia ninguna policy: el menú se edita como el resto de los datos del evento
-- (quien lo creó o un admin; cerrado, solo un admin; 0043 y 0044).
--
-- Ver specs/025-menu-del-evento.md. Se revierte con
--   alter table public.events drop column menu;

alter table public.events
  add column menu text
  constraint events_menu_length check (menu is null or char_length(btrim(menu)) between 1 and 40);
