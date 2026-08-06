# Canvas Branch Chat — 版本历史

## 0.4.1 (2026-08-06)
**导出配置弹窗 UI 修复**

### 🐛 修复
- 修复导出配置弹窗控件不显示（Setting API → 直接 DOM 操作）
- 添加 Modal 布局 CSS（export-setting-row、export-label）
- checkbox 复用 Obsidian 原生 .checkbox-container 样式

---

## 0.4.0 (2026-08-06)
**导出交互式 HTML + 移动端适配**

### 新功能
- **导出交互式 HTML** (#20)
  - 右键节点 → 🌐 导出交互式 HTML
  - 流式对话视图（默认）+ 分支树视图
  - 移动端适配（响应式布局 + 触摸优化）
  - 亮色/暗色主题切换（跟随系统）

- **Markdown 预渲染**
  - 导出时用 marked.js 转换为 HTML
  - 生成的 HTML 文件不嵌入 JS 库，轻量（~30KB）
  - 支持标题、列表、代码块、表格、引用等

- **对话回放功能**
  - 逐步高亮节点（1秒/节点）
  - 自动滚动到当前节点
  - 回放速度可调（0.5x / 1x / 2x）
  - 进度条显示

- **全文搜索功能**
  - 实时搜索节点内容
  - 搜索结果黄色高亮
  - 上一个/下一个结果导航
  - 键盘快捷键（Enter/Escape）

### 文件变更
- `canvas-extension.ts` +30 行：新增导出 HTML 菜单项
- `locale/zh.ts` +7 行：新增中文翻译
- `locale/en.ts` +7 行：新增英文翻译
- `export-types.ts` 新增 +49 行：数据结构定义
- `export-converter.ts` 新增 +226 行：Canvas → ExportNode 转换
- `export-styles.ts` 新增 +769 行：CSS 样式（响应式 + 暗色主题 + 移动端）
- `export-html.ts` 新增 +296 行：HTML 生成（流式/树形视图）
- `export-interactive.ts` 新增 +344 行：JS 交互（回放/搜索/主题/手势）
- `export-modal.ts` 新增 +167 行：导出配置弹窗
- `export-html-main.ts` 新增 +117 行：主入口（marked.js 预渲染）

### 技术细节
- 使用 `marked.js` 预渲染 Markdown → HTML
- CSS 变量实现主题切换（`--bg`, `--text`, `--accent`）
- 移动端优先响应式设计（`@media max-width: 768px`）
- 触摸优化（最小触摸区域 44px）
- 单文件 HTML（CSS/JS 内嵌）
- 文件名：`根节点第一句话_YYYYMMDD_HHMMSS.html`

### 依赖变更
- 新增 `marked` (Markdown 渲染库)

---

## v0.3.4 (2026-07-27)
**跨平台 API Key 解决方案**

### 新功能
- **四层 API Key 降级策略**
  - 设置面板直接输入（最高优先级）
  - 插件目录 `.env` (`canvas-branch-chat/.env`)
  - Vault 根 `.env`
  - 系统环境变量

- **BASE_URL 自动匹配**
  - 读取 `DEEPSEEK_API_KEY` 时自动从 `.env` 读取 `DEEPSEEK_BASE_URL`

- **API Key 直接输入框**
  - 设置面板每个模型配置中新增密码输入框

- **多语言完善**
  - 中英文设置面板文案全面更新

### 文件变更
- `settings.ts` +114 行：四层降级 API Key 解析
- `types.ts`: `ModelConfig` 新增 `apiKey?` 字段
- `providers/index.ts`: `createProvider()` 支持 `resolvedBaseUrl`
- `locale/en.ts` `locale/zh.ts`: 中英文文案更新

---

## v0.3.2 (2026-07-27)
**框架预设 + 快捷模板双语支持**

### 修复
- 框架预设下拉菜单中英文翻译
- 分支方向快捷模板 chips 中英文翻译

---

## v0.3.0 (2026-07-27)
**多语言支持 (i18n)**

### 新功能
- 简体中文 / English 双语支持
- 跟随系统语言自动切换
- 语言设置选项

### 文件变更
- `locale/zh.ts`: 简体中文翻译
- `locale/en.ts`: 英文翻译
- `manifest.json`: 新增 `i18n` 配置

---

## v0.2.0 (2026-07-15)
**P2 核心功能**

### 新功能
- **分支合并** (#13): 多分支合并到汇总节点，AI 自动整合
- **对话回放** (#14): 按时间顺序逐步高亮节点
- **上下文裁剪** (#15): assistant 近全远摘，user 全发
- **分叉框架预设** (#16): 13 个内置框架
- **Skills 集成** (#21-1): `/skill-name` + SKILL.md 注入
- **智能追问** (#22): 追问弹窗内提取候选问题

---

## v0.1.0 (2026-07-08)
**P0/P1/M3.5/M4 全部完成**

### P0 核心 MVP (#1-#4)
- 从节点分叉对话
- 分支方向标注
- 上下文自动继承（直系祖先链）
- 边标签显示

### P1 体验增强 (#5-#12)
- 多模型配置体系
- 节点视觉区分
- 追问快捷操作
- 分支颜色编码
- 一键导出 Markdown
- 对话节点自动命名
- 流式刷新
- 分支方向快捷模板

### 用户实测修复 (M3.5)
- 颜色改了用户输入节点和源节点
- 导出截断内容、格式修改、文件节点无双链
- AI 回答后自动生成空节点干扰布局
- 空节点点「提交到 AI」无提示
- 分叉方向被当作 system 消息
- AI 回答被加 `> 🤖` 前缀
- 多入边选错父节点导致上下文串台