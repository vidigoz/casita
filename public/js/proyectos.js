// ── PROYECTOS ────────────────────────────────────────────────
const _projEntryCache = {};
function _cacheEntry(tipo, proyId, itemIndex, entryId, datos) {
  const key = `${tipo}_${proyId}_${itemIndex}_${entryId}`;
  _projEntryCache[key] = {tipo, proyId, itemIndex, entryId, datos};
  return key;
}

async function loadProjects() {
  document.getElementById('proj-list-view').classList.remove('hidden');
  document.getElementById('proj-detail-view').classList.add('hidden');
  try {
    const res = await apiAuth('projects');
    if (!res) { renderProjects([]); return; }
    renderProjects(res.items);
  } catch(e) { console.error(e); }
}

const PROJ_META = {
  checklist:        { icon:'✓',  cls:'proj-icon-check',  label:'Lista de tareas' },
  tracker_dinero:   { icon:'$',  cls:'proj-icon-money',  label:'Control de deudas' },
  presupuesto_lista:{ icon:'🎉', cls:'proj-icon-fiesta', label:'Presupuesto con lista' },
  rutina_hogar:     { icon:'🧹', cls:'proj-icon-rutina', label:'Rutina del hogar' },
  gastos_hogar:     { icon:'📊', cls:'proj-icon-gastos', label:'Gastos del hogar' },
};

function projMeta(p) {
  const d = p.data;
  switch(p.type) {
    case 'checklist': {
      const t=(d.items||[]).length, c=Object.values(d.checked||{}).filter(v=>v).length;
      return {meta:`${c}/${t} tareas`, pct: t?Math.round(c/t*100):0, barCls:''};
    }
    case 'tracker_dinero': {
      const pagado=(d.abonos||[]).reduce((s,a)=>s+(a.monto||0),0), meta=d.meta_total||0;
      return {meta:`$${pagado.toFixed(0)} de $${meta.toFixed(0)}`, pct:meta?Math.min(100,Math.round(pagado/meta*100)):0, barCls:'pbar-fill-y'};
    }
    case 'presupuesto_lista': {
      const items=d.items||[], total=items.reduce((s,x)=>s+(x.precio||0),0), gastado=items.filter(x=>x.pagado).reduce((s,x)=>s+(x.precio||0),0);
      const t=items.length, c=items.filter(x=>x.pagado).length;
      return {meta:`${c}/${t} · $${gastado.toFixed(0)} de $${total.toFixed(0)}`, pct:t?Math.round(c/t*100):0, barCls:'pbar-fill-fiesta'};
    }
    case 'rutina_hogar': {
      const tareas=d.tareas||[], t=tareas.length, c=tareas.filter(x=>x.hecha).length;
      return {meta:`${c}/${t} tareas hoy`, pct:t?Math.round(c/t*100):0, barCls:'pbar-fill-rutina'};
    }
    case 'gastos_hogar': {
      const gastos=d.gastos||[], total=gastos.reduce((s,g)=>s+(g.monto||0),0), pres=d.presupuesto_mes||0;
      return {meta: pres ? `$${total.toFixed(0)} de $${pres.toFixed(0)}` : `$${total.toFixed(0)} gastado`, pct:pres?Math.min(100,Math.round(total/pres*100)):0, barCls:'pbar-fill-gastos'};
    }
    default: return {meta:'', pct:0, barCls:''};
  }
}

function renderProjects(items) {
  const el = document.getElementById('projects-list');
  if (!items.length) {
    el.innerHTML = '<div class="empty"><h3>Sin proyectos</h3><p>Dile a Casita "quiero organizar una fiesta" o toca el botón de abajo para ver qué puedes crear</p></div>';
    el.style.padding = '';
    return;
  }
  el.style.padding = '0';
  el.innerHTML = items.map(p=>{
    const m = PROJ_META[p.type] || PROJ_META.checklist;
    const {meta, pct, barCls} = projMeta(p);
    return `
    <div class="proj-card" onclick="openProject(${p.id})">
      <div class="proj-icon ${m.cls}">${m.icon}</div>
      <div style="flex:1;min-width:0">
        <div class="proj-name">${esc(p.title)}</div>
        <div class="proj-meta">${meta}</div>
        <div class="pbar" style="margin-top:.5rem"><div class="pbar-fill ${barCls}" style="width:${pct}%"></div></div>
      </div>
      <div class="proj-pct">${pct}%</div>
    </div>`;
  }).join('');
}

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

