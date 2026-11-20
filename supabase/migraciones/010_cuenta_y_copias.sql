-- MIGRACIÓN 010: eliminar la cuenta y restaurar una copia de seguridad en una cuenta nueva.
-- No borra ni modifica datos existentes. Es seguro ejecutarla más de una vez.

-- 1. Los avisos y marcas automáticas de los fallos se pueden silenciar dentro de una operación
--    (al importar una copia o al borrar una cuenta no deben llenar la actividad).
create or replace function public.fallos_touch()
returns trigger
language plpgsql
as $$
begin
  if coalesce(current_setting('repaso.silencio', true), '') = '1' then
    return new;
  end if;
  new.updated_at = now();
  new.editado_por = auth.uid();
  return new;
end;
$$;

create or replace function public.fallos_log()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  etiqueta text;
begin
  if coalesce(current_setting('repaso.silencio', true), '') = '1' then
    return null;
  end if;
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

-- 2. Eliminar la cuenta de quien la llama.
--    Borra sus obras (con todo lo que tienen) y su usuario. En las obras de otras personas
--    se quedan los fallos, pero sin su nombre. Las fotos del almacenamiento las borra antes la app.
create or replace function public.eliminar_cuenta()
returns void
language plpgsql security definer
set search_path = public, auth
as $$
declare
  v_user  uuid := auth.uid();
  v_email text;
begin
  if v_user is null then
    raise exception 'No has iniciado sesión';
  end if;

  perform set_config('repaso.silencio', '1', true);

  select lower(email) into v_email from public.profiles where id = v_user;

  delete from public.obras where created_by = v_user;

  update public.fallos set creado_por = null where creado_por = v_user;
  update public.fallos set editado_por = null where editado_por = v_user;
  update public.fotos set creado_por = null where creado_por = v_user;
  update public.actividad set user_id = null where user_id = v_user;
  update public.invitaciones set invitado_por = null where invitado_por = v_user;
  if v_email is not null then
    delete from public.invitaciones where lower(email) = v_email;
  end if;

  delete from auth.users where id = v_user;
end;
$$;

-- 3. Restaurar una copia de seguridad (el datos.json del zip) como una obra nueva de quien la llama.
--    Devuelve {"obra_id": ..., "fallos": {"id antiguo": "id nuevo", ...}} para que la app suba las fotos.
--    Respeta los límites de la versión gratuita (los avisan con "PLAN: ...").
create or replace function public.importar_copia(p_datos jsonb)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_obra     uuid;
  v_nombre   text;
  b          jsonb;
  v          jsonb;
  f          jsonb;
  v_nuevo    uuid;
  v_bloque   uuid;
  v_viv      uuid;
  v_fallos   jsonb := '{}'::jsonb;
  v_letras   text[];
begin
  if auth.uid() is null then
    raise exception 'No has iniciado sesión';
  end if;
  if p_datos is null or p_datos ->> 'formato' is distinct from 'repaso-obra-copia' then
    raise exception 'Este archivo no es una copia de seguridad de Repaso de obra';
  end if;

  v_nombre := trim(coalesce(p_datos #>> '{obra,nombre}', ''));
  if v_nombre = '' then
    raise exception 'La copia no tiene el nombre de la obra';
  end if;

  perform set_config('repaso.silencio', '1', true);

  create temporary table if not exists _imp_map (tipo text, viejo text, nuevo uuid) on commit drop;
  delete from _imp_map;

  insert into public.obras (nombre, direccion, created_by)
  values (v_nombre, nullif(trim(coalesce(p_datos #>> '{obra,direccion}', '')), ''), auth.uid())
  returning id into v_obra;

  insert into public.obra_miembros (obra_id, user_id) values (v_obra, auth.uid());

  for b in select * from jsonb_array_elements(coalesce(p_datos -> 'bloques', '[]'::jsonb)) loop
    v_letras := array(select jsonb_array_elements_text(coalesce(b -> 'letras', '[]'::jsonb)));
    insert into public.bloques (obra_id, nombre, plantas, letras)
    values (v_obra, b ->> 'nombre', greatest(1, coalesce((b ->> 'plantas')::int, 1)), v_letras)
    returning id into v_nuevo;
    insert into _imp_map values ('bloque', b ->> 'id', v_nuevo);
  end loop;

  for v in select * from jsonb_array_elements(coalesce(p_datos -> 'viviendas', '[]'::jsonb)) loop
    select nuevo into v_bloque from _imp_map where tipo = 'bloque' and viejo = v ->> 'bloque_id';
    if v_bloque is null then
      continue;
    end if;
    insert into public.viviendas (obra_id, bloque_id, planta, letra, estado)
    values (v_obra, v_bloque, (v ->> 'planta')::int, v ->> 'letra',
            coalesce(nullif(v ->> 'estado', ''), 'pendiente'))
    returning id into v_nuevo;
    insert into _imp_map values ('vivienda', v ->> 'id', v_nuevo);
  end loop;

  insert into public.subcontratas (obra_id, nombre)
  select distinct v_obra, trim(x ->> 'subcontrata')
  from jsonb_array_elements(coalesce(p_datos -> 'fallos', '[]'::jsonb)) x
  where coalesce(trim(x ->> 'subcontrata'), '') <> ''
  on conflict (obra_id, nombre) do nothing;

  for f in select * from jsonb_array_elements(coalesce(p_datos -> 'fallos', '[]'::jsonb)) loop
    select nuevo into v_viv from _imp_map
      where tipo = 'vivienda' and viejo = coalesce(f ->> 'vivienda_id', f #>> '{vivienda,id}');
    if v_viv is null then
      continue;
    end if;
    insert into public.fallos (obra_id, vivienda_id, estancia, tipo, descripcion, prioridad, estado, subcontrata,
                               creado_por, editado_por, creado_por_persona, editado_por_persona, created_at, updated_at)
    values (v_obra, v_viv,
            coalesce(nullif(f ->> 'estancia', ''), 'General'),
            coalesce(nullif(f ->> 'tipo', ''), 'Acabado'),
            coalesce(f ->> 'descripcion', ''),
            coalesce(nullif(f ->> 'prioridad', ''), 'media'),
            coalesce(nullif(f ->> 'estado', ''), 'abierto'),
            nullif(trim(coalesce(f ->> 'subcontrata', '')), ''),
            auth.uid(), auth.uid(),
            nullif(f ->> 'creado_por_persona', ''), nullif(f ->> 'editado_por_persona', ''),
            coalesce((f ->> 'created_at')::timestamptz, now()),
            coalesce((f ->> 'updated_at')::timestamptz, now()))
    returning id into v_nuevo;
    v_fallos := v_fallos || jsonb_build_object(f ->> 'id', v_nuevo);
  end loop;

  insert into public.actividad (obra_id, user_id, texto)
  values (v_obra, auth.uid(), 'restauró la obra desde una copia de seguridad');

  return jsonb_build_object('obra_id', v_obra, 'fallos', v_fallos);
end;
$$;

grant execute on function public.eliminar_cuenta() to authenticated;
grant execute on function public.importar_copia(jsonb) to authenticated;
