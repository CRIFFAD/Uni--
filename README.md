# Summit Hub

News, announcements, events (with RSVP), a campus photo gallery, and a student marketplace — all in one app for Summit University students. Real backend throughout: Supabase (Auth + Postgres + Realtime) and Cloudflare R2 (photo storage via a Worker).

**This zip is a rebuild** — your Supabase project, R2 bucket, and Cloudflare Worker are already fully set up from before, so nothing needs re-doing on that front. Your real credentials are already filled into `js/supabase-config.js` and `js/r2-config.js`. Just drop these files in place of your old ones and you're running the fixed/updated version.

## What changed in this rebuild

**1. Fixed the chat redirect bug for real.** The previous flicker (chat page flashes, then bounces to login, then bounces back) was a race condition: Supabase's own auth listener can report "nobody's logged in" for a brief moment before it finishes restoring a real session from storage. If a page acted on that transient false reading, it would incorrectly redirect to the login page. The fix, in `js/supabase.js`: the very first "is anyone logged in" check now double-checks itself — if the first read comes back empty, it waits half a second and checks again before trusting that as real. A genuinely logged-out visit still resolves the same way (no visible difference); a real session that was just slow to load no longer gets mistaken for "logged out."

**2. Replaced the PWA install banner with a small nav button.** Previously, an "Install Summit Hub" banner would pop up at the bottom of the screen. It's now a small ⬇ icon button that sits quietly in the top nav — invisible by default, and only appears once the browser confirms installing is actually possible. Click it when you want to install; it never interrupts anything on its own.

**3. Notifications are unchanged and still included** — a "Get notified about campus news" banner prompts for browser notification permission once, then real notifications fire via Supabase Realtime whenever News or an Announcement is posted. See the Notifications section below for what this can and can't do.

## Setup (only needed if starting completely fresh)

If you're just replacing files in an existing working setup, skip to "Run it" below — everything else is already configured.

### 1. Supabase
Project URL and anon key are already in `js/supabase-config.js`. The full database schema (tables, security policies, roles, Realtime) is in the large comment block in that same file — paste it into the Supabase SQL Editor and run it once, on a brand-new project only.

### 2. Cloudflare R2 + Worker
Already deployed. `cloudflare-worker/src/index.js` is included for reference or if you ever need to redeploy — paste it into the Worker's code editor in the Cloudflare dashboard, with these bindings/variables already set: `LISTINGS_BUCKET` (R2 bucket binding), `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `PUBLIC_R2_URL`.

### 3. Run it
Because this uses ES modules, open it through a local server, not by double-clicking the file:
```
python3 -m http.server
```
then visit `http://localhost:8000`.

**Important: clear your service worker cache after updating files.** Since this app is a PWA, your browser may keep serving old cached JS/CSS even after you replace the files. In DevTools → Application (or Storage) tab → Service Workers → Unregister, then Clear site data, then reload.

## Site map
- `index.html` — Home: pinned announcements, latest news, upcoming events, campus media, marketplace teaser
- `news.html`, `events.html`, `media.html` — full feeds for each
- `article.html` — shared detail page for any News/Announcement/Event/Media post
- `compose.html` — create a post (type picker adapts the form; News/Announcement hidden for students)
- `profile.html` — edit name/dept/bio, upload a profile photo, log out
- `market.html`, `listing.html`, `post.html`, `dashboard.html`, `chat.html` — the marketplace
- `auth.html` — login/signup

## Roles: staff-only News & Announcements
Every account defaults to `student`. Students can post Events and Campus Media; **News and Announcements require `staff`/`admin`**, enforced by a database policy (not just hidden UI), plus a trigger that stops anyone from granting themselves the role through the app.

Promote someone (SQL Editor):
```sql
update public.profiles set role = 'staff' where email = 'someone@summit.edu.ng';
```
Demote back:
```sql
update public.profiles set role = 'student' where email = 'someone@summit.edu.ng';
```
No limit on how many staff accounts you can have — this is a one-line SQL command each time, no admin UI yet.

## Notifications — what they can and can't do
Real browser/OS notifications fire via Supabase Realtime the moment News or an Announcement is posted. This works while Summit Hub is open in a tab, or running in the background after being installed as a PWA. It is **not** true push — it won't reach someone whose browser/app is fully closed. That needs a server sending signed push messages (VAPID keys + a backend), a separate feature.

## Mobile & PWA
Full mobile layout (hamburger nav, responsive feeds, mobile chat with back button). Installable as an app — the ⬇ button in the nav appears when your browser supports installing. Offline-capable for previously visited pages via the service worker.

**Whenever you change any file**, bump `CACHE_VERSION` at the top of `service-worker.js` (e.g. `'v7'` → `'v8'`) so people don't get stuck on a stale cached copy.

## What's real vs. not yet built
- ✅ Real auth, real Postgres data with Row Level Security throughout, real-time updates everywhere, real R2 photo storage with client-side compression, profile photos, staff-only News/Announcements enforced at the database level, live notifications.
- 🔜 Not built: password reset, editing post/listing text after publishing (delete + repost works), true closed-app push, seller/event ratings, an admin UI for managing roles.
