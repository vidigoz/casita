// ── CHAT ─────────────────────────────────────────────────────
function iniciarProyectoDesdeChat(mensaje) {
  goTab('chat', {focus: false});
  const inp = document.getElementById('chat-input');
  inp.value = mensaje;
  setTimeout(() => sendMsg(), 120);
}

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

// ── MINI CHAT (FAB inline panel) ─────────────────────────────
let miniChatOpen = false;
let miniListening = false;
let miniVoice = null;
let miniSilenceTimer = null;

function currentSection() {
  return document.querySelector('.nav-btn.on')?.dataset.t || '';
}

const SECTION_LABELS = {
  pendientes: 'pendientes',
  mandado: 'lista de mandado',
  despensa: 'despensa',
  recetas: 'recetas',
  proyectos: 'proyectos',
  tickets: 'tickets',
  ajustes: null
};

function toggleMiniChat() {
  if (miniChatOpen) closeMiniChat();
  else openMiniChat();
}

function openMiniChat() {
  if (USER.guest) { toast('Crea una cuenta en Ajustes para usar el chat'); return; }
  miniChatOpen = true;
  const panel = document.getElementById('mini-chat');
  panel.classList.remove('hidden');
  requestAnimationFrame(() => panel.classList.add('visible'));
  const fab = document.getElementById('fab');
  if (fab) { fab.classList.add('open'); }
  document.getElementById('fab-mic-icon')?.style.setProperty('display','none');
  document.getElementById('fab-close-icon')?.style.setProperty('display','');
  document.getElementById('big-mic-btn')?.classList.add('open');
  document.getElementById('big-mic-icon')?.style.setProperty('display','none');
  document.getElementById('big-mic-close-icon')?.style.setProperty('display','');
  miniChatReset();
  miniStartVoice();
}

function closeMiniChat() {
  miniChatOpen = false;
  miniStopVoice();
  const panel = document.getElementById('mini-chat');
  panel.classList.remove('visible');
  setTimeout(() => panel.classList.add('hidden'), 200);
  const fab = document.getElementById('fab');
  if (fab) { fab.classList.remove('open', 'listening'); }
  document.getElementById('fab-mic-icon')?.style.setProperty('display','');
  document.getElementById('fab-close-icon')?.style.setProperty('display','none');
  document.getElementById('big-mic-btn')?.classList.remove('open');
  document.getElementById('big-mic-icon')?.style.setProperty('display','');
  document.getElementById('big-mic-close-icon')?.style.setProperty('display','none');
}

function miniChatReset() {
  const sec = currentSection();
  const label = SECTION_LABELS[sec];
  document.getElementById('mini-chat-label').textContent =
    label ? `Escuchando (${label})…` : 'Escuchando…';
  document.getElementById('mini-chat-transcript').textContent = '';
  document.getElementById('mini-chat-transcript').className = 'mini-chat-transcript';
  document.getElementById('mini-chat-reply').textContent = '';
  document.getElementById('mini-chat-reply').classList.add('hidden');
  document.getElementById('mini-chat-input').value = '';
  miniSetDot('listening');
}

function miniSetDot(state) {
  const dot = document.querySelector('.mini-chat-dot');
  dot.className = 'mini-chat-dot' + (state === 'idle' ? ' idle' : state === 'thinking' ? ' thinking' : '');
  const label = document.getElementById('mini-chat-label');
  const sec = currentSection();
  const secLabel = SECTION_LABELS[sec];
  if (state === 'listening') label.textContent = secLabel ? `Escuchando (${secLabel})…` : 'Escuchando…';
  if (state === 'thinking')  label.textContent = 'Casita está pensando…';
  if (state === 'idle')      label.textContent = 'Listo';
}

function miniSetListening(on) {
  miniListening = on;
  document.getElementById('mini-mic-btn')?.classList.toggle('listening', on);
  document.getElementById('fab')?.classList.toggle('listening', on);
  if (on) miniSetDot('listening');
}

function miniStartVoice() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) { miniSetDot('idle'); return; }
  if (miniVoice) { try { miniVoice.abort(); } catch {} }
  miniVoice = new SR();
  miniVoice.lang = 'es-MX';
  miniVoice.continuous = false;
  miniVoice.interimResults = true;

  miniVoice.onstart = () => miniSetListening(true);
  miniVoice.onaudiostart = () => miniSetListening(true);

  miniVoice.onresult = e => {
    if (miniSilenceTimer) clearTimeout(miniSilenceTimer);
    let finalText = '', interimText = '';
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const t = e.results[i][0].transcript;
      if (e.results[i].isFinal) finalText += t;
      else interimText += t;
    }
    const tx = document.getElementById('mini-chat-transcript');
    if (interimText) { tx.textContent = interimText.trim(); tx.className = 'mini-chat-transcript interim'; }
    if (finalText.trim()) {
      tx.textContent = finalText.trim(); tx.className = 'mini-chat-transcript';
      miniChatSendText(finalText.trim());
    }
  };

  miniVoice.onerror = e => {
    miniSetListening(false);
    if (e.error !== 'aborted' && e.error !== 'no-speech') {
      toast(voiceErrorMessage(e.error));
    }
    if (e.error === 'no-speech') miniSetDot('idle');
  };

  miniVoice.onend = () => miniSetListening(false);

  try {
    miniVoice.start();
    miniSilenceTimer = setTimeout(() => {
      if (miniListening) { miniStopVoice(); miniSetDot('idle'); }
    }, 12000);
  } catch { miniSetDot('idle'); }
}

function miniStopVoice() {
  if (miniSilenceTimer) { clearTimeout(miniSilenceTimer); miniSilenceTimer = null; }
  if (miniVoice) { try { miniVoice.abort(); } catch {} miniVoice = null; }
  miniSetListening(false);
}

function miniChatToggleMic() {
  if (miniListening) miniStopVoice();
  else miniStartVoice();
}

function miniChatSend() {
  const inp = document.getElementById('mini-chat-input');
  const text = inp.value.trim();
  if (!text) return;
  inp.value = '';
  document.getElementById('mini-chat-transcript').textContent = text;
  document.getElementById('mini-chat-transcript').className = 'mini-chat-transcript';
  miniChatSendText(text);
}

async function miniChatSendText(text) {
  miniStopVoice();
  miniSetDot('thinking');
  const replyEl = document.getElementById('mini-chat-reply');
  replyEl.classList.add('hidden');
  replyEl.textContent = '';

  const sec = currentSection();
  const secLabel = SECTION_LABELS[sec];
  const contextMsg = secLabel
    ? `[El usuario está en la sección ${secLabel}. Solo actúa en esa sección a menos que pida explícitamente otra cosa.] ${text}`
    : text;

  try {
    const d = await api('chat', { method: 'POST', body: { message: contextMsg, history: [] } });
    replyEl.textContent = d.reply || '…';
    replyEl.classList.remove('hidden');
    miniSetDot('idle');
    refreshCurrentTab();
    setTimeout(() => { if (miniChatOpen) miniStartVoice(); }, 1200);
  } catch (e) {
    replyEl.textContent = '⚠ ' + e.message;
    replyEl.classList.remove('hidden');
    miniSetDot('idle');
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

