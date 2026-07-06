/**
 * api.ts — LLM Provider 抽象层
 *
 * 负责：
 * 1. 封装不同 LLM provider 的 API 调用
 * 2. SSE streaming 解析
 * 3. 错误处理与重试
 *
 * MVP 只接 DeepSeek（OpenAI 兼容协议），Provider 抽象预留扩展点。
 */

import { ChatRequest, ProviderConfig, StreamCallback } from './types';

// ============================================================
// Provider 注册表
// ============================================================

/** 默认 Provider 配置 */
const DEFAULT_PROVIDERS: Record<string, ProviderConfig> = {
  deepseek: {
    name: 'deepseek',
    baseUrl: 'https://api.deepseek.com/chat/completions',
    apiKey: '',
    defaultModel: 'deepseek-chat',
    models: ['deepseek-chat', 'deepseek-coder'],
  },
  openai: {
    name: 'openai',
    baseUrl: 'https://api.openai.com/v1/chat/completions',
    apiKey: '',
    defaultModel: 'gpt-4o-mini',
    models: ['gpt-4o-mini', 'gpt-4o', 'gpt-4-turbo'],
  },
  custom: {
    name: 'custom',
    baseUrl: '',
    apiKey: '',
    defaultModel: '',
    models: [],
  },
};

// ============================================================
// LLM Client
// ============================================================

export class LLMClient {
  private provider: ProviderConfig;
  private abortController: AbortController | null = null;

  constructor(providerName: string, apiKey: string, customBaseUrl?: string) {
    const base = { ...DEFAULT_PROVIDERS[providerName] };
    if (!base) {
      throw new Error(`Unknown provider: ${providerName}`);
    }

    this.provider = {
      ...base,
      apiKey,
      baseUrl: customBaseUrl || base.baseUrl,
    };
  }

  /** 发送流式请求 */
  async streamChat(
    messages: ChatRequest['messages'],
    model?: string,
    onToken?: StreamCallback,
    signal?: AbortSignal
  ): Promise<string> {
    const request: ChatRequest = {
      messages,
      model: model || this.provider.defaultModel,
      stream: true,
      temperature: 1,
      max_tokens: 4096,
    };

    const controller = new AbortController();
    this.abortController = controller;

    // 合并外部 signal
    if (signal) {
      signal.addEventListener('abort', () => controller.abort());
    }

    let fullText = '';

    try {
      const response = await fetch(this.provider.baseUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json;charset=utf-8',
          'Authorization': `Bearer ${this.provider.apiKey}`,
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
        return fullText; // 正常中断，返回已有文本
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

  /** 获取当前 provider 信息 */
  getProvider(): ProviderConfig {
    return this.provider;
  }
}

/** 快捷工厂：从配置创建 LLMClient */
export function createLLMClient(
  provider: string,
  apiKey: string,
  customBaseUrl?: string
): LLMClient {
  return new LLMClient(provider, apiKey, customBaseUrl);
}
