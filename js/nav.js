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

    // Only show the "+" button to accounts actually allowed to post in
    // this context. Plain students can't post anywhere anymore, so
    // there's no reason to show them a button that just leads to a
    // "you're not allowed to do this" message.
    const canCreate = context === 'market'
      ? ['vendor','staff','admin'].includes(user.role)
      : ['staff','admin'].includes(user.role);

    const createBtnHtml = canCreate
      ? `<a href="${createHref}" class="pill-btn">+ <span class="btn-label">${createLabel}</span></a>`
      : '';

    slot.innerHTML = `
      <a href="chat.html" class="chat-icon-link notif-badge" title="Messages">💬
        <span class="count" id="unread-count" style="display:none;"></span>
      </a>
      ${createBtnHtml}
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


const popup = document.getElementById("imagePopup");
const closePopup = document.getElementById("closePopup");

// Show popup immediately after page loads
window.addEventListener("load", () => {
    popup.classList.add("show");
});

// Close popup
closePopup.addEventListener("click", () => {
    popup.classList.remove("show");
});

// Close when clicking outside the image
popup.addEventListener("click", (event) => {
    if (event.target === popup) {
        popup.classList.remove("show");
    }
});
