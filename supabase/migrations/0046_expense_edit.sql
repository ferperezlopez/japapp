-- Editar un gasto: quien lo cargó o un admin.
--
-- Hasta ahora un gasto solo se podía borrar (policy "Quien creo el gasto lo
-- puede borrar", 0001) y, para corregir un monto o un participante, había que
-- borrarlo y cargarlo de nuevo. El único UPDATE sobre expenses era el del admin
-- (0034, pensado para el emoji).
--
-- Se hace con una función y no con policies de UPDATE/DELETE sobre
-- expenses y expense_shares, a propósito:
--   · Editar es reemplazar las partes (borrar las viejas y cargar las nuevas) y
--     tiene que ser atómico: si fallara a la mitad, quedaría un gasto sin
--     partes o con partes que no suman, y los balances saldrían mal.
--   · Las policies "Evento saldado..." de la 0044 miran el estado del grupo en
--     cada sentencia, y a mitad de una edición ese estado puede cambiar (al
--     sacar las partes viejas, el resto del grupo puede quedar saldado): con
--     policies, una edición legítima de quien no es admin se rechazaría por un
--     estado transitorio. Acá se mira UNA vez, al principio.
-- Por eso es security definer, con la autorización escrita a mano y a la vista:
--   · quien cargó el gasto (created_by, igual que la policy de borrado) o un
--     admin; ninguna otra persona;
--   · con el evento saldado, solo un admin (spec 022): el mismo criterio de
--     private.group_is_settled que usan las policies de la 0044;
--   · el monto mayor a 0, una descripción, al menos una parte, y las partes
--     tienen que sumar el monto (tolerancia de un centavo, por el redondeo).
-- No cambia ninguna policy: los permisos de borrar, cargar y mirar siguen igual,
-- y un UPDATE directo a expenses sigue siendo solo del admin.
--
-- Ver specs/002-gastos.md. Sin cambios de datos; se revierte con
--   drop function public.update_expense(uuid, text, uuid, numeric, uuid, date, jsonb);

create or replace function public.update_expense(
  p_expense_id uuid,
  p_description text,
  p_item_id uuid,
  p_amount numeric,
  p_paid_by uuid,
  p_expense_date date,
  p_shares jsonb -- [{"user_id": "<uuid>", "share_amount": 12.34}, ...]
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_created_by uuid;
  v_group_id uuid;
  v_count integer;
  v_total numeric;
begin
  if v_uid is null then
    raise exception 'No estás logueado.' using errcode = '28000';
  end if;

  -- El candado de fila serializa dos ediciones simultáneas del mismo gasto.
  select x.created_by, x.group_id
    into v_created_by, v_group_id
    from public.expenses x
   where x.id = p_expense_id
     for update;
  if not found then
    raise exception 'No se encontró ese gasto.' using errcode = 'P0002';
  end if;

  if not (v_created_by = v_uid or public.is_admin(v_uid)) then
    raise exception 'Solo quien cargó el gasto o un admin puede editarlo.'
      using errcode = '42501';
  end if;

  if private.group_is_settled(v_group_id) and not public.is_admin(v_uid) then
    raise exception 'Este evento ya está saldado: pedile a un admin que corrija el gasto.'
      using errcode = '42501';
  end if;

  if coalesce(btrim(p_description), '') = '' then
    raise exception 'Poné una descripción.' using errcode = '22023';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'El monto tiene que ser mayor a 0.' using errcode = '22023';
  end if;
  if p_paid_by is null then
    raise exception 'Elegí quién pagó.' using errcode = '22023';
  end if;
  if p_shares is null or jsonb_typeof(p_shares) <> 'array' then
    raise exception 'Elegí entre quiénes se divide el gasto.' using errcode = '22023';
  end if;

  select count(*), coalesce(sum((s ->> 'share_amount')::numeric), 0)
    into v_count, v_total
    from jsonb_array_elements(p_shares) s;
  if v_count = 0 then
    raise exception 'Elegí entre quiénes se divide el gasto.' using errcode = '22023';
  end if;
  if abs(v_total - p_amount) > 0.01 then
    raise exception 'Las partes no suman el monto del gasto.' using errcode = '22023';
  end if;

  update public.expenses
     set description = btrim(p_description),
         item_id = p_item_id,
         amount = p_amount,
         paid_by = p_paid_by,
         expense_date = coalesce(p_expense_date, expense_date)
   where id = p_expense_id;

  delete from public.expense_shares where expense_id = p_expense_id;

  insert into public.expense_shares (expense_id, user_id, share_amount)
  select p_expense_id, (s ->> 'user_id')::uuid, (s ->> 'share_amount')::numeric
    from jsonb_array_elements(p_shares) s;
end;
$$;

-- Las funciones de public quedan ejecutables por anon por los default
-- privileges de Supabase: se lo sacamos explícitamente (sin sesión no hay
-- quién edite, y la función igual lo rechaza, pero no tiene por qué ni
-- aparecer como callable).
revoke all on function public.update_expense(uuid, text, uuid, numeric, uuid, date, jsonb)
  from public, anon;
grant execute on function public.update_expense(uuid, text, uuid, numeric, uuid, date, jsonb)
  to authenticated;
