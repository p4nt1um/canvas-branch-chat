/**
 * api.ts — LLM Provider 抽象层
 *
 * P1 #5: 支持多模型配置
 * 接收 ModelConfig 对象，从中读取 endpoint/key/model 等参数
 */

import { ChatRequest, StreamCallback, ModelConfig } from './types';

// ============================================================
// LLM Client
// ============================================================

export class LLMClient {
  private model: ModelConfig;
  private apiKey: string;
  private abortController: AbortController | null = null;

  /**
   * @param model 模型配置
   * @param apiKey 已解析的 API Key（从环境变量读取后的实际值）
   */
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
    // 构建系统提示词
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
        throw new Error(`API error: ${response.status} ${response.statusText}`);
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

  /**
   * 连通性测试：GET /v1/models（或 /models）
   * 验证 API Key + endpoint + 网络连通性
   */
  async testConnection(): Promise<{ ok: boolean; models?: string[]; error?: string }> {
    try {
      // 将 chat/completions 替换为 models
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

/** 快捷工厂：从 ModelConfig 创建 LLMClient */
export function createLLMClient(model: ModelConfig, apiKey: string): LLMClient {
  return new LLMClient(model, apiKey);
}
