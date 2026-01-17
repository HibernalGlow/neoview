<script lang="ts">
    import { iconRegistry } from '$lib/stores/iconRegistry.svelte';
    import type { Component } from 'svelte';
    import { cn } from '$lib/utils';
    
    interface Props {
        name: string; // The ID of the registered icon (e.g., 'folder', 'settings')
        fallback?: Component; // Fallback icon if not found in registry
        class?: string;
        [key: string]: any;
    }

    let { name, fallback, class: className, ...rest }: Props = $props();

    // Subscribe to the store to react to changes
    // Using $derived to reactivity access the store value if name changes
    // But direct store subscription via $iconRegistry is needed.
    // However, since we are in Svelte 5 (implied by file extension), let's use runes effectively.
    
    // Actually, `iconRegistry` is a store, so we access it with `$iconRegistry`.
    const iconConfig = $derived($iconRegistry.icons[name]);
</script>

{#if iconConfig?.customIcon}
    <img 
        src={iconConfig.customIcon} 
        alt={name} 
        class={cn("object-contain", className)} 
        {...rest} 
    />
{:else if iconConfig?.defaultIcon}
    <svelte:component 
        this={iconConfig.defaultIcon} 
        class={className} 
        {...rest} 
    />
{:else if fallback}
    <svelte:component 
        this={fallback} 
        class={className} 
        {...rest} 
    />
{:else}
    <!-- Empty placeholder or warning if debugging -->
    <span class={cn("inline-block", className)} {...rest}></span>
{/if}