function backBtn() {
  return `<button class="back-btn" onclick="loadProjects()">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="15 18 9 12 15 6"/></svg>
    proyectos
  </button>`;
}

async function renameProject(id, currentTitle) {
  const newTitle = prompt('Nuevo nombre del proyecto:', currentTitle);
  if (!newTitle || newTitle.trim() === currentTitle) return;
  await apiAuth('projects', {method:'POST', body:{id, action:'rename', title:newTitle.trim()}});
  openProject(id);
}

function editTitleBtn(p) {
  return `<button class="edit-title-btn" onclick="renameProject(${p.id},'${esc(p.title).replace(/'/g,"\\'")}')">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="15" height="15"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
  </button>`;
}

function renderProjectDetail(p) {
  const el = document.getElementById('proj-detail-view');
  switch(p.type) {
    case 'checklist':         renderChecklist(el, p); break;
    case 'tracker_dinero':    renderTrackerDinero(el, p); break;
    case 'presupuesto_lista': renderPresupuesto(el, p); break;
    case 'rutina_hogar':      renderRutina(el, p); break;
    case 'gastos_hogar':      renderGastos(el, p); break;
    default:                  renderChecklist(el, p);
  }
}

// ── CHECKLIST ──────────────────────────────────────────────
function renderChecklist(el, p) {
  const items = p.data.items||[], checked = p.data.checked||{};
  const t=items.length, c=Object.values(checked).filter(v=>v).length, pct=t?Math.round(c/t*100):0;
  el.innerHTML = `
    ${backBtn()}
    <div>
      <div style="display:flex;align-items:center;gap:.5rem"><h2 class="proj-title">${esc(p.title)}</h2>${editTitleBtn(p)}</div>
      <div style="display:flex;justify-content:space-between;font-size:.8rem;color:var(--ink2);margin:.5rem 0 .375rem">
        <span>${c}/${t} tareas</span><span style="color:var(--g);font-weight:600">${pct}%</span>
      </div>
      <div class="pbar"><div class="pbar-fill" style="width:${pct}%"></div></div>
    </div>
    <div class="slabel">tareas</div>
    <div class="card" style="padding:.25rem 1.1rem">
      ${items.map((it,i)=>{ const k=_cacheEntry('checklist',p.id,i,null,{texto:it}); return `
        <div class="row">
          <div class="chk chk-sq ${checked[i]?'done':''}" onclick="toggleCheckItem(${p.id},${i})"></div>
          <span class="row-text ${checked[i]?'done':''}" style="flex:1" onclick="openProjEditByKey('${k}')">${esc(it)}</span>
          <button class="del-btn" onclick="deleteEntry('checklist',${p.id},${i},null)">×</button>
        </div>`;}).join('')}
    </div>
    <div class="input-row" style="border-top:none;margin-top:.25rem">
      <input id="new-check-item" class="ibox" placeholder="agregar tarea..." onkeydown="if(event.key==='Enter')addCheckItem(${p.id})">
      <button class="icon-btn" onclick="addCheckItem(${p.id})">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
      </button>
    </div>
    <button class="btn-ghost" onclick="archiveProject(${p.id})">archivar proyecto</button>`;
}

