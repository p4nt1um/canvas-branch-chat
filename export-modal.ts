/**
 * 导出配置弹窗 — 使用 Obsidian Setting API（与其他 Modal 保持一致）
 */

import { App, Modal, Notice, Setting, DropdownComponent } from 'obsidian';
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
    const baseSize = 35;
    const perNodeSize = 0.5;
    const total = baseSize + this.nodeCount * perNodeSize;
    if (total < 100) return `~${Math.round(total)} KB`;
    return `~${(total / 1000).toFixed(1)} MB`;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.addClass('export-config-modal');
    contentEl.empty();

    // 标题
    new Setting(contentEl)
      .setName('📥 导出交互式 HTML')
      .setHeading();

    // 视图模式
    new Setting(contentEl)
      .setName('视图模式')
      .setDesc('默认显示的视图模式')
      .addDropdown((dropdown: DropdownComponent) => {
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
      .setDesc('HTML 文件的默认主题')
      .addDropdown((dropdown: DropdownComponent) => {
        dropdown
          .addOption('auto', '🌓 跟随系统')
          .addOption('light', '☀️ 亮色')
          .addOption('dark', '🌙 暗色')
          .setValue(this.config.theme)
          .onChange(value => {
            this.config.theme = value as 'light' | 'dark' | 'auto';
          });
      });

    // 分隔
    new Setting(contentEl).setName('功能开关').setHeading();

    // 节点展开/收起
    new Setting(contentEl)
      .setName('📋 节点展开/收起')
      .addToggle(toggle => {
        toggle
          .setValue(this.config.includeToggle)
          .onChange(value => {
            this.config.includeToggle = value;
          });
      });

    // 对话回放
    new Setting(contentEl)
      .setName('▶️ 对话回放')
      .addToggle(toggle => {
        toggle
          .setValue(this.config.includeReplay)
          .onChange(value => {
            this.config.includeReplay = value;
          });
      });

    // 搜索功能
    new Setting(contentEl)
      .setName('🔍 搜索功能')
      .addToggle(toggle => {
        toggle
          .setValue(this.config.includeSearch)
          .onChange(value => {
            this.config.includeSearch = value;
          });
      });

    // 导出信息
    new Setting(contentEl).setName('导出信息').setHeading();

    new Setting(contentEl)
      .setName('节点数')
      .setDesc(`${this.nodeCount} 个节点`);

    new Setting(contentEl)
      .setName('预估文件大小')
      .setDesc(this.estimatedSize);

    new Setting(contentEl)
      .setName('Markdown 渲染')
      .setDesc('已启用（marked.js 预渲染）');

    new Setting(contentEl)
      .setName('移动端适配')
      .setDesc('已启用（响应式 + 触摸优化）');

    // 按钮
    new Setting(contentEl)
      .addButton(btn => {
        btn
          .setButtonText('取消')
          .onClick(() => this.close());
        return btn;
      })
      .addButton(btn => {
        btn
          .setButtonText('📥 导出')
          .setCta()
          .onClick(() => {
            this.onConfirm(this.config);
            this.close();
          });
        return btn;
      });
  }

  onClose() {
    this.contentEl.empty();
  }
}

/**
 * 保存导出 HTML 到 Vault
 */
export async function saveExportFile(
  app: App,
  content: string,
  defaultName: string
): Promise<void> {
  try {
    const vault = app.vault;
    await vault.create(defaultName, content);
    new Notice('✅ 已导出到 Vault: ' + defaultName);
  } catch (error) {
    console.error('导出失败:', error);
    new Notice('❌ 导出失败: ' + (error as Error).message);
  }
}