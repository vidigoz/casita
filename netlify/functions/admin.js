import { sql, ok, err, cors } from './_lib.js';
import { timingSafeEqual } from 'node:crypto';

// Comparación segura de contraseña (evita timing attacks y diferencias de longitud)
function passOk(given) {
  const expected = process.env.CASITA_ADMIN_PASS || '';
  if (!expected) return false;
  const a = Buffer.from(String(given || ''));
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export const handler = async ev => {
  if (ev.httpMethod === 'OPTIONS') return cors();

  const h = ev.headers || {};
  const given = h['x-admin-pass'] || h['X-Admin-Pass'] || '';
  if (!passOk(given)) return err('No autorizado', 401);

  try {
    // Una fila por usuario con flags de uso por sección y conteos de actividad.
    // EXISTS = "¿usa la sección?" (no leemos contenido privado, solo presencia).
    const users = await sql`
      SELECT
        u.id, u.casita_name, u.email, u.city, u.created_at, u.last_seen,
        EXISTS(SELECT 1 FROM tasks         t WHERE t.user_id=u.id) AS usa_pendientes,
        EXISTS(SELECT 1 FROM shopping_list s WHERE s.user_id=u.id) AS usa_mandado,
        EXISTS(SELECT 1 FROM pantry        p WHERE p.user_id=u.id) AS usa_despensa,
        EXISTS(SELECT 1 FROM projects      pr WHERE pr.user_id=u.id) AS usa_proyectos,
        EXISTS(SELECT 1 FROM saved_recipes sr WHERE sr.user_id=u.id) AS usa_recetas,
        EXISTS(SELECT 1 FROM receipts      r WHERE r.user_id=u.id) AS usa_tickets,
        EXISTS(SELECT 1 FROM chat_history  c WHERE c.user_id=u.id) AS usa_chat,
        EXISTS(SELECT 1 FROM push_subscriptions s WHERE s.user_id=u.id) AS push_activo,
        (SELECT count(*)::int FROM chat_history  c WHERE c.user_id=u.id) AS msgs_chat,
        (SELECT count(*)::int FROM tasks         t WHERE t.user_id=u.id) AS n_pendientes,
        (SELECT count(*)::int FROM shopping_list s WHERE s.user_id=u.id) AS n_mandado,
        (SELECT count(*)::int FROM pantry        p WHERE p.user_id=u.id) AS n_despensa,
        (SELECT count(*)::int FROM projects      pr WHERE pr.user_id=u.id) AS n_proyectos
      FROM users u
      ORDER BY u.last_seen DESC NULLS LAST, u.id`;

    // Agregar nivel de adopción (secciones usadas / 7) por usuario
    const SECCIONES = ['usa_pendientes','usa_mandado','usa_despensa','usa_proyectos','usa_recetas','usa_tickets','usa_chat'];
    const usuarios = users.map(u => ({
      ...u,
      secciones_usadas: SECCIONES.reduce((n, k) => n + (u[k] ? 1 : 0), 0),
      secciones_total: SECCIONES.length
    }));

    // Métricas globales
    const totalUsuarios = usuarios.length;
    const activos7d  = usuarios.filter(u => u.last_seen && (Date.now() - new Date(u.last_seen)) < 7  * 864e5).length;
    const activos30d = usuarios.filter(u => u.last_seen && (Date.now() - new Date(u.last_seen)) < 30 * 864e5).length;
    const fantasmas  = usuarios.filter(u => u.secciones_usadas === 0).length;
    const conPush    = usuarios.filter(u => u.push_activo).length;

    // Sección más / menos usada
    const conteoSecciones = SECCIONES.map(k => ({
      seccion: k.replace('usa_', ''),
      usuarios: usuarios.filter(u => u[k]).length
    })).sort((a, b) => b.usuarios - a.usuarios);

    // Totales de actividad (volumen global)
    const totales = {
      mensajes_chat: usuarios.reduce((n, u) => n + u.msgs_chat, 0),
      pendientes:    usuarios.reduce((n, u) => n + u.n_pendientes, 0),
      mandado:       usuarios.reduce((n, u) => n + u.n_mandado, 0),
      despensa:      usuarios.reduce((n, u) => n + u.n_despensa, 0),
      proyectos:     usuarios.reduce((n, u) => n + u.n_proyectos, 0)
    };

    return ok({
      generado: new Date().toISOString(),
      global: {
        total_usuarios: totalUsuarios,
        activos_7d: activos7d,
        activos_30d: activos30d,
        fantasmas,
        con_push: conPush,
        seccion_mas_usada: conteoSecciones[0],
        seccion_menos_usada: conteoSecciones[conteoSecciones.length - 1],
        conteo_secciones: conteoSecciones,
        totales
      },
      usuarios
    });
  } catch (e) {
    console.error('admin error:', e);
    return err('Error generando estadísticas: ' + e.message, 500);
  }
};
