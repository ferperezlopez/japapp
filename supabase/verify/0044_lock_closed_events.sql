-- Verificación de la migración 0044 (eventos cerrados y saldados, specs/022-eventos-cerrados.md)
-- contra una base que YA la tiene aplicada. Pegar entero en el SQL editor de Supabase y ejecutar.
--
-- No deja nada: es un solo bloque DO que arma eventos, gastos y pagos de prueba, simula a cada
-- persona (`set local role authenticated` + el JWT de cada una) y termina SIEMPRE con un
-- `raise exception` cuyo mensaje es el informe. El error «=== N verificaciones, 0 con FALLA ===»
-- que muestra el editor es lo esperado, y justamente por ese error se deshace todo.
--
-- Cada línea del informe empieza con OK o FALLA.
--   A: el estado que calcula la base (los cuatro eventos reales y casos de borde armados).
--   B: con el evento abierto, un miembro común sigue haciendo todo lo de siempre.
--   C: con el evento cerrado (pasaron 24 h), la historia se traba y la plata sigue abierta.
--   D: con el evento saldado, también el resultado y la plata; las fotos siguen abiertas.
--   E: un admin puede todo, incluido corregir la plata de otra persona.
--
-- Los ids de personas y de eventos son de ESTA base (Fercho es el admin; Mati L, Javi y Bozzo son
-- miembros comunes; los eventos van del 18/9 al 30/10) y las líneas A1 a A4 dicen el estado de
-- esos eventos al 1/11/2026: si cambiaron los datos, esas cuatro pueden cambiar sin que sea un error.
-- El editor puede pedir confirmación por los DELETE que tiene el script: es normal.
do $verify$
declare
  v_rep text[] := '{}';
  v_fail int;
  v_guest uuid;
  c_admin constant uuid := '9840e373-0124-40ea-8a5d-89e5ba5b9d73';
  c_matil constant uuid := 'c12485a6-48df-4b32-8ab2-437e173fb309';
  c_javi  constant uuid := '704d9d64-defd-499e-b769-1c2fa0c0d720';
  c_bozzo constant uuid := 'f1db3ce1-16fd-411e-9ead-32b93764f520';
  c_ev_0918 constant uuid := '415f2baf-75a3-46af-9600-056ca1b7a5ba';
  c_ev_1002 constant uuid := 'c9ffb580-bf89-4baa-aa1a-9070bc4fdedb';
  c_ev_1016 constant uuid := '4418bd78-3f18-40d9-ae3c-8eabf53541b4';
  c_ev_1030 constant uuid := 'c91c81de-ae33-49aa-ad58-ca9dac4e18a5';
  x_new constant uuid := gen_random_uuid();
  e_open uuid; g_open uuid; e_eopen uuid; g_eopen uuid; e_eclose uuid; g_eclose uuid;
  e_noexp uuid; g_noexp uuid; e_pend uuid; g_pend uuid; e_sett uuid; g_sett uuid;
  e_r001 uuid; g_r001 uuid; e_r002 uuid; g_r002 uuid; e_reopen uuid; g_reopen uuid; e_adm uuid;
  x_pend uuid; x_sett uuid; p_sett uuid; p_reopen uuid;