// ── TRACKER DINERO ─────────────────────────────────────────
function renderTrackerDinero(el, p) {
  const abonos = p.data.abonos||[], meta=p.data.meta_total||0;
  const pagado=abonos.reduce((s,a)=>s+(a.monto||0),0), pct=meta?Math.min(100,Math.round(pagado/meta*100)):0;
  el.innerHTML = `
    ${backBtn()}
    <div style="display:flex;align-items:center;gap:.5rem"><h2 class="proj-title">${esc(p.title)}</h2>${editTitleBtn(p)}</div>
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
        <input id="ab-desc" class="ibox" placeholder="descripción" style="border-radius:10px;padding:.6rem .75rem">
        <button class="icon-btn" onclick="addAbono(${p.id})">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        </button>
      </div>
    </div>
    ${abonos.length ? `
      <div class="slabel">historial</div>
      <div class="card" style="padding:.25rem 1.1rem">
        ${[...abonos].reverse().map(a=>{ const k=_cacheEntry('abono',p.id,null,a.id,{descripcion:a.descripcion||'Abono',monto:a.monto||0}); return `
          <div class="abono-row" onclick="openProjEditByKey('${k}')">
            <span class="ab-date">${fmtDate(a.fecha)}</span>
            <span class="ab-desc" style="flex:1">${esc(a.descripcion||'Abono')}</span>
            <span class="ab-amt">+$${(a.monto||0).toFixed(0)}</span>
            <button class="del-btn" onclick="event.stopPropagation();deleteEntry('abono',${p.id},null,${a.id})">×</button>
          </div>`;}).join('')}
      </div>` : ''}
    <button class="btn-ghost" onclick="archiveProject(${p.id})">archivar proyecto</button>`;
}

// ── PRESUPUESTO CON LISTA ──────────────────────────────────
function renderPresupuesto(el, p) {
  const items = p.data.items||[];
  const total=items.reduce((s,x)=>s+(x.precio||0),0);
  const gastado=items.filter(x=>x.pagado).reduce((s,x)=>s+(x.precio||0),0);
  const restante=total-gastado;
  const t=items.length, c=items.filter(x=>x.pagado).length, pct=t?Math.round(c/t*100):0;
  el.innerHTML = `
    ${backBtn()}
    <div style="display:flex;align-items:center;gap:.5rem"><h2 class="proj-title">${esc(p.title)}</h2>${editTitleBtn(p)}</div>
    <div class="stat3">
      <div class="stat-box"><div class="stat-v" style="color:var(--r)">$${restante.toFixed(0)}</div><div class="stat-l">por pagar</div></div>
      <div class="stat-box"><div class="stat-v" style="color:var(--g)">$${gastado.toFixed(0)}</div><div class="stat-l">pagado</div></div>
      <div class="stat-box"><div class="stat-v">$${total.toFixed(0)}</div><div class="stat-l">total</div></div>
    </div>
    <div class="pbar"><div class="pbar-fill pbar-fill-fiesta" style="width:${pct}%"></div></div>
    <div style="text-align:right;font-size:.7rem;color:var(--ink3)">${c}/${t} cubiertos</div>
    <div class="slabel">agregar gasto</div>
    <div class="card" style="padding:.75rem 1.1rem">
      <div style="display:grid;grid-template-columns:1fr 85px 42px;gap:.5rem;align-items:center">
        <input id="pres-texto" class="ibox" placeholder="pastel, flores..." style="border-radius:10px;padding:.6rem .75rem">
        <input id="pres-precio" class="ibox" type="number" placeholder="$0" style="text-align:center;border-radius:10px;padding:.6rem .75rem">
        <button class="icon-btn" onclick="addPresupuestoItem(${p.id})">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        </button>
      </div>
    </div>
    <div class="slabel">lista de gastos</div>
    <div class="card" style="padding:.25rem 1.1rem">
      ${items.length ? items.map(x=>{ const k=_cacheEntry('presupuesto_item',p.id,null,x.id,{texto:x.texto,precio:x.precio||0}); return `
        <div class="row">
          <div class="chk chk-sq ${x.pagado?'done':''}" onclick="togglePresupuestoItem(${p.id},${x.id})"></div>
          <span class="row-text ${x.pagado?'done':''}" style="flex:1" onclick="openProjEditByKey('${k}')">${esc(x.texto)}</span>
          <span style="font-size:.8rem;color:var(--ink2);margin-right:.25rem">$${(x.precio||0).toFixed(0)}</span>
          <button class="del-btn" onclick="deleteEntry('presupuesto_item',${p.id},null,${x.id})">×</button>
        </div>`;}).join('')
      : '<div class="empty" style="padding:1rem 0"><p>Agrega los gastos del evento</p></div>'}
    </div>
    <button class="btn-ghost" onclick="archiveProject(${p.id})">archivar proyecto</button>`;
}

