import Anthropic from '@anthropic-ai/sdk';
import { ok, err, cors, body, uid } from './_lib.js';

export const handler = async ev => {
  if (ev.httpMethod==='OPTIONS') return cors();
  if (ev.httpMethod!=='POST') return err('Method not allowed',405);
  const userId = uid(ev); if (!userId) return err('No autenticado',401);
  const {pantry=[], offset=0, single_meal=null} = body(ev);
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return err('Sin API key',500);

  const ingredientes = pantry.filter(p=>p.level!=='agotado').map(p=>p.name).join(', ');
  if (!ingredientes) return ok({recipes:[]});

  const prompt = single_meal
    ? `Eres un chef que sugiere recetas basadas en ingredientes disponibles.

Ingredientes en despensa: ${ingredientes}

Genera exactamente 1 receta de tipo "${single_meal}" que se pueda hacer principalmente con estos ingredientes. Debe ser diferente a recetas comunes, varía con offset ${offset}.

Responde SOLO con JSON válido, sin markdown, sin texto extra:
{
  "recipes": [
    {
      "name": "Nombre de la receta",
      "description": "Una línea breve y apetitosa que describe la receta",
      "meal_type": "${single_meal}",
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
- description: una frase corta (máx 12 palabras) apetitosa que describe el platillo
- steps: 4-6 pasos concisos y claros`
    : `Eres un chef que sugiere recetas basadas en ingredientes disponibles.

Ingredientes en despensa: ${ingredientes}

Genera exactamente 3 recetas diferentes que se puedan hacer principalmente con estos ingredientes:
1 desayuno
1 comida
1 cena

Pueden ser de cualquier cocina del mundo (mexicana, italiana, asiática, etc.), pero deben sentirse adecuadas para ese momento del día.

Responde SOLO con JSON válido, sin markdown, sin texto extra:
{
  "recipes": [
    {
      "name": "Nombre de la receta",
      "description": "Una línea breve y apetitosa que describe la receta",
      "meal_type": "desayuno|comida|cena",
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
- description: una frase corta (máx 12 palabras) apetitosa que describe el platillo
- steps: 4-6 pasos concisos y claros
- Debe haber exactamente una receta con meal_type desayuno, una con meal_type comida y una con meal_type cena
- Ordena las recetas así: desayuno, comida, cena
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
