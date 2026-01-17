import { type Component } from 'svelte';
import { iconMap } from '$lib/utils/iconMap';

/**
 * Icon Registry Store (Runes Version)
 * 管理全局图标，支持自定义图标 (Image, Emoji, Lucide)
 */

export type CustomIconType = 'image' | 'emoji' | 'lucide';

export interface IconConfig {
    id: string;
    title?: string;
    defaultIcon: Component;
    defaultType?: CustomIconType;
    defaultValue?: string;
    
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

    register(id: string, icon: Component | string, title?: string, type: CustomIconType = 'lucide', explicitValue?: string) {
        let component: Component;
        let iconValue: string | undefined = explicitValue;
        let iconType: CustomIconType = type;

        if (typeof icon === 'string') {
            iconValue = icon;
            iconType = 'lucide';
            component = iconMap[icon] || iconMap['HelpCircle']; // Fallback
        } else {
            component = icon;
        }

        // If already registered, update default info
        if (this.icons[id]) {
            if (title) this.icons[id].title = title;
            if (iconType) this.icons[id].defaultType = iconType;
            if (iconValue) this.icons[id].defaultValue = iconValue;
            if (component) this.icons[id].defaultIcon = component;
            return;
        }

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
            title,
            defaultIcon: component,
            defaultType: iconType,
            defaultValue: iconValue,
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

    exportCustomIcons(): string {
        const custom: Record<string, StoredIconData> = {};
        const defaults: Record<string, any> = {};

        for (const [id, config] of Object.entries(this.icons)) {
            // Always add to defaults if possible
            if (config.defaultValue || (config.defaultIcon as any) !== null) {
                defaults[id] = {
                    title: config.title || id,
                    type: config.defaultType || 'unknown',
                    value: config.defaultValue || 'default'
                };
            }
            
            // Add to custom if it has a custom value
            if (config.customValue && config.customType) {
                custom[id] = { type: config.customType, value: config.customValue };
            }
        }
        
        return JSON.stringify({
            format: 'NeoView Icons v2',
            timestamp: new Date().toISOString(),
            custom,
            defaults
        }, null, 2);
    }

    importCustomIcons(json: string) {
        try {
            const data = JSON.parse(json);
            
            // Handle v2 format
            if (data.format === 'NeoView Icons v2' && data.custom) {
                for (const key in data.custom) {
                    const val = data.custom[key];
                    if (val && typeof val === 'object' && val.type && val.value) {
                        this.setCustomIcon(key, val.type, val.value);
                    }
                }
                return;
            }

            // Handle v1 (flat) format
            for (const key in data) {
                const val = data[key];
                if (val && typeof val === 'object' && val.type && val.value) {
                    this.setCustomIcon(key, val.type, val.value);
                }
            }
        } catch (e) {
            console.error('Import failed', e);
            throw e;
        }
    }
}

export const iconRegistry = new IconRegistry();
