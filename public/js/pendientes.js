// ── PENDIENTES ───────────────────────────────────────────────
let _allTasks = [];
let _calYear, _calMonth, _calSelDay;

async function loadTasks() {
  try {
    const res = await apiAuth('tasks');
    if (!res) { renderTasks([]); _allTasks = []; return; }
    _allTasks = res.items;
    renderTasks(res.items);
    renderCalendar();
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
      <div style="flex:1;cursor:pointer"
           data-task-id="${t.id}"
           data-task-title="${esc(t.title)}"
           data-task-date="${t.due_date?t.due_date.split('T')[0]:''}"
           data-task-time="${t.due_time?(t.due_time.includes('T')?t.due_time.split('T')[1]:t.due_time).slice(0,5):''}"
           onclick="openTaskEditFromEl(this)">
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

// ── TASK EDIT SHEET ──────────────────────────────────────────
let _taskEditId = null;

function openTaskEditFromEl(el) {
  _taskEditId = parseInt(el.dataset.taskId);
  document.getElementById('te-titulo').value = el.dataset.taskTitle || '';
  document.getElementById('te-fecha').value  = el.dataset.taskDate || '';
  document.getElementById('te-hora').value   = el.dataset.taskTime || '';
  document.getElementById('task-edit-overlay').classList.remove('hidden');
  document.getElementById('task-edit-sheet').classList.remove('hidden');
  setTimeout(() => document.getElementById('task-edit-sheet').classList.add('open'), 10);
  setTimeout(() => document.getElementById('te-titulo').focus(), 120);
}

function closeTaskEdit() {
  document.getElementById('task-edit-sheet').classList.remove('open');
  setTimeout(() => {
    document.getElementById('task-edit-overlay').classList.add('hidden');
    document.getElementById('task-edit-sheet').classList.add('hidden');
  }, 280);
  _taskEditId = null;
}

async function saveTaskEdit() {
  if (!_taskEditId) return;
  const title = document.getElementById('te-titulo').value.trim();
  if (!title) { toast('El nombre no puede estar vacío'); return; }
  const due_date = document.getElementById('te-fecha').value || null;
  const due_time = document.getElementById('te-hora').value  || null;
  try {
    await api('tasks', {method:'POST', body:{action:'update', id:_taskEditId, title, due_date, due_time}});
    closeTaskEdit();
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

// ── VISTA CALENDARIO ─────────────────────────────────────────
function swPendientes(vista, btn) {
  document.querySelectorAll('#pg-pendientes .seg-btn').forEach(b => b.classList.remove('on'));
  btn.classList.add('on');
  document.getElementById('pend-lista').classList.toggle('hidden', vista !== 'lista');
  document.getElementById('pend-calendario').classList.toggle('hidden', vista !== 'calendario');
  if (vista === 'calendario') {
    const hoy = new Date();
    if (!_calYear) { _calYear = hoy.getFullYear(); _calMonth = hoy.getMonth(); }
    renderCalendar();
    selectCalDay(localDateString(hoy));
  }
}

function calNav(dir) {
  _calMonth += dir;
  if (_calMonth > 11) { _calMonth = 0; _calYear++; }
  if (_calMonth < 0)  { _calMonth = 11; _calYear--; }
  renderCalendar();
}

function renderCalendar() {
  const hoy = new Date();
  const todayStr = localDateString(hoy);
  if (!_calYear) { _calYear = hoy.getFullYear(); _calMonth = hoy.getMonth(); }

  const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
  const mesEl = document.getElementById('cal-mes');
  const gridEl = document.getElementById('cal-grid');
  if (!mesEl || !gridEl) return;

  mesEl.textContent = `${MESES[_calMonth]} ${_calYear}`;

  // días con tareas (solo pendientes con fecha)
  const diasConTareas = new Set(
    (_allTasks||[]).filter(t => t.due_date && !t.done).map(t => t.due_date.split('T')[0])
  );

  const primerDia = new Date(_calYear, _calMonth, 1).getDay(); // 0=dom
  const diasEnMes = new Date(_calYear, _calMonth + 1, 0).getDate();
  const offset = (primerDia + 6) % 7; // lunes primero

  let html = '<div class="cal-grid">';
  // cabecera
  ['L','M','M','J','V','S','D'].forEach(d => {
    html += `<div class="cal-head">${d}</div>`;
  });
  // celdas vacías iniciales
  for (let i = 0; i < offset; i++) html += '<div></div>';
  // días
  for (let d = 1; d <= diasEnMes; d++) {
    const dateStr = `${_calYear}-${String(_calMonth+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const isHoy = dateStr === todayStr;
    const isSel = dateStr === _calSelDay;
    const tieneTareas = diasConTareas.has(dateStr);
    html += `<div class="cal-day ${isHoy?'cal-hoy':''} ${isSel?'cal-sel':''}" onclick="selectCalDay('${dateStr}')">
      <span>${d}</span>
      ${tieneTareas ? '<div class="cal-dot"></div>' : ''}
    </div>`;
  }
  html += '</div>';
  gridEl.innerHTML = html;
}

function selectCalDay(dateStr) {
  _calSelDay = dateStr;
  renderCalendar();

  const tareasDia = (_allTasks||[]).filter(t => {
    if (!t.due_date) return false;
    return t.due_date.split('T')[0] === dateStr;
  });

  const [y, m, d] = dateStr.split('-').map(Number);
  const MESES = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
  const label = `${d} de ${MESES[m-1]}`;

  const el = document.getElementById('cal-day-tasks');
  if (!tareasDia.length) {
    el.innerHTML = `<div class="slabel">${label}</div><div class="card"><div class="empty" style="padding:.875rem 0"><p>Sin pendientes este día</p></div></div>`;
    return;
  }

  el.innerHTML = `<div class="slabel">${label}</div><div class="card" style="padding:.25rem 1.1rem">
    ${tareasDia.map(t => `
      <div class="row" id="task-cal-${t.id}">
        <div class="chk chk-sq ${t.done?'done':''}" onclick="toggleTask(${t.id},${!t.done},false)"></div>
        <div style="flex:1;cursor:pointer"
             data-task-id="${t.id}"
             data-task-title="${esc(t.title)}"
             data-task-date="${t.due_date?t.due_date.split('T')[0]:''}"
             data-task-time="${t.due_time?(t.due_time.includes('T')?t.due_time.split('T')[1]:t.due_time).slice(0,5):''}"
             onclick="openTaskEditFromEl(this)">
          <div class="row-text ${t.done?'done':''}">${esc(t.title)}</div>
          ${t.due_time ? `<div class="row-sub">${fmtTime(t.due_time)}</div>` : ''}
        </div>
        <button class="del-btn" onclick="deleteTask(${t.id})">×</button>
      </div>`).join('')}
  </div>`;
}
