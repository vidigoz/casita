import Anthropic from '@anthropic-ai/sdk';

// Proveedor de IA para texto/chat.
// - Si existe DEEPSEEK_API_KEY se usa DeepSeek (vía su API compatible con Anthropic).
// - Si no, se usa Claude con ANTHROPIC_API_KEY.
const DEEPSEEK_BASE_URL = 'https://api.deepseek.com/anthropic';

export function textAI(claudeModel = 'claude-haiku-4-5-20251001') {
  const deepseekKey = process.env.DEEPSEEK_API_KEY;
  if (deepseekKey) {
    return {
      provider: 'deepseek',
      client: new Anthropic({ apiKey: deepseekKey, baseURL: DEEPSEEK_BASE_URL }),
      model: process.env.DEEPSEEK_MODEL || 'deepseek-chat'
    };
  }
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (anthropicKey) {
    return {
      provider: 'anthropic',
      client: new Anthropic({ apiKey: anthropicKey }),
      model: claudeModel
    };
  }
  return null;
}

// DeepSeek no acepta imágenes, así que la visión (lectura de tickets) sigue en Claude.
export function visionAI(claudeModel = 'claude-sonnet-4-5') {
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (!anthropicKey) return null;
  return { provider: 'anthropic', client: new Anthropic({ apiKey: anthropicKey }), model: claudeModel };
}
