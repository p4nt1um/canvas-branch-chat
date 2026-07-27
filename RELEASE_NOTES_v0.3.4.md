# Canvas Branch Chat v0.3.4 发布说明

## 🎯 核心改进：跨平台 API Key 解决方案

解决了 macOS/Windows/Linux 全平台上 Obsidian（Electron GUI）**无法读取 shell 环境变量**的痛点。

## 新功能

### 1. 四层 API Key 降级策略 🔑

```
优先级：直接输入 Key > 插件目录 .env > Vault 根 .env > 系统环境变量
```

- **设置面板直接输入**：最高优先级，跨平台可靠
- **插件目录 .env**：`.obsidian/plugins/canvas-branch-chat/.env`，与其他插件隔离
- **Vault 根 .env**：向后兼容旧用户
- **系统环境变量**：终端启动 Obsidian 时可用

### 2. BASE_URL 自动匹配 🌐

约定：如果设置 `DEEPSEEK_API_KEY`，插件自动从 `.env` 读取 `DEEPSEEK_BASE_URL` 覆盖 Base URL。

### 3. API Key 直接输入框 🔐

设置面板每个模型配置中新增密码输入框，直接填入 Key（存储在 `data.json`，最高优先级）。

### 4. 多语言完善 🌍

- 英文/中文设置面板文案全面更新
- API Key 相关提示更友好、更明确

## 变更清单

| 文件 | 变更 |
|------|------|
| `settings.ts` | +114 行：四层降级 API Key 解析、`.env` 加载/缓存/解析、`resolveBaseUrl()`、直接输入框 |
| `types.ts` | `ModelConfig` 新增 `apiKey?` 可选字段 |
| `providers/index.ts` | `createProvider()` 支持 `resolvedBaseUrl` 参数，自动覆盖 model.baseUrl |
| `canvas-extension.ts` | 4 处调用点传入 `resolveBaseUrl()` |
| `locale/en.ts` `locale/zh.ts` | 中英文文案更新，涵盖 `.env` / 直接输入 / 优先级说明 |
| `manifest.json` `package.json` `versions.json` | 版本号 → 0.3.4 |

## 兼容性

- Obsidian >= 1.6.5
- macOS / Windows / Linux 全平台
- 向后兼容：无 `.env` 文件时行为与 v0.3.3 一致
