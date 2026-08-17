-- NOCKAGE REAL BACKEND — Supabase SQL
-- Run this in Supabase Dashboard -> SQL Editor.
-- Then create the 3 storage buckets named:
-- public-videos (PUBLIC), private-videos (PRIVATE), thumbnails (PUBLIC).

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique not null check (username ~ '^[A-Za-z0-9_]{3,24}$'),
  display_name text not null,
  avatar_url text,
  created_at timestamptz not null default now()
);

create table if not exists public.videos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  description text default '',
  video_url text not null,
  storage_path text not null,
  thumbnail_url text,
  visibility text not null default 'public' check (visibility in ('public','unlisted','private')),
  is_short boolean not null default false,
  allow_comments boolean not null default true,
  views bigint not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.likes (
  video_id uuid not null references public.videos(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key(video_id,user_id)
);

create table if not exists public.subscriptions (
  creator_id uuid not null references public.profiles(id) on delete cascade,
  subscriber_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key(creator_id,subscriber_id),
  check(creator_id <> subscriber_id)
);

create table if not exists public.comments (
  id uuid primary key default gen_random_uuid(),
  video_id uuid not null references public.videos(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  text text not null check(char_length(text) between 1 and 2000),
  created_at timestamptz not null default now()
);

create table if not exists public.reposts (
  video_id uuid not null references public.videos(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key(video_id,user_id)
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  type text not null,
  video_id uuid references public.videos(id) on delete cascade,
  created_at timestamptz not null default now(),
  read boolean not null default false
);

create index if not exists videos_created_idx on public.videos(created_at desc);
create index if not exists videos_user_idx on public.videos(user_id);
create index if not exists videos_title_idx on public.videos(title);
create index if not exists comments_video_idx on public.comments(video_id);

alter table public.profiles enable row level security;
alter table public.videos enable row level security;
alter table public.likes enable row level security;
alter table public.subscriptions enable row level security;
alter table public.comments enable row level security;
alter table public.reposts enable row level security;
alter table public.notifications enable row level security;

create policy "profiles public read" on public.profiles for select using (true);
create policy "profiles own insert" on public.profiles for insert with check (auth.uid() = id);
create policy "profiles own update" on public.profiles for update using (auth.uid() = id);

create policy "public videos read" on public.videos for select using (visibility in ('public','unlisted') or auth.uid() = user_id);
create policy "own videos insert" on public.videos for insert with check (auth.uid() = user_id);
create policy "own videos update" on public.videos for update using (auth.uid() = user_id);
create policy "own videos delete" on public.videos for delete using (auth.uid() = user_id);

create policy "likes read" on public.likes for select using (true);
create policy "likes own insert" on public.likes for insert with check (auth.uid() = user_id);
create policy "likes own delete" on public.likes for delete using (auth.uid() = user_id);

create policy "subscriptions read" on public.subscriptions for select using (true);
create policy "subscriptions own insert" on public.subscriptions for insert with check (auth.uid() = subscriber_id);
create policy "subscriptions own delete" on public.subscriptions for delete using (auth.uid() = subscriber_id);

create policy "comments read" on public.comments for select using (true);
create policy "comments own insert" on public.comments for insert with check (auth.uid() = user_id);
create policy "comments own delete" on public.comments for delete using (auth.uid() = user_id);

create policy "reposts read" on public.reposts for select using (true);
create policy "reposts own insert" on public.reposts for insert with check (auth.uid() = user_id);
create policy "reposts own delete" on public.reposts for delete using (auth.uid() = user_id);

create policy "notifications own read" on public.notifications for select using (auth.uid() = user_id);
create policy "notifications own update" on public.notifications for update using (auth.uid() = user_id);

-- Storage policies.
-- Public video bucket can be read by everyone, uploads/deletes only by the owner folder.
create policy "public video read" on storage.objects for select using (bucket_id='public-videos');
create policy "public video upload" on storage.objects for insert to authenticated with check (bucket_id='public-videos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "public video delete" on storage.objects for delete to authenticated using (bucket_id='public-videos' and owner_id = auth.uid()::text);

-- Private video bucket: owner only.
create policy "private video owner read" on storage.objects for select to authenticated using (bucket_id='private-videos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "private video owner upload" on storage.objects for insert to authenticated with check (bucket_id='private-videos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "private video owner delete" on storage.objects for delete to authenticated using (bucket_id='private-videos' and owner_id = auth.uid()::text);

-- Thumbnails are public; only the owner folder can upload/delete.
create policy "thumbnail read" on storage.objects for select using (bucket_id='thumbnails');
create policy "thumbnail upload" on storage.objects for insert to authenticated with check (bucket_id='thumbnails' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "thumbnail delete" on storage.objects for delete to authenticated using (bucket_id='thumbnails' and owner_id = auth.uid()::text);
