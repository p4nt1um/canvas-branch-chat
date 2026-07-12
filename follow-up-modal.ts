/**
 * follow-up-modal.ts — 追问输入弹窗
 *
 * 右键任意节点 → 💬 继续追问 → 弹窗输入问题 → 自动建 user 节点 + AI 节点
 * P2 #22: 智能追问 — 从 AI 回答中提取候选问题，批量深挖
 */

import { App, Modal, Setting, Notice } from 'obsidian';
import { ModelConfig, ChatMessage } from './types';
import { CanvasRuntimeNode, CanvasRuntimeView } from './types';
import { createProvider } from './providers';
import { getAncestorChain, buildContextFromChain, getNodeRole, getNodeText, findNodeById } from './context';

export interface FollowUpModalResult {
  /** 输入框内容 */
  prompt: string;
  /** 智能追问候选问题列表 */
  candidates: string[];
  modelId: string;
  confirmed: boolean;
}

export class FollowUpModal extends Modal {
  private prompt: string = '';
  private candidates: string[] = [];
  private modelId: string;
  private result: FollowUpModalResult;
  private onSubmit: (result: FollowUpModalResult) => void;
  private models: ModelConfig[];
  private canvas: CanvasRuntimeView;
  private sourceNode: CanvasRuntimeNode;
  private candidateListEl: HTMLElement | null = null;
  private extracting: boolean = false;

  constructor(
    app: App,
    canvas: CanvasRuntimeView,
    sourceNode: CanvasRuntimeNode,
    models: ModelConfig[],
    defaultModelId: string,
    onSubmit: (result: FollowUpModalResult) => void,
  ) {
    super(app);
    this.canvas = canvas;
    this.sourceNode = sourceNode;
    this.models = models;
    this.modelId = defaultModelId;
    this.onSubmit = onSubmit;
    this.result = { prompt: '', candidates: [], modelId: '', confirmed: false };
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();

    new Setting(contentEl).setName('💬 继续追问').setHeading();

    // 输入框
    new Setting(contentEl)
      .setDesc('基于当前对话上下文，输入你的追问')
      .addTextArea((text) => {
        text.setPlaceholder('输入追问内容...');
        text.inputEl.addClass('setting-wide-input', 'setting-min-height-80');
        text.onChange((value) => {
          this.prompt = value;
        });
        window.setTimeout(() => text.inputEl.focus(), 50);
      });

    // 智能追问按钮
    new Setting(contentEl)
      .addButton((btn) =>
        btn
          .setButtonText('✨ 智能追问')
          .setCta()
          .onClick(() => this.extractCandidates()),
      );

    // 候选问题列表容器（初始隐藏，点击后展开）
    this.candidateListEl = contentEl.createDiv({ cls: 'follow-up-candidates' });
    this.candidateListEl.addClass('setting-hidden');

    // 模型选择
    if (this.models.length > 0) {
      new Setting(contentEl)
        .setName('模型')
        .addDropdown((dropdown) => {
          for (const m of this.models) {
            dropdown.addOption(m.id, `${m.icon || '🤖'} ${m.alias}`);
          }
          dropdown.setValue(this.modelId);
          dropdown.onChange((value) => {
            this.modelId = value;
          });
        });
    }

    // 操作按钮
    new Setting(contentEl)
      .addButton((btn) =>
        btn
          .setButtonText('发送')
          .setCta()
          .onClick(() => this.confirm()),
      )
      .addButton((btn) =>
        btn.setButtonText('取消').onClick(() => this.close()),
      );
  }

  /** P2 #22: 从 AI 祖先节点提取候选问题 */
  private async extractCandidates() {
    if (this.extracting) return;
    this.extracting = true;

    // 先尝试正则提取
    const regexQuestions = this.extractByRegex();

    if (regexQuestions.length >= 2) {
      this.candidates = regexQuestions;
      this.renderCandidates();
      this.extracting = false;
      return;
    }

    // 正则不够，fallback 到 AI 生成
    const aiQuestions = await this.extractByAI();
    this.candidates = aiQuestions.length > 0 ? aiQuestions : regexQuestions;
    this.renderCandidates();
    this.extracting = false;
  }

  /** 正则提取：从右键节点（如果是 AI）或最近的 AI 祖先提取要点 */
  private extractByRegex(): string[] {
    const chain = getAncestorChain(this.canvas, this.sourceNode.id);
    const questions: string[] = [];

    // 优先取右键节点本身（如果是 AI），否则取最近的 1 个 AI 祖先
    const sourceRole = getNodeRole(this.sourceNode);
    let targetNode: CanvasRuntimeNode | null = null;

    if (sourceRole === 'assistant') {
      // 右键在 AI 节点上，直接用它
      targetNode = this.sourceNode;
    } else {
      // 右键在 user/其他节点上，找最近的 AI 祖先
      for (let i = chain.length - 1; i >= 0 && !targetNode; i--) {
        const node = findNodeById(this.canvas, chain[i]);
        if (node && getNodeRole(node) === 'assistant' && node.id !== this.sourceNode.id) {
          targetNode = node;
        }
      }
    }

    if (!targetNode) return [];
    const text = getNodeText(targetNode);
    if (!text) return [];

    // 匹配 ### 标题
    const h3Matches = text.match(/^###\s+.+$/gm) || [];
    for (const m of h3Matches) {
      const q = m.replace(/^###\s+/, '').trim();
      if (q && q.length > 2 && q.length < 100) {
        questions.push(this.toQuestion(q));
      }
    }

    // 匹配数字列表 1. / 2. / 等
    const numMatches = text.match(/^\d+[.)、]\s+.+$/gm) || [];
    for (const m of numMatches) {
      const q = m.replace(/^\d+[.)、]\s+/, '').trim();
      if (q && q.length > 2 && q.length < 100) {
        questions.push(this.toQuestion(q));
      }
    }

    // 匹配 - bullet points
    const bulletMatches = text.match(/^[-•]\s+.+$/gm) || [];
    for (const m of bulletMatches) {
      const q = m.replace(/^[-•]\s+/, '').trim();
      if (q && q.length > 2 && q.length < 100) {
        questions.push(this.toQuestion(q));
      }
    }

    // 去重，最多 6 个
    return [...new Set(questions)].slice(0, 6);
  }

