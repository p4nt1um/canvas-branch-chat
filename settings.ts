import { renderSiwc } from './siwc/ui';
/**
 * settings.ts — 插件设置管理（P1 #5 多模型版本）
 *
 * 变更：
 * 1. 从单模型改为 ModelConfig[] 列表
 * 2. 兼容旧版数据自动迁移
 * 3. 设置页 UI 改为动态模型列表
 */

import CanvasBranchChatPlugin from './main';
import { PluginSettingTab, Setting, Notice } from 'obsidian';
import { ModelConfig, PluginSettingsV2, PROVIDER_DEFAULTS, COLOR_PRESETS, BranchFramework, DEFAULT_FRAMEWORKS } from './types';
import { generateId } from './utils';
import { createProvider } from './providers';
import { t, setLocale } from './locale';

// ============================================================
// 默认设置
// ============================================================

/** 创建默认模型配置 */
function createDefaultModel(): ModelConfig {
  return {
    id: generateId(8),
    alias: 'DeepSeek',
    provider: 'deepseek',
    baseUrl: PROVIDER_DEFAULTS.deepseek.baseUrl,
    apiKeyEnvVar: 'DEEPSEEK_API_KEY',
    model: PROVIDER_DEFAULTS.deepseek.model,
    color: '#4A90D9',
    icon: '🤖',
    systemPrompt: '',
    temperature: 0.7,
    maxTokens: 4096,
  };
}

export const DEFAULT_SETTINGS_V2: PluginSettingsV2 = {
  models: [createDefaultModel()],
  defaultModelId: '',
  customInstructions: '',
  branchTemplates: undefined,
  frameworks: undefined,
  contextRecentFull: 3,
  contextTruncateChars: 500,
  summaryGuidance: true,
  autoFitEnabled: true,
  autoFitMaxHeight: 600,
  language: 'auto',
};

// ============================================================
// 旧版数据迁移
// ============================================================

/** 旧版设置接口（单模型） */
interface LegacySettings {
  apiKey: string;
  provider: string;
  llm: string;
  customInstructions: string;
  customBaseUrl?: string;
}

/**
 * 检测并迁移旧版设置
 */
function migrateSettings(data: unknown): PluginSettingsV2 {
  // 已经是 V2 格式
  if (data && Array.isArray((data as PluginSettingsV2).models) && (data as PluginSettingsV2).models.length > 0) {
    return Object.assign({}, DEFAULT_SETTINGS_V2, data);
  }

  // 旧版格式（单模型）
  if (data && typeof (data as LegacySettings).apiKey !== 'undefined') {
    const legacy = data as LegacySettings;
    const model: ModelConfig = {
      id: generateId(8),
      alias: legacy.provider || 'DeepSeek',
      provider: (legacy.provider as 'deepseek' | 'openai' | 'custom') || 'deepseek',
      baseUrl: legacy.customBaseUrl || PROVIDER_DEFAULTS[legacy.provider || 'deepseek']?.baseUrl || '',
      apiKeyEnvVar: legacy.apiKey || 'DEEPSEEK_API_KEY',
      model: legacy.llm || 'deepseek-chat',
      color: '#4A90D9',
      icon: '🤖',
      systemPrompt: legacy.customInstructions || '',
      temperature: 0.7,
      maxTokens: 4096,
    };
    return {
      models: [model],
      defaultModelId: model.id,
      customInstructions: legacy.customInstructions || '',
    };
  }

  // 全新安装
  const settings = Object.assign({}, DEFAULT_SETTINGS_V2);
  settings.defaultModelId = settings.models[0].id;
  return settings;
}

// ============================================================
// 设置管理器
// ============================================================

/**
 * 跨平台环境变量读取策略：
 * macOS/Windows GUI 应用（含 Obsidian）无法读取 shell 环境变量（.zshrc/.bashrc），
 * 因此提供四层降级：
 *   直接 API Key → 插件目录 .env → vault 根 .env → process.env
 * .env 优先放在插件目录（.obsidian/plugins/canvas-branch-chat/.env），
 * 避免和其他插件的 .env 冲突；同时降级到 vault 根 .env 向后兼容旧用户。
 */

export default class SettingsManager {
  static SETTINGS_CHANGED_EVENT = 'canvas-branch-chat:settings-changed';

