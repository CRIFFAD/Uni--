/* ============================================================
   Summit Hub — live Supabase data layer.
   Every page talks only to the SM.* functions exposed here.
   ============================================================ */

import { SUPABASE_URL, SUPABASE_ANON_KEY, ALLOWED_EMAIL_DOMAINS } from './supabase-config.js';
import { R2_WORKER_URL } from './r2-config.js';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const CATEGORIES = ['Electronics','Fashion','Food & Snacks','Books & Notes','Services','Room & Hostel','Other'];

/* ---------------- helpers ---------------- */
function initials(name){
  return name.trim().split(/\s+/).map(w => w[0]).slice(0,2).join('').toUpperCase();
}
function mapListing(row){
  return row ? { ...row, sellerId: row.seller_id, desc: row.description, imageUrl: row.image_url, imageKey: row.image_key, createdAt: row.created_at } : null;
}
function mapThread(row){
  return row ? { ...row, listingId: row.listing_id, listingTitle: row.listing_title, buyerId: row.buyer_id, sellerId: row.seller_id, lastMessage: row.last_message, updatedAt: row.updated_at } : null;
}
function mapMessage(row){
  return row ? { ...row, from: row.from_user, ts: row.ts } : null;
}
function mapProfile(row){
  return row ? {
    id: row.id, name: row.name, email: row.email, dept: row.dept, bio: row.bio, initials: row.initials,
    avatarUrl: row.avatar_url, avatarKey: row.avatar_key, role: row.role || 'student'
  } : null;
}
function sleep(ms){ return new Promise(r => setTimeout(r, ms)); }

/* ============================================================
   AUTH

   This app is a multi-page static site (every link is a full page
   reload, not an SPA route), so every page's script starts from
   scratch and needs to answer one question early: "is someone
   logged in, and who?" Getting that answer WRONG even briefly is
   what caused a real bug: clicking the chat icon would show
   chat.html for an instant, then bounce to the login page, which
   would immediately bounce back — because a transient false
   "nobody's logged in" reading briefly won a race against the real
   session being restored from storage.

   THE FIX: resolveInitialUser() below is the ONLY thing that ever
   decides the FIRST answer to "who's logged in" on a page. It does
   not trust a single check — if the first read comes back empty, it
   waits briefly and checks again before accepting that as real,
   because a real logged-out user still reads empty on the recheck
   (no visible difference to them), while a session that was just
   slow to restore gets caught and corrected before anything acts on
   the wrong answer. Supabase's own onAuthStateChange listener is
   still used, but only to react to things that happen AFTER that
   first answer is settled (an explicit login/logout) — never to
   supply the first answer itself, since that's the exact channel
   the false reading came from.
   ============================================================ */

let cachedProfile = null;
let authInitialized = false;
let authInitPromise = null;
const authListeners = [];

async function loadProfile(userId){
  const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).single();
  if (error) return null;
  return mapProfile(data);
}

async function readSessionUser(){
  const { data } = await supabase.auth.getSession();
  const user = data.session?.user;
  return user ? await loadProfile(user.id) : null;
}

async function resolveInitialUser(){
  let profile = await readSessionUser();
  if (!profile){
    // First read came back empty. Don't trust that yet — wait briefly
    // and check again. A genuinely logged-out visitor still reads
    // empty here too, so this costs them nothing perceptible; it only
    // matters for the case where a real session was mid-restore.
    await sleep(500);
    profile = await readSessionUser();
  }
  return profile;
}

function notifyAuthListeners(){
  authListeners.forEach(cb => cb(cachedProfile));
}

function initAuthOnce(){
  if (authInitPromise) return authInitPromise;

  authInitPromise = resolveInitialUser().then((profile) => {
    cachedProfile = profile;
    authInitialized = true;
    notifyAuthListeners();
  });

  supabase.auth.onAuthStateChange(async (event, session) => {
    // Ignore anything before the initial answer is settled, and ignore
    // Supabase's own "here's the session at startup" event — both are
    // exactly the kind of early/transient signal resolveInitialUser()
    // already handles more carefully above. Only react to real,
    // later changes (an explicit sign-in or sign-out action).
    if (!authInitialized || event === 'INITIAL_SESSION') return;
    const user = session?.user;
    cachedProfile = user ? await loadProfile(user.id) : null;
    notifyAuthListeners();
  });

  return authInitPromise;
}

