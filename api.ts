/**
 * api.ts — 向后兼容 re-export（废弃）
 *
 * P2 Provider 抽象重构后，原 LLMClient 已迁移到 providers/openai-provider.ts。
 * 本文件保留向后兼容别名，外部模块无需立即修改 import 路径。
 *
 * @deprecated 新代码请从 providers/ 导入
 */

export { OpenAIProvider as LLMClient, createOpenAIProvider as createLLMClient } from './providers/openai-provider';