  /** 将要点文本转为追问句式 */
  private toQuestion(point: string): string {
    // 去掉末尾标点
    const clean = point.replace(/[。.！!？?：:，,]+$/, '').trim();
    // 已经是问句直接返回
    if (/[？?]$/.test(point)) return clean + '？';
    // 否则加"请详细说说"
    return `请详细说说「${clean}」`;
  }

  /** AI 生成：调一次 API 生成候选问题 */
  private async extractByAI(): Promise<string[]> {
    const model = this.models.find(m => m.id === this.modelId) || this.models[0];
    if (!model) return [];

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const apiKey = (this.canvas as any)?.plugin?.settings?.resolveApiKey?.(model)
      || process.env[model.apiKeyEnvVar];
    if (!apiKey) return [];

    // 构建最近上下文
    const chain = getAncestorChain(this.canvas, this.sourceNode.id);
    const history = buildContextFromChain(this.canvas, chain, 2, 500);

    if (history.length === 0) return [];

    const messages: ChatMessage[] = [
      {
        role: 'system',
        content: '根据以下对话内容，生成 3-5 个用户最可能想深入追问的问题。每行一个问题，以「」包裹，不要编号。问题要具体、有针对性。',
      },
      ...history,
    ];

    try {
      const provider = createProvider(model, apiKey);
      const result = await provider.streamChat(messages);
      // 解析每行一个问题
      const lines = result.split('\n')
        .map(l => l.trim())
        .filter(l => l.length > 5 && l.length < 200)
        .map(l => l.replace(/^[「"'\-\s]+/, '').replace(/[」"'\-\s]+$/, '').trim())
        .filter(l => l.length > 3);
      return [...new Set(lines)].slice(0, 6);
    } catch (e) {
      console.error('Smart follow-up extraction failed', e);
      return [];
    }
  }

  /** 渲染候选问题列表 */
  private renderCandidates() {
    if (!this.candidateListEl) return;
    this.candidateListEl.empty();
    this.candidateListEl.removeClass('setting-hidden');

    if (this.candidates.length === 0) {
      this.candidateListEl.createEl('p', {
        text: '未提取到候选问题，请手动输入',
        cls: 'follow-up-no-candidates',
      });
      return;
    }

    this.candidateListEl.createEl('p', {
      text: `从 AI 回答中提取了 ${this.candidates.length} 个候选问题：`,
      cls: 'follow-up-candidates-header',
    });

    for (let i = 0; i < this.candidates.length; i++) {
      const row = this.candidateListEl.createDiv({ cls: 'follow-up-candidate-row' });

      const input = row.createEl('input', {
        type: 'text',
        cls: 'follow-up-candidate-input',
      });
      input.value = this.candidates[i];
      input.addClass('setting-wide-input');
      input.addEventListener('input', () => {
        this.candidates[i] = input.value;
      });

      const delBtn = row.createEl('button', { text: '×', cls: 'follow-up-candidate-del' });
      delBtn.addEventListener('click', () => {
        this.candidates.splice(i, 1);
        this.renderCandidates();
      });
    }

    // 添加按钮
    const addBtn = this.candidateListEl.createEl('button', {
      text: '＋ 添加问题',
      cls: 'follow-up-candidate-add',
    });
    addBtn.addEventListener('click', () => {
      this.candidates.push('');
      this.renderCandidates();
      // 聚焦新输入框
      const inputs = this.candidateListEl?.querySelectorAll('input.follow-up-candidate-input');
      if (inputs && inputs.length > 0) {
        const last = inputs[inputs.length - 1] as HTMLInputElement;
        last.focus();
      }
    });
  }

  private confirm() {
    // 输入框内容
    const promptTrim = this.prompt.trim();
    // 过滤空候选
    const validCandidates = this.candidates.filter(c => c.trim().length > 0);

    // 合并去重
    const all: string[] = [];
    if (promptTrim) all.push(promptTrim);
    for (const c of validCandidates) {
      if (!all.includes(c)) all.push(c);
    }

    if (all.length === 0) {
      new Notice('请输入追问内容或提取候选问题');
      return;
    }

    this.result = {
      prompt: promptTrim,
      candidates: validCandidates,
      modelId: this.modelId,
      confirmed: true,
    };
    this.close();
  }

  onClose() {
    this.onSubmit(this.result);
  }
}
