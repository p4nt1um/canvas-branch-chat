/**
 * canvas-extension.ts — Canvas 分支对话扩展
 *
 * P0 功能：
 * #1 从节点分叉对话
 * #2 分支方向标注
 * #3 上下文自动继承（直系祖先链）
 * #4 边标签显示
 */

import { Menu, MenuItem, Notice } from 'obsidian';
import CanvasBranchChatPlugin from './main';
import { CanvasRuntimeNode, CanvasRuntimeView, ChatMessage } from './types';
import { createLLMClient } from './api';
import { getNodeScrollHeight, generateId } from './utils';
import { BranchModal } from './branch-modal';
import { buildBranchContext, buildContextFromChain, getAncestorChain } from './context';

export default class CanvasBranchExtension {
  plugin: CanvasBranchChatPlugin;

  constructor(plugin: CanvasBranchChatPlugin) {
    this.plugin = plugin;

    this.plugin.registerEvent(
      this.plugin.app.workspace.on(
        'canvas:node-menu',
        (menu: Menu, node: CanvasRuntimeNode) => {
          this.onNodeMenu(menu, node);
        }
      )
    );
  }

  // ============================================================
  // 右键菜单
  // ============================================================

  private onNodeMenu(menu: Menu, node: CanvasRuntimeNode) {
    const canvas = node.canvas;
    if (!canvas) return;

    // P0 #1: 从此处分叉
    menu.addItem((item: MenuItem) => {
      item.setTitle('🔀 从此处分叉');
      item.setIcon('git-branch');
      item.onClick(() => this.branchFromNode(node, canvas));
    });

    // P0: 继续追问（在当前分支链上追加）
    menu.addItem((item: MenuItem) => {
      item.setTitle('💬 继续追问');
      item.setIcon('message-circle');
      item.onClick(() => this.continueChat(node, canvas));
    });

    // 保留原始：直接提交到 AI（不带上下文）
    menu.addItem((item: MenuItem) => {
      item.setTitle('🤖 提交到 AI');
      item.setIcon('bot');
      item.onClick(() => this.submitToAi(node, canvas));
    });
  }

  // ============================================================
  // P0 #1-#4: 从节点分叉
  // ============================================================

  private branchFromNode(
    sourceNode: CanvasRuntimeNode,
    canvas: CanvasRuntimeView
  ) {
    // 弹出分支方向输入框
    new BranchModal(this.plugin.app, (result) => {
      if (!result.confirmed) return;
      this.doBranch(sourceNode, canvas, result.direction);
    }).open();
  }

  private async doBranch(
    sourceNode: CanvasRuntimeNode,
    canvas: CanvasRuntimeView,
    direction: string
  ) {
    const apiKey = this.plugin.settings.resolveApiKey();
    const model = this.plugin.settings.getSetting('llm');
    const customInstructions = this.plugin.settings.getSetting('customInstructions');

    if (!apiKey) {
      new Notice('请先在设置中配置 API Key（环境变量名）并确保环境变量已设置');
      return;
    }

    // 1. 计算分支放置位置（在源节点右侧）
    // 查找源节点已有的右侧分支，错开摆放
    const offsetX = 400; // 右侧偏移
    const offsetY = 100;

    // 2. 创建 AI 回答节点
    const answerNode = canvas.createTextNode({
      pos: {
        x: sourceNode.x + offsetX,
        y: sourceNode.y + offsetY,
      },
      text: '思考中...',
      size: { width: sourceNode.width, height: sourceNode.height },
      focus: false,
    });

    // 3. P0 #4: 创建带标签的连线（source → answer）
    this.addEdge(canvas, sourceNode.id, answerNode.id, 'right', 'top', direction);

    // 4. P0 #3: 构建上下文（直系祖先链 + 分支方向引导）
    const messages = buildBranchContext(
      canvas,
      sourceNode.id,
      direction,
      customInstructions
    );

    // 5. 流式请求 AI
    const client = createLLMClient('deepseek', apiKey);
    let fullText = '';

    try {
      await client.streamChat(messages, model, (token: string) => {
        fullText += token;
        answerNode.setText(fullText);

        // 自适应高度
        this.autoFitHeight(answerNode);
      });
    } catch (error) {
      console.error('Branch Chat: API error', error);
      answerNode.setText(`❌ 请求失败: ${error}`);
    }

    // 6. 创建追问输入节点
    const askNode = canvas.createTextNode({
      pos: {
        x: answerNode.x,
        y: answerNode.y + answerNode.height + 50,
      },
      text: '',
      focus: true,
    });
    this.addEdge(canvas, answerNode.id, askNode.id, 'bottom', 'top');

    canvas.requestSave();
  }