  private plugin: CanvasBranchChatPlugin;
  private settings: PluginSettingsV2;
  private settingsTab: SettingsTab;
  /** 从 vault 根目录 .env 文件解析的缓存 */
  private envCache: Record<string, string> = {};

  constructor(plugin: CanvasBranchChatPlugin) {
    this.plugin = plugin;
  }

  async loadSettings() {
    const raw: unknown = await this.plugin.loadData();
    this.settings = migrateSettings(raw);
    // 确保有 defaultModelId
    if (!this.settings.defaultModelId && this.settings.models.length > 0) {
      this.settings.defaultModelId = this.settings.models[0].id;
      await this.saveSettings();
    }
    // 应用语言设置
    setLocale(this.settings.language || 'auto');
    // 加载 vault .env 文件（跨平台兜底：macOS/Windows GUI 读不到 shell env）
    await this.loadEnvFile();
  }

  async saveSettings() {
    await this.plugin.saveData(this.settings);
    this.plugin.app.workspace.trigger(SettingsManager.SETTINGS_CHANGED_EVENT);
  }

  /** 获取默认模型配置 */
  getDefaultModel(): ModelConfig | null {
    return this.settings.models.find(m => m.id === this.settings.defaultModelId) || this.settings.models[0] || null;
  }

  /** 按 ID 获取模型配置 */
  getModel(id: string): ModelConfig | null {
    return this.settings.models.find(m => m.id === id) || null;
  }

  /** 获取所有模型 */
  getModels(): ModelConfig[] {
    return this.settings.models;
  }

