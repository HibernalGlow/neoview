import * as Icons from '@lucide/svelte';
import type { Component } from 'svelte';

// Export type for convenience
export type IconName = keyof typeof Icons;

// We export the entire object as a map. 
// Note: This includes "default" if any, and other exports. 
// We might want to filter only Components? 
// For now, raw export is fine, access via Icons[name].
export const iconMap = Icons as any as Record<string, Component>;

export const iconNames = Object.keys(Icons) as string[];
