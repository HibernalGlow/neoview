<script lang="ts">
	import { iconRegistry } from '$lib/stores/iconRegistry.svelte';
	import { getAllCustomizableIcons, type IconDefinition } from '$lib/configs/iconDefinitions';
	import Icon from '$lib/components/ui/Icon.svelte';
	import { Button } from '$lib/components/ui/button';
	import * as Table from '$lib/components/ui/table';
	import { Badge } from '$lib/components/ui/badge';
	import {
		RotateCcw,
		Search,
		Smile,
		Component as ComponentIcon,
		LayoutGrid,
		PanelLeft
	} from '@lucide/svelte';
	import { Input } from '$lib/components/ui/input';
	import * as Popover from '$lib/components/ui/popover';
	import * as Tabs from '$lib/components/ui/tabs';
	import { Root as EmojiPicker } from '$lib/components/ui/emoji-picker';
	import * as Command from '$lib/components/ui/command';
	import { iconMap, iconNames } from '$lib/utils/iconMap';
	import { cn } from '$lib/utils';

	let searchQuery = $state('');
	let iconSearchQuery = $state('');
	let activeCategory = $state('all');
	let selectedGroup = $state('all');

	// Extract unique groups for Cards
	const cardGroups = $derived.by(() => {
		const groups = new Set<string>();
		allIcons.forEach((icon) => {
			if (icon.category === 'card' && icon.group) {
				groups.add(icon.group);
			}
		});
		return Array.from(groups).sort();
	});

	// Reset selected group when category changes
	$effect(() => {
		if (activeCategory !== 'card') {
			selectedGroup = 'all';
		}
	});

	// Performance optimization: Limit displayed icons
	const filteredIconNames = $derived.by(() => {
		const query = iconSearchQuery.toLowerCase().trim();
		if (!query) return iconNames.slice(0, 50);
		return iconNames.filter((name) => name.toLowerCase().includes(query)).slice(0, 50);
	});

	const allIcons = getAllCustomizableIcons();

	const iconList = $derived.by(() => {
		const registry = iconRegistry.icons;
		const query = searchQuery.toLowerCase().trim();

		// Filter by category
		let list =
			activeCategory === 'all'
				? allIcons
				: allIcons.filter((icon) => icon.category === activeCategory);

		// Filter by group (Tabs)
		if (activeCategory === 'card' && selectedGroup !== 'all') {
			list = list.filter((icon) => icon.group === selectedGroup);
		}

		// Filter by search
		if (query) {
			list = list.filter(
				(item) =>
					item.title.toLowerCase().includes(query) ||
					item.id.toLowerCase().includes(query) ||
					(item.group && item.group.toLowerCase().includes(query))
			);
		}

		// Map to display format and sort by group
		return list
			.map((def) => {
				const regConfig = registry[def.id];
				return {
					id: def.id,
					title: def.title,
					description: def.description,
					category: def.category,
					group: def.group || '其他',
					defaultIcon: def.defaultIcon,
					isCustom: !!regConfig?.customValue,
					customType: regConfig?.customType
				};
			})
			.sort((a, b) => {
				// Sort by Group first, then Title
				if (a.group !== b.group) return a.group.localeCompare(b.group);
				return a.title.localeCompare(b.title);
			});
	});

	// Handle Emoji Selection
	function handleEmojiSelect(id: string, emoji: string) {
		iconRegistry.setCustomIcon(id, 'emoji', emoji);
	}

	// Handle Lucide Icon Selection
	function handleLucideSelect(id: string, iconName: string) {
		iconRegistry.setCustomIcon(id, 'lucide', iconName);
	}

	import { save, open } from '@tauri-apps/plugin-dialog';
	import { invoke } from '@tauri-apps/api/core';
	import { FileDown, FileUp } from '@lucide/svelte';

	async function handleExport() {
		try {
			const data = iconRegistry.exportCustomIcons();
			const path = await save({
				filters: [{ name: 'JSON', extensions: ['json'] }],
				defaultPath: 'neoview-icons.json'
			});
			if (path) {
				await invoke('write_text_file', { path, content: data });
			}
		} catch (e) {
			console.error('Export failed', e);
		}
	}

	async function handleImport() {
		try {
			const path = await open({
				filters: [{ name: 'JSON', extensions: ['json'] }],
				multiple: false
			});
			if (path) {
				const data = await invoke('read_text_file', { path: path as string });
				iconRegistry.importCustomIcons(data as string);
			}
		} catch (e) {
			console.error('Import failed', e);
		}
	}