  /**
   * 解析 .env 文本内容为 key-value 缓存
   * 格式：KEY=VALUE，支持 # 注释和空行
   */
  private parseEnvContent(content: string): Record<string, string> {
    const cache: Record<string, string> = {};
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIndex = trimmed.indexOf('=');
      if (eqIndex === -1) continue;
      const key = trimmed.slice(0, eqIndex).trim();
      const value = trimmed.slice(eqIndex + 1).trim();
      if (key && value) {
        cache[key] = value;
      }
    }
    return cache;
  }

  /**
   * 加载 .env 文件并缓存（四层降级的一部分）
   * 优先从插件目录读取（隔离、不和其他插件冲突），
   * 降级到 vault 根目录向后兼容旧用户。
   *
   * 注意：仅使用 Obsidian Vault adapter API，避免直接文件系统访问，
   * 以符合 Obsidian 社区插件审核规范（reviewer 会标记 fs 模块使用）。
   */
  private async loadEnvFile(): Promise<void> {
    const adapter = this.plugin.app.vault.adapter;

    // 1. 优先：插件目录 .env（隔离，不和其它插件打架）
    try {
      // 使用 configDir 获取当前配置目录（不一定是 .obsidian，用户可自定义）
      const configDir = this.plugin.app.vault.configDir;
      const pluginsDir = this.plugin.manifest.dir || configDir;
      const pluginEnvPath = `${pluginsDir}/.env`;
      if (await adapter.exists(pluginEnvPath)) {
        const content = await adapter.read(pluginEnvPath);
        this.envCache = this.parseEnvContent(content);
        console.log('[Canvas Branch Chat] Loaded .env from plugin directory');
        return;
      }
    } catch {
      // 插件目录无 .env，继续降级
    }

    // 2. 降级：vault 根目录 .env（向后兼容旧版用户）
    try {
      if (await adapter.exists('.env')) {
        const envFile = await adapter.read('.env');
        this.envCache = this.parseEnvContent(envFile);
        console.log('[Canvas Branch Chat] Loaded .env from vault root (fallback)');
        return;
      }
    } catch {
      // vault 根目录无 .env
    }

    this.envCache = {};
  }

  /** 从模型配置解析 API Key（四层降级：直接 Key → 插件 .env → vault .env → process.env） */
  resolveApiKey(model: ModelConfig): string {
    if (model.providerType === 'siwc') return 'siwc-session';
    // 1. 优先使用直接配置的 API Key（设置面板输入，最可靠）
    if (model.apiKey?.trim()) return model.apiKey.trim();

    const envVarName = model.apiKeyEnvVar?.trim();
    if (!envVarName) return '';

    // 2. 从 vault .env 文件读取（跨平台，macOS/Windows 可用）
    if (this.envCache[envVarName]) return this.envCache[envVarName];

    // 3. 从 system process.env 读取（终端启动 Obsidian 时有效）
    return process.env[envVarName] || '';
  }

  /**
   * 从 .env / 系统环境变量解析 Base URL
   * 约定：如果 apiKeyEnvVar = "DEEPSEEK_API_KEY"，则对应的 Base URL 变量名为 "DEEPSEEK_BASE_URL"
   * 读取优先级同 API Key：插件 .env → vault .env → process.env
   */
  resolveBaseUrl(model: ModelConfig): string {
    const envVarName = model.apiKeyEnvVar?.trim();
    if (!envVarName) return model.baseUrl;

    // 将 _API_KEY 替换为 _BASE_URL（如 DEEPSEEK_API_KEY → DEEPSEEK_BASE_URL）
    const baseUrlVar = envVarName.replace(/_API_KEY$/, '_BASE_URL');

    // 1. 插件/vault .env 缓存
    if (this.envCache[baseUrlVar]) return this.envCache[baseUrlVar];

    // 2. 系统环境变量
    if (process.env[baseUrlVar]) return process.env[baseUrlVar];

    // 3. 降级到设置面板配置的 baseUrl
    return model.baseUrl;
  }

  /** 兼容旧接口：获取默认模型的 API Key */
  resolveApiKeyLegacy(): string {
    const model = this.getDefaultModel();
    return model ? this.resolveApiKey(model) : '';
  }

  getSettings(): PluginSettingsV2 {
    return this.settings;
  }

  /** P2 #16: 获取框架列表（用户自定义优先，否则内置默认） */
  getFrameworks(): BranchFramework[] {
    return this.settings.frameworks || DEFAULT_FRAMEWORKS;
  }

  /** P2 #15: 最近 N 个 assistant 节点发全文 */
  getContextRecentFull(): number {
    return this.settings.contextRecentFull ?? 3;
  }

  /** P2 #15: 更远节点截取前 M 字 */
  getContextTruncateChars(): number {
    return this.settings.contextTruncateChars ?? 500;
  }

  /** P2 #15: 摘要引导开关 */
  getSummaryGuidance(): boolean {
    return this.settings.summaryGuidance ?? true;
  }

  /** P1 #13: 自动宽高适配开关 */
  getAutoFitEnabled(): boolean {
    return this.settings.autoFitEnabled ?? true;
  }

  /** P1 #13: 自动高度软上限（px） */
  getAutoFitMaxHeight(): number {
    return this.settings.autoFitMaxHeight ?? 600;
  }

  /** 获取语言设置 */
  getLanguage(): 'auto' | 'zh' | 'en' {
    return this.settings.language || 'auto';
  }

  async setSettings(data: Partial<PluginSettingsV2>) {
    Object.assign(this.settings, data);
    await this.saveSettings();
  }

  /** 添加模型 */
  async addModel(model?: Partial<ModelConfig>): Promise<ModelConfig> {
    const newModel: ModelConfig = Object.assign({
      id: generateId(8),
      alias: t('settings.newModel'),
      provider: 'deepseek',
      baseUrl: PROVIDER_DEFAULTS.deepseek.baseUrl,
      apiKeyEnvVar: '',
      model: PROVIDER_DEFAULTS.deepseek.model,
      color: COLOR_PRESETS[this.settings.models.length % COLOR_PRESETS.length].value,
      icon: '🤖',
      systemPrompt: '',
      temperature: 0.7,
      maxTokens: 4096,
    }, model || {});
    this.settings.models.push(newModel);
    await this.saveSettings();
    return newModel;
  }

  /** 更新模型 */
  async updateModel(id: string, patch: Partial<ModelConfig>) {
    const model = this.settings.models.find(m => m.id === id);
    if (model) {
      Object.assign(model, patch);
      await this.saveSettings();
    }
  }

  /** 删除模型 */
  async removeModel(id: string) {
    const idx = this.settings.models.findIndex(m => m.id === id);
    if (idx >= 0) {
      this.settings.models.splice(idx, 1);
      // 如果删的是默认模型，重置默认
      if (this.settings.defaultModelId === id) {
        this.settings.defaultModelId = this.settings.models[0]?.id || '';
      }
      await this.saveSettings();
    }
  }

  /** 设置默认模型 */
  async setDefaultModel(id: string) {
    this.settings.defaultModelId = id;
    await this.saveSettings();
  }

  addSettingsTab() {
    this.settingsTab = new SettingsTab(this.plugin, this);
    this.plugin.addSettingTab(this.settingsTab);
  }
}

