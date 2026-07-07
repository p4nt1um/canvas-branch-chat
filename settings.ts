/**
 * settings.ts — 插件设置管理
 * 
 * 基于 fork 的 SettingsManager 重构：
 * 1. 修复 Object.keys().first() 非标准调用
 * 2. 增加 provider 选择
 * 3. 保持事件驱动的设置变更模式
 */

import CanvasBranchChatPlugin from './main';
import { PluginSettingTab, Setting } from 'obsidian';

/** Provider 选项 */
const PROVIDERS: Record<string, string> = {
  'deepseek': 'DeepSeek',
  'openai': 'OpenAI',
  'custom': '自定义',
};

/** 获取第一个 key（替代 Object.keys().first()） */
function firstKey<T extends Record<string, any>>(obj: T): string {
  return Object.keys(obj)[0];
}

// ============================================================
// 设置接口
// ============================================================

export interface PluginSettings {
  apiKey: string;
  provider: string;
  llm: string;
  customInstructions: string;
  /** P1: 自定义 API endpoint */
  customBaseUrl?: string;
}

export const DEFAULT_SETTINGS: PluginSettings = {
  apiKey: '',
  provider: firstKey(PROVIDERS),
  llm: 'deepseek-chat',
  customInstructions: '',
};

// ============================================================
// 设置页 UI
// ============================================================

export class SettingsTab extends PluginSettingTab {
  private manager: SettingsManager;

  constructor(plugin: CanvasBranchChatPlugin, manager: SettingsManager) {
    super(plugin.app, plugin);
    this.manager = manager;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    // Provider 选择
    new Setting(containerEl)
      .setName('AI 服务商')
      .setDesc('选择大模型服务商')
      .addDropdown((dropdown) => {
        dropdown
          .addOptions(PROVIDERS)
          .setValue(this.manager.getSetting('provider'))
          .onChange(async (value) => {
            await this.manager.setSetting({ provider: value });
          });
      });

    // API Key（环境变量名）
    new Setting(containerEl)
      .setName('API Key')
      .setDesc('填入操作系统环境变量名称（如 DEEPSEEK_API_KEY），插件会从环境变量中安全读取密钥。避免明文泄露。')
      .addText((text) => {
        text
          .setPlaceholder('DEEPSEEK_API_KEY')
          .setValue(this.manager.getSetting('apiKey'));
        text.inputEl.type = 'text';
        text.inputEl.spellcheck = false;
        return text.onChange(async (value) => {
          await this.manager.setSetting({ apiKey: value });
        });
      });

    // 模型名称（手动输入）
    new Setting(containerEl)
      .setName('模型')
      .setDesc('手动输入模型名称（如 deepseek-chat、gpt-4o-mini 等）。后续版本将支持从远端动态获取模型列表并测试连通性。')
      .addText((text) =>
        text
          .setPlaceholder('deepseek-chat')
          .setValue(this.manager.getSetting('llm'))
          .onChange(async (value) => {
            await this.manager.setSetting({ llm: value });
          })
      );

    // 自定义指令
    new Setting(containerEl)
      .setName('自定义指令')
      .setDesc('给 AI 的系统提示词')
      .addTextArea((text) =>
        text
          .setPlaceholder('例如：你是一个专业的产品经理...')
          .setValue(this.manager.getSetting('customInstructions'))
          .onChange(async (value) => {
            await this.manager.setSetting({ customInstructions: value });
          })
      );
  }
}

// ============================================================
// 设置管理器
// ============================================================

export default class SettingsManager {
  static SETTINGS_CHANGED_EVENT = 'canvas-branch-chat:settings-changed';

  private plugin: CanvasBranchChatPlugin;
  private settings: PluginSettings;
  private settingsTab: SettingsTab;

  constructor(plugin: CanvasBranchChatPlugin) {
    this.plugin = plugin;
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.plugin.loadData());
  }

  async saveSettings() {
    await this.plugin.saveData(this.settings);
    this.plugin.app.workspace.trigger(SettingsManager.SETTINGS_CHANGED_EVENT);
  }

  getSetting<T extends keyof PluginSettings>(key: T): PluginSettings[T] {
    return this.settings[key];
  }

  /**
   * 从操作系统环境变量中解析 API Key
   * settings.apiKey 存储的是环境变量名称（如 DEEPSEEK_API_KEY），
   * 而非明文密钥。调用此方法获取实际密钥值。
   */
  resolveApiKey(): string {
    const envVarName = this.settings.apiKey?.trim();
    if (!envVarName) return '';
    return process.env[envVarName] || '';
  }

  async setSetting(data: Partial<PluginSettings>) {
    Object.assign(this.settings, data);
    await this.saveSettings();
  }

  addSettingsTab() {
    this.settingsTab = new SettingsTab(this.plugin, this);
    this.plugin.addSettingTab(this.settingsTab);
  }
}
