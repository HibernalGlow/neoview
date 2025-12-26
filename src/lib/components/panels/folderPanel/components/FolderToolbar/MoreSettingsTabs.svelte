<script lang="ts">
/**
 * MoreSettingsTabs - 更多设置栏
 * 包含快捷操作、显示设置、其他设置三个标签页
 */
import {
	Flame,
	RefreshCw,
	Trash2,
	Eye,
	Package,
	Image,
	Grid3x3,
	Settings2,
	FolderSync,
	Star,
	MousePointerClick,
	ChevronUp
} from '@lucide/svelte';
import { Button } from '$lib/components/ui/button';
import * as Tabs from '$lib/components/ui/tabs';
import * as Progress from '$lib/components/ui/progress';
import { get } from 'svelte/store';
import { hoverPreviewSettings, hoverPreviewEnabled, hoverPreviewDelayMs } from '$lib/stores/hoverPreviewSettings.svelte';
import { historySettingsStore } from '$lib/stores/historySettings.svelte';
import { fileBrowserStore } from '$lib/stores/fileBrowser.svelte';
import { getDefaultRating, saveDefaultRating } from '$lib/stores/emm/storage';
import { folderThumbnailLoader, type WarmupProgress } from '$lib/utils/thumbnail';
import { addExcludedPath, isPathExcluded, removeExcludedPath } from '$lib/stores/excludedPaths.svelte';
import { directoryTreeCache } from '../../utils/directoryTreeCache';
import { reloadThumbnail } from '$lib/stores/thumbnailStoreV3.svelte';
import { showSuccessToast, showErrorToast } from '$lib/utils/toast';
import {
	folderTabActions,
	tabSelectedItems,
	tabItems,
	tabCurrentPath
} from '../../stores/folderTabStore';
import type { VirtualMode } from './types';

interface Props {
	/** 虚拟模式 */
	virtualMode?: VirtualMode;
	/** 是否显示工具栏提示 */
	showToolbarTooltip?: boolean;
	/** 多选模式 */
	multiSelectMode: boolean;
	/** 缩略图宽度百分比 */
	thumbnailWidthPercent: number;
	/** 横幅宽度百分比 */
	bannerWidthPercent: number;
	/** 文件数量 */
	itemCount: number;
	/** 回调函数 */
	onSetThumbnailWidthPercent: (value: number) => void;
	onSetBannerWidthPercent: (value: number) => void;
	onToggleShowToolbarTooltip: () => void;
	onRefresh?: () => void;
}

let {
	virtualMode = null,
	showToolbarTooltip = fa