/**
 * main.ts — Obsidian Canvas Branch Chat 插件入口
 *
 * 基于 fork: HinxCorporation/obsidian-canvas-ai (MIT)
 */

import { Plugin } from 'obsidian';
import SettingsManager from './settings';
import CanvasBranchExtension from './canvas-extension';

export default class CanvasBranchChatPlugin extends Plugin {
  settings: SettingsManager;
  private canvasExtension: CanvasBranchExtension;

  async onload() {
    // 1. 加载设置
    this.settings = new SettingsManager(this);
    await this.settings.loadSettings();
    this.settings.addSettingsTab();

    // 2. 注册 Canvas 分支对话扩展
    this.canvasExtension = new CanvasBranchExtension(this);

    console.log('Canvas Branch Chat: loaded');
  }

  onunload() {
    console.log('Canvas Branch Chat: unloaded');
  }
}