function onAuthChange(callback){
  authListeners.push(callback);
  initAuthOnce();
  if (authInitialized) callback(cachedProfile);
  return () => {
    const idx = authListeners.indexOf(callback);
    if (idx !== -1) authListeners.splice(idx, 1);
  };
}

function currentUser(){ return cachedProfile; }

async function signUp({ name, email, password, dept }){
  if (ALLOWED_EMAIL_DOMAINS && ALLOWED_EMAIL_DOMAINS.length){
    const emailLower = email.toLowerCase();
    const allowed = ALLOWED_EMAIL_DOMAINS.some(domain => emailLower.endsWith('@' + domain));
    if (!allowed){
      throw new Error(`Please sign up with one of these: ${ALLOWED_EMAIL_DOMAINS.map(d => '@' + d).join(' or ')}`);
    }
  }
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) throw error;
  const userId = data.user.id;
  const profile = { id: userId, name, email, dept: dept || '', bio: '', initials: initials(name) };
  const { error: profileError } = await supabase.from('profiles').insert(profile);
  if (profileError) throw profileError;
  cachedProfile = mapProfile(profile);
  return cachedProfile;
}

async function logIn({ email, password }){
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
}

async function logOut(){
  await supabase.auth.signOut();
}

async function updateProfile({ name, dept, bio, avatarFile }){
  const me = cachedProfile;
  if (!me) throw new Error('You need to be logged in to edit your profile.');

  const patch = {};
  if (name !== undefined && name !== null){
    patch.name = name;
    patch.initials = initials(name);
  }
  if (dept !== undefined) patch.dept = dept;
  if (bio !== undefined) patch.bio = bio;

  let oldAvatarKey = null;
  if (avatarFile){
    const uploaded = await uploadToR2(avatarFile);
    patch.avatar_url = uploaded.url;
    patch.avatar_key = uploaded.key;
    oldAvatarKey = me.avatarKey || null;
  }

  const { data, error } = await supabase.from('profiles').update(patch).eq('id', me.id).select().single();
  if (error) throw error;

  if (oldAvatarKey) await deleteFromR2(oldAvatarKey);

  cachedProfile = mapProfile(data);
  return cachedProfile;
}

/* ---------------- listings ---------------- */
function listenListings(callback){
  async function refetch(){
    const { data } = await supabase.from('listings').select('*').order('created_at', { ascending: false });
    callback((data || []).map(mapListing));
  }
  refetch();
  const channel = supabase.channel('listings-feed')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'listings' }, refetch)
    .subscribe();
  return () => supabase.removeChannel(channel);
}

function listenListingsBySeller(sellerId, callback){
  async function refetch(){
    const { data } = await supabase.from('listings').select('*').eq('seller_id', sellerId).order('created_at', { ascending: false });
    callback((data || []).map(mapListing));
  }
  refetch();
  const channel = supabase.channel('listings-by-' + sellerId)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'listings', filter: `seller_id=eq.${sellerId}` }, refetch)
    .subscribe();
  return () => supabase.removeChannel(channel);
}

async function getListing(id){
  const { data, error } = await supabase.from('listings').select('*').eq('id', id).single();
  if (error) return null;
  return mapListing(data);
}

/* ---------------- R2 photo storage (via the Worker) ---------------- */
async function currentAccessToken(){
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token || null;
}

async function uploadToR2(file){
  const token = await currentAccessToken();
  if (!token) throw new Error('You need to be logged in to upload a photo.');

  const res = await fetch(`${R2_WORKER_URL}/upload`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': file.type || 'application/octet-stream',
      'X-File-Name': file.name
    },
    body: file
  });
  if (!res.ok){
    if (res.status === 401) throw new Error('Your session expired — please log in again.');
    throw new Error('Photo upload failed. Check that the Worker URL in js/r2-config.js is correct.');
  }
  return res.json();
}

async function deleteFromR2(key){
  if (!key) return;
  const token = await currentAccessToken();
  if (!token) return;
  try{
    await fetch(`${R2_WORKER_URL}/delete?key=${encodeURIComponent(key)}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${token}` }
    });
  }catch(e){
    console.warn('Could not clean up photo:', e);
  }
}

