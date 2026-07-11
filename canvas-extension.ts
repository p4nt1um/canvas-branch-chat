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
import { CanvasRuntimeNode, CanvasRuntimeView, ChatMessage, ModelConfig, BRANCH_COLOR_PALETTE } from './types';
import { createProvider } from './providers';
import { getNodeScrollHeight, generateId, truncateText } from './utils';
import { BranchModal, BranchDirection } from './branch-modal';
import { buildBranchContext, buildContextFromChain, buildMergeContext, getAncestorChain, getNodeRole, setNodeRole, setNodeColor, setNodeMetadata, findChildNodeIds, findNodeById, getNodeText } from './context';
import { exportCanvasConversation } from './export';
import { parseSkillTag } from './skill-scanner';
import { MergeModal } from './merge-modal';
import { FollowUpModal } from './follow-up-modal';

export default class CanvasBranchExtension {
  plugin: CanvasBranchChatPlugin;

  constructor(plugin: CanvasBranchChatPlugin) {
    this.plugin = plugin;

    this.plugin.registerEvent(
      this.plugin.app.workspace.on(
        'canvas:node-menu',
        ((menu: Menu, node: CanvasRuntimeNode) => {
          this.onNodeMenu(menu, node);
        }) as any
      )
    );

    // P2 #13: 尝试注册多选菜单事件
    // Obsidian Canvas 内部可能有 'canvas:selection-menu' 事件
    this.plugin.registerEvent(
      this.plugin.app.workspace.on(
        'canvas:selection-menu' as any,
        ((menu: Menu, canvas: CanvasRuntimeView) => {
          this.onSelectionMenu(menu, canvas);
        }) as any
      )
    );
  }

  // ============================================================
  // 模型获取工具
  // ============================================================

  /** P2 #15: 在 system prompt 中注入金字塔摘要引导 */
  private buildSystemPrompt(basePrompt?: string): string {
    const guidance = this.plugin.settings.getSummaryGuidance();
    const suffix = '\n\n请在回答开头用 2-3 句话概括核心结论，然后再展开详细说明。';
    if (!basePrompt) return guidance ? suffix.trim() : '';
    return guidance ? basePrompt + suffix : basePrompt;
  }

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
    const cv = node.canvas;
    if (!cv) return;

    // P0 #1: 从此处分叉（弹窗内选模型）
    menu.addItem((item: MenuItem) => {
      item.setTitle('🔀 从此处分叉');
      item.setIcon('git-branch');
      item.onClick(() => this.branchFromNode(node, cv));
    });

    // P2 #13: 合并分支（从当前节点发起）
    menu.addItem((item: MenuItem) => {
      item.setTitle('🔀 合并分支');
      item.setIcon('git-merge');
      item.onClick(() => this.mergeBranches(cv, node));
    });

    // P0: 继续追问
    menu.addItem((item: MenuItem) => {
      item.setTitle('💬 继续追问');
      item.setIcon('message-circle');
      item.onClick(() => this.continueChat(node, cv));
    });

    // 直接提交到 AI（不带上下文）
    menu.addItem((item: MenuItem) => {
      item.setTitle('🤖 提交到 AI');
      item.setIcon('bot');
      item.onClick(() => this.submitToAi(node, cv));
    });

