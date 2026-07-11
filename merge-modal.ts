/**
 * merge-modal.ts — 多分支合并输入弹窗
 *
 * 选中多个节点 → 右键「合并分支」→ 此弹窗
 * 预填「总结以下观点」，用户可自由修改
 */

import { App, Modal, Setting } from 'obsidian';
import { ModelConfig } from './types';

export interface MergeModalResult {
  prompt: string;
  modelId: string;
  confirmed: boolean;
}

export class MergeModal extends Modal {
  private prompt: string = '总结以下观点';
  private modelId: string;
  private result: MergeModalResult;
  private onSubmit: (result: MergeModalResult) => void;
  private models: ModelConfig[];
  private branchCount: number;

  constructor(
    app: App,
    branchCount: number,
    models: ModelConfig[],
    defaultModelId: string,
    onSubmit: (result: MergeModalResult) => void,
  ) {
    super(app);
    this.branchCount = branchCount;
    this.models = models;
    this.modelId = defaultModelId;
    this.onSubmit = onSubmit;
    this.result = { prompt: '', modelId: '', confirmed: false };
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();

    contentEl.createEl('h2', { text: '🔀 合并分支' });
    contentEl.createEl('p', {
      text: `${this.branchCount} 个分支的内容将作为上下文发送给 AI，AI 会根据你的提问生成汇总节点。`,
      cls: 'branch-modal-hint',
    });

    // 模型选择
    if (this.models.length > 0) {
      new Setting(contentEl)
        .setName('模型')
        .addDropdown((dropdown) => {
          for (const m of this.models) {
            dropdown.addOption(m.id, `${m.icon || '🤖'} ${m.alias}`);
          }
          dropdown.setValue(this.modelId);
          dropdown.onChange((value) => {
            this.modelId = value;
          });
        });
    }

    // 提问输入
    new Setting(contentEl)
      .setName('提问')
      .setDesc('可以是总结、对比、或其他任何问题')
      .addTextArea((text) => {
        text.setPlaceholder('总结以下观点');
        text.setValue(this.prompt);
        text.inputEl.style.width = '100%';
        text.inputEl.style.minHeight = '60px';
        text.onChange((value) => {
          this.prompt = value;
        });
        // 自动聚焦
        setTimeout(() => text.inputEl.focus(), 50);
      });

    // 操作按钮
    new Setting(contentEl)
      .addButton((btn) =>
        btn
          .setButtonText('合并')
          .setCta()
          .onClick(() => this.confirm()),
      )
      .addButton((btn) =>
        btn.setButtonText('取消').onClick(() => this.close()),
      );
  }

  private confirm() {
    if (!this.prompt.trim()) return;
    this.result = {
      prompt: this.prompt.trim(),
      modelId: this.modelId,
      confirmed: true,
    };
    this.close();
  }

  onClose() {
    this.onSubmit(this.result);
  }
}
