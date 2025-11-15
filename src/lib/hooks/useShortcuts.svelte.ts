/**
 * 快捷键管理 Hook
 * 参考 spacedrive 的 useShortcut 实现
 */

import { onMount, onDestroy } from 'svelte';

interface ShortcutConfig {
  key: string;
  ctrlKey?: boolean;
  altKey?: boolean;
  shiftKey?: boolean;
  metaKey?: boolean;
  action: () => void;
  description?: string;
}

export function useShortcuts(shortcuts: ShortcutConfig[]) {
  let keydownHandler: (e: KeyboardEvent) => void;

  onMount(() => {
    keydownHandler = (e: KeyboardEvent) => {
      // 忽略在输入框中的按键
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.contentEditable === 'true') {
        return;
      }

      for (const shortcut of shortcuts) {
        const keyMatches = e.key.toLowerCase() === shortcut.key.toLowerCase();
        const ctrlMatches = !!shortcut.ctrlKey === e.ctrlKey;
        const altMatches = !!shortcut.altKey === e.altKey;
        const shiftMatches = !!shortcut.shiftKey === e.shiftKey;
        const metaMatches = !!shortcut.metaKey === e.metaKey;

        if (keyMatches && ctrlMatches && altMatches && shiftMatches && metaMatches) {
          e.preventDefault();
          e.stopPropagation();
          shortcut.action();
          break;
        }
      }
    };

    document.addEventListener('keydown', keydownHandler);
  });

  onDestroy(() => {
    if (keydownHandler) {
      document.removeEventListener('keydown', keydownHandler);
    }
  });
}

// 预定义的快捷键配置
export const explorerShortcuts = {
  // 导航快捷键
  goBack: {
    key: 'ArrowLeft',
    altKey: true,
    description: '返回上一级'
  },
  goForward: {
    key: 'ArrowRight',
    altKey: true,
    description: '前进'
  },
  goHome: {
    key: 'h',
    ctrlKey: true,
    description: '回到主页'
  },
  
  // 树操作快捷键
  expandTree: {
    key: '`',
    ctrlKey: true,
    description: '展开/收起树'
  },
  focusTree: {
    key: '1',
    ctrlKey: true,
    description: '聚焦到树'
  },
  
  // 文件操作快捷键
  rename: {
    key: 'F2',
    description: '重命名'
  },
  delete: {
    key: 'Delete',
    description: '删除'
  },
  copy: {
    key: 'c',
    ctrlKey: true,
    description: '复制'
  },
  cut: {
    key: 'x',
    ctrlKey: true,
    description: '剪切'
  },
  paste: {
    key: 'v',
    ctrlKey: true,
    description: '粘贴'
  },
  selectAll: {
    key: 'a',
    ctrlKey: true,
    description: '全选'
  },
  
  // 视图快捷键
  toggleSidebar: {
    key: 'b',
    ctrlKey: true,
    description: '切换侧边栏'
  },
  togglePreview: {
    key: 'p',
    ctrlKey: true,
    description: '切换预览'
  },
  
  // 搜索快捷键
  focusSearch: {
    key: 'f',
    ctrlKey: true,
    description: '聚焦搜索'
  },
  clearSearch: {
    key: 'Escape',
    description: '清除搜索'
  }
};

// 快捷键帮助显示
export function getShortcutHelp(shortcuts: ShortcutConfig[]) {
  return shortcuts.map(s => ({
    keys: [
      s.ctrlKey && 'Ctrl',
      s.altKey && 'Alt',
      s.shiftKey && 'Shift',
      s.metaKey && 'Meta',
      s.key.toUpperCase()
    ].filter(Boolean).join(' + '),
    description: s.description || ''
  }));
}