// ── RUTINA DEL HOGAR ───────────────────────────────────────
const FREC_LABEL = {diario:'Diario', semanal:'Semanal', mensual:'Mensual'};
function renderRutina(el, p) {
  const tareas = p.data.tareas||[];
  const grupos = {diario:[], semanal:[], mensual:[]};
  tareas.forEach(t => (grupos[t.frecuencia]||grupos.semanal).push(t));
  const t=tareas.length, c=tareas.filter(x=>x.hecha).length, pct=t?Math.round(c/t*100):0;

  const grupoHTML = (frec, lista) => lista.length ? `
    <div class="slabel">${FREC_LABEL[frec]}</div>
    <div class="card" style="padding:.25rem 1.1rem">
      ${lista.map(x=>{ const k=_cacheEntry('rutina_tarea',p.id,null,x.id,{texto:x.texto,frecuencia:x.frecuencia}); return `
        <div class="row">
          <div class="chk chk-sq ${x.hecha?'done':''}" onclick="toggleRutinaTarea(${p.id},${x.id})"></div>
          <span class="row-text ${x.hecha?'done':''}" style="flex:1" onclick="openProjEditByKey('${k}')">${esc(x.texto)}</span>
          ${x.ultima ? `<span style="font-size:.7rem;color:var(--ink3);margin-right:.25rem">${fmtDate(x.ultima)}</span>` : ''}
          <button class="del-btn" onclick="deleteEntry('rutina_tarea',${p.id},null,${x.id})">×</button>
        </div>`;}).join('')}
    </div>` : '';

  el.innerHTML = `
    ${backBtn()}
    <div style="display:flex;align-items:center;gap:.5rem"><h2 class="proj-title">${esc(p.title)}</h2>${editTitleBtn(p)}</div>
    <div style="display:flex;justify-content:space-between;font-size:.8rem;color:var(--ink2);margin:.5rem 0 .375rem">
      <span>${c}/${t} tareas de hoy</span><span style="color:var(--g);font-weight:600">${pct}%</span>
    </div>
    <div class="pbar"><div class="pbar-fill pbar-fill-rutina" style="width:${pct}%"></div></div>
    <div class="slabel">agregar tarea</div>
    <div class="card" style="padding:.75rem 1.1rem">
      <div style="display:grid;grid-template-columns:1fr auto 42px;gap:.5rem;align-items:center">
        <input id="rut-texto" class="ibox" placeholder="limpiar baños, barrer..." style="border-radius:10px;padding:.6rem .75rem">
        <select id="rut-frec" class="ibox" style="border-radius:10px;padding:.6rem .75rem;background:var(--bg2)">
          <option value="diario">Diario</option>
          <option value="semanal" selected>Semanal</option>
          <option value="mensual">Mensual</option>
        </select>
        <button class="icon-btn" onclick="addRutinaTarea(${p.id})">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        </button>
      </div>
    </div>
    ${grupoHTML('diario', grupos.diario)}
    ${grupoHTML('semanal', grupos.semanal)}
    ${grupoHTML('mensual', grupos.mensual)}
    ${!tareas.length ? '<div class="card"><div class="empty" style="padding:1rem"><p>Agrega las tareas de tu rutina</p></div></div>' : ''}
    <button class="btn-ghost" onclick="archiveProject(${p.id})">archivar proyecto</button>`;
}

