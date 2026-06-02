// ── SETTINGS ─────────────────────────────────────────────────
let profileEditMode = true;

function loadSettings() {
  syncProfileFieldsFromUser();
  setProfileEditMode(!profileDataComplete());
  syncThemePicker();
  loadMemory();
  renderAccountSection();
  document.getElementById('app-version').textContent = `Casita ${APP_VERSION}`;
  renderPushStatus();
}

function syncProfileFieldsFromUser() {
  document.getElementById('s-name').value = USER.casita_name || '';
  document.getElementById('s-household').value = USER.household_size || 4;
  document.getElementById('s-city').value = USER.city || 'CDMX';
}

function profileDataComplete() {
  return Boolean(
    !USER?.guest &&
    USER?.email &&
    USER?.casita_name &&
    Number(USER?.household_size) > 0 &&
    USER?.city
  );
}

function setProfileEditMode(editing) {
  profileEditMode = editing;
  const locked = !editing && profileDataComplete();
  ['s-name','s-household','s-city'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.disabled = locked;
  });
  const btn = document.getElementById('profile-save-btn');
  if (btn) btn.textContent = locked ? 'Editar datos' : 'Guardar cambios';
}

function handleProfileButton() {
  if (!profileEditMode && profileDataComplete()) {
    setProfileEditMode(true);
    document.getElementById('s-name')?.focus();
    return;
  }
  saveProfile();
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

  if (!name) { toast('Pon un nombre'); document.getElementById('s-name').focus(); return; }
  if (!Number.isFinite(household) || household < 1) { toast('Pon cuántas personas viven contigo'); document.getElementById('s-household').focus(); return; }
  if (!city) { toast('Pon tu ciudad'); document.getElementById('s-city').focus(); return; }

  if (USER.guest) {
    USER = { ...USER, casita_name: name || 'Casita', household_size: household, city };
    S.s('user', USER);
    setGreeting();
    setProfileEditMode(true);
    toast('Guardado ✓');
    return;
  }
  try {
    const d = await api('auth', { method:'POST', body:{ action:'update_profile', email: USER.email, casita_name: name, household_size: household, city } });
    USER = { ...USER, ...d.user };
    S.s('user', USER);
    syncProfileFieldsFromUser();
    setProfileEditMode(!profileDataComplete());
    setGreeting();
    toast('Guardado ✓');
  } catch(e) { toast(e.message); }
}
