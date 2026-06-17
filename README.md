# Shopping Checklist Tool

Static GitHub Pages checklist app with a Supabase item catalog.

## Data split

- Supabase stores long-term item data: `id`, `user_id`, `barcode`, `name`, `category`, `latest_price`, and `updated_at`.
- `localStorage` stores weekly shopping state only: barcode key, selected status, quantity, and temporary discount price.
- The frontend uses the Supabase anon key only. Never put a `service_role` key in this app.
- Supabase Auth email/password login gates the checklist UI.

## Supabase setup

Create this table in the Supabase SQL editor:

```sql
create table public.items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  barcode text not null,
  name text not null,
  category text not null default '',
  latest_price numeric(10, 2) not null check (latest_price >= 0),
  updated_at timestamptz not null default now(),
  unique (user_id, barcode)
);

alter table public.items enable row level security;
```

If your `items` table already exists, add the category column:

```sql
alter table public.items
add column if not exists category text not null default '';
```

For the login-gated checklist, use authenticated policies:

```sql
create policy "Authenticated users can read item catalog"
on public.items
for select
to authenticated
using (user_id = auth.uid());

create policy "Authenticated users can add item catalog rows"
on public.items
for insert
to authenticated
with check (
  user_id = auth.uid()
  and barcode <> ''
  and name <> ''
  and latest_price >= 0
);

create policy "Authenticated users can update item catalog rows"
on public.items
for update
to authenticated
using (user_id = auth.uid())
with check (
  user_id = auth.uid()
  and barcode <> ''
  and name <> ''
  and latest_price >= 0
);
```

Optional helper to keep `updated_at` current from database-side changes:

```sql
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger set_items_updated_at
before update on public.items
for each row
execute function public.set_updated_at();
```

Then update `supabase-config.js` with your Supabase project URL and anon key.

Keep email/password signups enabled in Supabase Auth if you want the app's Sign Up button to create accounts. If you want invite-only access, create users in Supabase and disable public signups.

For GitHub Pages email confirmations, add your deployed app URL to Supabase Auth redirect URLs, for example:

```text
https://eric-chio.github.io/Project_shopping_list/
```

The app sends its current page URL as `emailRedirectTo` during signup, so confirmation links return to the checklist page instead of the GitHub Pages root.
