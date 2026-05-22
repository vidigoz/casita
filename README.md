# Casita v2 🏠

## Deploy en 20 minutos

### 1. Neon (base de datos)
1. Crear cuenta en neon.tech
2. Nuevo proyecto → SQL Editor → pegar y ejecutar `schema.sql`
3. Copiar la connection string (Settings → Connection Details)

### 2. Anthropic API Key
1. console.anthropic.com → API Keys → Create Key

### 3. Netlify
1. Subir esta carpeta a GitHub
2. netlify.com → New site from Git → seleccionar el repo
3. En Site settings → Environment variables → agregar `DATABASE_URL` con la connection string de Neon
4. En Site settings → Environment variables → agregar:
   - `ANTHROPIC_API_KEY` = tu key de Claude
   - `OPENWEATHER_API_KEY` = (opcional) de openweathermap.org para clima real
5. Deploy → listo

## Funciones serverless
- `auth` — registro/login
- `chat` — Claude con tool use (actualiza despensa, mandado, tareas, proyectos)
- `tasks` — to-do list
- `pantry` — despensa
- `shopping` — lista de compras
- `meals` — historial de comidas (7 días)
- `recipes` — sugerencias con Claude Haiku
- `scan-receipt` — Claude Vision para tickets
- `weather` — clima real (opcional)
- `projects` — checklist y tracker de dinero

## Estructura
```
casita/
├── public/          ← frontend (HTML + CSS en index.html + app.js)
├── netlify/functions/ ← backend serverless
├── netlify.toml
├── package.json
└── schema.sql
```

## Costo estimado
- Netlify: gratis (hasta 125k calls/mes)
- Neon: gratis (hasta 500MB)
- Claude Sonnet: ~$0.003/chat · Haiku: ~$0.0005/receta
- 1 usuaria activa: ~$1-3 USD/mes
