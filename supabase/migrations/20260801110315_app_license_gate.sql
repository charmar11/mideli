create table if not exists public.app_license (
  id smallint primary key default 1 check (id = 1),
  status text not null default 'active' check (status in ('active', 'suspended')),
  valid_until timestamptz not null default (now() + interval '30 days'),
  updated_at timestamptz not null default now()
);

insert into public.app_license (id, status, valid_until)
values (1, 'active', now() + interval '30 days')
on conflict (id) do nothing;

alter table public.app_license enable row level security;

revoke all on table public.app_license from anon, authenticated;
grant select on table public.app_license to anon, authenticated;
grant all on table public.app_license to service_role;

drop policy if exists "License status is readable" on public.app_license;
create policy "License status is readable"
on public.app_license
for select
to anon, authenticated
using (true);

comment on table public.app_license is
  'Singleton license state for the Mideli installation. Writes are server-only.';
