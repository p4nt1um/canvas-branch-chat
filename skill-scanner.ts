/**
 * skill-scanner.ts — Claude Code Skills 扫描器
 *
 * 扫描 Vault 内 .claude/skills/ 目录，
 * 解析每个 SKILL.md 的 YAML frontmatter + Markdown body。
 *
 * 注意：使用 Obsidian Vault Adapter API 而非 Node.js fs，
 * 以符合 Obsidian 社区插件安全要求。
 */

import { Vault } from 'obsidian';
import { SkillInfo } from './types';

const SKILLS_DIR = '.claude/skills';

export class SkillScanner {
  private skills: Map<string, SkillInfo> = new Map();
  private vault: Vault;

  constructor(vault: Vault) {
    this.vault = vault;
  }

  /** 执行扫描 */
  async scan(): Promise<SkillInfo[]> {
    this.skills.clear();
    try {
      await this.scanDirectory(SKILLS_DIR, 'project');
    } catch { /* skip */ }

    return Array.from(this.skills.values());
  }

  /** 扫描单个目录（使用 Vault Adapter API） */
  private async scanDirectory(dirPath: string, source: 'global' | 'project'): Promise<void> {
    if (!(await this.vault.adapter.exists(dirPath))) return;

    const listing = await this.vault.adapter.list(dirPath);
    for (const folder of listing.folders) {
      const skillFile = `${folder}/SKILL.md`;
      if (!(await this.vault.adapter.exists(skillFile))) continue;

      try {
        const content = await this.vault.adapter.read(skillFile);
        const parsed = this.parseSkillMd(content, skillFile, source);
        if (parsed) this.skills.set(parsed.name, parsed);
      } catch {
        console.warn(`SkillScanner: failed to parse ${skillFile}`);
      }
    }
  }

  /** 解析 SKILL.md 为 SkillInfo */
  private parseSkillMd(content: string, filePath: string, source: 'global' | 'project'): SkillInfo | null {
    const fm = this.parseFrontmatter(content, filePath);
    if (!fm || !fm.data.name) return null;

    return {
      name: fm.data.name,
      description: fm.data.description || '',
      body: fm.body,
      path: filePath,
      source,
    };
  }

  /** 解析 YAML frontmatter */
  private parseFrontmatter(content: string, filePath: string): { data: Record<string, string>; body: string } | null {
    const match = content.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
    if (!match) {
      const folderName = filePath.split('/').slice(-2, -1)[0] || filePath;
      return {
        data: { name: folderName },
        body: content.trim(),
      };
    }

    const data: Record<string, string> = {};
    for (const line of match[1].split('\n')) {
      const kv = line.match(/^(\w[\w-]*):\s*(.+?)\s*$/);
      if (kv) data[kv[1]] = kv[2];
    }

    return { data, body: match[2].trim() };
  }

  getSkill(name: string): SkillInfo | undefined { return this.skills.get(name); }
  getSkills(): SkillInfo[] { return Array.from(this.skills.values()); }
  async rescan(): Promise<SkillInfo[]> { return this.scan(); }
}

/** 解析方向文本中的 /skill-name 前缀 */
export function parseSkillTag(text: string): { skillName: string; direction: string } | null {
  const match = text.trim().match(/^\/(\S[\w-]*)\s*(.*)/);
  if (!match) return null;
  return { skillName: match[1], direction: match[2] || text.trim() };
}
