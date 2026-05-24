// meals.js
import { sql, ok, err, cors, body, uid } from './_lib.js';

export const handler = async ev => {
  if (ev.httpMethod==='OPTIONS') return cors();
  const userId = uid(ev); if (!userId) return err('No autenticado',401);
  try {
    if (ev.httpMethod==='GET') {
      const items = await sql`SELECT * FROM meals_history WHERE user_id=${userId} AND cooked_at > NOW() - INTERVAL '7 days' ORDER BY cooked_at DESC`;
      return ok({items});
    }

    if (ev.httpMethod!=='POST') return err('Method not allowed',405);

    const b = body(ev);
    if (b.action==='delete') {
      await sql`DELETE FROM meals_history WHERE id=${b.id} AND user_id=${userId}`;
      return ok({success:true});
    }
    if (b.action==='clear') {
      await sql`DELETE FROM meals_history WHERE user_id=${userId}`;
      return ok({success:true});
    }

    return err('Acción no válida');
  } catch(e) { return err(e.message,500); }
};
