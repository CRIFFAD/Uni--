/* ---------------- service worker registration ---------------- */
if ('serviceWorker' in navigator){
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('service-worker.js').catch((err) => {
      console.warn('Service worker registration failed:', err);
    });
  });
}

/* ---------------- install button (nav bar, not a popup banner) ----------------
   Sits quietly in the top nav (id="install-btn", hidden by default in
   the HTML/CSS) and only appears once the browser confirms installing
   is actually possible — never pops up unprompted, and disappears
   again once installed or if the browser doesn't support it. */
let deferredInstallPrompt = null;

function getInstallBtn(){ return document.getElementById('install-btn'); }

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredInstallPrompt = e;
  const btn = getInstallBtn();
  if (!btn) return;
  if (window.matchMedia('(display-mode: standalone)').matches) return; // already installed
  btn.style.display = 'inline-flex';
});

window.addEventListener('appinstalled', () => {
  deferredInstallPrompt = null;
  const btn = getInstallBtn();
  if (btn) btn.style.display = 'none';
});

document.addEventListener('DOMContentLoaded', () => {
  const btn = getInstallBtn();
  if (!btn) return;
  btn.addEventListener('click', async () => {
    if (!deferredInstallPrompt) return;
    btn.disabled = true;
    deferredInstallPrompt.prompt();
    await deferredInstallPrompt.userChoice;
    deferredInstallPrompt = null;
    btn.style.display = 'none';
    btn.disabled = false;
  });
});
