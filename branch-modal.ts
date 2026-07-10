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
import { BranchTemplate, DEFAULT_BRANCH_TEMPLATES } from './types';

export interface BranchModalResult {
  directions: string[];
  confirmed: boolean;
}

export class BranchModal extends Modal {
  private directions: string[] = [''];
  private result: BranchModalResult;
  private onSubmit: (result: BranchModalResult) => void;
  private directionsContainer: HTMLElement | null = null;
  private focusedInputIndex: number = 0; // P1 #12: 跟踪聚焦输入框
  private inputElements: HTMLInputElement[] = []; // P1 #12: 输入框引用
  private templates: BranchTemplate[]; // P1 #12: 模板列表

  constructor(app: App, onSubmit: (result: BranchModalResult) => void, templates?: BranchTemplate[]) {
    super(app);
    this.onSubmit = onSubmit;
    this.result = { directions: [], confirmed: false };
    this.templates = templates || DEFAULT_BRANCH_TEMPLATES;
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

    // P1 #12: 快捷模板
    this.renderTemplates();

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
    this.inputElements = []; // 重置引用

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
          // P1 #12: 跟踪焦点
          text.inputEl.addEventListener('focus', () => {
            this.focusedInputIndex = index;
          });
          // 回车提交（只有一个非空方向时）
          text.inputEl.addEventListener('keydown', (evt: KeyboardEvent) => {
            if (evt.key === 'Enter' && this.getValidDirections().length > 0) {
              this.confirm();
            }
          });
          // 自动聚焦第一个
          if (index === 0) {
            setTimeout(() => {
              text.inputEl.focus();
              this.focusedInputIndex = 0;
            }, 50);
          }
          // 保存引用
          this.inputElements.push(text.inputEl);
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

  /**
   * P1 #12: 渲染快捷模板 chips
   */
  private renderTemplates() {
    const { contentEl } = this;
    const tplContainer = contentEl.createDiv({ cls: 'branch-templates-container' });
    tplContainer.createEl('span', {
      text: '快捷模板：',
      cls: 'branch-templates-label',
    });
    for (const tpl of this.templates) {
      const chip = tplContainer.createEl('button', {
        text: tpl.text,
        cls: 'branch-template-chip',
      });
      chip.addEventListener('click', (e: Event) => {
        e.preventDefault();
        this.insertTemplate(tpl.text);
      });
    }
  }

  /**
   * P1 #12: 将模板插入当前聚焦的输入框
   * 处理占位符 ____（自动选中）
   */
  private insertTemplate(text: string) {
    const idx = this.focusedInputIndex;
    this.directions[idx] = text;

    // 更新输入框值
    const input = this.inputElements[idx];
    if (input) {
      input.value = text;
      input.focus();

      // 处理占位符 ____（选中它，方便用户直接打字替换）
      const placeholderIdx = text.indexOf('____');
      if (placeholderIdx >= 0) {
        setTimeout(() => {
          input.setSelectionRange(placeholderIdx, placeholderIdx + 4);
        }, 0);
      }
    }
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
