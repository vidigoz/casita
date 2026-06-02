// ── NOTIFICACIONES PUSH ──────────────────────────────────────
const VAPID_PUBLIC_KEY = 'BE9qr2_gv_Fl0ZR4KZg2hFgWajeX9fPbuDFyD49EBp350V7CNp1J8iBJ-kMNs9g8WwtsoVS6HbE81p-sdCjRkiA';

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  return new Uint8Array([...raw].map(c => c.charCodeAt(0)));
}

async function pushSupported() {
  return 'serviceWorker' in navigator && 'PushManager' in window;
}

async function getPushPermission() {
  if (!await pushSupported()) return 'unsupported';
  return Notification.permission; // 'default' | 'granted' | 'denied'
}

async function subscribePush() {
  if (!await pushSupported()) return false;
  if (USER?.guest) return false;

  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
    });
    await api('push-subscribe', { method: 'POST', body: { subscription: sub.toJSON() } });
    return true;
  } catch (e) {
    console.error('subscribePush error:', e);
    return false;
  }
}

async function requestPushPermission() {
  if (!await pushSupported()) {
    toast('Tu navegador no soporta notificaciones');
    return;
  }
  if (USER?.guest) {
    toast('Crea una cuenta para activar notificaciones');
    return;
  }

  const perm = await Notification.requestPermission();
  if (perm === 'granted') {
    const ok = await subscribePush();
    if (ok) toast('¡Notificaciones activadas! Te avisaré 30 min antes ✓');
    else toast('No se pudo activar, intenta de nuevo');
  } else {
    toast('Permiso denegado. Actívalas desde ajustes del navegador');
  }
  renderPushStatus();
}

async function renderPushStatus() {
  const el = document.getElementById('push-status-row');
  if (!el) return;

  if (!await pushSupported()) {
    el.innerHTML = '<span style="font-size:.8rem;color:var(--ink3)">Tu navegador no soporta notificaciones</span>';
    return;
  }

  const perm = Notification.permission;
  if (perm === 'granted') {
    el.innerHTML = `
      <div style="display:flex;align-items:center;gap:.5rem">
        <span style="font-size:.8rem;color:var(--g);font-weight:600">✓ Notificaciones activas</span>
      </div>
      <span style="font-size:.72rem;color:var(--ink3)">Te aviso 30 min antes de cada pendiente</span>`;
  } else if (perm === 'denied') {
    el.innerHTML = `
      <span style="font-size:.8rem;color:var(--r)">Notificaciones bloqueadas</span>
      <span style="font-size:.72rem;color:var(--ink3)">Actívalas en ajustes del navegador</span>`;
  } else {
    el.innerHTML = `
      <button class="btn-primary" style="width:100%" onclick="requestPushPermission()">
        🔔 Activar notificaciones
      </button>
      <span style="font-size:.72rem;color:var(--ink3);text-align:center">Te avisamos 30 min antes de tus pendientes</span>`;
  }
}

// Auto-suscribir si ya tiene permiso pero aún no está suscrito
async function initPush() {
  if (!await pushSupported()) return;
  if (USER?.guest) return;
  if (Notification.permission === 'granted') {
    await subscribePush();
    renderPushStatus();
  }
}
