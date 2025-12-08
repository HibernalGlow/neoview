<script lang="ts">
	/**
	 * BreadcrumbTabCard - 面包屑导航 + 页签栏卡片
	 * 独立管理导航相关的 UI 状态
	 */
	import BreadcrumbBar from '$lib/components/panels/folderPanel/components/BreadcrumbBar.svelte';
	import FolderTabBar from '$lib/components/panels/folderPanel/components/FolderTabBar.svelte';
	import { getFolderContext } from '../context/FolderContext.svelte';

	// ==================== Props ====================
	interface Props {
		onNavigate: (path: string) => void;
	}
	let { onNavigate }: Props = $props();

	// ==================== Context ====================
	const ctx = getFolderContext();
</script>

<!-- 面包屑导航 -->
<BreadcrumbBar
	onNavigate={onNavigate}
	homePath={ctx.homePath}
	externalPath={ctx.isVirtualInstance ? ctx.initialPath : undefined}
/>

<!-- 页签栏（仅非虚拟实例且多页签时显示） -->
{#if ctx.displayTabs.length > 1 && !ctx.isVirtualInstance}
	<FolderTabBar homePath={ctx.homePath} />
{/if}
