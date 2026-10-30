-- MIGRACIÓN 001: plantas con distinto número de viviendas y ático.
-- No borra ni modifica datos: solo sustituye dos funciones. Es seguro ejecutarla más de una vez.

-- Texto de una vivienda: "Bloque A · 2ºB", "Bloque A · Bajo A" o "Bloque A · Ático A"
create or replace function public.vivienda_label(v uuid)
returns text
language sql security definer stable
set search_path = public
as $$
  select b.nombre || ' · ' ||
         case when vi.planta = 0   then 'Bajo ' || vi.letra
              when vi.planta = 100 then 'Ático ' || vi.letra
              else vi.planta::text || 'º' || vi.letra end
  from public.viviendas vi
  join public.bloques b on b.id = vi.bloque_id
  where vi.id = v;
$$;

-- Crea una obra con sus bloques y genera las viviendas.
-- Formato nuevo (cada planta con sus letras; planta 0 = bajo, 100 = ático):
--   [{"nombre":"Bloque A","plantas":[{"planta":0,"letras":["A","B"]},
--                                    {"planta":1,"letras":["A","B","C"]},
--                                    {"planta":100,"letras":["A"]}]}]
-- Formato antiguo (todas las plantas iguales), que sigue funcionando:
--   [{"nombre":"Bloque A","plantas":6,"letras":["A","B","C"]}]
create or replace function public.crear_obra(p_nombre text, p_direccion text, p_bloques jsonb)
returns uuid
language plpgsql security definer
set search_path = public
as $$
declare
  v_obra    uuid;
  v_bloque  uuid;
  v_plantas int;
  v_letras  text[];
  v_cuantas int;
  b         jsonb;
begin
  if auth.uid() is null then
    raise exception 'No has iniciado sesión';
  end if;
  if coalesce(trim(p_nombre), '') = '' then
    raise exception 'La obra necesita un nombre';
  end if;

  insert into public.obras (nombre, direccion, created_by)
  values (trim(p_nombre), nullif(trim(coalesce(p_direccion, '')), ''), auth.uid())
  returning id into v_obra;

  insert into public.obra_miembros (obra_id, user_id) values (v_obra, auth.uid());

  for b in select * from jsonb_array_elements(coalesce(p_bloques, '[]'::jsonb)) loop
    if jsonb_typeof(b -> 'plantas') = 'array' then
      -- Formato nuevo: letras distintas en cada planta
      select count(*) into v_cuantas
      from jsonb_array_elements(b -> 'plantas') p, jsonb_array_elements_text(p -> 'letras') l;
      if v_cuantas = 0 then
        raise exception 'El bloque "%" no tiene viviendas', b ->> 'nombre';
      end if;

      select count(*) into v_plantas
      from jsonb_array_elements(b -> 'plantas') p
      where jsonb_array_length(p -> 'letras') > 0;

      v_letras := array(
        select distinct l
        from jsonb_array_elements(b -> 'plantas') p, jsonb_array_elements_text(p -> 'letras') l
        order by l
      );

      insert into public.bloques (obra_id, nombre, plantas, letras)
      values (v_obra, b ->> 'nombre', v_plantas, v_letras)
      returning id into v_bloque;

      insert into public.viviendas (obra_id, bloque_id, planta, letra)
      select distinct v_obra, v_bloque, (p ->> 'planta')::int, l
      from jsonb_array_elements(b -> 'plantas') p, jsonb_array_elements_text(p -> 'letras') l;
    else
      -- Formato antiguo: mismas letras en todas las plantas
      v_plantas := (b ->> 'plantas')::int;
      v_letras  := array(select jsonb_array_elements_text(b -> 'letras'));

      insert into public.bloques (obra_id, nombre, plantas, letras)
      values (v_obra, b ->> 'nombre', v_plantas, v_letras)
      returning id into v_bloque;

      insert into public.viviendas (obra_id, bloque_id, planta, letra)
      select v_obra, v_bloque, p, l
      from generate_series(0, v_plantas - 1) as p, unnest(v_letras) as l;
    end if;
  end loop;

  return v_obra;
end;
$$;
