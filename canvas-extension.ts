/**
 * canvas-extension.ts — Canvas 分支对话扩展
 *
 * P0 功能：
 * #1 从节点分叉对话
 * #2 分支方向标注
 * #3 上下文自动继承（直系祖先链）
 * #4 边标签显示
 *
 * P1 #5: 多模型支持（使用默认模型，后续子任务加选模型分叉）
 */

import { Menu, MenuItem, Notice } from 'obsidian';
import CanvasBranchChatPlugin from './main';
import { CanvasRuntimeNode, CanvasRuntimeView, ChatMessage, ModelConfig } from './types';
import { createLLMClient } from './api';
import { getNodeScrollHeight, generateId } from './utils';
import { BranchModal } from './branch-modal';
import { buildBranchContext, buildContextFromChain, getAncestorChain, getNodeRole, setNodeRole, findChildNodeIds, findNodeById, getNodeText } from './context';

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
  // 模型获取工具
  // ============================================================

  /** 获取默认模型 + API Key，失败返回 null 并提示 */
  private getModelAndKey(): { model: ModelConfig; apiKey: string } | null {
    const model = this.plugin.settings.getDefaultModel();
    if (!model) {
      new Notice('请先在设置中添加模型配置');
      return null;
    }
    return this.resolveModelKey(model);
  }

  /** 解析指定模型的 API Key */
  private resolveModelKey(model: ModelConfig): { model: ModelConfig; apiKey: string } | null {
    const apiKey = this.plugin.settings.resolveApiKey(model);
    if (!apiKey) {
      new Notice(`无法解析 API Key，请检查环境变量 "${model.apiKeyEnvVar}" 是否已设置`);
      return null;
    }
    return { model, apiKey };
  }

  // ============================================================
  // 右键菜单
  // ============================================================

  private onNodeMenu(menu: Menu, node: CanvasRuntimeNode) {
    const canvas = node.canvas;
    if (!canvas) return;

    const models = this.plugin.settings.getModels();

    // P0 #1: 从此处分叉（默认模型）
    menu.addItem((item: MenuItem) => {
      item.setTitle('🔀 从此处分叉');
      item.setIcon('git-branch');
      item.onClick(() => this.branchFromNode(node, canvas));
    });

    // P1 #5: 选择模型分叉（子菜单）
    if (models.length > 1) {
      menu.addItem((item: MenuItem) => {
        item.setTitle('🏷️ 指定模型分叉');
        item.setIcon('users');
        const submenu = (item as any).setSubmenu?.() ?? item;
        for (const model of models) {
          submenu.addItem((sub: MenuItem) => {
            sub.setTitle(`${model.icon || '🤖'} ${model.alias}`);
            sub.onClick(() => this.branchFromNode(node, canvas, model));
          });
        }
      });
    }

    // P0: 继续追问
    menu.addItem((item: MenuItem) => {
      item.setTitle('💬 继续追问');
      item.setIcon('message-circle');
      item.onClick(() => this.continueChat(node, canvas));
    });

    // 直接提交到 AI（不带上下文）
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
    canvas: CanvasRuntimeView,
    selectedModel?: ModelConfig
  ) {
    new BranchModal(this.plugin.app, (result) => {
      if (!result.confirmed) return;
      this.doBranch(sourceNode, canvas, result.directions, selectedModel);
    }).open();
  }

  private async doBranch(
    sourceNode: CanvasRuntimeNode,
    canvas: CanvasRuntimeView,
    directions: string[],
    selectedModel?: ModelConfig
  ) {
    // 模型选择：优先使用传入的模型，否则用默认模型
    const mk = selectedModel
      ? this.resolveModelKey(selectedModel)
      : this.getModelAndKey();
    if (!mk) return;
    const { model, apiKey } = mk;

    const customInstructions = this.plugin.settings.getSettings().customInstructions;

    // 标记源节点为 user（如果未标记）
    if (!getNodeRole(sourceNode)) {
      setNodeRole(sourceNode, 'user');
    }

    const offsetX = 400;
    const nodeSpacing = 80;
    const nodeHeight = sourceNode.height || 200;

    // 为每个方向创建 AI 回答节点 + 连线
    const branches = directions.map((direction, i) => {
      const yOffset = i * (nodeHeight + nodeSpacing);

      const answerNode = canvas.createTextNode({
        pos: {
          x: sourceNode.x + offsetX,
          y: sourceNode.y + yOffset,
        },
        text: '思考中...',
        size: { width: sourceNode.width, height: sourceNode.height },
        focus: false,
      });
      setNodeRole(answerNode, 'assistant');

      this.addEdge(canvas, sourceNode.id, answerNode.id, 'right', 'top', direction);

      const messages = buildBranchContext(
        canvas,
        sourceNode.id,
        direction,
        customInstructions
      );

      return { answerNode, messages, direction };
    });

    // 并行请求所有方向
    await Promise.allSettled(
      branches.map(async ({ answerNode, messages }) => {
        const client = createLLMClient(model, apiKey);
        let fullText = '';

        try {
          await client.streamChat(messages, (token: string) => {
            fullText += token;
            answerNode.setText(fullText);
            this.autoFitHeight(answerNode);
          });
        } catch (error) {
          console.error('Branch Chat: API error', error);
          answerNode.setText(`❌ 请求失败: ${error}`);
        }
      })
    );

    // 为每个分支创建追问输入节点
    for (const branch of branches) {
      const askNode = canvas.createTextNode({
        pos: {
          x: branch.answerNode.x,
          y: branch.answerNode.y + branch.answerNode.height + 50,
        },
        text: '',
        focus: branches.indexOf(branch) === 0,
      });
      setNodeRole(askNode, 'user');
      this.addEdge(canvas, branch.answerNode.id, askNode.id, 'bottom', 'top');
    }

    canvas.requestSave();
  }

  // ============================================================
  // P0: 继续追问
  // ============================================================

  private async continueChat(
    sourceNode: CanvasRuntimeNode,
    canvas: CanvasRuntimeView
  ) {
    const mk = this.getModelAndKey();
    if (!mk) return;
    const { model, apiKey } = mk;

    const customInstructions = this.plugin.settings.getSettings().customInstructions;

    // 读取源节点角色（元数据驱动）
    const role = getNodeRole(sourceNode);

    // 情况1：在 AI 节点上追问 → 检查是否已有空 user 子节点
    if (role === 'assistant') {
      const childIds = findChildNodeIds(canvas, sourceNode.id);
      const hasEmptyChild = childIds.some(id => {
        const child = findNodeById(canvas, id);
        if (!child) return false;
        return getNodeRole(child) === 'user' && !getNodeText(child).trim();
      });

      if (hasEmptyChild) {
        new Notice('💬 请在下方输入框输入追问内容，然后右键 → 继续追问');
      } else {
        const askNode = canvas.createTextNode({
          pos: {
            x: sourceNode.x,
            y: sourceNode.y + sourceNode.height + 50,
          },
          text: '',
          focus: true,
        });
        setNodeRole(askNode, 'user');
        this.addEdge(canvas, sourceNode.id, askNode.id, 'bottom', 'top');
        new Notice('💬 输入追问内容后，右键 → 继续追问');
      }
      return;
    }

    // 情况2：user 节点但文本为空
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
    setNodeRole(answerNode, 'assistant');

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
    const client = createLLMClient(model, apiKey);
    let fullText = '';

    try {
      await client.streamChat(messages, (token: string) => {
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
    setNodeRole(askNode, 'user');
    this.addEdge(canvas, answerNode.id, askNode.id, 'bottom', 'top');
  }

  // ============================================================
  // 直接提交到 AI（无上下文）
  // ============================================================

  private async submitToAi(
    sourceNode: CanvasRuntimeNode,
    canvas: CanvasRuntimeView
  ) {
    const mk = this.getModelAndKey();
    if (!mk) return;
    const { model, apiKey } = mk;

    const customInstructions = this.plugin.settings.getSettings().customInstructions;

    // 标记源节点为 user（如果未标记）
    if (!getNodeRole(sourceNode)) {
      setNodeRole(sourceNode, 'user');
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
    setNodeRole(answerNode, 'assistant');

    this.addEdge(canvas, sourceNode.id, answerNode.id, 'bottom', 'top');

    const messages: ChatMessage[] = [];
    if (customInstructions) {
      messages.push({ role: 'system', content: customInstructions });
    }
    messages.push({ role: 'user', content: sourceNode.text });

    const client = createLLMClient(model, apiKey);
    let fullText = '';

    try {
      await client.streamChat(messages, (token: string) => {
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

  private autoFitHeight(node: CanvasRuntimeNode): void {
    const actualHeight = getNodeScrollHeight(node);
    const nodeData = node.getData();
    if (actualHeight > nodeData.height) {
      node.setData({ ...nodeData, height: actualHeight });
    }
  }
}
