-- =====================================================================
-- Repaso de obra · esquema de base de datos (Supabase / PostgreSQL)
-- Ejecútalo entero en Supabase > SQL Editor > New query > Run.
-- Es seguro volver a ejecutarlo: usa "if not exists" / "or replace".
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- 1. TABLAS
-- ---------------------------------------------------------------------

create table if not exists public.profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  nombre     text not null default '',
  cargo      text not null default 'encargado' check (cargo in ('jefe_obra', 'encargado', 'otro')),
  cargo_nombre text,
  email      text,
  created_at timestamptz not null default now()
);

create table if not exists public.obras (
  id         uuid primary key default gen_random_uuid(),
  nombre     text not null,
  direccion  text,
  created_by uuid references public.profiles(id) default auth.uid(),
  created_at timestamptz not null default now()
);

create table if not exists public.obra_miembros (
  obra_id    uuid not null references public.obras(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (obra_id, user_id)
);

create table if not exists public.invitaciones (
  obra_id      uuid not null references public.obras(id) on delete cascade,
  email        text not null,
  invitado_por uuid references public.profiles(id) default auth.uid(),
  created_at   timestamptz not null default now(),
  primary key (obra_id, email)
);

create table if not exists public.bloques (
  id         uuid primary key default gen_random_uuid(),
  obra_id    uuid not null references public.obras(id) on delete cascade,
  nombre     text not null,
  plantas    int  not null check (plantas between 1 and 60),
  letras     text[] not null,
  created_at timestamptz not null default now()
);

-- planta 0 = planta baja
create table if not exists public.viviendas (
  id        uuid primary key default gen_random_uuid(),
  obra_id   uuid not null references public.obras(id) on delete cascade,
  bloque_id uuid not null references public.bloques(id) on delete cascade,
  planta    int  not null,
  letra     text not null,
  estado    text not null default 'pendiente' check (estado in ('pendiente', 'en_curso', 'revisada')),
  unique (bloque_id, planta, letra)
);

create table if not exists public.fallos (
  id          uuid primary key default gen_random_uuid(),
  obra_id     uuid not null references public.obras(id) on delete cascade,
  vivienda_id uuid not null references public.viviendas(id) on delete cascade,
  estancia    text not null,
  tipo        text not null default 'Acabado',
  descripcion text not null,
  prioridad   text not null default 'media' check (prioridad in ('alta', 'media', 'baja')),
  estado      text not null default 'abierto' check (estado in ('abierto', 'reparado')),
  subcontrata text,
  creado_por  uuid references public.profiles(id) default auth.uid(),
  editado_por uuid references public.profiles(id) default auth.uid(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists public.fotos (
  id         uuid primary key default gen_random_uuid(),
  obra_id    uuid not null references public.obras(id) on delete cascade,
  fallo_id   uuid not null references public.fallos(id) on delete cascade,
  path       text not null,
  creado_por uuid references public.profiles(id) default auth.uid(),
  created_at timestamptz not null default now()
);

create table if not exists public.subcontratas (
  id         uuid primary key default gen_random_uuid(),
  obra_id    uuid not null references public.obras(id) on delete cascade,
  nombre     text not null,
  created_at timestamptz not null default now(),
  unique (obra_id, nombre)
);

create table if not exists public.actividad (
  id         uuid primary key default gen_random_uuid(),
  obra_id    uuid not null references public.obras(id) on delete cascade,
  user_id    uuid references public.profiles(id) default auth.uid(),
  texto      text not null,
  created_at timestamptz not null default now()
);

create index if not exists viviendas_bloque_idx  on public.viviendas (bloque_id);
create index if not exists fallos_obra_idx       on public.fallos (obra_id, created_at desc);
create index if not exists fallos_vivienda_idx   on public.fallos (vivienda_id);
create index if not exists fotos_fallo_idx       on public.fotos (fallo_id);
create index if not exists subcontratas_obra_idx on public.subcontratas (obra_id);
create index if not exists actividad_obra_idx    on public.actividad (obra_id, created_at desc);

-- ---------------------------------------------------------------------
-- 2. FUNCIONES AUXILIARES
-- ---------------------------------------------------------------------

-- ¿El usuario actual pertenece a esta obra?
create or replace function public.es_miembro(o uuid)
returns boolean
language sql security definer stable
set search_path = public
as $$
  select exists (
    select 1 from public.obra_miembros m
    where m.obra_id = o and m.user_id = auth.uid()
  );
$$;

-- ¿El usuario actual comparte alguna obra con esta persona?
create or replace function public.comparte_obra(uid uuid)
returns boolean
language sql security definer stable
set search_path = public
as $$
  select exists (
    select 1
    from public.obra_miembros a
    join public.obra_miembros b on a.obra_id = b.obra_id
    where a.user_id = auth.uid() and b.user_id = uid
  );
$$;

-- Texto de una vivienda: "Bloque A · 2ºB", "Bloque A · Bajo A" o "Bloque A · Ático A"
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


-- ---------------------------------------------------------------------
-- 3. TRIGGERS
-- ---------------------------------------------------------------------

-- Crea el perfil al registrarse
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

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Guarda quién y cuándo editó un fallo
create or replace function public.fallos_touch()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  new.editado_por = auth.uid();
  return new;
end;
$$;

drop trigger if exists fallos_touch_trg on public.fallos;
create trigger fallos_touch_trg
  before update on public.fallos
  for each row execute function public.fallos_touch();

-- Registro de actividad
create or replace function public.fallos_log()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  etiqueta text;
begin
  if tg_op = 'INSERT' then
    insert into public.actividad (obra_id, user_id, texto)
    values (new.obra_id, auth.uid(),
      'añadió «' || left(new.descripcion, 60) || '» en ' || coalesce(public.vivienda_label(new.vivienda_id), ''));
  elsif tg_op = 'UPDATE' then
    if old.estado <> new.estado then
      etiqueta := case new.estado when 'reparado' then 'marcó como reparado' else 'reabrió' end;
    else
      etiqueta := 'editó';
    end if;
    insert into public.actividad (obra_id, user_id, texto)
    values (new.obra_id, auth.uid(),
      etiqueta || ' «' || left(new.descripcion, 60) || '» en ' || coalesce(public.vivienda_label(new.vivienda_id), ''));
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

drop trigger if exists fallos_log_trg on public.fallos;
create trigger fallos_log_trg
  after insert or update or delete on public.fallos
  for each row execute function public.fallos_log();

-- ---------------------------------------------------------------------
-- 4. VISTAS (con los permisos del usuario que consulta)
-- ---------------------------------------------------------------------

create or replace view public.obras_resumen with (security_invoker = true) as
select
  o.id, o.nombre, o.direccion, o.created_at,
  (select count(*) from public.bloques  b where b.obra_id = o.id)::int as bloques,
  (select count(*) from public.viviendas v where v.obra_id = o.id and v.planta < 200)::int as viviendas,
  (select count(*) from public.viviendas v where v.obra_id = o.id and v.planta < 200 and v.estado = 'revisada')::int as revisadas,
  (select count(*) from public.fallos f where f.obra_id = o.id and f.estado = 'abierto')::int as fallos_abiertos
from public.obras o;

create or replace view public.viviendas_resumen with (security_invoker = true) as
select
  v.id, v.obra_id, v.bloque_id, v.planta, v.letra, v.estado,
  b.nombre as bloque_nombre,
  (select count(*) from public.fallos f where f.vivienda_id = v.id and f.estado = 'abierto')::int  as fallos_abiertos,
  (select count(*) from public.fallos f where f.vivienda_id = v.id and f.estado = 'reparado')::int as fallos_reparados
from public.viviendas v
join public.bloques b on b.id = v.bloque_id;

-- ---------------------------------------------------------------------
-- 5. FUNCIONES QUE USA LA APP (RPC)
-- ---------------------------------------------------------------------

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

-- Invita a una persona por correo. Si ya tiene cuenta entra directamente;
-- si no, la invitación queda pendiente y se acepta sola cuando se registre.
create or replace function public.invitar_miembro(p_obra uuid, p_email text)
returns text
language plpgsql security definer
set search_path = public
as $$
declare
  v_email text := lower(trim(p_email));
  v_user  uuid;
begin
  if not public.es_miembro(p_obra) then
    raise exception 'No tienes acceso a esta obra';
  end if;
  if v_email = '' or position('@' in v_email) = 0 then
    raise exception 'Correo no válido';
  end if;

  select id into v_user from auth.users where lower(email) = v_email limit 1;

  if v_user is not null then
    insert into public.obra_miembros (obra_id, user_id)
    values (p_obra, v_user)
    on conflict do nothing;
    return 'anadido';
  end if;

  insert into public.invitaciones (obra_id, email)
  values (p_obra, v_email)
  on conflict do nothing;
  return 'pendiente';
end;
$$;

-- Acepta las invitaciones pendientes del usuario que acaba de entrar.
create or replace function public.aceptar_invitaciones()
returns int
language plpgsql security definer
set search_path = public
as $$
declare
  v_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
  n int;
begin
  if auth.uid() is null or v_email = '' then
    return 0;
  end if;

  insert into public.obra_miembros (obra_id, user_id)
  select i.obra_id, auth.uid()
  from public.invitaciones i
  where lower(i.email) = v_email
  on conflict do nothing;

  get diagnostics n = row_count;

  delete from public.invitaciones where lower(email) = v_email;
  return n;
end;
$$;

-- ---------------------------------------------------------------------
-- 6. SEGURIDAD (Row Level Security)
--    Cada persona solo ve y modifica las obras a las que pertenece.
--    Dentro de una obra, todos los miembros pueden hacerlo todo.
-- ---------------------------------------------------------------------

alter table public.profiles       enable row level security;
alter table public.obras          enable row level security;
alter table public.obra_miembros  enable row level security;
alter table public.invitaciones   enable row level security;
alter table public.bloques        enable row level security;
alter table public.viviendas      enable row level security;
alter table public.fallos         enable row level security;
alter table public.fotos          enable row level security;
alter table public.subcontratas   enable row level security;
alter table public.actividad      enable row level security;

drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select to authenticated
  using (id = auth.uid() or public.comparte_obra(id));

drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists obras_select on public.obras;
create policy obras_select on public.obras for select to authenticated
  using (public.es_miembro(id));

drop policy if exists obras_update on public.obras;
create policy obras_update on public.obras for update to authenticated
  using (public.es_miembro(id)) with check (public.es_miembro(id));

drop policy if exists obras_delete on public.obras;
create policy obras_delete on public.obras for delete to authenticated
  using (public.es_miembro(id));

drop policy if exists miembros_select on public.obra_miembros;
create policy miembros_select on public.obra_miembros for select to authenticated
  using (public.es_miembro(obra_id));

drop policy if exists miembros_delete on public.obra_miembros;
create policy miembros_delete on public.obra_miembros for delete to authenticated
  using (public.es_miembro(obra_id));

drop policy if exists invitaciones_all on public.invitaciones;
create policy invitaciones_all on public.invitaciones for all to authenticated
  using (public.es_miembro(obra_id)) with check (public.es_miembro(obra_id));

do $$
declare t text;
begin
  foreach t in array array['bloques', 'viviendas', 'fallos', 'fotos', 'subcontratas'] loop
    execute format('drop policy if exists %1$s_all on public.%1$I', t);
    execute format(
      'create policy %1$s_all on public.%1$I for all to authenticated
         using (public.es_miembro(obra_id)) with check (public.es_miembro(obra_id))', t);
  end loop;
end $$;

drop policy if exists actividad_select on public.actividad;
create policy actividad_select on public.actividad for select to authenticated
  using (public.es_miembro(obra_id));

-- ---------------------------------------------------------------------
-- 7. ALMACENAMIENTO DE FOTOS
--    Bucket privado "fotos". Cada archivo vive en  <obra_id>/<fallo_id>/<archivo>.jpg
-- ---------------------------------------------------------------------

insert into storage.buckets (id, name, public)
values ('fotos', 'fotos', false)
on conflict (id) do nothing;

drop policy if exists fotos_storage_select on storage.objects;
create policy fotos_storage_select on storage.objects for select to authenticated
  using (bucket_id = 'fotos' and public.es_miembro(((storage.foldername(name))[1])::uuid));

drop policy if exists fotos_storage_insert on storage.objects;
create policy fotos_storage_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'fotos' and public.es_miembro(((storage.foldername(name))[1])::uuid));

drop policy if exists fotos_storage_delete on storage.objects;
create policy fotos_storage_delete on storage.objects for delete to authenticated
  using (bucket_id = 'fotos' and public.es_miembro(((storage.foldername(name))[1])::uuid));

-- ---------------------------------------------------------------------
-- Cargos y trasteros (migraciones 004 y 005)
-- ---------------------------------------------------------------------

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

-- ---------------------------------------------------------------------
-- Personas de una cuenta compartida (migración 006)
-- ---------------------------------------------------------------------

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

-- Modificar un bloque ya creado (migración 007)
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

-- Zonas comunes por bloque (migración 008)
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

-- ---------------------------------------------------------------------
-- Planes gratuito y completo (migración 009)
-- ---------------------------------------------------------------------
-- 1. Columna plan (las cuentas que ya existen pasan a «completo» la primera vez)
alter table public.profiles add column if not exists plan text;
update public.profiles set plan = 'completo' where plan is null;
alter table public.profiles alter column plan set default 'gratis';
alter table public.profiles alter column plan set not null;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_plan_check') then
    alter table public.profiles add constraint profiles_plan_check check (plan in ('gratis', 'completo'));
  end if;
end $$;
-- Nadie puede cambiarse el plan desde la app (ya solo se puede actualizar el nombre; ver migración 004)

-- 2. Correos que tienen plan completo desde el principio (se rellena a mano en Table Editor)
create table if not exists public.correos_autorizados (
  email      text primary key,
  nota       text,
  created_at timestamptz not null default now()
);
alter table public.correos_autorizados enable row level security;
revoke all on public.correos_autorizados from anon, authenticated;

-- Si el correo ya tiene cuenta, pasa a completo al añadirlo a la lista
create or replace function public.correo_autorizado_alta()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  new.email := lower(trim(new.email));
  update public.profiles set plan = 'completo' where lower(email) = new.email;
  return new;
end;
$$;

drop trigger if exists correos_autorizados_alta on public.correos_autorizados;
create trigger correos_autorizados_alta
  before insert or update on public.correos_autorizados
  for each row execute function public.correo_autorizado_alta();

-- 3. Cuentas nuevas: plan según la lista de correos autorizados
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  v_cargo text := coalesce(new.raw_user_meta_data ->> 'cargo', '');
  v_plan  text := 'gratis';
begin
  if v_cargo not in ('jefe_obra', 'otro') then v_cargo := 'encargado'; end if;
  if exists (select 1 from public.correos_autorizados where email = lower(trim(coalesce(new.email, '')))) then
    v_plan := 'completo';
  end if;
  insert into public.profiles (id, nombre, cargo, cargo_nombre, email, plan)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'nombre', ''),
    v_cargo,
    case when v_cargo = 'otro'
         then coalesce(nullif(left(trim(new.raw_user_meta_data ->> 'cargo_nombre'), 40), ''), 'Operario')
         else null end,
    new.email,
    v_plan
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

-- 4. Funciones de plan
create or replace function public.plan_de_usuario(p_user uuid)
returns text
language sql security definer stable
set search_path = public
as $$
  select coalesce((select plan from public.profiles where id = p_user), 'completo');
$$;

-- Plan de una obra = plan de quien la creó (sin creador conocido: completo)
create or replace function public.plan_de_obra(p_obra uuid)
returns text
language sql security definer stable
set search_path = public
as $$
  select coalesce(
    (select p.plan from public.obras o join public.profiles p on p.id = o.created_by where o.id = p_obra),
    'completo'
  );
$$;

-- 5. Límites (los comprueba la base de datos; la app solo los explica)
-- Una sola obra propia
create or replace function public.limite_obras()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  if new.created_by is not null
     and public.plan_de_usuario(new.created_by) = 'gratis'
     and (select count(*) from public.obras where created_by = new.created_by) >= 1 then
    raise exception 'PLAN: Con la versión gratuita solo puedes tener una obra.';
  end if;
  return new;
end;
$$;
drop trigger if exists limite_obras on public.obras;
create trigger limite_obras before insert on public.obras
  for each row execute function public.limite_obras();

-- Sin invitar a nadie (el creador de la obra sí puede entrar en la suya)
create or replace function public.limite_miembros()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  v_creador uuid;
begin
  select created_by into v_creador from public.obras where id = new.obra_id;
  if new.user_id is distinct from v_creador and public.plan_de_obra(new.obra_id) = 'gratis' then
    raise exception 'PLAN: Invitar a tu equipo es de la versión de pago.';
  end if;
  return new;
end;
$$;
drop trigger if exists limite_miembros on public.obra_miembros;
create trigger limite_miembros before insert on public.obra_miembros
  for each row execute function public.limite_miembros();

create or replace function public.limite_invitaciones()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  if public.plan_de_obra(new.obra_id) = 'gratis' then
    raise exception 'PLAN: Invitar a tu equipo es de la versión de pago.';
  end if;
  return new;
end;
$$;
drop trigger if exists limite_invitaciones on public.invitaciones;
create trigger limite_invitaciones before insert on public.invitaciones
  for each row execute function public.limite_invitaciones();

-- Sin añadir personas a la cuenta (un solo usuario)
create or replace function public.limite_personas()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  if public.plan_de_usuario(new.user_id) = 'gratis' then
    raise exception 'PLAN: Añadir más personas a la cuenta es de la versión de pago.';
  end if;
  return new;
end;
$$;
drop trigger if exists limite_personas on public.personas;
create trigger limite_personas before insert on public.personas
  for each row execute function public.limite_personas();

-- Solo viviendas: sin trasteros (planta 200) ni zonas comunes (planta 300)
create or replace function public.limite_zonas()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  if new.planta >= 200 and public.plan_de_obra(new.obra_id) = 'gratis' then
    raise exception 'PLAN: Los trasteros y las zonas comunes son de la versión de pago.';
  end if;
  return new;
end;
$$;
drop trigger if exists limite_zonas on public.viviendas;
create trigger limite_zonas before insert on public.viviendas
  for each row execute function public.limite_zonas();

-- Máximo 15 fotos por obra
create or replace function public.limite_fotos()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  if public.plan_de_obra(new.obra_id) = 'gratis'
     and (select count(*) from public.fotos where obra_id = new.obra_id) >= 15 then
    raise exception 'PLAN: La versión gratuita permite 15 fotos. Pasa a la versión de pago para añadir más.';
  end if;
  return new;
end;
$$;
drop trigger if exists limite_fotos on public.fotos;
create trigger limite_fotos before insert on public.fotos
  for each row execute function public.limite_fotos();

-- 6. Estado del plan para la app: {plan, plan_obra, obras_propias, fotos_obra, max_obras, max_fotos}
create or replace function public.estado_plan(p_obra uuid default null)
returns jsonb
language plpgsql security definer stable
set search_path = public
as $$
declare
  v_plan_obra text;
  v_fotos     int := 0;
begin
  if auth.uid() is null then
    raise exception 'No has iniciado sesión';
  end if;
  if p_obra is not null then
    if not public.es_miembro(p_obra) then
      raise exception 'No tienes acceso a esta obra';
    end if;
    v_plan_obra := public.plan_de_obra(p_obra);
    select count(*) into v_fotos from public.fotos where obra_id = p_obra;
  end if;
  return jsonb_build_object(
    'plan', public.plan_de_usuario(auth.uid()),
    'plan_obra', v_plan_obra,
    'obras_propias', (select count(*) from public.obras where created_by = auth.uid()),
    'fotos_obra', v_fotos,
    'max_obras', 1,
    'max_fotos', 15
  );
end;
$$;
