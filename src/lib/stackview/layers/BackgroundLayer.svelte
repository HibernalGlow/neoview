<!--
  BackgroundLayer - 背景层
  z-index: 0
-->
<script lang="ts">
  import { LayerZIndex } from '../types/layer';
  
  let {
    color = 'var(--background)',
  }: {
    color?: string;
  } = $props();
</script>

<div 
  class="background-layer"
  data-layer="BackgroundLayer"
  data-layer-id="background"
  style:background-color={color}
  style:z-index={LayerZIndex.BACKGROUND}
></div>

<style>
  .background-layer {
    position: absolute;
    inset: 0;
  }
</style>
