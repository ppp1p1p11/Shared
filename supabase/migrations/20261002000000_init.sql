-- Rolo: private, link-based shared photo albums.
--
-- Security model
--   * Every user is a Supabase Auth user (anonymous by default; may later link email/phone).
--   * Album access is decided ONLY here, by RLS + SECURITY DEFINER RPCs. The client is never trusted.
--   * Invite tokens are 144 random bits, url-safe base64. Knowing a token lets you *preview* an album
--     (name, creator, member count, blurred thumbhashes) and *request* to join. Nothing else.
--   * Media bytes live in the private `media` bucket under albums/<album_id>/<media_id>/…
--     Storage policies key off that path and the membership tables.

create extension if not exists pgcrypto with schema extensions;

-- ───────────────────────────────────────────────────────────── types

create type public.join_mode as enum ('open', 'approval');
create type public.member_role as enum ('owner', 'member');
create type public.member_status as enum ('active', 'pending', 'removed');
create type public.media_status as enum ('uploading', 'processing', 'ready', 'hidden');
create type public.media_kind as enum ('photo', 'video');
create type public.plan_tier as enum ('free', 'plus');

-- ───────────────────────────────────────────────────────────── plan limits (configurable constants)

create table public.plan_limits (
  plan              public.plan_tier primary key,
  max_albums        int,             -- null = unlimited
  max_storage_bytes bigint not null,
  warn_ratio        numeric not null default 0.8
);

insert into public.plan_limits (plan, max_albums, max_storage_bytes) values
  ('free', 3, 15::bigint * 1024 * 1024 * 1024),
  ('plus', null, 2048::bigint * 1024 * 1024 * 1024);

alter table public.plan_limits enable row level security;
create policy "plan limits are public" on public.plan_limits for select using (true);

-- ───────────────────────────────────────────────────────────── profiles

create table public.profiles (
  id            uuid primary key references auth.users (id) on delete cascade,
  display_name  text not null default '' check (char_length(display_name) <= 40),
  avatar_color  smallint not null default floor(random() * 8)::smallint check (avatar_color between 0 and 7),
  is_anonymous  boolean not null default true,
  plan          public.plan_tier not null default 'free',
  created_at    timestamptz not null default now()
);