// ============================================================
// 设置页 UI（多模型列表）
// ============================================================

class SettingsTab extends PluginSettingTab {
  private manager: SettingsManager;

  constructor(plugin: CanvasBranchChatPlugin, manager: SettingsManager) {
    super(plugin.app, plugin);
    this.manager = manager;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    // 语言设置（顶部）
    new Setting(containerEl)
      .setName(t('settings.language'))
      .setDesc(t('settings.languageDesc'))
      .addDropdown((dropdown) => {
        dropdown
          .addOptions({
            auto: t('settings.languageAuto'),
            zh: '中文',
            en: 'English',
          })
          .setValue(this.manager.getLanguage())
          .onChange((value) => {
            const language = value as 'auto' | 'zh' | 'en';
            void this.manager.setSettings({ language }).then(() => {
              setLocale(language);
              this.display(); // 用新语言重新渲染整个设置页
            });
          });
      });

    new Setting(containerEl).setName(t('settings.models')).setHeading();

    // 渲染模型列表
    const models = this.manager.getModels();
    models.forEach((model) => this.renderModelCard(model));

    // 添加模型按钮
    new Setting(containerEl)
      .addButton((btn) => {
        btn
          .setButtonText(t('settings.addModel'))
          .onClick(() => {
            void this.manager.addModel().then(() => this.display());
          });
      });

    // 全局自定义指令
    new Setting(containerEl).setName(t('settings.global')).setHeading();
    new Setting(containerEl)
      .setName(t('settings.customInstructions'))
      .setDesc(t('settings.customInstructionsDesc'))
      .addTextArea((text) => {
        text
          .setPlaceholder(t('settings.customInstructionsPh'))
          .setValue(this.manager.getSettings().customInstructions);
        text.inputEl.rows = 3;
        text.inputEl.addClass('setting-wide-input');
        return text.onChange((value) => {
          void this.manager.setSettings({ customInstructions: value });
        });
      });

    // P2 #15: 上下文分级压缩设置
    new Setting(containerEl).setName(t('settings.compression')).setHeading();

    new Setting(containerEl)
      .setName(t('settings.recentFull'))
      .setDesc(t('settings.recentFullDesc'))
      .addSlider((slider) => {
        slider
          .setLimits(1, 10, 1)
          .setValue(this.manager.getContextRecentFull())
          .onChange((value) => {
            void this.manager.setSettings({ contextRecentFull: value });
          });
      });

    new Setting(containerEl)
      .setName(t('settings.truncateChars'))
      .setDesc(t('settings.truncateCharsDesc'))
      .addSlider((slider) => {
        slider
          .setLimits(100, 2000, 100)
          .setValue(this.manager.getContextTruncateChars())
          .onChange((value) => {
            void this.manager.setSettings({ contextTruncateChars: value });
          });
      });

    new Setting(containerEl)
      .setName(t('settings.summaryGuide'))
      .setDesc(t('settings.summaryGuideDesc'))
      .addToggle((toggle) => {
        toggle
          .setValue(this.manager.getSummaryGuidance())
          .onChange((value) => {
            void this.manager.setSettings({ summaryGuidance: value });
          });
      });

    // P1 #13: AI 回答节点自动宽高适配
    new Setting(containerEl).setName(t('settings.autoFit')).setHeading();

    new Setting(containerEl)
      .setName(t('settings.autoFitEnabled'))
      .setDesc(t('settings.autoFitEnabledDesc'))
      .addToggle((toggle) => {
        toggle
          .setValue(this.manager.getAutoFitEnabled())
          .onChange((value) => {
            void this.manager.setSettings({ autoFitEnabled: value });
          });
      });

    new Setting(containerEl)
      .setName(t('settings.autoFitMaxHeight'))
      .setDesc(t('settings.autoFitMaxHeightDesc'))
      .addSlider((slider) => {
        slider
          .setLimits(200, 2000, 50)
          .setValue(this.manager.getAutoFitMaxHeight())
          .onChange((value) => {
            void this.manager.setSettings({ autoFitMaxHeight: value });
          });
      });
  }

