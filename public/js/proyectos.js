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
    <div class="proj-card" data-proj-id="${p.id}" onclick="if(!_tdMoved)openProject(${p.id})">
      <div class="proj-drag-handle" onmousedown="event.stopPropagation()" ontouchstart="event.stopPropagation();initProjDrag(event,this.closest('.proj-card'))" title="Mover">
        <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14"><circle cx="9" cy="5" r="1.5"/><circle cx="15" cy="5" r="1.5"/><circle cx="9" cy="12" r="1.5"/><circle cx="15" cy="12" r="1.5"/><circle cx="9" cy="19" r="1.5"/><circle cx="15" cy="19" r="1.5"/></svg>
      </div>
      <div class="proj-icon ${m.cls}">${m.icon}</div>
      <div style="flex:1;min-width:0">
        <div class="proj-name">${esc(p.title)}</div>
        <div class="proj-meta">${meta}</div>
        <div class="pbar" style="margin-top:.5rem"><div class="pbar-fill ${barCls}" style="width:${pct}%"></div></div>
      </div>
      <div class="proj-card-actions">
        <div class="proj-pct">${pct}%</div>
        <button class="proj-menu-btn" onclick="event.stopPropagation();showProjMenu(${p.id},this)" title="Opciones">
          <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16"><circle cx="12" cy="5" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="12" cy="19" r="1.5"/></svg>
        </button>
      </div>
    </div>`;
  }).join('');
  initProjDragList(el);
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
`;
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
`;
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
`;
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
`;
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
`;
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
  const confirmed = await showConfirmDialog(
    'Archivar proyecto',
    '¿Estás seguro? El proyecto se archivará y dejará de aparecer en tu lista.',
    'Archivar',
    'Cancelar'
  );
  if (!confirmed) return;
  try { await apiAuth('projects',{method:'POST',body:{action:'archive',id}}); loadProjects(); }
  catch(e) { toast(e.message); }
}