alter table public.profiles enable row level security;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, is_anonymous, display_name)
  values (
    new.id,
    coalesce(new.is_anonymous, false),
    left(coalesce(new.raw_user_meta_data ->> 'display_name', ''), 40)
  )
  on conflict (id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- When an anonymous user links an email/phone, mirror that on the profile.
create or replace function public.handle_user_updated()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.is_anonymous is distinct from old.is_anonymous then
    update public.profiles set is_anonymous = coalesce(new.is_anonymous, false) where id = new.id;
  end if;
  return new;
end $$;

create trigger on_auth_user_updated
  after update on auth.users
  for each row execute function public.handle_user_updated();

-- ───────────────────────────────────────────────────────────── albums

create or replace function public.generate_invite_token()
returns text language sql volatile set search_path = '' as $$
  -- 18 random bytes = 144 bits of entropy, 24 url-safe characters.
  select translate(encode(extensions.gen_random_bytes(18), 'base64'), '+/', '-_');
$$;

create table public.albums (
  id                   uuid primary key default gen_random_uuid(),
  owner_id             uuid not null references public.profiles (id) on delete cascade,
  name                 text not null check (char_length(btrim(name)) between 1 and 60),
  cover_media_id       uuid,
  start_date           date,
  end_date             date,
  join_mode            public.join_mode not null default 'open',
  is_locked            boolean not null default false,
  invite_token         text not null unique default public.generate_invite_token(),
  invite_expiry_hours  int check (invite_expiry_hours in (24, 48, 168)),
  invite_expires_at    timestamptz,
  keep_location        boolean not null default false,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  constraint albums_date_range check (end_date is null or start_date is null or end_date >= start_date)
);

create index albums_owner_idx on public.albums (owner_id);
alter table public.albums enable row level security;

-- ───────────────────────────────────────────────────────────── members

create table public.album_members (
  album_id     uuid not null references public.albums (id) on delete cascade,
  user_id      uuid not null references public.profiles (id) on delete cascade,
  role         public.member_role not null default 'member',
  status       public.member_status not null default 'active',
  auto_save    boolean not null default false,
  requested_at timestamptz not null default now(),
  joined_at    timestamptz,
  primary key (album_id, user_id)
);

create index album_members_user_idx on public.album_members (user_id, status);
alter table public.album_members enable row level security;

-- ───────────────────────────────────────────────────────────── media

create table public.media (
  id                     uuid primary key default gen_random_uuid(),
  album_id               uuid not null references public.albums (id) on delete cascade,
  uploader_id            uuid not null references public.profiles (id) on delete cascade,
  kind                   public.media_kind not null,
  storage_path           text not null,
  thumb_path             text,
  thumbhash              text,
  mime_type              text not null,
  width                  int,
  height                 int,
  duration_ms            int,
  size_bytes             bigint not null check (size_bytes >= 0),
  live_photo_video_path  text,
  live_photo_size_bytes  bigint not null default 0,
  content_hash           text not null,
  original_filename      text,
  captured_at            timestamptz not null,
  status                 public.media_status not null default 'uploading',
  created_at             timestamptz not null default now(),
  ready_at               timestamptz,
  unique (album_id, content_hash)
);

create index media_album_captured_idx on public.media (album_id, captured_at desc);
create index media_uploader_idx on public.media (uploader_id);
alter table public.media enable row level security;

alter table public.albums
  add constraint albums_cover_fk foreign key (cover_media_id) references public.media (id) on delete set null;

-- ───────────────────────────────────────────────────────────── reports (moderation queue)

create table public.reports (
  id          uuid primary key default gen_random_uuid(),
  media_id    uuid not null references public.media (id) on delete cascade,
  reporter_id uuid not null references public.profiles (id) on delete cascade,
  reason      text not null check (reason in ('inappropriate', 'violence', 'abuse', 'spam', 'other')),
  details     text check (char_length(details) <= 500),
  created_at  timestamptz not null default now(),
  unique (media_id, reporter_id)
);

alter table public.reports enable row level security;

-- ───────────────────────────────────────────────────────────── helper predicates (used by RLS)
-- SECURITY DEFINER so policies don't recurse through album_members' own RLS.

create or replace function public.is_active_member(p_album_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.album_members m
    where m.album_id = p_album_id and m.user_id = (select auth.uid()) and m.status = 'active'
  );
$$;

create or replace function public.is_album_owner(p_album_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.albums a where a.id = p_album_id and a.owner_id = (select auth.uid())
  );
$$;

-- True when the owner removed the caller from the album (removal cuts off even their own uploads).
create or replace function public.is_removed_from(p_album_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.album_members m
    where m.album_id = p_album_id and m.user_id = (select auth.uid()) and m.status = 'removed'
  );
$$;

create or replace function public.shares_album_with(p_user_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.album_members mine
    join public.album_members theirs on theirs.album_id = mine.album_id
    where mine.user_id = (select auth.uid())
      and theirs.user_id = p_user_id
      and (
        (mine.status = 'active' and theirs.status = 'active')
        or (mine.role = 'owner' and theirs.status = 'pending')
      )
  );
$$;

-- Parses albums/<album_id>/<media_id>/<file> → album id (null if malformed).
create or replace function public.album_id_from_path(p_name text)
returns uuid language plpgsql immutable set search_path = '' as $$
declare
  parts text[] := string_to_array(p_name, '/');
begin
  if array_length(parts, 1) < 4 or parts[1] <> 'albums' then
    return null;
  end if;
  return parts[2]::uuid;
exception when invalid_text_representation then
  return null;
end $$;

create or replace function public.media_id_from_path(p_name text)
returns uuid language plpgsql immutable set search_path = '' as $$
declare
  parts text[] := string_to_array(p_name, '/');
begin
  if array_length(parts, 1) < 4 or parts[1] <> 'albums' then
    return null;
  end if;
  return parts[3]::uuid;
exception when invalid_text_representation then
  return null;
end $$;

-- ───────────────────────────────────────────────────────────── RLS policies

-- profiles: yourself, and people you share an album with.
create policy "read own and co-member profiles" on public.profiles
  for select to authenticated
  using (id = (select auth.uid()) or public.shares_album_with(id));

-- albums: active members only. Non-members use get_album_preview().
create policy "members read albums" on public.albums
  for select to authenticated
  using (public.is_active_member(id));

-- album_members: you always see your own row (needed for the live "waiting for approval" screen);
-- active members see other active members; owners also see pending requests.
create policy "read memberships" on public.album_members
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or (status = 'active' and public.is_active_member(album_id))
    or public.is_album_owner(album_id)
  );

