-- Notificaciones push: quórum de fútbol/juntada y tracking de
-- recordatorios de saldo pendiente post-evento (spec del usuario,
-- 2026-09-18, ver specs/017-push-notifications.md).
--
-- El quórum es un número fijo (8 confirmados, mismo valor para fútbol y
-- juntada — decisión explícita del usuario), no configurable por
-- evento, así que no hace falta ninguna columna para el número en sí.
-- Sí hace falta un flag por evento+tipo para no volver a notificar si el
-- conteo baja y vuelve a cruzar el umbral más adelante — una vez
-- notificado, queda notificado para siempre para ese evento.
alter table public.events
  add column futbol_quorum_notified boolean not null default false,
  add column juntada_quorum_notified boolean not null default false;

-- Un recordatorio de saldo pendiente por (evento, usuario) como máximo.
-- Lo escribe únicamente el cron diario (corre con la service role key,
-- sin sesión de usuario — ver src/app/api/cron/saldo-pendiente/route.ts),
-- así que no depende de RLS para funcionar; se habilita de todos modos
-- por consistencia con el resto de las tablas (sin policies, un usuario
-- autenticado normal no tiene ningún acceso).
create table public.balance_reminders_sent (
  event_id uuid not null references public.events (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  sent_at timestamptz not null default now(),
  primary key (event_id, user_id)
);

alter table public.balance_reminders_sent enable row level security;
