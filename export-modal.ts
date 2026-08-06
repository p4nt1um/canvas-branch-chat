/**
 * 导出配置弹窗
 */

import { App, Modal, Setting, Notice } from 'obsidian';
import type { ExportConfig } from './export-types';
import { DEFAULT_CONFIG } from './export-types';

export class ExportConfigModal extends Modal {
  private config: ExportConfig;
  private onConfirm: (config: ExportConfig) => void;
  private nodeCount: number;
  private estimatedSize: string;

  constructor(
    app: App,
    nodeCount: number,
    onConfirm: (config: ExportConfig) => void
  ) {
    super(app);
    this.config = { ...DEFAULT_CONFIG };
    this.onConfirm = onConfirm;
    this.nodeCount = nodeCount;
    this.estimatedSize = this.calcEstimatedSize();
  }

  private calcEstimatedSize(): string {
    // 基础 HTML + CSS + JS ~15KB
    // marked.js ~20KB
    // 每个节点 ~500 bytes
    const baseSize = 35; // KB
    const perNodeSize = 0.5; // KB
    const total = baseSize + this.nodeCount * perNodeSize;
    if (total < 100) return `~${Math.round(total)} KB`;
    return `~${(total / 1000).toFixed(1)} MB`;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.addClass('export-config-modal');
    contentEl.createEl('h3', { text: '📥 导出交互式 HTML' });

    // 视图模式
    new Setting(contentEl)
      .setName('视图模式')
      .setDesc('默认显示的视图模式')
      .addDropdown(dropdown => {
        dropdown
          .addOption('flow', '🌊 流式对话视图（推荐）')
          .addOption('tree', '🌳 分支树视图（高级）')
          .setValue(this.config.viewMode)
          .onChange(value => {
            this.config.viewMode = value as 'flow' | 'tree';
          });
      });

    // 主题
    new Setting(contentEl)
      .setName('主题')
      .addDropdown(dropdown => {
        dropdown
          .addOption('auto', '🌓 跟随系统')
          .addOption('light', '☀️ 亮色')
          .addOption('dark', '🌙 暗色')
          .setValue(this.config.theme)
          .onChange(value => {
            this.config.theme = value as 'light' | 'dark' | 'auto';
          });
      });

    // 包含功能
    contentEl.createEl('h4', { text: '包含功能' });

    const toggleSetting = new Setting(contentEl)
      .setName('📋 节点展开/收起')
      .addToggle(toggle => {
        toggle
          .setValue(this.config.includeToggle)
          .onChange(value => {
            this.config.includeToggle = value;
          });
      });

    const replaySetting = new Setting(contentEl)
      .setName('▶️ 对话回放')
      .addToggle(toggle => {
        toggle
          .setValue(this.config.includeReplay)
          .onChange(value => {
            this.config.includeReplay = value;
          });
      });

    const searchSetting = new Setting(contentEl)
      .setName('🔍 搜索功能')
      .addToggle(toggle => {
        toggle
          .setValue(this.config.includeSearch)
          .onChange(value => {
            this.config.includeSearch = value;
          });
      });

    // 导出信息
    contentEl.createEl('hr');
    const infoDiv = contentEl.createDiv({ cls: 'export-info' });
    infoDiv.createEl('p', { text: `📊 节点数: ${this.nodeCount}` });
    infoDiv.createEl('p', { text: `📦 预估文件大小: ${this.estimatedSize}` });
    infoDiv.createEl('p', { text: `✅ Markdown 渲染已启用` });
    infoDiv.createEl('p', { text: `📱 移动端适配已启用` });

    // 按钮
    const buttonDiv = contentEl.createDiv({ cls: 'export-buttons' });

    const cancelBtn = buttonDiv.createEl('button', { text: '取消' });
    cancelBtn.addEventListener('click', () => this.close());

    const exportBtn = buttonDiv.createEl('button', {
      text: '📥 导出',
      cls: 'mod-cta'
    });
    exportBtn.addEventListener('click', () => {
      this.onConfirm(this.config);
      this.close();
    });
  }

  onClose() {
    this.contentEl.empty();
  }
}

/**
 * 弹出文件保存对话框，导出 HTML
 */
export async function saveExportFile(
  app: App,
  content: string,
  defaultName: string
): Promise<void> {
  try {
    // 使用 Obsidian 文件选择器
    const { dialog } = require('@electron/remote') || {};

    if (dialog) {
      // Electron 环境
      const result = await dialog.showSaveDialog({
        defaultPath: defaultName,
        filters: [{ name: 'HTML 文件', extensions: ['html'] }]
      });

      if (result.canceled || !result.filePath) return;

      const fs = require('fs');
      fs.writeFileSync(result.filePath, content, 'utf-8');
      new Notice('✅ 导出完成: ' + result.filePath);
    } else {
      // 非 Electron 环境：下载到 Vault
      const vault = app.vault;
      const filePath = `${defaultName}.html`;
      await vault.create(filePath, content);
      new Notice('✅ 已导出到 Vault: ' + filePath);
    }
  } catch (error) {
    console.error('导出失败:', error);
    new Notice('❌ 导出失败: ' + (error as Error).message);
  }
}