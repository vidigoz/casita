import { sql, ok, err, cors, body, uid } from './_lib.js';

export const handler = async ev => {
  if (ev.httpMethod==='OPTIONS') return cors();
  const userId = uid(ev); if (!userId) return err('No autenticado',401);

  try {
    if (ev.httpMethod==='GET') {
      const items = await sql`SELECT id,type,key,value,confidence,source,updated_at FROM user_memory WHERE user_id=${userId} ORDER BY type,key`;
      return ok({items});
    }

    const b = body(ev);
    if (b.action==='upsert') {
      if (!b.type || !b.key || !b.value) return err('Faltan datos');
      const r = await sql`
        INSERT INTO user_memory(user_id,type,key,value,confidence,source)
        VALUES(${userId},${b.type},${b.key},${b.value},${b.confidence||0.8},${b.source||'manual'})
        ON CONFLICT(user_id,type,key) DO UPDATE SET
          value=EXCLUDED.value,
          confidence=EXCLUDED.confidence,
          source=EXCLUDED.source,
          updated_at=NOW()
        RETURNING id,type,key,value,confidence,source,updated_at`;
      return ok({item:r[0]});
    }

    if (b.action==='delete') {
      if (!b.id) return err('Falta memoria');
      await sql`DELETE FROM user_memory WHERE id=${b.id} AND user_id=${userId}`;
      return ok({success:true});
    }

    return err('Acción desconocida');
  } catch(e) { return err(e.message,500); }
};
