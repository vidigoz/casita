import Anthropic from '@anthropic-ai/sdk';
import { sql, ok, err, cors, body, uid } from './_lib.js';

const MODEL = 'claude-haiku-4-5-20251001';

function buildSystemPrompt(user) {
  const today = new Date().toISOString().split('T')[0];
  return `Eres Casita, asistente del hogar para mamás mexicanas.

CONTEXTO DE LA USUARIA:
- Nombre: ${user.casita_name || '—'}
- Personas en casa: ${user.household_size || 4}
- Ciudad: ${user.city || 'CDMX'}
- Fecha de hoy: ${today}

REGLAS:
- Solo hablas de cosas del hogar. Si preguntan sobre noticias, política, deportes u otras cosas externas responde: "Eso no lo sé, pero en lo que tiene que ver con tu hogar aquí estoy 😊"
- Español mexicano natural y coloquial. Máximo 3-4 líneas por respuesta.
- Vocabulario mexicano: jitomate, ahorita, el mandado, chido.

DIFERENCIA IMPORTANTE ENTRE LISTAS:
- Pendientes/tareas = cosas que HAY QUE HACER (citas, pagos, recordatorios, juntas)
- Mandado = cosas que HAY QUE COMPRAR en el súper o mercado
- Despensa = lo que HAY EN CASA en este momento
Ejemplos:
- "agrega leche" → mandado (hay que comprarla)
- "recuérdame llamar al dentista" → tarea (hay que hacerlo)
- "ya compré leche" → despensa (ya está en casa) + tachar del mandado
- "hice arroz con pollo" → descontar de despensa

TOOLS DISPONIBLES — úsalas cuando aplique:
- "hice X para Y personas" → descontar_despensa()
- "se acabó/ya no hay X" → actualizar_despensa(nivel=agotado)
- "queda poco X" → actualizar_despensa(nivel=poco)
- "compré X / ya hay X" → actualizar_despensa(nivel=lleno)
- "agrega X / necesito X / falta X" → agregar_mandado()
- "agrega X a Costco / en HEB necesito Y" → agregar_mandado() con grupo=tienda
- "mueve X a HEB / el pollo cómpralo en Walmart" → mover_a_grupo()
- "recuérdame / tengo cita / hay junta" → agregar_tarea()
- "quiero organizar / empecé un negocio / voy a hacer una fiesta" → crear_proyecto()`;
}

const TOOLS = [
  {
    name:'actualizar_despensa',
    description:'Cambia el nivel de un producto en la despensa. Si queda poco o agotado, también se agrega al mandado como sugerencia.',
    input_schema:{type:'object',required:['nombre','nivel'],properties:{
      nombre:{type:'string'},
      nivel:{type:'string',enum:['lleno','suficiente','poco','agotado']},
      categoria:{type:'string',description:'carnes|verduras|frutas|lacteos|abarrotes|pan|limpieza|otros'},
      cantidad:{type:'string'}
    }}
  },
  {
    name:'descontar_despensa',
    description:'Registra que se cocinó algo y actualiza niveles de ingredientes en despensa.',
    input_schema:{type:'object',required:['platillo','porciones','ingredientes'],properties:{
      platillo:{type:'string'},
      porciones:{type:'number'},
      ingredientes:{type:'array',items:{type:'object',required:['nombre','nivel_nuevo'],properties:{
        nombre:{type:'string'},
        nivel_nuevo:{type:'string',enum:['lleno','suficiente','poco','agotado']},
        categoria:{type:'string'}
      }}}
    }}
  },
  {
    name:'agregar_mandado',
    description:'Agrega productos a la lista de compras. Si el usuario menciona una tienda o grupo (Costco, HEB, Walmart, farmacia, etc.) úsalo en el campo grupo.',
    input_schema:{type:'object',required:['productos'],properties:{
      productos:{type:'array',items:{type:'object',required:['nombre'],properties:{
        nombre:{type:'string'},
        cantidad:{type:'string'},
        categoria:{type:'string'},
        razon:{type:'string'},
        grupo:{type:'string',description:'Tienda o grupo donde comprar, ej: Costco, HEB, Walmart, farmacia'}
      }}}
    }}
  },
  {
    name:'mover_a_grupo',
    description:'Mueve uno o varios productos ya existentes en el mandado a un grupo/tienda. Úsalo cuando el usuario diga "pon X en HEB", "mueve Y a Costco", "el pollo cómpralo en Walmart".',
    input_schema:{type:'object',required:['productos','grupo'],properties:{
      productos:{type:'array',items:{type:'string'},description:'Nombres de los productos a mover'},
      grupo:{type:'string',description:'Nombre de la tienda o grupo, ej: Costco, HEB, Walmart. Usa null para quitar el grupo.'}
    }}
  },
  {
    name:'agregar_tarea',
    description:'Agrega un pendiente, recordatorio o tarea.',
    input_schema:{type:'object',required:['titulo'],properties:{
      titulo:{type:'string'},
      fecha:{type:'string',description:'YYYY-MM-DD'},
      hora:{type:'string',description:'HH:MM'},
      categoria:{type:'string'}
    }}
  },
  {
    name:'crear_proyecto',
    description:'Crea un proyecto checklist o tracker_dinero.',
    input_schema:{type:'object',required:['tipo','titulo'],properties:{
      tipo:{type:'string',enum:['checklist','tracker_dinero']},
      titulo:{type:'string'},
      items:{type:'array',items:{type:'string'},description:'Para checklist: tareas iniciales'},
      meta_total:{type:'number',description:'Para tracker_dinero: monto total'},
      descripcion:{type:'string'}
    }}
  }
];

