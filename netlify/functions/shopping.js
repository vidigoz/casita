import { sql, ok, err, cors, body, uid } from './_lib.js';
export const handler = async ev => {
  if (ev.httpMethod==='OPTIONS') return cors();
  const userId = uid(ev); if (!userId) return err('No autenticado',401);
  try {
    await ensurePriceMemory();
    if (ev.httpMethod==='GET') {
      const items = await sql`SELECT * FROM shopping_list WHERE user_id=${userId} ORDER BY done,source,added_at DESC`;
      return ok({items});
    }
    const b = body(ev);
    if (b.action==='add') {
      const price = hasPrice(b) ? cleanPrice(priceInput(b)) : await knownPrice(userId, b.name);
      await sql`INSERT INTO shopping_list(user_id,name,quantity,category,source,reason,store_group,estimated_price) VALUES(${userId},${b.name},${b.quantity||null},${b.category||null},${b.source||'user'},${b.reason||null},${b.store_group||null},${price})`;
    }
    if (b.action==='toggle')     { await sql`UPDATE shopping_list SET done=${b.done} WHERE id=${b.id} AND user_id=${userId}`; }
    if (b.action==='delete')     { await sql`DELETE FROM shopping_list WHERE id=${b.id} AND user_id=${userId}`; }
    if (b.action==='clear_done') { await sql`DELETE FROM shopping_list WHERE user_id=${userId} AND done=TRUE`; }
    if (b.action==='set_group')  { await sql`UPDATE shopping_list SET store_group=${b.store_group||null} WHERE id=${b.id} AND user_id=${userId}`; }
    if (b.action==='update') {
      if (!b.id) return err('Falta el id');
      const name = b.name?.trim() || null;
      const category = b.category || null;
      const hasStore = 'store_group' in b;
      const store_group = hasStore ? (b.store_group || null) : undefined;
      const price = hasPrice(b) ? cleanPrice(priceInput(b)) : undefined;
      if (name)     await sql`UPDATE shopping_list SET name=${name} WHERE id=${b.id} AND user_id=${userId}`;
      if (category) await sql`UPDATE shopping_list SET category=${category} WHERE id=${b.id} AND user_id=${userId}`;
      if (hasStore) await sql`UPDATE shopping_list SET store_group=${store_group} WHERE id=${b.id} AND user_id=${userId}`;
      if ('estimated_price' in b) await sql`UPDATE shopping_list SET estimated_price=${price} WHERE id=${b.id} AND user_id=${userId}`;
      if (name && price) await rememberPrice(userId, name, price, store_group);
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

async function rememberPrice(userId, name, price, store) {
  const key = productKey(name);
  if (!key || !price) return;
  await sql`
    INSERT INTO product_prices(user_id,product_key,product_name,last_price,last_store,source)
    VALUES(${userId},${key},${name},${price},${store||null},'manual')
    ON CONFLICT(user_id, product_key)
    DO UPDATE SET
      product_name=EXCLUDED.product_name,
      last_price=EXCLUDED.last_price,
      last_store=COALESCE(EXCLUDED.last_store,product_prices.last_store),
      source='manual',
      updated_at=NOW()`;
}

function hasPrice(body) {
  return 'estimated_price' in body || 'price' in body;
}

function priceInput(body) {
  return 'estimated_price' in body ? body.estimated_price : body.price;
}

function cleanPrice(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
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
