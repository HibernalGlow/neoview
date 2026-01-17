import { writable, get } from 'svelte/store';
import type { Component } from 'svelte';

/**
 * Icon Registry Store
 * 管理全局图标，支持自定义图标 (Image, Emoji, Lucide)
 */

export type CustomIconType = 'image' | 'emoji' | 'lucide';

export interface IconConfig {
    id: string;
    defaultIcon: Component;
    // 旧版兼容: customIcon 被视为 'image' 类型的值
    customIcon?: string | null; 
    
    // 新版结构
    customValue?: string | null;
    customType?: CustomIconType;
}

interface IconRegistryState {
    icons: Record<string, IconConfig>;
}

// Storage format: { [id]: { type: 'image'|'emoji'|'lucide', value: string } }
// For backward compatibility, if just string, treat as image (dataURL)

interface StoredIconData {
    type: CustomIconType;
    value: string;
}

const STORAGE_KEY = 'neoview-custom-icons';

function createIconRegistry() {
    const initialState: IconRegistryState = {
        icons: {}
    };

    const { subscribe, update } = writable<IconRegistryState>(initialState);

    // Helpers
    const getSavedCustomIcons = (): Record<string, StoredIconData> => {
        try {
            const stored = localStorage.getItem(STORAGE_KEY);
            if (!stored) return {};
            const parsed = JSON.parse(stored);
            
            // Migrate old format (string -> object)
            const result: Record<string, StoredIconData> = {};
            for (const key in parsed) {
                const val = parsed[key];
                if (typeof val === 'string') {
                    result[key] = { type: 'image', value: val };
                } else if (val && typeof val === 'object' && val.type && val.value) {
                    result[key] = val;
                }
            }
            return result;
        } catch {
            return {};
        }
    };

    const saveToStorage = (state: IconRegistryState) => {
        try {
            const toSave: Record<string, StoredIconData> = {};
            for (const [id, config] of Object.entries(state.icons)) {
                if (config.customValue && config.customType) {
                    toSave[id] = { type: config.customType, value: config.customValue };
                } else if (config.customIcon) {
                    // Fallback for old way if somehow set
                    toSave[id] = { type: 'image', value: config.customIcon };
                }
            }
            localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave));
        } catch (e) {
            console.error('Failed to save custom icons:', e);
        }
    };

    return {
        subscribe,

        register(id: string, component: Component) {
            update(state => {
                const savedMap = getSavedCustomIcons();
                const saved = savedMap[id];
                const existing = state.icons[id];

                // Prioritize memory state if valid, else storage
                // Actually, register runs on init, so storage is source of truth
                
                let customValue = existing?.customValue || null;
                let customType = existing?.customType || undefined;
                
                if (saved) {
                    customValue = saved.value;
                    customType = saved.type;
                } else if (existing?.customIcon) {
                    // Migration in memory
                    customValue = existing.customIcon;
                    customType = 'image';
                }

                return {
                    ...state,
                    icons: {
                        ...state.icons,
                        [id]: {
                            id,
                            defaultIcon: component,
                            customValue,
                            customType,
                            // Legacy prop for compatibility with initial implementation if I missed updating components
                            // But I will update components now.
                            customIcon: customType === 'image' ? customValue : null 
                        }
                    }
                };
            });
        },

        setCustomIcon(id: string, type: CustomIconType, value: string) {
            update(state => {
                if (!state.icons[id]) return state;
                const newState = {
                    ...state,
                    icons: {
                        ...state.icons,
                        [id]: {
                            ...state.icons[id],
                            customType: type,
                            customValue: value,
                            // Legacy sync
                            customIcon: type === 'image' ? value : null
                        }
                    }
                };
                saveToStorage(newState);
                return newState;
            });
        },

        resetIcon(id: string) {
            update(state => {
                if (!state.icons[id]) return state;
                const newState = {
                    ...state,
                    icons: {
                        ...state.icons,
                        [id]: {
                            ...state.icons[id],
                            customType: undefined,
                            customValue: null,
                            customIcon: null
                        }
                    }
                };
                saveToStorage(newState);
                return newState;
            });
        },
        
        getIcon(id: string) {
            return get({ subscribe }).icons[id];
        }
    };
}

export const iconRegistry = createIconRegistry();
