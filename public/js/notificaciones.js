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

// Preferencia del usuario (distinta del permiso del navegador).
// Si el usuario desactiva, NO lo re-suscribimos aunque el permiso siga en 'granted'.
function pushWanted() { return S.g('push_enabled', false) === true; }
function setPushWanted(v) { S.s('push_enabled', !!v); }

async function getActivePushSubscription() {
  if (!await pushSupported()) return null;
  try {
    const reg = await navigator.serviceWorker.ready;
    return await reg.pushManager.getSubscription();
  } catch { return null; }
}

// Crea/recupera la suscripción y la registra en el servidor.
// Lanza el error real si algo falla (para poder mostrarlo).
async function subscribePush() {
  const reg = await navigator.serviceWorker.ready;
  const existing = await reg.pushManager.getSubscription();
  const sub = existing || await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
  });
  await api('push-subscribe', { method: 'POST', body: { subscription: sub.toJSON() } });
  return sub;
}

async function unsubscribePush() {
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  if (!sub) return;
  const subJson = sub.toJSON();
  await sub.unsubscribe();
  try {
    await api('push-subscribe', { method: 'POST', body: { action: 'unsubscribe', subscription: subJson } });
  } catch (e) {
    console.warn('No se pudo borrar suscripción del servidor:', e);
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

  try {
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') {
      toast('Permiso denegado. Actívalas en ajustes del navegador');
      renderPushStatus();
      return;
    }
    await subscribePush();
    setPushWanted(true);
    toast('¡Notificaciones activadas! Te avisaré 30 min antes ✓');
  } catch (e) {
    console.error('activar push falló:', e);
    // Mostramos el error real para poder diagnosticar
    toast('No se pudo activar: ' + (e.message || e.name || 'error desconocido'));
  }
  renderPushStatus();
}

async function disablePush() {
  setPushWanted(false); // primero marcamos preferencia para que initPush no re-suscriba
  try {
    await unsubscribePush();
    toast('Notificaciones desactivadas');
  } catch (e) {
    console.error('desactivar push falló:', e);
    toast('Desactivadas en este dispositivo');
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
  if (USER?.guest) {
    el.innerHTML = '<span style="font-size:.8rem;color:var(--ink3)">Crea una cuenta para activar notificaciones</span>';
    return;
  }

  const perm = Notification.permission;
  const sub = await getActivePushSubscription();
  const active = perm === 'granted' && !!sub && pushWanted();

  if (active) {
    el.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;gap:.5rem">
        <div>
          <div style="font-size:.8rem;color:var(--g);font-weight:600">✓ Notificaciones activas</div>
          <div style="font-size:.72rem;color:var(--ink3);margin-top:2px">Te aviso 30 min antes de cada pendiente</div>
        </div>
        <button class="btn-ghost" style="font-size:.75rem;padding:.45rem .75rem;white-space:nowrap" onclick="disablePush()">Desactivar</button>
      </div>`;
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

// Al cargar: solo re-suscribir si el usuario YA había activado (preferencia true)
// y el permiso sigue concedido. Así, si desactivó, no vuelve a salir activado.
async function initPush() {
  if (!await pushSupported()) return;
  if (USER?.guest) return;
  if (!pushWanted()) return;
  if (Notification.permission !== 'granted') return;
  try {
    await subscribePush();
  } catch (e) {
    console.warn('re-suscribir al cargar falló:', e);
  }
  renderPushStatus();
}
