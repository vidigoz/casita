import Anthropic from '@anthropic-ai/sdk';
import { createHash } from 'node:crypto';
import { ok, err, cors, body, uid, sql } from './_lib.js';

const MODEL = 'claude-haiku-4-5-20251001';
const CACHE_VERSION = 'lunch-only-fallback-v2';
const PROTEIN_HINTS = [
  'pollo','pechuga','muslo','carne','res','molida','bistec','cerdo','puerco',
  'chuleta','jamon','tocino','pescado','atun','salmon','camaron','camarones',
  'huevo','huevos','chorizo','salchicha','pavo','tilapia'
];

const THEMEALDB_FALLBACKS = [
  { es: ['pollo','pechuga','muslo'], en: ['chicken'] },
  { es: ['res','bistec','carne','molida'], en: ['beef'] },
  { es: ['cerdo','puerco','chuleta','tocino','chorizo','jamon'], en: ['pork'] },
  { es: ['pescado','tilapia'], en: ['fish'] },
  { es: ['atun'], en: ['tuna'] },
  { es: ['salmon'], en: ['salmon'] },
  { es: ['camaron','camarones'], en: ['shrimp'] },
  { es: ['huevo','huevos'], en: ['egg'] },
  { es: ['pavo'], en: ['turkey'] }
];

