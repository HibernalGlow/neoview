<script lang="ts">
    import { iconRegistry } from '$lib/stores/iconRegistry.svelte';
    import { PANEL_DEFINITIONS } from '$lib/stores/sidebarConfig.svelte';
    import Icon from '$lib/components/ui/Icon.svelte';
    import { Button } from '$lib/components/ui/button';
    import * as Table from '$lib/components/ui/table';
    import { Badge } from '$lib/components/ui/badge';
    import { RotateCcw, Search, Smile, Component as ComponentIcon } from '@lucide/svelte';
    import { Input } from '$lib/components/ui/input';
    import * as Popover from "$lib/components/ui/popover";
    import { Root as EmojiPicker } from "$lib/components/ui/emoji-picker";
    import * as Command from "$lib/components/ui/command";
    import { iconMap, iconNames } from '$lib/utils/iconMap';
    import { cn } from '$lib/utils';
    
    let searchQuery = $state('');
    let iconSearchQuery = $state(''); // Dedicated search for the icon picker popover
    
    // Performance optimization: Limit displayed icons to prevent freezing
    const filteredIconNames = $derived.by(() => {
        const query = iconSearchQuery.toLowerCase().trim();
        if (!query) {
            // Return first 50 icons if no search
            return iconNames.slice(0, 50);
        }
        // Filter and limit to 50
        return iconNames
            .filter(name => name.toLowerCase().includes(query))
            .slice(0, 50);
    });

    const iconList = $derived.by(() => {
        const registry = $iconRegistry.icons;
        const query = searchQuery.toLowerCase().trim();
        
        const allKeys = new Set([...Object.keys(registry), ...Object.keys(PANEL_DEFINITIONS)]);
        
        const list = Array.from(allKeys).map(key => {
            const regConfig = registry[key];
            const def = (PANEL_DEFINITIONS as any)[key];
            
            return {
                id: key,
                title: def?.title || key,
                description: def?.emoji || '',
                isCustom: !!regConfig?.customValue,
                customType: regConfig?.customType,
                hasDefault: !!regConfig?.defaultIcon,
            };
        });

        list.sort((a, b) => {
             const defA = (PANEL_DEFINITIONS as any)[a.id];
             const defB = (PANEL_DEFINITIONS as any)[b.id];
             if (defA && defB) return (defA.defaultOrder ?? 99) - (defB.defaultOrder ?? 99);
             if (defA) return -1;
             if (defB) return 1;
             return a.id.localeCompare(b.id);
        });

        if (!query) return list;
        return list.filter(item => 
            item.title.toLowerCase().includes(query) || 
            item.id.toLowerCase().includes(query)
        );
    });

    // Handle Emoji Selection
    function handleEmojiSelect(id: string, emoji: string) {
        iconRegistry.setCustomIcon(id, 'emoji', emoji);
    }
    
    // Handle Lucide Icon Selection
    function handleLucideSelect(id: string, iconName: string) {
         iconRegistry.setCustomIcon(id, 'lucide', iconName);
         // Close popover logic handled by Command Item usually closes itself or we need to track open state
    }

</script>

