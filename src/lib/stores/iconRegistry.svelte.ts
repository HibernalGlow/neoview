import { type Component } from 'svelte';

/**
 * Icon Registry Store (Runes Version)
 * 管理全局图标，支持自定义图标 (Image, Emoji, Lucide)
 */

export type CustomIconType = 'image' | 'emoji' | 'lucide';

export interface IconConfig {
    id: string;
    defaultIcon: Component;
    // 旧版兼容
    customIcon?: string | null; 
    
    // 新版结构
    customValue?: string | null;
    customType?: CustomIconType;
}

interface StoredIconData {
    type: CustomIconType;
    value: string;
}

const STORAGE_KEY = 'neoview-custom-icons';

class IconRegistry {
    icons = $state<Record<string, IconConfig>>({});

    constructor() {
        // Load initial state if needed, or rely on lazy loading/components registering
    }

    // Helpers
    private getSavedCustomIcons(): Record<string, StoredIconData> {
        try {
            if (typeof localStorage === 'undefined') return {};
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
    }

    private saveToStorage() {
        try {
            const toSave: Record<string, StoredIconData> = {};
            for (const [id, config] of Object.entries(this.icons)) {
                if (config.customValue && config.customType) {
                    toSave[id] = { type: config.customType, value: config.customValue };
                } else if (config.customIcon) {
                    toSave[id] = { type: 'image', value: config.customIcon };
                }
            }
            localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave));
        } catch (e) {
            console.error('Failed to save custom icons:', e);
        }
    }

    register(id: string, component: Component) {
        // If already registered and same default, skip to avoid reactivity loop?
        // But we might need to load custom val.
        if (this.icons[id]) return;

        const savedMap = this.getSavedCustomIcons();
        const saved = savedMap[id];
        
        let customValue = null;
        let customType: CustomIconType | undefined = undefined;
        
        if (saved) {
            customValue = saved.value;
            customType = saved.type;
        }

        this.icons[id] = {
            id,
            defaultIcon: component,
            customValue,
            customType,
            customIcon: customType === 'image' ? customValue : null 
        };
    }

    setCustomIcon(id: string, type: CustomIconType, value: string) {
        if (!this.icons[id]) {
             // Lazy create if not exists
             this.icons[id] = {
                 id,
                 defaultIcon: null as any, // Unknown default, verified via fallback anyway
                 customType: type,
                 customValue: value,
                 customIcon: type === 'image' ? value : null
             };
        } else {
            this.icons[id] = {
                ...this.icons[id],
                customType: type,
                customValue: value,
                customIcon: type === 'image' ? value : null
            };
        }
        this.saveToStorage();
    }

    resetIcon(id: string) {
        if (!this.icons[id]) return;

        this.icons[id] = {
            ...this.icons[id],
            customType: undefined,
            customValue: null,
            customIcon: null
        };
        this.saveToStorage();
    }
    
    getIcon(id: string) {
        return this.icons[id];
    }
}

export const iconRegistry = new IconRegistry();