begin
  -- ===================== ayudantes (viven en pg_temp: se van con el rollback) =====================
  create function pg_temp.line(p_name text, p_got text, p_exp text) returns text language sql as $f$
    select case when p_got like p_exp then 'OK    ' else 'FALLA ' end || p_name || ' -> ' || coalesce(p_got, 'null')
      || case when p_got like p_exp then '' else '   (esperaba ' || p_exp || ')' end;
  $f$;

  -- Ejecuta las sentencias como `authenticated` con el JWT de p_uid, en un sub-bloque que SIEMPRE se deshace.
  -- Devuelve 'ok:<filas de la última>' o 'err:<sqlstate>:<mensaje>'.
  create function pg_temp.attempt(p_uid uuid, p_sqls text[]) returns text language plpgsql as $f$
  declare v_sql text; v_n bigint := 0;
  begin
    begin
      perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
      perform set_config('request.jwt.claim.sub', p_uid::text, true);
      set local role authenticated;
      foreach v_sql in array p_sqls loop
        execute v_sql;
        get diagnostics v_n = row_count;
      end loop;
      raise exception using errcode = 'P0001', message = 'ATTEMPT_DONE';
    exception
      when sqlstate 'P0001' then
        if sqlerrm = 'ATTEMPT_DONE' then return 'ok:' || v_n; end if;
        return 'err:P0001:' || left(sqlerrm, 90);
      when others then
        return 'err:' || sqlstate || ':' || left(sqlerrm, 90);
    end;
  end $f$;

  -- Igual, pero para una consulta de un solo valor, con el rol que se pida (authenticated / anon).
  create function pg_temp.ask(p_uid uuid, p_role text, p_sql text) returns text language plpgsql as $f$
  declare v_out text;
  begin
    begin
      perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', p_role)::text, true);
      perform set_config('request.jwt.claim.sub', coalesce(p_uid::text, ''), true);
      execute format('set local role %I', p_role);
      execute p_sql into v_out;
      raise exception using errcode = 'P0001', message = 'ASK_DONE';
    exception
      when sqlstate 'P0001' then
        if sqlerrm = 'ASK_DONE' then return 'val:' || coalesce(v_out, 'null'); end if;
        return 'err:P0001:' || left(sqlerrm, 90);
      when others then
        return 'err:' || sqlstate || ':' || left(sqlerrm, 90);
    end;
  end $f$;

  create function pg_temp.mk_event(p_name text, p_date timestamptz, p_creator uuid) returns uuid language plpgsql as $f$
  declare v_id uuid;
  begin
    insert into public.events (name, event_date, created_by, has_futbol) values (p_name, p_date, p_creator, true) returning id into v_id;
    return v_id;
  end $f$;

  create function pg_temp.grp(p_event uuid) returns uuid language sql as $f$
    select group_id from public.events where id = p_event;
  $f$;

  -- Un gasto de p_amount pagado por p_payer, repartido en partes iguales entre p_a y p_b.
  create function pg_temp.mk_expense(p_group uuid, p_payer uuid, p_creator uuid, p_amount numeric, p_a uuid, p_b uuid) returns uuid language plpgsql as $f$
  declare v_id uuid;
  begin
    insert into public.expenses (group_id, description, amount, paid_by, created_by)
      values (p_group, 'T gasto', p_amount, p_payer, p_creator) returning id into v_id;
    insert into public.expense_shares (expense_id, user_id, share_amount)
      values (v_id, p_a, p_amount / 2), (v_id, p_b, p_amount / 2);
    return v_id;
  end $f$;

  create function pg_temp.mk_payment(p_group uuid, p_from uuid, p_to uuid, p_amount numeric, p_reporter uuid) returns uuid language plpgsql as $f$
  declare v_id uuid;
  begin
    insert into public.debt_payments (group_id, from_user_id, to_user_id, amount, reported_by)
      values (p_group, p_from, p_to, p_amount, p_reporter) returning id into v_id;
    return v_id;
  end $f$;

  -- ===================== datos de prueba (como postgres, sin RLS) =====================
  e_open   := pg_temp.mk_event('T abierto',        now() + interval '2 days',                  c_javi); g_open   := pg_temp.grp(e_open);
  e_eopen  := pg_temp.mk_event('T borde abierto',  now() - interval '23 hours 59 minutes',     c_javi); g_eopen  := pg_temp.grp(e_eopen);
  e_eclose := pg_temp.mk_event('T borde cerrado',  now() - interval '24 hours',                c_javi); g_eclose := pg_temp.grp(e_eclose);
  e_noexp  := pg_temp.mk_event('T cerrado sin gastos', now() - interval '3 days',              c_javi); g_noexp  := pg_temp.grp(e_noexp);
  e_pend   := pg_temp.mk_event('T cerrado con deuda',  now() - interval '3 days',              c_javi); g_pend   := pg_temp.grp(e_pend);
  e_sett   := pg_temp.mk_event('T saldado',        now() - interval '3 days',                  c_javi); g_sett   := pg_temp.grp(e_sett);
  e_r001   := pg_temp.mk_event('T residuo 0,01',   now() - interval '3 days',                  c_javi); g_r001   := pg_temp.grp(e_r001);
  e_r002   := pg_temp.mk_event('T residuo 0,02',   now() - interval '3 days',                  c_javi); g_r002   := pg_temp.grp(e_r002);
  e_reopen := pg_temp.mk_event('T se reabre',      now() - interval '3 days',                  c_javi); g_reopen := pg_temp.grp(e_reopen);
  e_adm    := pg_temp.mk_event('T cerrado del admin', now() - interval '3 days',               c_admin);

  insert into public.group_members (group_id, user_id)
    select g, u from (values (g_open), (g_eopen), (g_eclose), (g_noexp), (g_pend), (g_sett)) as t(g), (values (c_matil)) as m(u)
    on conflict do nothing;

  -- cerrado con deuda: Javi pagó 100, partes 50/50 con Mati L, sin pagos
  x_pend := pg_temp.mk_expense(g_pend, c_javi, c_javi, 100, c_javi, c_matil);
  -- saldado: gasto cargado por Mati L (pagó Javi) + pago de Mati L que lo salda
  x_sett := pg_temp.mk_expense(g_sett, c_javi, c_matil, 100, c_javi, c_matil);
  p_sett := pg_temp.mk_payment(g_sett, c_matil, c_javi, 50, c_matil);
  -- residuos
  perform pg_temp.mk_expense(g_r001, c_javi, c_javi, 100, c_javi, c_matil); perform pg_temp.mk_payment(g_r001, c_matil, c_javi, 49.99, c_matil);
  perform pg_temp.mk_expense(g_r002, c_javi, c_javi, 100, c_javi, c_matil); perform pg_temp.mk_payment(g_r002, c_matil, c_javi, 49.98, c_matil);
  -- se reabre: saldado y después se borra el pago
  perform pg_temp.mk_expense(g_reopen, c_javi, c_javi, 100, c_javi, c_matil);
  p_reopen := pg_temp.mk_payment(g_reopen, c_matil, c_javi, 50, c_javi);

  -- invitado, tarea, equipo, asistencia y resultado ya cargados en cerrado y saldado (para probar bajas y cambios)
  insert into public.guests (name, created_by) values ('T invitado', c_matil) returning id into v_guest;
  insert into public.event_guests (event_id, guest_id, kind, added_by, brought_by) values
    (e_pend, v_guest, 'juntada', c_matil, c_matil), (e_sett, v_guest, 'juntada', c_matil, c_matil);
  insert into public.event_tasks (event_id, task_type, assigned_to, updated_by) values
    (e_pend, 'orden_sede', c_matil, c_matil), (e_sett, 'orden_sede', c_matil, c_matil);
  insert into public.futbol_teams (event_id, user_id, team, position, updated_by) values
    (e_pend, c_matil, 1, 'gk', c_matil), (e_sett, c_matil, 1, 'gk', c_matil);
  insert into public.event_rsvps (event_id, user_id, status, kind) values
    (e_pend, c_matil, 'yes', 'juntada'), (e_sett, c_matil, 'yes', 'juntada');
  insert into public.futbol_stats (event_id, resultado, updated_by) values (e_sett, '1-0', c_matil);

  -- ===================== A) estados =====================
  v_rep := v_rep || pg_temp.line('A1  real 18/9 (al 1/11: saldado)',  (select state from public.event_lock_state(c_ev_0918)), 'settled');
  v_rep := v_rep || pg_temp.line('A2  real 2/10 (al 1/11: saldado)',  (select state from public.event_lock_state(c_ev_1002)), 'settled');
  v_rep := v_rep || pg_temp.line('A3  real 16/10 (al 1/11: saldado)', (select state from public.event_lock_state(c_ev_1016)), 'settled');
  v_rep := v_rep || pg_temp.line('A4  real 30/10 (al 1/11: cerrado, con saldos pendientes)', (select state from public.event_lock_state(c_ev_1030)), 'closed');
  v_rep := v_rep || pg_temp.line('A5  futuro',               (select state from public.event_lock_state(e_open)),   'open');
  v_rep := v_rep || pg_temp.line('A6  hace 23 h 59 min',     (select state from public.event_lock_state(e_eopen)),  'open');
  v_rep := v_rep || pg_temp.line('A7  hace 24 h justas',     (select state from public.event_lock_state(e_eclose)), 'closed');
  v_rep := v_rep || pg_temp.line('A8  cerrado sin gastos',   (select state from public.event_lock_state(e_noexp)),  'closed');
  v_rep := v_rep || pg_temp.line('A9  cerrado con deuda',    (select state from public.event_lock_state(e_pend)),   'closed');
  v_rep := v_rep || pg_temp.line('A10 saldo exacto 0',       (select state from public.event_lock_state(e_sett)),   'settled');
  v_rep := v_rep || pg_temp.line('A11 residuo 0,01',         (select state from public.event_lock_state(e_r001)),   'settled');
  v_rep := v_rep || pg_temp.line('A12 residuo 0,02',         (select state from public.event_lock_state(e_r002)),   'closed');
  v_rep := v_rep || pg_temp.line('A13 saldado antes de borrar el pago', (select state from public.event_lock_state(e_reopen)), 'settled');
  delete from public.debt_payments where id = p_reopen;
  v_rep := v_rep || pg_temp.line('A14 se reabre al borrar el pago',     (select state from public.event_lock_state(e_reopen)), 'closed');
  v_rep := v_rep || pg_temp.line('A15 RPC como miembro: is_admin',      pg_temp.ask(c_matil, 'authenticated', format('select is_admin from public.event_lock_state(%L)', e_sett)), 'val:false');
  v_rep := v_rep || pg_temp.line('A16 RPC como admin: is_admin',        pg_temp.ask(c_admin, 'authenticated', format('select is_admin from public.event_lock_state(%L)', e_sett)), 'val:true');
  v_rep := v_rep || pg_temp.line('A17 RPC como miembro: state',         pg_temp.ask(c_matil, 'authenticated', format('select state from public.event_lock_state(%L)', e_sett)), 'val:settled');
  v_rep := v_rep || pg_temp.line('A18 RPC como anon: sin permiso',      pg_temp.ask(null, 'anon', format('select state from public.event_lock_state(%L)', e_sett)), 'err:42501%');
  v_rep := v_rep || pg_temp.line('A19 RPC de un evento que no existe',  pg_temp.ask(c_matil, 'authenticated', format('select count(*) from public.event_lock_state(%L)', gen_random_uuid())), 'val:0');

  -- ===================== B) evento ABIERTO, como Mati L (miembro, no admin, no creadora) =====================
  v_rep := v_rep || pg_temp.line('B1  abierto: asistencia (upsert)', pg_temp.attempt(c_matil, array[format('insert into public.event_rsvps (event_id, user_id, status, kind) values (%L, %L, %L, %L) on conflict (event_id, user_id, kind) do update set status = excluded.status', e_open, c_matil, 'yes', 'juntada')]), 'ok:1');
  v_rep := v_rep || pg_temp.line('B2  abierto: sumar invitado',     pg_temp.attempt(c_matil, array[format('insert into public.event_guests (event_id, guest_id, kind, added_by, brought_by) values (%L, %L, %L, %L, %L)', e_open, v_guest, 'juntada', c_matil, c_matil)]), 'ok:1');
  v_rep := v_rep || pg_temp.line('B3  abierto: asignar tarea',      pg_temp.attempt(c_matil, array[format('insert into public.event_tasks (event_id, task_type, assigned_to, updated_by) values (%L, %L, %L, %L)', e_open, 'orden_sede', c_matil, c_matil)]), 'ok:1');
  v_rep := v_rep || pg_temp.line('B4  abierto: armar equipos',      pg_temp.attempt(c_matil, array[format('insert into public.futbol_teams (event_id, user_id, team, position, updated_by) values (%L, %L, 1, %L, %L)', e_open, c_matil, 'gk', c_matil)]), 'ok:1');
  v_rep := v_rep || pg_temp.line('B5  abierto: resultado',          pg_temp.attempt(c_matil, array[format('insert into public.futbol_stats (event_id, resultado, updated_by) values (%L, %L, %L)', e_open, '3-2', c_matil)]), 'ok:1');
  v_rep := v_rep || pg_temp.line('B6  abierto: gasto + partes',     pg_temp.attempt(c_matil, array[format('insert into public.expenses (id, group_id, description, amount, paid_by, created_by) values (%L, %L, %L, 10, %L, %L)', x_new, g_open, 'hielo', c_matil, c_matil), format('insert into public.expense_shares (expense_id, user_id, share_amount) values (%L, %L, 10)', x_new, c_matil)]), 'ok:1');
  v_rep := v_rep || pg_temp.line('B7  abierto: registrar pago',     pg_temp.attempt(c_matil, array[format('insert into public.debt_payments (group_id, from_user_id, to_user_id, amount, reported_by) values (%L, %L, %L, 5, %L)', g_open, c_matil, c_javi, c_matil)]), 'ok:1');
  v_rep := v_rep || pg_temp.line('B8  abierto: alguien se suma al grupo', pg_temp.attempt(c_bozzo, array[format('insert into public.group_members (group_id, user_id) values (%L, %L)', g_open, c_bozzo)]), 'ok:1');
  v_rep := v_rep || pg_temp.line('B9  abierto: editar evento ajeno (como hoy: 0 filas)', pg_temp.attempt(c_matil, array[format('update public.events set description = %L where id = %L', 'x', e_open)]), 'ok:0');
  v_rep := v_rep || pg_temp.line('B10 abierto: editar evento propio (creador)', pg_temp.attempt(c_javi, array[format('update public.events set description = %L where id = %L', 'x', e_open)]), 'ok:1');
  v_rep := v_rep || pg_temp.line('B11 abierto: subir foto',          pg_temp.attempt(c_matil, array[format('insert into public.event_media (event_id, uploaded_by, storage_path) values (%L, %L, %L)', e_open, c_matil, 'x/y.jpg')]), 'ok:1');
  v_rep := v_rep || pg_temp.line('B12 abierto: invitado nuevo al catálogo', pg_temp.attempt(c_matil, array[format('insert into public.guests (name, created_by) values (%L, %L)', 'T otro', c_matil)]), 'ok:1');

  -- ===================== C) CERRADO con deuda: la historia se traba, la plata sigue =====================
  v_rep := v_rep || pg_temp.line('C1  cerrado: asistencia nueva (upsert)', pg_temp.attempt(c_bozzo, array[format('insert into public.event_rsvps (event_id, user_id, status, kind) values (%L, %L, %L, %L) on conflict (event_id, user_id, kind) do update set status = excluded.status', e_pend, c_bozzo, 'yes', 'juntada')]), 'err:42501%');
  v_rep := v_rep || pg_temp.line('C2  cerrado: cambiar asistencia propia', pg_temp.attempt(c_matil, array[format('update public.event_rsvps set status = %L where event_id = %L and user_id = %L', 'no', e_pend, c_matil)]), 'ok:0');
  v_rep := v_rep || pg_temp.line('C3  cerrado: borrar asistencia propia',  pg_temp.attempt(c_matil, array[format('delete from public.event_rsvps where event_id = %L and user_id = %L', e_pend, c_matil)]), 'ok:0');
  v_rep := v_rep || pg_temp.line('C4  cerrado: sumar invitado',            pg_temp.attempt(c_matil, array[format('insert into public.event_guests (event_id, guest_id, kind, added_by, brought_by) values (%L, %L, %L, %L, %L)', e_pend, v_guest, 'futbol', c_matil, c_matil)]), 'err:42501%');
  v_rep := v_rep || pg_temp.line('C5  cerrado: sacar invitado propio',     pg_temp.attempt(c_matil, array[format('delete from public.event_guests where event_id = %L and guest_id = %L', e_pend, v_guest)]), 'ok:0');
  v_rep := v_rep || pg_temp.line('C6  cerrado: asignar tarea',             pg_temp.attempt(c_matil, array[format('insert into public.event_tasks (event_id, task_type, assigned_to, updated_by) values (%L, %L, %L, %L)', e_pend, 'lavado_platos', c_matil, c_matil)]), 'err:42501%');
  v_rep := v_rep || pg_temp.line('C7  cerrado: sacar tarea',               pg_temp.attempt(c_matil, array[format('delete from public.event_tasks where event_id = %L', e_pend)]), 'ok:0');
  v_rep := v_rep || pg_temp.line('C8  cerrado: armar equipos',             pg_temp.attempt(c_matil, array[format('insert into public.futbol_teams (event_id, user_id, team, position, updated_by) values (%L, %L, 2, %L, %L)', e_pend, c_bozzo, 'def', c_matil)]), 'err:42501%');
  v_rep := v_rep || pg_temp.line('C9  cerrado: borrar equipos',            pg_temp.attempt(c_matil, array[format('delete from public.futbol_teams where event_id = %L', e_pend)]), 'ok:0');
  v_rep := v_rep || pg_temp.line('C10 cerrado: editar el evento (creador)', pg_temp.attempt(c_javi, array[format('update public.events set description = %L where id = %L', 'x', e_pend)]), 'ok:0');
  v_rep := v_rep || pg_temp.line('C11 cerrado: borrar el evento (creador)', pg_temp.attempt(c_javi, array[format('delete from public.events where id = %L', e_pend)]), 'ok:0');
  v_rep := v_rep || pg_temp.line('C12 cerrado: el creador no lo reabre cambiando la fecha', pg_temp.attempt(c_javi, array[format('update public.events set event_date = now() + interval %L where id = %L', '5 days', e_pend)]), 'ok:0');
  v_rep := v_rep || pg_temp.line('C13 abierto: el creador no lo cierra poniendo una fecha vieja', pg_temp.attempt(c_javi, array[format('update public.events set event_date = now() - interval %L where id = %L', '5 days', e_open)]), 'err:42501%');
  v_rep := v_rep || pg_temp.line('C14 cerrado con deuda: cargar resultado (sigue abierto)', pg_temp.attempt(c_matil, array[format('insert into public.futbol_stats (event_id, resultado, updated_by) values (%L, %L, %L)', e_pend, '2-2', c_matil)]), 'ok:1');
  v_rep := v_rep || pg_temp.line('C15 cerrado con deuda: gasto + partes (sigue abierto)', pg_temp.attempt(c_matil, array[format('insert into public.expenses (id, group_id, description, amount, paid_by, created_by) values (%L, %L, %L, 20, %L, %L)', x_new, g_pend, 'pan', c_matil, c_matil), format('insert into public.expense_shares (expense_id, user_id, share_amount) values (%L, %L, 10), (%L, %L, 10)', x_new, c_matil, x_new, c_javi)]), 'ok:2');
  v_rep := v_rep || pg_temp.line('C16 cerrado con deuda: registrar pago (sigue abierto)', pg_temp.attempt(c_matil, array[format('insert into public.debt_payments (group_id, from_user_id, to_user_id, amount, reported_by) values (%L, %L, %L, 10, %L)', g_pend, c_matil, c_javi, c_matil)]), 'ok:1');
  v_rep := v_rep || pg_temp.line('C17 cerrado con deuda: subir foto',     pg_temp.attempt(c_matil, array[format('insert into public.event_media (event_id, uploaded_by, storage_path) values (%L, %L, %L)', e_pend, c_matil, 'x/z.jpg')]), 'ok:1');
  v_rep := v_rep || pg_temp.line('C18 borde: a las 23 h 59 min todavía se puede opinar', pg_temp.attempt(c_matil, array[format('insert into public.event_rsvps (event_id, user_id, status, kind) values (%L, %L, %L, %L)', e_eopen, c_matil, 'yes', 'juntada')]), 'ok:1');
  v_rep := v_rep || pg_temp.line('C19 borde: a las 24 h justas ya no',     pg_temp.attempt(c_matil, array[format('insert into public.event_rsvps (event_id, user_id, status, kind) values (%L, %L, %L, %L)', e_eclose, c_matil, 'yes', 'juntada')]), 'err:42501%');
  v_rep := v_rep || pg_temp.line('C20 cerrado SIN gastos: el primer gasto (gasto + partes) pasa', pg_temp.attempt(c_matil, array[format('insert into public.expenses (id, group_id, description, amount, paid_by, created_by) values (%L, %L, %L, 30, %L, %L)', x_new, g_noexp, 'carne', c_matil, c_matil), format('insert into public.expense_shares (expense_id, user_id, share_amount) values (%L, %L, 15), (%L, %L, 15)', x_new, c_matil, x_new, c_javi)]), 'ok:2');

  -- ===================== D) SALDADO, como Mati L =====================
  v_rep := v_rep || pg_temp.line('D1  saldado: cargar resultado nuevo',    pg_temp.attempt(c_matil, array[format('insert into public.futbol_stats (event_id, resultado, updated_by) values (%L, %L, %L) on conflict (event_id) do update set resultado = excluded.resultado', e_sett, '9-9', c_matil)]), 'err:42501%');
  v_rep := v_rep || pg_temp.line('D2  saldado: corregir resultado',        pg_temp.attempt(c_matil, array[format('update public.futbol_stats set resultado = %L, updated_by = %L where event_id = %L', '9-9', c_matil, e_sett)]), 'ok:0');
  v_rep := v_rep || pg_temp.line('D3  saldado: cargar gasto',              pg_temp.attempt(c_matil, array[format('insert into public.expenses (id, group_id, description, amount, paid_by, created_by) values (%L, %L, %L, 10, %L, %L)', x_new, g_sett, 'extra', c_matil, c_matil)]), 'err:42501%');
  v_rep := v_rep || pg_temp.line('D4  saldado: sumar partes a un gasto existente', pg_temp.attempt(c_matil, array[format('insert into public.expense_shares (expense_id, user_id, share_amount) values (%L, %L, 1)', x_sett, c_bozzo)]), 'err:42501%');
  v_rep := v_rep || pg_temp.line('D5  saldado: registrar pago',            pg_temp.attempt(c_matil, array[format('insert into public.debt_payments (group_id, from_user_id, to_user_id, amount, reported_by) values (%L, %L, %L, 1, %L)', g_sett, c_matil, c_javi, c_matil)]), 'err:42501%');
  v_rep := v_rep || pg_temp.line('D6  saldado: borrar su gasto',           pg_temp.attempt(c_matil, array[format('delete from public.expenses where id = %L', x_sett)]), 'ok:0');
  v_rep := v_rep || pg_temp.line('D7  saldado: borrar su pago',            pg_temp.attempt(c_matil, array[format('delete from public.debt_payments where id = %L', p_sett)]), 'ok:0');
  v_rep := v_rep || pg_temp.line('D8  saldado: sumarse al grupo',          pg_temp.attempt(c_bozzo, array[format('insert into public.group_members (group_id, user_id) values (%L, %L)', g_sett, c_bozzo)]), 'err:42501%');
  v_rep := v_rep || pg_temp.line('D9  saldado: salirse del grupo',         pg_temp.attempt(c_matil, array[format('delete from public.group_members where group_id = %L and user_id = %L', g_sett, c_matil)]), 'ok:0');
  v_rep := v_rep || pg_temp.line('D10 saldado: subir foto (siempre abierto)', pg_temp.attempt(c_matil, array[format('insert into public.event_media (event_id, uploaded_by, storage_path) values (%L, %L, %L)', e_sett, c_matil, 'x/w.jpg')]), 'ok:1');
  v_rep := v_rep || pg_temp.line('D11 saldado: asistencia',                pg_temp.attempt(c_matil, array[format('update public.event_rsvps set status = %L where event_id = %L and user_id = %L', 'no', e_sett, c_matil)]), 'ok:0');
  v_rep := v_rep || pg_temp.line('D12 saldado: invitado',                  pg_temp.attempt(c_matil, array[format('delete from public.event_guests where event_id = %L', e_sett)]), 'ok:0');
  v_rep := v_rep || pg_temp.line('D13 saldado: tarea',                     pg_temp.attempt(c_matil, array[format('delete from public.event_tasks where event_id = %L', e_sett)]), 'ok:0');
  v_rep := v_rep || pg_temp.line('D14 saldado: equipos',                   pg_temp.attempt(c_matil, array[format('delete from public.futbol_teams where event_id = %L', e_sett)]), 'ok:0');

  -- ===================== E) ADMIN (Fercho) =====================
  v_rep := v_rep || pg_temp.line('E1  admin, saldado: asistencia de otra persona', pg_temp.attempt(c_admin, array[format('insert into public.event_rsvps (event_id, user_id, status, kind) values (%L, %L, %L, %L)', e_sett, c_bozzo, 'yes', 'juntada')]), 'ok:1');
  v_rep := v_rep || pg_temp.line('E2  admin, saldado: sumar invitado',     pg_temp.attempt(c_admin, array[format('insert into public.event_guests (event_id, guest_id, kind, added_by, brought_by) values (%L, %L, %L, %L, %L)', e_sett, v_guest, 'futbol', c_admin, c_admin)]), 'ok:1');
  v_rep := v_rep || pg_temp.line('E3  admin, saldado: asignar tarea',      pg_temp.attempt(c_admin, array[format('insert into public.event_tasks (event_id, task_type, assigned_to, updated_by) values (%L, %L, %L, %L)', e_sett, 'lavado_platos', c_bozzo, c_admin)]), 'ok:1');
  v_rep := v_rep || pg_temp.line('E4  admin, saldado: sacar tarea ajena',  pg_temp.attempt(c_admin, array[format('delete from public.event_tasks where event_id = %L', e_sett)]), 'ok:1');
  v_rep := v_rep || pg_temp.line('E5  admin, saldado: armar equipos',      pg_temp.attempt(c_admin, array[format('insert into public.futbol_teams (event_id, user_id, team, position, updated_by) values (%L, %L, 2, %L, %L)', e_sett, c_bozzo, 'def', c_admin)]), 'ok:1');
  v_rep := v_rep || pg_temp.line('E6  admin, saldado: corregir resultado', pg_temp.attempt(c_admin, array[format('update public.futbol_stats set resultado = %L, updated_by = %L where event_id = %L', '2-1', c_admin, e_sett)]), 'ok:1');
  v_rep := v_rep || pg_temp.line('E7  admin, saldado: gasto + partes sin ser miembro', pg_temp.attempt(c_admin, array[format('insert into public.expenses (id, group_id, description, amount, paid_by, created_by) values (%L, %L, %L, 10, %L, %L)', x_new, g_sett, 'ajuste', c_admin, c_admin), format('insert into public.expense_shares (expense_id, user_id, share_amount) values (%L, %L, 5), (%L, %L, 5)', x_new, c_admin, x_new, c_matil)]), 'ok:2');
  v_rep := v_rep || pg_temp.line('E8  admin, saldado: registrar pago sin ser miembro', pg_temp.attempt(c_admin, array[format('insert into public.debt_payments (group_id, from_user_id, to_user_id, amount, reported_by) values (%L, %L, %L, 1, %L)', g_sett, c_matil, c_javi, c_admin)]), 'ok:1');
  v_rep := v_rep || pg_temp.line('E9  admin, saldado: borrar un gasto ajeno', pg_temp.attempt(c_admin, array[format('delete from public.expenses where id = %L', x_sett)]), 'ok:1');
  v_rep := v_rep || pg_temp.line('E10 admin, saldado: borrar un pago ajeno',  pg_temp.attempt(c_admin, array[format('delete from public.debt_payments where id = %L', p_sett)]), 'ok:1');
  v_rep := v_rep || pg_temp.line('E11 admin, saldado: editar el evento ajeno', pg_temp.attempt(c_admin, array[format('update public.events set description = %L where id = %L', 'x', e_sett)]), 'ok:1');
  v_rep := v_rep || pg_temp.line('E12 admin, saldado: NO puede borrar el evento ajeno (como en 0043)', pg_temp.attempt(c_admin, array[format('delete from public.events where id = %L', e_sett)]), 'ok:0');
  v_rep := v_rep || pg_temp.line('E13 admin, cerrado: SÍ puede borrar el evento que creó', pg_temp.attempt(c_admin, array[format('delete from public.events where id = %L', e_adm)]), 'ok:1');
  v_rep := v_rep || pg_temp.line('E14 admin, cerrado con deuda: borrar un gasto ajeno', pg_temp.attempt(c_admin, array[format('delete from public.expenses where id = %L', x_pend)]), 'ok:1');
  v_rep := v_rep || pg_temp.line('E15 miembro común sigue SIN poder borrar el gasto de otra persona', pg_temp.attempt(c_matil, array[format('delete from public.expenses where id = %L', x_pend)]), 'ok:0');

  v_fail := (select count(*) from unnest(v_rep) l where l like 'FALLA%');
  raise exception E'\n%\n\n=== % verificaciones, % con FALLA ===', array_to_string(v_rep, E'\n'), array_length(v_rep, 1), v_fail;
end
$verify$;
