<!--
  BackgroundLayer - 背景层
  z-index: 0
  
  功能：
  - 显示背景颜色
  - 支持自动背景色
  - 支持自定义背景图
-->
<script lang="ts">
  interface Props {
    /** 背景颜色 */
    color?: string;
    /** 自动背景色模式 */
    autoColor?: boolean;
    /** 自动检测的背景色 */
    detectedColor?: string;
  }

  let {
    color = 'var(--background, #000000)',
    autoColor = false,
    detectedColor = '',
  }: Props = $props();

  let effectiveColor = $derived(
    autoColor && detectedColor ? detectedColor : color
  );
</script>

<div
  class="background-layer"
  style:background-color={effectiveColor}
  data-layer="BackgroundLayer"
  data-layer-id="background"
/>

<style>
  .background-layer {
    position: absolute;
    inset: 0;
    z-index: 0;
    pointer-events: none;
  }
</style>