async function addListing({ title, category, price, desc, glyph, imageFile }, sellerId){
  let imageUrl = null;
  let imageKey = null;
  if (imageFile){
    const uploaded = await uploadToR2(imageFile);
    imageUrl = uploaded.url;
    imageKey = uploaded.key;
  }
  const record = {
    title, category, price: Number(price), description: desc, glyph: glyph || '🛍️',
    image_url: imageUrl, image_key: imageKey, seller_id: sellerId, status: 'available'
  };
  const { data, error } = await supabase.from('listings').insert(record).select().single();
  if (error) throw error;
  return mapListing(data);
}

async function updateListing(id, patch){
  const dbPatch = {};
  if ('status' in patch) dbPatch.status = patch.status;
  if ('title' in patch) dbPatch.title = patch.title;
  if ('price' in patch) dbPatch.price = patch.price;
  if ('desc' in patch) dbPatch.description = patch.desc;
  const { error } = await supabase.from('listings').update(dbPatch).eq('id', id);
  if (error) throw error;
}

async function deleteListing(id){
  const { data: listing } = await supabase.from('listings').select('image_key').eq('id', id).single();
  const { error } = await supabase.from('listings').delete().eq('id', id);
  if (error) throw error;
  if (listing?.image_key) await deleteFromR2(listing.image_key);
}

/* ---------------- users ---------------- */
async function getUser(id){ return loadProfile(id); }

/* ---------------- chat ---------------- */
function listenThreads(userId, callback){
  async function refetch(){
    const { data } = await supabase.from('threads').select('*')
      .or(`buyer_id.eq.${userId},seller_id.eq.${userId}`)
      .order('updated_at', { ascending: false });
    callback((data || []).map(mapThread));
  }
  refetch();
  const channel = supabase.channel('threads-for-' + userId)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'threads' }, refetch)
    .subscribe();
  return () => supabase.removeChannel(channel);
}

async function getOrCreateThread(listingId, listingTitle, buyerId, sellerId){
  const { data: existing } = await supabase.from('threads').select('*')
    .eq('listing_id', listingId).eq('buyer_id', buyerId).maybeSingle();
  if (existing) return mapThread(existing);

  const record = { listing_id: listingId, listing_title: listingTitle, buyer_id: buyerId, seller_id: sellerId, last_message: '' };
  const { data, error } = await supabase.from('threads').insert(record).select().single();
  if (error) throw error;
  return mapThread(data);
}

async function getThread(id){
  const { data, error } = await supabase.from('threads').select('*').eq('id', id).single();
  if (error) return null;
  return mapThread(data);
}

function listenMessages(threadId, callback){
  async function refetch(){
    const { data } = await supabase.from('messages').select('*').eq('thread_id', threadId).order('ts', { ascending: true });
    callback((data || []).map(mapMessage));
  }
  refetch();
  const channel = supabase.channel('messages-in-' + threadId)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'messages', filter: `thread_id=eq.${threadId}` }, refetch)
    .subscribe();
  return () => supabase.removeChannel(channel);
}

async function sendMessage(threadId, from, text){
  const { error } = await supabase.from('messages').insert({ thread_id: threadId, from_user: from, text });
  if (error) throw error;
  await supabase.from('threads').update({ last_message: text, updated_at: new Date().toISOString() }).eq('id', threadId);
}

/* ---------------- posts: news / announcements / events / media ---------------- */
function mapPost(row){
  return row ? {
    ...row, authorId: row.author_id, imageUrl: row.image_url, imageKey: row.image_key,
    createdAt: row.created_at, eventDate: row.event_date, eventLocation: row.event_location
  } : null;
}

function listenPosts(types, callback){
  const typeList = types ? (Array.isArray(types) ? types : [types]) : null;
  async function refetch(){
    let query = supabase.from('posts').select('*').order('created_at', { ascending: false });
    if (typeList) query = query.in('type', typeList);
    const { data } = await query;
    callback((data || []).map(mapPost));
  }
  refetch();
  const channel = supabase.channel('posts-' + (typeList ? typeList.join('-') : 'all'))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'posts' }, refetch)
    .subscribe();
  return () => supabase.removeChannel(channel);
}

function watchNewPosts(types, onInsert){
  const typeList = Array.isArray(types) ? types : [types];
  const channel = supabase.channel('watch-new-posts-' + typeList.join('-'))
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'posts' }, (payload) => {
      if (typeList.includes(payload.new.type)) onInsert(mapPost(payload.new));
    })
    .subscribe();
  return () => supabase.removeChannel(channel);
}

