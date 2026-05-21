import Anthropic from '@anthropic-ai/sdk';
import { sql, ok, err, cors, body, uid } from './_lib.js';

const SYSTEM = `Eres Casita, asistente del hogar para mamás mexicanas.

CONTEXTO: Solo conoces lo que hay en la base de datos de esta persona. 
Si te preguntan noticias, política, clima de otros países, deportes u otras cosas externas, 
responde amablemente: "Eso no lo sé, pero en lo que tiene que ver con tu hogar aquí estoy 😊"

PERSONALIDAD: Amiga de confianza. Directa, cálida, sin rodeos. Máximo 3 líneas.
Hablas natural: "jitomate", "ahorita", "el mandado", "¿cuántos eran?"

HERRAMIENTAS: Úsalas cuando aplique — no esperes que la usuaria sea explícita.
- "hice X para Y" → descontar_despensa()
- "se acabó X" / "ya no hay X" → actualizar_despensa(nivel=agotado)
- "queda poco X" → actualizar_despensa(nivel=poco)
- "compré X" / "ya hay X" → actualizar_despensa(nivel=lleno)
- "necesito X" / "falta X" / "agrega X al mandado" → agregar_mandado()
- "recuérdame X" / "tengo cita" / "mañana hay" → agregar_tarea()
- "quiero organizar X" / "voy a hacer una fiesta" / "empecé un negocio" → crear_proyecto()`;

const TOOLS = [
  {
    name:'actualizar_despensa',
    description:'Cambia el nivel de un producto en la despensa.',
    input_schema:{type:'object',required:['nombre','nivel'],properties:{
      nombre:{type:'string'},
      nivel:{type:'string',enum:['lleno','suficiente','poco','agotado']},
      categoria:{type:'string',description:'carnes|verduras|frutas|lacteos|abarrotes|pan|limpieza|otros'},
      cantidad:{type:'string'}
    }}
  },
  {
    name:'descontar_despensa',
    description:'Descuenta ingredientes al registrar que se cocinó algo.',
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
    description:'Agrega productos a la lista de compras.',
    input_schema:{type:'object',required:['productos'],properties:{
      productos:{type:'array',items:{type:'object',required:['nombre'],properties:{
        nombre:{type:'string'},cantidad:{type:'string'},categoria:{type:'string'},razon:{type:'string'}
      }}}
    }}
  },
  {
    name:'agregar_tarea',
    description:'Agrega un recordatorio o tarea.',
    input_schema:{type:'object',required:['titulo'],properties:{
      titulo:{type:'string'},fecha:{type:'string',description:'YYYY-MM-DD'},
      hora:{type:'string',description:'HH:MM'},categoria:{type:'string'}
    }}
  },
  {
    name:'crear_proyecto',
    description:'Crea un proyecto (checklist para eventos/tareas, tracker_dinero para préstamos/ahorros).',
    input_schema:{type:'object',required:['tipo','titulo'],properties:{
      tipo:{type:'string',enum:['checklist','tracker_dinero']},
      titulo:{type:'string'},
      items:{type:'array',items:{type:'string'},description:'Para checklist: tareas'},
      meta_total:{type:'number',description:'Para tracker_dinero: monto total'},
      descripcion:{type:'string'}
    }}
  }
];

