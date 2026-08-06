/**
 * 导出 HTML 的 JavaScript 交互逻辑（内嵌）
 */

interface ScriptConfig {
  includeToggle: boolean;
  includeReplay: boolean;
  includeSearch: boolean;
  viewMode: 'flow' | 'tree';
}

export function getExportScript(config: ScriptConfig): string {
  const parts: string[] = [];

  // 视图切换
  parts.push(`
    function switchView(view) {
      var flowView = document.getElementById('flow-view');
      var treeView = document.getElementById('tree-view');
      var btnFlow = document.getElementById('btn-flow');
      var btnTree = document.getElementById('btn-tree');

      if (view === 'flow') {
        if (flowView) flowView.classList.remove('hidden');
        if (treeView) treeView.classList.remove('active');
        if (btnFlow) btnFlow.classList.add('active');
        if (btnTree) btnTree.classList.remove('active');
      } else {
        if (flowView) flowView.classList.add('hidden');
        if (treeView) treeView.classList.add('active');
        if (btnFlow) btnFlow.classList.remove('active');
        if (btnTree) btnTree.classList.add('active');
      }
    }
  `);

  // 展开/收起节点
  if (config.includeToggle) {
    parts.push(`
      function toggleNode(nodeId) {
        var node = document.getElementById('node-' + nodeId);
        if (!node) return;
        var content = node.querySelector('.message-content');
        var btn = node.querySelector('.toggle-btn');
        if (!content || !btn) return;

        if (content.style.display === 'none') {
          content.style.display = '';
          btn.textContent = '🔽 收起';
        } else {
          content.style.display = 'none';
          btn.textContent = '▶️ 展开';
        }
      }

      function scrollToChildren(nodeId) {
        var fork = document.getElementById('fork-' + nodeId);
        if (fork) {
          fork.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }

      function scrollToParent(parentId) {
        var parent = document.getElementById('node-' + parentId);
        if (parent) {
          parent.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }
    `);
  }

  // 主题切换
  parts.push(`
    var currentTheme = '${config.viewMode === 'tree' ? 'light' : 'auto'}';
    function toggleTheme() {
      var html = document.documentElement;
      var btn = document.getElementById('btn-theme');
      if (html.getAttribute('data-theme') === 'dark') {
        html.setAttribute('data-theme', 'light');
        currentTheme = 'light';
        if (btn) btn.innerHTML = '☀️ <span class="label-text">主题</span>';
      } else {
        html.setAttribute('data-theme', 'dark');
        currentTheme = 'dark';
        if (btn) btn.innerHTML = '🌙 <span class="label-text">主题</span>';
      }
    }
  `);

  // 回放功能
  if (config.includeReplay) {
    parts.push(`
      var replayTimer = null;
      var replaySpeed = 1000;
      var replayIndex = 0;
      var replayNodes = [];
      var isReplaying = false;

      function toggleReplay() {
        if (isReplaying) {
          stopReplay();
          return;
        }
        startReplay();
      }

      function startReplay() {
        var allMessages = document.querySelectorAll('.message');
        if (allMessages.length === 0) return;

        replayNodes = Array.from(allMessages);
        replayIndex = 0;
        isReplaying = true;

        // 重置所有高亮
        replayNodes.forEach(function(n) { n.classList.remove('replay-active'); });

        // 显示进度条
        var progressBar = document.getElementById('replay-progress');
        var btnSpeed = document.getElementById('btn-speed');
        var btnReplay = document.getElementById('btn-replay');
        if (progressBar) progressBar.style.display = 'block';
        if (btnSpeed) btnSpeed.style.display = 'inline-flex';
        if (btnReplay) btnReplay.innerHTML = '⏸️ <span class="label-text">暂停</span>';

        replayStep();
      }

      function replayStep() {
        if (replayIndex >= replayNodes.length) {
          stopReplay();
          return;
        }

        // 去掉上一个高亮
        if (replayIndex > 0) {
          replayNodes[replayIndex - 1].classList.remove('replay-active');
        }

        // 高亮当前节点
        var node = replayNodes[replayIndex];
        node.classList.add('replay-active');
        node.scrollIntoView({ behavior: 'smooth', block: 'center' });

        // 更新进度条
        var progressBarFill = document.getElementById('replay-progress-bar');
        if (progressBarFill) {
          progressBarFill.style.width = ((replayIndex + 1) / replayNodes.length * 100) + '%';
        }

        replayIndex++;
        replayTimer = setTimeout(replayStep, replaySpeed);
      }

      function stopReplay() {
        if (replayTimer) clearTimeout(replayTimer);
        replayTimer = null;
        isReplaying = false;

        var progressBar = document.getElementById('replay-progress');
        var btnSpeed = document.getElementById('btn-speed');
        var btnReplay = document.getElementById('btn-replay');
        var progressBarFill = document.getElementById('replay-progress-bar');

        if (progressBar) progressBar.style.display = 'none';
        if (btnSpeed) btnSpeed.style.display = 'none';
        if (btnReplay) btnReplay.innerHTML = '▶️ <span class="label-text">回放</span>';
        if (progressBarFill) progressBarFill.style.width = '0%';
      }

      function changeReplaySpeed() {
        var speeds = [500, 1000, 2000];
        var labels = ['2x', '1x', '0.5x'];
        var currentIdx = speeds.indexOf(replaySpeed);
        if (currentIdx < 0) currentIdx = 1;
        var nextIdx = (currentIdx + 1) % speeds.length;
        replaySpeed = speeds[nextIdx];

        var btnSpeed = document.getElementById('btn-speed');
        if (btnSpeed) btnSpeed.innerHTML = '⏱ <span class="label-text">' + labels[nextIdx] + '</span>';

        // 如果正在回放，重启定时器
        if (isReplaying && replayTimer) {
          clearTimeout(replayTimer);
          replayTimer = setTimeout(replayStep, replaySpeed);
        }
      }
    `);
  }

  // 搜索功能
  if (config.includeSearch) {
    parts.push(`
      var searchResults = [];
      var currentResultIdx = -1;

      function performSearch(query) {
        // 清除旧结果
        document.querySelectorAll('mark').forEach(function(m) {
          var parent = m.parentNode;
          parent.replaceChild(document.createTextNode(m.textContent), m);
          parent.normalize();
        });
        searchResults = [];
        currentResultIdx = -1;

        var countEl = document.getElementById('search-count');
        var prevBtn = document.getElementById('btn-search-prev');
        var nextBtn = document.getElementById('btn-search-next');

        if (!query || query.trim().length < 2) {
          if (countEl) countEl.textContent = '';
          if (prevBtn) prevBtn.disabled = true;
          if (nextBtn) nextBtn.disabled = true;
          document.querySelectorAll('.message.search-match').forEach(function(m) {
            m.classList.remove('search-match');
          });
          return;
        }

        query = query.toLowerCase();
        var messages = document.querySelectorAll('.message-content');

        messages.forEach(function(content) {
          var textNodes = [];
          var walker = document.createTreeWalker(content, NodeFilter.SHOW_TEXT, null, false);
          var node;
          while (node = walker.nextNode()) {
            textNodes.push(node);
          }

          textNodes.forEach(function(textNode) {
            var text = textNode.textContent.toLowerCase();
            var idx = text.indexOf(query);
            if (idx >= 0) {
              // 高亮匹配
              var span = document.createElement('mark');
              var range = document.createRange();
              range.setStart(textNode, idx);
              range.setEnd(textNode, idx + query.length);
              range.surroundContents(span);
              searchResults.push(span);

              // 标记父消息
              var msg = content.closest('.message');
              if (msg) msg.classList.add('search-match');
            }
          });
        });

        if (countEl) countEl.textContent = searchResults.length > 0 ? '找到 ' + searchResults.length + ' 个结果' : '无结果';
        if (prevBtn) prevBtn.disabled = searchResults.length === 0;
        if (nextBtn) nextBtn.disabled = searchResults.length === 0;

        if (searchResults.length > 0) {
          navigateSearch(1);
        }
      }

      function navigateSearch(direction) {
        if (searchResults.length === 0) return;

        // 清除当前活动高亮
        if (currentResultIdx >= 0 && currentResultIdx < searchResults.length) {
          searchResults[currentResultIdx].classList.remove('active');
        }

        currentResultIdx += direction;
        if (currentResultIdx < 0) currentResultIdx = searchResults.length - 1;
        if (currentResultIdx >= searchResults.length) currentResultIdx = 0;

        var mark = searchResults[currentResultIdx];
        mark.classList.add('active');
        mark.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }

      // 键盘导航
      document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') {
          var input = document.getElementById('search-input');
          if (input) { input.value = ''; performSearch(''); }
        }
        if (e.key === 'Enter') {
          navigateSearch(e.shiftKey ? -1 : 1);
        }
      });
    `);
  }

  // 树形详情面板
  parts.push(`
    function openTreeDetail(nodeId) {
      var node = document.getElementById('node-' + nodeId);
      if (!node) return;

      var detailContent = document.getElementById('tree-detail-content');
      var panel = document.getElementById('tree-detail-panel');
      var overlay = document.getElementById('tree-detail-overlay');

      if (detailContent && node) {
        detailContent.innerHTML = node.innerHTML;
      }
      if (panel) panel.classList.add('open');
      if (overlay) overlay.classList.add('visible');

      // 高亮选中节点
      document.querySelectorAll('.tree-node.selected').forEach(function(n) {
        n.classList.remove('selected');
      });
      var treeNode = document.getElementById('tree-' + nodeId);
      if (treeNode) treeNode.classList.add('selected');
    }

    function closeTreeDetail() {
      var panel = document.getElementById('tree-detail-panel');
      var overlay = document.getElementById('tree-detail-overlay');
      if (panel) panel.classList.remove('open');
      if (overlay) overlay.classList.remove('visible');
    }
  `);

  // 触摸手势（移动端）
  parts.push(`
    // 双击回到顶部
    var lastTap = 0;
    document.addEventListener('touchstart', function(e) {
      var now = Date.now();
      if (now - lastTap < 300 && e.target.tagName !== 'BUTTON' && e.target.tagName !== 'INPUT') {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
      lastTap = now;
    });

    // 长按复制（移动端）
    document.addEventListener('contextmenu', function(e) {
      var message = e.target.closest('.message-content');
      if (message) {
        // 允许原生上下文菜单进行复制
        return;
      }
    });
  `);

  return parts.join('\n');
}