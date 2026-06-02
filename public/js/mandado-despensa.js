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
  const pendingTotal = pending.reduce((sum, i) => sum + priceValue(i.estimated_price), 0);
  const pricedCount = pending.filter(i => priceValue(i.estimated_price) > 0).length;

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
      ${priceValue(i.estimated_price)>0?`<span class="row-sub" style="flex-shrink:0;color:var(--g);font-weight:600;margin-right:.25rem">${money(i.estimated_price)}</span>`:''}
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
    html += `<div class="card card-green" style="padding:.75rem 1rem;margin-bottom:.75rem">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:1rem">
        <span class="row-sub" style="white-space:normal">estimado del mandado</span>
        <span style="font-family:var(--serif);font-size:1.2rem;color:var(--g);font-weight:500">${money(pendingTotal)}</span>
      </div>
      <div class="row-sub" style="margin-top:.2rem">${pricedCount} con precio · ${pending.length-pricedCount} sin precio</div>
    </div>`;
    if (shopGroupBy === 'category') {
      html += renderGroups(grouped(pending, i => i.category, 'otros'));
    } else if (shopGroupBy === 'store') {
      html += renderGroups(grouped(pending, i => i.store_group, 'sin tienda'));
    } else if (shopGroupBy === 'price') {
      const withPrice = pending.filter(i => priceValue(i.estimated_price) > 0).sort((a,b) => priceValue(b.estimated_price) - priceValue(a.estimated_price));
      const withoutPrice = pending.filter(i => priceValue(i.estimated_price) <= 0);
      if (withPrice.length) html += `<div class="slabel">con precio · mayor a menor</div><div class="card" style="padding:.5rem 1.1rem">${withPrice.map(shopRow).join('')}</div>`;
      if (withoutPrice.length) html += `<div class="slabel">sin precio</div><div class="card" style="padding:.5rem 1.1rem">${withoutPrice.map(shopRow).join('')}</div>`;
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
  document.getElementById('shop-edit-price').value = priceValue(item.estimated_price) > 0 ? priceValue(item.estimated_price).toFixed(2) : '';
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
  const estimated_price = parsePrice(document.getElementById('shop-edit-price').value);
  if (!name) { toast('El nombre no puede estar vacío'); return; }
  try {
    await api('shopping', {method:'POST', body:{action:'update', id:_shopEditId, name, category, store_group, estimated_price}});
    closeShopEdit();
    loadShoppingList();
  } catch(e) { toast(e.message); }
}

function priceValue(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function parsePrice(value) {
  const n = Number(String(value || '').replace(',','.'));
  return Number.isFinite(n) && n > 0 ? n : null;
}

function money(value) {
  return `$${priceValue(value).toFixed(2)}`;
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

