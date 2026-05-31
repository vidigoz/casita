/* ============================================================
   Casita — app.js
   v0.0.8
   ============================================================ */
const APP_VERSION = 'v0.0.8';

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
    renderAccountSection();
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
    renderAccountSection();
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
  const days=['domingo','lunes','martes','miércoles','jueves','viernes','sábado'];
  const months=['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
  const d = new Date();
  document.getElementById('greet-date').textContent = `hoy es ${days[d.getDay()]} ${d.getDate()} de ${months[d.getMonth()]}`;
}

// ── Navigation ───────────────────────────────────────────────
const TABS_WITH_FAB = ['pendientes','mandado','recetas','proyectos'];

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

// ── INICIO ───────────────────────────────────────────────────
async function loadInicio() {
  loadWeather();
  try {
    const res = await apiAuth('tasks?filter=today');
    if (!res) {
      document.getElementById('inicio-tasks').innerHTML = '<div class="empty"><p>Crea una cuenta en Ajustes para ver tus pendientes</p></div>';
      return;
    }
    const {items} = res;
    const el = document.getElementById('inicio-tasks');
    if (!items.length) {
      el.innerHTML = '<div class="empty"><p>Sin pendientes por ahora</p></div>';
      return;
    }
    // Show max 4
    const show = items.slice(0,4);
    el.innerHTML = show.map(t=>`
      <div class="row">
        <div class="chk chk-sq ${t.done?'done':''}" onclick="toggleTask(${t.id},${!t.done},true)"></div>
        <span class="row-text ${t.done?'done':''}">${esc(t.title)}</span>
        <span class="row-sub">${t.due_time?fmtTime(t.due_time):'hoy'}</span>
      </div>`).join('')
    + (items.length>4 ? `<div style="text-align:center;padding:.625rem 0 .25rem;font-size:.8rem;color:var(--ink3);font-style:italic;cursor:pointer" onclick="goTab('pendientes')">+${items.length-4} más →</div>` : '');
  } catch(e) { console.error(e); }
}

async function loadWeather() {
  try {
    const city = USER.city || 'Mexico City';
    const d = await api(`weather?city=${encodeURIComponent(city)}`);
    document.getElementById('w-temp').textContent = Math.round(d.temp)+'°';
    document.getElementById('w-city').textContent = d.city || city;
    document.getElementById('w-desc').textContent = d.description || '';
    document.getElementById('w-alert').textContent = d.alert || '';
  } catch(e) {
    document.getElementById('w-desc').textContent = USER.city||'CDMX';
  }
}

// ── PENDIENTES ───────────────────────────────────────────────
async function loadTasks() {
  try {
    const res = await apiAuth('tasks');
    if (!res) { renderTasks([]); return; }
    renderTasks(res.items);
  } catch(e) { console.error(e); }
}

function renderTasks(items) {
  const el = document.getElementById('tasks-list');
  const pending = items.filter(t => !t.done);
  const done    = items.filter(t =>  t.done);

  if (!items.length) {
    el.innerHTML = USER.guest
      ? '<div class="empty"><h3>Sin pendientes</h3><p>Crea una cuenta en Ajustes para guardar tus pendientes</p></div>'
      : '<div class="empty"><h3>Sin pendientes</h3><p>Dile a Casita "recuérdame X" o agrégalo manualmente</p></div>';
    return;
  }

  const taskRow = t => `
    <div class="row" id="task-${t.id}">
      <div class="chk chk-sq ${t.done?'done':''}" onclick="toggleTask(${t.id},${!t.done},false)"></div>
      <div style="flex:1">
        <div class="row-text ${t.done?'done':''}">${esc(t.title)}</div>
        ${(t.due_date||t.due_time)?`<div class="row-sub">${t.due_time?fmtTime(t.due_time):''}${t.due_time&&t.due_date?' · ':''}${t.due_date?fmtDate(t.due_date):''}</div>`:''}
      </div>
      <button class="del-btn" onclick="deleteTask(${t.id})">×</button>
    </div>`;

  let html = '';

  if (pending.length) {
    html += `<div class="card" style="padding:.5rem 1.1rem">${pending.map(taskRow).join('')}</div>`;
  } else {
    html += `<div class="card" style="padding:.5rem 1.1rem"><div class="empty" style="padding:1.25rem 0"><p>Todo listo por hoy ✓</p></div></div>`;
  }

  if (done.length) {
    html += `
      <button class="done-toggle" onclick="this.nextElementSibling.classList.toggle('hidden');this.querySelector('.done-toggle-arrow').style.transform=this.nextElementSibling.classList.contains('hidden')?'':'rotate(90deg)'">
        <span style="font-size:.75rem;font-weight:600;color:var(--ink3)">hecho (${done.length})</span>
        <svg class="done-toggle-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" style="width:13px;height:13px;color:var(--ink3);transition:transform .2s;transform:rotate(90deg)"><polyline points="9 18 15 12 9 6"/></svg>
      </button>
      <div class="card" style="padding:.5rem 1.1rem">${done.map(taskRow).join('')}</div>`;
  }

  el.innerHTML = html;
}

async function toggleTask(id, done, isInicio) {
  try {
    await api('tasks',{method:'POST',body:{action:'toggle',id,done}});
    if (isInicio) loadInicio(); else loadTasks();
  } catch(e) { toast(e.message); }
}

async function deleteTask(id) {
  try {
    await api('tasks',{method:'POST',body:{action:'delete',id}});
    loadTasks();
  } catch(e) { toast(e.message); }
}

async function addTaskManual() {
  if (USER.guest) { toast('Crea una cuenta en Ajustes para agregar pendientes'); return; }
  const inp = document.getElementById('task-input');
  const v = inp.value.trim();
  if (!v) return;
  inp.value = '';
  try {
    await api('tasks',{method:'POST',body:{action:'add',title:v}});
    loadTasks();
  } catch(e) { toast(e.message); }
}

// ── MANDADO / DESPENSA ───────────────────────────────────────
const PANTRY_CATEGORIES = {carnes:'🥩 carnes',verduras:'🥬 verduras',frutas:'🍎 frutas',lacteos:'🥛 lácteos',abarrotes:'🫙 abarrotes',pan:'🍞 pan',limpieza:'🧹 limpieza',otros:'📦 otros'};
const PANTRY_LEVELS = ['lleno','suficiente','poco','agotado'];
const PANTRY_LEVEL_META = {
  lleno:{label:'🟢 lleno',dot:'dot-full',select:'level-full'},
  suficiente:{label:'🟠 suficiente',dot:'dot-enough',select:'level-enough'},
  poco:{label:'🟡 poco',dot:'dot-low',select:'level-low'},
  agotado:{label:'🔴 agotado',dot:'dot-out',select:'level-out'}
};
let pantryGroupBy = 'category';

async function loadMandado() {
  await Promise.all([loadShoppingList(), loadPantry()]);
}

async function loadShoppingList() {
  try {
    const res = await apiAuth('shopping');
    if (!res) { renderShopping([]); return; }
    renderShopping(res.items);
  } catch(e) { console.error(e); }
}

let shopGroupBy = 'none';
let _shopItems = [];

function setShopGroup(mode, btn) {
  shopGroupBy = mode;
  document.querySelectorAll('.shop-group-seg .seg-btn').forEach(b => b.classList.remove('on'));
  btn?.classList.add('on');
  renderShopping(_shopItems);
}

