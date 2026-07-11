/**
 * main.ts — Obsidian Canvas Branch Chat 插件入口
 *
 * 基于 fork: HinxCorporation/obsidian-canvas-ai (MIT)
 */

import { Plugin, Notice } from 'obsidian';
import SettingsManager from './settings';
import CanvasBranchExtension from './canvas-extension';
import { SkillScanner } from './skill-scanner';

export default class CanvasBranchChatPlugin extends Plugin {
  settings: SettingsManager;
  private canvasExtension: CanvasBranchExtension;
  skillScanner: SkillScanner;

  async onload() {
    // 1. 加载设置
    this.settings = new SettingsManager(this);
    await this.settings.loadSettings();
    this.settings.addSettingsTab();

    // 2. 初始化 Skills 扫描器
    this.skillScanner = new SkillScanner((this.app.vault.adapter as any).basePath || '');
    this.skillScanner.scan().then((skills) => {
      console.log(`Canvas Branch Chat: loaded ${skills.length} skills`);
    }).catch(() => {});

    // 3. 注册 Canvas 分支对话扩展
    this.canvasExtension = new CanvasBranchExtension(this);

    // 3. P1 #9: 注册导出命令
    this.addCommand({
      id: 'export-canvas-conversation',
      name: '导出当前 Canvas 对话树为 Markdown',
      callback: () => {
        // 尝试获取当前活动的 Canvas 视图
        const canvasView = this.app.workspace.getActiveViewOfType?.(null as any);
        // 注意：Obsidian API 不直接暴露 Canvas 视图类型
        // 用户主要通过右键菜单触发导出，这里作为补充入口
        new Notice('请在 Canvas 中右键对话节点 → 导出对话树');
      },
    });

    console.log('Canvas Branch Chat: loaded');
  }

  onunload() {
    console.log('Canvas Branch Chat: unloaded');
  }
}