<div class="flex flex-col gap-6 p-1">
    <div class="flex flex-col gap-1.5 px-1">
        <h3 class="text-xl font-bold tracking-tight">图标自定义</h3>
        <p class="text-muted-foreground text-sm">选择 Emoji 或 Lucide 图标来自定义应用外观。</p>
    </div>

    <!-- Toolbar -->
    <div class="flex items-center justify-between gap-4">
        <div class="relative w-full max-w-sm">
            <Search class="text-muted-foreground absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
            <Input bind:value={searchQuery} placeholder="搜索面板..." class="h-10 rounded-xl pl-9" />
        </div>
    </div>

    <div class="bg-card overflow-hidden rounded-2xl border shadow-sm">
        <Table.Root>
            <Table.Header class="bg-muted/50">
                <Table.Row>
                    <Table.Head class="w-16 text-center">当前</Table.Head>
                    <Table.Head class="w-auto">名称 / ID</Table.Head>
                    <Table.Head class="w-24 text-center">类型</Table.Head>
                    <Table.Head class="w-48 text-right pr-4">操作</Table.Head>
                </Table.Row>
            </Table.Header>
            <Table.Body>
                {#each iconList as item (item.id)}
                    <Table.Row class="hover:bg-muted/30 transition-colors">
                        <Table.Cell class="text-center p-2">
                            <div class="flex items-center justify-center">
                                <div class="w-10 h-10 rounded-xl bg-muted/50 border flex items-center justify-center overflow-hidden shadow-sm">
                                    <Icon name={item.id} class="w-5 h-5" />
                                </div>
                            </div>
                        </Table.Cell>
                        <Table.Cell>
                            <div class="flex flex-col">
                                <span class="font-medium text-sm">{item.title}</span>
                                <span class="text-xs text-muted-foreground font-mono opacity-70">{item.id}</span>
                            </div>
                        </Table.Cell>
                        <Table.Cell class="text-center">
                             {#if item.isCustom}
                                <Badge variant="outline" class="text-primary border-primary/20">
                                    {item.customType === 'emoji' ? 'Emoji' : item.customType === 'lucide' ? 'Icon' : '自定义'}
                                </Badge>
                             {:else}
                                <Badge variant="secondary" class="opacity-50 font-normal">
                                    默认
                                </Badge>
                             {/if}
                        </Table.Cell>
                        <Table.Cell class="text-right pr-4">
                            <div class="flex items-center justify-end gap-1">
                                <!-- Emoji Picker -->
                                <Popover.Root>
                                    <Popover.Trigger asChild>
                                        {#snippet children({ props })}
                                            <Button 
                                                {...props}
                                                variant="ghost" 
                                                size="icon" 
                                                class="h-8 w-8 rounded-lg hover:bg-amber-500/10 hover:text-amber-600 transition-colors"
                                                title="选择 Emoji"
                                            >
                                                <Smile class="w-4 h-4" />
                                            </Button>
                                        {/snippet}
                                    </Popover.Trigger>
                                    <Popover.Content class="w-auto p-0 border-none bg-transparent shadow-none" side="left">
                                        <EmojiPicker onSelect={(e) => handleEmojiSelect(item.id, e.emoji)} />
                                    </Popover.Content>
                                </Popover.Root>

                                <!-- Lucide Picker -->
                                <Popover.Root>
                                    <Popover.Trigger asChild>
                                        {#snippet children({ props })}
                                            <Button 
                                                {...props}
                                                variant="ghost" 
                                                size="icon" 
                                                class="h-8 w-8 rounded-lg hover:bg-blue-500/10 hover:text-blue-600 transition-colors"
                                                title="选择图标"
                                            >
                                                <ComponentIcon class="w-4 h-4" />
                                            </Button>
                                        {/snippet}
                                    </Popover.Trigger>
                                    <Popover.Content class="w-[300px] p-0" side="left">
                                        <Command.Root>
                                            <Command.Input 
                                                placeholder="搜索 Lucide 图标..." 
                                                value={iconSearchQuery}
                                                oninput={(e) => iconSearchQuery = e.currentTarget.value}
                                            />
                                            <Command.List class="h-[300px] overflow-auto">
                                                <Command.Empty>未找到图标</Command.Empty>
                                                <Command.Group heading="Icons">
                                                     {#each filteredIconNames as iconName (iconName)}
                                                        <Command.Item 
                                                            value={iconName}
                                                            onSelect={() => handleLucideSelect(item.id, iconName)}
                                                            class="flex items-center gap-2 cursor-pointer"
                                                        >
                                                            <div class="flex items-center justify-center w-6 h-6">
                                                                <svelte:component this={iconMap[iconName]} class="w-4 h-4" />
                                                            </div>
                                                            <span class="text-xs">{iconName}</span>
                                                        </Command.Item>
                                                     {/each}
                                                </Command.Group>
                                            </Command.List>
                                        </Command.Root>
                                    </Popover.Content>
                                </Popover.Root>
                                
                                {#if item.isCustom}
                                    <Button 
                                        variant="ghost" 
                                        size="icon" 
                                        class="h-8 w-8 rounded-lg hover:bg-destructive/10 hover:text-destructive transition-colors text-muted-foreground"
                                        title="重置为默认"
                                        onclick={() => iconRegistry.resetIcon(item.id)}
                                    >
                                        <RotateCcw class="w-4 h-4" />
                                    </Button>
                                {:else}
                                    <div class="w-8 h-8"></div>
                                {/if}
                            </div>
                        </Table.Cell>
                    </Table.Row>
                {/each}
            </Table.Body>
        </Table.Root>
    </div>
</div>
