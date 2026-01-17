<script lang="ts">
    import { iconRegistry } from '$lib/stores/iconRegistry.svelte';
    import { iconMap } from '$lib/utils/iconMap';
    import type { Component } from 'svelte';
    import { cn } from '$lib/utils';
    
    interface Props {
        name: string;
        fallback?: Component;
        class?: string;
        [key: string]: any;
    }

    let { name, fallback, class: className, ...rest }: Props = $props();

    // Use derived for reactivity with new rune-based registry
    const iconConfig = $derived(iconRegistry.icons[name]);
    
    // Resolve dynamic icon
    const resolvedIcon = $derived.by(() => {
        if (!iconConfig) return null;
        
        if (iconConfig.customType === 'emoji' && iconConfig.customValue) {
            return { type: 'emoji', value: iconConfig.customValue };
        }
        
        if (iconConfig.customType === 'lucide' && iconConfig.customValue) {
            const Comp = iconMap[iconConfig.customValue];
            if (Comp) return { type: 'component', value: Comp };
        }
        
        if (iconConfig.customType === 'image' && iconConfig.customValue) {
            return { type: 'image', value: iconConfig.customValue };
        }
        
        // Default
        if (iconConfig.defaultIcon) {
            return { type: 'component', value: iconConfig.defaultIcon };
        }
        
        return null;
    });
</script>

{#if resolvedIcon?.type === 'image'}
    <img 
        src={resolvedIcon.value as string} 
        alt={name} 
        class={cn("object-contain", className)} 
        {...rest} 
    />
{:else if resolvedIcon?.type === 'emoji'}
    <span 
        class={cn("flex items-center justify-center text-lg leading-none select-none", className)} 
        {...rest}
    >
        {resolvedIcon.value}
    </span>
{:else if resolvedIcon?.type === 'component'}
    {@const ResolvedComp = resolvedIcon.value as Component}
    <ResolvedComp 
        class={className} 
        {...rest} 
    />
{:else if fallback}
    {@const FallbackComp = fallback}
    <FallbackComp 
        class={className} 
        {...rest} 
    />
{:else}
    <span class={cn("inline-block", className)} {...rest}></span>
{/if}
