import { Setting, Notice, DropdownComponent } from 'obsidian';
import { getSession } from './session';
import { SiwcProvider } from '../providers/siwc-provider';
import { ModelConfig } from '../types';
export function renderSiwc(body: HTMLElement, model: ModelConfig, update: (patch: Partial<ModelConfig>) => Promise<void>, redraw: () => void) {
  new Setting(body).setName('ChatGPT plan usage — Preview').setDesc('Eligible requests consume your ChatGPT plan allowance. Limits and credits follow your ChatGPT settings. Canvas conversations are still saved locally. No automatic API billing fallback. Temperature and token limits are unsupported in this preview.');
  const status = body.createDiv({ cls: 'siwc-status', attr: { role: 'status' } });
  const run = (fn: () => Promise<void>) => { status.setText('Working…'); void fn().then(() => status.setText('Ready')).catch(e => { const message = e instanceof Error ? e.message : 'SIWC operation failed'; status.setText(message); new Notice(message); }); };
  let selectedModel = model.model;
  let dropdown: DropdownComponent;
  let effortDropdown: DropdownComponent;
  let selectedEffort = model.reasoningEffort || '';
  let catalog: Awaited<ReturnType<SiwcProvider['catalog']>> = [];
  const renderEfforts = () => {
    const levels = catalog.find(m => m.slug === selectedModel)?.supported_reasoning_levels || [];
    effortDropdown.selectEl.options.length = 0;
    effortDropdown.addOption('', '模型默认');
    const labels: Record<string,string> = {none:'无',minimal:'最低',low:'低',medium:'中',high:'高',xhigh:'很高',max:'最大',ultra:'极高'};
    for (const level of levels) effortDropdown.addOption(level.effort, `${labels[level.effort] || level.effort} (${level.effort})`);
    if (selectedEffort && !levels.some(l => l.effort === selectedEffort)) effortDropdown.addOption(selectedEffort, `${selectedEffort}（不可用，请重选）`);
    effortDropdown.setValue(selectedEffort).setDisabled(!levels.length && !selectedEffort);
    effortSetting.setDesc(levels.length ? '作为该配置的默认强度；分叉和继续追问可单次覆盖。更高强度通常耗时更多。' : '当前模型未声明可选强度，使用模型默认。');
  };
  const picker = new Setting(body).setName('模型').setDesc('正在加载此账号可用的模型…');
  picker.addDropdown(d => {
    dropdown = d;
    d.addOption('', '请选择模型');
    if (selectedModel) d.addOption(selectedModel, selectedModel);
    d.setValue(selectedModel);
    d.onChange(value => run(async () => { await update({ model: value, reasoningEffort: undefined }); selectedModel = value; selectedEffort = ''; renderEfforts(); }));
  });
  const effortSetting = new Setting(body).setName('默认思考强度').setDesc('正在加载模型能力…');
  effortSetting.addDropdown(d => { effortDropdown = d; d.addOption('', '模型默认').setValue(selectedEffort).setDisabled(true); d.onChange(value => run(async () => { await update({ reasoningEffort: value || undefined }); selectedEffort = value; })); });
  const refreshModels = async () => {
    try {
      const models = await new SiwcProvider(model).catalog();
      catalog = models;
      renderEfforts();
      dropdown.selectEl.options.length = 0;
      dropdown.addOption('', models.length ? '请选择模型' : '此账号暂无可用模型');
      for (const m of models) dropdown.addOption(m.slug, m.display_name);
      if (selectedModel && !models.some(m => m.slug === selectedModel)) dropdown.addOption(selectedModel, `${selectedModel}（当前账号不可用）`);
      dropdown.setValue(selectedModel);
      picker.setDesc(`已加载 ${models.length} 个授权模型。选择后自动保存。`);
    } catch(e) {
      picker.setDesc('模型列表加载失败，请检查登录状态后重试。');
      throw e;
    }
  };
  picker.addButton(b => b.setButtonText('刷新模型').onClick(() => run(refreshModels)));
  const account = new Setting(body).setName('ChatGPT account');
  run(async () => { const s = getSession(); const data = await s.accounts(); account.addDropdown(d => { d.addOption('', 'Choose signed-in account'); for (const a of data.accounts) if (a.signedIn) d.addOption(a.client, a.label); d.setValue(data.active || ''); d.onChange(v => run(async () => { await s.select(v); await update({ model: '', reasoningEffort: undefined, _availableModels: [] }); redraw(); })); });
    if (data.active) await refreshModels(); else picker.setDesc('请先登录 ChatGPT，然后点击刷新模型。');
    for (const a of data.accounts) if (!a.signedIn) account.addButton(b => b.setButtonText(`Sign in: ${a.label}`).onClick(() => run(async () => { await s.login(a.client); redraw(); })));
  });
  new Setting(body).setName('Sign in').addButton(b => b.setButtonText('Continue with ChatGPT').onClick(() => run(async () => { await getSession().login(); await update({ model: '', reasoningEffort: undefined, _availableModels: [] }); redraw(); })));
  new Setting(body).setName('Sign out').addButton(b => b.setButtonText('Sign out and revoke').onClick(() => run(async () => { const ok = await getSession().logout(); new Notice(ok ? 'Signed out and revoked' : 'Signed out locally. Remote revocation was not confirmed; disconnect this app in ChatGPT Settings.'); redraw(); })));
  new Setting(body).setName('Usage').addExtraButton(b => b.setIcon('external-link').setTooltip('ChatGPT usage settings').onClick(() => window.open('https://chatgpt.com/settings/usage')));
}