// ── GASTOS DEL HOGAR ───────────────────────────────────────
const CATS_GASTO = ['comida','luz/agua/gas','limpieza','transporte','salud','ropa','otros'];
function renderGastos(el, p) {
  const gastos = p.data.gastos||[], pres=p.data.presupuesto_mes||0;
  const total=gastos.reduce((s,g)=>s+(g.monto||0),0), pct=pres?Math.min(100,Math.round(total/pres*100)):0;

  el.innerHTML = `
    ${backBtn()}
    <div style="display:flex;align-items:center;gap:.5rem"><h2 class="proj-title">${esc(p.title)}</h2>${editTitleBtn(p)}</div>
    <div class="stat3">
      <div class="stat-box"><div class="stat-v" style="color:var(--r)">$${total.toFixed(0)}</div><div class="stat-l">gastado</div></div>
      <div class="stat-box"><div class="stat-v" style="color:var(--g)">$${(pres-total).toFixed(0)}</div><div class="stat-l">disponible</div></div>
      <div class="stat-box"><div class="stat-v">$${pres.toFixed(0)}</div><div class="stat-l">presupuesto</div></div>
    </div>
    ${pres ? `<div class="pbar"><div class="pbar-fill pbar-fill-gastos" style="width:${pct}%"></div></div>
    <div style="text-align:right;font-size:.7rem;color:var(--ink3)">${pct}% del presupuesto</div>` : ''}
    <div class="slabel">registrar gasto</div>
    <div class="card" style="padding:.75rem 1.1rem">
      <div style="display:grid;grid-template-columns:1fr auto 85px 42px;gap:.5rem;align-items:center">
        <input id="gasto-desc" class="ibox" placeholder="descripción..." style="border-radius:10px;padding:.6rem .75rem">
        <select id="gasto-cat" class="ibox" style="border-radius:10px;padding:.6rem .75rem;background:var(--bg2)">
          ${CATS_GASTO.map(c=>`<option value="${c}">${c}</option>`).join('')}
        </select>
        <input id="gasto-monto" class="ibox" type="number" placeholder="$0" style="text-align:center;border-radius:10px;padding:.6rem .75rem">
        <button class="icon-btn" onclick="addGasto(${p.id})">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        </button>
      </div>
    </div>
    ${gastos.length ? `
      <div class="slabel">historial</div>
      <div class="card" style="padding:.25rem 1.1rem">
        ${[...gastos].reverse().map(g=>{ const k=_cacheEntry('gasto',p.id,null,g.id,{descripcion:g.descripcion||'',monto:g.monto||0,categoria:g.categoria||'otros'}); return `
          <div class="abono-row" onclick="openProjEditByKey('${k}')">
            <span class="ab-date">${fmtDate(g.fecha)}</span>
            <span style="font-size:.7rem;background:var(--bg2);border-radius:6px;padding:.1rem .4rem;color:var(--ink3)">${g.categoria}</span>
            <span class="ab-desc" style="flex:1;margin-left:.25rem">${esc(g.descripcion||'')}</span>
            <span class="ab-amt">$${(g.monto||0).toFixed(0)}</span>
            <button class="del-btn" onclick="event.stopPropagation();deleteEntry('gasto',${p.id},null,${g.id})">×</button>
          </div>`;}).join('')}
      </div>` : ''}
    <button class="btn-ghost" onclick="archiveProject(${p.id})">archivar proyecto</button>`;
}

