-- MIGRACIÓN 008: zonas comunes por bloque (portal, escalera, ascensor, sótano, cubierta…).
-- Una zona común se guarda como una «vivienda» de la planta 300 cuya letra es el nombre de la zona.
-- Así tiene estado, fallos, fotos, exportación y modo sin conexión igual que una vivienda.
-- No cuenta en el resumen de viviendas de la obra (solo se cuentan las plantas < 200).
-- No borra ni modifica datos. Es seguro ejecutarla más de una vez.

-- Texto de una vivienda: "Bloque A · 2ºB", "… · Bajo A", "… · Ático A", "… · Trastero 12" o "… · Escalera"
create or replace function public.vivienda_label(v uuid)
returns text
language sql security definer stable
set search_path = public
as $$
  select b.nombre || ' · ' ||
         case when vi.planta = 0   then 'Bajo ' || vi.letra
              when vi.planta = 100 then 'Ático ' || vi.letra
              when vi.planta = 200 then 'Trastero ' || vi.letra
              when vi.planta = 300 then vi.letra
              else vi.planta::text || 'º' || vi.letra end
  from public.viviendas vi
  join public.bloques b on b.id = vi.bloque_id
  where vi.id = v;
$$;

-- Añade zonas comunes (por nombre) a un bloque. Las que ya existen (sin distinguir mayúsculas) se ignoran.
-- Devuelve cuántas se han creado.
create or replace function public.crear_zonas(p_bloque uuid, p_nombres text[])
returns int
language plpgsql security definer
set search_path = public
as $$
declare
  v_obra    uuid;
  v_creadas int;
begin
  if auth.uid() is null then
    raise exception 'No has iniciado sesión';
  end if;
  select obra_id into v_obra from public.bloques where id = p_bloque;
  if v_obra is null or not public.es_miembro(v_obra) then
    raise exception 'No tienes acceso a este bloque';
  end if;
  if p_nombres is null or array_length(p_nombres, 1) is null then
    raise exception 'Indica al menos una zona';
  end if;
  if array_length(p_nombres, 1) > 60 then
    raise exception 'Demasiadas zonas de una vez (máximo 60)';
  end if;

  with nuevas as (
    insert into public.viviendas (obra_id, bloque_id, planta, letra)
    select v_obra, p_bloque, 300, n.nombre
    from (
      select distinct on (lower(left(trim(x), 40))) left(trim(x), 40) as nombre
      from unnest(p_nombres) as x
      where trim(x) <> ''
      order by lower(left(trim(x), 40)), left(trim(x), 40)
    ) n
    where not exists (
      select 1 from public.viviendas e
      where e.bloque_id = p_bloque and e.planta = 300 and lower(e.letra) = lower(n.nombre)
    )
    returning 1
  )
  select count(*) into v_creadas from nuevas;
  return v_creadas;
end;
$$;

-- Quita una zona común, solo si no tiene ningún fallo.
create or replace function public.quitar_zona(p_vivienda uuid)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_obra  uuid;
  v_planta int;
begin
  if auth.uid() is null then
    raise exception 'No has iniciado sesión';
  end if;
  select obra_id, planta into v_obra, v_planta from public.viviendas where id = p_vivienda;
  if v_obra is null or not public.es_miembro(v_obra) then
    raise exception 'No tienes acceso a esta zona';
  end if;
  if v_planta <> 300 then
    raise exception 'Solo se pueden quitar zonas comunes';
  end if;
  if exists (select 1 from public.fallos where vivienda_id = p_vivienda) then
    raise exception 'Esta zona tiene fallos. Elimina antes sus fallos para poder quitarla.';
  end if;
  delete from public.viviendas where id = p_vivienda;
end;
$$;
