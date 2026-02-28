<script lang="ts" module>
	/**
	 * 面板基础组件属性接口
	 */
	export interface PanelBaseProps {
		/** 面板标题 */
		title: string;
		/** 是否可折叠 */
		collapsible?: boolean;
		/** 默认是否折叠 */
		defaultCollapsed?: boolean;
		/** 自定义样式类 */
		class?: string;
	}
</script>

<script lang="ts">
	/**
	 * PanelBase - 面板基础组件
	 * 支持标题、折叠功能的通用面板容器
	 */
	import { ChevronDown, ChevronRight } from '@lucide/svelte';
	import type { Snippet } from 'svelte';

	interface Props extends PanelBaseProps {
		/** 面板内容插槽 */
		children?: Snippet;
		/** 面板头部额外内容插槽 */
		headerActions?: Snippet;
	}

	let {
		title,
		collapsible = false,
		defaultCollapsed = false,
		class: className = '',
		children,
		headerActions
	}: Props = $props();

	// 折叠状态
	let isCollapsed = $state(false);

	$effect(() => {
		isCollapsed = defaultCollapsed;
	});

	/**
	 * 切换折叠状态
	 */
	function toggleCollapse() {
		if (collapsible) {
			isCollapsed = !isCollapsed;
		}
	}
</script>

<div
	class="bg-background border rounded-lg shadow-sm overflow-hidden {className}"
	role="region"
	aria-labelledby="panel-title"
>
	<!-- 面板头部 - 可折叠模式使用 button -->
	{#if collapsible}
		<button
			type="button"
			class="flex items-center justify-between w-full px-4 py-3 border-b bg-muted/30 
				   cursor-pointer hover:bg-muted/50 transition-colors select-none text-left"
			onclick={toggleCollapse}
			aria-expanded={!isCollapsed}
			aria-controls="panel-content"
		>
			<div class="flex items-center gap-2">
				<!-- 折叠图标 -->
				<span class="text-muted-foreground transition-transform duration-200">
					{#if isCollapsed}
						<ChevronRight class="h-4 w-4" />
					{:else}
						<ChevronDown class="h-4 w-4" />
					{/if}
				</span>
				<!-- 标题 -->
				<span id="panel-title" class="text-sm font-medium">
					{title}
				</span>
			</div>

			<!-- 头部操作区域 -->
			{#if headerActions}
				<!-- svelte-ignore a11y_click_events_have_key_events -->
				<!-- svelte-ignore a11y_no_static_element_interactions -->
				<div class="flex items-center gap-1" onclick={(e) => e.stopPropagation()}>
					{@render headerActions()}
				</div>
			{/if}
		</button>
	{:else}
		<!-- 面板头部 - 不可折叠模式使用 div -->
		<div class="flex items-center justify-between px-4 py-3 border-b bg-muted/30">
			<div class="flex items-center gap-2">
				<!-- 标题 -->
				<h3 id="panel-title" class="text-sm font-medium">
					{title}
				</h3>
			</div>

			<!-- 头部操作区域 -->
			{#if headerActions}
				<div class="flex items-center gap-1">
					{@render headerActions()}
				</div>
			{/if}
		</div>
	{/if}

	<!-- 面板内容 -->
	<div
		id="panel-content"
		class="transition-all duration-200 ease-out {isCollapsed
			? 'max-h-0 opacity-0 overflow-hidden'
			: 'max-h-500 opacity-100'}"
	>
		<div class="p-4">
			{#if children}
				{@render children()}
			{/if}
		</div>
	</div>
</div>
