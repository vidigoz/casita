import { sql, ok, err, cors, body, uid } from './_lib.js';

async function addToShoppingIfLow(userId, item) {
  if (!['poco','agotado'].includes(item.level)) return;
  const price = await knownPrice(userId, item.name);
  await sql`
    INSERT INTO shopping_list(user_id,name,category,source,reason,estimated_price)
    VALUES(${userId},${item.name},${item.category||null},'ai_suggestion',${item.level==='agotado'?'se agotó':'queda poco'},${price})`;
}

export const handler = async ev => {
  if (ev.httpMethod==='OPTIONS') return cors();
  const userId = uid(ev); if (!userId) return err('No autenticado',401);
  try {
    await ensurePriceMemory();
    if (ev.httpMethod==='GET') {
      const items = await sql`SELECT * FROM pantry WHERE user_id=${userId} ORDER BY category,name`;
      return ok({items});
    }
    const b = body(ev);
    if (b.action==='add') {
      if (!b.name) return err('Falta el producto');
      await sql`INSERT INTO pantry(user_id,name,category,level,approx_quantity) VALUES(${userId},${b.name},${b.category||'otros'},${b.level||'suficiente'},${b.approx_quantity||null}) ON CONFLICT(user_id,name) DO UPDATE SET level=EXCLUDED.level,approx_quantity=COALESCE(EXCLUDED.approx_quantity,pantry.approx_quantity),last_updated=NOW()`;
      await addToShoppingIfLow(userId, {name:b.name, category:b.category||'otros', level:b.level||'suficiente'});
    }
    if (b.action==='update') {
      if (!b.id) return err('Falta el producto');
      const r = await sql`UPDATE pantry SET name=COALESCE(${b.name||null},name), category=COALESCE(${b.category||null},category), level=COALESCE(${b.level||null},level), approx_quantity=COALESCE(${b.approx_quantity||null},approx_quantity), last_updated=NOW() WHERE id=${b.id} AND user_id=${userId} RETURNING name,category,level`;
      if (r[0]) await addToShoppingIfLow(userId, r[0]);
    }
    if (b.action==='delete') { await sql`DELETE FROM pantry WHERE id=${b.id} AND user_id=${userId}`; }
    if (b.action==='bulk') {
      for (const it of (b.items||[])) {
        await sql`INSERT INTO pantry(user_id,name,category,level,approx_quantity) VALUES(${userId},${it.name},${it.category||'otros'},${it.level||'suficiente'},${it.approx_quantity||null}) ON CONFLICT(user_id,name) DO UPDATE SET level=EXCLUDED.level,last_updated=NOW()`;
        await addToShoppingIfLow(userId, {name:it.name, category:it.category||'otros', level:it.level||'suficiente'});
      }
    }
    return ok({success:true});
  } catch(e) { return err(e.message,500); }
};

async function ensurePriceMemory() {
  await sql`ALTER TABLE shopping_list ADD COLUMN IF NOT EXISTS estimated_price NUMERIC(10,2) DEFAULT NULL`;
  await sql`
    CREATE TABLE IF NOT EXISTS product_prices (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      product_key TEXT NOT NULL,
      product_name TEXT NOT NULL,
      last_price NUMERIC(10,2) NOT NULL,
      last_store TEXT,
      source TEXT DEFAULT 'receipt',
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(user_id, product_key)
    )`;
  await sql`CREATE INDEX IF NOT EXISTS idx_product_prices ON product_prices(user_id, product_key)`;
}

async function knownPrice(userId, name) {
  const key = productKey(name);
  if (!key) return null;
  const rows = await sql`SELECT last_price FROM product_prices WHERE user_id=${userId} AND product_key=${key} LIMIT 1`;
  return rows[0]?.last_price || null;
}

function productKey(name) {
  return String(name || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g,'')
    .replace(/[^a-z0-9]+/g,' ')
    .trim()
    .replace(/\s+/g,' ');
}
