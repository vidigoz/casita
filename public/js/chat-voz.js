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

