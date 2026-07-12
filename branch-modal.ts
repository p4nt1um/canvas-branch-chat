/**
 * branch-modal.ts — 分叉方向输入弹窗
 *
 * 支持多方向批量输入：
 * - 动态输入框列表，每项一个方向
 * - 每个方向独立选择模型（合并原"指定模型分叉"功能）
 * - 全局模型选择器：一键同步所有方向
 * - 可添加/删除方向，至少 1 个，最多 5 个
 */

import { App, Modal, Setting, ButtonComponent } from 'obsidian';
import { BranchTemplate, DEFAULT_BRANCH_TEMPLATES, SkillInfo, ModelConfig, BranchFramework } from './types';
import { SkillSuggestModal } from './skill-suggest-modal';

/** 单个方向的完整描述（文本 + 模型） */
export interface BranchDirection {
  text: string;
  modelId: string;
}

export interface BranchModalResult {
  directions: BranchDirection[];
  confirmed: boolean;
}

export class BranchModal extends Modal {
  private directionTexts: string[] = [''];
  private directionModelIds: string[] = [];
  private result: BranchModalResult;
  private onSubmit: (result: BranchModalResult) => void;
  private directionsContainer: HTMLElement | null = null;
  private focusedInputIndex: number = 0;
  private inputElements: HTMLInputElement[] = [];
  private templates: BranchTemplate[];
  private skills: SkillInfo[];
  private models: ModelConfig[];
  private globalModelId: string;
  private frameworks: BranchFramework[];

  constructor(
    app: App,
    onSubmit: (result: BranchModalResult) => void,
    templates?: BranchTemplate[],
    skills?: SkillInfo[],
    models?: ModelConfig[],
    defaultModelId?: string,
    frameworks?: BranchFramework[],
  ) {
    super(app);
    this.onSubmit = onSubmit;
    this.result = { directions: [], confirmed: false };
    this.templates = templates || DEFAULT_BRANCH_TEMPLATES;
    this.skills = skills || [];
    this.models = models || [];
    this.globalModelId = defaultModelId || this.models[0]?.id || '';
    this.directionModelIds = [this.globalModelId];
    this.frameworks = frameworks || [];
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();

    new Setting(contentEl).setName('从此处分叉').setHeading();

    contentEl.createEl('p', {
      text: '输入分支的探讨方向。每个方向可选不同模型，多模型交叉分析效果更佳。',
      cls: 'branch-modal-hint',
    });

    // 全局模型选择器
    if (this.models.length > 0) {
      this.renderGlobalModelSelector();
    }

    // P2 #16: 框架预设下拉（在方向列表上方）
    if (this.frameworks.length > 0) {
      this.renderFrameworkSelector();
    }

    this.directionsContainer = contentEl.createDiv({ cls: 'branch-directions-container' });
    this.renderDirections();

    // 快捷模板
    this.renderTemplates();

    // Skills 选择
    if (this.skills.length > 0) {
      this.renderSkillSelector();
    }

    // 添加方向按钮
    new Setting(contentEl).addButton((btn: ButtonComponent) => {
      btn
        .setButtonText('+ 添加方向')
        .onClick(() => {
          if (this.directionTexts.length < 5) {
            this.directionTexts.push('');
            this.directionModelIds.push(this.globalModelId);
            this.renderDirections();
          }
        });
      if (this.directionTexts.length >= 5) {
        btn.setDisabled(true);
      }
    });

    // 底部操作
    new Setting(contentEl)
      .addButton((btn: ButtonComponent) =>
        btn
          .setButtonText('分叉')
          .setCta()
          .onClick(() => this.confirm()),
      )
      .addButton((btn: ButtonComponent) =>
        btn.setButtonText('取消').onClick(() => this.close()),
      );
  }

  /** 全局模型选择器：选中后同步所有方向 */
  private renderGlobalModelSelector() {
    const { contentEl } = this;
    new Setting(contentEl)
      .setName('🌐 全局模型')
      .setDesc('选择后自动同步到所有方向，单个方向可单独覆盖')
      .addDropdown((dropdown) => {
        for (const m of this.models) {
          dropdown.addOption(m.id, `${m.icon || '🤖'} ${m.alias}`);
        }
        dropdown.setValue(this.globalModelId);
        dropdown.onChange((value) => {
          this.globalModelId = value;
          this.directionModelIds = this.directionTexts.map(() => value);
          this.renderDirections();
        });
      });
  }

