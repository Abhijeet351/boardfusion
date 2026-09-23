-- BoardFusion analytics setup. Safe to run more than once.
-- Creates an insert-only events table, a private stats key, and a stats function.
create table if not exists public.bf_events (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  visitor_id text not null check (visitor_id ~ '^[a-z0-9]{8,40}$'),
  session_id text not null check (session_id ~ '^[a-z0-9]{8,40}$'),
  event text not null check (event in ('visit','game_start','game_end','queue_start','match_found','queue_end')),
  game text check (game in ('dice','marble')),
  mode text check (mode in ('local','computer','online_public','online_private')),
  page text check (char_length(page) <= 40),
  referrer text check (char_length(referrer) <= 100),
  device text check (device in ('mobile','desktop','app')),
  props jsonb not null default '{}'::jsonb check (jsonb_typeof(props) = 'object' and pg_column_size(props) < 1000)
);
create index if not exists bf_events_created_idx on public.bf_events (created_at);
create index if not exists bf_events_visitor_idx on public.bf_events (visitor_id, created_at);

alter table public.bf_events enable row level security;
revoke all on public.bf_events from anon, authenticated;
grant insert (visitor_id, session_id, event, game, mode, page, referrer, device, props) on public.bf_events to anon, authenticated;
drop policy if exists bf_events_insert on public.bf_events;
create policy bf_events_insert on public.bf_events for insert to anon, authenticated with check (true);

create table if not exists public.bf_admin (
  id int primary key default 1 check (id = 1),
  stats_key text not null default replace(gen_random_uuid()::text, '-', '')
);
alter table public.bf_admin enable row level security;
revoke all on public.bf_admin from anon, authenticated;
insert into public.bf_admin (id) values (1) on conflict (id) do nothing;

create or replace function public.bf_stats(p_key text, p_days int default 30)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  since timestamptz;
  result jsonb;
begin
  if p_key is null or not exists (select 1 from public.bf_admin where stats_key = p_key) then
    raise exception 'not allowed';
  end if;
  since := date_trunc('day', now() at time zone 'Asia/Kolkata') at time zone 'Asia/Kolkata'
           - make_interval(days => greatest(1, least(coalesce(p_days, 30), 365)) - 1);
  with ev as (
    select *, (created_at at time zone 'Asia/Kolkata')::date as d
    from public.bf_events where created_at >= since
  ),
  firsts as (
    select visitor_id, min((created_at at time zone 'Asia/Kolkata')::date) as first_day
    from public.bf_events group by visitor_id
  ),
  vdays as (
    select visitor_id, count(distinct d) as days from ev group by visitor_id
  )
  select jsonb_build_object(
    'since', since,
    'generated_at', now(),
    'totals', jsonb_build_object(
      'visitors', (select count(distinct visitor_id) from ev),
      'new_visitors', (select count(*) from firsts where first_day >= (since at time zone 'Asia/Kolkata')::date),
      'sessions', (select count(distinct session_id) from ev),
      'returning_visitors', (select count(*) from vdays where days >= 2),
      'players', (select count(distinct visitor_id) from ev where event = 'game_start'),
      'games_started', (select count(*) from ev where event = 'game_start'),
      'games_finished', (select count(*) from ev where event = 'game_end'),
      'queue_searches', (select count(*) from ev where event = 'queue_start'),
      'queue_matched', (select count(*) from ev where event = 'match_found'),
      'queue_gave_up', (select count(*) from ev where event = 'queue_end')
    ),
    'by_game_mode', coalesce((select jsonb_agg(x order by x->>'game', x->>'mode') from (
       select jsonb_build_object('game', game, 'mode', mode,
         'started', count(*) filter (where event = 'game_start'),
         'finished', count(*) filter (where event = 'game_end'),
         'players', count(distinct visitor_id) filter (where event = 'game_start')) as x
       from ev where event in ('game_start','game_end') group by game, mode) t), '[]'::jsonb),
    'daily', coalesce((select jsonb_agg(x order by x->>'day') from (
       select jsonb_build_object('day', d,
         'visitors', count(distinct visitor_id),
         'started', count(*) filter (where event = 'game_start'),
         'finished', count(*) filter (where event = 'game_end')) as x
       from ev group by d) t), '[]'::jsonb),
    'referrers', coalesce((select jsonb_agg(x) from (
       select jsonb_build_object('source', coalesce(nullif(props->>'utm',''), referrer, 'direct / app / chat link'), 'visits', count(*)) as x
       from ev where event = 'visit'
       group by coalesce(nullif(props->>'utm',''), referrer, 'direct / app / chat link')
       order by count(*) desc limit 10) t), '[]'::jsonb),
    'devices', coalesce((select jsonb_object_agg(coalesce(device,'unknown'), n) from (
       select device, count(distinct visitor_id) as n from ev group by device) t), '{}'::jsonb),
    'retention', jsonb_build_object(
      'eligible_day1', (select count(*) from firsts f where f.first_day >= (since at time zone 'Asia/Kolkata')::date and f.first_day < (now() at time zone 'Asia/Kolkata')::date),
      'came_back_day1', (select count(*) from firsts f where f.first_day >= (since at time zone 'Asia/Kolkata')::date and f.first_day < (now() at time zone 'Asia/Kolkata')::date
          and exists (select 1 from public.bf_events e where e.visitor_id = f.visitor_id and (e.created_at at time zone 'Asia/Kolkata')::date = f.first_day + 1)),
      'eligible_week', (select count(*) from firsts f where f.first_day >= (since at time zone 'Asia/Kolkata')::date and f.first_day <= (now() at time zone 'Asia/Kolkata')::date - 7),
      'came_back_week', (select count(*) from firsts f where f.first_day >= (since at time zone 'Asia/Kolkata')::date and f.first_day <= (now() at time zone 'Asia/Kolkata')::date - 7
          and exists (select 1 from public.bf_events e where e.visitor_id = f.visitor_id and (e.created_at at time zone 'Asia/Kolkata')::date between f.first_day + 1 and f.first_day + 7))
    )
  ) into result;
  return result;
end;
$$;
revoke all on function public.bf_stats(text, int) from public;
grant execute on function public.bf_stats(text, int) to anon, authenticated;

-- Your private stats key (copy it into boardfusion.onrender.com/stats.html):
select stats_key as your_stats_key from public.bf_admin;
