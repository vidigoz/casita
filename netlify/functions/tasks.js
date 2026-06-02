// tasks.js
import { sql, ok, err, cors, body, uid } from './_lib.js';
export const handler = async ev => {
  if (ev.httpMethod==='OPTIONS') return cors();
  const userId = uid(ev); if (!userId) return err('No autenticado',401);
  try {
    if (ev.httpMethod==='GET') {
      const q = ev.queryStringParameters||{};
      const f = q.filter||'all';
      let items;
      if (f==='today') {
        const today = /^\d{4}-\d{2}-\d{2}$/.test(q.date||'') ? q.date : null;
        items = today
          ? await sql`SELECT * FROM tasks WHERE user_id=${userId} AND done IS NOT TRUE AND (due_date=${today}::date OR due_date IS NULL) ORDER BY (due_date IS NOT NULL AND due_date=${today}::date) DESC, due_time NULLS LAST LIMIT 20`
          : await sql`SELECT * FROM tasks WHERE user_id=${userId} AND done IS NOT TRUE AND (due_date=CURRENT_DATE OR due_date IS NULL) ORDER BY (due_date IS NOT NULL AND due_date=CURRENT_DATE) DESC, due_time NULLS LAST LIMIT 20`;
      }
      else items = await sql`SELECT * FROM tasks WHERE user_id=${userId} ORDER BY done,due_date NULLS LAST,due_time NULLS LAST`;
      return ok({items});
    }
    const b = body(ev);
    if (b.action==='add')    { await sql`INSERT INTO tasks(user_id,title,due_date,due_time,category) VALUES(${userId},${b.title},${b.due_date||null},${b.due_time||null},${b.category||null})`; }
    if (b.action==='toggle') { await sql`UPDATE tasks SET done=${b.done} WHERE id=${b.id} AND user_id=${userId}`; }
    if (b.action==='update') { await sql`UPDATE tasks SET title=${b.title},due_date=${b.due_date||null},due_time=${b.due_time||null} WHERE id=${b.id} AND user_id=${userId}`; }
    if (b.action==='delete') { await sql`DELETE FROM tasks WHERE id=${b.id} AND user_id=${userId}`; }
    return ok({success:true});
  } catch(e) { return err(e.message,500); }
};
