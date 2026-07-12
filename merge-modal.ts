/**
 * merge-modal.ts — 多分支合并输入弹窗
 *
 * 右键节点 → 合并分支 → 选择要合并的节点 + 输入提问
 */

import { App, Modal, Setting } from 'obsidian';
import { ModelConfig } from './types';
import { CanvasRuntimeNode, CanvasRuntimeView } from './types';
import { getNodeRole, getNodeText } from './context';

export interface MergeModalResult {
  prompt: string;
  modelId: string;
  selectedNodeIds: string[];
  confirmed: boolean;
}

export class MergeModal extends Modal {
  private prompt: string = '总结以上观点';
  private modelId: string;
  private result: MergeModalResult;
  private onSubmit: (result: MergeModalResult) => void;
  private models: ModelConfig[];
  private canvas: CanvasRuntimeView;
  private currentNodeId: string;
  private checkedNodes: Set<string>;
  private preselectedIds: Set<string>;

  constructor(
    app: App,
    canvas: CanvasRuntimeView,
    currentNodeId: string,
    models: ModelConfig[],
    defaultModelId: string,
    onSubmit: (result: MergeModalResult) => void,
    preselectedNodeIds?: string[],
  ) {
    super(app);
    this.canvas = canvas;
    this.currentNodeId = currentNodeId;
    this.models = models;
    this.modelId = defaultModelId;
    this.onSubmit = onSubmit;
    // 预选节点（多选入口传入）；否则默认只勾选当前节点
    this.preselectedIds = new Set(preselectedNodeIds || [currentNodeId]);
    this.checkedNodes = new Set(this.preselectedIds);
    this.result = { prompt: '', modelId: '', selectedNodeIds: [], confirmed: false };
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();

    new Setting(contentEl).setName('🔀 合并分支').setHeading();

    // 节点选择列表
    new Setting(contentEl).setName('选择要合并的节点').setHeading();
    const nodeList = contentEl.createDiv({ cls: 'merge-node-list' });

    const candidates = this.getCandidateNodes();
    for (const node of candidates) {
      const isCurrent = node.id === this.currentNodeId;
      const isPreselected = this.preselectedIds.has(node.id);
      const role = getNodeRole(node);
      const text = getNodeText(node).trim();
      const preview = text.substring(0, 60).replace(/[#*>`\n]/g, ' ');
      const roleIcon = role === 'assistant' ? '🤖' : role === 'user' ? '👤' : '📝';

      const row = nodeList.createDiv({ cls: 'merge-node-row' });
      const checkbox = row.createEl('input', { type: 'checkbox' });
      checkbox.checked = isPreselected;
      checkbox.disabled = isCurrent; // 当前节点固定勾选
      checkbox.addEventListener('change', () => {
        if (checkbox.checked) {
          this.checkedNodes.add(node.id);
        } else {
          this.checkedNodes.delete(node.id);
        }
      });

      row.createEl('span', {
        text: `${roleIcon} ${preview}${text.length > 60 ? '...' : ''}`,
        cls: isCurrent ? 'merge-node-current' : '',
      });
      if (isCurrent) {
        row.createEl('span', { text: '（当前）', cls: 'merge-node-current-tag' });
      }
    }

    // 提问输入
    new Setting(contentEl).setName('提问').setHeading();
    new Setting(contentEl)
      .setDesc('可以是总结、对比、或其他任何问题')
      .addTextArea((text) => {
        text.setPlaceholder('总结以上观点');
        text.setValue(this.prompt);
        text.inputEl.addClass('setting-wide-input', 'setting-min-height-60');
        text.onChange((value) => {
          this.prompt = value;
        });
        window.setTimeout(() => text.inputEl.focus(), 50);
      });

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
          .setButtonText('合并')
          .setCta()
          .onClick(() => this.confirm()),
      )
      .addButton((btn) =>
        btn.setButtonText('取消').onClick(() => this.close()),
      );
  }

  /** 获取候选节点：有内容的文本节点 */
  private getCandidateNodes(): CanvasRuntimeNode[] {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Canvas internal nodes map not typed
    const internalCanvas = this.canvas as any;
    const nodesMap = internalCanvas.nodes ?? internalCanvas._nodes;
    if (!nodesMap) return [];

    const allNodes = nodesMap instanceof Map
      ? Array.from(nodesMap.values())
      : Object.values(nodesMap);

    return allNodes.filter((n: CanvasRuntimeNode) => {
      const text = getNodeText(n).trim();
      return text && text !== '思考中...' && text !== 'Loading...';
    });
  }

  private confirm() {
    if (!this.prompt.trim()) return;
    if (this.checkedNodes.size === 0) return;
    this.result = {
      prompt: this.prompt.trim(),
      modelId: this.modelId,
      selectedNodeIds: Array.from(this.checkedNodes),
      confirmed: true,
    };
    this.close();
  }

  onClose() {
    this.onSubmit(this.result);
  }
}
