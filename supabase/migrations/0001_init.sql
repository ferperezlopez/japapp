-- JAPapp: perfiles, grupos de gastos y division de gastos estilo Tricount.

-- 1. Perfiles -----------------------------------------------------------

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  name text,
  avatar_url text,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "Los perfiles son visibles para cualquier usuario logueado"
  on public.profiles for select
  to authenticated
  using (true);

create policy "Un usuario puede actualizar su propio perfil"
  on public.profiles for update
  to authenticated
  using (id = auth.uid());

-- Crea automaticamente el perfil cuando alguien se registra via Supabase Auth.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, name, avatar_url)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'),
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 2. Grupos ---------------------------------------------------------------

create table if not exists public.groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now()
);

create table if not exists public.group_members (
  group_id uuid not null references public.groups (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (group_id, user_id)
);

-- Funcion security definer para evitar recursion infinita en las policies
-- de group_members (una policy de group_members no puede consultar la
-- propia tabla group_members directamente sin RLS recursivo).
create or replace function public.is_group_member(p_group_id uuid, p_user_id uuid default auth.uid())
returns boolean
language sql
security definer set search_path = public
stable
as $$
  select exists (
    select 1 from public.group_members
    where group_id = p_group_id and user_id = p_user_id
  );
$$;

alter table public.groups enable row level security;
alter table public.group_members enable row level security;

create policy "Los miembros ven los grupos a los que pertenecen"
  on public.groups for select
  to authenticated
  using (public.is_group_member(id));

create policy "Cualquier usuario logueado puede crear un grupo"
  on public.groups for insert
  to authenticated
  with check (created_by = auth.uid());

create policy "Los miembros ven la lista de miembros de sus grupos"
  on public.group_members for select
  to authenticated
  using (public.is_group_member(group_id));

create policy "Los miembros pueden sumar gente a sus grupos"
  on public.group_members for insert
  to authenticated
  with check (public.is_group_member(group_id) or user_id = auth.uid());

create policy "Un miembro puede salirse de un grupo"
  on public.group_members for delete
  to authenticated
  using (user_id = auth.uid());

-- 3. Gastos -----------------------------------------------------------------

create table if not exists public.expenses (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  description text not null,
  amount numeric(12, 2) not null check (amount > 0),
  paid_by uuid not null references public.profiles (id),
  expense_date date not null default current_date,
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now()
);

create table if not exists public.expense_shares (
  expense_id uuid not null references public.expenses (id) on delete cascade,
  user_id uuid not null references public.profiles (id),
  share_amount numeric(12, 2) not null check (share_amount >= 0),
  primary key (expense_id, user_id)
);

alter table public.expenses enable row level security;
alter table public.expense_shares enable row level security;

create policy "Los miembros ven los gastos de sus grupos"
  on public.expenses for select
  to authenticated
  using (public.is_group_member(group_id));

create policy "Los miembros pueden cargar gastos en sus grupos"
  on public.expenses for insert
  to authenticated
  with check (public.is_group_member(group_id) and created_by = auth.uid());

create policy "Quien creo el gasto lo puede borrar"
  on public.expenses for delete
  to authenticated
  using (created_by = auth.uid());

create policy "Los miembros ven las partes de los gastos de sus grupos"
  on public.expense_shares for select
  to authenticated
  using (
    exists (
      select 1 from public.expenses e
      where e.id = expense_id and public.is_group_member(e.group_id)
    )
  );

create policy "Se pueden cargar partes de gastos junto con el gasto"
  on public.expense_shares for insert
  to authenticated
  with check (
    exists (
      select 1 from public.expenses e
      where e.id = expense_id and e.created_by = auth.uid()
    )
  );
