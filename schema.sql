-- Casita v2 — ejecutar en Neon SQL Editor

CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  casita_name TEXT NOT NULL,
  household_size INTEGER DEFAULT 4,
  city TEXT DEFAULT 'CDMX',
  pin_salt TEXT,
  pin_hash TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE users ADD COLUMN IF NOT EXISTS pin_salt TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS pin_hash TEXT;

CREATE TABLE IF NOT EXISTS tasks (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  due_date DATE,
  due_time TIME,
  category TEXT,
  done BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_tasks ON tasks(user_id, due_date);

CREATE TABLE IF NOT EXISTS pantry (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  category TEXT DEFAULT 'otros',
  level TEXT CHECK (level IN ('lleno','suficiente','poco','agotado')) DEFAULT 'suficiente',
  approx_quantity TEXT,
  last_updated TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, name)
);
CREATE INDEX IF NOT EXISTS idx_pantry ON pantry(user_id);

CREATE TABLE IF NOT EXISTS shopping_list (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  quantity TEXT,
  category TEXT,
  source TEXT DEFAULT 'user',
  reason TEXT,
  done BOOLEAN DEFAULT FALSE,
  store_group TEXT DEFAULT NULL,
  estimated_price NUMERIC(10,2) DEFAULT NULL,
  added_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE shopping_list ADD COLUMN IF NOT EXISTS store_group TEXT DEFAULT NULL;
ALTER TABLE shopping_list ADD COLUMN IF NOT EXISTS estimated_price NUMERIC(10,2) DEFAULT NULL;
CREATE INDEX IF NOT EXISTS idx_shopping ON shopping_list(user_id);

CREATE TABLE IF NOT EXISTS product_prices (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  product_key TEXT NOT NULL,
  product_name TEXT NOT NULL,
  last_price NUMERIC(10,2) NOT NULL,
  last_store TEXT,
  source TEXT DEFAULT 'receipt',
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, product_key)
);
CREATE INDEX IF NOT EXISTS idx_product_prices ON product_prices(user_id, product_key);

CREATE TABLE IF NOT EXISTS meals_history (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  dish_name TEXT NOT NULL,
  servings INTEGER,
  ingredients_used JSONB,
  cooked_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_meals ON meals_history(user_id, cooked_at DESC);

CREATE TABLE IF NOT EXISTS recipe_cache (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  pantry_hash TEXT NOT NULL,
  offset_value INTEGER NOT NULL DEFAULT 0,
  recipes JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, pantry_hash, offset_value)
);
CREATE INDEX IF NOT EXISTS idx_recipe_cache ON recipe_cache(user_id, pantry_hash, offset_value, created_at DESC);

CREATE TABLE IF NOT EXISTS saved_recipes (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  recipe_key TEXT NOT NULL,
  title TEXT NOT NULL,
  recipe JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, recipe_key)
);
CREATE INDEX IF NOT EXISTS idx_saved_recipes ON saved_recipes(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS receipts (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  store TEXT,
  total NUMERIC(10,2),
  items JSONB,
  scanned_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS projects (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  type TEXT CHECK (type IN ('checklist','tracker_dinero')) NOT NULL,
  data JSONB NOT NULL DEFAULT '{}',
  archived BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_projects ON projects(user_id, archived);

CREATE TABLE IF NOT EXISTS chat_history (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_chat ON chat_history(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS user_memory (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  key TEXT NOT NULL,
  value TEXT NOT NULL,
  confidence NUMERIC DEFAULT 0.8,
  source TEXT DEFAULT 'chat',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, type, key)
);
CREATE INDEX IF NOT EXISTS idx_user_memory ON user_memory(user_id, type);
