/* ============================================================
   Live notifications for News & Announcements — via Supabase
   Realtime, while Summit Hub is open or running in the background
   as an installed PWA. Not true push (won't reach a fully closed
   app/browser) — that needs a server with VAPID keys, a separate
   feature.
   ============================================================ */

const DISMISS_KEY = 'summit-hub-notif-banner-dismissed';

function showNotification(post){
  const isAnnouncement = post.type === 'announcement';
  const title = isAnnouncement ? '📣 New Announcement' : '📰 New News Post';
  const options = { body: post.title, icon: 'assets/icon-192.png', badge: 'assets/icon-192.png', data: { id: post.id } };

  if (navigator.serviceWorker && navigator.serviceWorker.ready){
    navigator.serviceWorker.ready.then((reg) => reg.showNotification(title, options));
  } else if ('Notification' in window){
    new Notification(title, options);
  }
}

function startWatching(){
  if (!window.SM || !SM.watchNewPosts) return;
  SM.watchNewPosts(['news', 'announcement'], (post) => {
    const me = SM.currentUser ? SM.currentUser() : null;
    if (me && post.authorId === me.id) return;
    showNotification(post);
  });
}

function showOptInBanner(){
  if (document.getElementById('notif-opt-in-banner')) return;
  if (window.matchMedia('(display-mode: standalone)').matches && Notification.permission === 'granted') return;

  const banner = document.createElement('div');
  banner.id = 'notif-opt-in-banner';
  banner.innerHTML = `
    <span class="notif-opt-icon">🔔</span>
    <div class="notif-opt-text">
      <strong>Get notified about campus news</strong>
      <span>We'll alert you when something new is posted.</span>
    </div>
    <button id="notif-opt-enable">Enable</button>
    <button id="notif-opt-dismiss" aria-label="Dismiss">✕</button>
  `;
  document.body.appendChild(banner);

  document.getElementById('notif-opt-enable').addEventListener('click', async () => {
    banner.remove();
    const permission = await Notification.requestPermission();
    if (permission === 'granted') startWatching();
  });
  document.getElementById('notif-opt-dismiss').addEventListener('click', () => {
    localStorage.setItem(DISMISS_KEY, '1');
    banner.remove();
  });
}

function init(){
  if (!('Notification' in window)) return;
  if (Notification.permission === 'granted'){
    startWatching();
  } else if (Notification.permission === 'default' && !localStorage.getItem(DISMISS_KEY)){
    setTimeout(showOptInBanner, 2000);
  }
}

init();
