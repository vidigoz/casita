// ── RECEIPT SCAN ─────────────────────────────────────────────
async function scanReceipt(event) {
  const file = event.target.files[0];
  if (!file) return;
  document.getElementById('scan-initial').classList.add('hidden');
  document.getElementById('scan-prog').classList.remove('hidden');
  document.getElementById('scan-result').classList.add('hidden');
  try {
    const image = await prepareReceiptImage(file);
    const d   = await api('scan-receipt',{method:'POST',body:{image_base64:image.base64,mime_type:image.mimeType}});
    document.getElementById('scan-prog').classList.add('hidden');
    renderScanResult(d);
  } catch(e) {
    document.getElementById('scan-prog').classList.add('hidden');
    document.getElementById('scan-initial').classList.remove('hidden');
    toast(receiptScanErrorMessage(e));
  }
}

function renderScanResult(d) {
  const p   = d.parsed||{};
  const el  = document.getElementById('scan-result');
  el.classList.remove('hidden');
  el.innerHTML = `
    <div class="card card-green">
      <div style="font-family:var(--serif);font-style:italic;font-size:1rem;color:var(--g);margin-bottom:.25rem">✓ Ticket procesado</div>
      <div style="font-size:.85rem;color:var(--ink2)">${d.items_added} productos agregados a tu despensa.</div>
    </div>
    <div class="card">
      <div class="row" style="padding:.375rem 0 .625rem">
        <span class="row-text" style="font-weight:600">${esc(p.tienda||'Tienda')}</span>
        <span style="font-weight:600;color:var(--g)">$${(p.total||0).toFixed(2)}</span>
      </div>
      ${(p.productos||[]).map(it=>`
        <div class="row">
          <span class="row-text">${esc(it.nombre||'Producto')}</span>
          <span class="row-sub">${esc(it.cantidad||'')}</span>
          <span style="font-size:.75rem;color:var(--g);min-width:48px;text-align:right">$${(it.precio||0).toFixed(2)}</span>
        </div>`).join('')}
    </div>
    <div style="display:flex;gap:.75rem">
      <button class="btn-primary" onclick="goTab('mandado');setTimeout(()=>swMandado('despensa',document.querySelectorAll('#pg-mandado .seg-btn')[1]),100)">Ver despensa</button>
      <button class="btn-ghost" onclick="resetScan()">Escanear otro</button>
    </div>`;
}

function resetScan() {
  document.getElementById('scan-initial').classList.remove('hidden');
  document.getElementById('scan-result').classList.add('hidden');
  document.getElementById('receipt-camera-file').value='';
  document.getElementById('receipt-gallery-file').value='';
}

const RECEIPT_MAX_BYTES = 4.5 * 1024 * 1024;
const RECEIPT_MAX_DIMENSION = 2200;

async function prepareReceiptImage(file) {
  if (!file.type.startsWith('image/')) throw new Error('El archivo no es una imagen.');

  const compressed = await compressReceiptImage(file);
  if (compressed.size > RECEIPT_MAX_BYTES) {
    throw new Error('La foto sigue muy pesada. Intenta tomarla con menos zoom o mejor luz.');
  }

  return {
    base64: await toB64(compressed),
    mimeType: compressed.type || 'image/jpeg'
  };
}

async function compressReceiptImage(file) {
  const bitmap = await loadImageBitmap(file);
  let { width, height } = bitmap;
  let scale = Math.min(1, RECEIPT_MAX_DIMENSION / Math.max(width, height));
  let quality = 0.82;
  let blob = file;

  for (let i = 0; i < 10; i++) {
    blob = await renderImageBlob(bitmap, Math.round(width * scale), Math.round(height * scale), quality);
    if (blob.size <= RECEIPT_MAX_BYTES) break;

    if (quality > 0.58) {
      quality -= 0.08;
    } else {
      scale *= 0.85;
      quality = 0.74;
    }
  }

  bitmap.close?.();
  return blob;
}

function loadImageBitmap(file) {
  if ('createImageBitmap' in window) return createImageBitmap(file, { imageOrientation: 'from-image' });

  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = () => rej(new Error('No pude abrir la foto. Intenta tomarla de nuevo.'));
    img.src = URL.createObjectURL(file);
  });
}

function renderImageBlob(image, width, height, quality) {
  return new Promise((res, rej) => {
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, width);
    canvas.height = Math.max(1, height);
    const ctx = canvas.getContext('2d');
    if (!ctx) return rej(new Error('No pude preparar la foto.'));
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    canvas.toBlob(blob => {
      if (!blob) return rej(new Error('No pude comprimir la foto.'));
      res(blob);
    }, 'image/jpeg', quality);
  });
}

function receiptScanErrorMessage(error) {
  const msg = String(error?.message || '');
  if (/exceeds 5 MB maximum|imagen demasiado grande|foto.*pesada|image exceeds/i.test(msg)) {
    return 'La foto está demasiado pesada. Casita la reduce automáticamente; si vuelve a pasar, toma el ticket un poco más lejos y con buena luz.';
  }
  if (/No se pudo leer el ticket/i.test(msg)) return msg;
  if (/No autenticado/i.test(msg)) return 'Inicia sesión para escanear tickets.';
  return 'No pude leer el ticket. Intenta tomar la foto de nuevo.';
}

function toB64(file) {
  return new Promise((res,rej)=>{
    const r=new FileReader();
    r.onload=()=>res(r.result.split(',')[1]);
    r.onerror=rej;
    r.readAsDataURL(file);
  });
}