function renderShopping(items) {
  _shopItems = items;
  const el = document.getElementById('shopping-list');
  const pending = items.filter(i => !i.done);
  const done = items.filter(i => i.done);

  if (!items.length) {
    el.innerHTML = '<div class="card" style="padding:.5rem 1.1rem"><div class="empty"><h3>Lista vacía</h3><p>Dile a Casita "necesito X" o agrégalo abajo</p></div></div>';
    return;
  }

  const shopRow = i => `
    <div class="row" id="shop-${i.id}">
      <div class="chk chk-sq ${i.done?'done':''}" onclick="toggleShop(${i.id},${!i.done})"></div>
      <div style="flex:1;min-width:0" onclick="openShopEdit(${i.id})">
        <div class="row-text ${i.done?'done':''}">${esc(i.name)}</div>
        ${i.store_group&&shopGroupBy!=='store'?`<div class="row-sub">${esc(i.store_group)}</div>`:''}
        ${i.reason&&i.source==='ai_suggestion'&&!i.store_group?`<div class="row-sub">${esc(i.reason)}</div>`:''}
      </div>
      ${i.quantity?`<span class="row-sub" style="flex-shrink:0;margin-right:.25rem">${esc(i.quantity)}</span>`:''}
      <button class="del-btn" onclick="delShop(${i.id})">×</button>
    </div>`;

  const grouped = (list, keyFn, fallback) => {
    const groups = {};
    list.forEach(i => { const k = keyFn(i) || fallback; if (!groups[k]) groups[k] = []; groups[k].push(i); });
    return groups;
  };

  const renderGroups = (groups) =>
    Object.entries(groups).map(([g, gitems]) =>
      `<div class="slabel">${esc(g)}</div><div class="card" style="padding:.5rem 1.1rem">${gitems.map(shopRow).join('')}</div>`
    ).join('');

  let html = '';
  if (pending.length) {
    if (shopGroupBy === 'category') {
      html += renderGroups(grouped(pending, i => i.category, 'otros'));
    } else if (shopGroupBy === 'store') {
      html += renderGroups(grouped(pending, i => i.store_group, 'sin tienda'));
    } else {
      html += `<div class="card" style="padding:.5rem 1.1rem">${pending.map(shopRow).join('')}</div>`;
    }
  } else {
    html += `<div class="card" style="padding:.5rem 1.1rem"><div class="empty" style="padding:1.25rem 0"><p>Mandado completo ✓</p></div></div>`;
  }

  if (done.length) {
    html += `
      <button class="done-toggle" onclick="this.nextElementSibling.classList.toggle('hidden');this.querySelector('.done-toggle-arrow').style.transform=this.nextElementSibling.classList.contains('hidden')?'':'rotate(90deg)'">
        <span style="font-size:.75rem;font-weight:600;color:var(--ink3)">comprado (${done.length})</span>
        <svg class="done-toggle-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" style="width:13px;height:13px;color:var(--ink3);transition:transform .2s;transform:rotate(90deg)"><polyline points="9 18 15 12 9 6"/></svg>
      </button>
      <div class="card" style="padding:.5rem 1.1rem">${done.map(shopRow).join('')}</div>`;
  }

  el.innerHTML = html;
}

let _shopEditId = null;
function openShopEdit(id) {
  const item = _shopItems.find(i => i.id === id);
  if (!item) return;
  _shopEditId = id;
  document.getElementById('shop-edit-name').value = item.name || '';
  document.getElementById('shop-edit-cat').value = item.category || '';
  document.getElementById('shop-edit-store').value = item.store_group || '';
  document.getElementById('shop-edit-overlay').classList.remove('hidden');
  document.getElementById('shop-edit-sheet').classList.remove('hidden');
  setTimeout(() => document.getElementById('shop-edit-sheet').classList.add('open'), 10);
}

function closeShopEdit() {
  document.getElementById('shop-edit-sheet').classList.remove('open');
  setTimeout(() => {
    document.getElementById('shop-edit-overlay').classList.add('hidden');
    document.getElementById('shop-edit-sheet').classList.add('hidden');
  }, 280);
}

async function saveShopEdit() {
  if (!_shopEditId) return;
  const name = document.getElementById('shop-edit-name').value.trim();
  const category = document.getElementById('shop-edit-cat').value || null;
  const store_group = document.getElementById('shop-edit-store').value.trim() || null;
  if (!name) { toast('El nombre no puede estar vacío'); return; }
  try {
    await api('shopping', {method:'POST', body:{action:'update', id:_shopEditId, name, category, store_group}});
    closeShopEdit();
    loadShoppingList();
  } catch(e) { toast(e.message); }
}

function guessCategory(name) {
  const n = name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'');
  const rules = [
    ['frutas',    ['limon','lemon','lima','naranja','toronja','mandarina','manzana','pera','uva','platano','mango','melon','sandia','fresa','frambuesa','zarzamora','durazno','chabacano','ciruela','kiwi','papaya','guayaba','tejocote','pitaya','pitahaya','tamarindo','guanabana','mamey','zapote','nance','fruta','granada','higo','dátil','datil','coco','maracuya','lichi','mora']],
    ['verduras',  ['tomate','jitomate','cebolla','ajo','chile','jalapeno','serrano','habanero','poblano','chipotle','cilantro','epazote','hierbabuena','lechuga','espinaca','zanahoria','papa','betabel','calabaza','chayote','nopal','aguacate','brocoli','coliflor','champiñon','hongo','apio','pepino','elote','maiz','ejote','haba','chicharo','verdura','acelga','quelite','poro','rabano','nabo','alcachofa','esparragos','esparrago','jicama','camote','yuca','pimiento','perejil','romero','tomillo','laurel','albahaca']],
    ['carnes',    ['carne','pollo','res','cerdo','puerco','bistec','milanesa','chorizo','jamon','salchicha','tocino','pavo','salmon','sardina','camaron','langosta','pulpo','calamar','pescado','costilla','molida','barbacoa','carnitas','longaniza','chicharron','machaca','cecina','birria','tripa','menudo','cabeza','buche','cuete','filete','lomo','chuleta','pierna','muslo','alita','pechuga','higado','rinon','mortadela','peperoni','pepperoni','atun','cangrejo']],
    ['lacteos',   ['leche','yogur','yoghurt','queso','crema','mantequilla','margarina','jocoque','nata','cajeta','requesón','requeson','lacteo','manchego','oaxaca','panela','cotija','chihuahua','gouda','mozzarella','amarillo','blanco','fresco','doble crema','media crema','evaporada','condensada','búfala','bufala']],
    ['huevo',     ['huevo','huevos']],
    ['pan',       ['pan','tortilla','bolillo','baguette','pita','galleta','cereal','avena','granola','palomita','tostada','waffle','hotcake','pasta','fideo','spaghetti','espagueti','macarron','lasaña','lasagna','penne','rigatoni','couscous','quinoa','amaranto','integral','salvado','centeno','maíz','maiz tostado','crutones','pan molido','breadcrumbs','croissant','dona','cuernito','conchas','telera','chapata']],
    ['abarrotes', ['aceite','sal','azucar','harina','arroz','frijol','lenteja','garbanzo','sopa','caldo','consomé','consome','salsa','ketchup','mayonesa','mostaza','vinagre','pimienta','oregano','comino','canela','vainilla','polvo','bicarbonato','cafe','te','chocolate','cocoa','miel','mermelada','atole','agua','refresco','jugo','cerveza','vino','tequila','mezcal','ron','whisky','vodka','refresco','soda','lata','conserva','enlatado','atun lata','sardina lata','alubia','pepita','cacahuate','nuez','almendra','pistache','chía','chia','linaza','maple','agave','stevia','splenda','endulzante','catsup','aderezo','ranch','buffalo','sriracha','mole','adobo','recado','sazon','maggi','knorr','maizena','fecula','gelatina','jello','flan','pudín','pudin','merengue','chantilly']],
    ['limpieza',  ['jabon','detergente','cloro','suavitel','suavizante','ariel','fabuloso','pinol','ajax','lysol','escoba','trapeador','esponja','servilleta','papel','pañal','panal','toalla','kleenex','sanitario','shampoo','acondicionador','desodorante','dental','enjuague','cepillo','rasuradora','rastrillo','afeitadora','perfume','colonia','talco','crema corporal','bloqueador','protector','tampón','tampon','toalla femenina','pañuelo','ziploc','bolsa basura','bolsa plastico','film','aluminio','windex','pledge','mr clean','comet']],
  ];
  for (const [cat, words] of rules) {
    if (words.some(w => n.includes(w))) return cat;
  }
  return null;
}

