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
import { ModelConfig, PluginSettingsV2, PROVIDER_DEFAULTS, COLOR_PRESETS } from './types';
import { generateId } from './utils';
import { LLMClient } from './api';

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
function migrateSettings(data: any): PluginSettingsV2 {
  // 已经是 V2 格式
  if (data && Array.isArray(data.models) && data.models.length > 0) {
    return Object.assign({}, DEFAULT_SETTINGS_V2, data);
  }

  // 旧版格式（单模型）
  if (data && data.apiKey !== undefined) {
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
    const raw = await this.plugin.loadData();
    this.settings = migrateSettings(raw);
    // 确保有 defaultModelId
    if (!this.settings.defaultModelId && this.settings.models.length > 0) {
      this.settings.defaultModelId = this.settings.models[0].id;
      await this.saveSettings();
    }
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

  async setSettings(data: Partial<PluginSettingsV2>) {
    Object.assign(this.settings, data);
    await this.saveSettings();
  }

  /** 添加模型 */
  async addModel(model?: Partial<ModelConfig>): Promise<ModelConfig> {
    const newModel: ModelConfig = Object.assign({
      id: generateId(8),
      alias: '新模型',
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

    containerEl.createEl('h2', { text: '模型配置' });

    // 渲染模型列表
    const models = this.manager.getModels();
    models.forEach((model) => this.renderModelCard(model));

    // 添加模型按钮
    new Setting(containerEl)
      .addButton((btn) => {
        btn
          .setButtonText('+ 添加模型')
          .onClick(async () => {
            await this.manager.addModel();
            this.display();
          });
      });

    // 全局自定义指令
    containerEl.createEl('h2', { text: '全局设置' });
    new Setting(containerEl)
      .setName('全局自定义指令')
      .setDesc('作为默认系统提示词（单个模型可覆盖此设置）')
      .addTextArea((text) => {
        text
          .setPlaceholder('例如：你是一个专业的产品经理...')
          .setValue(this.manager.getSettings().customInstructions);
        text.inputEl.rows = 3;
        text.inputEl.style.width = '100%';
        return text.onChange(async (value) => {
          await this.manager.setSettings({ customInstructions: value });
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
      titleEl.createSpan({ text: ' ⭐默认', cls: 'model-default-badge' });
    }

    const headerBtns = header.createDiv({ cls: 'model-config-actions' });
    if (!isDefault) {
      const setDefaultBtn = headerBtns.createEl('button', { text: '设为默认' });
      setDefaultBtn.addEventListener('click', async () => {
        await this.manager.setDefaultModel(model.id);
        this.display();
      });
    }
    const deleteBtn = headerBtns.createEl('button', { text: '🗑', cls: 'mod-warning' });
    deleteBtn.addEventListener('click', async () => {
      if (this.manager.getModels().length <= 1) return; // 至少保留1个
      await this.manager.removeModel(model.id);
      this.display();
    });

    // 卡片内容：各字段
    const body = card.createDiv({ cls: 'model-config-body' });

    // 别名
    new Setting(body)
      .setName('别名')
      .setDesc('显示名（如"分析师"、"魔鬼代言人"）')
      .addText((text) => {
        text.setValue(model.alias);
        text.onChange(async (value) => {
          await this.manager.updateModel(model.id, { alias: value });
        });
      });

    // Provider
    new Setting(body)
      .setName('服务商')
      .addDropdown((dropdown) => {
        dropdown
          .addOptions({ deepseek: 'DeepSeek', openai: 'OpenAI', custom: '自定义' })
          .setValue(model.provider)
          .onChange(async (value) => {
            const provider = value as 'deepseek' | 'openai' | 'custom';
            const defaults = PROVIDER_DEFAULTS[provider];
            await this.manager.updateModel(model.id, {
              provider,
              baseUrl: defaults.baseUrl || model.baseUrl,
              model: defaults.model || model.model,
            });
            this.display();
          });
      });

    // Base URL
    new Setting(body)
      .setName('API Endpoint')
      .addText((text) => {
        text.setValue(model.baseUrl);
        text.inputEl.style.width = '100%';
        text.onChange(async (value) => {
          await this.manager.updateModel(model.id, { baseUrl: value });
        });
      });

    // API Key 环境变量
    new Setting(body)
      .setName('API Key 环境变量')
      .setDesc('操作系统环境变量名（如 DEEPSEEK_API_KEY）')
      .addText((text) => {
        text.setPlaceholder('DEEPSEEK_API_KEY');
        text.setValue(model.apiKeyEnvVar);
        text.onChange(async (value) => {
          await this.manager.updateModel(model.id, { apiKeyEnvVar: value });
        });
      });

    // 连通性测试（放在环境变量和模型名称之间）
    new Setting(body)
      .setName('连通性测试')
      .setDesc('验证 API Key、Endpoint 和网络连通性，测试成功后可选择模型')
      .addButton((btn) => {
        btn
          .setButtonText('🔌 测试连接')
          .onClick(async () => {
            btn.setButtonText('测试中...');
            btn.setDisabled(true);

            const apiKey = this.manager.resolveApiKey(model);
            if (!apiKey) {
              new Notice('❌ 无法解析 API Key，请检查环境变量设置');
              btn.setButtonText('🔌 测试连接');
              btn.setDisabled(false);
              return;
            }

            const client = new LLMClient(model, apiKey);
            const result = await client.testConnection();

            btn.setButtonText('🔌 测试连接');
            btn.setDisabled(false);

            if (result.ok) {
              const models = result.models || [];
              new Notice(`✅ 连接成功！发现 ${models.length} 个可用模型`);
              // 缓存可用模型列表到配置对象
              await this.manager.updateModel(model.id, { _availableModels: models });
              this.display();
            } else {
              new Notice(`❌ 连接失败: ${result.error}`);
            }
          });
      });

    // 模型名称：测试成功后用下拉框，否则用文本框
    const modelSetting = new Setting(body)
      .setName('模型名称');

    if (model._availableModels && model._availableModels.length > 0) {
      // 下拉框模式
      modelSetting.addDropdown((dropdown) => {
        const options: Record<string, string> = {};
        for (const m of model._availableModels!) {
          options[m] = m;
        }
        // 如果当前模型不在列表里，加一个手动选项
        if (model.model && !options[model.model]) {
          options[model.model] = `${model.model} (自定义)`;
        }
        dropdown.addOptions(options);
        dropdown.setValue(model.model);
        dropdown.onChange(async (value) => {
          await this.manager.updateModel(model.id, { model: value });
        });
      });
      modelSetting.setDesc(`✅ 已获取 ${model._availableModels.length} 个可用模型（来自测试连接）`);
    } else {
      // 文本框模式
      modelSetting.setDesc('手动输入模型名称，或先点击上方「测试连接」获取可用模型列表');
      modelSetting.addText((text) => {
        text.setPlaceholder('deepseek-chat');
        text.setValue(model.model);
        text.onChange(async (value) => {
          await this.manager.updateModel(model.id, { model: value });
        });
      });
    }

    // 颜色
    new Setting(body)
      .setName('节点颜色')
      .addDropdown((dropdown) => {
        const options: Record<string, string> = {};
        COLOR_PRESETS.forEach(c => { options[c.value] = c.label; });
        dropdown.addOptions(options).setValue(model.color);
        dropdown.onChange(async (value) => {
          await this.manager.updateModel(model.id, { color: value });
        });
      });

    // 图标
    new Setting(body)
      .setName('图标')
      .setDesc('emoji（如 🤖 🔬 🔴）')
      .addText((text) => {
        text.setValue(model.icon || '');
        text.onChange(async (value) => {
          await this.manager.updateModel(model.id, { icon: value });
        });
      });

    // 系统提示词
    new Setting(body)
      .setName('系统提示词')
      .setDesc('该模型的独立人设')
      .addTextArea((text) => {
        text.setPlaceholder('你是一个严谨的分析师...');
        text.setValue(model.systemPrompt);
        text.inputEl.rows = 3;
        text.inputEl.style.width = '100%';
        text.onChange(async (value) => {
          await this.manager.updateModel(model.id, { systemPrompt: value });
        });
      });

    // Temperature
    new Setting(body)
      .setName('Temperature')
      .setDesc('0 = 严谨，2 = 发散（默认 0.7）')
      .addText((text) => {
        text.setValue(String(model.temperature ?? 0.7));
        text.onChange(async (value) => {
          const num = parseFloat(value);
          if (!isNaN(num) && num >= 0 && num <= 2) {
            await this.manager.updateModel(model.id, { temperature: num });
          }
        });
      });

    // Max Tokens
    new Setting(body)
      .setName('Max Tokens')
      .addText((text) => {
        text.setValue(String(model.maxTokens ?? 4096));
        text.onChange(async (value) => {
          const num = parseInt(value);
          if (!isNaN(num) && num > 0) {
            await this.manager.updateModel(model.id, { maxTokens: num });
          }
        });
      });
  }
}
