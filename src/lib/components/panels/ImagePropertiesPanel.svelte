<script lang="ts">
	import EmmPanelSection from '$lib/components/panels/emm/EmmPanelSection.svelte';
</script>

<div class="h-full flex flex-col overflow-y-auto">
	<div class="p-3 sticky top-0 z-10">
		<h3 class="text-sm font-semibold">
			标签 / EMM
		</h3>
	</div>
	<!-- 渐变过渡 -->
	<div class="h-4 bg-linear-to-b from-transparent to-background"></div>

	<div class="p-3 space-y-4 bg-background">
		<EmmPanelSection />
	</div>
</div>
