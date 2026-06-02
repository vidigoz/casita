// ── UTILS ────────────────────────────────────────────────────
function esc(s) {
  return String(s||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

function fmtDate(s) {
  if (!s) return '';
  const clean = s.includes('T') ? s.split('T')[0] : s;
  const [y, m, d] = clean.split('-').map(Number);
  if (!y || !m || !d) return s;
  return `${String(d).padStart(2,'0')}/${String(m).padStart(2,'0')}/${String(y).slice(2)}`;
}

function fmtTime(s) {
  if (!s) return '';
  // accepts "HH:MM:SS", "HH:MM", or full ISO
  const t = s.includes('T') ? s.split('T')[1] : s;
  return t.slice(0,5);
}

function localDateString(date=new Date()) {
  return [
    date.getFullYear(),
    String(date.getMonth()+1).padStart(2,'0'),
    String(date.getDate()).padStart(2,'0')
  ].join('-');
}

function toast(msg) {
  document.querySelector('.toast')?.remove();
  const d=document.createElement('div');
  d.className='toast'; d.textContent=msg;
  document.body.appendChild(d);
  setTimeout(()=>d.remove(),3000);
}
