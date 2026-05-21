import Anthropic from '@anthropic-ai/sdk';
import { ok, err, cors, body, uid } from './_lib.js';

export const handler = async ev => {
  if (ev.httpMethod==='OPTIONS') return cors();
  if (ev.httpMethod!=='POST') return err('Method not allowed',405);
  const userId = uid(ev); if (!userId) return err('No autenticado',401);
  const {pantry=[], offset=0} = body(ev);
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return err('Sin API key',500);

  const ingredientes = pantry.filter(p=>p.level!=='agotado').map(p=>p.name).join(', ');
  if (!ingredientes) return ok({recipes:[]});

  const prompt = `Eres un chef que sugiere recetas basadas en ingredientes disponibles.

Ingredientes en despensa: ${ingredientes}

Genera exactamente 3 recetas diferentes (variadas, pueden ser de cualquier cocina del mundo: mexicana, italiana, asiática, etc.) que se puedan hacer principalmente con estos ingredientes.

Responde SOLO con JSON válido, sin markdown, sin texto extra:
{
  "recipes": [
    {
      "name": "Nombre de la receta",
      "cuisine": "mexicana|italiana|asiatica|americana|española|otra",
      "time": "25 min",
      "servings": 4,
      "available": true,
      "ingredients": [
        {"name": "ingrediente", "amount": "2 tazas", "status": "ok|low|missing"}
      ],
      "steps": ["Paso 1...", "Paso 2...", "Paso 3..."]
    }
  ]
}

Reglas:
- status ok = está en la despensa normal, low = queda poco, missing = no está pero se necesita poco
- available = true si la mayoría de ingredientes están disponibles
- steps: 4-6 pasos concisos y claros
- Varía las recetas en cada llamada (offset actual: ${offset})`;

  try {
    const client = new Anthropic({apiKey});
    const res = await client.messages.create({
      model:'claude-haiku-4-5-20251001', // más rápido y barato para recetas
      max_tokens:2048,
      messages:[{role:'user',content:prompt}]
    });
    let text = res.content.filter(c=>c.type==='text').map(c=>c.text).join('').trim();
    text = text.replace(/^```json\s*/i,'').replace(/```$/,'').trim();
    const parsed = JSON.parse(text);
    return ok(parsed);
  } catch(e) { return err('Error generando recetas: '+e.message,500); }
};