async function resolveCategory(name) {
  const local = guessCategory(name);
  if (local) return local;
  try {
    const d = await api('categorize',{method:'POST',body:{name}});
    return d.category || 'otros';
  } catch(e) { return 'otros'; }
}

async function toggleShop(id, done) {
  try {
    await api('shopping',{method:'POST',body:{action:'toggle',id,done}});
    // If done, update pantry (item bought)
    if (done) {
      const {items} = await api('shopping');
      const item = items.find(i=>i.id===id);
      if (item) {
        const category = item.category && item.category!=='otros' ? item.category : await resolveCategory(item.name);
        await api('pantry',{method:'POST',body:{action:'add',name:item.name,level:'lleno',category}});
      }
    }
    loadMandado();
  } catch(e) { toast(e.message); }
}

async function delShop(id) {
  try {
    await api('shopping',{method:'POST',body:{action:'delete',id}});
    loadShoppingList();
  } catch(e) { toast(e.message); }
}

async function addShopManual() {
  if (USER.guest) { toast('Crea una cuenta en Ajustes para usar la lista'); return; }
  const inp = document.getElementById('shop-input');
  const v = inp.value.trim();
  if (!v) return;
  inp.value = '';
  try {
    const category = await resolveCategory(v);
    await api('shopping',{method:'POST',body:{action:'add',name:v,category,source:'user'}});
    loadShoppingList();
  } catch(e) { toast(e.message); }
}

async function loadPantry() {
  try {
    const res = await apiAuth('pantry');
    if (!res) { renderPantry([]); return; }
    renderPantry(res.items);
  } catch(e) { console.error(e); }
}

function renderPantry(items) {
  const el = document.getElementById('pantry-list');
  if (!items.length) {
    el.innerHTML = '<div class="empty"><h3>Despensa vacía</h3><p>Escanea un ticket o dile a Casita qué compraste</p></div>';
    return;
  }
  const groups = pantryGroupBy==='status' ? groupPantryByStatus(items) : groupPantryByCategory(items);
  let html='';
  for (const group of groups) {
    if (!group.items.length) continue;
    html += `<div style="margin-bottom:.75rem">
      <div style="font-family:var(--serif);font-style:italic;font-size:.8rem;color:var(--ink3);padding:.5rem 0 .25rem">${group.label}</div>
      <div class="card pantry-card" style="padding:.25rem 1.1rem">
        ${group.items.map(renderPantryRow).join('')}
      </div>
    </div>`;
  }
  el.innerHTML = html;
}

function groupPantryByCategory(items) {
  const bycat = {};
  for (const it of items) {
    const c = it.category||'otros';
    if (!bycat[c]) bycat[c]=[];
    bycat[c].push(it);
  }
  return Object.entries(PANTRY_CATEGORIES).map(([key,label])=>({label,items:bycat[key]||[]}));
}

function groupPantryByStatus(items) {
  const bylevel = {};
  for (const it of items) {
    const level = PANTRY_LEVELS.includes(it.level) ? it.level : 'suficiente';
    if (!bylevel[level]) bylevel[level]=[];
    bylevel[level].push(it);
  }
  return PANTRY_LEVELS.map(level=>({label:PANTRY_LEVEL_META[level].label,items:bylevel[level]||[]}));
}

function renderPantryRow(it) {
  const meta = PANTRY_LEVEL_META[it.level] || PANTRY_LEVEL_META.suficiente;
  return `
    <div class="row pantry-row" id="pantry-${it.id}">
      <div class="dot ${meta.dot}"></div>
      <span class="row-text" title="Mantén presionado para editar" ondblclick="startEditPantryName(${it.id},this)" ontouchstart="pantryLongPress(${it.id},this,event)" ontouchend="pantryLongPressCancel()" ontouchmove="pantryLongPressCancel()">${esc(it.name)}</span>
      <select class="level-select ${meta.select}" onchange="updatePantryLevel(${it.id},this.value)">
        ${PANTRY_LEVELS.map(level=>`<option value="${level}" ${it.level===level?'selected':''}>${level}</option>`).join('')}
      </select>
      <button class="del-btn" onclick="deletePantry(${it.id})" aria-label="Eliminar ${esc(it.name)}">×</button>
    </div>`;
}

let _pantryLongPressTimer = null;
function pantryLongPress(id, span, e) {
  e.preventDefault();
  _pantryLongPressTimer = setTimeout(() => { startEditPantryName(id, span); }, 600);
}
function pantryLongPressCancel() {
  clearTimeout(_pantryLongPressTimer);
}

function startEditPantryName(id, span) {
  const current = span.textContent;
  const inp = document.createElement('input');
  inp.className = 'pantry-name-edit';
  inp.value = current;
  span.replaceWith(inp);
  inp.focus();
  inp.select();
  const finish = async () => {
    const newName = inp.value.trim();
    if (newName && newName !== current) {
      try {
        await api('pantry', {method:'POST', body:{action:'update', id, name:newName}});
        await loadPantry();
        return;
      } catch(e) { toast(e.message); }
    }
    inp.replaceWith(span);
  };
  inp.addEventListener('blur', finish);
  inp.addEventListener('keydown', e => {
    if (e.key === 'Enter') { inp.blur(); }
    if (e.key === 'Escape') { inp.removeEventListener('blur', finish); inp.replaceWith(span); }
  });
}

function setPantryGroup(group, btn) {
  pantryGroupBy = group==='status' ? 'status' : 'category';
  document.querySelectorAll('.pantry-group-seg .seg-btn').forEach(b=>b.classList.remove('on'));
  btn?.classList.add('on');
  loadPantry();
}

async function updatePantryLevel(id, level) {
  try {
    await api('pantry',{method:'POST',body:{action:'update',id,level}});
    await Promise.all([loadPantry(), loadShoppingList()]);
  } catch(e) { toast(e.message); }
}

async function deletePantry(id) {
  try {
    await api('pantry',{method:'POST',body:{action:'delete',id}});
    loadPantry();
  } catch(e) { toast(e.message); }
}

async function addPantryManual() {
  if (USER.guest) { toast('Crea una cuenta en Ajustes para usar la despensa'); return; }
  const inp = document.getElementById('pantry-input');
  const name = inp.value.trim();
  if (!name) return;
  const category = document.getElementById('pantry-cat').value;
  const level = document.getElementById('pantry-level').value;
  inp.value = '';
  try {
    await api('pantry',{method:'POST',body:{action:'add',name,category,level}});
    loadPantry();
    toast('Agregado a despensa ✓');
  } catch(e) { toast(e.message); }
}

// ── RECETAS ──────────────────────────────────────────────────
function saveRecipesLocal() {
  try { localStorage.setItem('casita_recipes', JSON.stringify(currentRecipes)); } catch(e) {}
}

