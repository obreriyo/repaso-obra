-- MIGRACIÓN 004: tercer cargo «otro» con nombre editable (operario, albañil…).
-- Solo el jefe de obra o un encargado pueden cambiar el cargo de las personas.
-- No borra ni modifica datos. Es seguro ejecutarla más de una vez.

alter table public.profiles add column if not exists cargo_nombre text;

-- Admite el cargo «otro» (se quita la restricción antigua que solo permitía dos)
do $$
declare r record;
begin
  for r in
    select conname from pg_constraint
    where conrelid = 'public.profiles'::regclass and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%cargo%'
  loop
    execute format('alter table public.profiles drop constraint %I', r.conname);
  end loop;
end $$;

alter table public.profiles
  add constraint profiles_cargo_check check (cargo in ('jefe_obra', 'encargado', 'otro'));

-- Al registrarse se guarda el cargo elegido (y su nombre si es «otro»)
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  v_cargo text := coalesce(new.raw_user_meta_data ->> 'cargo', '');
begin
  if v_cargo not in ('jefe_obra', 'otro') then v_cargo := 'encargado'; end if;
  insert into public.profiles (id, nombre, cargo, cargo_nombre, email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'nombre', ''),
    v_cargo,
    case when v_cargo = 'otro'
         then coalesce(nullif(left(trim(new.raw_user_meta_data ->> 'cargo_nombre'), 40), ''), 'Operario')
         else null end,
    new.email
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

-- Nadie puede cambiarse el cargo directamente: solo con cambiar_cargo (abajo)
revoke update on public.profiles from authenticated;
grant update (nombre) on public.profiles to authenticated;

-- Cambia el cargo de una persona. Solo si quien lo pide es jefe de obra o encargado
-- y la persona comparte alguna obra con él (o es él mismo).
create or replace function public.cambiar_cargo(p_user uuid, p_cargo text, p_nombre text default null)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_mio text;
begin
  if auth.uid() is null then
    raise exception 'No has iniciado sesión';
  end if;
  select cargo into v_mio from public.profiles where id = auth.uid();
  if v_mio is null or v_mio not in ('jefe_obra', 'encargado') then
    raise exception 'Solo el jefe de obra o un encargado pueden cambiar cargos';
  end if;
  if p_cargo not in ('jefe_obra', 'encargado', 'otro') then
    raise exception 'Cargo no válido';
  end if;
  if p_user <> auth.uid() and not public.comparte_obra(p_user) then
    raise exception 'Esa persona no está en tus obras';
  end if;
  update public.profiles
  set cargo = p_cargo,
      cargo_nombre = case when p_cargo = 'otro'
                          then coalesce(nullif(left(trim(p_nombre), 40), ''), 'Operario')
                          else null end
  where id = p_user;
end;
$$;
