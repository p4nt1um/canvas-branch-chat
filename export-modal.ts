/**
 * 导出配置弹窗
 */

import { App, Modal, Notice } from 'obsidian';
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
    const baseSize = 35; // KB（HTML + CSS + JS）
    const perNodeSize = 0.5; // KB
    const total = baseSize + this.nodeCount * perNodeSize;
    if (total < 100) return `~${Math.round(total)} KB`;
    return `~${(total / 1000).toFixed(1)} MB`;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.addClass('export-config-modal');
    contentEl.empty();

    // 标题
    contentEl.createEl('h3', { text: '📥 导出交互式 HTML' });

    // === 视图模式 ===
    this.addSectionLabel(contentEl, '📊 视图模式');
    const viewSelect = this.addSelect(contentEl, '默认视图', [
      { value: 'flow', label: '🌊 流式对话视图（推荐）' },
      { value: 'tree', label: '🌳 分支树视图（高级）' },
    ], this.config.viewMode);
    viewSelect.addEventListener('change', () => {
      this.config.viewMode = viewSelect.value as 'flow' | 'tree';
    });

    // === 主题 ===
    this.addSectionLabel(contentEl, '🎨 主题');
    const themeSelect = this.addSelect(contentEl, '默认主题', [
      { value: 'auto', label: '🌓 跟随系统' },
      { value: 'light', label: '☀️ 亮色' },
      { value: 'dark', label: '🌙 暗色' },
    ], this.config.theme);
    themeSelect.addEventListener('change', () => {
      this.config.theme = themeSelect.value as 'light' | 'dark' | 'auto';
    });

    // === 功能开关 ===
    this.addSectionLabel(contentEl, '⚙️ 功能开关');

    const toggleToggle = this.addToggle(contentEl, '📋 节点展开/收起', this.config.includeToggle);
    toggleToggle.input.addEventListener('change', () => {
      this.config.includeToggle = toggleToggle.input.checked;
    });

    const replayToggle = this.addToggle(contentEl, '▶️ 对话回放', this.config.includeReplay);
    replayToggle.input.addEventListener('change', () => {
      this.config.includeReplay = replayToggle.input.checked;
    });

    const searchToggle = this.addToggle(contentEl, '🔍 搜索功能', this.config.includeSearch);
    searchToggle.input.addEventListener('change', () => {
      this.config.includeSearch = searchToggle.input.checked;
    });

    // === 导出信息 ===
    contentEl.createEl('hr');
    const infoDiv = contentEl.createDiv({ cls: 'export-info' });
    infoDiv.createEl('p', { text: `📊 节点数: ${this.nodeCount}` });
    infoDiv.createEl('p', { text: `📦 预估文件大小: ${this.estimatedSize}` });
    infoDiv.createEl('p', { text: `✅ Markdown 渲染已启用` });
    infoDiv.createEl('p', { text: `📱 移动端适配已启用` });

    // === 按钮 ===
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

  /** 添加分组标签 */
  private addSectionLabel(container: HTMLElement, text: string): void {
    const label = container.createDiv({ cls: 'setting-item-description' });
    label.createEl('strong', { text });
    label.style.marginTop = '12px';
    label.style.marginBottom = '4px';
  }

  /** 添加下拉选择框 */
  private addSelect(
    container: HTMLElement,
    name: string,
    options: { value: string; label: string }[],
    defaultValue: string
  ): HTMLSelectElement {
    const wrapper = container.createDiv({ cls: 'export-setting-row' });

    const label = wrapper.createEl('label', { cls: 'export-label' });
    label.textContent = name;

    const select = wrapper.createEl('select', { cls: 'dropdown' });
    options.forEach(opt => {
      const optionEl = select.createEl('option', { value: opt.value, text: opt.label });
      if (opt.value === defaultValue) optionEl.selected = true;
    });

    return select;
  }

  /** 添加开关 */
  private addToggle(
    container: HTMLElement,
    name: string,
    defaultValue: boolean
  ): { input: HTMLInputElement; wrapper: HTMLElement } {
    const wrapper = container.createDiv({ cls: 'export-setting-row' });

    const label = wrapper.createEl('label', { cls: 'export-label' });
    label.textContent = name;

    const toggleDiv = wrapper.createDiv({ cls: 'checkbox-container' });
    const input = toggleDiv.createEl('input', {
      type: 'checkbox',
      cls: 'checkbox-input'
    }) as HTMLInputElement;
    input.checked = defaultValue;

    // Obsidian checkbox UI
    if (input.checked) {
      toggleDiv.addClass('is-enabled');
    }
    input.addEventListener('change', () => {
      if (input.checked) {
        toggleDiv.addClass('is-enabled');
      } else {
        toggleDiv.removeClass('is-enabled');
      }
    });

    return { input, wrapper };
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
    // 尝试 Electron 对话框
    const { dialog } = require('@electron/remote') || {};

    if (dialog) {
      const result = await dialog.showSaveDialog({
        defaultPath: defaultName,
        filters: [{ name: 'HTML 文件', extensions: ['html'] }]
      });

      if (result.canceled || !result.filePath) return;

      const fs = require('fs');
      fs.writeFileSync(result.filePath, content, 'utf-8');
      new Notice('✅ 导出完成: ' + result.filePath);
    } else {
      // 回退：保存到 Vault
      const vault = app.vault;
      const filePath = `${defaultName}`;
      await vault.create(filePath, content);
      new Notice('✅ 已导出到 Vault: ' + filePath);
    }
  } catch (error) {
    console.error('导出失败:', error);
    new Notice('❌ 导出失败: ' + (error as Error).message);
  }
}