import { PANEL_DEFINITIONS } from '$lib/stores/sidebarConfig.svelte';
import { cardRegistry } from '$lib/cards/registry';
import type { Component } from 'svelte';

export interface IconDefinition {
    id: string;
    title: string;
    category: 'sidebar' | 'card';
    defaultIcon: Component;
    description?: string;
    group?: string;
}

export const getAllCustomizableIcons = (): IconDefinition[] => {
    const icons: IconDefinition[] = [];

    // Sidebar Panels
    for (const [id, def] of Object.entries(PANEL_DEFINITIONS)) {
        const d = def as any; // Cast to avoid strict type checks if inconsistent
        if (d.icon) {
            icons.push({
                id,
                title: d.title ?? id,
                category: 'sidebar',
                defaultIcon: d.icon,
                description: d.emoji,
                group: '边栏面板'
            });
        }
    }

    // Cards
    for (const [id, def] of Object.entries(cardRegistry)) {
        // Find panel title for grouping
        let groupName = '其他';
        if (def.defaultPanel && (PANEL_DEFINITIONS as any)[def.defaultPanel]) {
            groupName = (PANEL_DEFINITIONS as any)[def.defaultPanel].title || def.defaultPanel;
        }

        icons.push({
            id,
            title: def.title,
            category: 'card',
            defaultIcon: def.icon,
            description: def.defaultPanel ? `Panel: ${def.defaultPanel}` : '',
            group: groupName
        });
    }

    return icons;
};