  /** 渲染单个模型配置卡片 */
  private renderModelCard(model: ModelConfig) {
    const { containerEl } = this;
    const isDefault = model.id === this.manager.getSettings().defaultModelId;

    // 卡片容器
    const card = containerEl.createDiv({ cls: 'model-config-card' });

    // 卡片头部：别名 + 默认标记 + 删除按钮
    const header = card.createDiv({ cls: 'model-config-header' });

    const titleEl = header.createDiv({ cls: 'model-config-title' });
    titleEl.createSpan({ text: `${model.icon || '🤖'} ${model.alias}` });
    if (isDefault) {
      titleEl.createSpan({ text: t('settings.defaultBadge'), cls: 'model-default-badge' });
    }

    const headerBtns = header.createDiv({ cls: 'model-config-actions' });
    if (!isDefault) {
      const setDefaultBtn = headerBtns.createEl('button', { text: t('settings.setDefault') });
      setDefaultBtn.addEventListener('click', () => {
        void this.manager.setDefaultModel(model.id).then(() => this.display());
      });
    }
    const deleteBtn = headerBtns.createEl('button', { text: '🗑', cls: 'mod-warning' });
    deleteBtn.addEventListener('click', () => {
      if (this.manager.getModels().length <= 1) return; // 至少保留1个
      void this.manager.removeModel(model.id).then(() => this.display());
    });

    // 卡片内容：各字段
    const body = card.createDiv({ cls: 'model-config-body' });

    // 别名
    new Setting(body)
      .setName(t('settings.alias'))
      .setDesc(t('settings.aliasDesc'))
      .addText((text) => {
        text.setValue(model.alias);
        text.onChange((value) => {
          void this.manager.updateModel(model.id, { alias: value });
        });
      });

    new Setting(body).setName('Authentication').addDropdown(d => d.addOptions({openai: 'API key', siwc: 'Continue with ChatGPT'}).setValue(model.providerType === 'siwc' ? 'siwc' : 'openai').onChange(v => { void this.manager.updateModel(model.id, { providerType: v as 'openai' | 'siwc', ...(v === 'siwc' ? { model: '', _availableModels: [] } : {}) }).then(() => this.display()); }));
    if (model.providerType === 'siwc') { renderSiwc(body, model, patch => this.manager.updateModel(model.id, patch), () => this.display()); return; }

    // Provider
    new Setting(body)
      .setName(t('settings.provider'))
      .addDropdown((dropdown) => {
        dropdown
          .addOptions({ deepseek: 'DeepSeek', openai: 'OpenAI', custom: t('settings.providerCustom') })
          .setValue(model.provider)
          .onChange((value) => {
            const provider = value as 'deepseek' | 'openai' | 'custom';
            const defaults = PROVIDER_DEFAULTS[provider];
            void this.manager.updateModel(model.id, {
              provider,
              baseUrl: defaults.baseUrl || model.baseUrl,
              model: defaults.model || model.model,
            });
            this.display();
          });
      });

    // Base URL
    new Setting(body)
      .setName(t('settings.endpoint'))
      .addText((text) => {
        text.setValue(model.baseUrl);
        text.inputEl.addClass('setting-wide-input');
        text.onChange((value) => {
          void this.manager.updateModel(model.id, { baseUrl: value });
        });
      });

    // API Key 环境变量
    new Setting(body)
      .setName(t('settings.apiKeyEnv'))
      .setDesc(t('settings.apiKeyEnvDesc'))
      .addText((text) => {
        text.setPlaceholder('DEEPSEEK_API_KEY');
        text.setValue(model.apiKeyEnvVar);
        text.onChange((value) => {
          void this.manager.updateModel(model.id, { apiKeyEnvVar: value });
        });
      });

    // API Key 直接输入（解决 Ubuntu 24 等环境无法读取 env var 的问题）
    new Setting(body)
      .setName(t('settings.apiKeyDirect'))
      .setDesc(t('settings.apiKeyDirectDesc'))
      .addText((text) => {
        text.inputEl.type = 'password';
        text.setPlaceholder('sk-...');
        text.setValue(model.apiKey || '');
        text.onChange((value) => {
          void this.manager.updateModel(model.id, { apiKey: value || undefined });
        });
      });

    // 连通性测试（放在环境变量和模型名称之间）
    new Setting(body)
      .setName(t('settings.testConn'))
      .setDesc(t('settings.testConnDesc'))
      .addButton((btn) => {
        btn
          .setButtonText(t('settings.testBtn'))
          .onClick(() => {
            void (async () => {
              btn.setButtonText(t('settings.testing'));
              btn.setDisabled(true);

              const apiKey = this.manager.resolveApiKey(model);
              if (!apiKey) {
                new Notice(t('notice.testNoKey'));
                btn.setButtonText(t('settings.testBtn'));
                btn.setDisabled(false);
                return;
              }

              const baseUrl = this.manager.resolveBaseUrl(model);
              const provider = createProvider(model, apiKey, baseUrl);
              const result = await provider.testConnection();

              btn.setButtonText(t('settings.testBtn'));
              btn.setDisabled(false);

              if (result.ok) {
                const models = result.models || [];
                new Notice(t('notice.testOk', { n: models.length }));
                // 缓存可用模型列表到配置对象
                void this.manager.updateModel(model.id, { _availableModels: models });
                this.display();
              } else {
                new Notice(t('notice.testFail', { error: result.error || '' }));
              }
            })();
          });
      });

    // 模型名称：测试成功后用下拉框，否则用文本框
    const modelSetting = new Setting(body)
      .setName(t('settings.modelName'));

    if (model._availableModels && model._availableModels.length > 0) {
      // 下拉框模式
      modelSetting.addDropdown((dropdown) => {
        const options: Record<string, string> = {};
        for (const m of model._availableModels!) {
          options[m] = m;
        }
        // 如果当前模型不在列表里，加一个手动选项
        if (model.model && !options[model.model]) {
          options[model.model] = t('settings.modelCustom', { model: model.model });
        }
        dropdown.addOptions(options);
        dropdown.setValue(model.model);
        dropdown.onChange((value) => {
          void this.manager.updateModel(model.id, { model: value });
        });
      });
      modelSetting.setDesc(t('settings.modelNameAuto', { n: model._availableModels.length }));
    } else {
      // 文本框模式
      modelSetting.setDesc(t('settings.modelNameManual'));
      modelSetting.addText((text) => {
        text.setPlaceholder('deepseek-chat');
        text.setValue(model.model);
        text.onChange((value) => {
          void this.manager.updateModel(model.id, { model: value });
        });
      });
    }

    // 颜色
    new Setting(body)
      .setName(t('settings.nodeColor'))
      .addDropdown((dropdown) => {
        const options: Record<string, string> = {};
        COLOR_PRESETS.forEach(c => { options[c.value] = c.label; });
        dropdown.addOptions(options).setValue(model.color);
        dropdown.onChange((value) => {
          void this.manager.updateModel(model.id, { color: value });
        });
      });

    // 图标
    new Setting(body)
      .setName(t('settings.icon'))
      .setDesc(t('settings.iconDesc'))
      .addText((text) => {
        text.setValue(model.icon || '');
        text.onChange((value) => {
          void this.manager.updateModel(model.id, { icon: value });
        });
      });

    // 系统提示词
    new Setting(body)
      .setName(t('settings.systemPrompt'))
      .setDesc(t('settings.systemPromptDesc'))
      .addTextArea((text) => {
        text.setPlaceholder(t('settings.systemPromptPh'));
        text.setValue(model.systemPrompt);
        text.inputEl.rows = 3;
        text.inputEl.addClass('setting-wide-input');
        text.onChange((value) => {
          void this.manager.updateModel(model.id, { systemPrompt: value });
        });
      });

    // Temperature
    new Setting(body)
      .setName(t('settings.temperature'))
      .setDesc(t('settings.temperatureDesc'))
      .addText((text) => {
        text.setValue(String(model.temperature ?? 0.7));
        text.onChange((value) => {
          const num = parseFloat(value);
          if (!isNaN(num) && num >= 0 && num <= 2) {
            void this.manager.updateModel(model.id, { temperature: num });
          }
        });
      });

    // Max Tokens
    new Setting(body)
      .setName(t('settings.maxTokens'))
      .addText((text) => {
        text.setValue(String(model.maxTokens ?? 4096));
        text.onChange((value) => {
          const num = parseInt(value);
          if (!isNaN(num) && num > 0) {
            void this.manager.updateModel(model.id, { maxTokens: num });
          }
        });
      });
  }
}
