import Anthropic from '@anthropic-ai/sdk';
import { ok, err, cors, body, uid } from './_lib.js';

const CATEGORIES = ['frutas','verduras','carnes','lacteos','pan','abarrotes','limpieza','huevo','otros'];

export const handler = async ev => {
  if (ev.httpMethod==='OPTIONS') return cors();
  if (ev.httpMethod!=='POST') return err('Method not allowed',405);
  const userId = uid(ev); if (!userId) return err('No autenticado',401);
  const {name} = body(ev);
  if (!name) return err('Falta el nombre',400);

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return ok({category:'otros'});

  try {
    const client = new Anthropic({apiKey});
    const res = await client.messages.create({
      model:'claude-haiku-4-5-20251001',
      max_tokens:10,
      messages:[{role:'user',content:`Categoriza "${name}" en una de estas categorías de despensa: ${CATEGORIES.join(', ')}. Responde SOLO con el nombre exacto de la categoría, sin explicación.`}]
    });
    const raw = res.content.filter(c=>c.type==='text').map(c=>c.text).join('').trim().toLowerCase();
    const category = CATEGORIES.find(c => raw.includes(c)) || 'otros';
    return ok({category});
  } catch(e) { return ok({category:'otros'}); }
};
