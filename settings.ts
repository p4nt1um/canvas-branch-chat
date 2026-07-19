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
import { OpenAIProvider } from './providers';
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

export default class SettingsManager {
  static SETTINGS_CHANGED_EVENT = 'canvas-branch-chat:settings-changed';

  private plugin: CanvasBranchChatPlugin;
  private settings: PluginSettingsV2;
  private settingsTab: SettingsTab;

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

  /** 从模型配置解析 API Key */
  resolveApiKey(model: ModelConfig): string {
    const envVarName = model.apiKeyEnvVar?.trim();
    if (!envVarName) return '';
    return process.env[envVarName] || '';
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

              const provider = new OpenAIProvider(model, apiKey);
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