async function runTool(name, input, userId) {
  if (name==='actualizar_despensa') {
    await sql`INSERT INTO pantry(user_id,name,category,level,approx_quantity) VALUES(${userId},${input.nombre},${input.categoria||'otros'},${input.nivel},${input.cantidad||null}) ON CONFLICT(user_id,name) DO UPDATE SET level=EXCLUDED.level,approx_quantity=COALESCE(EXCLUDED.approx_quantity,pantry.approx_quantity),last_updated=NOW()`;
    if (input.nivel==='poco'||input.nivel==='agotado') {
      await sql`INSERT INTO shopping_list(user_id,name,category,source,reason) VALUES(${userId},${input.nombre},${input.categoria||null},'ai_suggestion',${input.nivel==='agotado'?'se agotó':'queda poco'}) ON CONFLICT DO NOTHING`;
    }
    return {ok:true};
  }
  if (name==='descontar_despensa') {
    await sql`INSERT INTO meals_history(user_id,dish_name,servings,ingredients_used) VALUES(${userId},${input.platillo},${input.porciones},${JSON.stringify(input.ingredientes)})`;
    for (const ing of input.ingredientes) {
      await sql`INSERT INTO pantry(user_id,name,category,level) VALUES(${userId},${ing.nombre},${ing.categoria||'otros'},${ing.nivel_nuevo}) ON CONFLICT(user_id,name) DO UPDATE SET level=EXCLUDED.level,last_updated=NOW()`;
      if (ing.nivel_nuevo==='poco'||ing.nivel_nuevo==='agotado') {
        await sql`INSERT INTO shopping_list(user_id,name,category,source,reason) VALUES(${userId},${ing.nombre},${ing.categoria||null},'ai_suggestion',${ing.nivel_nuevo==='agotado'?'se agotó':'queda poco'}) ON CONFLICT DO NOTHING`;
      }
    }
    return {ok:true};
  }
  if (name==='agregar_mandado') {
    for (const p of input.productos) {
      await sql`INSERT INTO shopping_list(user_id,name,quantity,category,source,reason) VALUES(${userId},${p.nombre},${p.cantidad||null},${p.categoria||null},'user',${p.razon||null})`;
    }
    return {ok:true};
  }
  if (name==='agregar_tarea') {
    await sql`INSERT INTO tasks(user_id,title,due_date,due_time,category) VALUES(${userId},${input.titulo},${input.fecha||null},${input.hora||null},${input.categoria||null})`;
    return {ok:true};
  }
  if (name==='crear_proyecto') {
    const data = {tipo:input.tipo,descripcion:input.descripcion||'',items:input.items||[],meta_total:input.meta_total||null,checked:{},abonos:[]};
    await sql`INSERT INTO projects(user_id,title,type,data) VALUES(${userId},${input.titulo},${input.tipo},${JSON.stringify(data)})`;
    return {ok:true};
  }
  return {ok:false,error:'unknown tool'};
}

export const handler = async ev => {
  if (ev.httpMethod==='OPTIONS') return cors();
  if (ev.httpMethod!=='POST') return err('Method not allowed',405);
  const userId = uid(ev);
  if (!userId) return err('No autenticado',401);
  const {message, history=[]} = body(ev);
  if (!message) return err('Mensaje vacío');
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return err('Sin API key',500);

  try {
    const client = new Anthropic({apiKey});
    const user = await sql`SELECT casita_name,household_size,city FROM users WHERE id=${userId}`;
    const u = user[0]||{};
    const system = `${SYSTEM}\n\nUSUARIA: ${u.casita_name||'—'} · ${u.household_size||4} personas · ${u.city||'CDMX'} · fecha: ${new Date().toISOString().split('T')[0]}`;

    const msgs = [...history.map(h=>({role:h.role,content:h.content})), {role:'user',content:message}];
    await sql`INSERT INTO chat_history(user_id,role,content) VALUES(${userId},'user',${message})`;

    let finalText='';
    let cur = msgs;
    for (let i=0;i<5;i++) {
      const res = await client.messages.create({model:'claude-sonnet-4-20250514',max_tokens:1024,system,tools:TOOLS,messages:cur});
      if (res.stop_reason==='end_turn'||!res.content.some(c=>c.type==='tool_use')) {
        finalText = res.content.filter(c=>c.type==='text').map(c=>c.text).join('\n');
        break;
      }
      const toolUses = res.content.filter(c=>c.type==='tool_use');
      const results  = [];
      for (const tu of toolUses) {
        const r = await runTool(tu.name, tu.input, userId);
        results.push({type:'tool_result',tool_use_id:tu.id,content:JSON.stringify(r)});
      }
      cur = [...cur,{role:'assistant',content:res.content},{role:'user',content:results}];
    }

    await sql`INSERT INTO chat_history(user_id,role,content) VALUES(${userId},'assistant',${finalText})`;
    return ok({reply:finalText});
  } catch(e) { return err(e.message,500); }
};
