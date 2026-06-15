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

    // Avisar a partir de 30 min antes: cualquier tarea que venza dentro de los próximos
    // 30 min y que aún no se haya avisado. Como marcamos notified=TRUE tras enviar, no se
    // duplica. Esto garantiza que el aviso SIEMPRE llegue (entre 0 y 30 min antes) sin
    // perderse en bordes del cron. El vencimiento se calcula en la zona horaria de cada
    // suscripción (AT TIME ZONE), no en UTC, para que funcione en cualquier zona.
    const rows = await sql`
      SELECT t.id AS task_id, t.user_id, t.title, t.due_time, s.subscription
      FROM tasks t
      JOIN push_subscriptions s ON s.user_id = t.user_id
      WHERE t.done IS NOT TRUE
        AND t.notified IS NOT TRUE
        AND t.due_time IS NOT NULL
        AND t.due_date >= CURRENT_DATE - 1
        AND ((t.due_date + t.due_time) AT TIME ZONE COALESCE(s.timezone, 'America/Mexico_City'))
            BETWEEN NOW() AND NOW() + INTERVAL '30 minutes'`;

    if (!rows.length) return { statusCode: 200, body: 'sin tareas' };

    let enviados = 0;
    const notificados = new Set();

    for (const row of rows) {
      const hora = row.due_time.slice(0, 5);
      const payload = JSON.stringify({
        title: '⏰ Casita te recuerda',
        body: `${row.title} — a las ${hora}`,
        icon: '/icons/icon-192.png',
        badge: '/icons/icon-192.png',
        data: { taskId: row.task_id }
      });

      try {
        await webpush.sendNotification(row.subscription, payload);
        enviados++;
        notificados.add(row.task_id);
      } catch (e) {
        // suscripción expirada — eliminar
        if (e.statusCode === 410) {
          await sql`DELETE FROM push_subscriptions WHERE user_id=${row.user_id} AND subscription->>'endpoint'=${row.subscription.endpoint}`;
        }
      }
    }

    // Marcar como notificadas (solo las que sí se enviaron a algún dispositivo)
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
