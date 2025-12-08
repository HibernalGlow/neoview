<script lang="ts">
/**
 * 书签卡片
 * Card 是入口，导入 store，组合组件，加载数据
 */
import { onMount } from 'svelte';
import { bookmarkViewStore } from '$lib/stores/bookmarkViewStore.svelte';
import Panel from '$lib/panels/components/Panel.svelte';
import Breadcrumb from '$lib/panels/components/Breadcrumb.svelte';
import Toolbar from '$lib/panels/components/Toolbar.svelte';
import SearchBar from '$lib/panels/components/SearchBar.svelte';
import SelectionBar from '$lib/panels/components/SelectionBar.svelte';
import FileList from '$lib/panels/components/FileList.svelte';

const store = bookmarkViewStore;

onMount(() => store.load());
</script>

<Panel>
    <Breadcrumb mode="bookmark" />
    <Toolbar {store} onRefresh={() => store.load()} />
    
    {#if store.showSearchBar}
        <SearchBar {store} />
    {/if}
    
    {#if store.selectedCount > 0}
        <SelectionBar {store} />
    {/if}
    
    <FileList {store} />
</Panel>
