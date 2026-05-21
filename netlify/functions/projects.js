import { sql, ok, err, cors, body, uid } from './_lib.js';
export const handler = async ev => {
  if (ev.httpMethod==='OPTIONS') return cors();
  const userId = uid(ev); if (!userId) return err('No autenticado',401);
  try {
    if (ev.httpMethod==='GET') {
      const items = await sql`SELECT * FROM projects WHERE user_id=${userId} AND archived=FALSE ORDER BY updated_at DESC`;
      return ok({items});
    }
    const b = body(ev);
    if (b.action==='toggle_checklist_item') {
      const r = await sql`SELECT data FROM projects WHERE id=${b.id} AND user_id=${userId}`;
      if (!r.length) return err('No encontrado',404);
      const d = r[0].data; if (!d.checked) d.checked={};
      d.checked[b.item_index] = !d.checked[b.item_index];
      await sql`UPDATE projects SET data=${JSON.stringify(d)},updated_at=NOW() WHERE id=${b.id} AND user_id=${userId}`;
      return ok({success:true,data:d});
    }
    if (b.action==='add_checklist_item') {
      const r = await sql`SELECT data FROM projects WHERE id=${b.id} AND user_id=${userId}`;
      if (!r.length) return err('No encontrado',404);
      const d = r[0].data; if (!d.items) d.items=[];
      d.items.push(b.item_text);
      await sql`UPDATE projects SET data=${JSON.stringify(d)},updated_at=NOW() WHERE id=${b.id} AND user_id=${userId}`;
      return ok({success:true,data:d});
    }
    if (b.action==='add_abono') {
      const r = await sql`SELECT data FROM projects WHERE id=${b.id} AND user_id=${userId}`;
      if (!r.length) return err('No encontrado',404);
      const d = r[0].data; if (!d.abonos) d.abonos=[];
      d.abonos.push({fecha:new Date().toISOString().split('T')[0],monto:b.abono_amount,descripcion:b.abono_desc||'Abono'});
      await sql`UPDATE projects SET data=${JSON.stringify(d)},updated_at=NOW() WHERE id=${b.id} AND user_id=${userId}`;
      return ok({success:true,data:d});
    }
    if (b.action==='archive') { await sql`UPDATE projects SET archived=TRUE WHERE id=${b.id} AND user_id=${userId}`; }
    if (b.action==='delete')  { await sql`DELETE FROM projects WHERE id=${b.id} AND user_id=${userId}`; }
    return ok({success:true});
  } catch(e) { return err(e.message,500); }
};
