/**
 * skill-scanner.ts — Claude Code Skills 扫描器
 *
 * P2 #21 阶段 1: 扫描全局 ~/.claude/skills/ 和项目 .claude/skills/ 目录，
 * 解析每个 SKILL.md 的 YAML frontmatter + Markdown body。
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { SkillInfo } from './types';

export class SkillScanner {
  private skills: Map<string, SkillInfo> = new Map();
  private scanDirs: string[] = [];
  private vaultPath: string;

  constructor(vaultPath: string) {
    this.vaultPath = vaultPath;
    this.buildScanDirs();
  }

  /** 构建默认扫描目录 */
  private buildScanDirs(): void {
    this.scanDirs.push(path.join(os.homedir(), '.claude', 'skills'));
    if (this.vaultPath) {
      this.scanDirs.push(path.join(this.vaultPath, '.claude', 'skills'));
    }
  }

  /** 执行扫描 */
  async scan(): Promise<SkillInfo[]> {
    this.skills.clear();
    const globalDir = this.scanDirs[0];
    const projectDir = this.scanDirs[1];

    if (globalDir) {
      try { await this.scanDirectory(globalDir, 'global'); } catch { /* skip */ }
    }
    if (projectDir) {
      try { await this.scanDirectory(projectDir, 'project'); } catch { /* skip */ }
    }

    return Array.from(this.skills.values());
  }

  /** 扫描单个目录 */
  private async scanDirectory(dirPath: string, source: 'global' | 'project'): Promise<void> {
    if (!fs.existsSync(dirPath)) return;

    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const skillFile = path.join(dirPath, entry.name, 'SKILL.md');
      if (!fs.existsSync(skillFile)) continue;

      try {
        const content = fs.readFileSync(skillFile, 'utf-8');
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
      return {
        data: { name: path.basename(path.dirname(filePath)) },
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