function loadRecipesLocal() {
  try { return JSON.parse(localStorage.getItem('casita_recipes') || 'null'); } catch(e) { return null; }
}

async function loadRecipes(next=false) {
  if (next) recipeOffset += 1; else recipeOffset = 0;
  const el = document.getElementById('recipes-container');
  el.innerHTML = '<div class="empty"><div class="spinner" style="margin:0 auto"></div></div>';
  try {
    const pantryRes = USER.guest ? null : await api('pantry').catch(()=>null);
    const pantry = pantryRes?.items || [];
    if (!pantry.some(p => p.level !== 'agotado')) {
      currentRecipes = [];
      renderRecipes(currentRecipes, 'empty_pantry');
      loadSavedRecipes();
      return;
    }
    const d = await api('recipes',{method:'POST',body:{pantry,offset:recipeOffset,household_size:USER.household_size||4}});
    currentRecipes = d.recipes || [];
    saveRecipesLocal();
    await loadSavedRecipes();
    renderRecipes(currentRecipes, d.reason);
  } catch(e) {
    el.innerHTML = `<div class="empty"><h3>No pude generar recetas</h3><p>${esc(e.message)}</p></div>`;
    loadSavedRecipes();
  }
}

function renderRecipes(recipes, reason=null) {
  const el = document.getElementById('recipes-container');
  if (!recipes.length) {
    const msg = 'Agrega ingredientes a tu despensa para ver recetas';
    el.innerHTML = `<div class="empty"><h3>Sin sugerencias</h3><p>${msg}</p></div>`;
    return;
  }
  const mealLabels = {desayuno:'desayuno',comida:'comida',cena:'cena'};
  el.innerHTML = recipes.map((r,i)=>{
    const name = r.name || r.nombre || 'Receta';
    const time = r.time || r.tiempo || '30 min';
    const servings = r.servings || r.porciones || 4;
    const available = r.available ?? r.disponible;
    const desc = r.description || r.tip || '';
    const saved = getSavedItemForRecipe(r);
    return `
    <div class="recipe-card" data-idx="${i}" onclick="openRecipe(${i})">
      <button class="recipe-save ${saved?'saved':''}" onclick="toggleSaveRecipe(${i},event)" aria-label="${saved?'Quitar de guardadas':'Guardar receta'}">
        <svg viewBox="0 0 24 24" fill="${saved?'currentColor':'none'}" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
      </button>
      <div class="recipe-body">
        <div class="recipe-meal-label">${mealLabels[r.meal_type]||'receta'}</div>
        <div class="recipe-name">${esc(name)}</div>
        <div class="recipe-meta">
          <span>⏱ ${esc(time)}</span>
          <span>👥 ${esc(servings)} porciones</span>
          <span style="color:${available?'var(--g)':'var(--y)'}">
            ${available?'✓ tienes todo':'⚠ falta algo'}
          </span>
        </div>
        ${desc?`<div class="recipe-desc">${esc(desc)}</div>`:''}
      </div>
    </div>`;
  }).join('');
  attachSwipeToCards();
}

function recipeName(r={}) {
  return r.name || r.nombre || r.title || 'Receta';
}

function recipeNameKey(r={}) {
  return recipeName(r).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
}

function getSavedItemForRecipe(recipe) {
  const key = recipeNameKey(recipe);
  return savedRecipes.find(item => recipeNameKey(item.recipe || item) === key);
}

async function loadSavedRecipes(render=true) {
  const el = document.getElementById('saved-recipes-container');
  if (!el) return;
  if (USER.guest) {
    savedRecipes = [];
    if (render) renderSavedRecipes();
    return;
  }
  try {
    const res = await apiAuth('saved-recipes');
    savedRecipes = res?.items || [];
  } catch(e) {
    savedRecipes = [];
  }
  if (render) renderSavedRecipes();
}

function renderSavedRecipes() {
  const el = document.getElementById('saved-recipes-container');
  if (!el) return;
  if (!savedRecipes.length) {
    el.innerHTML = '<div class="empty"><p>Guarda recetas con la estrella para verlas aquí</p></div>';
    return;
  }
  el.innerHTML = savedRecipes.map((item,i)=>{
    const r = item.recipe || {};
    const name = recipeName(r);
    const time = r.time || r.tiempo || '30 min';
    const servings = r.servings || r.porciones || 4;
    return `
      <div class="saved-recipe-row" onclick="openSavedRecipe(${i})">
        <div style="flex:1;min-width:0">
          <div class="saved-recipe-name">${esc(name)}</div>
          <div class="row-sub">${esc(time)} · ${esc(servings)} porciones</div>
        </div>
        <button class="recipe-save saved small" onclick="deleteSavedRecipe(${item.id},event)" aria-label="Quitar receta guardada">
          <svg viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
        </button>
      </div>`;
  }).join('');
}

async function toggleSaveRecipe(idx, ev) {
  ev?.stopPropagation();
  const recipe = currentRecipes[idx];
  if (!recipe) return;
  if (USER.guest) {
    toast('Crea una cuenta para guardar recetas');
    return;
  }
  const saved = getSavedItemForRecipe(recipe);
  try {
    if (saved) {
      await api('saved-recipes',{method:'POST',body:{action:'delete',id:saved.id}});
      toast('Quitada de guardadas');
    } else {
      await api('saved-recipes',{method:'POST',body:{action:'save',recipe}});
      toast('Receta guardada ✓');
    }
    await loadSavedRecipes();
    renderRecipes(currentRecipes);
  } catch(e) { toast(e.message); }
}

async function deleteSavedRecipe(id, ev) {
  ev?.stopPropagation();
  try {
    await api('saved-recipes',{method:'POST',body:{action:'delete',id}});
    await loadSavedRecipes();
    renderRecipes(currentRecipes);
  } catch(e) { toast(e.message); }
}

function openSavedRecipe(idx) {
  const item = savedRecipes[idx];
  if (!item?.recipe) return;
  showRecipeModal(item.recipe);
}

function attachSwipeToCards() {
  document.querySelectorAll('#recipes-container .recipe-card').forEach(card => {
    let startX = 0, startY = 0, dragging = false;
    card.addEventListener('touchstart', e => {
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
      dragging = true;
    }, {passive:true});
    card.addEventListener('touchmove', e => {
      if (!dragging) return;
      const dx = e.touches[0].clientX - startX;
      const dy = e.touches[0].clientY - startY;
      if (Math.abs(dx) > Math.abs(dy) && dx > 0) {
        card.style.transform = `translateX(${Math.min(dx, 200)}px)`;
        card.style.opacity = Math.max(0, 1 - dx / 200);
      }
    }, {passive:true});
    card.addEventListener('touchend', e => {
      dragging = false;
      const dx = e.changedTouches[0].clientX - startX;
      if (dx > 80) {
        card.style.transition = 'transform .25s ease, opacity .25s ease';
        card.style.transform = 'translateX(110%)';
        card.style.opacity = '0';
        const idx = parseInt(card.dataset.idx);
        setTimeout(() => swipeReplaceRecipe(idx), 280);
      } else {
        card.style.transition = 'transform .2s ease, opacity .2s ease';
        card.style.transform = '';
        card.style.opacity = '';
        setTimeout(() => { card.style.transition = ''; }, 220);
      }
    }, {passive:true});
  });
}

