// meals.js
import { sql, ok, err, cors, uid } from './_lib.js';
export const handler = async ev => {
  if (ev.httpMethod==='OPTIONS') return cors();
  const userId = uid(ev); if (!userId) return err('No autenticado',401);
  try {
    const items = await sql`SELECT * FROM meals_history WHERE user_id=${userId} AND cooked_at > NOW() - INTERVAL '7 days' ORDER BY cooked_at DESC`;
    return ok({items});
  } catch(e) { return err(e.message,500); }
};
