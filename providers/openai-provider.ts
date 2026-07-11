/**
 * providers/openai-provider.ts — OpenAI 兼容 HTTP API Provider
 *
 * P2 Provider 抽象重构：从 api.ts 搬迁，实现 ChatProvider 接口。
 * 支持所有 OpenAI 兼容协议的服务（DeepSeek / OpenAI / Ollama / 自定义端点）。
 */

import { ChatRequest, StreamCallback, ModelConfig, ChatProvider } from '../types';

export class OpenAIProvider implements ChatProvider {
  private model: ModelConfig;
  private apiKey: string;
  private abortController: AbortController | null = null;

  constructor(model: ModelConfig, apiKey: string) {
    this.model = model;
    this.apiKey = apiKey;
  }

  /** 发送流式请求 */
  async streamChat(
    messages: ChatRequest['messages'],
    onToken?: StreamCallback,
    signal?: AbortSignal
  ): Promise<string> {
    const finalMessages = [...messages];
    const systemPrompt = this.model.systemPrompt;
    if (systemPrompt && !finalMessages.some(m => m.role === 'system')) {
      finalMessages.unshift({ role: 'system', content: systemPrompt });
    }

    const request: ChatRequest = {
      messages: finalMessages,
      model: this.model.model,
      stream: true,
      temperature: this.model.temperature ?? 0.7,
      max_tokens: this.model.maxTokens ?? 4096,
    };

    const controller = new AbortController();
    this.abortController = controller;

    if (signal) {
      signal.addEventListener('abort', () => controller.abort());
    }

    let fullText = '';

    try {
      const response = await fetch(this.model.baseUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json;charset=utf-8',
          'Authorization': `Bearer ${this.apiKey}`,
          'Accept': 'text/event-stream',
        },
        body: JSON.stringify(request),
        signal: controller.signal,
      });

      if (!response.ok) {
        let errorDetail = `${response.status} ${response.statusText}`;
        try {
          const errorBody = await response.text();
          const errorJson = JSON.parse(errorBody);
          if (errorJson.error?.message) {
            errorDetail += `: ${errorJson.error.message}`;
          } else {
            errorDetail += `: ${errorBody.slice(0, 200)}`;
          }
        } catch {
          // response 不是 JSON
        }
        throw new Error(`API error: ${errorDetail}`);
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('No response body');
      }

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith('data: ')) continue;

          const data = trimmed.slice(6);
          if (data === '[DONE]') continue;

          try {
            const parsed = JSON.parse(data);
            const token = parsed.choices?.[0]?.delta?.content;
            if (token) {
              fullText += token;
              onToken?.(token);
            }
          } catch {
            // 跳过无法解析的 chunk
          }
        }
      }
    } catch (error: any) {
      if (error.name === 'AbortError') {
        return fullText;
      }
      throw error;
    } finally {
      this.abortController = null;
    }

    return fullText;
  }

  /** 取消当前请求 */
  abort(): void {
    this.abortController?.abort();
  }

  /** 获取当前模型配置 */
  getModel(): ModelConfig {
    return this.model;
  }

  /** 连通性测试：GET /models */
  async testConnection(): Promise<{ ok: boolean; models?: string[]; error?: string }> {
    try {
      const modelsUrl = this.model.baseUrl
        .replace('/chat/completions', '/models')
        .replace('/v1/chat/completions', '/v1/models');

      const response = await fetch(modelsUrl, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
        },
      });

      if (!response.ok) {
        return { ok: false, error: `HTTP ${response.status}: ${response.statusText}` };
      }

      const data = await response.json();
      const models = data?.data?.map((m: any) => m.id) || [];
      return { ok: true, models };
    } catch (error: any) {
      return { ok: false, error: error.message || '连接失败' };
    }
  }
}

/** 快捷工厂 */
export function createOpenAIProvider(model: ModelConfig, apiKey: string): OpenAIProvider {
  return new OpenAIProvider(model, apiKey);
}
