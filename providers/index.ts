/**
 * providers/index.ts — Provider 工厂 + 统一导出
 *
 * P2 Provider 抽象重构：根据 ModelConfig.providerType 返回对应 ChatProvider 实例。
 * 为未来 ClaudeCLIProvider 等新增 Provider 预留扩展点。
 */

import { ChatProvider, ModelConfig } from '../types';
import { OpenAIProvider } from './openai-provider';

/**
 * 根据模型配置创建对应的 Provider 实例
 * @param model 模型配置
 * @param apiKey 已解析的 API Key
 */
export function createProvider(model: ModelConfig, apiKey: string): ChatProvider {
  const providerType = model.providerType || 'openai';

  switch (providerType) {
    case 'openai':
      return new OpenAIProvider(model, apiKey);
    // 未来扩展点:
    // case 'claude-cli':
    //   return new ClaudeCLIProvider(model, apiKey);
    default:
      // 未知类型默认走 OpenAI 兼容
      return new OpenAIProvider(model, apiKey);
  }
}

export { OpenAIProvider } from './openai-provider';
