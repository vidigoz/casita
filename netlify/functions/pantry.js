import { sql, ok, err, cors, body, uid } from './_lib.js';
export const handler = async ev => {
  if (ev.httpMethod==='OPTIONS') return cors();
  const userId = uid(ev); if (!userId) return err('No autenticado',401);
  try {
    if (ev.httpMethod==='GET') {
      const items = await sql`SELECT * FROM pantry WHERE user_id=${userId} ORDER BY category,name`;
      return ok({items});
    }
    const b = body(ev);
    if (b.action==='add') {
      if (!b.name) return err('Falta el producto');
      await sql`INSERT INTO pantry(user_id,name,category,level,approx_quantity) VALUES(${userId},${b.name},${b.category||'otros'},${b.level||'suficiente'},${b.approx_quantity||null}) ON CONFLICT(user_id,name) DO UPDATE SET level=EXCLUDED.level,approx_quantity=COALESCE(EXCLUDED.approx_quantity,pantry.approx_quantity),last_updated=NOW()`;
    }
    if (b.action==='update') {
      if (!b.id) return err('Falta el producto');
      await sql`UPDATE pantry SET name=COALESCE(${b.name||null},name), category=COALESCE(${b.category||null},category), level=COALESCE(${b.level||null},level), approx_quantity=COALESCE(${b.approx_quantity||null},approx_quantity), last_updated=NOW() WHERE id=${b.id} AND user_id=${userId}`;
    }
    if (b.action==='delete') { await sql`DELETE FROM pantry WHERE id=${b.id} AND user_id=${userId}`; }
    if (b.action==='bulk') {
      for (const it of (b.items||[])) {
        await sql`INSERT INTO pantry(user_id,name,category,level,approx_quantity) VALUES(${userId},${it.name},${it.category||'otros'},${it.level||'suficiente'},${it.approx_quantity||null}) ON CONFLICT(user_id,name) DO UPDATE SET level=EXCLUDED.level,last_updated=NOW()`;
      }
    }
    return ok({success:true});
  } catch(e) { return err(e.message,500); }
};
