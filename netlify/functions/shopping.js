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
    if (b.action==='add')        { await sql`INSERT INTO shopping_list(user_id,name,quantity,category,source,reason) VALUES(${userId},${b.name},${b.quantity||null},${b.category||null},${b.source||'user'},${b.reason||null})`; }
    if (b.action==='toggle')     { await sql`UPDATE shopping_list SET done=${b.done} WHERE id=${b.id} AND user_id=${userId}`; }
    if (b.action==='delete')     { await sql`DELETE FROM shopping_list WHERE id=${b.id} AND user_id=${userId}`; }
    if (b.action==='clear_done') { await sql`DELETE FROM shopping_list WHERE user_id=${userId} AND done=TRUE`; }
    return ok({success:true});
  } catch(e) { return err(e.message,500); }
};
