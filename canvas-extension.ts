/**
 * canvas-extension.ts — Canvas 分支对话扩展
 *
 * 负责：
 * 1. 注册 Canvas 右键菜单（分叉 / 追问 / 提交到AI）
 * 2. 对话节点创建与 edge 连线管理
 * 3. 流式 AI 回答渲染到 Canvas 节点
 * 4. 上下文继承（直系祖先链）— M2
 * 5. 分支方向标注 — M2
 *
 * M1 阶段：保留原始 "提交到Ai" 单次 Q&A 能力，
 * 用新的 types / api / utils 重写实现，为 M2 分支逻辑铺路。
 */

import { Menu, MenuItem } from 'obsidian';
import CanvasBranchChatPlugin from './main';
import {
  CanvasRuntimeNode,
  CanvasRuntimeView,
  CanvasData,
} from './types';
import { LLMClient, createLLMClient } from './api';
import { getNodeScrollHeight, generateId } from './utils';

export default class CanvasBranchExtension {
  plugin: CanvasBranchChatPlugin;

  constructor(plugin: CanvasBranchChatPlugin) {
    this.plugin = plugin;

    // 注册 canvas 右键菜单
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

    // 提交到 AI（M1 保留原始行为）
    menu.addItem((item: MenuItem) => {
      item.setTitle('提交到 AI');
      item.setIcon('bot');
      item.onClick(() => this.submitToAi(node, canvas));
    });

    // TODO M2: "从此处分叉" → 弹出分支方向输入框
    // menu.addItem((item: MenuItem) => {
    //   item.setTitle('从此处分叉');
    //   item.setIcon('git-branch');
    //   item.onClick(() => this.branchFromNode(node, canvas));
    // });

    // TODO M2: "继续追问" → 在分支链上追加对话
    // menu.addItem((item: MenuItem) => {
    //   item.setTitle('继续追问');
    //   item.setIcon('message-circle');
    //   item.onClick(() => this.continueChat(node, canvas));
    // });
  }

  // ============================================================
  // 提交到 AI（M1 核心：单次 Q&A）
  // ============================================================

  private async submitToAi(
    sourceNode: CanvasRuntimeNode,
    canvas: CanvasRuntimeView
  ) {
    const apiKey = this.plugin.settings.getSetting('apiKey');
    const model = this.plugin.settings.getSetting('llm');
    const customInstructions = this.plugin.settings.getSetting('customInstructions');

    if (!apiKey) {
      console.warn('Canvas Branch Chat: API key not configured');
      return;
    }

    // 1. 创建回答节点（Loading 状态）
    const answerNode = canvas.createTextNode({
      pos: {
        x: sourceNode.x,
        y: sourceNode.y + sourceNode.height + 30,
      },
      text: '思考中...',
      size: { width: sourceNode.width, height: sourceNode.height },
      focus: false,
    });

    // 2. 创建连线
    this.addEdge(canvas, sourceNode.id, answerNode.id, 'bottom', 'top');

    // 3. 创建追问输入节点（M1：放在回答下方）
    const askNode = canvas.createTextNode({
      pos: {
        x: answerNode.x,
        y: answerNode.y + answerNode.height + 30,
      },
      text: '',
      focus: false,
    });
    this.addEdge(canvas, answerNode.id, askNode.id, 'bottom', 'top');

    // 4. 构建消息
    const messages = [];
    if (customInstructions) {
      messages.push({ role: 'system' as const, content: customInstructions });
    }
    messages.push({ role: 'user' as const, content: sourceNode.text });

    // 5. 创建 LLM 客户端并流式请求
    const client = createLLMClient('deepseek', apiKey);
    let fullText = '';

    try {
      await client.streamChat(
        messages,
        model,
        (token: string) => {
          fullText += token;
          answerNode.setText(fullText);

          // 自适应高度
          const actualHeight = getNodeScrollHeight(answerNode);
          const nodeData = answerNode.getData();
          if (actualHeight > nodeData.height) {
            answerNode.setData({ ...nodeData, height: actualHeight });
          }
        }
      );
    } catch (error) {
      console.error('Canvas Branch Chat: API error', error);
      answerNode.setText(`请求失败: ${error}`);
    }

    // 6. 保存 Canvas
    canvas.requestSave();
  }

  // ============================================================
  // Edge 连线工具
  // ============================================================

  /**
   * 在两个节点之间创建连线
   */
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
}
