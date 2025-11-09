<script lang="ts">
  /**
   * NeoView - Decoder Settings Component
   * 解码器设置组件
   */
  import { decoderSettings, updateDecoderSettings } from '$lib/stores/decoder.svelte';
  import { Button } from '$lib/components/ui/button';
  import { Switch } from '$lib/components/ui/switch';
  import { Slider } from '$lib/components/ui/slider';
  import { Label } from '$lib/components/ui/label';
  import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '$lib/components/ui/card';
  import { Separator } from '$lib/components/ui/separator';
  import { Badge } from '$lib/components/ui/badge';
  import { nativeDecoder } from '$lib/decoders';
  import { onMount } from 'svelte';

  let supportedFormats: string[] = [];
  let jxlAvailable = false;

  onMount(async () => {
    supportedFormats = nativeDecoder.getSupportedFormats();
    // JXL 解码器暂不可用
    jxlAvailable = false;
  });

  function handleToggleFrontendDecode(checked: boolean) {
    updateDecoderSettings({ useFrontendDecode: checked });
  }

  function handleToggleJXL(checked: boolean) {
    updateDecoderSettings({ enableJXL: checked });
  }

  function handleToggleFallback(checked: boolean) {
    updateDecoderSettings({ fallbackToBackend: checked });
  }

  function handleThumbnailChange(value: number[]) {
    updateDecoderSettings({ thumbnailQuality: value[0] / 100 });
  }

  function resetSettings() {
    updateDecoderSettings({
      useFrontendDecode: true,
      preferredFormats: ['avif', 'heif', 'heic', 'webp'],
      thumbnailQuality: 0.8,
      enableJXL: false,
      fallbackToBackend: true
    });
  }
</script>

<Card>
  <CardHeader>
    <CardTitle>图像解码设置</CardTitle>
    <CardDescription>配置前端图像解码器和格式支持</CardDescription>
  </CardHeader>
  <CardContent class="space-y-6">
    <!-- 前端解码开关 -->
    <div class="flex items-center justify-between space-x-2">
      <div class="space-y-0.5">
        <Label for="frontend-decode">使用前端解码</Label>
        <div class="text-sm text-muted-foreground">
          启用浏览器原生解码 AVIF、HEIF、WebP 等现代格式
        </div>
      </div>
      <Switch
        id="frontend-decode"
        checked={$decoderSettings.useFrontendDecode}
        on:change={(e) => handleToggleFrontendDecode(e.detail)}
      />
    </div>

    <Separator />

    <!-- 支持的格式 -->
    <div class="space-y-2">
      <Label>支持的格式</Label>
      <div class="flex flex-wrap gap-2">
        {#each supportedFormats as format}
          <Badge variant="outline">{format.toUpperCase()}</Badge>
        {/each}
        {#if jxlAvailable}
          <Badge variant="secondary">JXL (WASM)</Badge>
        {/if}
      </div>
    </div>

    <Separator />

    <!-- JXL 支持 -->
    <div class="flex items-center justify-between space-x-2">
      <div class="space-y-0.5">
        <Label for="jxl-support">JPEG XL 支持</Label>
        <div class="text-sm text-muted-foreground">
          JXL 格式暂不支持，需要 WASM 解码器库
        </div>
      </div>
      <Switch
        id="jxl-support"
        checked={$decoderSettings.enableJXL}
        disabled={!jxlAvailable}
        on:change={(e) => handleToggleJXL(e.detail)}
      />
    </div>

    <Separator />

    <!-- 降级到后端 -->
    <div class="flex items-center justify-between space-x-2">
      <div class="space-y-0.5">
        <Label for="fallback">降级到后端解码</Label>
        <div class="text-sm text-muted-foreground">
          前端解码失败时自动使用后端解码
        </div>
      </div>
      <Switch
        id="fallback"
        checked={$decoderSettings.fallbackToBackend}
        on:change={(e) => handleToggleFallback(e.detail)}
      />
    </div>

    <Separator />

    <!-- 缩略图质量 -->
    <div class="space-y-3">
      <Label>缩略图质量: {Math.round($decoderSettings.thumbnailQuality * 100)}%</Label>
      <Slider
        value={[$decoderSettings.thumbnailQuality * 100]}
        on:change={(e) => handleThumbnailChange(e.detail)}
        max={100}
        min={10}
        step={5}
        class="w-full"
      />
      <div class="flex justify-between text-xs text-muted-foreground">
        <span>低质量</span>
        <span>高质量</span>
      </div>
    </div>

    <Separator />

    <!-- 重置按钮 -->
    <div class="flex justify-end">
      <Button variant="outline" onclick={resetSettings}>
        重置为默认设置
      </Button>
    </div>
  </CardContent>
</Card>