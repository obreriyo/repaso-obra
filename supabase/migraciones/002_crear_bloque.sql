-- MIGRACIÓN 002: permite añadir bloques a una obra ya creada.
-- No borra ni modifica datos. Es seguro ejecutarla más de una vez.

-- Añade un bloque (con sus viviendas) a una obra que ya existe.
-- p_plantas = [{"planta":0,"letras":["A","B"]},{"planta":1,"letras":["A","B","C"]},{"planta":100,"letras":["A"]}]
-- (planta 0 = bajo, 100 = ático)
create or replace function public.crear_bloque(p_obra uuid, p_nombre text, p_plantas jsonb)
returns uuid
language plpgsql security definer
set search_path = public
as $$
declare
  v_bloque  uuid;
  v_cuantas int;
  v_plantas int;
  v_letras  text[];
begin
  if auth.uid() is null then
    raise exception 'No has iniciado sesión';
  end if;
  if not public.es_miembro(p_obra) then
    raise exception 'No tienes acceso a esta obra';
  end if;
  if coalesce(trim(p_nombre), '') = '' then
    raise exception 'El bloque necesita un nombre';
  end if;
  if jsonb_typeof(p_plantas) <> 'array' then
    raise exception 'Formato de plantas incorrecto';
  end if;

  select count(*) into v_cuantas
  from jsonb_array_elements(p_plantas) p, jsonb_array_elements_text(p -> 'letras') l;
  if v_cuantas = 0 then
    raise exception 'El bloque no tiene viviendas';
  end if;

  select count(*) into v_plantas
  from jsonb_array_elements(p_plantas) p
  where jsonb_array_length(p -> 'letras') > 0;

  v_letras := array(
    select distinct l
    from jsonb_array_elements(p_plantas) p, jsonb_array_elements_text(p -> 'letras') l
    order by l
  );

  insert into public.bloques (obra_id, nombre, plantas, letras)
  values (p_obra, trim(p_nombre), v_plantas, v_letras)
  returning id into v_bloque;

  insert into public.viviendas (obra_id, bloque_id, planta, letra)
  select distinct p_obra, v_bloque, (p ->> 'planta')::int, l
  from jsonb_array_elements(p_plantas) p, jsonb_array_elements_text(p -> 'letras') l;

  return v_bloque;
end;
$$;
