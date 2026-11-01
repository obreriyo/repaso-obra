-- MIGRACIÓN 005: trasteros por bloque.
-- Un trastero se guarda como una vivienda de la «planta 200» cuya letra es su número.
-- Así tiene estado, fallos, fotos, exportación y modo sin conexión igual que una vivienda.
-- No borra ni modifica datos. Es seguro ejecutarla más de una vez.

-- Texto de una vivienda: "Bloque A · 2ºB", "Bloque A · Bajo A", "… · Ático A" o "… · Trastero 12"
create or replace function public.vivienda_label(v uuid)
returns text
language sql security definer stable
set search_path = public
as $$
  select b.nombre || ' · ' ||
         case when vi.planta = 0   then 'Bajo ' || vi.letra
              when vi.planta = 100 then 'Ático ' || vi.letra
              when vi.planta = 200 then 'Trastero ' || vi.letra
              else vi.planta::text || 'º' || vi.letra end
  from public.viviendas vi
  join public.bloques b on b.id = vi.bloque_id
  where vi.id = v;
$$;

-- El resumen de la obra cuenta solo viviendas (los trasteros no)
create or replace view public.obras_resumen with (security_invoker = true) as
select
  o.id, o.nombre, o.direccion, o.created_at,
  (select count(*) from public.bloques  b where b.obra_id = o.id)::int as bloques,
  (select count(*) from public.viviendas v where v.obra_id = o.id and v.planta < 200)::int as viviendas,
  (select count(*) from public.viviendas v where v.obra_id = o.id and v.planta < 200 and v.estado = 'revisada')::int as revisadas,
  (select count(*) from public.fallos f where f.obra_id = o.id and f.estado = 'abierto')::int as fallos_abiertos
from public.obras o;

-- Añade trasteros (por número) a un bloque. Los que ya existen se ignoran.
-- Devuelve cuántos se han creado.
create or replace function public.crear_trasteros(p_bloque uuid, p_numeros text[])
returns int
language plpgsql security definer
set search_path = public
as $$
declare
  v_obra  uuid;
  v_creados int;
begin
  if auth.uid() is null then
    raise exception 'No has iniciado sesión';
  end if;
  select obra_id into v_obra from public.bloques where id = p_bloque;
  if v_obra is null or not public.es_miembro(v_obra) then
    raise exception 'No tienes acceso a este bloque';
  end if;
  if p_numeros is null or array_length(p_numeros, 1) is null then
    raise exception 'Indica al menos un trastero';
  end if;
  if array_length(p_numeros, 1) > 500 then
    raise exception 'Demasiados trasteros de una vez (máximo 500)';
  end if;

  with nuevos as (
    insert into public.viviendas (obra_id, bloque_id, planta, letra)
    select distinct v_obra, p_bloque, 200, left(trim(n), 12)
    from unnest(p_numeros) as n
    where trim(n) <> ''
    on conflict (bloque_id, planta, letra) do nothing
    returning 1
  )
  select count(*) into v_creados from nuevos;
  return v_creados;
end;
$$;
