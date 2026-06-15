import { sql, ok, err, cors, body, uid } from './_lib.js';

async function ensureTable() {
  await sql`
    CREATE TABLE IF NOT EXISTS push_subscriptions (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      endpoint TEXT NOT NULL,
      subscription JSONB NOT NULL,
      timezone TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`;
  await sql`ALTER TABLE push_subscriptions ADD COLUMN IF NOT EXISTS timezone TEXT`;
  // Índice único por expresión va aparte (no se permite dentro de CREATE TABLE)
  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS push_subscriptions_user_endpoint
    ON push_subscriptions (user_id, md5(endpoint))`;
}

export const handler = async ev => {
  if (ev.httpMethod === 'OPTIONS') return cors();
  if (ev.httpMethod !== 'POST') return err('Method not allowed', 405);

  const userId = uid(ev);
  if (!userId) return err('No autenticado', 401);

  const { subscription, action, tz } = body(ev);
  if (!subscription?.endpoint) return err('Suscripción inválida', 400);
  const endpoint = subscription.endpoint;
  const timezone = (typeof tz === 'string' && tz.trim()) ? tz.trim() : 'America/Mexico_City';

  try {
    await ensureTable();

    if (action === 'unsubscribe') {
      await sql`
        DELETE FROM push_subscriptions
        WHERE user_id = ${userId} AND endpoint = ${endpoint}`;
      return ok({ ok: true });
    }

    await sql`
      INSERT INTO push_subscriptions(user_id, endpoint, subscription, timezone)
      VALUES(${userId}, ${endpoint}, ${JSON.stringify(subscription)}, ${timezone})
      ON CONFLICT(user_id, md5(endpoint))
      DO UPDATE SET subscription = EXCLUDED.subscription, endpoint = EXCLUDED.endpoint, timezone = EXCLUDED.timezone`;

    return ok({ ok: true });
  } catch (e) {
    console.error('push-subscribe error:', e);
    return err('Error guardando suscripción: ' + e.message, 500);
  }
};