function toolsWithPromptCache() {
  return TOOLS.map((tool, index) => index === TOOLS.length - 1
    ? {...tool, cache_control:{type:'ephemeral'}}
    : tool
  );
}

async function invalidateRecipeCache(userId) {
  await sql`DELETE FROM recipe_cache WHERE user_id=${userId}`;
}

async function runTool(name, input, userId) {
  if (name === 'actualizar_despensa') {
    await sql`
      INSERT INTO pantry(user_id,name,category,level,approx_quantity)
      VALUES(${userId},${input.nombre},${input.categoria||'otros'},${input.nivel},${input.cantidad||null})
      ON CONFLICT(user_id,name) DO UPDATE SET
        level=EXCLUDED.level,
        approx_quantity=COALESCE(EXCLUDED.approx_quantity,pantry.approx_quantity),
        last_updated=NOW()`;

    if (input.nivel === 'poco' || input.nivel === 'agotado') {
      const price = await knownPrice(userId, input.nombre);
      await sql`
        INSERT INTO shopping_list(user_id,name,category,source,reason,estimated_price)
        VALUES(${userId},${input.nombre},${input.categoria||null},'ai_suggestion',${input.nivel==='agotado'?'se agotó':'queda poco'},${price})`;
    }
    return {ok:true};
  }

  if (name === 'descontar_despensa') {
    await sql`
      INSERT INTO meals_history(user_id,dish_name,servings,ingredients_used)
      VALUES(${userId},${input.platillo},${input.porciones},${JSON.stringify(input.ingredientes)})`;

    for (const ing of input.ingredientes || []) {
      await sql`
        INSERT INTO pantry(user_id,name,category,level)
        VALUES(${userId},${ing.nombre},${ing.categoria||'otros'},${ing.nivel_nuevo})
        ON CONFLICT(user_id,name) DO UPDATE SET
          level=EXCLUDED.level,
          last_updated=NOW()`;

      if (ing.nivel_nuevo === 'poco' || ing.nivel_nuevo === 'agotado') {
        const price = await knownPrice(userId, ing.nombre);
        await sql`
          INSERT INTO shopping_list(user_id,name,category,source,reason,estimated_price)
          VALUES(${userId},${ing.nombre},${ing.categoria||null},'ai_suggestion',${ing.nivel_nuevo==='agotado'?'se agotó':'queda poco'},${price})`;
      }
    }

    await invalidateRecipeCache(userId);
    return {ok:true};
  }

  if (name === 'agregar_mandado') {
    for (const p of input.productos || []) {
      const price = await knownPrice(userId, p.nombre);
      await sql`
        INSERT INTO shopping_list(user_id,name,quantity,category,source,reason,store_group,estimated_price)
        VALUES(${userId},${p.nombre},${p.cantidad||null},${p.categoria||null},'user',${p.razon||null},${p.grupo||null},${price})`;
    }
    return {ok:true};
  }

  if (name === 'mover_a_grupo') {
    const grupo = input.grupo || null;
    for (const nombre of input.productos || []) {
      await sql`
        UPDATE shopping_list SET store_group=${grupo}
        WHERE user_id=${userId} AND done=FALSE
          AND LOWER(name) LIKE LOWER(${'%'+nombre+'%'})`;
    }
    return {ok:true};
  }

  if (name === 'agregar_tarea') {
    await sql`
      INSERT INTO tasks(user_id,title,due_date,due_time,category)
      VALUES(${userId},${input.titulo},${input.fecha||null},${input.hora||null},${input.categoria||null})`;
    return {ok:true};
  }

  if (name === 'crear_proyecto') {
    const data = {
      tipo: input.tipo,
      descripcion: input.descripcion || '',
      items: input.items || [],
      meta_total: input.meta_total || null,
      checked: {},
      abonos: []
    };
    await sql`
      INSERT INTO projects(user_id,title,type,data)
      VALUES(${userId},${input.titulo},${input.tipo},${JSON.stringify(data)})`;
    return {ok:true};
  }

  return {ok:false,error:'unknown tool'};
}

