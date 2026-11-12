-- MIGRACIÓN 007: modificar un bloque ya creado (nombre, plantas, ático y letras de cada planta).
-- Añade las viviendas que faltan y quita solo las que ya no están Y no tienen ningún fallo.
-- Si una vivienda a quitar tiene fallos, no se quita nada y se avisa. Los trasteros no se tocan.
-- No borra ni modifica datos existentes. Es seguro ejecutarla más de una vez.

-- p_plantas = [{"planta":0,"letras":["A","B"]},{"planta":1,"letras":["A","B","C"]},{"planta":100,"letras":["A"]}]
-- (planta 0 = bajo, 100 = ático). Devuelve {"anadidas": n, "quitadas": n}.
create or replace function public.modificar_bloque(p_bloque uuid, p_nombre text, p_plantas jsonb)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_obra     uuid;
  v_plantas  int;
  v_letras   text[];
  v_cuantas  int;
  v_anadidas int;
  v_quitadas int;
  v_con_fallos text;
begin
  if auth.uid() is null then
    raise exception 'No has iniciado sesión';
  end if;
  select obra_id into v_obra from public.bloques where id = p_bloque;
  if v_obra is null or not public.es_miembro(v_obra) then
    raise exception 'No tienes acceso a este bloque';
  end if;
  if coalesce(trim(p_nombre), '') = '' then
    raise exception 'El bloque necesita un nombre';
  end if;
  if jsonb_typeof(p_plantas) <> 'array' then
    raise exception 'Formato de plantas incorrecto';
  end if;

  -- Lo que debe quedar (sin trasteros, que son la planta 200)
  create temp table if not exists _deseadas (planta int, letra text) on commit drop;
  delete from _deseadas;
  insert into _deseadas (planta, letra)
  select distinct (p ->> 'planta')::int, l
  from jsonb_array_elements(p_plantas) p, jsonb_array_elements_text(p -> 'letras') l
  where (p ->> 'planta')::int < 200;

  select count(*) into v_cuantas from _deseadas;
  if v_cuantas = 0 then
    raise exception 'El bloque necesita al menos una vivienda';
  end if;

  -- Viviendas que se quitarían pero tienen fallos: no se permite
  select string_agg(public.vivienda_label(vi.id), ', ') into v_con_fallos
  from public.viviendas vi
  where vi.bloque_id = p_bloque and vi.planta < 200
    and not exists (select 1 from _deseadas d where d.planta = vi.planta and d.letra = vi.letra)
    and exists (select 1 from public.fallos f where f.vivienda_id = vi.id);
  if v_con_fallos is not null then
    raise exception 'No se pueden quitar viviendas con fallos: %. Elimina antes sus fallos.', v_con_fallos;
  end if;

  delete from public.viviendas vi
  where vi.bloque_id = p_bloque and vi.planta < 200
    and not exists (select 1 from _deseadas d where d.planta = vi.planta and d.letra = vi.letra);
  get diagnostics v_quitadas = row_count;

  insert into public.viviendas (obra_id, bloque_id, planta, letra)
  select v_obra, p_bloque, d.planta, d.letra from _deseadas d
  on conflict (bloque_id, planta, letra) do nothing;
  get diagnostics v_anadidas = row_count;

  select count(distinct planta) into v_plantas from _deseadas;
  v_letras := array(select distinct letra from _deseadas order by letra);

  update public.bloques
  set nombre = trim(p_nombre), plantas = v_plantas, letras = v_letras
  where id = p_bloque;

  return jsonb_build_object('anadidas', v_anadidas, 'quitadas', v_quitadas);
end;
$$;
