import { writable, get } from 'svelte/store';
import type { Component } from 'svelte';

/**
 * Icon Registry Store
 * 管理全局图标，支持自定义图标覆盖默认图标
 * Custom icons are stored as base64 strings in localStorage
 */

export interface IconConfig {
    id: string;
    defaultIcon: Component;
    customIcon?: string | null; // Data URIBase64
}

interface IconRegistryState {
    icons: Record<string, IconConfig>;
}

const STORAGE_KEY = 'neoview-custom-icons';

function createIconRegistry() {
    // 初始状态
    const initialState: IconRegistryState = {
        icons: {}
    };

    // 从 localStorage 加载自定义图标
    try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) {
            const parsed = JSON.parse(stored);
            // 我们只存储 customIcons 映射，不存储整个 config
            // parsed structure: { [id: string]: string }
            // 我们将在 register 时合并它
        }
    } catch (e) {
        console.error('Failed to load custom icons:', e);
    }

    const { subscribe, update, set } = writable<IconRegistryState>(initialState);

    // 辅助函数：保存到 localStorage
    const saveToStorage = (state: IconRegistryState) => {
        try {
            const customIcons: Record<string, string> = {};
            for (const [id, config] of Object.entries(state.icons)) {
                if (config.customIcon) {
                    customIcons[id] = config.customIcon;
                }
            }
            localStorage.setItem(STORAGE_KEY, JSON.stringify(customIcons));
        } catch (e) {
            console.error('Failed to save custom icons:', e);
        }
    };

    // 加载已保存的自定义图标 (helper)
    const getSavedCustomIcons = (): Record<string, string> => {
        try {
            const stored = localStorage.getItem(STORAGE_KEY);
            return stored ? JSON.parse(stored) : {};
        } catch {
            return {};
        }
    };

    return {
        subscribe,

        /**
         * 注册默认图标
         * @param id 图标唯一标识
         * @param component Svelte 组件 (Lucide icon)
         */
        register(id: string, component: Component) {
            update(state => {
                const savedIcons = getSavedCustomIcons();
                // 如果已经存在，只更新默认图标，保留自定义图标
                // 如果不存在，创建新条目
                const existing = state.icons[id];
                
                return {
                    ...state,
                    icons: {
                        ...state.icons,
                        [id]: {
                            id,
                            defaultIcon: component,
                            customIcon: savedIcons[id] || existing?.customIcon || null
                        }
                    }
                };
            });
        },

        /**
         * 设置自定义图标
         * @param id 图标唯一标识
         * @param dataUrl 图片的 Data URL (Base64)
         */
        setCustomIcon(id: string, dataUrl: string) {
            update(state => {
                if (!state.icons[id]) {
                    console.warn(`Icon ${id} not registered yet.`);
                    return state;
                }
                
                const newState = {
                    ...state,
                    icons: {
                        ...state.icons,
                        [id]: {
                            ...state.icons[id],
                            customIcon: dataUrl
                        }
                    }
                };
                saveToStorage(newState);
                return newState;
            });
        },

        /**
         * 重置图标为默认
         * @param id 图标唯一标识
         */
        resetIcon(id: string) {
            update(state => {
                if (!state.icons[id]) return state;
                
                const newState = {
                    ...state,
                    icons: {
                        ...state.icons,
                        [id]: {
                            ...state.icons[id],
                            customIcon: null
                        }
                    }
                };
                saveToStorage(newState);
                return newState;
            });
        },
        
        /**
         * 获取图标配置（同步）
         * 注意：通常建议在组件中使用 $iconRegistry
         */
        getIcon(id: string) {
            const state = get({ subscribe });
            return state.icons[id];
        }
    };
}

export const iconRegistry = createIconRegistry();
