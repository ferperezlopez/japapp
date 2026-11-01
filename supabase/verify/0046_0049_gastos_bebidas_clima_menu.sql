-- Verificación de las migraciones 0046 a 0049 (editar un gasto, bebidas del evento, clima del
-- evento y menú del evento) contra una base que YA las tiene aplicadas. Pegar entero en el SQL
-- editor de Supabase y ejecutar.
--
-- No deja nada: es un solo bloque DO que arma eventos, gastos y pagos de prueba, simula a cada
-- persona (`set local role authenticated` + el JWT de cada una) y termina SIEMPRE con un
-- `raise exception` cuyo mensaje es el informe. El error «=== N verificaciones, 0 con FALLA ===»
-- que muestra el editor es lo esperado, y justamente por ese error se deshace todo.
--
-- Cada línea del informe empieza con OK o FALLA.
--   F: editar un gasto (0046): quién puede, el candado de saldado, el reemplazo atómico de las
--      partes y que los permisos de siempre (borrar, el emoji del admin) no cambiaron.
--   G: bebidas del evento (0047): cualquier logueado carga y corrige hasta que se salda; saldado,
--      solo un admin; las restricciones de la tabla y que se borran con el evento.
--   H: clima del evento (0048): se guarda y se actualiza mientras el evento no empezó (a la hora
--      real, la guardada leída como hora de Buenos Aires) y después queda fijo, también para un admin.
--   I: menú del evento (0049): el largo, quién lo puede editar (como el resto del evento, con el candado
--      de 0044) y el relleno de los eventos pasados a partir de los insumos asignados.
--
-- Los ids de personas son de ESTA base (Fercho es el admin; Mati L, Javi y Bozzo son miembros
-- comunes). El editor puede pedir confirmación por los DELETE que tiene el script: es normal.
do $verify$
declare
  v_rep text[] := '{}';
  v_fail int;
  c_admin constant uuid := '9840e373-0124-40ea-8a5d-89e5ba5b9d73';
  c_matil constant uuid := 'c12485a6-48df-4b32-8ab2-437e173fb309';
  c_javi  constant uuid := '704d9d64-defd-499e-b769-1c2fa0c0d720';
  c_bozzo constant uuid := 'f1db3ce1-16fd-411e-9ead-32b93764f520';
  c_nadie constant uuid := '00000000-0000-4000-8000-0000000000aa';
  e_open uuid; g_open uuid; e_pend uuid; g_pend uuid; e_sett uuid; g_sett uuid; e_trap uuid; g_trap uuid; e_cascade uuid;
  e_w_future uuid; e_w_utc uuid; e_w_started uuid; e_w_edge_in uuid; e_w_edge_out uuid; e_w_cascade uuid; e_w_move uuid;
  e_m_emp uuid; e_m_asa uuid; e_m_none uuid; e_m_both uuid; e_m_set uuid;
  x1 uuid; x2 uuid; x3 uuid; x4a uuid; x4b uuid; x5 uuid; x6 uuid;
  v_before text;
  v_state text;
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

  -- Un insumo del catálogo por nombre (lo crea si no existe) y una tarea de compra de ese insumo en un evento.
  create function pg_temp.item(p_name text, p_uid uuid) returns uuid language plpgsql as $f$
  declare v_id uuid;
  begin
    insert into public.insumo_items (name, created_by) values (p_name, p_uid) on conflict (name) do nothing;
    select id into v_id from public.insumo_items where name = p_name;
    return v_id;
  end $f$;

  create function pg_temp.supply(p_event uuid, p_item text, p_uid uuid) returns void language plpgsql as $f$
  begin
    insert into public.event_tasks (event_id, task_type, assigned_to, item_id, updated_by)
      values (p_event, 'compra_insumos', p_uid, pg_temp.item(p_item, p_uid), p_uid);
  end $f$;

  -- Llama a update_expense como p_uid (sin cambiar de rol, para poder mirar el resultado después) y
  -- devuelve 'ok' o 'err:<sqlstate>:<mensaje>'. El sub-bloque deshace lo que la función alcanzó a hacer si falla.
  create function pg_temp.edit(p_uid uuid, p_expense uuid, p_desc text, p_item uuid, p_amount numeric, p_payer uuid, p_date date, p_shares jsonb) returns text language plpgsql as $f$
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
    perform set_config('request.jwt.claim.sub', coalesce(p_uid::text, ''), true);
    begin
      perform public.update_expense(p_expense, p_desc, p_item, p_amount, p_payer, p_date, p_shares);
      return 'ok';
    exception when others then
      return 'err:' || sqlstate || ':' || left(sqlerrm, 90);
    end;
  end $f$;

  -- Cómo quedó un gasto: descripción / monto / quién pagó / fecha / quién lo cargó / partes (cantidad y suma).
  create function pg_temp.exp_state(p_expense uuid) returns text language sql as $f$
    select x.description || ' / ' || x.amount::text || ' / pagó ' || left(x.paid_by::text, 4) || ' / ' || x.expense_date::text
        || ' / cargó ' || left(x.created_by::text, 4)
        || ' / ' || (select count(*) from public.expense_shares s where s.expense_id = x.id)::text || ' partes por '
        || (select coalesce(sum(s.share_amount), 0) from public.expense_shares s where s.expense_id = x.id)::text
      from public.expenses x where x.id = p_expense;
  $f$;

  -- Las partes de un gasto, ordenadas: 'ab12=45.00,cd34=45.00'.
  create function pg_temp.exp_shares(p_expense uuid) returns text language sql as $f$
    select coalesce(string_agg(left(s.user_id::text, 4) || '=' || s.share_amount::text, ',' order by s.user_id), '')
      from public.expense_shares s where s.expense_id = p_expense;
  $f$;

  create function pg_temp.sh(p_a uuid, p_a_amt numeric, p_b uuid, p_b_amt numeric) returns jsonb language sql as $f$
    select jsonb_build_array(
      jsonb_build_object('user_id', p_a, 'share_amount', p_a_amt),
      jsonb_build_object('user_id', p_b, 'share_amount', p_b_amt));
  $f$;

  -- ===================== datos de prueba (como postgres, sin RLS) =====================
  e_open := pg_temp.mk_event('T abierto',          now() + interval '2 days', c_javi); g_open := pg_temp.grp(e_open);
  e_pend := pg_temp.mk_event('T cerrado con deuda', now() - interval '3 days', c_javi); g_pend := pg_temp.grp(e_pend);
  e_sett := pg_temp.mk_event('T saldado',          now() - interval '3 days', c_javi); g_sett := pg_temp.grp(e_sett);
  e_trap := pg_temp.mk_event('T trampa transitoria', now() - interval '3 days', c_javi); g_trap := pg_temp.grp(e_trap);

  e_cascade := pg_temp.mk_event('T se borra con sus bebidas', now() + interval '1 day', c_javi);

  insert into public.group_members (group_id, user_id)
    select g, u from (values (g_open), (g_pend), (g_sett), (g_trap)) as t(g), (values (c_matil), (c_bozzo)) as m(u)
    on conflict do nothing;

  -- abierto: un gasto que cargó Mati L (pagó ella, partes 50/50 con Javi) y otro igual para las validaciones.
  x1 := pg_temp.mk_expense(g_open, c_matil, c_matil, 100, c_matil, c_javi);
  x5 := pg_temp.mk_expense(g_open, c_matil, c_matil, 100, c_matil, c_javi);
  x6 := pg_temp.mk_expense(g_open, c_matil, c_matil, 100, c_matil, c_javi);
  -- cerrado con deuda: lo cargó Javi, sin pagos.
  x2 := pg_temp.mk_expense(g_pend, c_javi, c_javi, 100, c_javi, c_matil);
  -- saldado: lo cargó Mati L (pagó Javi) y el pago de Mati L lo salda.
  x3 := pg_temp.mk_expense(g_sett, c_javi, c_matil, 100, c_javi, c_matil);
  perform pg_temp.mk_payment(g_sett, c_matil, c_javi, 50, c_matil);
  -- trampa transitoria: x4a + su pago quedan en 0 y x4b (de Mati L) es lo que deja una deuda de 10. Al sacarle las
  -- partes a x4b, el resto del grupo queda saldado: con policies, esa edición legítima se rechazaría a la mitad.
  x4a := pg_temp.mk_expense(g_trap, c_javi, c_javi, 100, c_javi, c_matil);
  perform pg_temp.mk_payment(g_trap, c_matil, c_javi, 50, c_matil);
  x4b := pg_temp.mk_expense(g_trap, c_matil, c_matil, 20, c_matil, c_javi);

  -- ===================== F) editar un gasto (0046) =====================
  v_rep := v_rep || pg_temp.line('F0  antes de editar: el estado de los grupos', concat_ws(' ',
    (select state from public.event_lock_state(e_open)), (select state from public.event_lock_state(e_pend)),
    (select state from public.event_lock_state(e_sett)), (select state from public.event_lock_state(e_trap))),
    'open closed settled closed');

  -- quién puede
  v_rep := v_rep || pg_temp.line('F1  otra persona (miembro) NO puede editar el gasto de Mati L',
    pg_temp.edit(c_bozzo, x1, 'Hielo', null, 90, c_javi, null, pg_temp.sh(c_javi, 45, c_bozzo, 45)), 'err:42501:Solo quien cargó%');
  v_rep := v_rep || pg_temp.line('F2  el gasto quedó igual tras el rechazo', pg_temp.exp_state(x1), 'T gasto / 100.00 / pagó c124 / %/ cargó c124 / 2 partes por 100.00');

  v_rep := v_rep || pg_temp.line('F3  quien lo cargó lo edita (descripción, monto, quién pagó, fecha y partes)',
    pg_temp.edit(c_matil, x1, '  Hielo editado ', null, 90, c_javi, date '2026-10-01', pg_temp.sh(c_matil, 45, c_bozzo, 45)), 'ok');
  v_rep := v_rep || pg_temp.line('F4  quedó con lo nuevo, y la descripción sin espacios de más', pg_temp.exp_state(x1),
    'Hielo editado / 90.00 / pagó 704d / 2026-10-01 / cargó c124 / 2 partes por 90.00');
  v_rep := v_rep || pg_temp.line('F5  las partes se reemplazaron (Mati L y Bozzo; Javi ya no)', pg_temp.exp_shares(x1), 'c124=45.00,f1db=45.00');

  v_rep := v_rep || pg_temp.line('F6  sin fecha, deja la que tenía',
    pg_temp.edit(c_matil, x1, 'Hielo editado', null, 90, c_javi, null, pg_temp.sh(c_matil, 45, c_bozzo, 45)), 'ok');
  v_rep := v_rep || pg_temp.line('F7  ...y la fecha sigue siendo la de antes', (select expense_date::text from public.expenses where id = x1), '2026-10-01');

  v_rep := v_rep || pg_temp.line('F8  un admin edita el gasto de otra persona',
    pg_temp.edit(c_admin, x1, 'Hielo del admin', null, 120, c_matil, null, pg_temp.sh(c_admin, 60, c_javi, 60)), 'ok');
  v_rep := v_rep || pg_temp.line('F9  ...y sigue figurando quien lo cargó originalmente', pg_temp.exp_state(x1),
    'Hielo del admin / 120.00 / pagó c124 / 2026-10-01 / cargó c124 / 2 partes por 120.00');
  v_rep := v_rep || pg_temp.line('F10 ...con las partes del admin y de Javi', pg_temp.exp_shares(x1), '704d=60.00,9840=60.00');

  -- el candado de saldado (spec 022)
  v_rep := v_rep || pg_temp.line('F11 cerrado con deuda: quien lo cargó edita (sigue abierto para la plata)',
    pg_temp.edit(c_javi, x2, 'Carne', null, 80, c_javi, null, pg_temp.sh(c_javi, 40, c_matil, 40)), 'ok');
  v_rep := v_rep || pg_temp.line('F12 saldado: quien lo cargó NO puede editarlo',
    pg_temp.edit(c_matil, x3, 'Carne', null, 100, c_javi, null, pg_temp.sh(c_javi, 50, c_matil, 50)), 'err:42501:Este evento ya está saldado%');
  v_rep := v_rep || pg_temp.line('F13 saldado: otra persona recibe el aviso de que no es suyo',
    pg_temp.edit(c_bozzo, x3, 'Carne', null, 100, c_javi, null, pg_temp.sh(c_javi, 50, c_matil, 50)), 'err:42501:Solo quien cargó%');
  v_rep := v_rep || pg_temp.line('F14 saldado: el gasto quedó igual', pg_temp.exp_state(x3), 'T gasto / 100.00 / pagó 704d / %/ cargó c124 / 2 partes por 100.00');
  v_rep := v_rep || pg_temp.line('F14b saldado: quien lo cargó sigue sin poder borrarlo (0044)',
    pg_temp.attempt(c_matil, array[format('delete from public.expenses where id = %L', x3)]), 'ok:0');
  v_rep := v_rep || pg_temp.line('F15 saldado: un admin sí puede corregirlo (sube el monto a 120)',
    pg_temp.edit(c_admin, x3, 'Carne', null, 120, c_javi, null, pg_temp.sh(c_javi, 60, c_matil, 60)), 'ok');
  v_rep := v_rep || pg_temp.line('F16 ...y el evento se reabre solo: Mati L debe 10 todavía (cerrado)', (select state from public.event_lock_state(e_sett)), 'closed');

  -- la trampa transitoria: sacar las partes viejas deja al resto del grupo saldado un instante
  begin
    delete from public.expense_shares where expense_id = x4b;
    v_state := case when private.group_is_settled(g_trap) then 'saldado' else 'no saldado' end;
    raise exception using errcode = 'P0001', message = 'PROBE_DONE';
  exception when sqlstate 'P0001' then null;
  end;
  v_rep := v_rep || pg_temp.line('F17 trampa transitoria: sin las partes de x4b el resto del grupo queda saldado (se deshace)', v_state, 'saldado');
  v_rep := v_rep || pg_temp.line('F17b ...pero con sus partes puestas, el grupo no está saldado',
    case when private.group_is_settled(g_trap) then 'saldado' else 'no saldado' end, 'no saldado');
  v_rep := v_rep || pg_temp.line('F18 ...y igual quien cargó x4b lo puede editar (el candado se mira una sola vez)',
    pg_temp.edit(c_matil, x4b, 'Pan', null, 30, c_matil, null, pg_temp.sh(c_matil, 15, c_javi, 15)), 'ok');
  v_rep := v_rep || pg_temp.line('F19 ...y quedó con lo nuevo', pg_temp.exp_shares(x4b), '704d=15.00,c124=15.00');

  -- validaciones y atomicidad
  v_before := pg_temp.exp_state(x5) || ' | ' || pg_temp.exp_shares(x5);
  v_rep := v_rep || pg_temp.line('F20 las partes tienen que sumar el monto',
    pg_temp.edit(c_matil, x5, 'X', null, 90, c_matil, null, pg_temp.sh(c_matil, 40, c_javi, 40)), 'err:22023:Las partes no suman%');
  v_rep := v_rep || pg_temp.line('F20b ...y el gasto quedó como estaba', pg_temp.exp_state(x5) || ' | ' || pg_temp.exp_shares(x5), v_before);
  v_rep := v_rep || pg_temp.line('F21 un centavo de diferencia por redondeo se tolera',
    pg_temp.edit(c_matil, x5, 'X', null, 100.01, c_matil, null, pg_temp.sh(c_matil, 50, c_javi, 50)), 'ok');
  v_rep := v_rep || pg_temp.line('F22 el monto tiene que ser mayor a 0',
    pg_temp.edit(c_matil, x6, 'X', null, 0, c_matil, null, pg_temp.sh(c_matil, 0, c_javi, 0)), 'err:22023:El monto%');
  v_rep := v_rep || pg_temp.line('F23 hace falta una descripción',
    pg_temp.edit(c_matil, x6, '   ', null, 10, c_matil, null, pg_temp.sh(c_matil, 5, c_javi, 5)), 'err:22023:Poné una descripción%');
  v_rep := v_rep || pg_temp.line('F24 hace falta al menos una parte',
    pg_temp.edit(c_matil, x6, 'X', null, 10, c_matil, null, '[]'::jsonb), 'err:22023:Elegí entre quiénes%');
  v_rep := v_rep || pg_temp.line('F25 las partes tienen que venir en una lista',
    pg_temp.edit(c_matil, x6, 'X', null, 10, c_matil, null, '{}'::jsonb), 'err:22023:Elegí entre quiénes%');
  v_rep := v_rep || pg_temp.line('F26 hace falta quién pagó',
    pg_temp.edit(c_matil, x6, 'X', null, 10, null, null, pg_temp.sh(c_matil, 5, c_javi, 5)), 'err:22023:Elegí quién pagó%');
  v_before := pg_temp.exp_state(x6) || ' | ' || pg_temp.exp_shares(x6);
  v_rep := v_rep || pg_temp.line('F27 una parte para alguien que no existe falla a la mitad...',
    pg_temp.edit(c_matil, x6, 'Cambiado', null, 20, c_matil, null, pg_temp.sh(c_matil, 10, c_nadie, 10)), 'err:23503%');
  v_rep := v_rep || pg_temp.line('F28 ...y no deja nada cambiado (ni el gasto ni las partes)', pg_temp.exp_state(x6) || ' | ' || pg_temp.exp_shares(x6), v_before);
  v_rep := v_rep || pg_temp.line('F29 la misma persona dos veces falla y deja todo como estaba',
    pg_temp.edit(c_matil, x6, 'Cambiado', null, 20, c_matil, null, pg_temp.sh(c_matil, 10, c_matil, 10)), 'err:23505%');
  v_rep := v_rep || pg_temp.line('F30 ...igual que antes', pg_temp.exp_state(x6) || ' | ' || pg_temp.exp_shares(x6), v_before);
  v_rep := v_rep || pg_temp.line('F31 un gasto que no existe',
    pg_temp.edit(c_matil, gen_random_uuid(), 'X', null, 10, c_matil, null, pg_temp.sh(c_matil, 5, c_javi, 5)), 'err:P0002:No se encontró%');
  v_rep := v_rep || pg_temp.line('F32 sin sesión no se edita nada',
    pg_temp.edit(null, x6, 'X', null, 10, c_matil, null, pg_temp.sh(c_matil, 5, c_javi, 5)), 'err:28000%');
  perform set_config('request.jwt.claims', '', true);
  perform set_config('request.jwt.claim.sub', '', true);

  -- permisos de ejecución
  v_rep := v_rep || pg_temp.line('F33 anon no puede ejecutar la función',
    pg_temp.ask(null, 'anon', format('select public.update_expense(%L, %L, null, 10, %L, null, %L::jsonb)', x6, 'X', c_matil, pg_temp.sh(c_matil, 5, c_javi, 5)::text)), 'err:42501%');
  v_rep := v_rep || pg_temp.line('F34 un logueado sí (por la API, como authenticated)',
    pg_temp.attempt(c_matil, array[format('select public.update_expense(%L, %L, null, 10, %L, null, %L::jsonb)', x6, 'Por la API', c_matil, pg_temp.sh(c_matil, 5, c_javi, 5)::text)]), 'ok:1');

  -- lo de siempre no cambió
  v_rep := v_rep || pg_temp.line('F35 un UPDATE directo de quien cargó el gasto sigue sin pasar (0 filas)',
    pg_temp.attempt(c_matil, array[format('update public.expenses set amount = 1 where id = %L', x6)]), 'ok:0');
  v_rep := v_rep || pg_temp.line('F36 el admin sigue pudiendo editar el emoji de un gasto',
    pg_temp.attempt(c_admin, array[format('update public.expenses set icon = %L where id = %L', '🍺', x6)]), 'ok:1');
  v_rep := v_rep || pg_temp.line('F37 otra persona sigue sin poder borrar el gasto ajeno',
    pg_temp.attempt(c_bozzo, array[format('delete from public.expenses where id = %L', x6)]), 'ok:0');
  v_rep := v_rep || pg_temp.line('F38 quien lo cargó sigue pudiendo borrarlo (evento abierto)',
    pg_temp.attempt(c_matil, array[format('delete from public.expenses where id = %L', x6)]), 'ok:1');


  -- ===================== G) bebidas del evento (0047) =====================
  -- Filas de partida (como postgres): una en el cerrado con deuda y otra en el saldado.
  -- Ojo: F15 reabrió e_sett (el admin le subió el gasto), así que se arma un saldado nuevo para esto.
  e_sett := pg_temp.mk_event('T saldado (bebidas)', now() - interval '3 days', c_javi);
  g_sett := pg_temp.grp(e_sett);
  x3 := pg_temp.mk_expense(g_sett, c_javi, c_matil, 100, c_javi, c_matil);
  perform pg_temp.mk_payment(g_sett, c_matil, c_javi, 50, c_matil);
  insert into public.event_drinks (event_id, drink, bought, updated_by) values
    (e_pend, 'vino', 6, c_matil), (e_sett, 'vino', 6, c_matil), (e_cascade, 'cerveza', 10, c_matil);

  v_rep := v_rep || pg_temp.line('G0  el evento de las bebidas está saldado', (select state from public.event_lock_state(e_sett)), 'settled');

  -- abierto
  v_rep := v_rep || pg_temp.line('G1  abierto: cargar lo comprado y lo consumido',
    pg_temp.attempt(c_matil, array[format('insert into public.event_drinks (event_id, drink, bought, consumed, updated_by) values (%L, %L, 6, 4, %L)', e_open, 'vino', c_matil)]), 'ok:1');
  v_rep := v_rep || pg_temp.line('G2  abierto: cargar y corregir de una vez (upsert, las dos vías)',
    pg_temp.attempt(c_matil, array[
      format('insert into public.event_drinks (event_id, drink, bought, updated_by) values (%L, %L, 6, %L) on conflict (event_id, drink) do update set bought = excluded.bought, updated_by = excluded.updated_by', e_open, 'cerveza', c_matil),
      format('insert into public.event_drinks (event_id, drink, bought, updated_by) values (%L, %L, 8, %L) on conflict (event_id, drink) do update set bought = excluded.bought, updated_by = excluded.updated_by', e_open, 'cerveza', c_matil)]), 'ok:1');
  v_rep := v_rep || pg_temp.line('G3  otra persona (miembro, no admin) también puede cargar: es de cualquier logueado',
    pg_temp.attempt(c_bozzo, array[format('insert into public.event_drinks (event_id, drink, consumed, updated_by) values (%L, %L, 3, %L)', e_open, 'gaseosa', c_bozzo)]), 'ok:1');

  -- cerrado con deuda: sigue abierto para esto (como el resultado del partido)
  v_rep := v_rep || pg_temp.line('G4  cerrado con deuda: cargar sigue permitido',
    pg_temp.attempt(c_matil, array[format('insert into public.event_drinks (event_id, drink, bought, updated_by) values (%L, %L, 12, %L)', e_pend, 'cerveza', c_matil)]), 'ok:1');
  v_rep := v_rep || pg_temp.line('G5  cerrado con deuda: corregir lo cargado',
    pg_temp.attempt(c_bozzo, array[format('update public.event_drinks set consumed = 5, updated_by = %L where event_id = %L and drink = %L', c_bozzo, e_pend, 'vino')]), 'ok:1');
  v_rep := v_rep || pg_temp.line('G6  cerrado con deuda: sacar una fila',
    pg_temp.attempt(c_matil, array[format('delete from public.event_drinks where event_id = %L and drink = %L', e_pend, 'vino')]), 'ok:1');

  -- saldado: solo admin
  v_rep := v_rep || pg_temp.line('G7  saldado: cargar un tipo nuevo, rechazado',
    pg_temp.attempt(c_matil, array[format('insert into public.event_drinks (event_id, drink, bought, updated_by) values (%L, %L, 12, %L)', e_sett, 'cerveza', c_matil)]), 'err:42501%');
  v_rep := v_rep || pg_temp.line('G8  saldado: corregir lo cargado, 0 filas',
    pg_temp.attempt(c_matil, array[format('update public.event_drinks set consumed = 5, updated_by = %L where event_id = %L and drink = %L', c_matil, e_sett, 'vino')]), 'ok:0');
  v_rep := v_rep || pg_temp.line('G9  saldado: sacar una fila, 0 filas',
    pg_temp.attempt(c_matil, array[format('delete from public.event_drinks where event_id = %L and drink = %L', e_sett, 'vino')]), 'ok:0');
  v_rep := v_rep || pg_temp.line('G10 saldado: un admin carga',
    pg_temp.attempt(c_admin, array[format('insert into public.event_drinks (event_id, drink, bought, updated_by) values (%L, %L, 12, %L)', e_sett, 'cerveza', c_admin)]), 'ok:1');
  v_rep := v_rep || pg_temp.line('G11 saldado: un admin corrige',
    pg_temp.attempt(c_admin, array[format('update public.event_drinks set consumed = 5, updated_by = %L where event_id = %L and drink = %L', c_admin, e_sett, 'vino')]), 'ok:1');
  v_rep := v_rep || pg_temp.line('G12 saldado: un admin saca una fila',
    pg_temp.attempt(c_admin, array[format('delete from public.event_drinks where event_id = %L and drink = %L', e_sett, 'vino')]), 'ok:1');

  -- reglas de la tabla
  v_rep := v_rep || pg_temp.line('G13 quien guarda tiene que ser quien figura como autor',
    pg_temp.attempt(c_matil, array[format('insert into public.event_drinks (event_id, drink, bought, updated_by) values (%L, %L, 1, %L)', e_open, 'gaseosa', c_javi)]), 'err:42501%');
  v_rep := v_rep || pg_temp.line('G14 no se aceptan cantidades negativas',
    pg_temp.attempt(c_matil, array[format('insert into public.event_drinks (event_id, drink, bought, updated_by) values (%L, %L, -1, %L)', e_open, 'gaseosa', c_matil)]), 'err:23514%');
  v_rep := v_rep || pg_temp.line('G15 una fila sin ninguna cantidad no tiene sentido',
    pg_temp.attempt(c_matil, array[format('insert into public.event_drinks (event_id, drink, updated_by) values (%L, %L, %L)', e_open, 'gaseosa', c_matil)]), 'err:23514%');
  v_rep := v_rep || pg_temp.line('G16 solo vino, cerveza y gaseosa',
    pg_temp.attempt(c_matil, array[format('insert into public.event_drinks (event_id, drink, bought, updated_by) values (%L, %L, 1, %L)', e_open, 'fernet', c_matil)]), 'err:23514%');
  v_rep := v_rep || pg_temp.line('G17 un tipo por evento (clave primaria)',
    pg_temp.attempt(c_matil, array[
      format('insert into public.event_drinks (event_id, drink, bought, updated_by) values (%L, %L, 1, %L)', e_open, 'gaseosa', c_matil),
      format('insert into public.event_drinks (event_id, drink, bought, updated_by) values (%L, %L, 2, %L)', e_open, 'gaseosa', c_matil)]), 'err:23505%');
  v_rep := v_rep || pg_temp.line('G18 las cantidades guardan hasta 2 decimales (redondea)',
    pg_temp.ask(c_matil, 'authenticated', format('with i as (insert into public.event_drinks (event_id, drink, bought, updated_by) values (%L, %L, 7.456, %L) returning bought) select bought::text from i', e_open, 'gaseosa', c_matil)), 'val:7.46');

  -- quién lo ve y qué pasa al borrar el evento
  v_rep := v_rep || pg_temp.line('G19 cualquier logueado ve las bebidas de un evento',
    pg_temp.ask(c_bozzo, 'authenticated', format('select count(*) from public.event_drinks where event_id = %L', e_pend)), 'val:1');
  v_rep := v_rep || pg_temp.line('G20 sin sesión (anon) no ve nada',
    pg_temp.ask(null, 'anon', format('select count(*) from public.event_drinks where event_id = %L', e_pend)), 'val:0');
  delete from public.events where id = e_cascade;
  v_rep := v_rep || pg_temp.line('G21 al borrar el evento se borran sus bebidas',
    (select count(*)::text from public.event_drinks where event_id = e_cascade), '0');

  -- ===================== H) clima del evento (0048) =====================
  -- «Empieza» a la hora real: la fecha guardada son los dígitos de la hora de Buenos Aires (UTC−3).
  e_w_future   := pg_temp.mk_event('T clima: dentro de 2 días',   now() + interval '2 days', c_javi);
  -- guardada hace 1 h (como UTC, ya «pasó» para el resto de la app), pero en Buenos Aires empieza dentro de 2 h
  e_w_utc      := pg_temp.mk_event('T clima: pasado como UTC',    now() - interval '1 hour', c_javi);
  -- guardada hace 4 h: en Buenos Aires empezó hace 1 h
  e_w_started  := pg_temp.mk_event('T clima: ya empezó',          now() - interval '4 hours', c_javi);
  -- a un minuto de empezar, y un minuto después de empezar
  e_w_edge_in  := pg_temp.mk_event('T clima: falta 1 minuto',     now() - interval '3 hours' + interval '1 minute', c_javi);
  e_w_edge_out := pg_temp.mk_event('T clima: empezó hace 1 min',  now() - interval '3 hours' - interval '1 minute', c_javi);
  e_w_cascade  := pg_temp.mk_event('T clima: se borra',           now() + interval '3 days', c_javi);
  e_w_move     := pg_temp.mk_event('T clima: ya tiene su dato',   now() + interval '2 days', c_javi);
  insert into public.event_weather (event_id, forecast_for, temperature_c, weather_code) values
    (e_w_started, '2026-11-05T19:00', 21, 1), (e_w_cascade, '2026-11-05T19:00', 21, 1), (e_w_move, '2026-11-05T19:00', 18, 2);

  v_rep := v_rep || pg_temp.line('H0  event_starts_at lee los dígitos como hora de Buenos Aires (19:30 → 22:30 UTC)',
    (select to_char(private.event_starts_at(timestamptz '2026-11-05 19:30:00+00') at time zone 'UTC', 'YYYY-MM-DD HH24:MI')), '2026-11-05 22:30');

  v_rep := v_rep || pg_temp.line('H1  antes de empezar: se guarda el pronóstico',
    pg_temp.attempt(c_matil, array[format('insert into public.event_weather (event_id, forecast_for, temperature_c, precipitation_probability, weather_code, fetched_at, precipitation_mm, wind_kmh) values (%L, %L, 24.5, 10, 1, now(), 0.2, 12)', e_w_future, '2026-11-05T19:00')]), 'ok:1');
  v_rep := v_rep || pg_temp.line('H2  antes de empezar: se actualiza (upsert, las dos vías)',
    pg_temp.attempt(c_bozzo, array[
      format('insert into public.event_weather (event_id, forecast_for, temperature_c) values (%L, %L, 20) on conflict (event_id) do update set temperature_c = excluded.temperature_c, fetched_at = now()', e_w_future, '2026-11-05T19:00'),
      format('insert into public.event_weather (event_id, forecast_for, temperature_c) values (%L, %L, 22) on conflict (event_id) do update set temperature_c = excluded.temperature_c, fetched_at = now()', e_w_future, '2026-11-05T19:00')]), 'ok:1');
  v_rep := v_rep || pg_temp.line('H3  la fecha guardada ya pasó como UTC pero en Buenos Aires todavía no empezó: se puede',
    pg_temp.attempt(c_matil, array[format('insert into public.event_weather (event_id, forecast_for, temperature_c) values (%L, %L, 24)', e_w_utc, '2026-11-05T19:00')]), 'ok:1');
  v_rep := v_rep || pg_temp.line('H4  falta 1 minuto para empezar: se puede',
    pg_temp.attempt(c_matil, array[format('insert into public.event_weather (event_id, forecast_for, temperature_c) values (%L, %L, 24)', e_w_edge_in, '2026-11-05T19:00')]), 'ok:1');

  v_rep := v_rep || pg_temp.line('H5  empezó hace 1 minuto: ya no se guarda',
    pg_temp.attempt(c_matil, array[format('insert into public.event_weather (event_id, forecast_for, temperature_c) values (%L, %L, 24)', e_w_edge_out, '2026-11-05T19:00')]), 'err:42501%');
  v_rep := v_rep || pg_temp.line('H6  un evento que no existe: no se guarda (la policy lo frena antes que la clave foránea)',
    pg_temp.attempt(c_matil, array[format('insert into public.event_weather (event_id, forecast_for, temperature_c) values (%L, %L, 24)', gen_random_uuid(), '2026-11-05T19:00')]), 'err:42501%');
  v_rep := v_rep || pg_temp.line('H7  ya empezó: el dato guardado queda fijo (el update no toca nada)',
    pg_temp.attempt(c_matil, array[format('update public.event_weather set temperature_c = 99 where event_id = %L', e_w_started)]), 'ok:0');
  v_rep := v_rep || pg_temp.line('H8  ya empezó: ni un admin lo cambia',
    pg_temp.attempt(c_admin, array[format('update public.event_weather set temperature_c = 99 where event_id = %L', e_w_started)]), 'ok:0');
  v_rep := v_rep || pg_temp.line('H9  ya empezó: ni un upsert que lo pise',
    pg_temp.attempt(c_matil, array[format('insert into public.event_weather (event_id, forecast_for, temperature_c) values (%L, %L, 99) on conflict (event_id) do update set temperature_c = excluded.temperature_c', e_w_started, '2026-11-05T19:00')]), 'err:42501%');
  v_rep := v_rep || pg_temp.line('H10 ...y el dato sigue siendo el de antes de empezar',
    (select temperature_c::text from public.event_weather where event_id = e_w_started), '21.0');

  -- no se mueve un dato a otro evento
  v_rep := v_rep || pg_temp.line('H11 no se puede pasar el dato de un evento que no empezó a uno que sí (update del event_id)',
    pg_temp.attempt(c_matil, array[format('delete from public.event_weather where event_id = %L', e_w_started), format('update public.event_weather set event_id = %L where event_id = %L', e_w_started, e_w_move)]), 'err:42501%');

  -- reglas de la tabla
  v_rep := v_rep || pg_temp.line('H12 una probabilidad de lluvia mayor a 100 se rechaza',
    pg_temp.attempt(c_matil, array[format('insert into public.event_weather (event_id, forecast_for, precipitation_probability) values (%L, %L, 120)', e_w_future, '2026-11-05T19:00')]), 'err:23514%');
  v_rep := v_rep || pg_temp.line('H13 milímetros negativos se rechazan',
    pg_temp.attempt(c_matil, array[format('update public.event_weather set precipitation_mm = -1 where event_id = %L', e_w_cascade)]), 'err:23514%');
  v_rep := v_rep || pg_temp.line('H14 un código de clima fuera de 0 a 99 se rechaza',
    pg_temp.attempt(c_matil, array[format('update public.event_weather set weather_code = 150 where event_id = %L', e_w_cascade)]), 'err:23514%');
  v_rep := v_rep || pg_temp.line('H15 un solo pronóstico por evento (clave primaria)',
    pg_temp.attempt(c_matil, array[format('insert into public.event_weather (event_id, forecast_for, temperature_c) values (%L, %L, 24)', e_w_move, '2026-11-05T19:00')]), 'err:23505%');

  -- quién lo ve, quién lo borra y qué pasa al borrar el evento
  v_rep := v_rep || pg_temp.line('H16 cualquier logueado ve el clima de un evento',
    pg_temp.ask(c_bozzo, 'authenticated', format('select count(*) from public.event_weather where event_id = %L', e_w_started)), 'val:1');
  v_rep := v_rep || pg_temp.line('H17 sin sesión (anon) no ve nada',
    pg_temp.ask(null, 'anon', format('select count(*) from public.event_weather where event_id = %L', e_w_started)), 'val:0');
  v_rep := v_rep || pg_temp.line('H18 nadie lo borra a mano (no hay policy de delete), ni un admin',
    pg_temp.attempt(c_admin, array[format('delete from public.event_weather where event_id = %L', e_w_cascade)]), 'ok:0');
  delete from public.events where id = e_w_cascade;
  v_rep := v_rep || pg_temp.line('H19 al borrar el evento se borra su clima',
    (select count(*)::text from public.event_weather where event_id = e_w_cascade), '0');
  v_rep := v_rep || pg_temp.line('H20 la función de la hora de comienzo no la ejecuta anon',
    pg_temp.ask(null, 'anon', 'select private.event_starts_at(now())::text'), 'err:42501%');

  -- ===================== I) menú del evento (0049) =====================
  v_rep := v_rep || pg_temp.line('I0  events.menu existe y es texto',
    (select data_type from information_schema.columns where table_schema = 'public' and table_name = 'events' and column_name = 'menu'), 'text');

  -- quién lo edita: como el resto del evento (el creador y el admin; cerrado, solo el admin)
  v_rep := v_rep || pg_temp.line('I1  el creador le pone menú a su evento',
    pg_temp.attempt(c_javi, array[format('update public.events set menu = %L where id = %L', 'Asado', e_open)]), 'ok:1');
  v_rep := v_rep || pg_temp.line('I2  otra persona no puede (0 filas), como con el resto del evento',
    pg_temp.attempt(c_matil, array[format('update public.events set menu = %L where id = %L', 'Asado', e_open)]), 'ok:0');
  v_rep := v_rep || pg_temp.line('I3  un admin sí puede, en cualquier evento',
    pg_temp.attempt(c_admin, array[format('update public.events set menu = %L where id = %L', 'Asado', e_open)]), 'ok:1');
  v_rep := v_rep || pg_temp.line('I4  cerrado: el creador ya no puede (0044)',
    pg_temp.attempt(c_javi, array[format('update public.events set menu = %L where id = %L', 'Asado', e_pend)]), 'ok:0');
  v_rep := v_rep || pg_temp.line('I5  cerrado: un admin sí',
    pg_temp.attempt(c_admin, array[format('update public.events set menu = %L where id = %L', 'Asado', e_pend)]), 'ok:1');

  -- el largo
  v_rep := v_rep || pg_temp.line('I6  un menú vacío se rechaza (sin menú es null)',
    pg_temp.attempt(c_javi, array[format('update public.events set menu = %L where id = %L', '', e_open)]), 'err:23514%');
  v_rep := v_rep || pg_temp.line('I7  uno de solo espacios también',
    pg_temp.attempt(c_javi, array[format('update public.events set menu = %L where id = %L', '    ', e_open)]), 'err:23514%');
  v_rep := v_rep || pg_temp.line('I8  uno de más de 40 caracteres se rechaza',
    pg_temp.attempt(c_javi, array[format('update public.events set menu = %L where id = %L', repeat('x', 41), e_open)]), 'err:23514%');
  v_rep := v_rep || pg_temp.line('I9  uno de justo 40 caracteres entra',
    pg_temp.attempt(c_javi, array[format('update public.events set menu = %L where id = %L', repeat('x', 40), e_open)]), 'ok:1');
  v_rep := v_rep || pg_temp.line('I10 se puede sacar el menú (null)',
    pg_temp.attempt(c_javi, array[format('update public.events set menu = null where id = %L', e_open)]), 'ok:1');

  -- crear eventos: con y sin menú, como siempre
  v_rep := v_rep || pg_temp.line('I11 crear un evento con menú',
    pg_temp.attempt(c_matil, array[format('insert into public.events (name, event_date, created_by, menu) values (%L, now() + interval %L, %L, %L)', 'T con menú', '5 days', c_matil, 'Pizza')]), 'ok:1');
  v_rep := v_rep || pg_temp.line('I12 crear un evento sin menú (como hasta ahora)',
    pg_temp.attempt(c_matil, array[format('insert into public.events (name, event_date, created_by) values (%L, now() + interval %L, %L)', 'T sin menú', '5 days', c_matil)]), 'ok:1');

  -- el relleno de los eventos pasados, a partir de los insumos asignados (se corre una vez, después de la migración)
  e_m_emp  := pg_temp.mk_event('T relleno: empanadas',       now() - interval '40 days', c_javi);
  e_m_asa  := pg_temp.mk_event('T relleno: asado',           now() - interval '30 days', c_javi);
  e_m_none := pg_temp.mk_event('T relleno: sin pistas',      now() - interval '20 days', c_javi);
  e_m_both := pg_temp.mk_event('T relleno: las dos cosas',   now() - interval '10 days', c_javi);
  e_m_set  := pg_temp.mk_event('T relleno: ya tiene menú',   now() - interval '5 days',  c_javi);
  update public.events set menu = 'Pizza' where id = e_m_set;
  perform pg_temp.supply(e_m_emp, 'Tapas de empanadas', c_matil); perform pg_temp.supply(e_m_emp, 'Vinos', c_matil);
  perform pg_temp.supply(e_m_asa, 'Carbón', c_matil);              perform pg_temp.supply(e_m_asa, 'Cervezas', c_matil);
  perform pg_temp.supply(e_m_none, 'Postre', c_matil);
  perform pg_temp.supply(e_m_both, 'Relleno empanadas', c_matil);  perform pg_temp.supply(e_m_both, 'Carbón', c_matil);
  perform pg_temp.supply(e_m_set, 'Carbón', c_matil);

  update public.events e set menu = 'Empanadas'
   where e.menu is null
     and exists (select 1 from public.event_tasks t join public.insumo_items i on i.id = t.item_id
                  where t.event_id = e.id and t.task_type = 'compra_insumos' and i.name ilike '%empanada%');
  update public.events e set menu = 'Asado'
   where e.menu is null
     and exists (select 1 from public.event_tasks t join public.insumo_items i on i.id = t.item_id
                  where t.event_id = e.id and t.task_type = 'compra_insumos' and i.name in ('Carbón', 'Carne', 'Entrañas'));

  v_rep := v_rep || pg_temp.line('I13 relleno: tapas de empanadas → Empanadas', (select menu from public.events where id = e_m_emp), 'Empanadas');
  v_rep := v_rep || pg_temp.line('I14 relleno: carbón → Asado', (select menu from public.events where id = e_m_asa), 'Asado');
  v_rep := v_rep || pg_temp.line('I15 relleno: sin pistas queda sin menú', (select coalesce(menu, 'sin menú') from public.events where id = e_m_none), 'sin menú');
  v_rep := v_rep || pg_temp.line('I16 relleno: con empanadas y carbón gana empanadas (la primera regla)', (select menu from public.events where id = e_m_both), 'Empanadas');
  v_rep := v_rep || pg_temp.line('I17 relleno: no pisa un menú ya cargado', (select menu from public.events where id = e_m_set), 'Pizza');

  v_fail := (select count(*) from unnest(v_rep) l where l like 'FALLA%');
  raise exception E'\n%\n\n=== % verificaciones, % con FALLA ===', array_to_string(v_rep, E'\n'), array_length(v_rep, 1), v_fail;
end
$verify$;