function normalizeText(value='') {
  return value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function pantrySignature(pantry) {
  const compact = pantry
    .map(p => ({
      name: normalizeText(p.name || '').trim(),
      level: p.level || 'suficiente',
      quantity: p.approx_quantity || ''
    }))
    .filter(p => p.name)
    .sort((a,b) => `${a.name}:${a.level}`.localeCompare(`${b.name}:${b.level}`));

  return createHash('sha256').update(`${CACHE_VERSION}:${JSON.stringify(compact)}`).digest('hex');
}

function pantryList(pantry) {
  return pantry
    .filter(p => p.name)
    .map(p => `- ${p.name}: ${p.level || 'suficiente'}`)
    .join('\n');
}

function pickMainIngredient(pantry) {
  const available = pantry.filter(p => p.name && p.level !== 'agotado');
  const strong = available.filter(p => ['lleno','suficiente'].includes(p.level || 'suficiente'));
  const protein = strong.find(p => PROTEIN_HINTS.some(h => normalizeText(p.name).includes(h)));
  return protein || strong[0] || available[0] || null;
}

async function translateMainIngredient(client, ingredient) {
  const res = await client.messages.create({
    model: MODEL,
    max_tokens: 20,
    messages: [{ role:'user', content:
      `Translate this Mexican pantry ingredient to English for a recipe search. Return only the ingredient name in English, no punctuation, no explanation.\n\n${ingredient}`
    }]
  });

  return res.content
    .filter(c => c.type === 'text')
    .map(c => c.text)
    .join('')
    .trim()
    .replace(/^["'`]+|["'`.]+$/g, '')
    .toLowerCase();
}

function seededPick(items, count, offset) {
  const list = [...items];
  let seed = (offset + 1) * 9301 + list.length * 49297;
  for (let i = list.length - 1; i > 0; i--) {
    seed = (seed * 9301 + 49297) % 233280;
    const j = seed % (i + 1);
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list.slice(0, Math.min(count, list.length));
}

async function searchTheMealDB(ingredientEN, offset) {
  const params = new URLSearchParams({ i: ingredientEN });
  const res = await fetch(`https://www.themealdb.com/api/json/v1/1/filter.php?${params}`);
  if (!res.ok) throw new Error(`TheMealDB error: ${res.status}`);

  const data = await res.json();
  const meals = data.meals || [];
  if (!meals.length) return [];

  const count = Math.min(meals.length, 8 + (Math.abs(offset) % 5));
  return seededPick(meals, count, offset).map(m => ({
    id: m.idMeal,
    name: m.strMeal
  }));
}

function buildSearchTerms(mainIngredient, ingredientEN) {
  const terms = new Set();
  const translated = normalizeText(ingredientEN || '').trim();
  const original = normalizeText(mainIngredient?.name || '');
  if (translated) terms.add(translated);

  THEMEALDB_FALLBACKS.forEach(group => {
    if (group.es.some(term => original.includes(term)) || group.en.some(term => translated.includes(term))) {
      group.en.forEach(term => terms.add(term));
    }
  });

  return [...terms].filter(Boolean);
}

async function searchTheMealDBWithFallbacks(mainIngredient, ingredientEN, offset) {
  const terms = buildSearchTerms(mainIngredient, ingredientEN);
  for (const term of terms) {
    const candidates = await searchTheMealDB(term, offset);
    if (candidates.length) return { candidates, ingredient: term };
  }
  return { candidates: [], ingredient: terms[0] || ingredientEN };
}

async function getCachedRecipes(userId, pantryHash, offset) {
  const rows = await sql`
    SELECT recipes
    FROM recipe_cache
    WHERE user_id = ${userId}
      AND pantry_hash = ${pantryHash}
      AND offset_value = ${offset}
      AND created_at > NOW() - INTERVAL '24 hours'
    ORDER BY created_at DESC
    LIMIT 1
  `;
  return rows[0]?.recipes || null;
}

async function saveCachedRecipes(userId, pantryHash, offset, recipes) {
  await sql`
    INSERT INTO recipe_cache (user_id, pantry_hash, offset_value, recipes, created_at)
    VALUES (${userId}, ${pantryHash}, ${offset}, ${JSON.stringify(recipes)}::jsonb, NOW())
    ON CONFLICT (user_id, pantry_hash, offset_value)
    DO UPDATE SET recipes = EXCLUDED.recipes, created_at = NOW()
  `;
}

async function selectAndTranslateRecipes(client, pantry, householdSize, candidates) {
  const prompt = `Eres el asistente de cocina de Casita, una app para mamás mexicanas.

DESPENSA ACTUAL:
${pantryList(pantry)}

PERSONAS EN CASA: ${householdSize}

RECETAS CANDIDATAS de TheMealDB (en inglés):
${candidates.map(r => `- ${r.name} (ID: ${r.id})`).join('\n')}

Selecciona 1 receta para la comida/almuerzo que se pueda hacer lo mejor posible con lo que hay en la despensa. Prioriza la que necesite menos ingredientes faltantes. Traduce al español mexicano natural y coloquial. Adapta las porciones. Usa vocabulario mexicano: jitomate no tomate, chile no pimiento, elote no choclo.

Responde SOLO con JSON válido sin markdown:
{
  "recetas": [{
    "id": "id de TheMealDB",
    "nombre": "nombre en español mexicano",
    "tiempo": "30 min",
    "porciones": 4,
    "cocina": "mexicana|italiana|asiatica|americana|española|otra",
    "disponible": true,
    "ingredientes": [{"nombre":"...","cantidad":"...","status":"ok|low|missing"}],
    "pasos": ["paso 1 claro y natural...","paso 2..."],
    "tip": "tip corto opcional tipo consejo de amiga"
  }]
}

status de ingredientes:
- ok = hay suficiente en la despensa
- low = hay poco pero alcanza
- missing = no está, hay que comprarlo`;

  const res = await client.messages.create({
    model: MODEL,
    max_tokens: 3000,
    messages: [{ role:'user', content: prompt }]
  });

  let text = res.content.filter(c => c.type === 'text').map(c => c.text).join('').trim();
  text = text.replace(/^```json\s*/i, '').replace(/```$/,'').trim();
  return JSON.parse(text).recetas || [];
}

function normalizeRecipes(recetas, candidates, householdSize) {
  const byId = new Map(candidates.map(r => [String(r.id), r]));
  return recetas.slice(0, 1).map((r) => {
    const candidate = byId.get(String(r.id)) || candidates[0] || {};
    return {
      id: String(r.id || candidate.id || ''),
      name: r.nombre || candidate.name || 'Receta',
      nombre: r.nombre || candidate.name || 'Receta',
      description: r.tip || '',
      tip: r.tip || '',
      meal_type: 'comida',
      cuisine: r.cocina || 'otra',
      cocina: r.cocina || 'otra',
      time: r.tiempo || '30 min',
      tiempo: r.tiempo || '30 min',
      servings: r.porciones || householdSize,
      porciones: r.porciones || householdSize,
      available: Boolean(r.disponible),
      disponible: Boolean(r.disponible),
      ingredients: r.ingredientes || [],
      ingredientes: r.ingredientes || [],
      steps: r.pasos || [],
      pasos: r.pasos || []
    };
  });
}

export const handler = async ev => {
  if (ev.httpMethod === 'OPTIONS') return cors();
  if (ev.httpMethod !== 'POST') return err('Method not allowed', 405);
  const userId = uid(ev); if (!userId) return err('No autenticado', 401);

  const { pantry=[], offset=0, household_size=4 } = body(ev);
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (!anthropicKey) return err('Sin Anthropic API key', 500);

  const availablePantry = pantry.filter(p => p.name && p.level !== 'agotado');
  if (!availablePantry.length) return ok({ recipes:[], reason:'empty_pantry' });

  try {
    const pantryHash = pantrySignature(pantry);
    const offsetValue = Number.isFinite(Number(offset)) ? Number(offset) : 0;
    const cached = await getCachedRecipes(userId, pantryHash, offsetValue);
    if (cached) return ok({ recipes: cached, source:'cache' });

    const mainIngredient = pickMainIngredient(pantry);
    if (!mainIngredient) return ok({ recipes:[], reason:'empty_pantry' });

    const client = new Anthropic({ apiKey: anthropicKey });
    const ingredientEN = await translateMainIngredient(client, mainIngredient.name);
    const { candidates, ingredient } = await searchTheMealDBWithFallbacks(mainIngredient, ingredientEN, offsetValue);
    if (!candidates.length) return ok({ recipes:[], reason:'no_themealdb_results', ingredient });

    const selected = await selectAndTranslateRecipes(client, pantry, household_size, candidates);
    const recipes = normalizeRecipes(selected, candidates, household_size);

    await saveCachedRecipes(userId, pantryHash, offsetValue, recipes);
    return ok({ recipes, source:'themealdb', ingredient });
  } catch(e) {
    return err('Error generando recetas: '+e.message, 500);
  }
};
