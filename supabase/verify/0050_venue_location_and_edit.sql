-- Verificación de la migración 0050 (ubicación de las sedes y edición controlada) contra una base
-- que YA la tiene aplicada. Pegar entero en el SQL editor de Supabase y ejecutar.
--
-- No deja nada: es un solo bloque DO que arma sedes y eventos de prueba, simula a cada persona
-- (`set local role authenticated` + el JWT de cada una) y termina SIEMPRE con un `raise exception`
-- cuyo mensaje es el informe. El error «=== N verificaciones, 0 con FALLA ===» que muestra el editor
-- es lo esperado, y justamente por ese error se deshace todo.
--
-- Cada línea del informe empieza con OK o FALLA.
--   J: las sedes. Las columnas y sus restricciones (par lat/lng, rango, no 0,0), que ya no hay UPDATE
--      directo (ni para un admin) y que el alta sigue andando, update_venue (sesión, sede inexistente,
--      nombre vacío o repetido, par incompleto, edición de alguien que no la creó, propagación del
--      nombre a los eventos —también a uno cerrado, que nadie puede tocar de otra forma— y que cambiar
--      solo el link no renombra nada), set_venue_coordinates (solo completa lo que falta) y que `anon`
--      no puede ejecutar ninguna de las dos.
--   K: el clima guarda con qué ubicación se pidió (lat/lng) y sigue aceptando las filas sin ubicación.
--
-- Los ids de personas son de ESTA base (Fercho es el admin; Mati L, Javi y Bozzo son miembros comunes).
do $verify$
declare
  v_rep text[] := '{}';
  v_fail int;
  c_admin constant uuid := '9840e373-0124-40ea-8a5d-89e5ba5b9d73';
  c_matil constant uuid := 'c12485a6-48df-4b32-8ab2-437e173fb309';
  c_javi  constant uuid := '704d9d64-defd-499e-b769-1c2fa0c0d720';
  c_bozzo constant uuid := 'f1db3ce1-16fd-411e-9ead-32b93764f520';
  v_a uuid; v_b uuid; v_c uuid; v_d uuid;
  e_open uuid; e_closed uuid; e_other uuid; e_w1 uuid; e_w2 uuid; e_w3 uuid;
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

  -- Llama a update_venue como p_uid (sin cambiar de rol, para poder mirar el resultado después) y devuelve
  -- 'ok' o 'err:<sqlstate>:<mensaje>'. El sub-bloque deshace lo que la función alcanzó a hacer si falla.
  create function pg_temp.vedit(p_uid uuid, p_venue uuid, p_name text, p_address text, p_host uuid, p_lat double precision, p_lng double precision) returns text language plpgsql as $f$
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
    perform set_config('request.jwt.claim.sub', coalesce(p_uid::text, ''), true);
    begin
      perform public.update_venue(p_venue, p_name, p_address, p_host, p_lat, p_lng);
      return 'ok';
    exception when others then
      return 'err:' || sqlstate || ':' || left(sqlerrm, 90);
    end;
  end $f$;

  -- Igual, para set_venue_coordinates.
  create function pg_temp.vcoords(p_uid uuid, p_venue uuid, p_lat double precision, p_lng double precision) returns text language plpgsql as $f$
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
    perform set_config('request.jwt.claim.sub', coalesce(p_uid::text, ''), true);
    begin
      perform public.set_venue_coordinates(p_venue, p_lat, p_lng);
      return 'ok';
    exception when others then
      return 'err:' || sqlstate || ':' || left(sqlerrm, 90);
    end;
  end $f$;

  create function pg_temp.mk_venue(p_name text, p_creator uuid, p_address text, p_lat double precision, p_lng double precision) returns uuid language plpgsql as $f$
  declare v_id uuid;
  begin
    insert into public.venues (name, created_by, address, lat, lng) values (p_name, p_creator, p_address, p_lat, p_lng) returning id into v_id;
    return v_id;
  end $f$;

  create function pg_temp.mk_event_at(p_name text, p_date timestamptz, p_creator uuid, p_location text) returns uuid language plpgsql as $f$
  declare v_id uuid;
  begin
    insert into public.events (name, event_date, created_by, has_futbol, location) values (p_name, p_date, p_creator, true, p_location) returning id into v_id;
    return v_id;
  end $f$;

  -- Cómo quedó una sede: nombre / link / casa de / lat / lng.
  create function pg_temp.venue_state(p_venue uuid) returns text language sql as $f$
    select v.name || ' / ' || coalesce(v.address, '-') || ' / ' || coalesce(left(v.host_user_id::text, 4), '-')
        || ' / ' || coalesce(v.lat::text, '-') || ' / ' || coalesce(v.lng::text, '-')
      from public.venues v where v.id = p_venue;
  $f$;

  -- ===================== datos de prueba =====================
  v_a := pg_temp.mk_venue('T sede A', c_matil, 'https://maps.app.goo.gl/aaa', -34.60, -58.38);
  v_b := pg_temp.mk_venue('T sede B', c_matil, null, null, null);
  v_c := pg_temp.mk_venue('T sede C', c_matil, 'https://maps.app.goo.gl/ccc', null, null);
  v_d := pg_temp.mk_venue('T sede D', c_matil, 'https://maps.app.goo.gl/ddd', null, null);
  e_open   := pg_temp.mk_event_at('T evento abierto',  now() + interval '5 days',  c_matil, 'T sede A');
  e_closed := pg_temp.mk_event_at('T evento cerrado',  now() - interval '3 days',  c_matil, 'T sede A');
  e_other  := pg_temp.mk_event_at('T evento de otra',  now() + interval '6 days',  c_matil, 'T sede B');

  -- ===================== J: las sedes =====================
  v_rep := v_rep || pg_temp.line('J0  las columnas lat/lng existen en venues y en event_weather',
    (select count(*)::text from information_schema.columns
      where table_schema = 'public' and table_name in ('venues', 'event_weather') and column_name in ('lat', 'lng')), '4');

  -- el alta
  v_rep := v_rep || pg_temp.line('J1  alta con ubicación por quien la crea',
    pg_temp.attempt(c_matil, array[format('insert into public.venues (name, created_by, lat, lng) values (%L, %L, -34.55, -58.45)', 'T alta', c_matil)]), 'ok:1');
  v_rep := v_rep || pg_temp.line('J2  alta con latitud sin longitud',
    pg_temp.attempt(c_matil, array[format('insert into public.venues (name, created_by, lat) values (%L, %L, -34.55)', 'T alta', c_matil)]), 'err:23514:%');
  v_rep := v_rep || pg_temp.line('J3  alta con latitud fuera de rango',
    pg_temp.attempt(c_matil, array[format('insert into public.venues (name, created_by, lat, lng) values (%L, %L, 91, -58.45)', 'T alta', c_matil)]), 'err:23514:%');
  v_rep := v_rep || pg_temp.line('J4  alta con longitud fuera de rango',
    pg_temp.attempt(c_matil, array[format('insert into public.venues (name, created_by, lat, lng) values (%L, %L, -34.55, 181)', 'T alta', c_matil)]), 'err:23514:%');
  v_rep := v_rep || pg_temp.line('J5  alta en 0,0 (no es una sede real)',
    pg_temp.attempt(c_matil, array[format('insert into public.venues (name, created_by, lat, lng) values (%L, %L, 0, 0)', 'T alta', c_matil)]), 'err:23514:%');
  v_rep := v_rep || pg_temp.line('J5b alta sobre el ecuador o sobre el meridiano 0 (solo 0,0 se rechaza)',
    pg_temp.attempt(c_matil, array[
      format('insert into public.venues (name, created_by, lat, lng) values (%L, %L, 0, -58.45)', 'T alta ecuador', c_matil),
      format('insert into public.venues (name, created_by, lat, lng) values (%L, %L, -34.55, 0)', 'T alta meridiano', c_matil)]), 'ok:1');
  v_rep := v_rep || pg_temp.line('J6  alta a nombre de otra persona',
    pg_temp.attempt(c_javi, array[format('insert into public.venues (name, created_by) values (%L, %L)', 'T alta', c_matil)]), 'err:42501:%');
  v_rep := v_rep || pg_temp.line('J7  el alta con «ya existe, no hagas nada» (el upsert de la app) sigue andando y no duplica',
    pg_temp.attempt(c_javi, array[format('insert into public.venues (name, created_by) values (%L, %L) on conflict (name) do nothing', 'T sede A', c_javi)]), 'ok:0');

  -- ya no hay UPDATE directo
  v_rep := v_rep || pg_temp.line('J8  UPDATE directo de una persona común: 0 filas',
    pg_temp.attempt(c_javi, array[format('update public.venues set name = %L where id = %L', 'T hackeada', v_a)]), 'ok:0');
  v_rep := v_rep || pg_temp.line('J9  UPDATE directo de un admin: 0 filas',
    pg_temp.attempt(c_admin, array[format('update public.venues set address = %L where id = %L', 'T hackeada', v_a)]), 'ok:0');
  v_rep := v_rep || pg_temp.line('J10 la sede no cambió',
    pg_temp.venue_state(v_a), 'T sede A / https://maps.app.goo.gl/aaa / - / -34.6 / -58.38');
  v_rep := v_rep || pg_temp.line('J11 policies de venues: solo select e insert',
    (select string_agg(cmd, ',' order by cmd) from pg_policies where schemaname = 'public' and tablename = 'venues'), 'INSERT,SELECT');

  -- update_venue: rechazos
  v_rep := v_rep || pg_temp.line('J12 update_venue sin sesión',
    pg_temp.vedit(null, v_a, 'T sede A', null, null, null, null), 'err:28000:%');
  v_rep := v_rep || pg_temp.line('J13 update_venue de una sede que no existe',
    pg_temp.vedit(c_javi, gen_random_uuid(), 'T x', null, null, null, null), 'err:P0002:%');
  v_rep := v_rep || pg_temp.line('J14 update_venue con el nombre vacío',
    pg_temp.vedit(c_javi, v_a, '   ', null, null, null, null), 'err:22023:%');
  v_rep := v_rep || pg_temp.line('J15 update_venue con el nombre de otra sede',
    pg_temp.vedit(c_javi, v_a, 'T sede B', null, null, null, null), 'err:23505:Ya hay un lugar con ese nombre.%');
  v_rep := v_rep || pg_temp.line('J16 update_venue con latitud sin longitud',
    pg_temp.vedit(c_javi, v_a, 'T sede A', null, null, -34.5, null), 'err:22023:%');
  v_rep := v_rep || pg_temp.line('J17 update_venue con una latitud fuera de rango',
    pg_temp.vedit(c_javi, v_a, 'T sede A', null, null, 95, -58.4), 'err:23514:%');
  v_rep := v_rep || pg_temp.line('J18 update_venue con una persona que no existe como casa',
    pg_temp.vedit(c_javi, v_a, 'T sede A', null, gen_random_uuid(), null, null), 'err:23503:%');
  v_rep := v_rep || pg_temp.line('J19 nada de lo rechazado cambió la sede',
    pg_temp.venue_state(v_a), 'T sede A / https://maps.app.goo.gl/aaa / - / -34.6 / -58.38');

  -- update_venue: la edición de alguien que no la creó (ni es admin) y la propagación del nombre
  v_rep := v_rep || pg_temp.line('J20 el privilegio de ejecución lo tiene authenticated',
    pg_temp.attempt(c_javi, array[format('select public.update_venue(%L, %L, %L, null, null, null)', v_b, 'T sede B', 'https://x.test')]), 'ok:1');
  v_rep := v_rep || pg_temp.line('J21 una persona que no la creó la renombra, le cambia el link, la casa y la ubicación',
    pg_temp.vedit(c_javi, v_a, '  T sede A2 ', ' https://maps.app.goo.gl/nuevo ', c_bozzo, -34.55, -58.45), 'ok');
  v_rep := v_rep || pg_temp.line('J22 la sede quedó con lo nuevo (nombre sin espacios sobrantes)',
    pg_temp.venue_state(v_a), 'T sede A2 / https://maps.app.goo.gl/nuevo / f1db / -34.55 / -58.45');
  v_rep := v_rep || pg_temp.line('J23 el evento abierto que la usaba la sigue nombrando',
    (select location from public.events where id = e_open), 'T sede A2');
  v_rep := v_rep || pg_temp.line('J24 también el evento cerrado, que nadie puede tocar de otra forma',
    (select location from public.events where id = e_closed), 'T sede A2');
  v_rep := v_rep || pg_temp.line('J25 (contraste) quien lo creó no puede cambiarle el lugar a un evento cerrado',
    pg_temp.attempt(c_matil, array[format('update public.events set location = %L where id = %L', 'T otra', e_closed)]), 'ok:0');
  v_rep := v_rep || pg_temp.line('J26 un evento de otra sede no se toca',
    (select location from public.events where id = e_other), 'T sede B');
  v_rep := v_rep || pg_temp.line('J27 ningún evento quedó con el nombre viejo',
    (select count(*)::text from public.events where location = 'T sede A'), '0');

  -- cambiar solo el link no renombra
  v_rep := v_rep || pg_temp.line('J28 cambiar solo el link de una sede',
    pg_temp.vedit(c_bozzo, v_b, 'T sede B', 'https://maps.app.goo.gl/bbb', null, -34.7, -58.5), 'ok');
  v_rep := v_rep || pg_temp.line('J29 …deja el nombre y los eventos como estaban',
    pg_temp.venue_state(v_b) || ' | ' || (select location from public.events where id = e_other),
    'T sede B / https://maps.app.goo.gl/bbb / - / -34.7 / -58.5 | T sede B');
  v_rep := v_rep || pg_temp.line('J30 sacar el link y la ubicación (dejarlos vacíos)',
    pg_temp.vedit(c_bozzo, v_b, 'T sede B', '  ', null, null, null), 'ok');
  v_rep := v_rep || pg_temp.line('J31 …los deja en nulo',
    pg_temp.venue_state(v_b), 'T sede B / - / - / - / -');

  -- set_venue_coordinates: solo completa lo que falta
  v_rep := v_rep || pg_temp.line('J32 set_venue_coordinates sin sesión',
    pg_temp.vcoords(null, v_c, -34.5, -58.5), 'err:28000:%');
  v_rep := v_rep || pg_temp.line('J33 set_venue_coordinates con latitud sin longitud',
    pg_temp.vcoords(c_javi, v_c, -34.5, null), 'err:22023:%');
  v_rep := v_rep || pg_temp.line('J34 set_venue_coordinates fuera de rango',
    pg_temp.vcoords(c_javi, v_c, 95, -58.5), 'err:23514:%');
  v_rep := v_rep || pg_temp.line('J35 set_venue_coordinates completa una sede sin ubicación',
    pg_temp.vcoords(c_javi, v_c, -34.5, -58.5), 'ok');
  v_rep := v_rep || pg_temp.line('J36 …y queda con esa ubicación',
    pg_temp.venue_state(v_c), 'T sede C / https://maps.app.goo.gl/ccc / - / -34.5 / -58.5');
  v_rep := v_rep || pg_temp.line('J37 set_venue_coordinates nunca pisa una ubicación ya cargada',
    pg_temp.vcoords(c_javi, v_c, -31.4, -64.2) || ' | ' || pg_temp.venue_state(v_c),
    'ok | T sede C / https://maps.app.goo.gl/ccc / - / -34.5 / -58.5');
  v_rep := v_rep || pg_temp.line('J38 set_venue_coordinates de una sede que no existe no hace nada ni falla',
    pg_temp.vcoords(c_javi, gen_random_uuid(), -34.5, -58.5), 'ok');

  -- una persona común (sin permiso de UPDATE sobre venues) completa la ubicación a través de la función
  v_rep := v_rep || pg_temp.line('J38b una persona común completa la ubicación a través de la función (security definer)',
    pg_temp.attempt(c_javi, array[
      format('select public.set_venue_coordinates(%L, -34.5, -58.5)', v_d),
      format('select 1 from public.venues where id = %L and lat = -34.5 and lng = -58.5', v_d)]), 'ok:1');

  -- anon
  v_rep := v_rep || pg_temp.line('J39 anon no puede ejecutar update_venue ni set_venue_coordinates',
    has_function_privilege('anon', 'public.update_venue(uuid,text,text,uuid,double precision,double precision)', 'execute')::text
      || '/' || has_function_privilege('anon', 'public.set_venue_coordinates(uuid,double precision,double precision)', 'execute')::text,
    'false/false');
  v_rep := v_rep || pg_temp.line('J40 authenticated sí puede ejecutar las dos',
    has_function_privilege('authenticated', 'public.update_venue(uuid,text,text,uuid,double precision,double precision)', 'execute')::text
      || '/' || has_function_privilege('authenticated', 'public.set_venue_coordinates(uuid,double precision,double precision)', 'execute')::text,
    'true/true');

  -- ===================== K: el clima guarda con qué ubicación se pidió =====================
  e_w1 := pg_temp.mk_event_at('T clima 1', now() + interval '5 days', c_matil, 'T sede A2');
  e_w2 := pg_temp.mk_event_at('T clima 2', now() + interval '5 days', c_matil, 'T sede A2');
  e_w3 := pg_temp.mk_event_at('T clima 3', now() + interval '5 days', c_matil, 'T sede A2');
  v_rep := v_rep || pg_temp.line('K1  se guarda el pronóstico con la ubicación de la sede',
    pg_temp.attempt(c_javi, array[format('insert into public.event_weather (event_id, forecast_for, temperature_c, lat, lng) values (%L, now()::timestamp, 20, -34.55, -58.45)', e_w1)]), 'ok:1');
  v_rep := v_rep || pg_temp.line('K2  y se puede actualizar con otra ubicación mientras el evento no empezó',
    pg_temp.attempt(c_javi, array[
      format('insert into public.event_weather (event_id, forecast_for, temperature_c, lat, lng) values (%L, now()::timestamp, 20, -34.55, -58.45)', e_w1),
      format('update public.event_weather set lat = -31.4, lng = -64.2 where event_id = %L', e_w1)]), 'ok:1');
  v_rep := v_rep || pg_temp.line('K3  una fila sin ubicación (como las de antes de la 0050) sigue siendo válida',
    pg_temp.attempt(c_javi, array[format('insert into public.event_weather (event_id, forecast_for, temperature_c) values (%L, now()::timestamp, 20)', e_w2)]), 'ok:1');
  v_rep := v_rep || pg_temp.line('K4  latitud sin longitud',
    pg_temp.attempt(c_javi, array[format('insert into public.event_weather (event_id, forecast_for, lat) values (%L, now()::timestamp, -34.55)', e_w3)]), 'err:23514:%');
  v_rep := v_rep || pg_temp.line('K5  ubicación fuera de rango',
    pg_temp.attempt(c_javi, array[format('insert into public.event_weather (event_id, forecast_for, lat, lng) values (%L, now()::timestamp, -34.55, 200)', e_w3)]), 'err:23514:%');

  v_rep := v_rep || pg_temp.line('K5b latitud fuera de rango',
    pg_temp.attempt(c_javi, array[format('insert into public.event_weather (event_id, forecast_for, lat, lng) values (%L, now()::timestamp, 95, -58.45)', e_w3)]), 'err:23514:%');

  v_fail := (select count(*) from unnest(v_rep) l where l like 'FALLA%');
  raise exception E'\n%\n\n=== % verificaciones, % con FALLA ===', array_to_string(v_rep, E'\n'), array_length(v_rep, 1), v_fail;
end
$verify$;
