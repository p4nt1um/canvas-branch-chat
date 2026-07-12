# v0.2.2

## 🎬 对话回放

右键任意节点 → **▶️ 回放对话**，三种遍历模式逐节点聚焦回顾整个对话树。

### 三种遍历模式

| 模式 | 说明 | 快捷键 |
|------|------|--------|
| **T 时间线** | 按节点创建时间顺序（`createdAt` 时间戳） | T |
| **B 广度优先** | BFS 层序，同层按创建时间排序 | B |
| **D 深度优先** | 沿分支走到底再回溯 | D |

### 控制

- **空格** — 暂停 / 继续
- **← / →** — 上一个 / 下一个
- **Esc** — 退出回放
- **三档速度** — 慢 / 中 / 快，实时切换

### 视觉

- 全局总览 → 逐节点聚焦 → 每 4 张回一次总览锚定方位
- pending 节点灰暗，current 节点高亮+阴影，played 节点保留标记
- 全部使用 Obsidian Canvas 原生 API（`zoomToFit` / `zoomToBbox`），动画流畅不抖动

## ✨ 智能追问改进

**分级降级提取**，不再只依赖标题：

1. 标题（`#` ~ `####`）
2. 数字列表（`1.` `2.` …）
3. Bullet（`-` `*`）
4. 第 1 行非空语句

上级 ≥3 个时只取上级，不足时自动降级。全部不足 2 个时阈值降到 2 再走一遍，仍不满足取第 1 行。正则提取不足时 fallback 到 LLM 生成候选问题。

## 📝 总结流程改进

多选合并时，**先创建 user 节点显示提示词**，再创建 assistant 节点显示总结结果。与追问流程一致，提示词不再"隐身"。

```
源节点 ──→ user(提示词) ──→ assistant(总结结果)
```

## 🔧 内部改进

- 节点新增 `createdAt` 时间戳，回放排序使用真实创建时间
- 旧节点无时间戳时 fallback 到坐标排序
- 控制条按钮使用 `pointerdown` 事件，避免 Canvas 事件捕获冲突
- 控制条 `position: fixed` 挂载在 `document.body`，不受 Canvas transform 影响
- 全部使用 Obsidian Canvas 原生 API，不自建 viewport 动画系统

## 🛡️ 代码质量（社区审核修复）

- 消除所有 `eslint-disable` — `as any` 改为 `as unknown as { 具体类型 }`
- `fetch()` → `window.fetch()`（popout 兼容）
- `document` → `activeDocument`（popout 兼容）
- `setTimeout` → `window.setTimeout`（popout 兼容）
- `querySelectorAll` → `findAll`（Obsidian API）
- inline style 全部改为 CSS class 驱动
- `innerHTML` → `textContent`
- `Record<string, any>` → `Record<string, unknown>`
- 新增 GitHub Actions release workflow + artifact attestations

---

**完整 changelog**: `8d3d8a6..33c6d84`（21 commits）
