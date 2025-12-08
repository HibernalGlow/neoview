/**
 * 面板事件通信工具
 * 使用原生 CustomEvent，简单可靠
 */

// ==================== 事件类型 ====================
export type PanelEventType = 
    | 'panel:item-opened'
    | 'panel:item-deleted'
    | 'panel:history-changed'
    | 'panel:bookmark-changed'
    | 'panel:sync-folder';

// ==================== 事件数据类型 ====================
export interface ItemOpenedDetail {
    path: string;
    source: 'folder' | 'history' | 'bookmark';
}

export interface ItemDeletedDetail {
    paths: string[];
    source: 'folder' | 'history' | 'bookmark';
}

export interface SyncFolderDetail {
    path: string;
}

// ==================== 发送事件 ====================
export function emitPanelEvent(type: 'panel:item-opened', detail: ItemOpenedDetail): void;
export function emitPanelEvent(type: 'panel:item-deleted', detail: ItemDeletedDetail): void;
export function emitPanelEvent(type: 'panel:sync-folder', detail: SyncFolderDetail): void;
export function emitPanelEvent(type: 'panel:history-changed' | 'panel:bookmark-changed'): void;
export function emitPanelEvent(type: PanelEventType, detail?: unknown): void {
    window.dispatchEvent(new CustomEvent(type, { detail }));
}

// ==================== 监听事件 ====================
export function onPanelEvent(
    type: PanelEventType, 
    handler: (detail: ItemOpenedDetail | ItemDeletedDetail | SyncFolderDetail | undefined) => void
): () => void {
    const listener = (e: Event) => handler((e as CustomEvent).detail);
    window.addEventListener(type, listener);
    return () => window.removeEventListener(type, listener);
}
