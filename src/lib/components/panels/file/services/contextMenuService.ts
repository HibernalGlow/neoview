import type { FsItem } from '$lib/types';
import { fileBrowserService } from './fileBrowserService';

export type ContextMenuDirection = 'up' | 'down';
export type ContextMenuPosition = {
  x: number;
  y: number;
  direction: ContextMenuDirection;
};

export type ClipboardOperation = 'copy' | 'cut';
type ClipboardItem = {
  path: string;
  operation: ClipboardOperation;
};

let clipboardItem: ClipboardItem | null = null;

export function setClipboardItem(item: FsItem, operation: ClipboardOperation) {
  clipboardItem = { path: item.path, operation };
}

export function clearClipboard() {
  clipboardItem = null;
}

export function getClipboardItem() {
  return clipboardItem;
}

export async function pasteClipboardItem(currentPath: string, refresh: () => Promise<void>) {
  if (!clipboardItem || !currentPath) return;

  const fileName = clipboardItem.path.split(/[\\/]/).pop();
  if (!fileName) return;
  const targetPath = `${currentPath}/${fileName}`;

  if (clipboardItem.operation === 'cut') {
    await fileBrowserService.movePath(clipboardItem.path, targetPath);
  } else {
    await fileBrowserService.copyPath(clipboardItem.path, targetPath);
  }

  clearClipboard();
  await refresh();
}

export async function copyItemToFolder(
  item: FsItem | null,
  targetFolder: string,
  refresh: () => Promise<void>
) {
  if (!item) return;
  const fileName = item.path.split(/[\\/]/).pop();
  if (!fileName) return;

  const targetFilePath = `${targetFolder}/${fileName}`;
  await fileBrowserService.copyPath(item.path, targetFilePath);
  await refresh();
}

export function calculateContextMenuPosition(
  event: MouseEvent,
  menuWidth = 180,
  maxHeightRatio = 0.7
): ContextMenuPosition {
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const viewportMiddle = viewportHeight / 2;

  let x = event.clientX;
  let y = event.clientY;
  let direction: ContextMenuDirection = 'down';

  if (event.clientX + menuWidth > viewportWidth) {
    x = viewportWidth - menuWidth - 10;
  }
  if (x < 10) {
    x = 10;
  }

  const maxMenuHeight = viewportHeight * maxHeightRatio;
  if (event.clientY > viewportMiddle) {
    direction = 'up';
    y = event.clientY - Math.min(250, maxMenuHeight);
  }

  if (direction === 'down' && y + maxMenuHeight > viewportHeight) {
    y = viewportHeight - maxMenuHeight - 10;
  }
  if (direction === 'up' && y < 10) {
    y = 10;
  }

  return { x, y, direction };
}

export function calculateSubmenuPosition(
  menuPosition: ContextMenuPosition,
  viewportWidth: number,
  viewportHeight: number,
  submenuWidth = 150,
  maxHeightRatio = 0.5
) {
  let x = menuPosition.x + submenuWidth;
  let y = menuPosition.y;

  if (x + submenuWidth > viewportWidth) {
    x = menuPosition.x - submenuWidth - 10;
  }
  if (x < 10) {
    x = 10;
  }

  if (menuPosition.direction === 'up') {
    y = menuPosition.y + 200;
  }

  const maxMenuHeight = viewportHeight * maxHeightRatio;
  if (y + maxMenuHeight > viewportHeight) {
    y = viewportHeight - maxMenuHeight - 10;
  }
  if (y < 10) {
    y = 10;
  }

  return { x, y };
}