-- media: active members see ready items; uploaders see their own in-flight items;
-- owners also see hidden/processing items.
create policy "members read media" on public.media
  for select to authenticated
  using (
    public.is_active_member(album_id)
    and (
      status = 'ready'
      or uploader_id = (select auth.uid())
      or public.is_album_owner(album_id)
    )
  );

-- Delete: your own uploads, or anything in an album you own. (Storage objects are removed by the client first.)
create policy "uploader or owner deletes media" on public.media
  for delete to authenticated
  using (
    (uploader_id = (select auth.uid()) and public.is_active_member(album_id))
    or public.is_album_owner(album_id)
  );

-- reports: any active member can report an item they can see. Nobody but service_role reads reports.
create policy "members report media" on public.reports
  for insert to authenticated
  with check (
    reporter_id = (select auth.uid())
    and exists (
      select 1 from public.media m
      where m.id = media_id and public.is_active_member(m.album_id)
    )
  );

-- No insert/update policies on albums, album_members or media: all writes go through the RPCs below.
revoke insert, update on public.albums, public.album_members, public.media, public.profiles from anon, authenticated;
revoke all on public.reports from anon;
revoke select, update, delete on public.reports from authenticated;

-- ───────────────────────────────────────────────────────────── errors
-- RPCs raise 'ROLO:<code>' so the client can map codes to friendly, translated copy.

create or replace function public.rolo_error(p_code text)
returns void language plpgsql set search_path = '' as $$
begin
  raise exception using message = 'ROLO:' || p_code, errcode = 'P0001';
end $$;

create or replace function public.require_user()
returns uuid language plpgsql stable set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    perform public.rolo_error('not_authenticated');
  end if;
  return v_uid;
end $$;

-- ───────────────────────────────────────────────────────────── profile RPCs

create or replace function public.update_profile(p_display_name text default null, p_avatar_color int default null)
returns public.profiles language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := public.require_user();
  v_row public.profiles;
begin
  update public.profiles set
    display_name = coalesce(left(btrim(p_display_name), 40), display_name),
    avatar_color = coalesce(p_avatar_color::smallint, avatar_color)
  where id = v_uid
  returning * into v_row;
  return v_row;
end $$;

-- ───────────────────────────────────────────────────────────── storage accounting
-- Storage counts against the album OWNER, never the contributor. In-flight uploads are counted
-- (they reserve space), so a quota can't be overshot by many parallel uploads.

create or replace view public.owner_storage_usage
with (security_invoker = true) as
  select a.owner_id,
         a.id as album_id,
         coalesce(sum(m.size_bytes + m.live_photo_size_bytes), 0)::bigint as bytes
  from public.albums a
  left join public.media m on m.album_id = a.id
  group by a.owner_id, a.id;

create or replace function public.owner_used_bytes(p_owner_id uuid)
returns bigint language sql stable security definer set search_path = '' as $$
  select coalesce(sum(m.size_bytes + m.live_photo_size_bytes), 0)::bigint
  from public.media m
  join public.albums a on a.id = m.album_id
  where a.owner_id = p_owner_id;
$$;

create or replace function public.owner_limit_bytes(p_owner_id uuid)
returns bigint language sql stable security definer set search_path = '' as $$
  select l.max_storage_bytes
  from public.profiles p join public.plan_limits l on l.plan = p.plan
  where p.id = p_owner_id;
$$;

create or replace function public.get_my_usage()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_uid uuid := public.require_user();
  v_plan public.plan_tier;
  v_limits public.plan_limits;
begin
  select plan into v_plan from public.profiles where id = v_uid;
  select * into v_limits from public.plan_limits where plan = v_plan;
  return jsonb_build_object(
    'plan', v_plan,
    'used_bytes', public.owner_used_bytes(v_uid),
    'limit_bytes', v_limits.max_storage_bytes,
    'warn_ratio', v_limits.warn_ratio,
    'album_count', (select count(*) from public.albums where owner_id = v_uid),
    'album_limit', v_limits.max_albums,
    'albums', coalesce((
      select jsonb_agg(jsonb_build_object('album_id', a.id, 'name', a.name, 'bytes', u.bytes) order by u.bytes desc)
      from public.albums a
      join public.owner_storage_usage u on u.album_id = a.id
      where a.owner_id = v_uid
    ), '[]'::jsonb)
  );
end $$;

