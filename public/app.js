/* ============================================================
   Casita — app.js
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
let voiceRecognition = null;
let isListening = false;
let voiceStopRequested = false;
let voiceSilenceTimer = null;

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
  S.d('user'); USER = makeGuest(); S.s('user', USER); chatHistory = []; location.reload();
}

async function createAccount() {
  const email = document.getElementById('s-account-email').value.trim();
  const name  = document.getElementById('s-account-name').value.trim();
  const btn   = document.getElementById('s-account-btn');
  const err   = document.getElementById('s-account-err');
  err.classList.add('hidden');
  if (!email || !email.includes('@')) { showAccountErr('Pon un correo válido'); return; }
  if (!name) { showAccountErr('¿Cómo te llamas?'); return; }
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span>';
  try {
    const d = await api('auth', { method:'POST', body:{ action:'register', email, casita_name: name } });
    USER = d.user;
    S.s('user', USER);
    setGreeting();
    renderAccountSection();
    toast('¡Cuenta creada! ✓');
  } catch(e) {
    showAccountErr(e.message);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Crear cuenta';
  }
}

async function loginAccount() {
  const email = document.getElementById('s-account-email').value.trim();
  const btn   = document.getElementById('s-account-login-btn');
  const err   = document.getElementById('s-account-err');
  err.classList.add('hidden');
  if (!email || !email.includes('@')) { showAccountErr('Pon un correo válido'); return; }
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span>';
  try {
    const d = await api('auth', { method:'POST', body:{ action:'login', email } });
    USER = d.user;
    S.s('user', USER);
    setGreeting();
    renderAccountSection();
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

// ── Launch ───────────────────────────────────────────────────
function launchApp() {
  setupVoice();
  setGreeting();
  loadInicio();
  if (USER.guest) {
    addBubble('ai', `¡Hola! Soy Casita 👋 Para chatear y guardar tus datos, crea una cuenta gratis en Ajustes.`);
  } else {
    addBubble('ai', `Hola ${USER.casita_name} 👋 Aquí estoy para ayudarte con todo lo del hogar. Puedes hablarme o escribirme.`);
  }
}

function setGreeting() {
  const h = new Date().getHours();
  const g = h<12?'Buenos días':h<19?'Buenas tardes':'Buenas noches';
  const name = USER.casita_name || 'Casita';
  document.getElementById('greet-h1').innerHTML = USER.guest
    ? `${g},<br><em>bienvenido</em>`
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
  if (name==='recetas')    loadRecipes(false);
  if (name==='proyectos')  loadProjects();
  if (name==='ajustes')    loadSettings();
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
        <span class="row-sub">${t.due_time?t.due_time.slice(0,5):'hoy'}</span>
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
  if (!items.length) {
    el.innerHTML = USER.guest
      ? '<div class="empty"><h3>Sin pendientes</h3><p>Crea una cuenta en Ajustes para guardar tus pendientes</p></div>'
      : '<div class="empty"><h3>Sin pendientes</h3><p>Dile a Casita "recuérdame X" o agrégalo manualmente</p></div>';
    return;
  }
  el.innerHTML = items.map(t=>`
    <div class="row" id="task-${t.id}">
      <div class="chk chk-sq ${t.done?'done':''}" onclick="toggleTask(${t.id},${!t.done},false)"></div>
      <div style="flex:1">
        <div class="row-text ${t.done?'done':''}">${esc(t.title)}</div>
        ${t.due_date?`<div class="row-sub">${fmtDate(t.due_date)}${t.due_time?' · '+t.due_time.slice(0,5):''}</div>`:''}
      </div>
      <button class="del-btn" onclick="deleteTask(${t.id})">×</button>
    </div>`).join('');
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

function renderShopping(items) {
  const el = document.getElementById('shopping-list');
  if (!items.length) {
    el.innerHTML = '<div class="empty"><h3>Lista vacía</h3><p>Dile a Casita "necesito X" o agrégalo abajo</p></div>';
    return;
  }
  el.innerHTML = items.map(i=>`
    <div class="row" id="shop-${i.id}">
      <div class="chk chk-sq ${i.done?'done':''}" onclick="toggleShop(${i.id},${!i.done})"></div>
      <div style="flex:1">
        <div class="row-text ${i.done?'done':''}">${esc(i.name)}</div>
        ${i.reason&&i.source==='ai_suggestion'?`<div class="row-sub">${esc(i.reason)}</div>`:''}
      </div>
      ${i.quantity?`<span class="row-sub">${esc(i.quantity)}</span>`:''}
      <button class="del-btn" onclick="delShop(${i.id})">×</button>
    </div>`).join('');
}

async function toggleShop(id, done) {
  try {
    await api('shopping',{method:'POST',body:{action:'toggle',id,done}});
    // If done, update pantry (item bought)
    if (done) {
      const {items} = await api('shopping');
      const item = items.find(i=>i.id===id);
      if (item) {
        await api('pantry',{method:'POST',body:{action:'add',name:item.name,level:'lleno',category:item.category||'otros'}});
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
    await api('shopping',{method:'POST',body:{action:'add',name:v,source:'user'}});
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
  const cats = {carnes:'🥩 carnes',verduras:'🥬 verduras',frutas:'🍎 frutas',lacteos:'🥛 lácteos',abarrotes:'🫙 abarrotes',pan:'🍞 pan',limpieza:'🧹 limpieza',otros:'📦 otros'};
  const bycat = {};
  for (const it of items) {
    const c = it.category||'otros';
    if (!bycat[c]) bycat[c]=[];
    bycat[c].push(it);
  }
  let html='';
  for (const [cat, label] of Object.entries(cats)) {
    if (!bycat[cat]) continue;
    html += `<div style="margin-bottom:.75rem">
      <div style="font-family:var(--serif);font-style:italic;font-size:.8rem;color:var(--ink3);padding:.5rem 0 .25rem">${label}</div>
      <div class="card" style="padding:.25rem 1.1rem">
        ${bycat[cat].map(it=>`
          <div class="row">
            <div class="dot ${it.level==='agotado'?'dot-out':it.level==='poco'?'dot-low':'dot-ok'}"></div>
            <span class="row-text">${esc(it.name)}</span>
            <span class="pill ${it.level==='agotado'?'pill-r':it.level==='poco'?'pill-y':'pill-g'}">${it.level}</span>
          </div>`).join('')}
      </div>
    </div>`;
  }
  el.innerHTML = html;
}

// ── RECETAS ──────────────────────────────────────────────────
async function loadRecipes(next=false) {
  if (next) recipeOffset += 3; else recipeOffset = 0;
  const el = document.getElementById('recipes-container');
  el.innerHTML = '<div class="empty"><div class="spinner" style="margin:0 auto"></div></div>';
  try {
    const pantryRes = USER.guest ? null : await api('pantry').catch(()=>null);
    const pantry = pantryRes?.items || [];
    const d = await api('recipes',{method:'POST',body:{pantry,offset:recipeOffset}});
    currentRecipes = d.recipes || [];
    renderRecipes(currentRecipes);
  } catch(e) {
    el.innerHTML = '<div class="empty"><h3>Sin sugerencias</h3><p>Cuando tengas ingredientes en tu despensa, Casita te recomendará recetas</p></div>';
  }
}

function renderRecipes(recipes) {
  const el = document.getElementById('recipes-container');
  if (!recipes.length) {
    el.innerHTML = '<div class="empty"><h3>Sin sugerencias</h3><p>Agrega ingredientes a tu despensa para ver recetas</p></div>';
    return;
  }
  const emojis = {'mexicana':'🌮','italiana':'🍝','asiatica':'🍜','americana':'🍔','española':'🥘','otra':'🍲'};
  el.innerHTML = recipes.map((r,i)=>`
    <div class="recipe-card" onclick="openRecipe(${i})">
      <div class="recipe-img">
        <span>${emojis[r.cuisine]||'🍽️'}</span>
        <span class="recipe-tag" style="position:absolute;top:.75rem;right:.75rem">${r.cuisine||'receta'}</span>
      </div>
      <div class="recipe-body">
        <div class="recipe-name">${esc(r.name)}</div>
        <div class="recipe-meta">
          <span>⏱ ${r.time||'30 min'}</span>
          <span>👥 ${r.servings||4} porciones</span>
          <span style="color:${r.available?'var(--g)':'var(--y)'}">
            ${r.available?'✓ tienes todo':'⚠ falta algo'}
          </span>
        </div>
      </div>
    </div>`).join('');
}

function openRecipe(idx) {
  const r = currentRecipes[idx];
  if (!r) return;
  document.getElementById('rm-name').textContent = r.name;
  document.getElementById('rm-meta').textContent = `${r.time||'30 min'} · ${r.servings||4} porciones · ${r.cuisine||'receta'}`;

  // Ingredients
  const ingEl = document.getElementById('rm-ingredients');
  ingEl.innerHTML = (r.ingredients||[]).map(ing=>`
    <div class="ingredient-row">
      <span class="ing-name">${esc(ing.name)}</span>
      <span class="row-sub">${esc(ing.amount||'')}</span>
      <span class="ing-status ${ing.status==='ok'?'ing-ok':ing.status==='low'?'ing-low':'ing-missing'}">
        ${ing.status==='ok'?'tienes':ing.status==='low'?'poco':'falta'}
      </span>
    </div>`).join('');

  // Steps
  const stepsEl = document.getElementById('rm-steps');
  stepsEl.innerHTML = (r.steps||[]).map((s,i)=>`
    <div class="step-row">
      <div class="step-num">${i+1}</div>
      <div class="step-text">${esc(s)}</div>
    </div>`).join('');

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
      </div>`).join('');
  } catch(e) { console.error(e); }
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
    const b64 = await toB64(file);
    const d   = await api('scan-receipt',{method:'POST',body:{image_base64:b64,mime_type:file.type}});
    document.getElementById('scan-prog').classList.add('hidden');
    renderScanResult(d);
  } catch(e) {
    document.getElementById('scan-prog').classList.add('hidden');
    document.getElementById('scan-initial').classList.remove('hidden');
    toast('Error: '+e.message);
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
  renderAccountSection();
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
      Crea una cuenta para guardar tus datos y acceder desde cualquier dispositivo.
    </div>
    <div id="s-account-err" class="auth-error hidden" style="margin-bottom:.75rem"></div>
    <div style="display:flex;flex-direction:column;gap:.625rem">
      <div>
        <div class="auth-label">Tu nombre</div>
        <input id="s-account-name" class="sfield" style="width:100%;margin-top:.25rem" placeholder="Lupita" value="${esc(USER.casita_name==='Casita'?'':USER.casita_name)}">
      </div>
      <div>
        <div class="auth-label">Correo</div>
        <input id="s-account-email" class="sfield" type="email" style="width:100%;margin-top:.25rem" placeholder="tu@correo.com">
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
  const months=['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
  const d = new Date(s+'T12:00:00');
  if (isNaN(d.getTime())) return s;
  return `${d.getDate()} ${months[d.getMonth()]}`;
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
  const saved = S.g('user');
  USER = (saved && (saved.id || saved.guest)) ? saved : makeGuest();
  S.s('user', USER);
  launchApp();
}

init();
