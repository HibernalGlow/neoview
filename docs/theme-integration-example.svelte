<!-- 
  示例:如何在设置对话框中集成主题面板
  将此代码添加到你的 SettingsDialog.svelte 或类似组件中
-->

<script lang="ts">
	import ThemePanel from '$lib/components/panels/ThemePanel.svelte';
	import { Tabs, TabsContent, TabsList, TabsTrigger } from '$lib/components/ui/tabs';

	// ... 其他导入和代码
</script>

<Tabs defaultValue="general">
	<TabsList>
		<TabsTrigger value="general">常规</TabsTrigger>
		<TabsTrigger value="keybindings">快捷键</TabsTrigger>
		<TabsTrigger value="theme">主题</TabsTrigger>
		<!-- 其他标签 -->
	</TabsList>

	<TabsContent value="general">
		<!-- 常规设置内容 -->
	</TabsContent>

	<TabsContent value="keybindings">
		<!-- 快捷键设置内容 -->
	</TabsContent>

	<TabsContent value="theme">
		<ThemePanel />
	</TabsContent>

	<!-- 其他标签内容 -->
</Tabs>