async function swipeReplaceRecipe(idx) {
  if (!currentRecipes[idx]) return;
  const card = document.querySelector(`#recipes-container .recipe-card[data-idx="${idx}"]`);
  if (card) {
    card.style.transition = '';
    card.innerHTML = '<div class="recipe-body" style="min-height:80px;display:flex;align-items:center;justify-content:center"><div class="spinner"></div></div>';
    card.style.transform = '';
    card.style.opacity = '1';
  }
  try {
    const pantryRes = USER.guest ? null : await api('pantry').catch(()=>null);
    const pantry = pantryRes?.items || [];
    const swipeOffset = recipeOffset + 10 + idx + Date.now() % 1000;
    const d = await api('recipes',{method:'POST',body:{pantry,offset:swipeOffset,household_size:USER.household_size||4}});
    const newRecipes = d.recipes || [];
    const currentNames = new Set(currentRecipes.map(r => recipeNameKey(r)));
    const match = newRecipes.find(r => !currentNames.has(recipeNameKey(r))) || newRecipes[0];
    if (match) {
      currentRecipes[idx] = match;
      saveRecipesLocal();
      renderRecipes(currentRecipes);
    }
  } catch(e) {
    renderRecipes(currentRecipes);
  }
}

function openRecipe(idx) {
  const r = currentRecipes[idx];
  if (!r) return;
  showRecipeModal(r);
}

function showRecipeModal(r) {
  const mealLabels = {desayuno:'desayuno',comida:'comida',cena:'cena'};
  const name = r.name || r.nombre || 'Receta';
  const time = r.time || r.tiempo || '30 min';
  const servings = r.servings || r.porciones || 4;
  const cuisine = r.cuisine || r.cocina || 'receta';
  document.getElementById('rm-name').textContent = name;
  document.getElementById('rm-meta').textContent = `${mealLabels[r.meal_type]||'receta'} · ${time} · ${servings} porciones · ${cuisine}`;

  // Ingredients
  const ingEl = document.getElementById('rm-ingredients');
  ingEl.innerHTML = (r.ingredients||r.ingredientes||[]).map(ing=>`
    <div class="ingredient-row">
      <span class="ing-name">${esc(ing.name || ing.nombre)}</span>
      <span class="row-sub">${esc(ing.amount || ing.cantidad || '')}</span>
      <span class="ing-status ${ing.status==='ok'?'ing-ok':ing.status==='low'?'ing-low':'ing-missing'}">
        ${ing.status==='ok'?'tienes':ing.status==='low'?'poco':'falta'}
      </span>
    </div>`).join('');

  // Steps
  const stepsEl = document.getElementById('rm-steps');
  const steps = r.steps || r.pasos || [];
  const tip = r.tip ? `<div class="recipe-tip">${esc(r.tip)}</div>` : '';
  stepsEl.innerHTML = steps.map((s,i)=>`
    <div class="step-row">
      <div class="step-num">${i+1}</div>
      <div class="step-text">${esc(s)}</div>
    </div>`).join('') + tip;

  document.getElementById('recipe-modal').classList.remove('hidden');
}

function closeRecipeModal(e) {
  if (e.target===document.getElementById('recipe-modal')) {
    document.getElementById('recipe-modal').classList.add('hidden');
  }
}

async function loadMealsHistory() {
  try {
    const res = await apiAuth('meals');
    if (!res) {
      document.getElementById('meals-history').innerHTML = '<div class="empty"><p>Crea una cuenta para ver tu historial</p></div>';
      return;
    }
    const {items} = res;
    const el = document.getElementById('meals-history');
    if (!items.length) {
      el.innerHTML = '<div class="empty"><p>Cuéntale a Casita qué has cocinado esta semana</p></div>';
      return;
    }
    el.innerHTML = items.map(m=>`
      <div class="row">
        <div style="flex:1">
          <div class="row-text">${esc(m.dish_name)}</div>
          <div class="row-sub">${fmtDate(m.cooked_at?.split('T')[0])} · para ${m.servings||'?'} personas</div>
        </div>
        <button class="del-btn" onclick="deleteMeal(${m.id})" aria-label="Borrar del historial">×</button>
      </div>`).join('') + `
      <button class="btn-ghost" onclick="clearMealsHistory()" style="width:100%;margin-top:.75rem">borrar historial</button>`;
  } catch(e) { console.error(e); }
}

async function deleteMeal(id) {
  try {
    await api('meals',{method:'POST',body:{action:'delete',id}});
    loadMealsHistory();
  } catch(e) { toast(e.message); }
}

async function clearMealsHistory() {
  if (!confirm('¿Borrar todo el historial de recetas hechas?')) return;
  try {
    await api('meals',{method:'POST',body:{action:'clear'}});
    loadMealsHistory();
    toast('Historial borrado');
  } catch(e) { toast(e.message); }
}

// ── PROYECTOS ────────────────────────────────────────────────
async function loadProjects() {
  document.getElementById('proj-list-view').classList.remove('hidden');
  document.getElementById('proj-detail-view').classList.add('hidden');
  try {
    const res = await apiAuth('projects');
    if (!res) { renderProjects([]); return; }
    renderProjects(res.items);
  } catch(e) { console.error(e); }
}

function renderProjects(items) {
  const el = document.getElementById('projects-list');
  if (!items.length) {
    el.innerHTML = '<div class="empty"><h3>Sin proyectos</h3><p>Dile a Casita "quiero organizar una fiesta" o "empecé un negocio"</p></div>';
    el.style.padding = '';
    return;
  }
  el.style.padding = '0';
  el.innerHTML = items.map(p=>{
    const isCheck = p.type==='checklist';
    const meta = isCheck ? checkMeta(p.data) : moneyMeta(p.data);
    const pct  = isCheck ? checkPct(p.data)  : moneyPct(p.data);
    return `
    <div class="proj-card" onclick="openProject(${p.id})">
      <div class="proj-icon ${isCheck?'proj-icon-check':'proj-icon-money'}">${isCheck?'✓':'$'}</div>
      <div style="flex:1;min-width:0">
        <div class="proj-name">${esc(p.title)}</div>
        <div class="proj-meta">${meta}</div>
        <div class="pbar" style="margin-top:.5rem"><div class="pbar-fill ${isCheck?'':'pbar-fill-y'}" style="width:${pct}%"></div></div>
      </div>
      <div class="proj-pct">${pct}%</div>
    </div>`;
  }).join('');
}

function checkMeta(d) { const t=(d.items||[]).length,c=Object.values(d.checked||{}).filter(v=>v).length;return `${c}/${t} tareas`; }
function checkPct(d)  { const t=(d.items||[]).length;if(!t)return 0;return Math.round(Object.values(d.checked||{}).filter(v=>v).length/t*100); }
function moneyMeta(d) { const p=(d.abonos||[]).reduce((s,a)=>s+(a.monto||0),0);return `$${p.toFixed(0)} de $${(d.meta_total||0).toFixed(0)}`; }
function moneyPct(d)  { if(!d.meta_total)return 0;return Math.min(100,Math.round((d.abonos||[]).reduce((s,a)=>s+(a.monto||0),0)/d.meta_total*100)); }

let currentProjectId = null;
async function openProject(id) {
  currentProjectId = id;
  const {items} = await api('projects');
  const p = items.find(x=>x.id===id);
  if (!p) return;
  document.getElementById('proj-list-view').classList.add('hidden');
  document.getElementById('proj-detail-view').classList.remove('hidden');
  renderProjectDetail(p);
}