function showConfirmDialog(title, message, confirmLabel, cancelLabel) {
  return new Promise(resolve => {
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:1000;display:flex;align-items:flex-end;justify-content:center';
    overlay.innerHTML = `
      <div style="background:var(--white);border-radius:22px 22px 0 0;padding:1.5rem 1.25rem 2rem;width:100%;max-width:480px;animation:sheetUp .2s ease">
        <div style="width:36px;height:4px;background:var(--bg3);border-radius:2px;margin:0 auto .875rem"></div>
        <h3 style="font-family:var(--serif);font-size:1.125rem;font-weight:500;margin-bottom:.25rem">${title}</h3>
        <p style="font-size:.825rem;color:var(--ink3);margin-bottom:1.25rem">${message}</p>
        <div style="display:flex;flex-direction:column;gap:.625rem">
          <button id="confirm-ok-btn" style="padding:.875rem 1rem;border-radius:14px;background:var(--rbg);color:var(--r);font-weight:600;font-size:.9rem;transition:opacity .15s">
            ${confirmLabel}
          </button>
          <button id="confirm-cancel-btn" style="padding:.75rem 1rem;border-radius:14px;font-size:.875rem;color:var(--ink3)">
            ${cancelLabel}
          </button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    const cleanup = result => { overlay.remove(); resolve(result); };
    overlay.querySelector('#confirm-ok-btn').onclick    = () => cleanup(true);
    overlay.querySelector('#confirm-cancel-btn').onclick = () => cleanup(false);
    overlay.addEventListener('click', e => { if (e.target === overlay) cleanup(false); });
  });
}

// ── DRAG & DROP REORDENAR ──────────────────────────────────
function initProjDragList(list) {
  // desktop: HTML5 drag
  list.querySelectorAll('.proj-card').forEach(card => {
    card.draggable = true;
    card.addEventListener('dragstart', e => {
      e.dataTransfer.effectAllowed = 'move';
      card.classList.add('dragging');
      list._dragSrc = card;
    });
    card.addEventListener('dragend', () => {
      card.classList.remove('dragging');
      list.querySelectorAll('.proj-card').forEach(c => c.classList.remove('drag-over'));
      saveProjOrder(list);
    });
    card.addEventListener('dragover', e => {
      e.preventDefault();
      if (card === list._dragSrc) return;
      list.querySelectorAll('.proj-card').forEach(c => c.classList.remove('drag-over'));
      card.classList.add('drag-over');
      const src = list._dragSrc;
      const cards = [...list.querySelectorAll('.proj-card')];
      const srcIdx = cards.indexOf(src), dstIdx = cards.indexOf(card);
      if (srcIdx < dstIdx) card.after(src); else card.before(src);
    });
    card.addEventListener('dragleave', () => card.classList.remove('drag-over'));
    card.addEventListener('drop', e => { e.preventDefault(); card.classList.remove('drag-over'); });
  });
}

// touch drag — llamado desde ontouchstart del handle
let _td = null;
let _tdMoved = false;
function initProjDrag(e, card) {
  const list = card.parentElement;
  const touch = e.touches[0];
  const rect = card.getBoundingClientRect();
  const offsetY = touch.clientY - rect.top;

  // ghost visual
  const ghost = card.cloneNode(true);
  ghost.style.cssText = `position:fixed;left:${rect.left}px;width:${rect.width}px;top:${touch.clientY - offsetY}px;opacity:.85;pointer-events:none;z-index:9999;border-radius:10px;background:var(--white);box-shadow:var(--sh2)`;
  document.body.appendChild(ghost);

  card.classList.add('dragging');
  _td = {card, list, ghost, offsetY, moved: false};

  const onMove = ev => {
    ev.preventDefault();
    const t = ev.touches[0];
    ghost.style.top = (t.clientY - offsetY) + 'px';
    _td.moved = true;
    _tdMoved = true;

    const mid = t.clientY;
    const cards = [...list.querySelectorAll('.proj-card:not(.dragging)')];
    list.querySelectorAll('.proj-card').forEach(c => c.classList.remove('drag-over'));
    for (const c of cards) {
      const cr = c.getBoundingClientRect();
      if (mid < cr.top + cr.height / 2) {
        c.classList.add('drag-over');
        list.insertBefore(card, c);
        break;
      }
      if (c === cards[cards.length - 1]) {
        list.appendChild(card);
      }
    }
  };

  const onEnd = () => {
    document.removeEventListener('touchmove', onMove);
    document.removeEventListener('touchend', onEnd);
    ghost.remove();
    card.classList.remove('dragging');
    list.querySelectorAll('.proj-card').forEach(c => c.classList.remove('drag-over'));
    if (_td.moved) saveProjOrder(list);
    _td = null;
    // reset flag after a tick so the onclick que sigue no abre el proyecto
    setTimeout(() => { _tdMoved = false; }, 50);
  };

  document.addEventListener('touchmove', onMove, {passive: false});
  document.addEventListener('touchend', onEnd);
}

async function saveProjOrder(list) {
  const cards = [...list.querySelectorAll('.proj-card')];
  const order = cards.map((c, i) => ({id: parseInt(c.dataset.projId), sort_order: i}));
  try {
    await apiAuth('projects', {method:'POST', body:{action:'reorder', order}});
  } catch(e) { console.error('reorder:', e); }
}

// ── MENÚ DE PROYECTO ───────────────────────────────────────
let _projMenuOpen = null;
function showProjMenu(id, btn) {
  closeProjMenu();
  const menu = document.createElement('div');
  menu.id = 'proj-menu-popup';
  menu.style.cssText = 'position:fixed;background:var(--white);border:.5px solid var(--line);border-radius:14px;box-shadow:0 8px 24px rgba(0,0,0,.12);padding:.375rem;z-index:999;min-width:170px';
  const menuItemStyle = 'display:flex;align-items:center;gap:.625rem;width:100%;padding:.625rem .75rem;border-radius:10px;font-size:.875rem;color:var(--ink);transition:background .15s';
  menu.innerHTML = `
    <button onclick="closeProjMenu();duplicateProject(${id})" style="${menuItemStyle}" onmouseover="this.style.background='var(--bg2)'" onmouseout="this.style.background=''">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
      Duplicar proyecto
    </button>
    <button onclick="closeProjMenu();archiveProject(${id})" style="${menuItemStyle}" onmouseover="this.style.background='var(--bg2)'" onmouseout="this.style.background=''">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><polyline points="21 8 21 21 3 21 3 8"/><rect x="1" y="3" width="22" height="5"/><line x1="10" y1="12" x2="14" y2="12"/></svg>
      Archivar proyecto
    </button>`;
  const r = btn.getBoundingClientRect();
  document.body.appendChild(menu);
  const mw = menu.offsetWidth, mh = menu.offsetHeight;
  let left = r.right - mw, top = r.bottom + 4;
  if (left < 8) left = 8;
  if (top + mh > window.innerHeight - 8) top = r.top - mh - 4;
  menu.style.left = left + 'px';
  menu.style.top  = top  + 'px';
  _projMenuOpen = { menu, handler: e => { if (!menu.contains(e.target)) closeProjMenu(); } };
  setTimeout(() => document.addEventListener('click', _projMenuOpen.handler), 0);
}
function closeProjMenu() {
  if (!_projMenuOpen) return;
  _projMenuOpen.menu.remove();
  document.removeEventListener('click', _projMenuOpen.handler);
  _projMenuOpen = null;
}

async function duplicateProject(id) {
  const choice = await showDuplicateDialog();
  if (choice === null) return;
  try {
    await apiAuth('projects', {method:'POST', body:{action:'duplicate', id, withData: choice === 'data'}});
    loadProjects();
    toast('Proyecto duplicado ✓');
  } catch(e) { toast(e.message); }
}

function showDuplicateDialog() {
  return new Promise(resolve => {
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:1000;display:flex;align-items:flex-end;justify-content:center';
    overlay.innerHTML = `
      <div style="background:var(--white);border-radius:22px 22px 0 0;padding:1.5rem 1.25rem 2rem;width:100%;max-width:480px;animation:sheetUp .2s ease">
        <div style="width:36px;height:4px;background:var(--bg3);border-radius:2px;margin:0 auto .875rem"></div>
        <h3 style="font-family:var(--serif);font-size:1.125rem;font-weight:500;margin-bottom:.25rem">Duplicar proyecto</h3>
        <p style="font-size:.825rem;color:var(--ink3);margin-bottom:1.25rem">¿Cómo quieres duplicarlo?</p>
        <div style="display:flex;flex-direction:column;gap:.625rem">
          <button id="dup-data-btn" style="padding:.875rem 1rem;border-radius:14px;border:.5px solid var(--line);text-align:left;transition:background .15s;background:var(--white)">
            <div style="font-weight:500;font-size:.9rem;color:var(--ink)">Con información</div>
            <div style="font-size:.75rem;color:var(--ink3);margin-top:2px">Copia todos los datos del proyecto original</div>
          </button>
          <button id="dup-blank-btn" style="padding:.875rem 1rem;border-radius:14px;border:.5px solid var(--line);text-align:left;transition:background .15s;background:var(--white)">
            <div style="font-weight:500;font-size:.9rem;color:var(--ink)">En blanco</div>
            <div style="font-size:.75rem;color:var(--ink3);margin-top:2px">Mismo tipo de proyecto, sin datos</div>
          </button>
        </div>
        <button id="dup-cancel-btn" style="width:100%;margin-top:.875rem;padding:.75rem;border-radius:14px;font-size:.875rem;color:var(--ink3)">Cancelar</button>
      </div>`;
    document.body.appendChild(overlay);
    const cleanup = choice => { overlay.remove(); resolve(choice); };
    overlay.querySelector('#dup-data-btn').onclick  = () => cleanup('data');
    overlay.querySelector('#dup-blank-btn').onclick = () => cleanup('blank');
    overlay.querySelector('#dup-cancel-btn').onclick = () => cleanup(null);
    overlay.addEventListener('click', e => { if (e.target === overlay) cleanup(null); });
  });
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
