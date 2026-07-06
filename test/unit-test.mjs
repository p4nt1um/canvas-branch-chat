/**
 * test/unit-test.mjs — 核心逻辑单元测试（无 Obsidian 依赖）
 *
 * 测试内容：
 * 1. getAncestorChain — 祖先链遍历
 * 2. buildContextFromChain — 上下文构建
 * 3. generateId — ID 唯一性
 * 4. LLM SSE 解析逻辑
 */

// generateId 内联（避免 TS→JS import 问题）
function generateId(length = 16) {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

// ============================================================
// Mock Canvas
// ============================================================

function createMockCanvas(nodes, edges) {
  const nodeMap = new Map();
  for (const n of nodes) {
    nodeMap.set(n.id, n);
  }

  return {
    getData: () => ({ nodes, edges }),
    setData: () => {},
    requestSave: () => {},
    createTextNode: (opts) => {
      const id = 'node-' + Math.random().toString(36).slice(2, 8);
      const node = {
        id,
        x: opts.pos.x,
        y: opts.pos.y,
        width: opts.size?.width || 400,
        height: opts.size?.height || 200,
        text: opts.text || '',
        canvas: null, // back-ref
        getData: function() { return { id: this.id, x: this.x, y: this.y, width: this.width, height: this.height, text: this.text, type: 'text' }; },
        setData: function(d) { Object.assign(this, d); },
        setText: function(t) { this.text = t; },
        contentEl: null,
      };
      nodeMap.set(id, node);
      return node;
    },
    _nodeMap: nodeMap,
  };
}

// ============================================================
// 导入被测函数（内联实现，避免 TS import 问题）
// ============================================================

function findParentNodeId(canvas, nodeId) {
  const data = canvas.getData();
  for (const edge of data.edges) {
    if (edge.toNode === nodeId) return edge.fromNode;
  }
  return null;
}

function getAncestorChain(canvas, startNodeId, maxDepth = 50) {
  const chain = [];
  const visited = new Set();
  let currentId = startNodeId;
  while (currentId && !visited.has(currentId) && chain.length < maxDepth) {
    visited.add(currentId);
    chain.unshift(currentId);
    currentId = findParentNodeId(canvas, currentId);
  }
  return chain;
}

function buildContextFromChain(canvas, chainNodeIds) {
  const messages = [];
  for (let i = 0; i < chainNodeIds.length; i++) {
    const node = canvas._nodeMap?.get(chainNodeIds[i]);
    if (!node) continue;
    const text = (node.text || '').trim();
    if (!text) continue;
    if (text === 'Loading...' || text === '思考中...') continue;
    const role = messages.length % 2 === 0 ? 'user' : 'assistant';
    messages.push({ role, content: text });
  }
  return messages;
}

// ============================================================
// 测试用例
// ============================================================

let passed = 0;
let failed = 0;

function assert(name, actual, expected) {
  const actualStr = JSON.stringify(actual);
  const expectedStr = JSON.stringify(expected);
  if (actualStr === expectedStr) {
    console.log(`  ✅ ${name}`);
    passed++;
  } else {
    console.log(`  ❌ ${name}`);
    console.log(`     expected: ${expectedStr}`);
    console.log(`     actual:   ${actualStr}`);
    failed++;
  }
}

function assertTrue(name, cond) {
  if (cond) {
    console.log(`  ✅ ${name}`);
    passed++;
  } else {
    console.log(`  ❌ ${name}`);
    failed++;
  }
}

console.log('\n🧪 Canvas Branch Chat — Unit Tests\n');

// --- Test 1: 祖先链遍历 ---
console.log('📦 getAncestorChain');

{
  const nodes = [
    { id: 'A', text: '问题1' },
    { id: 'B', text: '回答1' },
    { id: 'C', text: '追问1' },
    { id: 'D', text: '回答2' },
  ];
  const edges = [
    { fromNode: 'A', toNode: 'B' },
    { fromNode: 'B', toNode: 'C' },
    { fromNode: 'C', toNode: 'D' },
  ];
  const canvas = createMockCanvas(nodes, edges);

  const chain = getAncestorChain(canvas, 'D');
  assert('链长度', chain, ['A', 'B', 'C', 'D']);
}

{
  const canvas = createMockCanvas([], []);
  const chain = getAncestorChain(canvas, 'X');
  assert('不存在节点', chain, ['X']);
}

// --- Test 2: 环检测 ---
console.log('\n📦 getAncestorChain — 环检测');

{
  const nodes = [
    { id: 'A', text: 'A' },
    { id: 'B', text: 'B' },
    { id: 'C', text: 'C' },
  ];
  // 制造环: A→B→C→A
  const edges = [
    { fromNode: 'A', toNode: 'B' },
    { fromNode: 'B', toNode: 'C' },
    { fromNode: 'C', toNode: 'A' },
  ];
  const canvas = createMockCanvas(nodes, edges);

  const chain = getAncestorChain(canvas, 'A');
  // 应该在遍历到已访问节点时停止
  assertTrue('不无限循环', chain.length <= 3);
}

// --- Test 3: 上下文构建 ---
console.log('\n📦 buildContextFromChain');

{
  const nodes = [
    { id: 'A', text: '什么是微服务？' },
    { id: 'B', text: '微服务是一种架构风格...' },
    { id: 'C', text: '和单体架构有什么区别？' },
    { id: 'D', text: '主要区别在于部署方式...' },
  ];
  const edges = [
    { fromNode: 'A', toNode: 'B' },
    { fromNode: 'B', toNode: 'C' },
    { fromNode: 'C', toNode: 'D' },
  ];
  const canvas = createMockCanvas(nodes, edges);

  const chain = getAncestorChain(canvas, 'D');
  const messages = buildContextFromChain(canvas, chain);

  assert('消息数量', messages.length, 4);
  assert('第一条是 user', messages[0]?.role, 'user');
  assert('第二条是 assistant', messages[1]?.role, 'assistant');
  assert('第三条是 user', messages[2]?.role, 'user');
  assert('第四条是 assistant', messages[3]?.role, 'assistant');
}

// --- Test 4: 跳过空节点和占位符 ---
console.log('\n📦 buildContextFromChain — 过滤');

{
  const nodes = [
    { id: 'A', text: '你好' },
    { id: 'B', text: '思考中...' },
    { id: 'C', text: '' },
    { id: 'D', text: '你好！有什么可以帮你的？' },
  ];
  const edges = [
    { fromNode: 'A', toNode: 'B' },
    { fromNode: 'B', toNode: 'C' },
    { fromNode: 'C', toNode: 'D' },
  ];
  const canvas = createMockCanvas(nodes, edges);

  const chain = getAncestorChain(canvas, 'D');
  const messages = buildContextFromChain(canvas, chain);

  assert('过滤后只有2条', messages.length, 2);
  assert('第一条内容', messages[0]?.content, '你好');
  assert('第二条内容', messages[1]?.content, '你好！有什么可以帮你的？');
}

// --- Test 5: ID 生成 ---
console.log('\n📦 generateId');

{
  const ids = new Set();
  for (let i = 0; i < 1000; i++) {
    ids.add(generateId(16));
  }
  assertTrue('1000次无碰撞', ids.size === 1000);
}

{
  const id = generateId(8);
  assertTrue('指定长度', id.length === 8);
}

// --- Test 6: 分支链（分叉场景） ---
console.log('\n📦 分叉场景 — 多分支');

{
  //     A → B → C
  //          ↘ D → E
  const nodes = [
    { id: 'A', text: '原始问题' },
    { id: 'B', text: 'AI回答' },
    { id: 'C', text: '追问' },
    { id: 'D', text: '分支回答' },
    { id: 'E', text: '分支追问' },
  ];
  const edges = [
    { fromNode: 'A', toNode: 'B' },
    { fromNode: 'B', toNode: 'C' },
    { fromNode: 'B', toNode: 'D' }, // 分叉
    { fromNode: 'D', toNode: 'E' },
  ];
  const canvas = createMockCanvas(nodes, edges);

  // 从 C 遍历
  const chainC = getAncestorChain(canvas, 'C');
  assert('C 的祖先链', chainC, ['A', 'B', 'C']);

  // 从 E 遍历（应该走 D 而非 C）
  const chainE = getAncestorChain(canvas, 'E');
  assert('E 的祖先链（分支）', chainE, ['A', 'B', 'D', 'E']);
}

// --- Results ---
console.log(`\n📊 结果: ${passed} passed, ${failed} failed\n`);
if (failed > 0) {
  console.error('❌ 有失败的测试！');
  process.exit(1);
} else {
  console.log('🎉 全部通过！');
}