  // ============================================================
  // P0: 继续追问（在当前分支链上追加对话）
  // ============================================================

  private async continueChat(
    sourceNode: CanvasRuntimeNode,
    canvas: CanvasRuntimeView
  ) {
    const apiKey = this.plugin.settings.resolveApiKey();
    const model = this.plugin.settings.getSetting('llm');
    const customInstructions = this.plugin.settings.getSetting('customInstructions');

    if (!apiKey) {
      new Notice('请先在设置中配置 API Key（环境变量名）并确保环境变量已设置');
      return;
    }

    const nodeText = sourceNode.text?.trim();
    if (!nodeText) {
      new Notice('请先输入你的问题');
      return;
    }

    // 1. 创建 AI 回答节点
    const answerNode = canvas.createTextNode({
      pos: {
        x: sourceNode.x,
        y: sourceNode.y + sourceNode.height + 50,
      },
      text: '思考中...',
      size: { width: sourceNode.width, height: sourceNode.height },
      focus: false,
    });

    this.addEdge(canvas, sourceNode.id, answerNode.id, 'bottom', 'top');

    // 2. 构建上下文（直系祖先链）
    const chain = getAncestorChain(canvas, sourceNode.id);
    const historyMessages = buildContextFromChain(canvas, chain);

    const messages: ChatMessage[] = [];
    if (customInstructions) {
      messages.push({ role: 'system', content: customInstructions });
    }
    messages.push(...historyMessages);

    // 3. 流式请求
    const client = createLLMClient('deepseek', apiKey);
    let fullText = '';

    try {
      await client.streamChat(messages, model, (token: string) => {
        fullText += token;
        answerNode.setText(fullText);
        this.autoFitHeight(answerNode);
      });
    } catch (error) {
      console.error('Branch Chat: API error', error);
      answerNode.setText(`❌ 请求失败: ${error}`);
    }

    // 4. 创建下一个追问输入节点
    const askNode = canvas.createTextNode({
      pos: {
        x: answerNode.x,
        y: answerNode.y + answerNode.height + 50,
      },
      text: '',
      focus: true,
    });
    this.addEdge(canvas, answerNode.id, askNode.id, 'bottom', 'top');

    canvas.requestSave();
  }

  // ============================================================
  // 原始：直接提交到 AI（无上下文）
  // ============================================================

  private async submitToAi(
    sourceNode: CanvasRuntimeNode,
    canvas: CanvasRuntimeView
  ) {
    const apiKey = this.plugin.settings.resolveApiKey();
    const model = this.plugin.settings.getSetting('llm');
    const customInstructions = this.plugin.settings.getSetting('customInstructions');

    if (!apiKey) {
      new Notice('请先在设置中配置 API Key（环境变量名）并确保环境变量已设置');
      return;
    }

    const answerNode = canvas.createTextNode({
      pos: {
        x: sourceNode.x,
        y: sourceNode.y + sourceNode.height + 50,
      },
      text: '思考中...',
      size: { width: sourceNode.width, height: sourceNode.height },
      focus: false,
    });

    this.addEdge(canvas, sourceNode.id, answerNode.id, 'bottom', 'top');

    const messages: ChatMessage[] = [];
    if (customInstructions) {
      messages.push({ role: 'system', content: customInstructions });
    }
    messages.push({ role: 'user', content: sourceNode.text });

    const client = createLLMClient('deepseek', apiKey);
    let fullText = '';

    try {
      await client.streamChat(messages, model, (token: string) => {
        fullText += token;
        answerNode.setText(fullText);
        this.autoFitHeight(answerNode);
      });
    } catch (error) {
      console.error('Branch Chat: API error', error);
      answerNode.setText(`❌ 请求失败: ${error}`);
    }

    canvas.requestSave();
  }

  // ============================================================
  // 工具方法
  // ============================================================

  /** 在两个节点间创建连线，可带标签 */
  private addEdge(
    canvas: CanvasRuntimeView,
    fromNodeId: string,
    toNodeId: string,
    fromSide: string = 'bottom',
    toSide: string = 'top',
    label?: string
  ): void {
    const canvasData = canvas.getData();
    canvasData.edges.push({
      id: generateId(16),
      fromNode: fromNodeId,
      fromSide: fromSide as any,
      fromEnd: 'none',
      toNode: toNodeId,
      toSide: toSide as any,
      toEnd: 'arrow',
      label: label || undefined,
    });
    canvas.setData(canvasData);
  }

  /** 自适应节点高度 */
  private autoFitHeight(node: CanvasRuntimeNode): void {
    const actualHeight = getNodeScrollHeight(node);
    const nodeData = node.getData();
    if (actualHeight > nodeData.height) {
      node.setData({ ...nodeData, height: actualHeight });
    }
  }
}