function renderProjectDetail(p) {
  const el = document.getElementById('proj-detail-view');
  const isCheck = p.type==='checklist';
  const pct = isCheck ? checkPct(p.data) : moneyPct(p.data);

  if (isCheck) {
    const items = p.data.items||[];
    const checked = p.data.checked||{};
    el.innerHTML = `
      <button class="back-btn" onclick="loadProjects()">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="15 18 9 12 15 6"/></svg>
        proyectos
      </button>
      <div>
        <h2 style="font-family:var(--serif);font-size:1.5rem;font-weight:500;margin-bottom:.25rem">${esc(p.title)}</h2>
        <div style="display:flex;justify-content:space-between;font-size:.8rem;color:var(--ink2);margin:.5rem 0 .375rem">
          <span>${checkMeta(p.data)}</span><span style="color:var(--g);font-weight:600">${pct}%</span>
        </div>
        <div class="pbar"><div class="pbar-fill" style="width:${pct}%"></div></div>
      </div>
      <div class="slabel">tareas</div>
      <div class="card" style="padding:.25rem 1.1rem">
        ${items.map((it,i)=>`
          <div class="row">
            <div class="chk chk-sq ${checked[i]?'done':''}" onclick="toggleCheckItem(${p.id},${i})"></div>
            <span class="row-text ${checked[i]?'done':''}">${esc(it)}</span>
          </div>`).join('')}
      </div>
      <div class="input-row" style="border-top:none;margin-top:.25rem">
        <input id="new-check-item" class="ibox" placeholder="agregar tarea..." onkeydown="if(event.key==='Enter')addCheckItem(${p.id})">
        <button class="icon-btn" onclick="addCheckItem(${p.id})">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        </button>
      </div>
      <button class="btn-ghost" onclick="archiveProject(${p.id})">archivar proyecto</button>`;
  } else {
    const abonos = p.data.abonos||[];
    const meta = p.data.meta_total||0;
    const pagado = abonos.reduce((s,a)=>s+(a.monto||0),0);
    el.innerHTML = `
      <button class="back-btn" onclick="loadProjects()">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="15 18 9 12 15 6"/></svg>
        proyectos
      </button>
      <h2 style="font-family:var(--serif);font-size:1.5rem;font-weight:500">${esc(p.title)}</h2>
      <div class="stat3">
        <div class="stat-box"><div class="stat-v" style="color:var(--r)">$${(meta-pagado).toFixed(0)}</div><div class="stat-l">falta</div></div>
        <div class="stat-box"><div class="stat-v" style="color:var(--g)">$${pagado.toFixed(0)}</div><div class="stat-l">pagado</div></div>
        <div class="stat-box"><div class="stat-v">${abonos.length}</div><div class="stat-l">abonos</div></div>
      </div>
      <div class="pbar"><div class="pbar-fill pbar-fill-y" style="width:${pct}%"></div></div>
      <div style="text-align:right;font-size:.7rem;color:var(--ink3)">${pct}% de $${meta.toFixed(0)}</div>
      <div class="slabel">registrar abono</div>
      <div class="card" style="padding:.75rem 1.1rem">
        <div style="display:grid;grid-template-columns:85px 1fr 42px;gap:.5rem;align-items:center">
          <input id="ab-monto" class="ibox" type="number" placeholder="$0" style="text-align:center;border-radius:10px;padding:.6rem .75rem">
          <input id="ab-desc"  class="ibox" placeholder="descripción" style="border-radius:10px;padding:.6rem .75rem">
          <button class="icon-btn" onclick="addAbono(${p.id})">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          </button>
        </div>
      </div>
      ${abonos.length ? `
        <div class="slabel">historial</div>
        <div class="card" style="padding:.25rem 1.1rem">
          ${[...abonos].reverse().map(a=>`
            <div class="abono-row">
              <span class="ab-date">${fmtDate(a.fecha)}</span>
              <span class="ab-desc">${esc(a.descripcion||'Abono')}</span>
              <span class="ab-amt">+$${(a.monto||0).toFixed(0)}</span>
            </div>`).join('')}
        </div>` : ''}
      <button class="btn-ghost" onclick="archiveProject(${p.id})">archivar proyecto</button>`;
  }
}

async function toggleCheckItem(id, idx) {
  try {
    await api('projects',{method:'POST',body:{action:'toggle_checklist_item',id,item_index:idx}});
    openProject(id);
  } catch(e) { toast(e.message); }
}

async function addCheckItem(id) {
  const inp = document.getElementById('new-check-item');
  const v = inp.value.trim();
  if (!v) return;
  inp.value='';
  try {
    await api('projects',{method:'POST',body:{action:'add_checklist_item',id,item_text:v}});
    openProject(id);
  } catch(e) { toast(e.message); }
}

async function addAbono(id) {
  const amt  = parseFloat(document.getElementById('ab-monto').value);
  const desc = document.getElementById('ab-desc').value.trim();
  if (!amt||amt<=0) { toast('Pon un monto válido'); return; }
  try {
    await api('projects',{method:'POST',body:{action:'add_abono',id,abono_amount:amt,abono_desc:desc}});
    document.getElementById('ab-monto').value='';
    document.getElementById('ab-desc').value='';
    openProject(id);
    toast('Abono registrado ✓');
  } catch(e) { toast(e.message); }
}

async function archiveProject(id) {
  if (!confirm('¿Archivar este proyecto?')) return;
  try {
    await api('projects',{method:'POST',body:{action:'archive',id}});
    loadProjects();
  } catch(e) { toast(e.message); }
}

// ── CHAT ─────────────────────────────────────────────────────
async function sendMsg() {
  if (USER.guest) {
    toast('Crea una cuenta en Ajustes para chatear con Casita');
    return;
  }
  const inp  = document.getElementById('chat-input');
  const text = inp.value.trim();
  if (!text) return;
  inp.value = '';
  document.getElementById('send-btn').disabled = true;
  addBubble('user', text);

  // Typing indicator
  const tid = 'typing-'+Date.now();
  addBubble('ai', 'Casita está pensando...', tid, true);

  try {
    const d = await api('chat',{method:'POST',body:{message:text, history:chatHistory.slice(-8)}});
    document.getElementById(tid)?.remove();
    chatHistory.push({role:'user',content:text});
    chatHistory.push({role:'assistant',content:d.reply});
    addBubble('ai', d.reply||'...');
    // Refresh current tab data silently
    refreshCurrentTab();
  } catch(e) {
    document.getElementById(tid)?.remove();
    addBubble('ai','⚠ '+e.message);
  }
  document.getElementById('send-btn').disabled = false;
}

function addBubble(role, text, id='', isTyping=false) {
  const msgs = document.getElementById('chat-msgs');
  const div  = document.createElement('div');
  div.className = `bubble bubble-${role}${isTyping?' bubble-typing':''}`;
  div.textContent = text;
  if (id) div.id = id;
  msgs.appendChild(div);
  msgs.scrollTop = msgs.scrollHeight;
}

function refreshCurrentTab() {
  const active = document.querySelector('.nav-btn.on')?.dataset.t;
  if (active==='inicio')     loadInicio();
  if (active==='pendientes') loadTasks();
  if (active==='mandado')    loadMandado();
  if (active==='recetas')    {} // don't auto-reload, user controls
  if (active==='proyectos')  loadProjects();
}

