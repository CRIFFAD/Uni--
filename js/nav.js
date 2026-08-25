/**
 * renderNav(context) — context is 'market' on marketplace pages
 * (shows "+ Post listing" -> post.html) or omitted/'hub' everywhere
 * else (shows "+ Create" -> compose.html).
 */
window.renderNav = function renderNav(context){
  const slot = document.getElementById('nav-auth-slot');
  if (!slot) return;
  let threadUnsub = null;
  const createHref = context === 'market' ? 'post.html' : 'compose.html';
  const createLabel = context === 'market' ? 'Post listing' : 'Create';

  SM.onAuthChange((user) => {
    if (threadUnsub){ threadUnsub(); threadUnsub = null; }

    if (!user){
      slot.innerHTML = `<a href="auth.html" class="pill-btn ghost">Log in</a>`;
      return;
    }

    const avatarInner = user.avatarUrl ? `<img src="${user.avatarUrl}" alt="">` : user.initials;

    slot.innerHTML = `
      <a href="chat.html" class="chat-icon-link notif-badge" title="Messages">💬
        <span class="count" id="unread-count" style="display:none;"></span>
      </a>
      <a href="${createHref}" class="pill-btn">+ <span class="btn-label">${createLabel}</span></a>
      <a href="profile.html" class="avatar-btn" title="${user.name}">${avatarInner}</a>
    `;

    threadUnsub = SM.listenThreads(user.id, (threads) => {
      const badge = document.getElementById('unread-count');
      if (!badge) return;
      if (threads.length){
        badge.textContent = threads.length;
        badge.style.display = 'inline-block';
      } else {
        badge.style.display = 'none';
      }
    });
  });
};

/* Wires the mobile hamburger — independent of auth state, safe to call on every page */
window.initTopNav = function initTopNav(){
  const btn = document.getElementById('hamburger-btn');
  const menu = document.getElementById('mobile-menu');
  if (!btn || !menu) return;
  btn.addEventListener('click', () => {
    const open = menu.classList.toggle('open');
    btn.textContent = open ? '✕' : '☰';
    btn.setAttribute('aria-expanded', open ? 'true' : 'false');
  });
  menu.querySelectorAll('a').forEach(a => {
    a.addEventListener('click', () => {
      menu.classList.remove('open');
      btn.textContent = '☰';
    });
  });
};
