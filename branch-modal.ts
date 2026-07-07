/**
 * branch-modal.ts — 分叉方向输入弹窗
 *
 * 支持多方向批量输入：
 * - 动态输入框列表，每项一个方向
 * - 可添加/删除方向
 * - 至少 1 个，最多 5 个
 * - 避免长文本换行误判（每个方向独立输入框）
 */

import { App, Modal, Setting, ButtonComponent } from 'obsidian';

export interface BranchModalResult {
  directions: string[];
  confirmed: boolean;
}

export class BranchModal extends Modal {
  private directions: string[] = [''];
  private result: BranchModalResult;
  private onSubmit: (result: BranchModalResult) => void;
  private directionsContainer: HTMLElement | null = null;

  constructor(app: App, onSubmit: (result: BranchModalResult) => void) {
    super(app);
    this.onSubmit = onSubmit;
    this.result = { directions: [], confirmed: false };
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();

    contentEl.createEl('h2', { text: '从此处分叉' });

    contentEl.createEl('p', {
      text: '输入分支的探讨方向（可添加多个，每个方向生成一条独立分支）。AI 会基于当前对话上下文从该方向展开。',
      cls: 'branch-modal-hint',
    });

    this.directionsContainer = contentEl.createDiv({ cls: 'branch-directions-container' });
    this.renderDirections();

    // 添加方向按钮
    new Setting(contentEl)
      .addButton((btn: ButtonComponent) => {
        btn
          .setButtonText('+ 添加方向')
          .onClick(() => {
            if (this.directions.length < 5) {
              this.directions.push('');
              this.renderDirections();
            }
          });
        if (this.directions.length >= 5) {
          btn.setDisabled(true);
        }
      });

    // 底部操作按钮
    new Setting(contentEl)
      .addButton((btn: ButtonComponent) =>
        btn
          .setButtonText('分叉')
          .setCta()
          .onClick(() => this.confirm())
      )
      .addButton((btn: ButtonComponent) =>
        btn.setButtonText('取消').onClick(() => this.close())
      );
  }

  private renderDirections() {
    if (!this.directionsContainer) return;
    this.directionsContainer.empty();

    this.directions.forEach((direction, index) => {
      const setting = new Setting(this.directionsContainer!)
        .setName(`方向 ${index + 1}`)
        .addText((text) => {
          text.setPlaceholder('例如：从成本角度分析');
          text.inputEl.style.width = '100%';
          text.setValue(direction);
          text.onChange((value) => {
            this.directions[index] = value;
          });
          // 回车提交（只有一个非空方向时）
          text.inputEl.addEventListener('keydown', (evt: KeyboardEvent) => {
            if (evt.key === 'Enter' && this.getValidDirections().length > 0) {
              this.confirm();
            }
          });
          // 自动聚焦第一个
          if (index === 0) {
            setTimeout(() => text.inputEl.focus(), 50);
          }
        });

      // 删除按钮（至少保留 1 个）
      if (this.directions.length > 1) {
        setting.addExtraButton((btn) => {
          btn
            .setIcon('trash')
            .setTooltip('删除此方向')
            .onClick(() => {
              this.directions.splice(index, 1);
              this.renderDirections();
            });
        });
      }
    });
  }

  private getValidDirections(): string[] {
    return this.directions
      .map(d => d.trim())
      .filter(d => d.length > 0);
  }

  private confirm() {
    const valid = this.getValidDirections();
    if (valid.length === 0) return;
    this.result = { directions: valid, confirmed: true };
    this.close();
  }

  onClose() {
    this.onSubmit(this.result);
  }
}