// ── VOICE ────────────────────────────────────────────────────
function setupVoice() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) return;
  voiceRecognition = new SR();
  voiceRecognition.lang = 'es-MX';
  voiceRecognition.continuous = false;
  voiceRecognition.interimResults = true;
  voiceRecognition.onstart = () => {
    isListening = true;
    setVoiceButtons(true);
    clearVoiceSilenceTimer();
    voiceSilenceTimer = setTimeout(()=>{
      if (!isListening) return;
      toast('No escuché nada. Revisa permiso de micrófono.');
      stopVoice(true);
    }, 12000);
  };
  voiceRecognition.onaudiostart = () => {
    isListening = true;
    setVoiceButtons(true);
  };
  voiceRecognition.onspeechstart = clearVoiceSilenceTimer;
  voiceRecognition.onresult = e => {
    clearVoiceSilenceTimer();
    let finalText = '';
    let interimText = '';
    for (let i=e.resultIndex; i<e.results.length; i++) {
      const text = e.results[i][0].transcript;
      if (e.results[i].isFinal) finalText += text;
      else interimText += text;
    }
    const inp = document.getElementById('chat-input');
    if (interimText) inp.value = interimText.trim();
    if (finalText.trim()) {
      inp.value = finalText.trim();
      sendMsg();
    }
  };
  voiceRecognition.onerror = e => {
    clearVoiceSilenceTimer();
    stopVoice(false);
    if (voiceStopRequested || e.error==='aborted') return;
    toast(voiceErrorMessage(e.error));
  };
  voiceRecognition.onend = () => stopVoice(false);
  voiceRecognition.onnomatch = () => {
    clearVoiceSilenceTimer();
    toast('No entendí eso. Intenta hablar un poco más cerca.');
  };
}

function toggleVoice() {
  if (!voiceRecognition) { toast('Tu navegador no soporta voz'); return; }
  if (isListening) {
    stopVoice(true);
  } else {
    startVoice();
  }
}

function openChatAndListen() {
  goTab('chat', {focus:false});
  startVoice();
}

function startVoice() {
  if (!voiceRecognition) { toast('Tu navegador no soporta voz'); return; }
  if (isListening) {
    setVoiceButtons(true);
    return;
  }
  try {
    voiceStopRequested = false;
    voiceRecognition.start();
    isListening = true;
    setVoiceButtons(true);
  } catch(e) { toast('No pude iniciar el micrófono'); }
}

function stopVoice(forceAbort=false) {
  clearVoiceSilenceTimer();
  if (forceAbort && voiceRecognition) {
    voiceStopRequested = true;
    try { voiceRecognition.abort(); } catch {}
  }
  isListening = false;
  setVoiceButtons(false);
}

function clearVoiceSilenceTimer() {
  if (voiceSilenceTimer) clearTimeout(voiceSilenceTimer);
  voiceSilenceTimer = null;
}

function voiceErrorMessage(error) {
  const msgs = {
    'not-allowed':'Permite el micrófono en Chrome para usar la voz.',
    'service-not-allowed':'Chrome bloqueó el servicio de voz. Revisa permisos del sitio.',
    'audio-capture':'No encontré micrófono disponible.',
    'network':'No pude conectar el reconocimiento de voz.',
    'no-speech':'No escuché nada. Intenta de nuevo.',
    'language-not-supported':'Tu navegador no soporta voz en español.',
    'bad-grammar':'No pude interpretar el audio.'
  };
  return msgs[error] || `Error de voz: ${error}`;
}

function setVoiceButtons(listening) {
  ['chat-mic-btn','big-mic-btn','fab'].forEach(id=>{
    document.getElementById(id)?.classList.toggle('listening', listening);
  });
}

// ── RECEIPT SCAN ─────────────────────────────────────────────
async function scanReceipt(event) {
  const file = event.target.files[0];
  if (!file) return;
  document.getElementById('scan-initial').classList.add('hidden');
  document.getElementById('scan-prog').classList.remove('hidden');
  document.getElementById('scan-result').classList.add('hidden');
  try {
    const image = await prepareReceiptImage(file);
    const d   = await api('scan-receipt',{method:'POST',body:{image_base64:image.base64,mime_type:image.mimeType}});
    document.getElementById('scan-prog').classList.add('hidden');
    renderScanResult(d);
  } catch(e) {
    document.getElementById('scan-prog').classList.add('hidden');
    document.getElementById('scan-initial').classList.remove('hidden');
    toast(receiptScanErrorMessage(e));
  }
}

function renderScanResult(d) {
  const p   = d.parsed||{};
  const el  = document.getElementById('scan-result');
  el.classList.remove('hidden');
  el.innerHTML = `
    <div class="card card-green">
      <div style="font-family:var(--serif);font-style:italic;font-size:1rem;color:var(--g);margin-bottom:.25rem">✓ Ticket procesado</div>
      <div style="font-size:.85rem;color:var(--ink2)">${d.items_added} productos agregados a tu despensa.</div>
    </div>
    <div class="card">
      <div class="row" style="padding:.375rem 0 .625rem">
        <span class="row-text" style="font-weight:600">${esc(p.tienda||'Tienda')}</span>
        <span style="font-weight:600;color:var(--g)">$${(p.total||0).toFixed(2)}</span>
      </div>
      ${(p.productos||[]).map(it=>`
        <div class="row">
          <span class="row-text">${esc(it.nombre||'Producto')}</span>
          <span class="row-sub">${esc(it.cantidad||'')}</span>
          <span style="font-size:.75rem;color:var(--g);min-width:48px;text-align:right">$${(it.precio||0).toFixed(2)}</span>
        </div>`).join('')}
    </div>
    <div style="display:flex;gap:.75rem">
      <button class="btn-primary" onclick="goTab('mandado');setTimeout(()=>swMandado('despensa',document.querySelectorAll('#pg-mandado .seg-btn')[1]),100)">Ver despensa</button>
      <button class="btn-ghost" onclick="resetScan()">Escanear otro</button>
    </div>`;
}

function resetScan() {
  document.getElementById('scan-initial').classList.remove('hidden');
  document.getElementById('scan-result').classList.add('hidden');
  document.getElementById('receipt-file').value='';
}

const RECEIPT_MAX_BYTES = 4.5 * 1024 * 1024;
const RECEIPT_MAX_DIMENSION = 2200;

async function prepareReceiptImage(file) {
  if (!file.type.startsWith('image/')) throw new Error('El archivo no es una imagen.');

  const compressed = await compressReceiptImage(file);
  if (compressed.size > RECEIPT_MAX_BYTES) {
    throw new Error('La foto sigue muy pesada. Intenta tomarla con menos zoom o mejor luz.');
  }

  return {
    base64: await toB64(compressed),
    mimeType: compressed.type || 'image/jpeg'
  };
}

async function compressReceiptImage(file) {
  const bitmap = await loadImageBitmap(file);
  let { width, height } = bitmap;
  let scale = Math.min(1, RECEIPT_MAX_DIMENSION / Math.max(width, height));
  let quality = 0.82;
  let blob = file;

  for (let i = 0; i < 10; i++) {
    blob = await renderImageBlob(bitmap, Math.round(width * scale), Math.round(height * scale), quality);
    if (blob.size <= RECEIPT_MAX_BYTES) break;

    if (quality > 0.58) {
      quality -= 0.08;
    } else {
      scale *= 0.85;
      quality = 0.74;
    }
  }

  bitmap.close?.();
  return blob;
}

function loadImageBitmap(file) {
  if ('createImageBitmap' in window) return createImageBitmap(file, { imageOrientation: 'from-image' });

  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = () => rej(new Error('No pude abrir la foto. Intenta tomarla de nuevo.'));
    img.src = URL.createObjectURL(file);
  });
}

function renderImageBlob(image, width, height, quality) {
  return new Promise((res, rej) => {
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, width);
    canvas.height = Math.max(1, height);
    const ctx = canvas.getContext('2d');
    if (!ctx) return rej(new Error('No pude preparar la foto.'));
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    canvas.toBlob(blob => {
      if (!blob) return rej(new Error('No pude comprimir la foto.'));
      res(blob);
    }, 'image/jpeg', quality);
  });
}

