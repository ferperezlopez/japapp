-- JAPapp: un evento puede tener fútbol ademas de la juntada. Es el mismo
-- evento (misma fecha/lugar/gastos), pero con una lista de confirmacion
-- separada para "quien juega al futbol" ademas de "quien va a la juntada".
--
-- Ver specs/006-evento-futbol.md para el detalle completo.

alter table public.events
  add column has_futbol boolean not null default false;

-- "kind" separa las dos listas de confirmacion de un mismo evento sin
-- duplicar la tabla: juntada (la de siempre) y futbol (opcional, solo
-- relevante si events.has_futbol = true). Default 'juntada' para que las
-- filas existentes sigan representando lo que ya representaban.
alter table public.event_rsvps
  add column kind text not null default 'juntada' check (kind in ('juntada', 'futbol'));

alter table public.event_rsvps drop constraint event_rsvps_pkey;
alter table public.event_rsvps add primary key (event_id, user_id, kind);

-- Confirmar "voy" al futbol no debe sumar a nadie al grupo de gastos: eso
-- lo sigue disparando unicamente la confirmacion de la juntada.
drop trigger if exists on_rsvp_upsert on public.event_rsvps;
create trigger on_rsvp_upsert
  after insert or update on public.event_rsvps
  for each row
  when (new.status = 'yes' and new.kind = 'juntada')
  execute function private.handle_rsvp_yes();