  private renderDirections() {
    if (!this.directionsContainer) return;
    this.directionsContainer.empty();
    this.inputElements = [];

    this.directionTexts.forEach((text, index) => {
      const setting = new Setting(this.directionsContainer!).setName(`方向 ${index + 1}`);

      // 每方向独立模型下拉
      if (this.models.length > 0) {
        setting.addDropdown((dropdown) => {
          for (const m of this.models) {
            dropdown.addOption(m.id, `${m.icon || '🤖'} ${m.alias}`);
          }
          const currentModel = this.directionModelIds[index] || this.globalModelId;
          dropdown.setValue(currentModel);
          // 高亮标记覆盖了全局选择的项
          if (currentModel !== this.globalModelId) {
            dropdown.selectEl.style.fontWeight = 'bold';
          }
          dropdown.onChange((value) => {
            this.directionModelIds[index] = value;
          });
        });
      }

      // 方向文本输入
      setting.addText((textInput) => {
        textInput.setPlaceholder('例如：从成本角度分析');
        textInput.inputEl.addClass('setting-wide-input');
        textInput.setValue(text);
        textInput.onChange((value) => {
          this.directionTexts[index] = value;
        });
        textInput.inputEl.addEventListener('focus', () => {
          this.focusedInputIndex = index;
        });
        textInput.inputEl.addEventListener('keydown', (evt: KeyboardEvent) => {
          if (evt.key === 'Enter' && this.getValidDirections().length > 0) {
            this.confirm();
          }
        });
        if (index === 0) {
          window.setTimeout(() => {
            textInput.inputEl.focus();
            this.focusedInputIndex = 0;
          }, 50);
        }
        this.inputElements.push(textInput.inputEl);
      });

      // 删除按钮
      if (this.directionTexts.length > 1) {
        setting.addExtraButton((btn) => {
          btn
            .setIcon('trash')
            .setTooltip('删除此方向')
            .onClick(() => {
              this.directionTexts.splice(index, 1);
              this.directionModelIds.splice(index, 1);
              this.renderDirections();
            });
        });
      }
    });
  }

  /** P1 #12: 快捷模板 chips */
  private renderTemplates() {
    const { contentEl } = this;
    const tplContainer = contentEl.createDiv({ cls: 'branch-templates-container' });
    tplContainer.createEl('span', { text: '快捷模板：', cls: 'branch-templates-label' });
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

  /** P2 #16: 框架预设下拉 */
  private renderFrameworkSelector() {
    const { contentEl } = this;
    new Setting(contentEl)
      .setName('📋 框架预设')
      .setDesc('选择框架批量填充方向')
      .addDropdown((dropdown) => {
        dropdown.addOption('', '— 选择框架 —');
        for (const fw of this.frameworks) {
          dropdown.addOption(fw.id, `${fw.icon || '📋'} ${fw.name}（${fw.directions.length}）${fw.description}`);
        }
        dropdown.onChange((value) => {
          if (!value) return;
          const fw = this.frameworks.find(f => f.id === value);
          if (!fw) return;
          this.applyFramework(fw);
          dropdown.setValue(''); // 重置回占位符
        });
      });
  }

  /** P2 #16: 应用框架到方向列表 */
  private applyFramework(fw: BranchFramework) {
    // 检查是否有手输内容
    const hasContent = this.directionTexts.some(t => t.trim().length > 0);
    if (hasContent) {
      // 简单确认：用 Notice 提示后替换
      const confirmEl = this.contentEl.createDiv({ cls: 'branch-framework-confirm' });
      confirmEl.createEl('p', { text: `将用「${fw.name}」替换当前 ${this.directionTexts.length} 个方向，确认？` });
      const btnRow = confirmEl.createDiv({ cls: 'branch-framework-confirm-buttons' });
      btnRow.createEl('button', { text: '确认替换' }).addEventListener('click', () => {
        confirmEl.remove();
        this.setDirections(fw.directions);
      });
      btnRow.createEl('button', { text: '取消' }).addEventListener('click', () => {
        confirmEl.remove();
      });
      return;
    }
    this.setDirections(fw.directions);
  }

  /** 设置方向列表 */
  private setDirections(directions: string[]) {
    this.directionTexts = [...directions];
    while (this.directionModelIds.length < this.directionTexts.length) {
      this.directionModelIds.push(this.globalModelId);
    }
    this.directionModelIds.length = this.directionTexts.length;
    this.renderDirections();
  }

  /** P2 #21: Skills 选择器 */
  private renderSkillSelector() {
    const { contentEl } = this;
    const skillContainer = contentEl.createDiv({ cls: 'branch-skills-container' });

    new Setting(skillContainer)
      .setName('🧠 使用 Skill')
      .setDesc('在方向前加上 /skill-name，AI 将按预设角色展开讨论')
      .addButton((btn: ButtonComponent) => {
        btn.setButtonText('浏览所有 Skills').onClick(() => {
          new SkillSuggestModal(this.app, this.skills, (skill) => {
            this.insertSkill(`/${skill.name}`);
          }).open();
        });
      });
  }

  /** P2 #21: 将 /skill-name 插入当前聚焦输入框 */
  private insertSkill(prefix: string) {
    const idx = this.focusedInputIndex;
    const current = this.directionTexts[idx] || '';
    const newText = `${prefix} ${current}`.trim();
    this.directionTexts[idx] = newText;

    const input = this.inputElements[idx];
    if (input) {
      input.value = newText;
      input.focus();
    }
  }

  /** P1 #12: 将模板插入当前聚焦的输入框 */
  private insertTemplate(text: string) {
    const idx = this.focusedInputIndex;
    this.directionTexts[idx] = text;

    const input = this.inputElements[idx];
    if (input) {
      input.value = text;
      input.focus();

      const placeholderIdx = text.indexOf('____');
      if (placeholderIdx >= 0) {
        window.setTimeout(() => {
          input.setSelectionRange(placeholderIdx, placeholderIdx + 4);
        }, 0);
      }
    }
  }

  private getValidDirections(): BranchDirection[] {
    const valid: BranchDirection[] = [];
    for (let i = 0; i < this.directionTexts.length; i++) {
      const text = this.directionTexts[i].trim();
      if (text.length > 0) {
        valid.push({
          text,
          modelId: this.directionModelIds[i] || this.globalModelId,
        });
      }
    }
    return valid;
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
