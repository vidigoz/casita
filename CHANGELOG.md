# Changelog — Casita

## v1.1.0 (2026-11-03)
- IA: el chat, las recetas, la categorización de productos y el matching del mandado ahora usan DeepSeek cuando está configurada `DEEPSEEK_API_KEY` (si no, siguen con Claude)
- Scan ticket: la lectura de la foto sigue con Claude (DeepSeek no lee imágenes), ahora con el modelo `claude-sonnet-4-5` y la función en el formato actual de Netlify

## v0.0.5 (2026-05-22)
- Recetas: eliminar banner con ícono, mostrar tipo de comida + mini descripción
- Recetas: no recargar al volver a la pantalla; persistir en localStorage al cerrar app
- Recetas: swipe derecho en una receta la reemplaza por una nueva del mismo tipo
- Recetas: botón "otras ideas" refresca las 3 recetas
- Recetas: porciones basadas en personas en casa (ajustes)
- Mandado → Despensa: categorización con tabla de palabras clave + fallback a IA (Haiku) para productos no reconocidos
- Mandado → Despensa: categorías ampliadas a 9 (frutas, verduras, carnes, lácteos, huevo, pan, abarrotes, limpieza, otros)
- Scan ticket: matching inteligente con IA (Haiku) para marcar mandado aunque los nombres no coincidan exacto
- Logo: agregar imagen en header junto al texto "Casita"
- FAB micrófono: arrastrable verticalmente, posición persiste en localStorage
- PWA: app instalable como webapp (manifest, service worker, íconos)
- Settings: mostrar versión del app
