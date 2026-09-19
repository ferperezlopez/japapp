-- "Informe de pago realizado": registra una transferencia real entre
-- dos miembros del grupo para saldar (total o parcialmente) una deuda
-- ya calculada — no es un gasto (nadie "consume" nada), es plata que
-- efectivamente cambió de mano. calcularBalances la resta directo
-- (mismo criterio que un gasto: quien paga suma a su balance, quien
-- recibe resta), así que la sugerencia de "para saldar cuentas" se
-- achica sola en el próximo cálculo, sin tocar los gastos originales.
create table public.debt_payments (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  from_user_id uuid not null references public.profiles (id),
  to_user_id uuid not null references public.profiles (id),
  amount numeric not null check (amount > 0),
  reported_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now()
);

alter table public.debt_payments enable row level security;

-- Mismo criterio de confianza que expenses: cualquier miembro del
-- grupo puede registrar un pago (no hace falta ser ninguno de los dos
-- involucrados — puede reportarlo un tercero que se enteró), queda
-- registrado quién lo hizo.
create policy "Los miembros pueden registrar pagos en sus grupos"
  on public.debt_payments for insert
  to authenticated
  with check (private.is_group_member(group_id) and reported_by = auth.uid());

-- Misma visibilidad que expenses: miembros del grupo, o cualquiera si
-- el grupo está enlazado a un evento.
create policy "Los miembros ven los pagos de sus grupos, o de un grupo de evento"
  on public.debt_payments for select
  to authenticated
  using (
    private.is_group_member(group_id)
    or exists (select 1 from public.events e where e.group_id = debt_payments.group_id)
  );

create policy "Quien registro el pago lo puede borrar"
  on public.debt_payments for delete
  to authenticated
  using (reported_by = auth.uid());
