import { createHash } from 'node:crypto';
import { sql, ok, err, cors, body, uid } from './_lib.js';

function recipeTitle(recipe={}) {
  return recipe.nombre || recipe.name || 'Receta';
}

function recipeKey(recipe={}) {
  const ingredients = recipe.ingredientes || recipe.ingredients || [];
  const compact = {
    nombre: recipeTitle(recipe).toLowerCase().trim(),
    tiempo: recipe.tiempo || recipe.time || '',
    ingredientes: ingredients.map(i => (i.nombre || i.name || '').toLowerCase().trim()).filter(Boolean).sort()
  };
  return createHash('sha256').update(JSON.stringify(compact)).digest('hex');
}

async function ensureSavedRecipesTable() {
  await sql`
    CREATE TABLE IF NOT EXISTS saved_recipes (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      recipe_key TEXT NOT NULL,
      title TEXT NOT NULL,
      recipe JSONB NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(user_id, recipe_key)
    )
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS idx_saved_recipes
    ON saved_recipes(user_id, created_at DESC)
  `;
}

export const handler = async ev => {
  if (ev.httpMethod === 'OPTIONS') return cors();

  const userId = uid(ev);
  if (!userId) return err('No autenticado', 401);

  try {
    await ensureSavedRecipesTable();

    if (ev.httpMethod === 'GET') {
      const items = await sql`
        SELECT id, recipe_key, title, recipe, created_at
        FROM saved_recipes
        WHERE user_id=${userId}
        ORDER BY created_at DESC
      `;
      return ok({ items });
    }

    if (ev.httpMethod !== 'POST') return err('Method not allowed', 405);

    const b = body(ev);

    if (b.action === 'save') {
      const recipe = b.recipe || {};
      const title = recipeTitle(recipe);
      const key = recipeKey(recipe);
      const rows = await sql`
        INSERT INTO saved_recipes(user_id, recipe_key, title, recipe, created_at)
        VALUES(${userId}, ${key}, ${title}, ${JSON.stringify(recipe)}::jsonb, NOW())
        ON CONFLICT(user_id, recipe_key)
        DO UPDATE SET title=EXCLUDED.title, recipe=EXCLUDED.recipe
        RETURNING id, recipe_key, title, recipe, created_at
      `;
      return ok({ item: rows[0] });
    }

    if (b.action === 'delete') {
      await sql`DELETE FROM saved_recipes WHERE id=${b.id} AND user_id=${userId}`;
      return ok({ success:true });
    }

    return err('Acción no válida');
  } catch(e) {
    return err(e.message, 500);
  }
};
