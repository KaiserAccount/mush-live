-- MUSH schema. Not applied in this pass: SUPABASE_URL and SUPABASE_ANON_KEY
-- were missing from the repo, the Railway Mush project, and Cursor secrets.
-- Do not point this at Clusters, Retention, or wallet_ops.
-- RLS is the simpler anon policies. Header-based request.headers policies
-- were not used. The browser still sends device_id on every write.
-- After apply, expose schema `mush` to PostgREST (Accept-Profile / Content-Profile).

create schema if not exists mush;

create table if not exists mush.profile (
  id uuid primary key default gen_random_uuid(),
  device_id text unique not null,
  created_at timestamptz not null default now()
);

create table if not exists mush.order_def (
  code text primary key,
  sort int not null,
  recipient text not null,
  need text not null,
  deliver_camp text not null,
  miss_line text not null
);

create table if not exists mush.run_state (
  device_id text primary key references mush.profile(device_id) on delete cascade,
  pin_mile numeric not null default 0,
  best_mile numeric not null default 0,
  dogs_unlocked int not null default 2,
  continues_used int not null default 0,
  active_order text references mush.order_def(code),
  orders_delivered int not null default 0,
  misses int not null default 0,
  updated_at timestamptz not null default now()
);

create table if not exists mush.delivery (
  id bigint generated always as identity primary key,
  device_id text not null references mush.profile(device_id) on delete cascade,
  order_code text not null references mush.order_def(code),
  status text not null check (status in ('active','delivered','missed')),
  mile numeric,
  at timestamptz not null default now()
);

create table if not exists mush.event (
  id bigint generated always as identity primary key,
  device_id text not null,
  name text not null,
  mile numeric,
  payload jsonb not null default '{}',
  at timestamptz not null default now()
);

alter table mush.profile enable row level security;
alter table mush.run_state enable row level security;
alter table mush.delivery enable row level security;
alter table mush.event enable row level security;
alter table mush.order_def enable row level security;

grant usage on schema mush to anon, authenticated;
grant select on mush.order_def to anon;
grant select, insert, update, delete on mush.profile to anon;
grant select, insert, update, delete on mush.run_state to anon;
grant select, insert, update, delete on mush.delivery to anon;
grant select, insert on mush.event to anon;
grant usage, select on all sequences in schema mush to anon;

drop policy if exists mush_order_read on mush.order_def;
create policy mush_order_read on mush.order_def for select to anon using (true);

drop policy if exists mush_profile_dev on mush.profile;
create policy mush_profile_dev on mush.profile for all to anon using (true) with check (true);

drop policy if exists mush_state_dev on mush.run_state;
create policy mush_state_dev on mush.run_state for all to anon using (true) with check (true);

drop policy if exists mush_delivery_dev on mush.delivery;
create policy mush_delivery_dev on mush.delivery for all to anon using (true) with check (true);

drop policy if exists mush_event_dev on mush.event;
create policy mush_event_dev on mush.event for insert to anon with check (true);

drop policy if exists mush_event_read on mush.event;
create policy mush_event_read on mush.event for select to anon using (true);

insert into mush.order_def (code, sort, recipient, need, deliver_camp, miss_line) values
  ('nell-medicine', 1, 'Grandma Nell', 'medicine chest', 'Village', 'Nell is still waiting on the medicine.'),
  ('stove-coal', 2, 'Cabin Hede', 'coal sack', 'Spruce Cut', 'Hede''s stove is out.'),
  ('kennel-feed', 3, 'Yard kennel', 'biscuit crate', 'River Ice', 'The kennel dogs were not fed.'),
  ('clinic-blankets', 4, 'Night clinic', 'blanket roll', 'Night Lamp', 'The clinic cots are bare.'),
  ('trapper-mail', 5, 'Trapper Ivar', 'mail pouch', 'Blowout Ridge', 'Ivar''s mail is still on your sled.')
on conflict (code) do nothing;