    // P1 #9: 导出对话树
    menu.addItem((item: MenuItem) => {
      item.setTitle('📥 导出对话树');
      item.setIcon('download');
      item.onClick(() => exportCanvasConversation(this.plugin.app, cv, node.id));
    });
  }

  // ============================================================
  // P2 #13: 多选菜单
  // ============================================================

  /**
   * 多选右键菜单回调
   * 如果 Obsidian Canvas 不触发此事件，则静默不生效，不会报错。
   */
  private onSelectionMenu(menu: Menu, canvas: CanvasRuntimeView) {
    const selectedNodes = this.getSelectedNodes(canvas);
    if (selectedNodes.length < 2) return;

    menu.addItem((item: MenuItem) => {
      item.setTitle(`🔀 合并 ${selectedNodes.length} 个分支`);
      item.setIcon('git-merge');
      item.onClick(() => {
        // 直接用选中节点列表打开合并弹窗
        const models = this.plugin.settings.getModels();
        const defaultModelId = this.plugin.settings.getDefaultModel()?.id || '';
        new MergeModal(
          this.plugin.app,
          canvas,
          selectedNodes[0].id,
          models,
          defaultModelId,
          (result) => {
            if (!result.confirmed) return;
            if (result.selectedNodeIds.length < 2) {
              new Notice('请至少选择 2 个节点进行合并');
              return;
            }
            this.doMerge(canvas, result.selectedNodeIds, result.prompt, result.modelId);
          },
          selectedNodes.map(n => n.id),
        ).open();
      });
    });
  }

  // ============================================================
  // P0 #1-#4: 从节点分叉
  // ============================================================

  private branchFromNode(
    sourceNode: CanvasRuntimeNode,
    canvas: CanvasRuntimeView,
  ) {
    const skills = this.plugin.skillScanner.getSkills();
    const models = this.plugin.settings.getModels();
    const defaultModelId = this.plugin.settings.getDefaultModel()?.id || '';
    const frameworks = this.plugin.settings.getFrameworks();

    new BranchModal(
      this.plugin.app,
      (result) => {
        if (!result.confirmed) return;
        this.doBranch(sourceNode, canvas, result.directions);
      },
      undefined,
      skills,
      models,
      defaultModelId,
      frameworks,
    ).open();
  }

  private async doBranch(
    sourceNode: CanvasRuntimeNode,
    canvas: CanvasRuntimeView,
    directions: BranchDirection[],
  ) {
    const customInstructions = this.plugin.settings.getSettings().customInstructions;

    // 标记源节点为 user（如果未标记）— 不修改源节点颜色
    if (!getNodeRole(sourceNode)) {
      setNodeRole(sourceNode, 'user');
    }

    const offsetX = 400;
    const nodeSpacing = 80;
    const nodeHeight = sourceNode.height || 200;

    // P1 #8: 为每个方向分配分支颜色
    const branchColor = (index: number) => BRANCH_COLOR_PALETTE[index % BRANCH_COLOR_PALETTE.length];

    // 为每个方向创建 AI 回答节点 + 连线
    const branches = directions.map((dir, i) => {
      // 按方向取模型
      const model = this.plugin.settings.getModel(dir.modelId) || this.plugin.settings.getDefaultModel();
      if (!model) return null;
      const apiKey = this.plugin.settings.resolveApiKey(model);
      if (!apiKey) return null;

      const yOffset = i * (nodeHeight + nodeSpacing);
      const bColor = branchColor(i);

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
      setNodeColor(answerNode, model.color || '#4A90D9');
      setNodeMetadata(answerNode, { chatBranchColor: bColor, modelConfigId: model.id });

      // P2 #21: 检测 /skill-name 前缀
      const skillTag = parseSkillTag(dir.text);
      const effectiveDirection = skillTag ? skillTag.direction : dir.text;
      const edgeLabel = effectiveDirection; // 边标签不含 skill 前缀
      let effectiveSystemPrompt = this.buildSystemPrompt(model.systemPrompt || customInstructions);

      if (skillTag) {
        const skill = this.plugin.skillScanner.getSkill(skillTag.skillName);
        if (skill) {
          effectiveSystemPrompt = `${skill.body}\n\n---\n\n${effectiveSystemPrompt}`;
        }
      }

      this.addEdge(canvas, sourceNode.id, answerNode.id, 'right', 'top', edgeLabel, bColor);

      const messages = buildBranchContext(
        canvas,
        sourceNode.id,
        effectiveDirection,
        effectiveSystemPrompt,
        this.plugin.settings.getContextRecentFull(),
        this.plugin.settings.getContextTruncateChars(),
      );

      return { answerNode, messages, model, apiKey };
    }).filter((b): b is NonNullable<typeof b> => b !== null);

    // 并行请求所有方向（每方向独立模型）
    await Promise.allSettled(
      branches.map(async ({ answerNode, messages, model, apiKey }) => {
        const provider = createProvider(model, apiKey);
        let fullText = '';

        try {
          await provider.streamChat(messages, (token: string) => {
            fullText += token;
            answerNode.setText(fullText);
            this.autoFitHeight(answerNode);
          });
          // P1 #10: AI 回答完成后设置摘要
          this.setNodeSummary(answerNode, fullText, model);
        } catch (error) {
          console.error('Branch Chat: API error', error);
          answerNode.setText(`❌ 请求失败: ${error}`);
        }
      })
    );

    canvas.requestSave();
  }

  // ============================================================
  // P0: 继续追问（弹窗式）
  // ============================================================

  /**
   * 右键任意节点 → 弹窗输入追问 → 自动建 user 节点 + AI 节点
   *
   * 解决旧版问题：手动建节点缺少 chatRole 和 edge，导致上下文断裂。
   */
  private continueChat(
    sourceNode: CanvasRuntimeNode,
    canvas: CanvasRuntimeView,
  ) {
    const models = this.plugin.settings.getModels();
    const defaultModelId = this.plugin.settings.getDefaultModel()?.id || '';

    new FollowUpModal(
      this.plugin.app,
      canvas,
      sourceNode,
      models,
      defaultModelId,
      async (result) => {
        if (!result.confirmed) return;

        const model = this.plugin.settings.getModel(result.modelId)
          || this.plugin.settings.getDefaultModel();
        if (!model) {
          new Notice('请先在设置中添加模型配置');
          return;
        }
        const apiKey = this.plugin.settings.resolveApiKey(model);
        if (!apiKey) {
          new Notice(`无法解析 API Key，请检查环境变量 "${model.apiKeyEnvVar}"`);
          return;
        }

        // P2 #22: 合并输入框 + 候选问题（去重）
        const allQuestions: string[] = [];
        if (result.prompt.trim()) allQuestions.push(result.prompt.trim());
        for (const c of result.candidates) {
          const trimmed = c.trim();
          if (trimmed && !allQuestions.includes(trimmed)) allQuestions.push(trimmed);
        }

        if (allQuestions.length === 0) return;

        const customInstructions = this.plugin.settings.getSettings().customInstructions;
        const branchColor = (sourceNode.getData() as any)?.chatBranchColor;

        // P2 #22: 多问题时，从源节点横向排列；单问题时纵向排列
        const isMulti = allQuestions.length > 1;
        const offsetX = sourceNode.width + 60;

        // 并行创建所有 user+AI 节点对
        const promises = allQuestions.map(async (question, idx) => {
          const xPos = isMulti
            ? sourceNode.x + idx * offsetX
            : sourceNode.x;

          // 1. 创建 user 节点
          const userNode = canvas.createTextNode({
            pos: {
              x: xPos,
              y: sourceNode.y + sourceNode.height + 50,
            },
            text: question,
            size: { width: sourceNode.width, height: 120 },
            focus: false,
          });
          setNodeRole(userNode, 'user');
          if (branchColor) {
            setNodeMetadata(userNode, { chatBranchColor: branchColor });
          }
          this.addEdge(canvas, sourceNode.id, userNode.id, 'bottom', 'top', undefined, branchColor);

          // 2. 创建 AI 回答节点
          const answerNode = canvas.createTextNode({
            pos: {
              x: xPos,
              y: userNode.y + 120 + 50,
            },
            text: '思考中...',
            size: { width: sourceNode.width, height: sourceNode.height },
            focus: false,
          });
          setNodeRole(answerNode, 'assistant');
          setNodeColor(answerNode, model.color || '#4A90D9');
          setNodeMetadata(answerNode, { modelConfigId: model.id });
          if (branchColor) {
            setNodeMetadata(answerNode, { chatBranchColor: branchColor });
          }
          this.addEdge(canvas, userNode.id, answerNode.id, 'bottom', 'top', undefined, branchColor);

          // 3. 构建上下文（从 user 节点向上遍历）
          // P2 #15: 分级压缩
          const chain = getAncestorChain(canvas, userNode.id);
          const historyMessages = buildContextFromChain(
            canvas,
            chain,
            this.plugin.settings.getContextRecentFull(),
            this.plugin.settings.getContextTruncateChars(),
          );

          const messages: ChatMessage[] = [];
          const sysPrompt = this.buildSystemPrompt(model.systemPrompt || customInstructions);
          if (sysPrompt) {
            messages.push({ role: 'system', content: sysPrompt });
          }
          messages.push(...historyMessages);

          // 4. 流式请求
          const provider = createProvider(model, apiKey);
          let fullText = '';

          try {
            await provider.streamChat(messages, (token: string) => {
              fullText += token;
              answerNode.setText(fullText);
              this.autoFitHeight(answerNode);
            });
            this.setNodeSummary(answerNode, fullText, model);
          } catch (error) {
            console.error('Branch Chat: follow-up API error', error);
            answerNode.setText(`❌ 请求失败: ${error}`);
          }
        });

        // 等待所有请求完成
        await Promise.all(promises);
        canvas.requestSave();
      },
    ).open();
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

    // 空内容拦截
    const nodeText = sourceNode.text?.trim();
    if (!nodeText) {
      new Notice('请先输入内容，再提交到 AI');
      return;
    }

    // 标记源节点为 user（如果未标记）— 不修改源节点颜色
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
    setNodeColor(answerNode, model.color || '#4A90D9'); // P1 #6: assistant 模型颜色
    setNodeMetadata(answerNode, { modelConfigId: model.id });

    this.addEdge(canvas, sourceNode.id, answerNode.id, 'bottom', 'top');

    const messages: ChatMessage[] = [];
    const sysPrompt = this.buildSystemPrompt(model.systemPrompt || customInstructions);
    if (sysPrompt) {
      messages.push({ role: 'system', content: sysPrompt });
    }
    messages.push({ role: 'user', content: sourceNode.text });

    const provider = createProvider(model, apiKey);
    let fullText = '';

    try {
      await provider.streamChat(messages, (token: string) => {
        fullText += token;
        answerNode.setText(fullText);
        this.autoFitHeight(answerNode);
      });
      // P1 #10: 设置摘要
      this.setNodeSummary(answerNode, fullText, model);
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
    label?: string,
    color?: string  // P1 #8: 分支颜色
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
      color: color || undefined,
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

  // ============================================================
  // P1 #10: 节点自动命名（摘要）
  // ============================================================

  /**
   * P1 #10: AI 回答完成后，将模型信息 + 摘要写入节点元数据
   *
   * 只写元数据（chatSummary、modelAlias），不修改节点可见文本。
   * 避免在文本中加前缀导致上下文构建时混入噪音。
   */
  private setNodeSummary(node: CanvasRuntimeNode, fullText: string, model: ModelConfig): void {
    const summary = truncateText(fullText.replace(/[#*>`\n]/g, ' ').trim(), 50);
    setNodeMetadata(node, {
      chatSummary: summary,
      modelAlias: model.alias,
    });
  }

  // ============================================================
  // P2 #13: 多分支合并
  // ============================================================

  /** 获取 Canvas 中当前选中的节点列表 */
  private getSelectedNodes(canvas: CanvasRuntimeView): CanvasRuntimeNode[] {
    const internalCanvas = canvas as any;

    // Method 1: canvas.selection (Set/Map/Array)
    if (internalCanvas.selection) {
      const sel = internalCanvas.selection;
      if (sel instanceof Set) return Array.from(sel);
      if (sel instanceof Map) return Array.from(sel.values());
      if (Array.isArray(sel)) return sel;
    }

    // Method 2: filter nodes by isSelected
    const nodesMap = internalCanvas.nodes ?? internalCanvas._nodes;
    if (nodesMap) {
      const allNodes = nodesMap instanceof Map
        ? Array.from(nodesMap.values())
        : Object.values(nodesMap);
      return allNodes.filter((n: any) => n.isSelected);
    }

    return [];
  }

  /** 弹出合并弹窗 */
  private mergeBranches(
    canvas: CanvasRuntimeView,
    currentNode: CanvasRuntimeNode,
  ) {
    const models = this.plugin.settings.getModels();
    const defaultModelId = this.plugin.settings.getDefaultModel()?.id || '';

    new MergeModal(
      this.plugin.app,
      canvas,
      currentNode.id,
      models,
      defaultModelId,
      (result) => {
        if (!result.confirmed) return;
        if (result.selectedNodeIds.length < 2) {
          new Notice('请至少选择 2 个节点进行合并');
          return;
        }
        this.doMerge(canvas, result.selectedNodeIds, result.prompt, result.modelId);
      },
    ).open();
  }

  /** 执行合并：创建汇总节点 + 连线 + AI 调用 */
  private async doMerge(
    canvas: CanvasRuntimeView,
    sourceNodeIds: string[],
    userPrompt: string,
    modelId: string,
  ) {
    const model = this.plugin.settings.getModel(modelId)
      || this.plugin.settings.getDefaultModel();
    if (!model) {
      new Notice('请先在设置中添加模型配置');
      return;
    }

    const apiKey = this.plugin.settings.resolveApiKey(model);
    if (!apiKey) {
      new Notice(`无法解析 API Key，请检查环境变量 "${model.apiKeyEnvVar}"`);
      return;
    }

    const customInstructions = this.plugin.settings.getSettings().customInstructions;

    // 获取所有源节点
    const sourceNodes: CanvasRuntimeNode[] = [];
    for (const id of sourceNodeIds) {
      const node = findNodeById(canvas, id);
      if (node) sourceNodes.push(node);
    }
    if (sourceNodes.length < 2) {
      new Notice('未能找到足够的节点');
      return;
    }

    // 计算汇总节点位置
    const xs = sourceNodes.map(n => n.x);
    const maxBottom = Math.max(...sourceNodes.map(n => n.y + (n.height || 200)));
    const centerX = (Math.min(...xs) + Math.max(...xs)) / 2;
    const maxWidth = Math.max(...sourceNodes.map(n => n.width || 400));

    // 创建汇总节点
    const summaryNode = canvas.createTextNode({
      pos: { x: centerX, y: maxBottom + 60 },
      text: '思考中...',
      size: { width: maxWidth, height: 200 },
      focus: false,
    });
    setNodeRole(summaryNode, 'assistant');
    setNodeColor(summaryNode, model.color || '#4A90D9');
    setNodeMetadata(summaryNode, { modelConfigId: model.id });

    // 连线：每个源节点 → 汇总节点
    for (const srcNode of sourceNodes) {
      const bColor = (srcNode.getData() as any)?.chatBranchColor;
      this.addEdge(canvas, srcNode.id, summaryNode.id, 'bottom', 'top', undefined, bColor);
    }

    // 构建合并上下文
    const systemPrompt = this.buildSystemPrompt(model.systemPrompt || customInstructions);
    const messages = buildMergeContext(
      canvas,
      sourceNodeIds,
      userPrompt,
      systemPrompt,
    );

    // 流式请求
    const provider = createProvider(model, apiKey);
    let fullText = '';

    try {
      await provider.streamChat(messages, (token: string) => {
        fullText += token;
        summaryNode.setText(fullText);
        this.autoFitHeight(summaryNode);
      });
      this.setNodeSummary(summaryNode, fullText, model);
    } catch (error) {
      console.error('Branch Chat: merge API error', error);
      summaryNode.setText(`❌ 请求失败: ${error}`);
    }

    canvas.requestSave();
  }
}
