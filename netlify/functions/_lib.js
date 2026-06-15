import { neon } from '@neondatabase/serverless';
export const sql = neon(process.env.DATABASE_URL);
export const ok  = (d,s=200) => ({ statusCode:s, headers:cors_hdrs(), body:JSON.stringify(d) });
export const err = (m,s=400) => ok({error:m},s);
export const cors_hdrs = () => ({'Content-Type':'application/json','Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'GET,POST,OPTIONS','Access-Control-Allow-Headers':'Content-Type,x-user-id'});
export const cors = () => ({ statusCode:204, headers:cors_hdrs(), body:'' });
export const body = ev => { try{return JSON.parse(ev.body||'{}')}catch{return{}} };
export const uid  = ev => { const h=ev.headers||{}; return parseInt(h['x-user-id']||h['X-User-Id']||0,10)||null };

// Marca actividad del usuario (last_seen). Throttled a 5 min para no escribir en cada request.
// Fire-and-forget: no se hace await para no retrasar la respuesta.
export const touch = userId => {
  if (!userId) return;
  sql`UPDATE users SET last_seen=NOW() WHERE id=${userId} AND (last_seen IS NULL OR last_seen < NOW() - INTERVAL '5 minutes')`
    .catch(() => {});
};

// Como uid(ev) pero además registra actividad. Usar en endpoints que el app llama al arrancar.
export const authUid = ev => { const id = uid(ev); touch(id); return id; };
