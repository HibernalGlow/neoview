/**
 * NeoView - Content API
 * 统一内容管理 Tauri API 封装
 */

import { invoke } from '@tauri-apps/api/core';
import type { ContentItem, SortMode } from '$lib/types/content';
import { generateContentId, extractName, inferContentType } from '$lib/types/content';

/**
 * 加载内容项信息
 */
export async function loadContentItem(path: string, innerPath?: string): Promise<ContentItem> {
  // 暂时在前端构建，后续可改为后端实现
  const type = inferContentType(path);
  const name = extractName(innerPath ?? path);
  const id = generateContentId(path, innerPath);

  // 如果是文件夹，通过后端确认
  let finalType = type;
  if (type === 'unknown') {
    try {
      const isDir = await invoke<boolean>('is_directory', { path });
      if (isDir) {
        finalType = 'folder';
      }
    } catch {
      // 忽略错误，保持 unknown
    }
  }

  const item: ContentItem = {
    id,
    type: finalType,
    path,
    innerPath,
    name,
  };

  // 计算父引用
  if (innerPath) {
    item.parentRef = { path };
  } else {
    const lastSep = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'));
    if (lastSep > 0) {
      item.parentRef = { path: path.substring(0, lastSep) };
    }
  }

  return item;
}

/**
 * 展开容器，获取子项列表
 */
export async function expandContainer(
  path: string,
  innerPath?: string,
  _sortMode: SortMode = 'name'  // TODO: 实现排序
): Promise<ContentItem[]> {
  // 调用后端获取内容列表
  // 暂时复用现有的 open_book API
  try {
    const bookInfo = await invoke<{
      pages: Array<{
        index: number;
        path: string;
        innerPath?: string;
        name: string;
        size?: number;
        width?: number;
        height?: number;
        stableHash?: string;
      }>;
    }>('open_book', { path });

    // 转换为 ContentItem[]
    return bookInfo.pages.map((page): ContentItem => {
      const type = inferContentType(page.name);
      return {
        id: generateContentId(page.path, page.innerPath),
        type,
        path: page.path,
        innerPath: page.innerPath,
        name: page.name,
        parentRef: innerPath ? { path, innerPath } : { path },
        metadata: {
          size: page.size,
          width: page.width,
          height: page.height,
        },
        stableHash: page.stableHash,
      };
    });
  } catch (err) {
    console.error('expandContainer error:', err);
    throw err;
  }
}

/**
 * 加载页面数据（复用现有 API）
 */
export async function loadPageData(_path: string, _innerPath?: string): Promise<{
  data: Uint8Array;
  mimeType: string;
}> {
  // TODO: 复用现有的页面加载逻辑
  // 实际实现会调用 load_page_data 等命令
  throw new Error('Not implemented - use existing page loading');
}