// ── ACCIONES ───────────────────────────────────────────────
async function toggleCheckItem(id, idx) {
  try { await api('projects',{method:'POST',body:{action:'toggle_checklist_item',id,item_index:idx}}); openProject(id); }
  catch(e) { toast(e.message); }
}
async function addCheckItem(id) {
  const inp=document.getElementById('new-check-item'), v=inp.value.trim(); if (!v) return;
  inp.value='';
  try { await api('projects',{method:'POST',body:{action:'add_checklist_item',id,item_text:v}}); openProject(id); }
  catch(e) { toast(e.message); }
}
async function addAbono(id) {
  const amt=parseFloat(document.getElementById('ab-monto').value), desc=document.getElementById('ab-desc').value.trim();
  if (!amt||amt<=0) { toast('Pon un monto válido'); return; }
  try {
    await api('projects',{method:'POST',body:{action:'add_abono',id,abono_amount:amt,abono_desc:desc}});
    document.getElementById('ab-monto').value=''; document.getElementById('ab-desc').value='';
    openProject(id); toast('Abono registrado ✓');
  } catch(e) { toast(e.message); }
}
async function togglePresupuestoItem(id, itemId) {
  try { await api('projects',{method:'POST',body:{action:'toggle_presupuesto_item',id,item_id:itemId}}); openProject(id); }
  catch(e) { toast(e.message); }
}
async function addPresupuestoItem(id) {
  const texto=document.getElementById('pres-texto').value.trim(), precio=parseFloat(document.getElementById('pres-precio').value)||0;
  if (!texto) { toast('Escribe el nombre del gasto'); return; }
  try {
    await api('projects',{method:'POST',body:{action:'add_presupuesto_item',id,texto,precio}});
    document.getElementById('pres-texto').value=''; document.getElementById('pres-precio').value='';
    openProject(id);
  } catch(e) { toast(e.message); }
}
async function addRutinaTarea(id) {
  const texto=document.getElementById('rut-texto').value.trim(), frecuencia=document.getElementById('rut-frec').value;
  if (!texto) { toast('Escribe el nombre de la tarea'); return; }
  try {
    await api('projects',{method:'POST',body:{action:'add_rutina_tarea',id,texto,frecuencia}});
    document.getElementById('rut-texto').value=''; openProject(id);
  } catch(e) { toast(e.message); }
}
async function toggleRutinaTarea(id, tareaId) {
  try { await api('projects',{method:'POST',body:{action:'toggle_rutina_tarea',id,tarea_id:tareaId}}); openProject(id); }
  catch(e) { toast(e.message); }
}
async function addGasto(id) {
  const desc=document.getElementById('gasto-desc').value.trim(), cat=document.getElementById('gasto-cat').value, monto=parseFloat(document.getElementById('gasto-monto').value)||0;
  if (!desc) { toast('Escribe la descripción del gasto'); return; }
  if (!monto||monto<=0) { toast('Pon un monto válido'); return; }
  try {
    await api('projects',{method:'POST',body:{action:'add_gasto',id,descripcion:desc,categoria:cat,monto}});
    document.getElementById('gasto-desc').value=''; document.getElementById('gasto-monto').value='';
    openProject(id); toast('Gasto registrado ✓');
  } catch(e) { toast(e.message); }
}
async function archiveProject(id) {
  if (!confirm('¿Archivar este proyecto?')) return;
  try { await api('projects',{method:'POST',body:{action:'archive',id}}); loadProjects(); }
  catch(e) { toast(e.message); }
}

// ── BOTTOM SHEET DE EDICIÓN DE ENTRADAS ───────────────────
let _projEditCtx = null;

function openProjEditByKey(key) {
  const entry = _projEntryCache[key];
  if (!entry) return;
  openProjEdit(entry.tipo, entry.proyId, entry.itemIndex, entry.entryId, entry.datos);
}

function openProjEdit(tipo, proyId, itemIndex, entryId, datos) {
  _projEditCtx = {tipo, proyId, itemIndex, entryId, datos};

  const titles = {
    checklist:'Editar tarea', abono:'Editar abono',
    presupuesto_item:'Editar gasto', rutina_tarea:'Editar tarea de rutina', gasto:'Editar gasto'
  };
  document.getElementById('proj-edit-title').textContent = titles[tipo] || 'Editar';

  const fields = document.getElementById('proj-edit-fields');
  const texto = datos.texto || datos.descripcion || '';

  let html = `
    <div class="sheet-field">
      <label class="sheet-label">Nombre</label>
      <input id="pe-texto" class="ibox" type="text" value="${esc(texto)}">
    </div>`;

  if (datos.precio !== undefined) {
    html += `
    <div class="sheet-field">
      <label class="sheet-label">Precio</label>
      <input id="pe-precio" class="ibox" type="number" inputmode="decimal" placeholder="0" value="${datos.precio||''}">
    </div>`;
  }

  if (datos.monto !== undefined) {
    html += `
    <div class="sheet-field">
      <label class="sheet-label">Monto</label>
      <input id="pe-monto" class="ibox" type="number" inputmode="decimal" placeholder="0" value="${datos.monto||''}">
    </div>`;
  }

  if (datos.frecuencia !== undefined) {
    html += `
    <div class="sheet-field">
      <label class="sheet-label">Frecuencia</label>
      <select id="pe-frec" class="sfield" style="width:100%">
        <option value="diario" ${datos.frecuencia==='diario'?'selected':''}>Diario</option>
        <option value="semanal" ${datos.frecuencia==='semanal'?'selected':''}>Semanal</option>
        <option value="mensual" ${datos.frecuencia==='mensual'?'selected':''}>Mensual</option>
      </select>
    </div>`;
  }

  if (datos.categoria !== undefined) {
    html += `
    <div class="sheet-field">
      <label class="sheet-label">Categoría</label>
      <select id="pe-cat" class="sfield" style="width:100%">
        ${CATS_GASTO.map(c=>`<option value="${c}" ${datos.categoria===c?'selected':''}>${c}</option>`).join('')}
      </select>
    </div>`;
  }

  fields.innerHTML = html;

  document.getElementById('proj-edit-overlay').classList.remove('hidden');
  document.getElementById('proj-edit-sheet').classList.remove('hidden');
  setTimeout(() => document.getElementById('proj-edit-sheet').classList.add('open'), 10);

  setTimeout(() => document.getElementById('pe-texto')?.focus(), 120);
}

