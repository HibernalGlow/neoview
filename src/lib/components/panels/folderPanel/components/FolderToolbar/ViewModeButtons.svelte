<script lang="ts">
/**
 * ViewModeButtons - 视图模式按钮组子组件
 * 包含：列表、内容、横幅、缩略图视图切换
 */
import {
	List,
	Grid3x3,
	LayoutGrid,
	Image
} from '@lucide/svelte';
import { Button } from '$lib/components/ui/button';
import * as Tooltip from '$lib/components/ui/tooltip';
import type { FolderViewStyle } from '../../stores/folderPanelStore';

// 视图样式定义
export const viewStyles: { value: FolderViewStyle; icon: typeof List; label: string }[] = [
	{ value: 'list', icon: List, label: '列表' },
	{ value: 'content', icon: LayoutGrid, label: '内容' },
	{ value: 'banner', icon: Image, label: '横幅' },
	{ value: 'thumbnail', icon: Grid3x3, label: '缩略图' }
];

interface Props {
	/** 是否显示工具栏提示 */
	showToolbarTooltip?: boolean;
	/** 当前视图样式 */
	viewStyle: FolderViewStyle;
	/** 视图面板是否展开 */
	viewPanelExpanded?: boolean;
	/** 切换视图面板回调 */
	onToggleViewPanel?: () => void;
	/** 设置视图样式回调 */
	onSetViewStyle?: (style: FolderViewStyle) => void;
}

let {
	showToolbarTooltip = false,
	viewStyle,
	viewPanelExpanded = false,
	onToggleViewPanel,
	onSetViewStyle
}: Props = $props();

/**
 * 获取当前视图图标
 */
function getCurrentViewIcon() {
	const current = viewStyles.find((v) => v.value === viewStyle);
	return current?.icon ?? List;
}
</script>

<!-- 视图样式按钮 -->
<Tooltip.Root disabled={!showToolbarTooltip}>
	<Tooltip.Trigger>
		<Button 
			variant={viewPanelExpanded ? 'default' : 'ghost'} 
			size="icon" 
			class="h-7 w-7"
			onclick={onToggleViewPanel}
		>
			{@const ViewIcon = getCurrentViewIcon()}
			<ViewIcon class="h-4 w-4" />
		</Button>
	</Tooltip.Trigger>
	<Tooltip.Content>
		<p>视图样式</p>
	</Tooltip.Content>
</Tooltip.Root>
