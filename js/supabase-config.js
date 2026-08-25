/* ============================================================
   Supabase project config. Two values below are your real
   project's — only touch these if you ever create a new project.
   ============================================================ */

export const SUPABASE_URL = "https://skshtnrsugkdrhscftzt.supabase.co";
export const SUPABASE_ANON_KEY = "sb_publishable_khIRUUx-oLXuyJPTK_wMpg_KhyMc8Gb";

/* Restrict signups to these email domains. Set to null (no quotes,
   no brackets) to allow any email while testing. */
export const ALLOWED_EMAIL_DOMAINS = ["summit.edu.ng", "gmail.com"];

/* ============================================================
   FULL SCHEMA — for setting this project up from scratch in a
   brand-new Supabase project. Paste this whole block into the
   SQL Editor and Run once. If you already have a working
   database, you don't need this — see the migration notes
   further down instead.
   ============================================================

-- Profiles: one row per signed-up student, keyed to auth.users
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null,
  email text not null,
  dept text default '',
  bio text default '',
  initials text not null,
  avatar_url text,
  avatar_key text,
  role text not null default 'student' check (role in ('student','staff','admin')),
  created_at timestamptz default now()
);

-- Prevents a student from granting themselves staff/admin by calling
-- the API directly. Any role change coming through the app (i.e. has
-- a logged-in auth.uid()) is silently reverted. Role can still be
-- changed the intended way — directly in the Supabase dashboard's
-- Table Editor or SQL Editor, which runs with no auth.uid() and so
-- is unaffected by this trigger.
create or replace function public.prevent_role_self_escalation()
returns trigger as $$
begin
  if auth.uid() is not null and NEW.role is distinct from OLD.role then
    NEW.role := OLD.role;
  end if;
  return NEW;
end;
$$ language plpgsql security definer;

create trigger profiles_prevent_role_escalation
before update on public.profiles
for each row execute function public.prevent_role_self_escalation();

-- Listings: the marketplace posts
create table public.listings (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  category text not null,
  price numeric not null,
  description text not null,
  glyph text default '🛍️',
  image_url text,
  image_key text,
  seller_id uuid references public.profiles(id) on delete cascade not null,
  status text default 'available',
  created_at timestamptz default now()
);

-- Threads: one buyer-seller conversation per listing
create table public.threads (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid references public.listings(id) on delete cascade,
  listing_title text,
  buyer_id uuid references public.profiles(id) on delete cascade not null,
  seller_id uuid references public.profiles(id) on delete cascade not null,
  last_message text default '',
  updated_at timestamptz default now()
);

-- Messages inside a thread
create table public.messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid references public.threads(id) on delete cascade not null,
  from_user uuid references public.profiles(id) on delete cascade not null,
  text text not null,
  ts timestamptz default now()
);

-- Posts: news, announcements, events, and campus media
create table public.posts (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('news','announcement','event','media')),
  title text not null,
  body text default '',
  image_url text,
  image_key text,
  pinned boolean default false,
  event_date timestamptz,
  event_location text,
  author_id uuid references public.profiles(id) on delete cascade not null,
  created_at timestamptz default now()
);

-- Event RSVPs
create table public.event_rsvps (
  id uuid primary key default gen_random_uuid(),
  post_id uuid references public.posts(id) on delete cascade not null,
  user_id uuid references public.profiles(id) on delete cascade not null,
  created_at timestamptz default now(),
  unique (post_id, user_id)
);

alter table public.profiles enable row level security;
alter table public.listings enable row level security;
alter table public.threads enable row level security;
alter table public.messages enable row level security;
alter table public.posts enable row level security;
alter table public.event_rsvps enable row level security;

create policy "profiles are readable by signed-in users" on public.profiles
  for select using (auth.role() = 'authenticated');
create policy "users can insert their own profile" on public.profiles
  for insert with check (auth.uid() = id);
create policy "users can update their own profile" on public.profiles
  for update using (auth.uid() = id);

create policy "listings are public to read" on public.listings
  for select using (true);
create policy "sellers can insert their own listings" on public.listings
  for insert with check (auth.uid() = seller_id);
create policy "sellers can update their own listings" on public.listings
  for update using (auth.uid() = seller_id);
create policy "sellers can delete their own listings" on public.listings
  for delete using (auth.uid() = seller_id);

create policy "participants can read their threads" on public.threads
  for select using (auth.uid() = buyer_id or auth.uid() = seller_id);
create policy "buyers can start a thread" on public.threads
  for insert with check (auth.uid() = buyer_id);
create policy "participants can update their threads" on public.threads
  for update using (auth.uid() = buyer_id or auth.uid() = seller_id);

create policy "participants can read messages" on public.messages
  for select using (
    exists (select 1 from public.threads t where t.id = thread_id and (t.buyer_id = auth.uid() or t.seller_id = auth.uid()))
  );
create policy "participants can send messages" on public.messages
  for insert with check (
    auth.uid() = from_user and exists (select 1 from public.threads t where t.id = thread_id and (t.buyer_id = auth.uid() or t.seller_id = auth.uid()))
  );

-- Posts: readable by everyone. Students can post Events and Campus
-- Media; News and Announcements are staff/admin only.
create policy "posts are public to read" on public.posts
  for select using (true);
create policy "students can post events and media, staff can post anything" on public.posts
  for insert with check (
    auth.uid() = author_id
    and (
      type in ('event','media')
      or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('staff','admin'))
    )
  );
create policy "authors can update their own posts" on public.posts
  for update using (auth.uid() = author_id);
create policy "authors can delete their own posts" on public.posts
  for delete using (auth.uid() = author_id);

create policy "rsvps are public to read" on public.event_rsvps
  for select using (true);
create policy "users can rsvp as themselves" on public.event_rsvps
  for insert with check (auth.uid() = user_id);
create policy "users can remove their own rsvp" on public.event_rsvps
  for delete using (auth.uid() = user_id);

alter publication supabase_realtime add table public.listings;
alter publication supabase_realtime add table public.threads;
alter publication supabase_realtime add table public.messages;
alter publication supabase_realtime add table public.posts;
alter publication supabase_realtime add table public.event_rsvps;

   ============================================================ */

/* ============================================================
   PROMOTING A STUDENT TO STAFF (so they can post News/Announcements):

   update public.profiles set role = 'staff' where email = 'someone@summit.edu.ng';

   DEMOTING BACK TO STUDENT:

   update public.profiles set role = 'student' where email = 'someone@summit.edu.ng';

   ============================================================ */

    //  update public.profiles set role = 'staff' where email = 'criffad24@gmail.com';
