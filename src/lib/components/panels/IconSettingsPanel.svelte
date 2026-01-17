<script lang="ts">
    import { iconRegistry } from '$lib/stores/iconRegistry.svelte';
 
    // I need panel definitions? Or just use the registry keys?
    // Using registry keys is more "global", but might lack order/titles if I don't look them up.
    // I can import PANEL_DEFINITIONS to get titles.
    import { PANEL_DEFINITIONS, type PanelId } from '$lib/stores/sidebarConfig.svelte';
    import Icon from '$lib/components/ui/Icon.svelte';
    import { Button } from '$lib/components/ui/button';
    import * as Table from '$lib/components/ui/table';
    import { Badge } from '$lib/components/ui/badge';
    import { Upload, RotateCcw, ImageIcon, Search } from '@lucide/svelte';
    import { Input } from '$lib/components/ui/input';
    import  { cn } from '$lib/utils';
    
    // Derived state for the list of icons
    // We want to show all icons in the registry, but enrich them with metadata if available
    
    let searchQuery = $state('');

    const iconList = $derived.by(() => {
        const registry = $iconRegistry.icons;
        const query = searchQuery.toLowerCase().trim();
        
        // Combine registry data with known definitions for better display
        // We iterate over registry keys to include everything registered
        // But we can also iterate PANEL_DEFINITIONS to ensure order if we want.
        // Let's get all keys from registry, plus keys from PANEL_DEFINITIONS (which should be in registry by init)
        
        const allKeys = new Set([...Object.keys(registry), ...Object.keys(PANEL_DEFINITIONS)]);
        
        const list = Array.from(allKeys).map(key => {
            const regConfig = registry[key];
            const def = (PANEL_DEFINITIONS as any)[key]; // Type cast for loose matching
            
            return {
                id: key,
                title: def?.title || key,
                description: def?.emoji || '',
                isCustom: !!regConfig?.customIcon,
                hasDefault: !!regConfig?.defaultIcon,
                // If it's not in registry yet (timing?), fallback
            };
        });

        // Sort: known panels first (by order), then alphabetical
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

    let fileInput: HTMLInputElement;

    function handleFile(id: string, event: Event) {
        const target = event.target as HTMLInputElement;
        const file = target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            const dataUrl = e.target?.result as string;
            if (dataUrl) {
                iconRegistry.setCustomIcon(id, dataUrl);
            }
        };
        reader.readAsDataURL(file);
        
        // Reset input so change event fires again for same file
        target.value = '';
    }

    function triggerUpload(id: string) {
        // We use a single hidden input and switch its target ID? 
        // Or cleaner: create an input dynamically or use closure?
        // Svelte way: Use a map of inputs or just one input and track "current upload target"
        // Let's assume one global input for simplicity
        currentUploadId = id;
        fileInput?.click();
    }
    
    let currentUploadId = $state<string | null>(null);
    
    function onFileSelected(e: Event) {
        if (currentUploadId) {
            handleFile(currentUploadId, e);
            currentUploadId = null;
        }
    }
</script>

<div class="flex flex-col gap-6 p-1">
    <div class="flex flex-col gap-1.5 px-1">
        <h3 class="text-xl font-bold tracking-tight">图标自定义</h3>
        <p class="text-muted-foreground text-sm">上传自定义图片替换应用的默认图标。</p>
    </div>

    <!-- Toolbar -->
    <div class="flex items-center justify-between gap-4">
        <div class="relative w-full max-w-sm">
            <Search class="text-muted-foreground absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
            <Input bind:value={searchQuery} placeholder="搜索图标..." class="h-10 rounded-xl pl-9" />
        </div>
        
        <!-- Hidden File Input -->
        <input 
            bind:this={fileInput}
            type="file" 
            accept="image/png, image/jpeg, image/svg+xml, image/webp" 
            class="hidden"
            onchange={onFileSelected}
        />
    </div>

    <div class="bg-card overflow-hidden rounded-2xl border shadow-sm">
        <Table.Root>
            <Table.Header class="bg-muted/50">
                <Table.Row>
                    <Table.Head class="w-16 text-center">当前</Table.Head>
                    <Table.Head class="w-auto">名称 / ID</Table.Head>
                    <Table.Head class="w-24 text-center">状态</Table.Head>
                    <Table.Head class="w-32 text-right pr-4">操作</Table.Head>
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
                                <Badge variant="default" class="bg-primary/10 text-primary hover:bg-primary/20 border-primary/20">
                                    自定义
                                </Badge>
                             {:else}
                                <Badge variant="secondary" class="opacity-50 font-normal">
                                    默认
                                </Badge>
                             {/if}
                        </Table.Cell>
                        <Table.Cell class="text-right pr-4">
                            <div class="flex items-center justify-end gap-1">
                                <Button 
                                    variant="ghost" 
                                    size="icon" 
                                    class="h-8 w-8 rounded-lg hover:bg-primary/10 hover:text-primary transition-colors"
                                    title="上传图标"
                                    onclick={() => triggerUpload(item.id)}
                                >
                                    <Upload class="w-4 h-4" />
                                </Button>
                                
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
                
                {#if iconList.length === 0}
                    <Table.Row>
                         <Table.Cell colspan={4} class="h-24 text-center text-muted-foreground">
                            未找到匹配的图标
                         </Table.Cell>
                    </Table.Row>
                {/if}
            </Table.Body>
        </Table.Root>
    </div>
</div>
