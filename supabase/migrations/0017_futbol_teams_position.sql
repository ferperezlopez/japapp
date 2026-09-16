-- Reemplaza el toggle "es arquero" (booleano) por una posición fija de
-- cancha por jugador: arquero, defensor o delantero. Pedido del usuario
-- tras ver el primer diseño de "armar equipos": la cancha pasa a ser
-- vertical con formación (arquero, defensores, delanteros), no un
-- arquero destacado dentro de una lista libre por equipo.
alter table public.futbol_teams add column position text;
update public.futbol_teams
  set position = case when is_goalkeeper then 'gk' else 'def' end;
alter table public.futbol_teams alter column position set not null;
alter table public.futbol_teams
  add constraint futbol_teams_position_check check (position in ('gk', 'def', 'fwd'));
alter table public.futbol_teams drop column is_goalkeeper;
