-- MIGRACIÓN 006: varias personas con el mismo correo.
-- Cada cuenta puede tener una lista de personas (nombre + cargo). En cada móvil se elige quién
-- es cada uno y su nombre queda en los fallos y en la actividad.
-- No borra ni modifica datos. Es seguro ejecutarla más de una vez.

create table if not exists public.personas (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  nombre       text not null,
  cargo        text not null default 'encargado' check (cargo in ('jefe_obra', 'encargado', 'otro')),
  cargo_nombre text,
  created_at   timestamptz not null default now()
);

create index if not exists personas_user_idx on public.personas (user_id);

alter table public.personas enable row level security;

drop policy if exists personas_all on public.personas;
create policy personas_all on public.personas for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Nombre de la persona que apuntó / editó cada fallo (cuando la cuenta es compartida)
alter table public.fallos add column if not exists creado_por_persona text;
alter table public.fallos add column if not exists editado_por_persona text;
alter table public.actividad add column if not exists persona text;

-- Registro de actividad (ahora con el nombre de la persona)
create or replace function public.fallos_log()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  etiqueta text;
begin
  if tg_op = 'INSERT' then
    insert into public.actividad (obra_id, user_id, texto, persona)
    values (new.obra_id, auth.uid(),
      'añadió «' || left(new.descripcion, 60) || '» en ' || coalesce(public.vivienda_label(new.vivienda_id), ''),
      new.creado_por_persona);
  elsif tg_op = 'UPDATE' then
    if old.estado <> new.estado then
      etiqueta := case new.estado when 'reparado' then 'marcó como reparado' else 'reabrió' end;
    else
      etiqueta := 'editó';
    end if;
    insert into public.actividad (obra_id, user_id, texto, persona)
    values (new.obra_id, auth.uid(),
      etiqueta || ' «' || left(new.descripcion, 60) || '» en ' || coalesce(public.vivienda_label(new.vivienda_id), ''),
      new.editado_por_persona);
  elsif tg_op = 'DELETE' then
    -- si la obra entera se está borrando no se registra nada
    if exists (select 1 from public.obras where id = old.obra_id) then
      insert into public.actividad (obra_id, user_id, texto)
      values (old.obra_id, auth.uid(), 'eliminó «' || left(old.descripcion, 60) || '»');
    end if;
  end if;
  return null;
end;
$$;
