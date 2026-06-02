// ── INICIO ───────────────────────────────────────────────────
let homeRecipeSuggestion = null;

async function loadInicio() {
  loadWeather();
  loadInicioTasks();
  loadInicioMarket();
  loadInicioCooking();
}

async function loadInicioTasks() {
  try {
    const today = localDateString();
    const res = await apiAuth(`tasks?filter=today&date=${encodeURIComponent(today)}`);
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
    document.getElementById('w-advice').textContent = weatherAdvice(d);
  } catch(e) {
    document.getElementById('w-desc').textContent = USER.city||'CDMX';
    document.getElementById('w-advice').textContent = '';
  }
}

function weatherAdvice(d={}) {
  const temp = Number(d.temp);
  const text = `${d.description || ''} ${d.alert || ''}`.toLowerCase();
  if (/lluv|torment|chubasc|granizo/.test(text)) return 'Conviene no tender ropa afuera y tener paraguas a la mano.';
  if (/viento/.test(text)) return 'Revisa ventanas, ropa tendida y cosas sueltas afuera.';
  if (Number.isFinite(temp) && temp >= 31) return 'Día caluroso: agua lista y algo fresco para la comida.';
  if (Number.isFinite(temp) && temp <= 12) return 'Día fresco: buena idea algo calientito y revisar cobijas.';
  if (/nublado/.test(text)) return 'Buen día para avanzar pendientes de casa sin tanto calor.';
  return 'Clima tranquilo para organizar la casa con calma.';
}

async function loadInicioMarket() {
  const el = document.getElementById('inicio-market');
  if (!el) return;
  try {
    const [shopRes, pantryRes] = await Promise.all([
      apiAuth('shopping'),
      apiAuth('pantry')
    ]);
    if (!shopRes || !pantryRes) {
      el.innerHTML = '<div class="empty"><p>Crea una cuenta para ver mandado y despensa</p></div>';
      return;
    }

    const pendingShop = (shopRes.items || []).filter(i => !i.done);
    const lowPantry = (pantryRes.items || []).filter(i => ['poco','agotado'].includes(i.level));
    const agotados = lowPantry.filter(i => i.level === 'agotado').length;
    const poco = lowPantry.length - agotados;
    const show = pendingShop.slice(0,3);

    if (!pendingShop.length && !lowPantry.length) {
      el.innerHTML = `
        <div class="home-card-head">
          <div>
            <div class="home-card-title">Todo se ve bien</div>
            <div class="home-card-sub">No hay compras pendientes ni alertas de despensa.</div>
          </div>
          <button class="btn-ghost" onclick="goTab('mandado')">Ver</button>
        </div>`;
      return;
    }

    el.innerHTML = `
      <div class="home-card-head">
        <div>
          <div class="home-card-title">${pendingShop.length} por comprar</div>
          <div class="home-card-sub">${agotados} agotado${agotados===1?'':'s'} · ${poco} con poco</div>
        </div>
        <button class="btn-ghost" onclick="goTab('mandado')">Ver</button>
      </div>
      ${show.length ? `<div class="home-mini-list">${show.map(i => `
        <div class="home-mini-row">
          <span>${esc(i.name)}</span>
          <small>${i.quantity ? esc(i.quantity) : i.reason ? esc(i.reason) : 'pendiente'}</small>
        </div>`).join('')}</div>` : ''}
      ${pendingShop.length > 3 ? `<div class="home-more" onclick="goTab('mandado')">+${pendingShop.length-3} más en la lista</div>` : ''}`;
  } catch(e) {
    console.error(e);
    el.innerHTML = '<div class="empty"><p>No pude cargar el mandado</p></div>';
  }
}

async function loadInicioCooking() {
  const el = document.getElementById('inicio-cocinar');
  if (!el) return;
  try {
    let recipe = (currentRecipes && currentRecipes[0]) || (typeof loadRecipesLocal === 'function' ? (loadRecipesLocal() || [])[0] : null);
    if (!recipe && !USER.guest) {
      const saved = await apiAuth('saved-recipes').catch(()=>null);
      recipe = saved?.items?.[0]?.recipe || null;
    }

    if (recipe) {
      homeRecipeSuggestion = recipe;
      const name = typeof recipeName === 'function' ? recipeName(recipe) : (recipe.name || recipe.nombre || 'Receta');
      const time = recipe.time || recipe.tiempo || '30 min';
      const available = recipe.available ?? recipe.disponible;
      el.innerHTML = `
        <div class="home-card-head">
          <div>
            <div class="home-card-title">${esc(name)}</div>
            <div class="home-card-sub">${esc(time)} · ${available ? 'tienes todo' : 'revisa ingredientes'}</div>
          </div>
          <button class="btn-ghost" onclick="openHomeRecipe()">Abrir</button>
        </div>`;
      return;
    }

    el.innerHTML = `
      <div class="home-card-head">
        <div>
          <div class="home-card-title">Ideas con tu despensa</div>
          <div class="home-card-sub">Casita puede sugerirte comida con lo que hay en casa.</div>
        </div>
        <button class="btn-ghost" onclick="goTab('recetas')">Ver ideas</button>
      </div>`;
  } catch(e) {
    console.error(e);
    el.innerHTML = `
      <div class="home-card-head">
        <div>
          <div class="home-card-title">Qué cocinar</div>
          <div class="home-card-sub">Revisa recetas cuando tengas un momento.</div>
        </div>
        <button class="btn-ghost" onclick="goTab('recetas')">Ver</button>
      </div>`;
  }
}

function openHomeRecipe() {
  if (homeRecipeSuggestion && typeof showRecipeModal === 'function') {
    showRecipeModal(homeRecipeSuggestion);
    return;
  }
  goTab('recetas');
}
