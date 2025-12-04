<script lang="ts">
/**
 * 信息悬浮窗卡片
 * 从 InfoPanel 提取
 */
import * as Switch from '$lib/components/ui/switch';
import { Slider } from '$lib/components/ui/slider';
import { settingsManager } from '$lib/settings/settingsManager';

let infoOverlayEnabled = $state(false);
let infoOverlayOpacity = $state(0.85);
let infoOverlayShowBorder = $state(false);
let infoOverlayWidth = $state<number | undefined>(undefined);
let infoOverlayHeight = $state<number | undefined>(undefined);

$effect(() => {
	const s = settingsManager.getSettings();
	const overlay = s.view?.infoOverlay;
	infoOverlayEnabled = overlay?.enabled ?? false;
	infoOverlayOpacity = overlay?.opacity ?? 0.85;
	infoOverlayShowBorder = overlay?.showBorder ?? false;
	infoOverlayWidth = overlay?.width;
	infoOverlayHeight = overlay?.height;
});

function updateInfoOverlay(partial: {
	enabled?: boolean;
	opacity?: number;
	showBorder?: boolean;
	width?: number;
	height?: number;
}) {
	const current = settingsManager.getSettings();
	const prev = current.view?.infoOverlay ?? { enabled: false, opacity: 0.85, showBorder: false };
	const next = { ...prev };

	if (partial.enabled !== undefined) next.enabled = partial.enabled;
	if (partial.opacity !== undefined) {
		const clamped = Math.min(1, Math.max(0, partial.opacity));
		next.opacity = clamped;
	}
	if (partial.showBorder !== undefined) next.showBorder = partial.showBorder;
	if (partial.width !== undefined) {
		if (partial.width <= 0) delete (next as any).width;
		else (next as any).width = Math.max(120, Math.min(1600, partial.width));
	}
	if (partial.height !== undefined) {
		if (partial.height <= 0) delete (next as any).height;
		else (next as any).height = Math.max(32, Math.min(600, partial.height));
	}

	infoOverlayEnabled = next.enabled;
	infoOverlayOpacity = next.opacity;
	infoOverlayShowBorder = next.showBorder;
	infoOverlayWidth = (next as any).width;
	infoOverlayHeight = (next as any).height;

	settingsManager.updateNestedSettings('view', { infoOverlay: next });
}
</script>

<div class="space-y-2 text-xs text-muted-foreground">
	<div class="flex items-center justify-between gap-2">
		<span>启用悬浮窗</span>
		<Switch.Root
			checked={infoOverlayEnabled}
			onCheckedChange={(v) => updateInfoOverlay({ enabled: v })}
			class="scale-75"
		/>
	</div>
	<div class="flex items-center justify-between gap-2">
		<span>透明度</span>
		<div class="flex items-center gap-2">
			<input
				type="number"
				min="0"
				max="100"
				step="5"
				class="h-7 w-20 px-2 text-xs border-input bg-background selection:bg-primary dark:bg-input/30 selection:text-primary-foreground ring-offset-background placeholder:text-muted-foreground shadow-xs rounded-md border outline-none transition-[color,box-shadow] disabled:cursor-not-allowed disabled:opacity-50"
				value={Math.round(infoOverlayOpacity * 100).toString()}
				oninput={(e) => {
					const v = parseFloat((e.currentTarget as HTMLInputElement).value);
					if (!Number.isNaN(v)) updateInfoOverlay({ opacity: v / 100 });
				}}
			/>
			<span class="text-[11px]">{Math.round(infoOverlayOpacity * 100)}%</span>
		</div>
	</div>
	<div class="space-y-1">
		<div class="flex items-center justify-between gap-2">
			<span>宽度</span>
			<span class="text-[11px] text-muted-foreground">
				{infoOverlayWidth != null ? `${infoOverlayWidth} px` : '自动'}
			</span>
		</div>
		<Slider
			min={120}
			max={1600}
			step={20}
			type="single"
			value={[infoOverlayWidth ?? 480]}
			onValueChange={(vals) => {
				const v = vals[0];
				if (typeof v === 'number') updateInfoOverlay({ width: v });
			}}
			class="w-full"
		/>
	</div>
	<div class="space-y-1">
		<div class="flex items-center justify-between gap-2">
			<span>高度</span>
			<span class="text-[11px] text-muted-foreground">
				{infoOverlayHeight != null ? `${infoOverlayHeight} px` : '自动'}
			</span>
		</div>
		<Slider
			min={32}
			max={600}
			step={8}
			type="single"
			value={[infoOverlayHeight ?? 56]}
			onValueChange={(vals) => {
				const v = vals[0];
				if (typeof v === 'number') updateInfoOverlay({ height: v });
			}}
			class="w-full"
		/>
	</div>
	<div class="flex items-center justify-between gap-2">
		<span>显示边框</span>
		<Switch.Root
			checked={infoOverlayShowBorder}
			onCheckedChange={(v) => updateInfoOverlay({ showBorder: v })}
			class="scale-75"
		/>
	</div>
	<p class="text-[10px]">调节悬浮信息窗的背景透明度（0% - 100%，0% 为仅文字无底色）。</p>
</div>
