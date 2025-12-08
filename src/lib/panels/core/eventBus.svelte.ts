/**
 * 面板事件总线
 * 实现面板之间的通信
 * 
 * 使用场景：
 * - 书签打开文件后，历史面板需要更新
 * - 文件删除后，书签和历史需要同步移除
 * - 文件夹导航后，其他面板可能需要响应
 */

import type { PanelEvent, PanelEventHandler, PanelEventType, PanelMode } from './types';

class PanelEventBus {
    private handlers = new Map<PanelEventType, Set<PanelEventHandler>>();
    
    /**
     * 订阅事件
     */
    on(type: PanelEventType, handler: PanelEventHandler): () => void {
        if (!this.handlers.has(type)) {
            this.handlers.set(type, new Set());
        }
        this.handlers.get(type)!.add(handler);
        
        // 返回取消订阅函数
        return () => {
            this.handlers.get(type)?.delete(handler);
        };
    }
    
    /**
     * 取消订阅
     */
    off(type: PanelEventType, handler: PanelEventHandler): void {
        this.handlers.get(type)?.delete(handler);
    }
    
    /**
     * 发送事件
     */
    emit(event: PanelEvent): void {
        console.log(`[EventBus] ${event.source} -> ${event.type}`, event.data);
        
        const handlers = this.handlers.get(event.type);
        if (handlers) {
            handlers.forEach(handler => {
                try {
                    handler(event);
                } catch (err) {
                    console.error('[EventBus] Handler error:', err);
                }
            });
        }
    }
    
    /**
     * 便捷方法：发送项目打开事件
     */
    emitItemOpened(source: PanelMode, path: string): void {
        this.emit({
            type: 'item-opened',
            source,
            data: { path }
        });
    }
    
    /**
     * 便捷方法：发送项目删除事件
     */
    emitItemDeleted(source: PanelMode, paths: string[]): void {
        this.emit({
            type: 'item-deleted',
            source,
            data: { paths }
        });
    }
    
    /**
     * 便捷方法：发送路径改变事件
     */
    emitPathChanged(source: PanelMode, path: string): void {
        this.emit({
            type: 'path-changed',
            source,
            data: { path }
        });
    }
    
    /**
     * 便捷方法：发送书签添加事件
     */
    emitBookmarkAdded(path: string): void {
        this.emit({
            type: 'bookmark-added',
            source: 'bookmark',
            data: { path }
        });
    }
    
    /**
     * 便捷方法：发送历史更新事件
     */
    emitHistoryUpdated(path: string): void {
        this.emit({
            type: 'history-updated',
            source: 'history',
            data: { path }
        });
    }
}

// 全局单例
export const panelEventBus = new PanelEventBus();
