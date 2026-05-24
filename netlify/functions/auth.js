import { sql, ok, err, cors, body } from './_lib.js';
import { randomBytes, createHash, timingSafeEqual } from 'node:crypto';

function validPin(pin) {
  return /^\d{4}$/.test(String(pin || ''));
}

function hashPin(pin, salt) {
  return createHash('sha256').update(`${salt}:${pin}`).digest('hex');
}

function pinMatches(pin, salt, hash) {
  if (!salt || !hash) return false;
  const actual = Buffer.from(hashPin(pin, salt), 'hex');
  const expected = Buffer.from(hash, 'hex');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export const handler = async ev => {
  if (ev.httpMethod==='OPTIONS') return cors();
  const b = body(ev);
  try {
    if (b.action==='register') {
      const email = (b.email||'').toLowerCase().trim();
      const pin = String(b.pin || '').trim();
      if (!email||!email.includes('@')) return err('Email inválido');
      if (!b.casita_name) return err('Falta el nombre');
      if (!validPin(pin)) return err('El PIN debe tener 4 dígitos');
      const ex = await sql`SELECT id,pin_salt,pin_hash FROM users WHERE email=${email}`;
      if (ex.length) {
        const user = ex[0];
        let salt = user.pin_salt;
        let pinHash = user.pin_hash;
        if (!pinHash) {
          salt = randomBytes(16).toString('hex');
          pinHash = hashPin(pin, salt);
        } else if (!pinMatches(pin, salt, pinHash)) {
          return err('Ese correo ya tiene cuenta. Escribe su PIN para actualizarla.',401);
        }
        const r = await sql`
          UPDATE users
          SET casita_name=${b.casita_name},
              household_size=${b.household_size||4},
              city=${b.city||'CDMX'},
              pin_salt=${salt},
              pin_hash=${pinHash}
          WHERE id=${user.id}
          RETURNING id,email,casita_name,household_size,city
        `;
        return ok({user:r[0], updated:true});
      }
      const salt = randomBytes(16).toString('hex');
      const pinHash = hashPin(pin, salt);
      const r = await sql`INSERT INTO users(email,casita_name,household_size,city,pin_salt,pin_hash) VALUES(${email},${b.casita_name},${b.household_size||4},${b.city||'CDMX'},${salt},${pinHash}) RETURNING id,email,casita_name,household_size,city`;
      return ok({user:r[0]});
    }
    if (b.action==='login') {
      const email = (b.email||'').toLowerCase().trim();
      const pin = String(b.pin || '').trim();
      if (!email||!email.includes('@')) return err('Email inválido');
      if (!validPin(pin)) return err('El PIN debe tener 4 dígitos');
      const found = await sql`SELECT id,email,casita_name,household_size,city,pin_salt,pin_hash FROM users WHERE email=${email}`;
      if (!found.length) return err('No existe cuenta con ese correo. Crea una.');
      const user = found[0];
      if (!user.pin_hash) {
        const salt = randomBytes(16).toString('hex');
        const pinHash = hashPin(pin, salt);
        const r = await sql`UPDATE users SET pin_salt=${salt}, pin_hash=${pinHash} WHERE id=${user.id} RETURNING id,email,casita_name,household_size,city`;
        return ok({user:r[0]});
      }
      if (!pinMatches(pin, user.pin_salt, user.pin_hash)) return err('PIN incorrecto',401);
      const r = await sql`UPDATE users SET created_at=created_at WHERE id=${user.id} RETURNING id,email,casita_name,household_size,city`;
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
