import { sql, ok, err, cors, body, uid } from './_lib.js';
export const handler = async ev => {
  if (ev.httpMethod==='OPTIONS') return cors();
  const userId = uid(ev); if (!userId) return err('No autenticado',401);
  try {
    if (ev.httpMethod==='GET') {
      const items = await sql`SELECT * FROM shopping_list WHERE user_id=${userId} ORDER BY done,source,added_at DESC`;
      return ok({items});
    }
    const b = body(ev);
    if (b.action==='add')        { await sql`INSERT INTO shopping_list(user_id,name,quantity,category,source,reason,store_group) VALUES(${userId},${b.name},${b.quantity||null},${b.category||null},${b.source||'user'},${b.reason||null},${b.store_group||null})`; }
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
      if (name)     await sql`UPDATE shopping_list SET name=${name} WHERE id=${b.id} AND user_id=${userId}`;
      if (category) await sql`UPDATE shopping_list SET category=${category} WHERE id=${b.id} AND user_id=${userId}`;
      if (hasStore) await sql`UPDATE shopping_list SET store_group=${store_group} WHERE id=${b.id} AND user_id=${userId}`;
    }
    return ok({success:true});
  } catch(e) { return err(e.message,500); }
};
