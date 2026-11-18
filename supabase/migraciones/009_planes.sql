-- MIGRACIÓN 009: plan gratuito y plan completo.
--
-- Plan GRATUITO: 1 obra propia, sin invitar a nadie ni añadir personas, máximo 15 fotos por obra,
--                solo viviendas (sin trasteros ni zonas comunes).
-- Plan COMPLETO: sin esos límites.
-- Los límites dependen de quien CREÓ la obra: si es plan completo, las personas invitadas
-- trabajan sin límites en esa obra.
--
-- Quien ya tiene cuenta pasa a plan COMPLETO (nadie pierde nada). Las cuentas nuevas empiezan
-- en plan GRATUITO, salvo que su correo esté en la tabla correos_autorizados (entonces, COMPLETO).
-- Para cambiar el plan de alguien: Supabase > Table Editor > profiles > columna plan.
-- Los límites no borran ni modifican datos existentes: solo impiden AÑADIR más.
-- Es seguro ejecutarla más de una vez.

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
