// tasks.js
import { sql, ok, err, cors, body, uid } from './_lib.js';
export const handler = async ev => {
  if (ev.httpMethod==='OPTIONS') return cors();
  const userId = uid(ev); if (!userId) return err('No autenticado',401);
  try {
    if (ev.httpMethod==='GET') {
      const f = (ev.queryStringParameters||{}).filter||'all';
      let items;
      if (f==='today') items = await sql`SELECT * FROM tasks WHERE user_id=${userId} AND (due_date=CURRENT_DATE OR due_date IS NULL) ORDER BY done,due_time NULLS LAST LIMIT 20`;
      else items = await sql`SELECT * FROM tasks WHERE user_id=${userId} ORDER BY done,due_date NULLS LAST,due_time NULLS LAST`;
      return ok({items});
    }
    const b = body(ev);
    if (b.action==='add')    { await sql`INSERT INTO tasks(user_id,title,due_date,due_time,category) VALUES(${userId},${b.title},${b.due_date||null},${b.due_time||null},${b.category||null})`; }
    if (b.action==='toggle') { await sql`UPDATE tasks SET done=${b.done} WHERE id=${b.id} AND user_id=${userId}`; }
    if (b.action==='delete') { await sql`DELETE FROM tasks WHERE id=${b.id} AND user_id=${userId}`; }
    return ok({success:true});
  } catch(e) { return err(e.message,500); }
};
