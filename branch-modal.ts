/**
 * branch-modal.ts — 分叉方向输入弹窗
 *
 * 用户右键 → "从此处分叉" 时弹出，
 * 输入分支方向（如"从成本角度分析"），确认后创建分支。
 */

import { App, Modal, Setting } from 'obsidian';

export interface BranchModalResult {
  direction: string;
  confirmed: boolean;
}

export class BranchModal extends Modal {
  private direction: string = '';
  private result: BranchModalResult;
  private onSubmit: (result: BranchModalResult) => void;

  constructor(app: App, onSubmit: (result: BranchModalResult) => void) {
    super(app);
    this.onSubmit = onSubmit;
    this.result = { direction: '', confirmed: false };
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();

    contentEl.createEl('h2', { text: '从此处分叉' });

    contentEl.createEl('p', {
      text: '输入这个分支的探讨方向，AI 会基于当前对话上下文从这个方向展开。',
      cls: 'branch-modal-hint',
    });

    new Setting(contentEl)
      .setName('分支方向')
      .setDesc('例如：从成本角度分析 / 换个思路 / 作为产品经理回答')
      .addText((text) => {
        text.setPlaceholder('输入分支方向...');
        text.inputEl.style.width = '100%';
        text.onChange((value) => {
          this.direction = value;
        });
        // 回车提交
        text.inputEl.addEventListener('keydown', (evt: KeyboardEvent) => {
          if (evt.key === 'Enter' && this.direction.trim()) {
            this.confirm();
          }
        });
        // 自动聚焦
        setTimeout(() => text.inputEl.focus(), 50);
      });

    new Setting(contentEl)
      .addButton((btn) =>
        btn
          .setButtonText('分叉')
          .setCta()
          .onClick(() => this.confirm())
      )
      .addButton((btn) =>
        btn.setButtonText('取消').onClick(() => this.close())
      );
  }

  private confirm() {
    if (!this.direction.trim()) return;
    this.result = { direction: this.direction.trim(), confirmed: true };
    this.close();
  }

  onClose() {
    this.onSubmit(this.result);
  }
}