function receiptScanErrorMessage(error) {
  const msg = String(error?.message || '');
  if (/exceeds 5 MB maximum|imagen demasiado grande|foto.*pesada|image exceeds/i.test(msg)) {
    return 'La foto está demasiado pesada. Casita la reduce automáticamente; si vuelve a pasar, toma el ticket un poco más lejos y con buena luz.';
  }
  if (/No se pudo leer el ticket/i.test(msg)) return msg;
  if (/No autenticado/i.test(msg)) return 'Inicia sesión para escanear tickets.';
  return 'No pude leer el ticket. Intenta tomar la foto de nuevo.';
}

function toB64(file) {
  return new Promise((res,rej)=>{
    const r=new FileReader();
    r.onload=()=>res(r.result.split(',')[1]);
    r.onerror=rej;
    r.readAsDataURL(file);
  });
}

// ── SETTINGS ─────────────────────────────────────────────────
function loadSettings() {
  document.getElementById('s-name').value = USER.casita_name || '';
  document.getElementById('s-household').value = USER.household_size || 4;
  document.getElementById('s-city').value = USER.city || 'CDMX';
  syncThemePicker();
  loadMemory();
  renderAccountSection();
  document.getElementById('app-version').textContent = `Casita ${APP_VERSION}`;
}

function setTheme(theme) {
  applyTheme(theme, true);
  toast(`Tema ${THEMES[theme]?.label || THEMES.cocina.label} aplicado ✓`);
}

function applyTheme(theme, save=false) {
  if (theme === 'classic') theme = 'cocina';
  if (!THEMES[theme]) theme = 'cocina';
  document.documentElement.dataset.theme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEMES[theme].color);
  if (save) S.s('theme', theme);
  syncThemePicker(theme);
}

function syncThemePicker(theme=S.g('theme','cocina')) {
  if (theme === 'classic') theme = 'cocina';
  if (!THEMES[theme]) theme = 'cocina';
  document.querySelectorAll('[data-theme-choice]').forEach(btn=>{
    btn.classList.toggle('on', btn.dataset.themeChoice===theme);
  });
}

async function loadMemory() {
  const el = document.getElementById('memory-list');
  if (!el) return;
  if (USER.guest) {
    el.innerHTML = '<div class="empty" style="padding:1.25rem 0"><p>Crea una cuenta para que Casita recuerde tus preferencias</p></div>';
    return;
  }
  try {
    const res = await apiAuth('memory');
    renderMemory(res?.items||[]);
  } catch(e) {
    el.innerHTML = `<div class="empty" style="padding:1.25rem 0"><p>${esc(e.message)}</p></div>`;
  }
}

function renderMemory(items) {
  const el = document.getElementById('memory-list');
  if (!items.length) {
    el.innerHTML = '<div class="empty" style="padding:1.25rem 0"><p>Cuando le cuentes gustos, palabras o rutinas, Casita podrá recordarlas aquí</p></div>';
    return;
  }
  el.innerHTML = items.map(m=>`
    <div class="row">
      <div style="flex:1;min-width:0">
        <div class="memory-type">${esc(memoryTypeLabel(m.type))} · ${esc(m.key)}</div>
        <div class="memory-value">${esc(m.value)}</div>
      </div>
      <button class="del-btn" onclick="deleteMemory(${m.id})" aria-label="Borrar recuerdo">×</button>
    </div>`).join('');
}

function memoryTypeLabel(type) {
  return ({
    vocabulario:'vocabulario',
    tono:'tono',
    comida_gusta:'le gusta',
    comida_evitar:'evitar',
    alergia:'alergia',
    compras:'compras',
    rutina:'rutina',
    hogar:'hogar',
    otro:'nota'
  })[type] || type || 'nota';
}

async function deleteMemory(id) {
  try {
    await api('memory',{method:'POST',body:{action:'delete',id}});
    loadMemory();
    toast('Recuerdo borrado ✓');
  } catch(e) { toast(e.message); }
}

function renderAccountSection() {
  const el = document.getElementById('s-account-wrap');
  if (!USER.guest) {
    el.innerHTML = `
      <div class="srow">
        <div><div class="srow-label">Correo</div><div class="srow-sub">${esc(USER.email)}</div></div>
      </div>
      <div style="padding-top:.75rem">
        <button class="btn-ghost" onclick="logout()">Cerrar sesión</button>
      </div>`;
    return;
  }
  el.innerHTML = `
    <div style="font-size:.8rem;color:var(--ink2);line-height:1.6;margin-bottom:.875rem">
      Crea una cuenta para guardar tus datos. Si el correo ya existe, escribe su PIN para entrar y actualizar tus datos.
    </div>
    <div id="s-account-err" class="auth-error hidden" style="margin-bottom:.75rem"></div>
    <div style="display:flex;flex-direction:column;gap:.625rem">
      <div>
        <div class="auth-label">Correo</div>
        <input id="s-account-email" class="sfield" type="email" style="width:100%;margin-top:.25rem" placeholder="tu@correo.com">
      </div>
      <div>
        <div class="auth-label">PIN de 4 dígitos</div>
        <div style="display:flex;gap:.5rem;align-items:center;margin-top:.25rem">
          <input id="s-account-pin" class="sfield" type="password" inputmode="numeric" pattern="[0-9]*" maxlength="4" autocomplete="one-time-code" style="flex:1;min-width:0" placeholder="1234">
          <button id="s-account-pin-toggle" type="button" class="btn-ghost" onclick="toggleAccountPin()" style="padding:.6rem .85rem;white-space:nowrap">ver pin</button>
        </div>
      </div>
      <div style="display:flex;gap:.625rem;flex-wrap:wrap">
        <button id="s-account-btn" class="btn-primary" onclick="createAccount()">Crear cuenta</button>
        <button id="s-account-login-btn" class="btn-ghost" onclick="loginAccount()">Ya tengo cuenta</button>
      </div>
    </div>`;
}

async function saveProfile() {
  const name = document.getElementById('s-name').value.trim();
  const household = parseInt(document.getElementById('s-household').value, 10);
  const city = document.getElementById('s-city').value.trim();

  if (USER.guest) {
    USER = { ...USER, casita_name: name || 'Casita', household_size: household, city };
    S.s('user', USER);
    setGreeting();
    toast('Guardado ✓');
    return;
  }
  try {
    const d = await api('auth', { method:'POST', body:{ action:'update_profile', casita_name: name, household_size: household, city } });
    USER = { ...USER, ...d.user };
    S.s('user', USER);
    setGreeting();
    toast('Guardado ✓');
  } catch(e) { toast(e.message); }
}

// ── UTILS ────────────────────────────────────────────────────
function esc(s) {
  return String(s||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

function fmtDate(s) {
  if (!s) return '';
  const clean = s.includes('T') ? s.split('T')[0] : s;
  const [y, m, d] = clean.split('-').map(Number);
  if (!y || !m || !d) return s;
  return `${String(d).padStart(2,'0')}/${String(m).padStart(2,'0')}/${String(y).slice(2)}`;
}

function fmtTime(s) {
  if (!s) return '';
  // accepts "HH:MM:SS", "HH:MM", or full ISO
  const t = s.includes('T') ? s.split('T')[1] : s;
  return t.slice(0,5);
}

function toast(msg) {
  document.querySelector('.toast')?.remove();
  const d=document.createElement('div');
  d.className='toast'; d.textContent=msg;
  document.body.appendChild(d);
  setTimeout(()=>d.remove(),3000);
}

// ── INIT ─────────────────────────────────────────────────────
function init() {
  applyTheme(S.g('theme','cocina'));
  const saved = S.g('user');
  USER = (saved && (saved.id || saved.guest)) ? saved : makeGuest();
  S.s('user', USER);
  launchApp();
}

init();
