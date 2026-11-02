import { ChatProvider, ChatMessage, ModelConfig, StreamCallback } from '../types';
import { getSession } from '../siwc/session';
import { readResponses, RESOURCE } from '../siwc/protocol';
export class SiwcProvider implements ChatProvider {
  constructor(private model: ModelConfig) {}
  async catalog(): Promise<Array<{slug: string; display_name: string; supported_reasoning_levels?: Array<{effort: string}>}>> {
    const s = getSession(); const token = await s.access();
    const r = await s.request(RESOURCE + '/models', { headers: { Authorization: `Bearer ${token}` } });
    if (!r.ok) throw new Error(`ChatGPT model discovery failed (${r.status})`);
    const data = await r.json(); if (!Array.isArray(data.models)) throw new Error('Invalid model catalog');
    return data.models.filter((m: any) => m.visibility === 'list' && typeof m.slug === 'string' && typeof m.display_name === 'string').map((m: any) => ({ slug: m.slug, display_name: m.display_name, supported_reasoning_levels: Array.isArray(m.supported_reasoning_levels) ? m.supported_reasoning_levels.filter((l: any) => typeof l.effort === 'string').map((l: any) => ({ effort: l.effort })) : [] }));
  }
  async testConnection() { try { return { ok: true, models: (await this.catalog()).map(m => m.slug) }; } catch(e) { return { ok: false, error: e instanceof Error ? e.message : 'SIWC unavailable' }; } }
  async streamChat(messages: ChatMessage[], onToken?: StreamCallback, signal?: AbortSignal) {
    const s = getSession();
    const models = await this.catalog(); if (!models.some(m => m.slug === this.model.model)) throw new Error('Select an authorized ChatGPT model in settings');
    const effort = this.model.reasoningEffort;
    if (effort && !models.find(m => m.slug === this.model.model)?.supported_reasoning_levels?.some(l => l.effort === effort)) throw new Error('Selected reasoning effort is unavailable for this model');
    const token = await s.access();
    const instructions = messages.filter(m => m.role === 'system').map(m => m.content).join('\n') || this.model.systemPrompt;
    const r = await s.request(RESOURCE + '/responses', { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Accept: 'text/event-stream' }, body: JSON.stringify({ model: this.model.model, input: messages.filter(m => m.role !== 'system'), ...(instructions ? { instructions } : {}), store: false, stream: true, ...(effort ? { reasoning: { effort } } : {}) }), signal });
    if (!r.ok || !r.body) throw new Error(`ChatGPT request failed (${r.status}); check plan allowance and sign-in`);
    const text = await readResponses(r.body, t => onToken?.(t));
    return text;
  }
}
