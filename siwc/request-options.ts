import { Setting, DropdownComponent } from 'obsidian';
import { ModelConfig } from '../types';
import { SiwcProvider } from '../providers/siwc-provider';
export interface RequestOptions { model?: string; reasoningEffort?: string }
export function applyRequestOptions(base: ModelConfig, options?: RequestOptions): ModelConfig {
  if (base.providerType !== 'siwc') return base;
  const model = options?.model || base.model;
  const hasEffort = options !== undefined && Object.prototype.hasOwnProperty.call(options, 'reasoningEffort');
  const reasoningEffort = hasEffort ? options?.reasoningEffort || undefined : model === base.model ? base.reasoningEffort : undefined;
  return { ...base, model, reasoningEffort };
}
/** These overrides belong to this request and never mutate saved provider settings. */
export function renderRequestOptions(host: HTMLElement, base: ModelConfig, options: RequestOptions, changed: (value: RequestOptions) => void) {
  host.empty();
  if (base.providerType !== 'siwc') return;
  let picker: DropdownComponent, effort: DropdownComponent;
  const row = new Setting(host).setName('本次模型').setDesc('正在加载授权模型…');
  row.addDropdown(d => { picker = d; d.addOption('', '加载中…').setDisabled(true); });
  const effortRow = new Setting(host).setName('思考强度').setDesc('仅应用于本次请求');
  effortRow.addDropdown(d => { effort = d; d.addOption('', '模型默认').setDisabled(true); });
  const values: RequestOptions = { ...options, reasoningEffort: applyRequestOptions(base, options).reasoningEffort || '' };
  void new SiwcProvider(base).catalog().then(models => {
    if (!host.contains(row.settingEl)) return;
    const updateEffort = () => {
      const selected = models.find(m => m.slug === (values.model || base.model));
      const levels = selected?.supported_reasoning_levels || [];
      effort.selectEl.options.length = 0; effort.addOption('', '模型默认');
      const labels: Record<string,string> = {none:'无',minimal:'最低',low:'低',medium:'中',high:'高',xhigh:'很高',max:'最大',ultra:'极高'};
      for (const level of levels) effort.addOption(level.effort, labels[level.effort] || level.effort);
      if (!levels.some(l => l.effort === values.reasoningEffort)) { values.reasoningEffort = ''; changed({ ...values }); }
      effort.setValue(values.reasoningEffort || '').setDisabled(!levels.length);
      effortRow.setDesc(levels.length ? '仅应用于本次请求；更高强度通常耗时更多。' : '此模型未声明可调整的思考强度，使用模型默认。');
    };
    picker.selectEl.options.length = 0; picker.addOption('', '请选择模型');
    for (const m of models) picker.addOption(m.slug, m.display_name);
    if (!models.some(m => m.slug === (values.model || base.model))) values.model = '';
    picker.setValue(values.model || base.model).setDisabled(!models.length);
    picker.onChange(v => { values.model = v; values.reasoningEffort = ''; updateEffort(); changed({...values}); });
    effort.onChange(v => { values.reasoningEffort = v; changed({...values}); });
    updateEffort(); row.setDesc('仅应用于本次请求，不改变设置中的默认模型。');
  }).catch(() => { if (host.contains(row.settingEl)) row.setDesc('模型列表加载失败，请关闭弹窗后重试。'); });
}