export const handler = async ev => {
  if (ev.httpMethod === 'OPTIONS') return cors();
  if (ev.httpMethod !== 'POST') return err('Method not allowed',405);

  const userId = uid(ev);
  if (!userId) return err('No autenticado',401);

  const {message, history=[]} = body(ev);
  if (!message) return err('Mensaje vacío');

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return err('Sin API key',500);

  try {
    await ensurePriceMemory();
    const client = new Anthropic({apiKey});
    const userRows = await sql`SELECT casita_name,household_size,city FROM users WHERE id=${userId}`;
    const system = buildSystemPrompt(userRows[0] || {});
    const recentHistory = history.slice(-6).map(h => ({role:h.role, content:h.content}));
    let cur = [...recentHistory, {role:'user', content:message}];
    let finalText = '';

    await sql`INSERT INTO chat_history(user_id,role,content) VALUES(${userId},'user',${message})`;

    for (let i=0; i<5; i++) {
      const res = await client.beta.messages.create({
        betas:['prompt-caching-2024-07-31'],
        model: MODEL,
        max_tokens: 700,
        system:[{type:'text',text:system,cache_control:{type:'ephemeral'}}],
        tools: toolsWithPromptCache(),
        messages: cur
      });

      const toolUses = res.content.filter(c => c.type === 'tool_use');
      if (res.stop_reason === 'end_turn' || !toolUses.length) {
        finalText = res.content.filter(c => c.type === 'text').map(c => c.text).join('\n').trim();
        break;
      }

      const results = [];
      for (const tu of toolUses) {
        const result = await runTool(tu.name, tu.input, userId);
        results.push({type:'tool_result',tool_use_id:tu.id,content:JSON.stringify(result)});
      }

      cur = [
        ...cur,
        {role:'assistant',content:res.content},
        {role:'user',content:results}
      ];
    }

    if (!finalText) finalText = 'Listo, ya quedó.';
    await sql`INSERT INTO chat_history(user_id,role,content) VALUES(${userId},'assistant',${finalText})`;
    return ok({reply:finalText});
  } catch(e) {
    return err(e.message,500);
  }
};

async function ensurePriceMemory() {
  await sql`ALTER TABLE shopping_list ADD COLUMN IF NOT EXISTS estimated_price NUMERIC(10,2) DEFAULT NULL`;
  await sql`
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
    )`;
  await sql`CREATE INDEX IF NOT EXISTS idx_product_prices ON product_prices(user_id, product_key)`;
}

async function knownPrice(userId, name) {
  const key = productKey(name);
  if (!key) return null;
  const rows = await sql`SELECT last_price FROM product_prices WHERE user_id=${userId} AND product_key=${key} LIMIT 1`;
  return rows[0]?.last_price || null;
}

function productKey(name) {
  return String(name || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g,'')
    .replace(/[^a-z0-9]+/g,' ')
    .trim()
    .replace(/\s+/g,' ');
}
