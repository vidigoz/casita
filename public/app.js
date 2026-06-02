// ── INIT / BOOTSTRAP ─────────────────────────────────────────
function init() {
  applyTheme(S.g('theme','cocina'));
  const saved = S.g('user');
  USER = (saved && (saved.id || saved.guest)) ? saved : makeGuest();
  S.s('user', USER);
  launchApp();
}

function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').then(() => {
      initPush();
    });
  }
}

init();
registerServiceWorker();
