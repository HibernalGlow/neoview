<script lang="ts">
	/**
	 * 区域点击覆盖层
	 * 在主视图上显示6个区域，方便测试区域点击功能
	 */
	import { keyBindingsStore, type ViewArea } from '$lib/stores/keybindings.svelte';
	import { createEventDispatcher } from 'svelte';

	let { show = $bindable(false), sidebarOpen = false, rightSidebarOpen = false } = $props();
	const dispatch = createEventDispatcher();

	// 区域配置
	const areas: { value: ViewArea; label: string; gridClass: string }[] = [
		{ value: 'top-left', label: '左上', gridClass: 'col-start-1 row-start-1' },
		{ value: 'top-center', label: '中上', gridClass: 'col-start-2 row-start-1' },
		{ value: 'top-right', label: '右上', gridClass: 'col-start-3 row-start-1' },
		{ value: 'bottom-left', label: '左下', gridClass: 'col-start-1 row-start-2' },
		{ value: 'bottom-center', label: '中下', gridClass: 'col-start-2 row-start-2' },
		{ value: 'bottom-right', label: '右下', gridClass: 'col-start-3 row-start-2' }
	];

	// 处理区域点击
	function handleAreaClick(area: ViewArea, event: MouseEvent) {
		// 如果任一边栏打开，则不处理区域点击
		if (sidebarOpen || rightSidebarOpen) {
			console.log('边栏已打开，禁用区域点击响应');
			return;
		}
		
		// 获取按键信息
		const button = event.button === 0 ? 'left' : event.button === 1 ? 'middle' : 'right';
		const clickType = event.detail === 2 ? 'double-click' : 'click';
		
		// 查找对应的操作
		const action = keyBindingsStore.findActionByAreaClick(area, button as 'left' | 'right' | 'middle', clickType as 'click' | 'double-click');
		
		if (action) {
			console.log(`区域点击: ${area}, 按键: ${button}, 动作: ${clickType}, 触发操作: ${action}`);
			// 触发操作事件
			dispatch('areaAction', { action, area, button, clickType });
		} else {
			console.log(`区域点击: ${area}, 按键: ${button}, 动作: ${clickType}, 未找到对应操作`);
		}
	}

	// 处理右键菜单
	function handleContextMenu(event: MouseEvent) {
		// 如果任一边栏打开，则不处理右键菜单
		if (sidebarOpen || rightSidebarOpen) {
			console.log('边栏已打开，禁用区域右键响应');
			return;
		}
		
		event.preventDefault();
		const area = (event.currentTarget as HTMLElement).dataset.area as ViewArea;
		console.log(`右键点击区域: ${area}`);
	}

	// 监听全局事件
	$effect(() => {
		if (show) {
			const handleGlobalClick = (e: MouseEvent) => {
				// 检查是否点击了覆盖层
				if (!e.target || !(e.target as HTMLElement).closest('.area-overlay')) {
					return;
				}
			};

			const handleKeyDown = (e: KeyboardEvent) => {
				if (e.key === 'Escape') {
					show = false;
				}
			};

			window.addEventListener('keydown', handleKeyDown);
			return () => {
				window.removeEventListener('keydown', handleKeyDown);
			};
		}
	});
</script>

{#if show}
	<div class="area-overlay fixed inset-0 z-[50] pointer-events-none">
		<!-- 半透明背景 -->
		<div class="absolute inset-0 bg-black/20 pointer-events-none"></div>
		
		<!-- 6区域网格 - 根据边栏状态决定是否响应点击 -->
		<div class="absolute inset-4 grid grid-cols-3 grid-rows-2 gap-2 {sidebarOpen || rightSidebarOpen ? 'pointer-events-none' : 'pointer-events-auto'}">
			{#each areas as area}
				<div
					class="border-2 border-white/60 bg-white/10 hover:bg-white/20 backdrop-blur-sm rounded-lg flex items-center justify-center cursor-pointer transition-all duration-200 hover:scale-105 hover:border-white/80 {area.gridClass}"
					data-area={area.value}
					onclick={(e) => handleAreaClick(area.value, e)}
					oncontextmenu={handleContextMenu}
					title="点击测试区域绑定"
				>
					<div class="text-center">
						<div class="text-white font-bold text-lg drop-shadow-lg">{area.label}</div>
						<div class="text-white/80 text-xs drop-shadow">{area.value}</div>
					</div>
				</div>
			{/each}
		</div>

		<!-- 关闭提示 -->
		<div class="absolute top-4 right-4 bg-black/60 text-white px-3 py-2 rounded-lg text-sm pointer-events-auto">
			<div class="flex items-center gap-2">
				<span>按 ESC 关闭</span>
				<button
					class="ml-2 text-white/80 hover:text-white transition-colors"
					onclick={() => (show = false)}
				>
					✕
				</button>
			</div>
		</div>

		<!-- 操作提示 -->
		<div class="absolute bottom-4 left-4 bg-black/60 text-white px-3 py-2 rounded-lg text-sm max-w-xs pointer-events-none">
			<div class="space-y-1">
				<div>• 左键/右键/中键点击测试区域</div>
				<div>• 双击测试双击绑定</div>
				<div>• 查看控制台输出</div>
			</div>
		</div>
	</div>
{/if}