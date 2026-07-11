/**
 * skill-suggest-modal.ts — Skills 自动补全弹窗
 *
 * P2 #21 阶段 1: 复用 Obsidian SuggestModal，对 skill 名称/描述做模糊匹配。
 */

import { App, SuggestModal } from 'obsidian';
import { SkillInfo } from './types';

export class SkillSuggestModal extends SuggestModal<SkillInfo> {
  private skills: SkillInfo[];
  private onSelect: (skill: SkillInfo) => void;

  constructor(app: App, skills: SkillInfo[], onSelect: (skill: SkillInfo) => void) {
    super(app);
    this.skills = skills;
    this.onSelect = onSelect;
    this.setPlaceholder('输入 skill 名称搜索...');
    this.setInstructions([
      { command: '↑↓', purpose: '选择' },
      { command: '↵', purpose: '使用此 Skill' },
      { command: 'esc', purpose: '取消' },
    ]);
  }

  getSuggestions(query: string): SkillInfo[] {
    const q = query.toLowerCase();
    if (!q) return this.skills;
    return this.skills.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.description.toLowerCase().includes(q)
    );
  }

  renderSuggestion(skill: SkillInfo, el: HTMLElement): void {
    el.createEl('div', {
      text: `/${skill.name}`,
      cls: 'skill-suggest-name',
    });
    if (skill.description) {
      el.createEl('small', {
        text: ` — ${skill.description}`,
        cls: 'skill-suggest-desc',
      });
    }
    // 来源标记
    const sourceTag = skill.source === 'global' ? '🌐 全局' : '📁 项目';
    el.createEl('span', {
      text: sourceTag,
      cls: 'skill-suggest-source',
    });
  }

  onChooseSuggestion(skill: SkillInfo): void {
    this.onSelect(skill);
  }
}
