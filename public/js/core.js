/* ============================================================
   Casita — core.js
   ============================================================ */

// ── Storage ─────────────────────────────────────────────────
const S = {
  g:(k,d=null)=>{try{const v=localStorage.getItem('c_'+k);return v?JSON.parse(v):d}catch{return d}},
  s:(k,v)=>{try{localStorage.setItem('c_'+k,JSON.stringify(v))}catch{}},
  d:(k)=>{try{localStorage.removeItem('c_'+k)}catch{}}
};

// ── State ────────────────────────────────────────────────────
let USER = null;
let chatHistory = [];
let recipeOffset = 0;
let currentRecipes = [];
let savedRecipes = [];
let voiceRecognition = null;
let isListening = false;
let voiceStopRequested = false;
let voiceSilenceTimer = null;
let greetingClockTimer = null;

const THEMES = {
  cocina: { label: 'Cocina', color: '#FAF5EC' },
  mercado: { label: 'Mercado', color: '#FFF8EC' },
  nocturno:{ label: 'Nocturno', color: '#1A1410' }
};

// ── API helper ───────────────────────────────────────────────
async function api(path, opts={}) {
  const hdrs = {'Content-Type':'application/json'};
  if (USER?.id) hdrs['x-user-id'] = USER.id;
  const res = await fetch('/api/'+path, {
    method: opts.method||'GET',
    headers: hdrs,
    body: opts.body ? JSON.stringify(opts.body) : undefined
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error||'Error de servidor');
  return data;
}

// Wrapper para llamadas que requieren cuenta — silencia errores en modo guest
async function apiAuth(path, opts={}) {
  if (USER.guest) return null;
  return api(path, opts);
}

// ── Guest / Account ──────────────────────────────────────────
function makeGuest() {
  return { id: null, email: null, casita_name: 'Casita', household_size: 4, city: 'CDMX', guest: true };
}

function logout() {
  if (!confirm('¿Cerrar sesión?')) return;
  S.d('user'); S.d('onboarding_settings_seen'); USER = makeGuest(); S.s('user', USER); chatHistory = []; location.reload();
}

function updateOnboardingPulse() {
  const btn = document.getElementById('settings-btn');
  if (!btn) return;
  btn.classList.toggle('onboarding-pulse', Boolean(USER?.guest && !S.g('onboarding_settings_seen', false)));
}

async function createAccount() {
  const email = document.getElementById('s-account-email').value.trim();
  const pin   = document.getElementById('s-account-pin').value.trim();
  const name  = document.getElementById('s-name').value.trim() || USER.casita_name || 'Casita';
  const btn   = document.getElementById('s-account-btn');
  const err   = document.getElementById('s-account-err');
  err.classList.add('hidden');
  if (!email || !email.includes('@')) { showAccountErr('Pon un correo válido'); return; }
  if (!/^\d{4}$/.test(pin)) { showAccountErr('El PIN debe tener 4 dígitos'); return; }
  const household = parseInt(document.getElementById('s-household').value, 10) || USER.household_size || 4;
  const city = document.getElementById('s-city').value.trim() || USER.city || 'CDMX';
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span>';
  try {
    const d = await api('auth', { method:'POST', body:{ action:'register', email, pin, casita_name: name, household_size: household, city } });
    USER = d.user;
    S.s('user', USER);
    setGreeting();
    updateOnboardingPulse();
    if (typeof loadSettings === 'function') loadSettings();
    else renderAccountSection();
    addWelcomeBubble();
    toast(d.updated ? 'Cuenta actualizada ✓' : '¡Cuenta creada! ✓');
  } catch(e) {
    showAccountErr(e.message);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Crear cuenta';
  }
}

async function loginAccount() {
  const email = document.getElementById('s-account-email').value.trim();
  const pin   = document.getElementById('s-account-pin').value.trim();
  const btn   = document.getElementById('s-account-login-btn');
  const err   = document.getElementById('s-account-err');
  err.classList.add('hidden');
  if (!email || !email.includes('@')) { showAccountErr('Pon un correo válido'); return; }
  if (!/^\d{4}$/.test(pin)) { showAccountErr('El PIN debe tener 4 dígitos'); return; }
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span>';
  try {
    const d = await api('auth', { method:'POST', body:{ action:'login', email, pin } });
    USER = d.user;
    S.s('user', USER);
    setGreeting();
    updateOnboardingPulse();
    if (typeof loadSettings === 'function') loadSettings();
    else renderAccountSection();
    addWelcomeBubble();
    toast('¡Bienvenido de vuelta! ✓');
  } catch(e) {
    showAccountErr(e.message);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Entrar';
  }
}

function showAccountErr(msg) {
  const el = document.getElementById('s-account-err');
  el.textContent = msg;
  el.classList.remove('hidden');
}

function toggleAccountPin() {
  const inp = document.getElementById('s-account-pin');
  const btn = document.getElementById('s-account-pin-toggle');
  if (!inp || !btn) return;
  const show = inp.type === 'password';
  inp.type = show ? 'text' : 'password';
  btn.textContent = show ? 'ocultar pin' : 'ver pin';
}

// ── Launch ───────────────────────────────────────────────────
function initFabDrag() {
  const fab = document.getElementById('fab');
  const container = document.getElementById('body'); // scrollable area
  let dragging = false, startY = 0, startTop = 0, didDrag = false;

  function getContainer() { return fab.parentElement; }

  function applyTop(top) {
    const parent = getContainer();
    const maxTop = parent.clientHeight - fab.offsetHeight - 8;
    const minTop = 8;
    const clamped = Math.max(minTop, Math.min(maxTop, top));
    fab.style.bottom = 'auto';
    fab.style.top = clamped + 'px';
    return clamped;
  }

  function loadSaved() {
    const saved = localStorage.getItem('fab_top');
    if (saved !== null) applyTop(parseInt(saved));
  }

  fab.addEventListener('touchstart', e => {
    dragging = true; didDrag = false;
    startY = e.touches[0].clientY;
    const rect = fab.getBoundingClientRect();
    const parentRect = fab.parentElement.getBoundingClientRect();
    startTop = rect.top - parentRect.top;
    fab.classList.add('dragging');
    e.stopPropagation();
  }, {passive:true});

  fab.addEventListener('touchmove', e => {
    if (!dragging) return;
    const dy = e.touches[0].clientY - startY;
    if (Math.abs(dy) > 4) didDrag = true;
    applyTop(startTop + dy);
    e.stopPropagation();
  }, {passive:true});

  fab.addEventListener('touchend', e => {
    if (!dragging) return;
    dragging = false;
    fab.classList.remove('dragging');
    if (didDrag) {
      const rect = fab.getBoundingClientRect();
      const parentRect = fab.parentElement.getBoundingClientRect();
      const top = applyTop(rect.top - parentRect.top);
      localStorage.setItem('fab_top', top);
      // evitar que el touchend dispare el click
      e.stopPropagation();
      fab.addEventListener('click', e => e.stopPropagation(), {once:true, capture:true});
    }
  }, {passive:true});

  loadSaved();
}

function launchApp() {
  setupVoice();
  initFabDrag();
  setGreeting();
  startGreetingClock();
  updateOnboardingPulse();
  loadInicio();
  if (USER.guest) {
    addBubble('ai', `Hola Bienvenido! ve a configuracion para crear una cuenta`);
  } else {
    addWelcomeBubble();
  }
}

function addWelcomeBubble() {
  const name = USER?.casita_name || 'bienvenida';
  addBubble('ai', `Hola ${name} 👋 ¿cómo puedo ayudarte hoy?`);
}

function setGreeting() {
  const h = new Date().getHours();
  const g = h<12?'Buenos días':h<19?'Buenas tardes':'Buenas noches';
  const name = USER.casita_name || 'Casita';
  document.getElementById('greet-h1').innerHTML = USER.guest
    ? `Hola Bienvenido!<br><em>ve a configuracion para crear una cuenta</em>`
    : `${g},<br><em>${name}</em>`;
  document.getElementById('hdr-sub').textContent = USER.guest ? 'tu asistente del hogar' : `hola ${name.toLowerCase()}`;
  updateGreetingDateTime();
}

function startGreetingClock() {
  if (greetingClockTimer) clearInterval(greetingClockTimer);
  updateGreetingDateTime();
  greetingClockTimer = setInterval(updateGreetingDateTime, 60000);
}

function updateGreetingDateTime() {
  const el = document.getElementById('greet-date');
  if (!el) return;
  const days=['domingo','lunes','martes','miércoles','jueves','viernes','sábado'];
  const months=['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
  const d = new Date();
  const hour = d.getHours();
  const hour12 = hour % 12 || 12;
  const suffix = hour < 12 ? 'a.m.' : 'p.m.';
  const time = `${hour12}:${String(d.getMinutes()).padStart(2,'0')} ${suffix}`;
  el.textContent = `es ${days[d.getDay()]} ${d.getDate()} de ${months[d.getMonth()]} y son las ${time}`;
}

// ── Navigation ───────────────────────────────────────────────
const TABS_WITH_FAB = [];

function goTab(name, opts={}) {
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
  document.getElementById('pg-'+name).classList.add('active');
  document.querySelectorAll('.nav-btn').forEach(b=>b.classList.remove('on'));
  const btn = document.querySelector(`.nav-btn[data-t="${name}"]`);
  if (btn) btn.classList.add('on');
  document.getElementById('body').scrollTop = 0;

  // FAB visibility
  const fab = document.getElementById('fab');
  fab.classList.toggle('hide', !TABS_WITH_FAB.includes(name));

  // Load data
  if (name==='inicio')     loadInicio();
  if (name==='pendientes') loadTasks();
  if (name==='mandado')    loadMandado();
  if (name==='recetas') {
    loadRecipes(false);
  }
  if (name==='proyectos')  loadProjects();
  if (name==='ajustes') {
    if (USER.guest) {
      S.s('onboarding_settings_seen', true);
      updateOnboardingPulse();
    }
    loadSettings();
  }
  if (name==='chat' && opts.focus!==false) document.getElementById('chat-input').focus();
}

function swMandado(tab, btn) {
  document.querySelectorAll('#pg-mandado .seg-btn').forEach(b=>b.classList.remove('on'));
  btn.classList.add('on');
  document.getElementById('m-compras').classList.toggle('hidden', tab!=='compras');
  document.getElementById('m-despensa').classList.toggle('hidden', tab!=='despensa');
}

function swRecetas(tab, btn) {
  document.querySelectorAll('#pg-recetas .seg-btn').forEach(b=>b.classList.remove('on'));
  btn.classList.add('on');
  document.getElementById('r-sug').classList.toggle('hidden', tab!=='sug');
  document.getElementById('r-hist').classList.toggle('hidden', tab!=='hist');
  if (tab==='hist') loadMealsHistory();
}
