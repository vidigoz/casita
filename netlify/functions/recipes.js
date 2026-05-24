import Anthropic from '@anthropic-ai/sdk';
import { createHash } from 'node:crypto';
import { ok, err, cors, body, uid, sql } from './_lib.js';

const MODEL = 'claude-haiku-4-5-20251001';
const CACHE_VERSION = 'claude-recipes-v1';

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

function validPantryItems(pantry) {
  return pantry.filter(p => p.name && p.level !== 'agotado');
}

function stripMarkdownJson(text) {
  return text
    .trim()
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```$/,'')
    .trim();
}

function buildPrompt(pantry, householdSize, offset) {
  return `Eres el chef de Casita, una app para mamás mexicanas.

DESPENSA ACTUAL:
${pantryList(pantry)}

PERSONAS EN CASA: ${householdSize}

INSTRUCCIONES:
Genera exactamente 3 recetas diferentes y variadas que se puedan preparar principalmente con los ingredientes disponibles. Pueden ser recetas de cualquier cocina del mundo pero priorizando lo que hay en la despensa. Usa vocabulario mexicano natural: jitomate, chile, elote, ahorita. Los pasos deben sonar como si una amiga te explicara, no como un libro de cocina formal.

Varía el tipo de recetas: no pongas tres guisados, mezcla entre sopas, arroces, guisados, antojitos, etc. Con cada llamada genera recetas diferentes para dar variedad (seed de variación: ${offset}).

Ingredientes con nivel "agotado" no los uses. Los de nivel "poco" úsalos con moderación.

Responde SOLO con JSON válido sin markdown:
{
  "recetas": [
    {
      "nombre": "nombre en español mexicano",
      "tiempo": "25 min",
      "porciones": ${householdSize},
      "cocina": "mexicana|italiana|asiatica|americana|española|otra",
      "disponible": true,
      "ingredientes": [
        {
          "nombre": "nombre del ingrediente",
          "cantidad": "2 tazas",
          "status": "ok|low|missing"
        }
      ],
      "pasos": [
        "Paso natural y claro como lo diría una amiga..."
      ],
      "tip": "Tip corto opcional, tipo consejo de cocina mexicana"
    }
  ]
}

Status de ingredientes:
- ok = hay suficiente en la despensa
- low = hay poco pero alcanza
- missing = no está pero se necesita poco, se puede conseguir fácil

Genera recetas DIFERENTES en cada llamada. El offset ${offset} te ayuda a variar.`;
}

function normalizeRecipes(recetas, householdSize) {
  return (recetas || []).slice(0, 3).map(r => ({
    nombre: r.nombre || 'Receta',
    tiempo: r.tiempo || '30 min',
    porciones: Number(r.porciones) || householdSize,
    cocina: ['mexicana','italiana','asiatica','americana','española','otra'].includes(r.cocina) ? r.cocina : 'otra',
    disponible: r.disponible !== false,
    ingredientes: Array.isArray(r.ingredientes) ? r.ingredientes.map(ing => ({
      nombre: ing.nombre || '',
      cantidad: ing.cantidad || '',
      status: ['ok','low','missing'].includes(ing.status) ? ing.status : 'missing'
    })).filter(ing => ing.nombre) : [],
    pasos: Array.isArray(r.pasos) ? r.pasos.filter(Boolean) : [],
    tip: r.tip || ''
  }));
}

async function ensureRecipeCacheTable() {
  await sql`
    CREATE TABLE IF NOT EXISTS recipe_cache (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      pantry_hash TEXT NOT NULL,
      offset_value INTEGER NOT NULL DEFAULT 0,
      recipes JSONB NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(user_id, pantry_hash, offset_value)
    )
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS idx_recipe_cache
    ON recipe_cache(user_id, pantry_hash, offset_value, created_at DESC)
  `;
}

async function getCachedRecipes(userId, pantryHash) {
  const rows = await sql`
    SELECT recipes
    FROM recipe_cache
    WHERE user_id = ${userId}
      AND pantry_hash = ${pantryHash}
      AND offset_value = 0
      AND created_at > NOW() - INTERVAL '24 hours'
    ORDER BY created_at DESC
    LIMIT 1
  `;
  return rows[0]?.recipes || null;
}

async function saveCachedRecipes(userId, pantryHash, recipes) {
  await sql`DELETE FROM recipe_cache WHERE user_id = ${userId}`;
  await sql`
    INSERT INTO recipe_cache (user_id, pantry_hash, offset_value, recipes, created_at)
    VALUES (${userId}, ${pantryHash}, 0, ${JSON.stringify(recipes)}::jsonb, NOW())
    ON CONFLICT (user_id, pantry_hash, offset_value)
    DO UPDATE SET recipes = EXCLUDED.recipes, created_at = NOW()
  `;
}

async function generateRecipes(client, pantry, householdSize, offset) {
  const prompt = buildPrompt(pantry, householdSize, offset);
  const res = await client.beta.messages.create({
    betas:['prompt-caching-2024-07-31'],
    model: MODEL,
    max_tokens: 3500,
    system:[{ type:'text', text:prompt, cache_control:{ type:'ephemeral' } }],
    messages:[{ role:'user', content:'Genera las recetas ahora.' }]
  });

  const text = stripMarkdownJson(
    res.content.filter(c => c.type === 'text').map(c => c.text).join('').trim()
  );
  const parsed = JSON.parse(text);
  return normalizeRecipes(parsed.recetas, householdSize);
}

export const handler = async ev => {
  if (ev.httpMethod === 'OPTIONS') return cors();
  if (ev.httpMethod !== 'POST') return err('Method not allowed', 405);

  const userId = uid(ev);
  if (!userId) return err('No autenticado', 401);

  const { offset=0 } = body(ev);
  const offsetValue = Number.isFinite(Number(offset)) ? Number(offset) : 0;
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (!anthropicKey) return err('Sin Anthropic API key', 500);

  try {
    await ensureRecipeCacheTable();

    const [user] = await sql`SELECT household_size FROM users WHERE id=${userId}`;
    const pantry = await sql`
      SELECT name, category, level, approx_quantity
      FROM pantry
      WHERE user_id=${userId}
      ORDER BY category, name
    `;
    const householdSize = Number(user?.household_size) || 4;
    const validItems = validPantryItems(pantry);

    if (validItems.length < 2) {
      return ok({ recipes: [], message: 'Agrega ingredientes a tu despensa para ver recetas' });
    }

    const pantryHash = pantrySignature(pantry);
    if (offsetValue === 0) {
      const cached = await getCachedRecipes(userId, pantryHash);
      if (cached) return ok({ recipes: cached });
    }

    const client = new Anthropic({ apiKey: anthropicKey });
    const recipes = await generateRecipes(client, pantry, householdSize, offsetValue);

    if (offsetValue === 0) {
      await saveCachedRecipes(userId, pantryHash, recipes);
    }

    return ok({ recipes });
  } catch(e) {
    return err('Error generando recetas: '+e.message, 500);
  }
};