</script>

<div class="flex h-full flex-col gap-6 p-1">
	<div class="flex flex-col gap-1.5 px-1">
		<h3 class="text-xl font-bold tracking-tight">图标自定义</h3>
		<p class="text-muted-foreground text-sm">自定义应用内各组件的图标。</p>
	</div>

	<!-- Toolbar -->
	<div class="flex flex-col gap-4">
		<Tabs.Root bind:value={activeCategory} class="w-full">
			<Tabs.List class="grid w-full grid-cols-3">
				<Tabs.Trigger value="all">全部</Tabs.Trigger>
				<Tabs.Trigger value="sidebar" class="gap-2">
					<PanelLeft class="h-4 w-4" />
					边栏
				</Tabs.Trigger>
				<Tabs.Trigger value="card" class="gap-2">
					<LayoutGrid class="h-4 w-4" />
					卡片
				</Tabs.Trigger>
			</Tabs.List>
		</Tabs.Root>

		{#if activeCategory === 'card'}
			<div class="scrollbar-none -mb-2 flex items-center gap-2 overflow-x-auto pb-2">
				<Button
					variant={selectedGroup === 'all' ? 'default' : 'outline'}
					size="sm"
					class="h-7 rounded-full text-xs whitespace-nowrap"
					onclick={() => (selectedGroup = 'all')}
				>
					全部
				</Button>
				{#each cardGroups as group}
					<Button
						variant={selectedGroup === group ? 'default' : 'outline'}
						size="sm"
						class="h-7 rounded-full text-xs whitespace-nowrap"
						onclick={() => (selectedGroup = group)}
					>
						{group}
					</Button>
				{/each}
			</div>
		{/if}

		<div class="flex items-center gap-2">
			<div class="relative w-full flex-1">
				<Search class="text-muted-foreground absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
				<Input bind:value={searchQuery} placeholder="搜索图标..." class="h-10 rounded-xl pl-9" />
			</div>
			<Button variant="outline" size="icon" class="h-10 w-10 shrink-0 rounded-xl" title="导出设置" onclick={handleExport}>
				<FileUp class="h-4 w-4" />
			</Button>
			<Button variant="outline" size="icon" class="h-10 w-10 shrink-0 rounded-xl" title="导入设置" onclick={handleImport}>
				<FileDown class="h-4 w-4" />
			</Button>
		</div>
	</div>

	<div class="bg-card flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border shadow-sm">
		<div class="flex-1 overflow-auto">
			<Table.Root>
				<Table.Header class="bg-muted/50 sticky top-0 z-10">
					<Table.Row>
						<Table.Head class="w-16 text-center">当前</Table.Head>
						<Table.Head class="w-auto">名称 / ID</Table.Head>
						<Table.Head class="w-24 text-center">属性</Table.Head>
						<Table.Head class="w-48 pr-4 text-right">操作</Table.Head>
					</Table.Row>
				</Table.Header>
				<Table.Body>
					{#each iconList as item, i (item.id)}
						{#if i === 0 || iconList[i - 1].group !== item.group}
							<Table.Row class="bg-muted/50 hover:bg-muted/50">
								<Table.Cell
									colspan={4}
									class="text-muted-foreground py-1.5 pl-4 text-xs font-semibold"
								>
									{item.group}
								</Table.Cell>
							</Table.Row>
						{/if}
						<Table.Row class="hover:bg-muted/30 transition-colors">
							<Table.Cell class="p-2 text-center">
								<div class="flex items-center justify-center">
									<div
										class="bg-muted/50 flex h-10 w-10 items-center justify-center overflow-hidden rounded-xl border shadow-sm"
									>
										<Icon name={item.id} fallback={item.defaultIcon} class="h-5 w-5" />
									</div>
								</div>
							</Table.Cell>
							<Table.Cell>
								<div class="flex flex-col">
									<span class="text-sm font-medium">{item.title}</span>
									<span
										class="text-muted-foreground flex items-center gap-1 font-mono text-xs opacity-70"
									>
										{item.id}
									</span>
								</div>
							</Table.Cell>
							<Table.Cell class="space-y-1 text-center">
								{#if item.category === 'card'}
									<Badge
										variant="secondary"
										class="border-transparent bg-blue-500/10 text-[10px] text-blue-500 hover:bg-blue-500/20"
										>卡片</Badge
									>
								{:else}
									<Badge
										variant="secondary"
										class="border-transparent bg-purple-500/10 text-[10px] text-purple-500 hover:bg-purple-500/20"
										>边栏</Badge
									>
								{/if}

								{#if item.isCustom}
									<Badge
										variant="outline"
										class="text-primary border-primary/20 mx-auto mt-1 block w-fit text-[10px]"
									>
										{item.customType === 'emoji'
											? 'Emoji'
											: item.customType === 'lucide'
												? 'Icon'
												: '自定义'}
									</Badge>
								{/if}
							</Table.Cell>
							<Table.Cell class="pr-4 text-right">
								<div class="flex items-center justify-end gap-1">
									<!-- Emoji Picker -->
									<Popover.Root>
										<Popover.Trigger>
											<Button
												variant="ghost"
												size="icon"
												class="h-8 w-8 rounded-lg transition-colors hover:bg-amber-500/10 hover:text-amber-600"
												title="选择 Emoji"
											>
												<Smile class="h-4 w-4" />
											</Button>
										</Popover.Trigger>
										<Popover.Content
											class="w-auto border-none bg-transparent p-0 shadow-none"
											side="left"
										>
											<EmojiPicker onSelect={(e) => handleEmojiSelect(item.id, e.emoji)} />
										</Popover.Content>
									</Popover.Root>

									<!-- Lucide Picker -->
									<Popover.Root>
										<Popover.Trigger>
											<Button
												variant="ghost"
												size="icon"
												class="h-8 w-8 rounded-lg transition-colors hover:bg-blue-500/10 hover:text-blue-600"
												title="选择图标"
											>
												<ComponentIcon class="h-4 w-4" />
											</Button>
										</Popover.Trigger>
										<Popover.Content class="w-[300px] p-0" side="left">
											<Command.Root>
												<Command.Input
													placeholder="搜索 Lucide 图标..."
													value={iconSearchQuery}
													oninput={(e) => (iconSearchQuery = e.currentTarget.value)}
												/>
												<Command.List class="h-[300px] overflow-auto">
													<Command.Empty>未找到图标</Command.Empty>
													<Command.Group heading="Icons">
														{#each filteredIconNames as iconName (iconName)}
															{@const IconComp = iconMap[iconName]}
															<Command.Item
																value={iconName}
																onSelect={() => handleLucideSelect(item.id, iconName)}
																class="flex cursor-pointer items-center gap-2"
															>
																<div class="flex h-6 w-6 items-center justify-center">
																	<IconComp class="h-4 w-4" />
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
											class="hover:bg-destructive/10 hover:text-destructive text-muted-foreground h-8 w-8 rounded-lg transition-colors"
											title="重置为默认"
											onclick={() => iconRegistry.resetIcon(item.id)}
										>
											<RotateCcw class="h-4 w-4" />
										</Button>
									{:else}
										<div class="h-8 w-8"></div>
									{/if}
								</div>
							</Table.Cell>
						</Table.Row>
					{/each}
				</Table.Body>
			</Table.Root>
		</div>
	</div>
</div>
