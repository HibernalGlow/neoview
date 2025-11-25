<script lang="ts">
	import EmmPanelSection from '$lib/components/panels/emm/EmmPanelSection.svelte';
</script>

<div class="h-full flex flex-col bg-background overflow-y-auto">
	<div class="p-3 border-b sticky top-0 bg-background z-10">
		<h3 class="text-sm font-semibold">
			标签 / EMM
		</h3>
	</div>

	<div class="p-3 space-y-4">
		<EmmPanelSection />
	</div>
</div>
