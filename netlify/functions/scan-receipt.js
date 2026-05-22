import Anthropic from '@anthropic-ai/sdk';
import { sql, ok, err, cors, body, uid } from './_lib.js';

export const handler = async ev => {
  if (ev.httpMethod==='OPTIONS') return cors();
  if (ev.httpMethod!=='POST') return err('Method not allowed',405);
  const userId = uid(ev); if (!userId) return err('No autenticado',401);
  const {image_base64, mime_type='image/jpeg'} = body(ev);
  if (!image_base64) return err('Falta imagen');
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return err('Sin API key',500);

  try {
    const client = new Anthropic({apiKey});

    // 1. Leer el ticket con Sonnet (visión)
    const res = await client.messages.create({
      model:'claude-sonnet-4-20250514',
      max_tokens:2048,
      messages:[{role:'user',content:[
        {type:'image',source:{type:'base64',media_type:mime_type,data:image_base64}},
        {type:'text',text:`Analiza este ticket de compra mexicano. Extrae TODOS los productos.
Responde SOLO con JSON válido sin markdown:
{"tienda":"nombre","total":número,"fecha":"YYYY-MM-DD o null","productos":[{"nombre":"nombre limpio en español","cantidad":"1 kg o 2 pzas","precio":número,"categoria":"carnes|verduras|frutas|lacteos|abarrotes|pan|limpieza|otros"}]}
Nombre limpio: "JTOM SALAD KG" → "Jitomate". Marcas conocidas: Lala, Bimbo, La Costeña, Maseca, etc.`}
      ]}]
    });
    let text = res.content.filter(c=>c.type==='text').map(c=>c.text).join('').trim();
    text = text.replace(/^```json\s*/i,'').replace(/```$/,'').trim();
    let parsed;
    try { parsed = JSON.parse(text); } catch(e) { return err('No se pudo leer el ticket. Intenta con foto más clara.',422); }

    await sql`INSERT INTO receipts(user_id,store,total,items) VALUES(${userId},${parsed.tienda||'?'},${parsed.total||0},${JSON.stringify(parsed.productos||[])})`;

    // 2. Actualizar despensa
    let added = 0;
    for (const p of (parsed.productos||[])) {
      if (!p.nombre) continue;
      await sql`INSERT INTO pantry(user_id,name,category,level,approx_quantity) VALUES(${userId},${p.nombre},${p.categoria||'otros'},'lleno',${p.cantidad||null}) ON CONFLICT(user_id,name) DO UPDATE SET level='lleno',last_updated=NOW(),approx_quantity=COALESCE(EXCLUDED.approx_quantity,pantry.approx_quantity)`;
      added++;
    }

    // 3. Marcar mandado con IA si hay items pendientes
    const pendientes = await sql`SELECT id, name FROM shopping_list WHERE user_id=${userId} AND done=FALSE`;
    if (pendientes.length > 0 && parsed.productos?.length > 0) {
      const comprados = parsed.productos.map(p=>p.nombre).filter(Boolean);
      const matchRes = await client.messages.create({
        model:'claude-haiku-4-5-20251001',
        max_tokens:512,
        messages:[{role:'user',content:`Tienes una lista de compras pendientes y una lista de productos comprados en un ticket.
Determina cuáles items del mandado fueron comprados, aunque los nombres no coincidan exactamente (por ejemplo "limones" y "Limón" son lo mismo).

Mandado pendiente (id: nombre):
${pendientes.map(i=>`${i.id}: ${i.name}`).join('\n')}

Productos comprados en el ticket:
${comprados.join('\n')}

Responde SOLO con JSON válido sin markdown:
{"matches":[id1,id2,...]}
Solo incluye los ids que claramente fueron comprados. Si no hay matches, responde {"matches":[]}.`}]
      });
      let matchText = matchRes.content.filter(c=>c.type==='text').map(c=>c.text).join('').trim();
      matchText = matchText.replace(/^```json\s*/i,'').replace(/```$/,'').trim();
      try {
        const {matches=[]} = JSON.parse(matchText);
        for (const id of matches) {
          await sql`UPDATE shopping_list SET done=TRUE WHERE id=${id} AND user_id=${userId}`;
        }
      } catch(e) { /* si falla el match, no bloqueamos */ }
    }

    return ok({parsed,items_added:added});
  } catch(e) { return err(e.message,500); }
};
