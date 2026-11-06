-- Verificación de la migración 0051 (cantidad por insumo y nombres con mayúscula inicial) contra una
-- base que YA la tiene aplicada. Pegar entero en el SQL editor de Supabase y ejecutar.
--
-- No deja nada: es un solo bloque DO que arma eventos, insumos y tareas de prueba, simula a cada
-- persona (`set local role authenticated` + el JWT de cada una) y termina SIEMPRE con un
-- `raise exception` cuyo mensaje es el informe. El error «=== N verificaciones, 0 con FALLA ===» que
-- muestra el editor es lo esperado, y justamente por ese error se deshace todo.
--
-- Cada línea del informe empieza con OK o FALLA.
--   L: la columna `quantity` de event_tasks y sus restricciones (vacía, con espacios, más de 40
--      caracteres —contados en caracteres, no en bytes—, solo en «Compra de insumos»).
--   M: el UPDATE de la cantidad: cualquier logueado cambia solo la cantidad (y deja quién fue); no
--      puede tocar a quién se asignó, el insumo, la tarea ni el evento; no puede firmar con otra
--      persona; las demás tareas no se pueden tocar; en un evento cerrado solo un admin; ni `anon`
--      ni `authenticated` conservan el UPDATE de tabla.
--   N: el trigger que pone la primera letra de cada insumo en mayúscula (alta y cambio de nombre,
--      no el cambio de ícono) y que no queden insumos en minúscula.
--
-- Los ids de personas son de ESTA base (Fercho es el admin; Mati L, Javi y Bozzo son miembros comunes).
do $verify$
declare
  c_admin constant uuid := '9840e373-0124-40ea-8a5d-89e5ba5b9d73';
  c_matil constant uuid := 'c12485a6-48df-4b32-8ab2-437e173fb309';
  c_javi  constant uuid := '704d9d64-defd-499e-b769-1c2fa0c0d720';
  c_bozzo constant uuid := 'f1db3ce1-16fd-411e-9ead-32b93764f520';
  v_rep text[] := '{}';
  v_fail int;
  e_open uuid; e_closed uuid;
  i_a uuid; i_b uuid; i_low uuid;
  t_1 uuid; t_2 uuid; t_c uuid;
  v_low_before text;
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
      perform set_config('request.jwt.claim.sub', coalesce(p_uid::text, ''), true);
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

  create function pg_temp.mk_event_at(p_name text, p_date timestamptz, p_creator uuid) returns uuid language plpgsql as $f$
  declare v_id uuid;
  begin
    insert into public.events (name, event_date, created_by, has_futbol) values (p_name, p_date, p_creator, false) returning id into v_id;
    return v_id;
  end $f$;

  create function pg_temp.mk_item(p_name text, p_creator uuid) returns uuid language plpgsql as $f$
  declare v_id uuid;
  begin
    insert into public.insumo_items (name, created_by) values (p_name, p_creator) returning id into v_id;
    return v_id;
  end $f$;

  -- Un insumo tal cual se escribe, sin pasar por el trigger (como los que había antes de la 0051).
  -- Devuelve null si no se pudo desactivar el trigger (hace falta ser dueño de la tabla).
  create function pg_temp.mk_item_raw(p_name text, p_creator uuid) returns uuid language plpgsql as $f$
  declare v_id uuid;
  begin
    alter table public.insumo_items disable trigger insumo_items_capitalize_name;
    insert into public.insumo_items (name, created_by) values (p_name, p_creator) returning id into v_id;
    alter table public.insumo_items enable trigger insumo_items_capitalize_name;
    return v_id;
  exception when others then
    return null;
  end $f$;

  create function pg_temp.mk_task(p_event uuid, p_type text, p_assignee uuid, p_item uuid, p_qty text, p_by uuid) returns uuid language plpgsql as $f$
  declare v_id uuid;
  begin
    insert into public.event_tasks (event_id, task_type, assigned_to, item_id, quantity, updated_by)
      values (p_event, p_type, p_assignee, p_item, p_qty, p_by) returning id into v_id;
    return v_id;
  end $f$;

  -- ===================== datos de prueba =====================
  e_open   := pg_temp.mk_event_at('T evento abierto', now() + interval '5 days', c_matil);
  e_closed := pg_temp.mk_event_at('T evento cerrado', now() - interval '3 days', c_matil);
  i_a := pg_temp.mk_item('Tz carne', c_matil);
  i_b := pg_temp.mk_item('Tz hielo', c_matil);
  t_1 := pg_temp.mk_task(e_open, 'compra_insumos', c_javi, i_a, null, c_javi);
  t_2 := pg_temp.mk_task(e_open, 'lavado_platos', c_bozzo, null, null, c_bozzo);
  t_c := pg_temp.mk_task(e_closed, 'compra_insumos', c_javi, i_a, '1 kg', c_matil);

  -- ===================== L: la columna y sus restricciones =====================
  v_rep := v_rep || pg_temp.line('L0  la columna quantity existe en event_tasks',
    (select count(*)::text from information_schema.columns
      where table_schema = 'public' and table_name = 'event_tasks' and column_name = 'quantity'), '1');
  v_rep := v_rep || pg_temp.line('L1  asignar un insumo sin cantidad (como siempre)',
    pg_temp.attempt(c_javi, array[format('insert into public.event_tasks (event_id, task_type, assigned_to, item_id, updated_by) values (%L, %L, %L, %L, %L)', e_open, 'compra_insumos', c_javi, i_b, c_javi)]), 'ok:1');
  v_rep := v_rep || pg_temp.line('L2  asignar un insumo con cantidad',
    pg_temp.attempt(c_javi, array[format('insert into public.event_tasks (event_id, task_type, assigned_to, item_id, quantity, updated_by) values (%L, %L, %L, %L, %L, %L)', e_open, 'compra_insumos', c_javi, i_b, '2 kg', c_javi)]), 'ok:1');
  v_rep := v_rep || pg_temp.line('L3  una cantidad de exactamente 40 caracteres',
    pg_temp.attempt(c_javi, array[format('insert into public.event_tasks (event_id, task_type, assigned_to, item_id, quantity, updated_by) values (%L, %L, %L, %L, %L, %L)', e_open, 'compra_insumos', c_javi, i_b, repeat('x', 40), c_javi)]), 'ok:1');
  v_rep := v_rep || pg_temp.line('L4  una cantidad de 41 caracteres',
    pg_temp.attempt(c_javi, array[format('insert into public.event_tasks (event_id, task_type, assigned_to, item_id, quantity, updated_by) values (%L, %L, %L, %L, %L, %L)', e_open, 'compra_insumos', c_javi, i_b, repeat('x', 41), c_javi)]), 'err:23514:%');
  v_rep := v_rep || pg_temp.line('L5  una cantidad vacía',
    pg_temp.attempt(c_javi, array[format('insert into public.event_tasks (event_id, task_type, assigned_to, item_id, quantity, updated_by) values (%L, %L, %L, %L, %L, %L)', e_open, 'compra_insumos', c_javi, i_b, '', c_javi)]), 'err:23514:%');
  v_rep := v_rep || pg_temp.line('L6  una cantidad de solo espacios',
    pg_temp.attempt(c_javi, array[format('insert into public.event_tasks (event_id, task_type, assigned_to, item_id, quantity, updated_by) values (%L, %L, %L, %L, %L, %L)', e_open, 'compra_insumos', c_javi, i_b, '   ', c_javi)]), 'err:23514:%');
  v_rep := v_rep || pg_temp.line('L7  una cantidad con espacios al principio',
    pg_temp.attempt(c_javi, array[format('insert into public.event_tasks (event_id, task_type, assigned_to, item_id, quantity, updated_by) values (%L, %L, %L, %L, %L, %L)', e_open, 'compra_insumos', c_javi, i_b, ' 2 kg', c_javi)]), 'err:23514:%');
  v_rep := v_rep || pg_temp.line('L8  una cantidad con espacios al final',
    pg_temp.attempt(c_javi, array[format('insert into public.event_tasks (event_id, task_type, assigned_to, item_id, quantity, updated_by) values (%L, %L, %L, %L, %L, %L)', e_open, 'compra_insumos', c_javi, i_b, '2 kg ', c_javi)]), 'err:23514:%');
  v_rep := v_rep || pg_temp.line('L9  el límite es de caracteres, no de bytes (40 letras con tilde)',
    pg_temp.attempt(c_javi, array[format('insert into public.event_tasks (event_id, task_type, assigned_to, item_id, quantity, updated_by) values (%L, %L, %L, %L, %L, %L)', e_open, 'compra_insumos', c_javi, i_b, repeat('é', 40), c_javi)]), 'ok:1');
  v_rep := v_rep || pg_temp.line('L10 espacios y signos en el medio están bien',
    pg_temp.attempt(c_javi, array[format('insert into public.event_tasks (event_id, task_type, assigned_to, item_id, quantity, updated_by) values (%L, %L, %L, %L, %L, %L)', e_open, 'compra_insumos', c_javi, i_b, '2 ½ kg (aprox.)', c_javi)]), 'ok:1');
  v_rep := v_rep || pg_temp.line('L11 la cantidad solo va en «Compra de insumos» (lavado de platos)',
    pg_temp.attempt(c_javi, array[format('insert into public.event_tasks (event_id, task_type, assigned_to, quantity, updated_by) values (%L, %L, %L, %L, %L)', e_open, 'lavado_platos', c_javi, '1', c_javi)]), 'err:23514:%');
  v_rep := v_rep || pg_temp.line('L12 …ni en «Orden de la sede»',
    pg_temp.attempt(c_javi, array[format('insert into public.event_tasks (event_id, task_type, assigned_to, quantity, updated_by) values (%L, %L, %L, %L, %L)', e_open, 'orden_sede', c_javi, '1', c_javi)]), 'err:23514:%');
  v_rep := v_rep || pg_temp.line('L13 el lavado de platos sin cantidad se sigue pudiendo asignar',
    pg_temp.attempt(c_javi, array[format('insert into public.event_tasks (event_id, task_type, assigned_to, updated_by) values (%L, %L, %L, %L)', e_open, 'lavado_platos', c_javi, c_javi)]), 'ok:1');
  v_rep := v_rep || pg_temp.line('L14 «Compra de insumos» sigue pidiendo el insumo',
    pg_temp.attempt(c_javi, array[format('insert into public.event_tasks (event_id, task_type, assigned_to, quantity, updated_by) values (%L, %L, %L, %L, %L)', e_open, 'compra_insumos', c_javi, '2 kg', c_javi)]), 'err:23514:%');
  v_rep := v_rep || pg_temp.line('L15 el alta en un evento cerrado sigue rechazada para un miembro común (0044)',
    pg_temp.attempt(c_javi, array[format('insert into public.event_tasks (event_id, task_type, assigned_to, item_id, quantity, updated_by) values (%L, %L, %L, %L, %L, %L)', e_closed, 'compra_insumos', c_javi, i_b, '2 kg', c_javi)]), 'err:42501:%');
  v_rep := v_rep || pg_temp.line('L16 …y un admin sí puede asignar en un evento cerrado',
    pg_temp.attempt(c_admin, array[format('insert into public.event_tasks (event_id, task_type, assigned_to, item_id, quantity, updated_by) values (%L, %L, %L, %L, %L, %L)', e_closed, 'compra_insumos', c_javi, i_b, '2 kg', c_admin)]), 'ok:1');

  -- ===================== M: el UPDATE de la cantidad =====================
  v_rep := v_rep || pg_temp.line('M1  quien no asignó la tarea cambia la cantidad (y firma el cambio)',
    pg_temp.attempt(c_bozzo, array[
      format('update public.event_tasks set quantity = %L, updated_by = %L, updated_at = now() where id = %L', '3 kg', c_bozzo, t_1),
      format('select 1 from public.event_tasks where id = %L and quantity = %L and updated_by = %L', t_1, '3 kg', c_bozzo)]), 'ok:1');
  v_rep := v_rep || pg_temp.line('M2  cambia la cantidad de una que ya tenía',
    pg_temp.attempt(c_bozzo, array[
      format('update public.event_tasks set quantity = %L, updated_by = %L where id = %L', '5 kg', c_bozzo, t_1),
      format('update public.event_tasks set quantity = %L, updated_by = %L where id = %L', '2 kg', c_bozzo, t_1),
      format('select 1 from public.event_tasks where id = %L and quantity = %L', t_1, '2 kg')]), 'ok:1');
  v_rep := v_rep || pg_temp.line('M3  la puede quitar (vuelve a no tener)',
    pg_temp.attempt(c_bozzo, array[
      format('update public.event_tasks set quantity = %L, updated_by = %L where id = %L', '5 kg', c_bozzo, t_1),
      format('update public.event_tasks set quantity = null, updated_by = %L where id = %L', c_bozzo, t_1),
      format('select 1 from public.event_tasks where id = %L and quantity is null', t_1)]), 'ok:1');
  v_rep := v_rep || pg_temp.line('M4  no puede cambiar a quién se asignó',
    pg_temp.attempt(c_bozzo, array[format('update public.event_tasks set assigned_to = %L, updated_by = %L where id = %L', c_bozzo, c_bozzo, t_1)]), 'err:42501:%');
  v_rep := v_rep || pg_temp.line('M5  no puede cambiar el insumo',
    pg_temp.attempt(c_bozzo, array[format('update public.event_tasks set item_id = %L, updated_by = %L where id = %L', i_b, c_bozzo, t_1)]), 'err:42501:%');
  v_rep := v_rep || pg_temp.line('M6  no puede cambiar la tarea',
    pg_temp.attempt(c_bozzo, array[format('update public.event_tasks set task_type = %L, updated_by = %L where id = %L', 'lavado_platos', c_bozzo, t_1)]), 'err:42501:%');
  v_rep := v_rep || pg_temp.line('M7  no puede mudarla a otro evento',
    pg_temp.attempt(c_bozzo, array[format('update public.event_tasks set event_id = %L, updated_by = %L where id = %L', e_closed, c_bozzo, t_1)]), 'err:42501:%');
  v_rep := v_rep || pg_temp.line('M8  no puede firmar el cambio a nombre de otra persona',
    pg_temp.attempt(c_bozzo, array[format('update public.event_tasks set quantity = %L, updated_by = %L where id = %L', '1 kg', c_javi, t_1)]), 'err:42501:%');
  v_rep := v_rep || pg_temp.line('M9  tampoco dejando la firma de quien asignó (tiene que firmar quien corrige)',
    pg_temp.attempt(c_bozzo, array[format('update public.event_tasks set quantity = %L where id = %L', '1 kg', t_1)]), 'err:42501:%');
  v_rep := v_rep || pg_temp.line('M10 quien asignó la tarea también la corrige',
    pg_temp.attempt(c_javi, array[format('update public.event_tasks set quantity = %L, updated_by = %L where id = %L', '1 kg', c_javi, t_1)]), 'ok:1');
  v_rep := v_rep || pg_temp.line('M11 una cantidad inválida por UPDATE (41 caracteres) la rechaza la restricción',
    pg_temp.attempt(c_bozzo, array[format('update public.event_tasks set quantity = %L, updated_by = %L where id = %L', repeat('x', 41), c_bozzo, t_1)]), 'err:23514:%');
  v_rep := v_rep || pg_temp.line('M12 …una vacía también',
    pg_temp.attempt(c_bozzo, array[format('update public.event_tasks set quantity = %L, updated_by = %L where id = %L', '', c_bozzo, t_1)]), 'err:23514:%');
  v_rep := v_rep || pg_temp.line('M13 las demás tareas (lavado de platos) no se pueden tocar: 0 filas',
    pg_temp.attempt(c_bozzo, array[format('update public.event_tasks set updated_by = %L, updated_at = now() where id = %L', c_bozzo, t_2)]), 'ok:0');
  v_rep := v_rep || pg_temp.line('M14 evento cerrado: un miembro común no cambia la cantidad (0 filas)',
    pg_temp.attempt(c_bozzo, array[format('update public.event_tasks set quantity = %L, updated_by = %L where id = %L', '9 kg', c_bozzo, t_c)]), 'ok:0');
  v_rep := v_rep || pg_temp.line('M15 …ni quien creó el evento',
    pg_temp.attempt(c_matil, array[format('update public.event_tasks set quantity = %L, updated_by = %L where id = %L', '9 kg', c_matil, t_c)]), 'ok:0');
  v_rep := v_rep || pg_temp.line('M16 …un admin sí',
    pg_temp.attempt(c_admin, array[
      format('update public.event_tasks set quantity = %L, updated_by = %L where id = %L', '5 kg', c_admin, t_c),
      format('select 1 from public.event_tasks where id = %L and quantity = %L', t_c, '5 kg')]), 'ok:1');
  v_rep := v_rep || pg_temp.line('M17 nadie tiene UPDATE de tabla sobre event_tasks (ni anon ni authenticated)',
    has_table_privilege('anon', 'public.event_tasks', 'update')::text || '/' || has_table_privilege('authenticated', 'public.event_tasks', 'update')::text,
    'false/false');
  v_rep := v_rep || pg_temp.line('M18 UPDATE por columna: authenticated solo quantity, updated_at y updated_by; anon ninguna',
    (select string_agg(a.attname, ',' order by a.attname) from pg_attribute a
      where a.attrelid = 'public.event_tasks'::regclass and a.attnum > 0 and not a.attisdropped
        and has_column_privilege('authenticated', 'public.event_tasks', a.attname, 'update'))
    || ' | ' ||
    (select count(*)::text from pg_attribute a
      where a.attrelid = 'public.event_tasks'::regclass and a.attnum > 0 and not a.attisdropped
        and has_column_privilege('anon', 'public.event_tasks', a.attname, 'update')),
    'quantity,updated_at,updated_by | 0');
  v_rep := v_rep || pg_temp.line('M19 policies de UPDATE de event_tasks: la permisiva y la de cierre',
    (select string_agg(policyname || '=' || permissive, ' | ' order by policyname) from pg_policies
      where schemaname = 'public' and tablename = 'event_tasks' and cmd = 'UPDATE'),
    'Cualquier logueado puede cambiar la cantidad de un insumo=PERMISSIVE | Evento cerrado: tareas solo de un admin (cambio)=RESTRICTIVE');
  v_rep := v_rep || pg_temp.line('M20 sacar a alguien de la tarea sigue andando (baja de una asignación)',
    pg_temp.attempt(c_javi, array[format('delete from public.event_tasks where id = %L', t_1)]), 'ok:1');
  v_rep := v_rep || pg_temp.line('M21 …y en un evento cerrado sigue sin poder un miembro común (0044)',
    pg_temp.attempt(c_javi, array[format('delete from public.event_tasks where id = %L', t_c)]), 'ok:0');

  -- ===================== N: insumos con mayúscula inicial =====================
  v_rep := v_rep || pg_temp.line('N0  el trigger existe y está activo',
    (select count(*)::text from pg_trigger
      where tgrelid = 'public.insumo_items'::regclass and tgname = 'insumo_items_capitalize_name' and tgenabled = 'O'), '1');
  v_rep := v_rep || pg_temp.line('N1  no queda ningún insumo en minúscula (los que había se corrigieron)',
    (select count(*)::text from public.insumo_items
      where name is distinct from upper(left(btrim(name), 1)) || substr(btrim(name), 2)), '0');
  v_rep := v_rep || pg_temp.line('N2  un insumo nuevo en minúscula se guarda con mayúscula (alta de una persona común)',
    pg_temp.attempt(c_javi, array[
      format('insert into public.insumo_items (name, created_by) values (%L, %L)', 'tz servilletas', c_javi),
      format('select 1 from public.insumo_items where name = %L', 'Tz servilletas')]), 'ok:1');
  v_rep := v_rep || pg_temp.line('N3  …con el mismo upsert que usa la app (on conflict (name))',
    pg_temp.attempt(c_javi, array[
      format('insert into public.insumo_items (name, created_by) values (%L, %L) on conflict (name) do update set created_by = excluded.created_by', 'tz upsert nuevo', c_javi),
      format('select 1 from public.insumo_items where name = %L', 'Tz upsert nuevo')]), 'ok:1');
  v_rep := v_rep || pg_temp.line('N4  se recortan los espacios de los costados',
    pg_temp.attempt(c_javi, array[
      format('insert into public.insumo_items (name, created_by) values (%L, %L)', '  tz pan fresco ', c_javi),
      format('select 1 from public.insumo_items where name = %L', 'Tz pan fresco')]), 'ok:1');
  v_rep := v_rep || pg_temp.line('N5  solo cambia la primera letra: el resto queda como se escribió',
    pg_temp.attempt(c_javi, array[
      format('insert into public.insumo_items (name, created_by) values (%L, %L)', 'tz coca COLA', c_javi),
      format('select 1 from public.insumo_items where name = %L', 'Tz coca COLA')]), 'ok:1');
  v_rep := v_rep || pg_temp.line('N6  la ñ también (se espera lo que da upper(''ñ'') en esta base)',
    pg_temp.attempt(c_javi, array[
      format('insert into public.insumo_items (name, created_by) values (%L, %L)', 'ñoquis tz', c_javi),
      format('select 1 from public.insumo_items where name = %L', upper('ñ') || 'oquis tz')]), 'ok:1');
  v_rep := v_rep || pg_temp.line('N7  lo que no empieza con letra queda igual (un número)',
    pg_temp.attempt(c_javi, array[
      format('insert into public.insumo_items (name, created_by) values (%L, %L)', '7up tz', c_javi),
      format('select 1 from public.insumo_items where name = %L', '7up tz')]), 'ok:1');
  v_rep := v_rep || pg_temp.line('N8  uno que ya empieza con mayúscula queda igual',
    pg_temp.attempt(c_javi, array[
      format('insert into public.insumo_items (name, created_by) values (%L, %L)', 'Tz Hielo seco', c_javi),
      format('select 1 from public.insumo_items where name = %L', 'Tz Hielo seco')]), 'ok:1');
  v_rep := v_rep || pg_temp.line('N9  dar de alta en minúscula uno ya cargado choca con el existente (no duplica)',
    pg_temp.attempt(c_javi, array[format('insert into public.insumo_items (name, created_by) values (%L, %L)', 'tz carne', c_javi)]), 'err:23505:%');
  v_rep := v_rep || pg_temp.line('N10 renombrar un insumo (admin) también lo deja con mayúscula',
    pg_temp.attempt(c_admin, array[
      format('update public.insumo_items set name = %L where id = %L', 'tz renombrado', i_b),
      format('select 1 from public.insumo_items where id = %L and name = %L', i_b, 'Tz renombrado')]), 'ok:1');

  -- Uno en minúscula como los de antes de la 0051 (sin pasar por el trigger): cambiarle solo el ícono no lo toca.
  i_low := pg_temp.mk_item_raw('tz minuscula', c_matil);
  if i_low is null then
    v_rep := v_rep || 'FALLA N11 no pude armar un insumo en minúscula (hace falta ser dueño de la tabla para desactivar el trigger un momento)';
  else
    v_low_before := (select name from public.insumo_items where id = i_low);
    v_rep := v_rep || pg_temp.line('N11 (armado) el insumo de prueba quedó en minúscula', v_low_before, 'tz minuscula');
    v_rep := v_rep || pg_temp.line('N12 cambiar solo el ícono no pasa por el trigger (no toca el nombre)',
      pg_temp.attempt(c_admin, array[
        format('update public.insumo_items set icon = %L where id = %L', '🥩', i_low),
        format('select 1 from public.insumo_items where id = %L and name = %L', i_low, 'tz minuscula')]), 'ok:1');
    v_rep := v_rep || pg_temp.line('N13 el trigger sigue activo después de armarlo',
      (select count(*)::text from pg_trigger
        where tgrelid = 'public.insumo_items'::regclass and tgname = 'insumo_items_capitalize_name' and tgenabled = 'O'), '1');
  end if;
  v_rep := v_rep || pg_temp.line('N14 nadie puede ejecutar la función del trigger por su cuenta (ni anon ni authenticated)',
    has_function_privilege('anon', 'private.capitalize_insumo_name()', 'execute')::text
      || '/' || has_function_privilege('authenticated', 'private.capitalize_insumo_name()', 'execute')::text,
    'false/false');
  v_rep := v_rep || pg_temp.line('N15 la función del trigger tiene el search_path fijo (vacío)',
    (select array_to_string(proconfig, ',') from pg_proc where oid = 'private.capitalize_insumo_name()'::regprocedure), 'search_path=""');

  v_fail := (select count(*) from unnest(v_rep) l where l like 'FALLA%');
  raise exception E'\n%\n\n=== % verificaciones, % con FALLA ===', array_to_string(v_rep, E'\n'), array_length(v_rep, 1), v_fail;
end
$verify$;
