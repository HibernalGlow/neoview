<!--
  TranslationOverlayCard - 翻译叠加层控制卡片
  
  功能：
  - 开启/关闭翻译叠加层
  - 显示/隐藏边界框
  - 配置显示选项（原文、译文、悬停显示）
  - 导入/导出翻译数据
  - 清除翻译区域
-->
<script lang="ts">
  import { Switch } from '$lib/components/ui/switch';
  import { Label } from '$lib/components/ui/label';
  import { Button } from '$lib/components/ui/button';
  import { Slider } from '$lib/components/ui/slider';
  import { Separator } from '$lib/components/ui/separator';
  import { translationStore } from '$lib/stores/translation/translationStore.svelte';
  import { showInfoToast, showSuccessToast, showErrorToast } from '$lib/utils/toast';
  import { bookStore } from '$lib/stores/book.svelte';
  import { Eye, EyeOff, Square, Type, Download, Upload, Trash2, Palette } from '@lucide/svelte';
  
  // 响应式获取设置
  let settings = $derived.by(() => {
    void translationStore.version;
    return translationStore.overlaySettings;
  });
  
  // 当前页面区域数量
  let currentPageRegionCount = $derived.by(() => {
    void translationStore.version;
    const pageIndex = bookStore.currentPageIndex;
    return translationStore.getRegions(pageIndex).length;
  });
  
  // 总区域数量
  let totalRegionCount = $derived.by(() => {
    void translationStore.version;
    let count = 0;
    for (const regions of translationStore.getAllRegions().values()) {
      count += regions.length;
    }
    return count;
  });
  
  /** 切换叠加层启用 */
  function handleToggleEnabled(checked: boolean) {
    translationStore.updateSettings({ enabled: checked });
    showInfoToast(checked ? '翻译叠加层已开启' : '翻译叠加层已关闭');
  }
  
  /** 切换边界框显示 */
  function handleToggleBoundingBox(checked: boolean) {
    translationStore.updateSettings({ showBoundingBox: checked });
  }
  
  /** 切换显示原文 */
  function handleToggleShowOriginal(checked: boolean) {
    translationStore.updateSettings({ showOriginal: checked });
  }
  
  /** 切换显示译文 */
  function handleToggleShowTranslation(checked: boolean) {
    translationStore.updateSettings({ showTranslation: checked });
  }
  
  /** 切换悬停显示原文 */
  function handleToggleHoverOriginal(checked: boolean) {
    translationStore.updateSettings({ showOriginalOnHover: checked });
  }
  
  /** 更新透明度 */
  function handleOpacityChange(value: number) {
    translationStore.updateSettings({ opacity: value });
  }
  
  /** 导出翻译数据 */
  async function handleExport() {
    try {
      const json = translationStore.exportToJson();
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      
      const a = document.createElement('a');
      a.href = url;
      a.download = `translation_regions_${Date.now()}.json`;
      a.click();
      
      URL.revokeObjectURL(url);
      showSuccessToast('导出成功');
    } catch (e) {
      showErrorToast('导出失败: ' + String(e));
    }
  }
  
  /** 导入翻译数据 */
  async function handleImport() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      
      try {
        const text = await file.text();
        const result = translationStore.importFromJson(text);
        
        if (result.success) {
          showSuccessToast(`导入成功，共 ${result.count} 个区域`);
        } else {
          showErrorToast('导入失败: ' + result.error);
        }
      } catch (e) {
        showErrorToast('读取文件失败: ' + String(e));
      }
    };
    input.click();
  }
  
  /** 清除当前页翻译 */
  function handleClearCurrentPage() {
    const pageIndex = bookStore.currentPageIndex;
    translationStore.clearPage(pageIndex);
    showInfoToast('已清除当前页翻译区域');
  }
  
  /** 清除所有翻译 */
  function handleClearAll() {
    if (confirm('确定要清除所有翻译区域吗？')) {
      translationStore.clearAll();
      showInfoToast('已清除所有翻译区域');
    }
  }
  
  /** 添加测试区域（开发用） */
  function handleAddTestRegion() {
    const pageIndex = bookStore.currentPageIndex;
    const region = translationStore.createRegion(
      pageIndex,
      [
        { x: 100, y: 100 },
        { x: 300, y: 100 },
        { x: 300, y: 200 },
        { x: 100, y: 200 },
      ],
      'これはテストです',
      '这是一个测试'
    );
    translationStore.addRegion(region);
    showSuccessToast('已添加测试区域');
  }
</script>