-- Usage of the album's owner, as seen from inside the album (members see whether uploads will pause).
create or replace function public.get_album_storage(p_album_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_owner uuid;
  v_limits public.plan_limits;
begin
  perform public.require_user();
  if not public.is_active_member(p_album_id) then
    perform public.rolo_error('not_a_member');
  end if;
  select owner_id into v_owner from public.albums where id = p_album_id;
  select l.* into v_limits from public.plan_limits l join public.profiles p on p.plan = l.plan where p.id = v_owner;
  return jsonb_build_object(
    'album_bytes', (select bytes from public.owner_storage_usage where album_id = p_album_id),
    'owner_used_bytes', public.owner_used_bytes(v_owner),
    'owner_limit_bytes', v_limits.max_storage_bytes,
    'warn_ratio', v_limits.warn_ratio
  );
end $$;

-- ───────────────────────────────────────────────────────────── album RPCs

create or replace function public.create_album(
  p_name text,
  p_start_date date default null,
  p_end_date date default null
) returns public.albums language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := public.require_user();
  v_max int;
  v_count int;
  v_album public.albums;
begin
  if p_name is null or char_length(btrim(p_name)) = 0 then
    perform public.rolo_error('name_required');
  end if;

  select l.max_albums into v_max
  from public.profiles p join public.plan_limits l on l.plan = p.plan
  where p.id = v_uid;

  select count(*) into v_count from public.albums where owner_id = v_uid;
  if v_max is not null and v_count >= v_max then
    perform public.rolo_error('album_limit_reached');
  end if;

  insert into public.albums (owner_id, name, start_date, end_date)
  values (v_uid, left(btrim(p_name), 60), p_start_date, p_end_date)
  returning * into v_album;

  insert into public.album_members (album_id, user_id, role, status, joined_at)
  values (v_album.id, v_uid, 'owner', 'active', now());

  return v_album;
end $$;

-- What a non-member may see before joining. Deliberately minimal: no photos, only blurred thumbhashes.
create or replace function public.get_album_preview(p_token text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_album public.albums;
  v_my_status public.member_status;
  v_state text := 'open';
begin
  select * into v_album from public.albums where invite_token = p_token;
  if not found then
    return jsonb_build_object('state', 'invalid');
  end if;

  select status into v_my_status
  from public.album_members where album_id = v_album.id and user_id = auth.uid();

  if v_album.is_locked then
    v_state := 'locked';
  elsif v_album.invite_expires_at is not null and v_album.invite_expires_at < now() then
    v_state := 'expired';
  end if;

  return jsonb_build_object(
    'state', v_state,
    'album_id', v_album.id,
    'name', v_album.name,
    'start_date', v_album.start_date,
    'end_date', v_album.end_date,
    'join_mode', v_album.join_mode,
    'owner_name', (select display_name from public.profiles where id = v_album.owner_id),
    'member_count', (select count(*) from public.album_members where album_id = v_album.id and status = 'active'),
    'item_count', (select count(*) from public.media where album_id = v_album.id and status = 'ready'),
    'my_status', v_my_status,
    'cover_thumbhashes', coalesce((
      select jsonb_agg(t.thumbhash)
      from (
        select m.thumbhash from public.media m
        where m.album_id = v_album.id and m.status = 'ready' and m.thumbhash is not null
        order by (m.id = v_album.cover_media_id) desc, m.captured_at desc
        limit 4
      ) t
    ), '[]'::jsonb)
  );
end $$;

create or replace function public.join_album(p_token text, p_display_name text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := public.require_user();
  v_album public.albums;
  v_existing public.member_status;
  v_status public.member_status;
begin
  select * into v_album from public.albums where invite_token = p_token for update;
  if not found then
    perform public.rolo_error('invalid_link');
  end if;

  select status into v_existing from public.album_members where album_id = v_album.id and user_id = v_uid;
  if v_existing = 'active' or v_existing = 'pending' then
    return jsonb_build_object('album_id', v_album.id, 'status', v_existing);
  end if;

  if v_album.is_locked then
    perform public.rolo_error('album_locked');
  end if;
  if v_album.invite_expires_at is not null and v_album.invite_expires_at < now() then
    perform public.rolo_error('link_expired');
  end if;

  -- Someone the owner removed can only come back by asking again (in approval mode) —
  -- an open link never silently re-admits them.
  if v_existing = 'removed' and v_album.join_mode = 'open' then
    perform public.rolo_error('removed');
  end if;

  if p_display_name is not null and char_length(btrim(p_display_name)) > 0 then
    update public.profiles set display_name = left(btrim(p_display_name), 40) where id = v_uid;
  end if;

  v_status := case when v_album.join_mode = 'open' then 'active' else 'pending' end;

  insert into public.album_members (album_id, user_id, role, status, requested_at, joined_at)
  values (v_album.id, v_uid, 'member', v_status, now(), case when v_status = 'active' then now() end)
  on conflict (album_id, user_id) do update
    set status = excluded.status, requested_at = now(), joined_at = excluded.joined_at;

  return jsonb_build_object('album_id', v_album.id, 'status', v_status);
end $$;

create or replace function public.require_owner(p_album_id uuid)
returns uuid language plpgsql stable security definer set search_path = '' as $$
declare
  v_uid uuid := public.require_user();
begin
  if not exists (select 1 from public.albums where id = p_album_id and owner_id = v_uid) then
    perform public.rolo_error('not_owner');
  end if;
  return v_uid;
end $$;

create or replace function public.respond_to_request(p_album_id uuid, p_user_id uuid, p_approve boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public.require_owner(p_album_id);
  if p_approve then
    update public.album_members set status = 'active', joined_at = now()
    where album_id = p_album_id and user_id = p_user_id and status = 'pending';
  else
    update public.album_members set status = 'removed'
    where album_id = p_album_id and user_id = p_user_id and status = 'pending';
  end if;
  if not found then
    perform public.rolo_error('request_not_found');
  end if;
end $$;

-- Removes access. Uploads stay unless p_delete_uploads (client deletes the storage objects first).
create or replace function public.remove_member(p_album_id uuid, p_user_id uuid, p_delete_uploads boolean default false)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := public.require_owner(p_album_id);
begin
  if p_user_id = v_uid then
    perform public.rolo_error('cannot_remove_owner');
  end if;
  update public.album_members set status = 'removed'
  where album_id = p_album_id and user_id = p_user_id and status <> 'removed';
  if not found then
    perform public.rolo_error('member_not_found');
  end if;
  if p_delete_uploads then
    delete from public.media where album_id = p_album_id and uploader_id = p_user_id;
  end if;
end $$;

create or replace function public.leave_album(p_album_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := public.require_user();
begin
  if public.is_album_owner(p_album_id) then
    perform public.rolo_error('owner_cannot_leave');
  end if;
  delete from public.album_members where album_id = p_album_id and user_id = v_uid;
end $$;

-- Owner settings. p_patch keys: name, start_date, end_date, join_mode, is_locked, keep_location,
-- cover_media_id, invite_expiry_hours (null | 24 | 48 | 168; expiry is computed server-side from now()).
create or replace function public.update_album(p_album_id uuid, p_patch jsonb)
returns public.albums language plpgsql security definer set search_path = '' as $$
declare
  v_album public.albums;
  v_hours int;
begin
  perform public.require_owner(p_album_id);

  if p_patch ? 'cover_media_id' and p_patch ->> 'cover_media_id' is not null and not exists (
    select 1 from public.media where id = (p_patch ->> 'cover_media_id')::uuid and album_id = p_album_id and status = 'ready'
  ) then
    perform public.rolo_error('invalid_cover');
  end if;

  if p_patch ? 'invite_expiry_hours' then
    v_hours := (p_patch ->> 'invite_expiry_hours')::int;
    if v_hours is not null and v_hours not in (24, 48, 168) then
      perform public.rolo_error('invalid_expiry');
    end if;
  end if;

  update public.albums set
    name = case when p_patch ? 'name' then left(btrim(p_patch ->> 'name'), 60) else name end,
    start_date = case when p_patch ? 'start_date' then (p_patch ->> 'start_date')::date else start_date end,
    end_date = case when p_patch ? 'end_date' then (p_patch ->> 'end_date')::date else end_date end,
    join_mode = case when p_patch ? 'join_mode' then (p_patch ->> 'join_mode')::public.join_mode else join_mode end,
    is_locked = case when p_patch ? 'is_locked' then (p_patch ->> 'is_locked')::boolean else is_locked end,
    keep_location = case when p_patch ? 'keep_location' then (p_patch ->> 'keep_location')::boolean else keep_location end,
    cover_media_id = case when p_patch ? 'cover_media_id' then (p_patch ->> 'cover_media_id')::uuid else cover_media_id end,
    invite_expiry_hours = case when p_patch ? 'invite_expiry_hours' then v_hours else invite_expiry_hours end,
    invite_expires_at = case
      when p_patch ? 'invite_expiry_hours' then
        case when v_hours is null then null else now() + make_interval(hours => v_hours) end
      else invite_expires_at end,
    updated_at = now()
  where id = p_album_id
  returning * into v_album;

  return v_album;
end $$;

-- Invalidates the old link/QR immediately. The expiry window (if any) restarts from now.
create or replace function public.reset_invite_link(p_album_id uuid)
returns public.albums language plpgsql security definer set search_path = '' as $$
declare
  v_album public.albums;
begin
  perform public.require_owner(p_album_id);
  update public.albums set
    invite_token = public.generate_invite_token(),
    invite_expires_at = case when invite_expiry_hours is null then null else now() + make_interval(hours => invite_expiry_hours) end,
    updated_at = now()
  where id = p_album_id
  returning * into v_album;
  return v_album;
end $$;

create or replace function public.delete_album(p_album_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public.require_owner(p_album_id);
  delete from public.albums where id = p_album_id;
end $$;

create or replace function public.set_auto_save(p_album_id uuid, p_enabled boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.album_members set auto_save = p_enabled
  where album_id = p_album_id and user_id = public.require_user() and status = 'active';
end $$;

-- Home screen: one round trip with everything the album cards need.
create or replace function public.list_my_albums()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_uid uuid := public.require_user();
begin
  return coalesce((
    select jsonb_agg(row_data order by sort_key desc)
    from (
      select
        greatest(a.created_at, coalesce((select max(m.created_at) from public.media m where m.album_id = a.id and m.status = 'ready'), a.created_at)) as sort_key,
        jsonb_build_object(
          'id', a.id,
          'name', a.name,
          'start_date', a.start_date,
          'end_date', a.end_date,
          'role', me.role,
          'status', me.status,
          'is_locked', a.is_locked,
          'owner_id', a.owner_id,
          'owner_name', (select display_name from public.profiles where id = a.owner_id),
          'item_count', (select count(*) from public.media m where m.album_id = a.id and m.status = 'ready'),
          'member_count', (select count(*) from public.album_members x where x.album_id = a.id and x.status = 'active'),
          'pending_count', case when me.role = 'owner' then (select count(*) from public.album_members x where x.album_id = a.id and x.status = 'pending') else 0 end,
          'members', coalesce((
            select jsonb_agg(jsonb_build_object('id', p.id, 'display_name', p.display_name, 'avatar_color', p.avatar_color))
            from (
              select p.* from public.album_members x join public.profiles p on p.id = x.user_id
              where x.album_id = a.id and x.status = 'active'
              order by x.role, x.joined_at
              limit 5
            ) p
          ), '[]'::jsonb),
          'cover', coalesce((
            select jsonb_agg(jsonb_build_object('id', c.id, 'thumb_path', c.thumb_path, 'thumbhash', c.thumbhash))
            from (
              select m.id, m.thumb_path, m.thumbhash from public.media m
              where m.album_id = a.id and m.status = 'ready'
              order by (m.id = a.cover_media_id) desc, m.created_at desc
              limit 4
            ) c
          ), '[]'::jsonb)
        ) as row_data
      from public.album_members me
      join public.albums a on a.id = me.album_id
      where me.user_id = v_uid and me.status in ('active', 'pending')
    ) rows
  ), '[]'::jsonb);
end $$;

-- ───────────────────────────────────────────────────────────── media RPCs

-- Step 1 of an upload: reserve a row + storage path. Enforces membership, dedup and the owner's quota.
create or replace function public.begin_upload(
  p_album_id uuid,
  p_content_hash text,
  p_kind public.media_kind,
  p_mime_type text,
  p_size_bytes bigint,
  p_captured_at timestamptz,
  p_extension text,
  p_width int default null,
  p_height int default null,
  p_duration_ms int default null,
  p_original_filename text default null,
  p_live_photo_size_bytes bigint default 0
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := public.require_user();
  v_album public.albums;
  v_existing public.media;
  v_id uuid := gen_random_uuid();
  v_ext text := lower(regexp_replace(coalesce(p_extension, 'bin'), '[^a-zA-Z0-9]', '', 'g'));
  v_base text;
begin
  if not public.is_active_member(p_album_id) then
    perform public.rolo_error('not_a_member');
  end if;

  select * into v_album from public.albums where id = p_album_id;

  -- Dedup: same bytes already in this album.
  select * into v_existing from public.media where album_id = p_album_id and content_hash = p_content_hash;
  if found then
    if v_existing.uploader_id = v_uid and v_existing.status = 'uploading' then
      -- Resuming our own interrupted upload: hand back the same row/path.
      return jsonb_build_object(
        'media_id', v_existing.id, 'storage_path', v_existing.storage_path,
        'live_photo_video_path', v_existing.live_photo_video_path, 'resumed', true,
        'keep_location', v_album.keep_location
      );
    end if;
    return jsonb_build_object('duplicate', true, 'media_id', v_existing.id);
  end if;

  if public.owner_used_bytes(v_album.owner_id) + p_size_bytes + coalesce(p_live_photo_size_bytes, 0)
     > public.owner_limit_bytes(v_album.owner_id) then
    perform public.rolo_error('quota_exceeded');
  end if;

  v_base := 'albums/' || p_album_id || '/' || v_id || '/';

  insert into public.media (
    id, album_id, uploader_id, kind, storage_path, thumb_path, mime_type, width, height, duration_ms,
    size_bytes, live_photo_video_path, live_photo_size_bytes, content_hash, original_filename, captured_at
  ) values (
    v_id, p_album_id, v_uid, p_kind, v_base || 'original.' || v_ext, v_base || 'thumb.jpg', p_mime_type,
    p_width, p_height, p_duration_ms, p_size_bytes,
    case when coalesce(p_live_photo_size_bytes, 0) > 0 then v_base || 'live.mov' end,
    coalesce(p_live_photo_size_bytes, 0), p_content_hash, left(p_original_filename, 255),
    coalesce(p_captured_at, now())
  );

  return jsonb_build_object(
    'media_id', v_id,
    'storage_path', v_base || 'original.' || v_ext,
    'thumb_path', v_base || 'thumb.jpg',
    'live_photo_video_path', case when coalesce(p_live_photo_size_bytes, 0) > 0 then v_base || 'live.mov' end,
    'keep_location', v_album.keep_location,
    'resumed', false
  );
end $$;

-- ── Abuse-scanning hook ──────────────────────────────────────────────────────
-- PLACEHOLDER. In production, finalize_upload should NOT flip media to 'ready' inline. Instead:
--   1. status stays 'processing' (invisible to other members),
--   2. a worker (Edge Function / queue consumer) fetches the object and runs CSAM hash matching
--      (e.g. PhotoDNA / Thorn Safer / Google CSAI Match) and abuse classifiers,
--   3. it calls moderation_verdict(media_id, 'allow' | 'block').
-- The prototype "scans" synchronously and always allows, so the plumbing is exercised end to end.
create schema if not exists moderation;

create or replace function moderation.scan_media(p_media_id uuid)
returns text language plpgsql security definer set search_path = '' as $$
begin
  -- TODO(production): enqueue p_media_id for asynchronous scanning and return 'pending'.
  return 'allow';
end $$;

revoke all on schema moderation from anon, authenticated;

-- Step 2 of an upload: bytes are in storage; attach thumbnail metadata and run the scanning hook.
create or replace function public.finalize_upload(
  p_media_id uuid,
  p_thumbhash text default null,
  p_width int default null,
  p_height int default null
) returns public.media language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := public.require_user();
  v_media public.media;
  v_verdict text;
begin
  update public.media set
    status = 'processing',
    thumbhash = coalesce(p_thumbhash, thumbhash),
    width = coalesce(p_width, width),
    height = coalesce(p_height, height)
  where id = p_media_id and uploader_id = v_uid and status in ('uploading', 'processing')
  returning * into v_media;

  if not found then
    perform public.rolo_error('media_not_found');
  end if;

  v_verdict := moderation.scan_media(p_media_id);

  if v_verdict = 'allow' then
    update public.media set status = 'ready', ready_at = now() where id = p_media_id returning * into v_media;
  elsif v_verdict = 'block' then
    update public.media set status = 'hidden' where id = p_media_id returning * into v_media;
  end if;

  return v_media;
end $$;

-- Owner moderation: hide (keeps bytes, invisible to members) or unhide.
create or replace function public.set_media_hidden(p_media_id uuid, p_hidden boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_album uuid;
begin
  select album_id into v_album from public.media where id = p_media_id;
  perform public.require_owner(v_album);
  update public.media
     set status = case when p_hidden then 'hidden'::public.media_status else 'ready'::public.media_status end
   where id = p_media_id and status in ('ready', 'hidden');
end $$;

-- ───────────────────────────────────────────────────────────── account deletion (LGPD / GDPR)
-- Deletes the auth user; cascades remove profile, owned albums (with all their media rows),
-- memberships and the user's uploads everywhere. The client removes the storage objects first
-- (it is allowed to: they are either its own uploads or live in albums it owns).
create or replace function public.delete_my_data()
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := public.require_user();
begin
  delete from public.reports where reporter_id = v_uid;
  delete from auth.users where id = v_uid;
end $$;

-- Storage paths the client must remove before calling delete_my_data().
create or replace function public.my_data_storage_paths()
returns setof text language sql stable security definer set search_path = '' as $$
  select unnest(array[m.storage_path, m.thumb_path, m.live_photo_video_path])
  from public.media m
  join public.albums a on a.id = m.album_id
  where m.uploader_id = (select auth.uid()) or a.owner_id = (select auth.uid());
$$;

-- ───────────────────────────────────────────────────────────── grants

-- Default-deny: nothing is callable unless granted below.
revoke execute on all functions in schema public from anon, authenticated, public;
grant execute on function
  public.get_album_preview(text),
  public.join_album(text, text),
  public.update_profile(text, int),
  public.get_my_usage(),
  public.get_album_storage(uuid),
  public.create_album(text, date, date),
  public.respond_to_request(uuid, uuid, boolean),
  public.remove_member(uuid, uuid, boolean),
  public.leave_album(uuid),
  public.update_album(uuid, jsonb),
  public.reset_invite_link(uuid),
  public.delete_album(uuid),
  public.set_auto_save(uuid, boolean),
  public.list_my_albums(),
  public.begin_upload(uuid, text, public.media_kind, text, bigint, timestamptz, text, int, int, int, text, bigint),
  public.finalize_upload(uuid, text, int, int),
  public.set_media_hidden(uuid, boolean),
  public.delete_my_data(),
  public.my_data_storage_paths()
to authenticated;

-- Helpers used inside RLS policies must be executable by the querying role.
grant execute on function
  public.is_active_member(uuid),
  public.is_album_owner(uuid),
  public.is_removed_from(uuid),
  public.shares_album_with(uuid),
  public.album_id_from_path(text),
  public.media_id_from_path(text),
  public.require_user(),
  public.rolo_error(text)
to authenticated;

grant select on public.owner_storage_usage to authenticated;

-- ───────────────────────────────────────────────────────────── realtime

alter publication supabase_realtime add table public.media, public.album_members, public.albums;
alter table public.media replica identity full;
alter table public.album_members replica identity full;

-- ───────────────────────────────────────────────────────────── storage

insert into storage.buckets (id, name, public, file_size_limit)
values ('media', 'media', false, 5368709120)
on conflict (id) do nothing;

-- Read: active members, for items they're allowed to see (mirrors the media table policy).
-- The uploader and the album owner can always see their objects, so orphans can be cleaned up.
create policy "media: members read" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'media'
    and (
      (owner_id = (select auth.uid())::text and not public.is_removed_from(public.album_id_from_path(name)))
      or public.is_album_owner(public.album_id_from_path(name))
      or exists (
      select 1 from public.media m
      where m.id = public.media_id_from_path(name)
        and m.album_id = public.album_id_from_path(name)
        and public.is_active_member(m.album_id)
        and (m.status = 'ready' or m.uploader_id = (select auth.uid()) or public.is_album_owner(m.album_id))
      )
    )
  );

-- Write: only into a path reserved by begin_upload() for you, while that row is still uploading.
create policy "media: uploader writes reserved path" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'media'
    and exists (
      select 1 from public.media m
      where m.id = public.media_id_from_path(name)
        and m.album_id = public.album_id_from_path(name)
        and m.uploader_id = (select auth.uid())
        and m.status in ('uploading', 'processing')
        and name in (m.storage_path, m.thumb_path, m.live_photo_video_path)
        and public.is_active_member(m.album_id)
    )
  );

create policy "media: uploader overwrites reserved path" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'media'
    and owner_id = (select auth.uid())::text
  )
  with check (
    bucket_id = 'media'
    and exists (
      select 1 from public.media m
      where m.id = public.media_id_from_path(name)
        and m.uploader_id = (select auth.uid())
        and m.status in ('uploading', 'processing')
    )
  );

-- Delete: the uploader, or the album owner.
create policy "media: uploader or owner deletes" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'media'
    and (
      owner_id = (select auth.uid())::text
      or public.is_album_owner(public.album_id_from_path(name))
    )
  );