function listenUpcomingEvents(callback){
  async function refetch(){
    const nowIso = new Date().toISOString();
    const { data: events } = await supabase.from('posts').select('*')
      .eq('type', 'event').gte('event_date', nowIso).order('event_date', { ascending: true });
    const list = events || [];
    if (!list.length){ callback([]); return; }

    const ids = list.map(e => e.id);
    const { data: rsvps } = await supabase.from('event_rsvps').select('post_id, user_id').in('post_id', ids);
    const me = currentUser();

    callback(list.map(e => {
      const going = (rsvps || []).filter(r => r.post_id === e.id);
      return { ...mapPost(e), rsvpCount: going.length, iAmGoing: me ? going.some(r => r.user_id === me.id) : false };
    }));
  }
  refetch();
  const channel = supabase.channel('upcoming-events')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'posts' }, refetch)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'event_rsvps' }, refetch)
    .subscribe();
  return () => supabase.removeChannel(channel);
}

async function getPost(id){
  const { data, error } = await supabase.from('posts').select('*').eq('id', id).single();
  if (error) return null;
  return mapPost(data);
}

async function addPost({ type, title, body, imageFile, pinned, eventDate, eventLocation }, authorId){
  let imageUrl = null, imageKey = null;
  if (imageFile){
    const uploaded = await uploadToR2(imageFile);
    imageUrl = uploaded.url;
    imageKey = uploaded.key;
  }
  const record = {
    type, title, body: body || '', image_url: imageUrl, image_key: imageKey,
    pinned: !!pinned, event_date: eventDate || null, event_location: eventLocation || null,
    author_id: authorId
  };
  const { data, error } = await supabase.from('posts').insert(record).select().single();
  if (error){
    if (error.message && error.message.toLowerCase().includes('row-level security') && (type === 'news' || type === 'announcement')){
      throw new Error('Only Summit Hub staff accounts can post News or Announcements.');
    }
    throw error;
  }
  return mapPost(data);
}

async function deletePost(id){
  const { data: post } = await supabase.from('posts').select('image_key').eq('id', id).single();
  const { error } = await supabase.from('posts').delete().eq('id', id);
  if (error) throw error;
  if (post?.image_key) await deleteFromR2(post.image_key);
}

async function getRsvpInfo(postId, userId){
  const { data } = await supabase.from('event_rsvps').select('user_id').eq('post_id', postId);
  const list = data || [];
  return { count: list.length, iAmGoing: userId ? list.some(r => r.user_id === userId) : false };
}

async function toggleRsvp(postId, userId, goingNow){
  if (goingNow){
    const { error } = await supabase.from('event_rsvps').delete().eq('post_id', postId).eq('user_id', userId);
    if (error) throw error;
  } else {
    const { error } = await supabase.from('event_rsvps').insert({ post_id: postId, user_id: userId });
    if (error) throw error;
  }
}

/* ---------------- display helpers ---------------- */
function money(n){ return '₦' + Number(n).toLocaleString('en-NG'); }
function timeAgo(ts){
  if (!ts) return 'just now';
  const millis = typeof ts === 'string' ? new Date(ts).getTime() : ts;
  const mins = Math.floor((Date.now() - millis) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return mins + 'm ago';
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return hrs + 'h ago';
  return Math.floor(hrs / 24) + 'd ago';
}
function toast(msg, isError){
  let el = document.querySelector('.toast');
  if (!el){ el = document.createElement('div'); el.className = 'toast'; document.body.appendChild(el); }
  el.textContent = msg;
  el.classList.toggle('error', !!isError);
  el.classList.add('show');
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.remove('show'), 2600);
}
function redirectToAuth(){ window.location.href = 'auth.html'; }

const SM = {
  CATEGORIES,
  onAuthChange, currentUser, signUp, logIn, logOut, updateProfile,
  listenListings, listenListingsBySeller, getListing, addListing, updateListing, deleteListing,
  getUser,
  listenThreads, getOrCreateThread, getThread, listenMessages, sendMessage,
  listenPosts, watchNewPosts, listenUpcomingEvents, getPost, addPost, deletePost, toggleRsvp, getRsvpInfo,
  money, timeAgo, toast, redirectToAuth
};

window.SM = SM;
export default SM;
