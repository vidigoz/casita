import webpush from 'web-push';
import { sql } from './_lib.js';

webpush.setVapidDetails(
  process.env.VAPID_EMAIL,
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
);

export const handler = async () => {
  try {
    await sql`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS notified BOOLEAN DEFAULT FALSE`;

    // Busca tareas que vencen en los próximos 25-45 min (ventana para correr cada 15 min)
    const tasks = await sql`
      SELECT t.id, t.user_id, t.title, t.due_date, t.due_time
      FROM tasks t
      WHERE t.done IS NOT TRUE
        AND t.notified IS NOT TRUE
        AND t.due_date = CURRENT_DATE
        AND t.due_time IS NOT NULL
        AND (t.due_date + t.due_time)::timestamptz
            BETWEEN NOW() + INTERVAL '25 minutes'
                AND NOW() + INTERVAL '45 minutes'`;

    if (!tasks.length) return { statusCode: 200, body: 'sin tareas' };

    let enviados = 0;
    const notificados = new Set();

    for (const task of tasks) {
      const subs = await sql`
        SELECT subscription FROM push_subscriptions WHERE user_id = ${task.user_id}`;

      const hora = task.due_time.slice(0, 5);
      const payload = JSON.stringify({
        title: '⏰ Casita te recuerda',
        body: `${task.title} — a las ${hora}`,
        icon: '/icons/icon-192.png',
        badge: '/icons/icon-96.png',
        data: { taskId: task.id }
      });

      for (const row of subs) {
        try {
          await webpush.sendNotification(row.subscription, payload);
          enviados++;
        } catch (e) {
          // suscripción expirada — eliminar
          if (e.statusCode === 410) {
            await sql`DELETE FROM push_subscriptions WHERE user_id=${task.user_id} AND subscription->>'endpoint'=${row.subscription.endpoint}`;
          }
        }
      }

      notificados.add(task.id);
    }

    // Marcar como notificadas
    if (notificados.size) {
      const ids = [...notificados];
      await sql`UPDATE tasks SET notified=TRUE WHERE id = ANY(${ids})`;
    }

    return { statusCode: 200, body: `enviados: ${enviados}` };
  } catch (e) {
    console.error('push-notify error:', e);
    return { statusCode: 500, body: e.message };
  }
};
