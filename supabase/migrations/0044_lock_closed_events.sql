-- Eventos cerrados y saldados: solo lectura (salvo para los admins).
--
-- Hasta ahora cualquier logueado podía volver a un evento viejo y cambiar la
-- asistencia, los invitados, las tareas, los equipos o el resultado, y también
-- cargar o borrar gastos y pagos, que reabre cuentas ya saldadas. Todas las
-- policies eran permisivas ("Cualquier logueado puede..."): no existía la
-- noción de "evento terminado".
--
-- Un evento tiene tres estados, siempre calculados (no hay columna ni botón):
--   open     no pasaron 24 h desde su fecha y hora. Todo como hasta ahora.
--   closed   pasaron 24 h. La historia (datos del evento, asistencia,
--            invitados, tareas y equipos) queda solo para admins. El resultado
--            del partido y la plata siguen abiertos hasta que se salde.
--   settled  closed + hay gastos cargados + a nadie le queda saldo (el mismo
--            criterio de "Para saldar cuentas", src/lib/gastos/balances.ts).
--            También el resultado, los gastos, los pagos y los miembros del
--            grupo de gastos quedan solo para admins.
-- Las fotos no se tocan: subir recuerdos tarde es lo normal.
--
-- Cómo se aplica: policies RESTRICTIVE (se combinan con AND con las permisivas
-- que ya había), una por comando para no tocar SELECT, y un admin
-- (public.is_admin) pasa siempre. Una RLS que filtra un UPDATE o un DELETE no
-- da error, deja 0 filas: las acciones de la app lo avisan antes de escribir
-- (src/lib/eventos/lock.ts) y la pantalla esconde lo que no se puede.
--
-- Es un estado derivado: si un admin carga un gasto o borra un pago en un
-- evento saldado, vuelve a "closed" y se puede volver a registrar pagos hasta
-- saldar de nuevo.
--
-- Ver specs/022-eventos-cerrados.md. Sin cambios de datos; se revierte
-- borrando las policies "Evento cerrado..." / "Evento saldado..." y las cuatro
-- "Un admin puede ..." de la sección 6.

-- 1) Cuándo cierra un evento -------------------------------------------------
-- Único lugar donde vive el "24 h".
create or replace function private.event_closes_at(p_event_date timestamptz)
returns timestamptz
language sql
stable
as $$
  select p_event_date + interval '24 hours';
$$;

