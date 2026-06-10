import { sql, ok, err, cors, body, uid } from './_lib.js';

async function migrateProjectTypes() {
  await sql`ALTER TABLE projects DROP CONSTRAINT IF EXISTS projects_type_check`;
  await sql`ALTER TABLE projects ADD CONSTRAINT projects_type_check CHECK (type IN ('checklist','tracker_dinero','presupuesto_lista','rutina_hogar','gastos_hogar'))`;
}

async function getProject(id, userId) {
  const r = await sql`SELECT data FROM projects WHERE id=${id} AND user_id=${userId}`;
  if (!r.length) return null;
  return r[0].data;
}

async function saveProject(id, userId, d) {
  await sql`UPDATE projects SET data=${JSON.stringify(d)},updated_at=NOW() WHERE id=${id} AND user_id=${userId}`;
}

export const handler = async ev => {
  if (ev.httpMethod==='OPTIONS') return cors();
  const userId = uid(ev); if (!userId) return err('No autenticado',401);
  try {
    if (ev.httpMethod==='GET') {
      await migrateProjectTypes();
      const items = await sql`SELECT * FROM projects WHERE user_id=${userId} AND archived=FALSE ORDER BY updated_at DESC`;
      return ok({items});
    }

    const b = body(ev);
    const id = b.id;

    // ── CHECKLIST ──────────────────────────────────────────
    if (b.action==='toggle_checklist_item') {
      const d = await getProject(id, userId); if (!d) return err('No encontrado',404);
      if (!d.checked) d.checked={};
      d.checked[b.item_index] = !d.checked[b.item_index];
      await saveProject(id, userId, d);
      return ok({success:true,data:d});
    }
    if (b.action==='add_checklist_item') {
      const d = await getProject(id, userId); if (!d) return err('No encontrado',404);
      if (!d.items) d.items=[];
      d.items.push(b.item_text);
      await saveProject(id, userId, d);
      return ok({success:true,data:d});
    }
    if (b.action==='edit_checklist_item') {
      const d = await getProject(id, userId); if (!d) return err('No encontrado',404);
      if (d.items && d.items[b.item_index] !== undefined) d.items[b.item_index] = b.item_text;
      await saveProject(id, userId, d);
      return ok({success:true,data:d});
    }
    if (b.action==='delete_checklist_item') {
      const d = await getProject(id, userId); if (!d) return err('No encontrado',404);
      if (!d.items) d.items=[];
      d.items.splice(b.item_index, 1);
      // rebuild checked map after splice
      const newChecked = {};
      Object.entries(d.checked||{}).forEach(([k,v]) => {
        const ki = parseInt(k);
        if (ki < b.item_index) newChecked[ki] = v;
        else if (ki > b.item_index) newChecked[ki-1] = v;
      });
      d.checked = newChecked;
      await saveProject(id, userId, d);
      return ok({success:true,data:d});
    }

    // ── TRACKER DINERO (abonos) ────────────────────────────
    if (b.action==='add_abono') {
      const d = await getProject(id, userId); if (!d) return err('No encontrado',404);
      if (!d.abonos) d.abonos=[];
      d.abonos.push({id:Date.now(),fecha:new Date().toISOString().split('T')[0],monto:b.abono_amount,descripcion:b.abono_desc||'Abono'});
      await saveProject(id, userId, d);
      return ok({success:true,data:d});
    }
    if (b.action==='edit_abono') {
      const d = await getProject(id, userId); if (!d) return err('No encontrado',404);
      const idx = (d.abonos||[]).findIndex(a=>a.id===b.abono_id);
      if (idx>=0) {
        if (b.descripcion !== undefined) d.abonos[idx].descripcion = b.descripcion;
        if (b.monto !== undefined) d.abonos[idx].monto = b.monto;
      }
      await saveProject(id, userId, d);
      return ok({success:true,data:d});
    }
    if (b.action==='delete_abono') {
      const d = await getProject(id, userId); if (!d) return err('No encontrado',404);
      d.abonos = (d.abonos||[]).filter(a=>a.id!==b.abono_id);
      await saveProject(id, userId, d);
      return ok({success:true,data:d});
    }

    // ── PRESUPUESTO CON LISTA ──────────────────────────────
    if (b.action==='add_presupuesto_item') {
      const d = await getProject(id, userId); if (!d) return err('No encontrado',404);
      if (!d.items) d.items=[];
      d.items.push({id:Date.now(),texto:b.texto,precio:b.precio||0,pagado:false});
      await saveProject(id, userId, d);
      return ok({success:true,data:d});
    }
    if (b.action==='toggle_presupuesto_item') {
      const d = await getProject(id, userId); if (!d) return err('No encontrado',404);
      const item = (d.items||[]).find(x=>x.id===b.item_id);
      if (item) item.pagado = !item.pagado;
      await saveProject(id, userId, d);
      return ok({success:true,data:d});
    }
    if (b.action==='edit_presupuesto_item') {
      const d = await getProject(id, userId); if (!d) return err('No encontrado',404);
      const item = (d.items||[]).find(x=>x.id===b.item_id);
      if (item) {
        if (b.texto !== undefined) item.texto = b.texto;
        if (b.precio !== undefined) item.precio = b.precio;
      }
      await saveProject(id, userId, d);
      return ok({success:true,data:d});
    }
    if (b.action==='delete_presupuesto_item') {
      const d = await getProject(id, userId); if (!d) return err('No encontrado',404);
      d.items = (d.items||[]).filter(x=>x.id!==b.item_id);
      await saveProject(id, userId, d);
      return ok({success:true,data:d});
    }

    // ── RUTINA DEL HOGAR ───────────────────────────────────
    if (b.action==='add_rutina_tarea') {
      const d = await getProject(id, userId); if (!d) return err('No encontrado',404);
      if (!d.tareas) d.tareas=[];
      d.tareas.push({id:Date.now(),texto:b.texto,frecuencia:b.frecuencia||'semanal',hecha:false,ultima:null});
      await saveProject(id, userId, d);
      return ok({success:true,data:d});
    }
    if (b.action==='toggle_rutina_tarea') {
      const d = await getProject(id, userId); if (!d) return err('No encontrado',404);
      const t = (d.tareas||[]).find(x=>x.id===b.tarea_id);
      if (t) { t.hecha = !t.hecha; if (t.hecha) t.ultima = new Date().toISOString().split('T')[0]; }
      await saveProject(id, userId, d);
      return ok({success:true,data:d});
    }
    if (b.action==='edit_rutina_tarea') {
      const d = await getProject(id, userId); if (!d) return err('No encontrado',404);
      const t = (d.tareas||[]).find(x=>x.id===b.tarea_id);
      if (t) {
        if (b.texto !== undefined) t.texto = b.texto;
        if (b.frecuencia !== undefined) t.frecuencia = b.frecuencia;
      }
      await saveProject(id, userId, d);
      return ok({success:true,data:d});
    }
    if (b.action==='delete_rutina_tarea') {
      const d = await getProject(id, userId); if (!d) return err('No encontrado',404);
      d.tareas = (d.tareas||[]).filter(x=>x.id!==b.tarea_id);
      await saveProject(id, userId, d);
      return ok({success:true,data:d});
    }

    // ── GASTOS DEL HOGAR ───────────────────────────────────
    if (b.action==='add_gasto') {
      const d = await getProject(id, userId); if (!d) return err('No encontrado',404);
      if (!d.gastos) d.gastos=[];
      d.gastos.push({id:Date.now(),fecha:new Date().toISOString().split('T')[0],descripcion:b.descripcion,categoria:b.categoria||'otros',monto:b.monto||0});
      await saveProject(id, userId, d);
      return ok({success:true,data:d});
    }
    if (b.action==='edit_gasto') {
      const d = await getProject(id, userId); if (!d) return err('No encontrado',404);
      const g = (d.gastos||[]).find(x=>x.id===b.gasto_id);
      if (g) {
        if (b.descripcion !== undefined) g.descripcion = b.descripcion;
        if (b.monto !== undefined) g.monto = b.monto;
        if (b.categoria !== undefined) g.categoria = b.categoria;
      }
      await saveProject(id, userId, d);
      return ok({success:true,data:d});
    }
    if (b.action==='delete_gasto') {
      const d = await getProject(id, userId); if (!d) return err('No encontrado',404);
      d.gastos = (d.gastos||[]).filter(x=>x.id!==b.gasto_id);
      await saveProject(id, userId, d);
      return ok({success:true,data:d});
    }

    // ── GENERALES ─────────────────────────────────────────
    if (b.action==='rename') {
      const newTitle = (b.title||'').trim();
      if (!newTitle) return err('Título requerido',400);
      await sql`UPDATE projects SET title=${newTitle},updated_at=NOW() WHERE id=${id} AND user_id=${userId}`;
      return ok({success:true});
    }
    if (b.action==='archive') { await sql`UPDATE projects SET archived=TRUE WHERE id=${id} AND user_id=${userId}`; }
    if (b.action==='delete')  { await sql`DELETE FROM projects WHERE id=${id} AND user_id=${userId}`; }
    return ok({success:true});
  } catch(e) { return err(e.message,500); }
};
