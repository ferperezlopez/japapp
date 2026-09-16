-- Chequeo de nombres parecidos al crear una cuenta nueva, para avisar
-- (no bloquear) si probablemente ya existe un perfil de esa persona
-- con otro email. security definer porque la policy de "profiles" for
-- select exige `to authenticated` — quien está creando una cuenta
-- todavía no lo está.
create extension if not exists pg_trgm with schema extensions;

create or replace function public.find_similar_profile_names(candidate_name text)
returns table (name text)
language sql
security definer
set search_path = public
stable
as $$
  select p.name
  from public.profiles p
  where p.name is not null
    and extensions.similarity(lower(p.name), lower(candidate_name)) > 0.4
  order by extensions.similarity(lower(p.name), lower(candidate_name)) desc
  limit 3
$$;

grant execute on function public.find_similar_profile_names(text) to anon, authenticated;
