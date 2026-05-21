import { ok, err, cors } from './_lib.js';

export const handler = async ev => {
  if (ev.httpMethod==='OPTIONS') return cors();
  const city = (ev.queryStringParameters||{}).city || 'Mexico City';
  const apiKey = process.env.OPENWEATHER_API_KEY;

  // Sin API key de clima, devolvemos datos mínimos
  if (!apiKey) return ok({temp:22, city, description:'', alert:''});

  try {
    const res = await fetch(`https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(city)}&appid=${apiKey}&units=metric&lang=es`);
    const d   = await res.json();
    if (!res.ok) return ok({temp:22, city, description:'', alert:''});

    const temp = Math.round(d.main?.temp||22);
    const desc = d.weather?.[0]?.description||'';
    const rain = (d.rain?.['1h']||0) > 0 || desc.includes('lluvia');
    return ok({
      temp,
      city: d.name||city,
      description: desc,
      alert: rain ? 'posible lluvia — lleva paraguas' : ''
    });
  } catch(e) { return ok({temp:22, city, description:'', alert:''}); }
};
