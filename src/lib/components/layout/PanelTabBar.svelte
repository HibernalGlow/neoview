<script lang="ts">
	/**
	 * NeoView - Panel Tab Bar Component
	 * 面板标签栏组件 - 竖排图标设计，支持拖拽排序
	 */
	import {
		Folder,
		History,
		Bookmark,
		Info,
		Grid,
		List,
		ArrowLeftRight,
		GripVertical
	} from '@lucide/svelte';
	import { Button } from '$lib/components/ui/button';
	import * as Tooltip from '$lib/components/ui/tooltip';
	import {
		activePanel,
		setActivePanelTab,
		type PanelConfig,
		type PanelPosition
	} from '$lib/stores';

	type PanelLocation = Exclude<PanelPosition, 'floating'>;

	interface Props {
		panels: PanelConfig[];
		location: PanelLocation;
		onMoveToOpposite?: () => void;
	}

	let { panels, location, onMoveToOpposite }: Props = $props();

	// 图标映射
	const iconMap = {
		Folder,
		History,
		Bookmark,
		Info,
		Grid,
		List
	};

	function handlePanelClick(panelId: PanelConfig['id']) {
		setActivePanelTab($activePanel === panelId ? null : panelId);
	}


	function handleMoveToOpposite() {
		onMoveToOpposite?.();
	}
</script>

<div
	class="flex flex-col bg-secondary/30 border-r {location === 'right' ? 'border-l' : ''}"
	style="width: 48px;"
>
	{#each panels as panel (panel.id)}
		{@const IconComponent = iconMap[panel.icon as keyof typeof iconMap]}
		{@const isActive = $activePanel === panel.id}

		<div class="relative">

			<Tooltip.Root>
				<Tooltip.Trigger>
					<button
							onclick={() => handlePanelClick(panel.id)}
							class="group relative w-full h-12 flex items-center justify-center border-b hover:bg-accent transition-colors {isActive
								? 'bg-accent border-l-2 border-l-primary'
								: ''}"
					>
							<!-- 拖拽手柄 -->
							<div
								class="absolute left-0 top-0 bottom-0 w-4 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-grab active:cursor-grabbing"
							>
								<GripVertical class="h-3 w-3 text-muted-foreground" />
							</div>

							<!-- 图标 -->
							<IconComponent class="h-5 w-5 {isActive ? 'text-primary' : 'text-muted-foreground'}" />

							<!-- 切换到对面按钮 -->
							<div
								onclick={(e) => {
									e.stopPropagation();
									handleMoveToOpposite();
								}}
								onkeydown={(e) => {
									if (e.key === 'Enter' || e.key === ' ') {
										e.preventDefault();
										handleMoveToOpposite();
									}
								}}
								class="absolute right-0 top-0 bottom-0 w-4 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-primary/10"
								title="移动到对面侧边栏"
								role="button"
								tabindex="0"
							>
								<ArrowLeftRight class="h-3 w-3 text-muted-foreground" />
							</div>
						</button>
				</Tooltip.Trigger>
				<Tooltip.Content side={location === 'left' ? 'right' : 'left'}>
					<p>{panel.title}</p>
				</Tooltip.Content>
			</Tooltip.Root>
		</div>
	{/each}

	<!-- 固定位置的分隔线 -->
	<div class="flex-1"></div>

	<!-- 底部：侧边栏切换按钮 -->
	{#if onMoveToOpposite}
		<Tooltip.Root>
			<Tooltip.Trigger>
				<Button variant="ghost" size="icon" class="h-12 rounded-none" onclick={onMoveToOpposite}>
					<ArrowLeftRight class="h-4 w-4" />
				</Button>
			</Tooltip.Trigger>
			<Tooltip.Content side={location === 'left' ? 'right' : 'left'}>
				<p>切换到{location === 'left' ? '右' : '左'}侧边栏</p>
			</Tooltip.Content>
		</Tooltip.Root>
	{/if}
</div>
