/**
 * FileItemCard 共享类型定义
 */
import type { FsItem } from '$lib/types';
import type { EMMTranslationDict } from '$lib/api/emm';

/** 视图模式 */
export type FileItemViewMode = 'list' | 'grid';

/** EMM 元数据（简化版） */
export interface FileItemEmmMetadata {
	translatedTitle?: string;
	tags?: Record<string, string[]>;
	rating?: number;
}

/** 文件项基础 Props */
export interface FileItemBaseProps {
	item: FsItem;
	thumbnail?: string;
	isSelected?: boolean;
	isChecked?: boolean;
	isCheckMode?: boolean;
	isDeleteMode?: boolean;
	showReadMark?: boolean;
	showBookmarkMark?: boolean;
	showSizeAndModified?: boolean;
	currentPage?: number;
	totalPages?: number;
	timestamp?: number;
}

/** 文件项事件 Props */
export interface FileItemEventProps {
	onClick?: () => void;
	onDoubleClick?: () => void;
	onContextMenu?: (e: MouseEvent) => void;
	onToggleSelection?: () => void;
	onDelete?: () => void;
	onOpenAsBook?: () => void;
}

/** 文件项计算状态 */
export interface FileItemComputedState {
	isBookmarked: boolean;
	isArchive: boolean;
	emmMetadata: FileItemEmmMetadata | null;
	enableEMM: boolean;
	fileListTagDisplayMode: 'all' | 'collect' | 'none';
	translationDict?: EMMTranslationDict;
	folderAverageRating: number | null;
	folderManualRating: number | null;
}

/** 文件项完整 Props（视图组件使用） */
export interface FileItemViewProps extends FileItemBaseProps, FileItemEventProps {
	computed: FileItemComputedState;
	handleSetRating: (rating: number | null) => void;
}
