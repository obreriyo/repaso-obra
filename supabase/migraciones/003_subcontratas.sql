-- MIGRACIÓN 003: lista de subcontratas por obra.
-- No borra ni modifica datos. Es seguro ejecutarla más de una vez.

create table if not exists public.subcontratas (
  id         uuid primary key default gen_random_uuid(),
  obra_id    uuid not null references public.obras(id) on delete cascade,
  nombre     text not null,
  created_at timestamptz not null default now(),
  unique (obra_id, nombre)
);

create index if not exists subcontratas_obra_idx on public.subcontratas (obra_id);

alter table public.subcontratas enable row level security;

drop policy if exists subcontratas_all on public.subcontratas;
create policy subcontratas_all on public.subcontratas for all to authenticated
  using (public.es_miembro(obra_id)) with check (public.es_miembro(obra_id));

-- Las subcontratas que ya se habían escrito en fallos pasan a la lista
insert into public.subcontratas (obra_id, nombre)
select distinct obra_id, trim(subcontrata)
from public.fallos
where coalesce(trim(subcontrata), '') <> ''
on conflict (obra_id, nombre) do nothing;