function closeProjEdit() {
  document.getElementById('proj-edit-sheet').classList.remove('open');
  setTimeout(() => {
    document.getElementById('proj-edit-overlay').classList.add('hidden');
    document.getElementById('proj-edit-sheet').classList.add('hidden');
  }, 280);
  _projEditCtx = null;
}

async function saveProjEdit() {
  if (!_projEditCtx) return;
  const {tipo, proyId, itemIndex, entryId} = _projEditCtx;

  const texto = document.getElementById('pe-texto')?.value.trim();
  if (!texto) { toast('El nombre no puede estar vacío'); return; }

  let b;
  if (tipo === 'checklist') {
    b = {action:'edit_checklist_item', id:proyId, item_index:itemIndex, item_text:texto};
  } else if (tipo === 'abono') {
    const monto = parseFloat(document.getElementById('pe-monto')?.value);
    b = {action:'edit_abono', id:proyId, abono_id:entryId, descripcion:texto, monto:isNaN(monto)?undefined:monto};
  } else if (tipo === 'presupuesto_item') {
    const precio = parseFloat(document.getElementById('pe-precio')?.value)||0;
    b = {action:'edit_presupuesto_item', id:proyId, item_id:entryId, texto, precio};
  } else if (tipo === 'rutina_tarea') {
    const frecuencia = document.getElementById('pe-frec')?.value;
    b = {action:'edit_rutina_tarea', id:proyId, tarea_id:entryId, texto, frecuencia};
  } else if (tipo === 'gasto') {
    const monto = parseFloat(document.getElementById('pe-monto')?.value);
    const categoria = document.getElementById('pe-cat')?.value;
    b = {action:'edit_gasto', id:proyId, gasto_id:entryId, descripcion:texto, monto:isNaN(monto)?undefined:monto, categoria};
  } else return;

  try {
    await api('projects', {method:'POST', body:b});
    closeProjEdit();
    openProject(proyId);
  } catch(e) { toast(e.message); }
}

async function deleteEntry(tipo, proyId, itemIndex, entryId) {
  if (!confirm('¿Eliminar esta entrada?')) return;
  let b;
  if (tipo==='checklist')            b = {action:'delete_checklist_item',   id:proyId, item_index:itemIndex};
  else if (tipo==='abono')           b = {action:'delete_abono',            id:proyId, abono_id:entryId};
  else if (tipo==='presupuesto_item')b = {action:'delete_presupuesto_item', id:proyId, item_id:entryId};
  else if (tipo==='rutina_tarea')    b = {action:'delete_rutina_tarea',     id:proyId, tarea_id:entryId};
  else if (tipo==='gasto')           b = {action:'delete_gasto',            id:proyId, gasto_id:entryId};
  else return;
  try { await api('projects',{method:'POST',body:b}); openProject(proyId); toast('Eliminado'); }
  catch(e) { toast(e.message); }
}
