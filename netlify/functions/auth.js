import { sql, ok, err, cors, body } from './_lib.js';
export const handler = async ev => {
  if (ev.httpMethod==='OPTIONS') return cors();
  const b = body(ev);
  try {
    if (b.action==='register') {
      const email = (b.email||'').toLowerCase().trim();
      if (!email||!email.includes('@')) return err('Email inválido');
      if (!b.casita_name) return err('Falta el nombre');
      const ex = await sql`SELECT id FROM users WHERE email=${email}`;
      if (ex.length) return err('Ese correo ya tiene cuenta. Inicia sesión.');
      const r = await sql`INSERT INTO users(email,casita_name,household_size,city) VALUES(${email},${b.casita_name},${b.household_size||4},${b.city||'CDMX'}) RETURNING id,email,casita_name,household_size,city`;
      return ok({user:r[0]});
    }
    if (b.action==='login') {
      const email = (b.email||'').toLowerCase().trim();
      if (!email||!email.includes('@')) return err('Email inválido');
      const r = await sql`UPDATE users SET created_at=created_at WHERE email=${email} RETURNING id,email,casita_name,household_size,city`;
      if (!r.length) return err('No existe cuenta con ese correo. Crea una.');
      return ok({user:r[0]});
    }
    if (b.action==='update_profile') {
      const userId = parseInt((ev.headers||{})['x-user-id']||0,10);
      if (!userId) return err('No autenticado',401);
      const r = await sql`UPDATE users SET casita_name=COALESCE(${b.casita_name||null},casita_name), household_size=COALESCE(${b.household_size||null},household_size), city=COALESCE(${b.city||null},city) WHERE id=${userId} RETURNING id,email,casita_name,household_size,city`;
      return ok({user:r[0]});
    }
    return err('Acción desconocida');
  } catch(e) { return err(e.message,500); }
};
