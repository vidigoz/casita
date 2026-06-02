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

