-- JAPArcade (specs/020-japarcade-gusty-snake.md): puntajes de los minijuegos.
--
-- Una fila por partida terminada (o abandonada con puntaje > 0). El ranking
-- —una sola entrada por usuario, con su mejor puntaje— no se guarda aparte:
-- lo calcula arcade_leaderboard() al leerlo.
--
-- LOS USUARIOS NO PUEDEN ESCRIBIR EN ESTA TABLA, a propósito. La puntuación
-- se valida en el servidor (la server action vuelve a simular la partida con
-- el mismo motor y recalcula el puntaje a partir del replay), y esa
-- validación solo sirve si es la ÚNICA puerta de entrada: con una policy de
-- INSERT para `authenticated`, cualquiera podría mandar un puntaje inventado
-- directo a la API de Supabase con su propia sesión (el mismo tipo de hueco
-- que cerró 0040 en profiles.is_admin). Por eso solo hay policy de SELECT y
-- el servidor inserta con la service role (src/lib/arcade/scores.ts).
create table public.arcade_scores (
  id uuid primary key default gen_random_uuid(),
  -- Id del juego, el mismo que usa el registro en código
  -- (src/lib/arcade/games.ts). Sin check ni tabla de juegos: sumar un juego
  -- no debe requerir una migración, y la server action ya valida el id.
  game_id text not null check (char_length(game_id) between 1 and 40),
  user_id uuid not null references public.profiles (id) on delete cascade,
  score integer not null check (score between 0 and 100000),
  -- Duración de juego efectivo (sin contar pausas), en milisegundos.
  duration_ms integer not null check (duration_ms between 0 and 86400000),
  -- Cantidad de movimientos (ticks) que hizo la serpiente.
  ticks integer not null check (ticks between 0 and 1000000),
  -- Versión de las reglas/dificultad con la que se jugó
  -- (GUSTY_SNAKE_CONFIG.version): un replay solo se puede re-simular con la
  -- misma versión del motor.
  config_version smallint not null check (config_version > 0),
  -- Lo genera el cliente al empezar cada partida: reintentar el guardado
  -- (por ejemplo tras un corte de red) no duplica la fila.
  client_run_id uuid not null,
  -- Semilla + giros de la partida, para poder volver a validarla más
  -- adelante si hiciera falta. Forma: { v, seed, ticks, turns }.
  replay jsonb not null check (jsonb_typeof(replay) = 'object'),
  -- Fin de la partida, con la hora del servidor al recibirla (el reloj del
  -- cliente no es confiable). También es la "fecha de obtención" que
  -- desempata el ranking: a igual puntaje, gana quien llegó primero.
  created_at timestamptz not null default now(),
  unique (user_id, client_run_id)
);

alter table public.arcade_scores enable row level security;

-- Mismo criterio que profiles: cualquier usuario logueado ve a todos (es un
-- grupo cerrado de amigos y el ranking es justamente comparar puntajes).
create policy "Los puntajes son visibles para cualquier usuario logueado"
  on public.arcade_scores for select
  to authenticated
  using (true);

-- Sin policies de INSERT/UPDATE/DELETE (ver arriba). Además se quitan los
-- privilegios de tabla que Supabase concede por defecto, como segunda
-- barrera. service_role no se toca: bypasea RLS y conserva los suyos.
revoke all on public.arcade_scores from anon, authenticated;
grant select on public.arcade_scores to authenticated;

-- "Mejor puntaje de un usuario en un juego" (histórico y semanal).
create index arcade_scores_best_idx
  on public.arcade_scores (game_id, user_id, score desc, created_at);
-- Ventana de la semana actual.
create index arcade_scores_recent_idx
  on public.arcade_scores (game_id, created_at desc);

-- Ranking de un juego: UNA fila por usuario con su mejor puntaje, ordenado
-- por puntaje (mayor primero) y, a igual puntaje, por la fecha en que lo
-- obtuvo (el más antiguo primero).
--
--   p_period = 'weekly' → solo cuentan las partidas de la semana actual:
--                         de lunes 00:00 a domingo, hora de Buenos Aires
--                         (sin horario de verano, UTC-3 todo el año).
--   cualquier otro valor → histórico (todas las partidas).
--
-- security invoker (el valor por defecto): aplican las policies de SELECT de
-- arcade_scores y de profiles, que hoy dejan leer todo a `authenticated`.
create or replace function public.arcade_leaderboard(
  p_game text,
  p_period text default 'all'
)
returns table (
  pos integer,
  user_id uuid,
  name text,
  avatar_url text,
  score integer,
  achieved_at timestamptz
)
language sql
stable
set search_path = public
as $$
  with best as (
    select distinct on (s.user_id) s.user_id, s.score, s.created_at
    from public.arcade_scores s
    where s.game_id = p_game
      and (
        p_period <> 'weekly'
        or s.created_at >= (
          date_trunc('week', now() at time zone 'America/Argentina/Buenos_Aires')
          at time zone 'America/Argentina/Buenos_Aires'
        )
      )
    order by s.user_id, s.score desc, s.created_at asc
  )
  select
    (row_number() over (order by b.score desc, b.created_at asc, b.user_id))::integer as pos,
    b.user_id,
    p.name,
    p.avatar_url,
    b.score,
    b.created_at as achieved_at
  from best b
  join public.profiles p on p.id = b.user_id
  order by pos;
$$;

revoke all on function public.arcade_leaderboard(text, text) from public, anon;
grant execute on function public.arcade_leaderboard(text, text) to authenticated, service_role;
