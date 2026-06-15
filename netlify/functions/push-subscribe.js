import { sql, ok, err, cors, body, uid } from './_lib.js';

export const handler = async ev => {
  if (ev.httpMethod === 'OPTIONS') return cors();
  if (ev.httpMethod !== 'POST') return err('Method not allowed', 405);

  const userId = uid(ev);
  if (!userId) return err('No autenticado', 401);

  await sql`
    CREATE TABLE IF NOT EXISTS push_subscriptions (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      subscription JSONB NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(user_id, (subscription->>'endpoint'))
    )`;

  const { subscription, action } = body(ev);

  if (action === 'unsubscribe') {
    if (!subscription?.endpoint) return err('Suscripción inválida', 400);
    await sql`
      DELETE FROM push_subscriptions
      WHERE user_id = ${userId} AND subscription->>'endpoint' = ${subscription.endpoint}`;
    return ok({ ok: true });
  }

  if (!subscription?.endpoint) return err('Suscripción inválida', 400);

  await sql`
    INSERT INTO push_subscriptions(user_id, subscription)
    VALUES(${userId}, ${JSON.stringify(subscription)})
    ON CONFLICT(user_id, (subscription->>'endpoint'))
    DO UPDATE SET subscription = EXCLUDED.subscription`;

  return ok({ ok: true });
};