<div class="space-y-3 text-xs">
  <!-- 主开关 -->
  <div class="flex items-center justify-between">
    <Label class="text-xs font-medium flex items-center gap-1.5">
      {#if settings.enabled}
        <Eye class="w-3.5 h-3.5 text-primary" />
      {:else}
        <EyeOff class="w-3.5 h-3.5 text-muted-foreground" />
      {/if}
      翻译叠加层
    </Label>
    <Switch
      checked={settings.enabled}
      onCheckedChange={handleToggleEnabled}
      class="scale-90"
    />
  </div>
  <p class="text-[10px] text-muted-foreground -mt-1">
    在图片上显示翻译区域和译文
  </p>
  
  <Separator />
  
  <!-- 显示选项 -->
  <div class="space-y-2">
    <p class="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">显示选项</p>
    
    <div class="flex items-center justify-between">
      <Label class="text-xs flex items-center gap-1.5">
        <Square class="w-3 h-3" />
        显示边界框
      </Label>
      <Switch
        checked={settings.showBoundingBox}
        onCheckedChange={handleToggleBoundingBox}
        class="scale-75"
        disabled={!settings.enabled}
      />
    </div>
    
    <div class="flex items-center justify-between">
      <Label class="text-xs flex items-center gap-1.5">
        <Type class="w-3 h-3" />
        显示译文
      </Label>
      <Switch
        checked={settings.showTranslation}
        onCheckedChange={handleToggleShowTranslation}
        class="scale-75"
        disabled={!settings.enabled}
      />
    </div>
    
    <div class="flex items-center justify-between">
      <Label class="text-xs">显示原文</Label>
      <Switch
        checked={settings.showOriginal}
        onCheckedChange={handleToggleShowOriginal}
        class="scale-75"
        disabled={!settings.enabled}
      />
    </div>
    
    <div class="flex items-center justify-between">
      <Label class="text-xs">悬停显示原文</Label>
      <Switch
        checked={settings.showOriginalOnHover}
        onCheckedChange={handleToggleHoverOriginal}
        class="scale-75"
        disabled={!settings.enabled}
      />
    </div>
  </div>
  
  <Separator />
  
  <!-- 透明度 -->
  <div class="space-y-2">
    <div class="flex items-center justify-between">
      <Label class="text-xs flex items-center gap-1.5">
        <Palette class="w-3 h-3" />
        透明度
      </Label>
      <span class="text-[10px] text-muted-foreground">{Math.round(settings.opacity * 100)}%</span>
    </div>
    <Slider
      type="single"
      value={settings.opacity}
      min={0}
      max={1}
      step={0.05}
      onValueChange={handleOpacityChange}
      disabled={!settings.enabled}
      class="w-full"
    />
  </div>
  
  <Separator />
  
  <!-- 统计信息 -->
  <div class="bg-muted/50 rounded-md p-2 space-y-1">
    <div class="flex items-center justify-between text-[10px]">
      <span class="text-muted-foreground">当前页区域</span>
      <span class="font-mono">{currentPageRegionCount}</span>
    </div>
    <div class="flex items-center justify-between text-[10px]">
      <span class="text-muted-foreground">总区域数</span>
      <span class="font-mono">{totalRegionCount}</span>
    </div>
  </div>
  
  <Separator />
  
  <!-- 操作按钮 -->
  <div class="space-y-2">
    <p class="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">数据管理</p>
    
    <div class="grid grid-cols-2 gap-1.5">
      <Button variant="outline" size="sm" class="h-7 text-[10px]" onclick={handleImport}>
        <Upload class="w-3 h-3 mr-1" />
        导入
      </Button>
      <Button variant="outline" size="sm" class="h-7 text-[10px]" onclick={handleExport}>
        <Download class="w-3 h-3 mr-1" />
        导出
      </Button>
    </div>
    
    <div class="grid grid-cols-2 gap-1.5">
      <Button 
        variant="outline" 
        size="sm" 
        class="h-7 text-[10px]" 
        onclick={handleClearCurrentPage}
        disabled={currentPageRegionCount === 0}
      >
        <Trash2 class="w-3 h-3 mr-1" />
        清除当前页
      </Button>
      <Button 
        variant="destructive" 
        size="sm" 
        class="h-7 text-[10px]" 
        onclick={handleClearAll}
        disabled={totalRegionCount === 0}
      >
        <Trash2 class="w-3 h-3 mr-1" />
        清除全部
      </Button>
    </div>
    
    <!-- 开发测试按钮 -->
    <Button 
      variant="secondary" 
      size="sm" 
      class="w-full h-7 text-[10px]" 
      onclick={handleAddTestRegion}
    >
      添加测试区域
    </Button>
  </div>
</div>
