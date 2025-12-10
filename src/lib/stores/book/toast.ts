/**
 * Book Store - Toast 模块
 * 
 * 注意：此模块的完整实现保留在主 BookStore 类中
 * 因为 Toast 逻辑与 BookStore 状态深度耦合
 * 这里只导出类型和工具函数
 */

import type { SwitchToastContext, SwitchToastBookContext, SwitchToastPageContext } from './types';

// Re-export types
export type { SwitchToastContext, SwitchToastBookContext, SwitchToastPageContext };

/**
 * 渲染模板（Mustache 风格 {{variable}}）
 */
export function renderSwitchToastTemplate(
  template: string | undefined,
  context: SwitchToastContext
): string {
  if (!template) return '';

  return template.replace(/{{\s*([^}]+?)\s*}}/g, (match, expr) => {
    const path = String(expr || '');
    if (!path.startsWith('book.') && !path.startsWith('page.')) {
      return match;
    }

    const [root, ...segments] = path.split('.');
    let value: unknown =
      root === 'book' ? context.book : root === 'page' ? context.page : undefined;

    for (const seg of segments) {
      if (value == null || typeof value !== 'object') {
        value = undefined;
        break;
      }
      value = (value as Record<string, unknown>)[seg];
    }

    if (value === undefined || value === null) return '';
    if (typeof value === 'object') return JSON.stringify(value);
    return String(value);
  });
}
