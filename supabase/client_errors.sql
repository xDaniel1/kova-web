-- Applied to Kova Tower on 2026-11-09 via the Management API. Kept here for reference.
-- Browser error reports from the web app. Insert-only for everyone; only admins (is_admin()) read.
create table if not exists public.client_errors (
    id bigint generated always as identity primary key,
    app text not null default 'web',
    message text not null,
    stack text,
    url text,
    user_agent text,
    user_id uuid references auth.users (id) on delete set null,
    created_at timestamptz not null default now()
);
alter table public.client_errors enable row level security;
create policy "Anyone can file an error report" on public.client_errors for insert to anon, authenticated
    with check (length(message) <= 2000 and (stack is null or length(stack) <= 8000));
create policy "Admins read error reports" on public.client_errors for select to authenticated using (public.is_admin());
create index if not exists client_errors_created_idx on public.client_errors (created_at desc);