-- 2) Estados -------------------------------------------------------------------
-- security definer + search_path fijo, mismo patrón que private.is_group_member:
-- se consultan desde policies de otras tablas sin depender de su RLS.
create or replace function private.event_is_closed(p_event_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(
    (select now() >= private.event_closes_at(e.event_date)
       from public.events e
      where e.id = p_event_id),
    false
  );
$$;

-- Saldado = el evento enlazado ya cerró, hay al menos un gasto con partes
-- repartidas y nadie queda con saldo. El saldo sale igual que en
-- calcularBalances: quien pagó suma cada parte repartida, a cada uno le resta
-- la suya, y un pago registrado le suma a quien pagó y le resta a quien cobró;
-- pendiente = |saldo redondeado a 2 decimales| > 0,01.
--
-- Pedir "un gasto con partes" evita una trampa: al cargar el primer gasto de
-- un grupo sin gastos, las partes se insertan DESPUÉS del gasto; con el gasto
-- solo (saldos en 0) el grupo no debe verse saldado y trabar esa inserción.
create or replace function private.group_is_settled(p_group_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select
    exists (select 1 from public.events e where e.group_id = p_group_id)
    and not exists (
      select 1 from public.events e
       where e.group_id = p_group_id
         and now() < private.event_closes_at(e.event_date)
    )
    and exists (
      select 1
        from public.expenses x
        join public.expense_shares s on s.expense_id = x.id
       where x.group_id = p_group_id
    )
    and not exists (
      select 1
        from (
          select x.paid_by as user_id, s.share_amount as delta
            from public.expenses x
            join public.expense_shares s on s.expense_id = x.id
           where x.group_id = p_group_id
          union all
          select s.user_id, -s.share_amount
            from public.expenses x
            join public.expense_shares s on s.expense_id = x.id
           where x.group_id = p_group_id
          union all
          select p.from_user_id, p.amount
            from public.debt_payments p
           where p.group_id = p_group_id
          union all
          select p.to_user_id, -p.amount
            from public.debt_payments p
           where p.group_id = p_group_id
        ) m
       group by m.user_id
      having abs(round(sum(m.delta), 2)) > 0.01
    );
$$;

create or replace function private.event_is_settled(p_event_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(
    (select e.group_id is not null and private.group_is_settled(e.group_id)
       from public.events e
      where e.id = p_event_id),
    false
  );
$$;

create or replace function private.expense_group_is_settled(p_expense_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(
    (select private.group_is_settled(x.group_id)
       from public.expenses x
      where x.id = p_expense_id),
    false
  );
$$;

-- Las policies las llaman con el rol authenticated: EXECUTE sí, USAGE sobre el
-- schema no hace falta (se resuelven por OID, como private.is_group_member).
revoke all on function private.event_closes_at(timestamptz) from public, anon;
revoke all on function private.event_is_closed(uuid) from public, anon;
revoke all on function private.group_is_settled(uuid) from public, anon;
revoke all on function private.event_is_settled(uuid) from public, anon;
revoke all on function private.expense_group_is_settled(uuid) from public, anon;
grant execute on function private.event_closes_at(timestamptz) to authenticated;
grant execute on function private.event_is_closed(uuid) to authenticated;
grant execute on function private.group_is_settled(uuid) to authenticated;
grant execute on function private.event_is_settled(uuid) to authenticated;
grant execute on function private.expense_group_is_settled(uuid) to authenticated;

-- 3) Lo que consulta la app ---------------------------------------------------
-- El estado y si quien consulta es admin, en un solo viaje. La app nunca lo
-- recalcula: muestra y avisa lo mismo que la base hace cumplir.
create or replace function public.event_lock_state(p_event_id uuid)
returns table (state text, is_admin boolean)
language sql
security definer
set search_path = public
stable
as $$
  select
    case
      when private.event_is_settled(e.id) then 'settled'
      when private.event_is_closed(e.id) then 'closed'
      else 'open'
    end,
    public.is_admin(auth.uid())
  from public.events e
  where e.id = p_event_id;
$$;

revoke all on function public.event_lock_state(uuid) from public, anon;
grant execute on function public.event_lock_state(uuid) to authenticated;

-- 4) Cerrado (24 h): la historia del evento -----------------------------------
-- events: se mira la propia fila (no un lookup por id) para que el with check
-- también mire la fecha nueva: no se puede "cerrar" un evento tocándole la fecha.
create policy "Evento cerrado: solo un admin lo edita"
  on public.events as restrictive for update
  to authenticated
  using (now() < private.event_closes_at(event_date) or public.is_admin(auth.uid()))
  with check (now() < private.event_closes_at(event_date) or public.is_admin(auth.uid()));

-- Borrar sigue siendo solo de quien lo creó (0002): cerrado, además tiene que
-- ser admin. El admin no gana permiso de borrar eventos ajenos (0043).
create policy "Evento cerrado: solo un admin lo borra"
  on public.events as restrictive for delete
  to authenticated
  using (now() < private.event_closes_at(event_date) or public.is_admin(auth.uid()));

create policy "Evento cerrado: asistencia solo de un admin (alta)"
  on public.event_rsvps as restrictive for insert
  to authenticated
  with check (not private.event_is_closed(event_id) or public.is_admin(auth.uid()));

create policy "Evento cerrado: asistencia solo de un admin (cambio)"
  on public.event_rsvps as restrictive for update
  to authenticated
  using (not private.event_is_closed(event_id) or public.is_admin(auth.uid()))
  with check (not private.event_is_closed(event_id) or public.is_admin(auth.uid()));

create policy "Evento cerrado: asistencia solo de un admin (baja)"
  on public.event_rsvps as restrictive for delete
  to authenticated
  using (not private.event_is_closed(event_id) or public.is_admin(auth.uid()));

create policy "Evento cerrado: invitados solo de un admin (alta)"
  on public.event_guests as restrictive for insert
  to authenticated
  with check (not private.event_is_closed(event_id) or public.is_admin(auth.uid()));

create policy "Evento cerrado: invitados solo de un admin (baja)"
  on public.event_guests as restrictive for delete
  to authenticated
  using (not private.event_is_closed(event_id) or public.is_admin(auth.uid()));

create policy "Evento cerrado: tareas solo de un admin (alta)"
  on public.event_tasks as restrictive for insert
  to authenticated
  with check (not private.event_is_closed(event_id) or public.is_admin(auth.uid()));

create policy "Evento cerrado: tareas solo de un admin (baja)"
  on public.event_tasks as restrictive for delete
  to authenticated
  using (not private.event_is_closed(event_id) or public.is_admin(auth.uid()));

create policy "Evento cerrado: equipos solo de un admin (alta)"
  on public.futbol_teams as restrictive for insert
  to authenticated
  with check (not private.event_is_closed(event_id) or public.is_admin(auth.uid()));

create policy "Evento cerrado: equipos solo de un admin (baja)"
  on public.futbol_teams as restrictive for delete
  to authenticated
  using (not private.event_is_closed(event_id) or public.is_admin(auth.uid()));

-- 5) Saldado: el resultado y la plata -----------------------------------------
create policy "Evento saldado: resultado solo de un admin (alta)"
  on public.futbol_stats as restrictive for insert
  to authenticated
  with check (not private.event_is_settled(event_id) or public.is_admin(auth.uid()));

create policy "Evento saldado: resultado solo de un admin (cambio)"
  on public.futbol_stats as restrictive for update
  to authenticated
  using (not private.event_is_settled(event_id) or public.is_admin(auth.uid()))
  with check (not private.event_is_settled(event_id) or public.is_admin(auth.uid()));

create policy "Evento saldado: gastos solo de un admin (alta)"
  on public.expenses as restrictive for insert
  to authenticated
  with check (not private.group_is_settled(group_id) or public.is_admin(auth.uid()));

create policy "Evento saldado: gastos solo de un admin (baja)"
  on public.expenses as restrictive for delete
  to authenticated
  using (not private.group_is_settled(group_id) or public.is_admin(auth.uid()));

create policy "Evento saldado: partes de gastos solo de un admin"
  on public.expense_shares as restrictive for insert
  to authenticated
  with check (not private.expense_group_is_settled(expense_id) or public.is_admin(auth.uid()));

create policy "Evento saldado: pagos solo de un admin (alta)"
  on public.debt_payments as restrictive for insert
  to authenticated
  with check (not private.group_is_settled(group_id) or public.is_admin(auth.uid()));

create policy "Evento saldado: pagos solo de un admin (baja)"
  on public.debt_payments as restrictive for delete
  to authenticated
  using (not private.group_is_settled(group_id) or public.is_admin(auth.uid()));

create policy "Evento saldado: miembros solo de un admin (alta)"
  on public.group_members as restrictive for insert
  to authenticated
  with check (not private.group_is_settled(group_id) or public.is_admin(auth.uid()));

create policy "Evento saldado: miembros solo de un admin (baja)"
  on public.group_members as restrictive for delete
  to authenticated
  using (not private.group_is_settled(group_id) or public.is_admin(auth.uid()));

-- 6) El admin puede corregir la plata -----------------------------------------
-- Aditivas (en Postgres las permisivas del mismo comando se combinan con OR),
-- mismo patrón que 0025 (invitados), 0037 (fotos) y 0043 (eventos). Sin esto
-- un gasto o un pago mal cargado por otra persona no lo podría corregir ni un
-- admin: hoy solo lo borra quien lo cargó, y cargar exige ser miembro del grupo.
create policy "Un admin puede cargar un gasto en cualquier grupo"
  on public.expenses for insert
  to authenticated
  with check (public.is_admin(auth.uid()) and created_by = auth.uid());

create policy "Un admin puede borrar cualquier gasto"
  on public.expenses for delete
  to authenticated
  using (public.is_admin(auth.uid()));

create policy "Un admin puede registrar un pago en cualquier grupo"
  on public.debt_payments for insert
  to authenticated
  with check (public.is_admin(auth.uid()) and reported_by = auth.uid());

create policy "Un admin puede borrar cualquier pago"
  on public.debt_payments for delete
  to authenticated
  using (public.is_admin(auth.uid()));
