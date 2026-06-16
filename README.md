# Shopping Checklist Tool

Static GitHub Pages checklist app with a Supabase item catalog.

## Data split

- Supabase stores long-term item data: `barcode`, `name`, `normal_price`, and `updated_at`.
- `localStorage` stores weekly shopping state only: barcode key, selected status, quantity, and temporary discount price.
- The frontend uses the Supabase anon key only. Never put a `service_role` key in this app.

## Supabase setup

Create this table in the Supabase SQL editor:

```sql
create table public.items (
  barcode text primary key,
  name text not null,
  normal_price numeric(10, 2) not null check (normal_price >= 0),
  updated_at timestamptz not null default now()
);

alter table public.items enable row level security;
```

For a public personal checklist where anyone with the site URL may read/add/update catalog items, use:

```sql
create policy "Public can read item catalog"
on public.items
for select
to anon
using (true);

create policy "Public can add item catalog rows"
on public.items
for insert
to anon
with check (
  barcode <> ''
  and name <> ''
  and normal_price >= 0
);

create policy "Public can update item catalog rows"
on public.items
for update
to anon
using (true)
with check (
  barcode <> ''
  and name <> ''
  and normal_price >= 0
);
```

Then update `supabase-config.js` with your Supabase project URL and anon key.

This policy is intentionally public because GitHub Pages has no server-side secret. It is fine for a small personal/shared catalog, but anyone who can access the site can write item rows. Use Supabase Auth and authenticated policies if you need private write access.
