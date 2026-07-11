/**
 * follow-up-modal.ts — 追问输入弹窗
 *
 * 右键任意节点 → 💬 继续追问 → 弹窗输入问题 → 自动建 user 节点 + AI 节点
 */

import { App, Modal, Setting } from 'obsidian';
import { ModelConfig } from './types';

export interface FollowUpModalResult {
  prompt: string;
  modelId: string;
  confirmed: boolean;
}

export class FollowUpModal extends Modal {
  private prompt: string = '';
  private modelId: string;
  private result: FollowUpModalResult;
  private onSubmit: (result: FollowUpModalResult) => void;
  private models: ModelConfig[];

  constructor(
    app: App,
    models: ModelConfig[],
    defaultModelId: string,
    onSubmit: (result: FollowUpModalResult) => void,
  ) {
    super(app);
    this.models = models;
    this.modelId = defaultModelId;
    this.onSubmit = onSubmit;
    this.result = { prompt: '', modelId: '', confirmed: false };
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();

    contentEl.createEl('h2', { text: '💬 继续追问' });

    new Setting(contentEl)
      .setDesc('基于当前对话上下文，输入你的追问')
      .addTextArea((text) => {
        text.setPlaceholder('输入追问内容...');
        text.inputEl.style.width = '100%';
        text.inputEl.style.minHeight = '80px';
        text.onChange((value) => {
          this.prompt = value;
        });
        setTimeout(() => text.inputEl.focus(), 50);
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

    // 操作按钮
    new Setting(contentEl)
      .addButton((btn) =>
        btn
          .setButtonText('发送')
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
