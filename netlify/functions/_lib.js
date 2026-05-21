import { neon } from '@neondatabase/serverless';
export const sql = neon(process.env.NETLIFY_DATABASE_URL);
export const ok  = (d,s=200) => ({ statusCode:s, headers:cors_hdrs(), body:JSON.stringify(d) });
export const err = (m,s=400) => ok({error:m},s);
export const cors_hdrs = () => ({'Content-Type':'application/json','Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'GET,POST,OPTIONS','Access-Control-Allow-Headers':'Content-Type,x-user-id'});
export const cors = () => ({ statusCode:204, headers:cors_hdrs(), body:'' });
export const body = ev => { try{return JSON.parse(ev.body||'{}')}catch{return{}} };
export const uid  = ev => { const h=ev.headers||{}; return parseInt(h['x-user-id']||h['X-User-Id']||0,10)||null };
