import { fileBrowserStore } from '$lib/stores/fileBrowser.svelte';
import { bookStore } from '$lib/stores/book.svelte';
import { FileSystemAPI } from '$lib/api';
import { setActivePanelTab } from '$lib/stores';
import { isVideoFile } from '$lib/utils/videoUtils';

/**
 * Opens a file system item (file or folder) with support for "Silent Sync" (updating file browser without switching tabs).
 * 
 * @param path Absolute path to the item
 * @param isDir Whether the item is a directory
 * @param options Configuration options
 */
export async function openFileSystemItem(
    path: string,
    isDir: boolean,
    options: {
        syncFileTree?: boolean;
        page?: number; // For books: target page
        totalPages?: number; // For books: total pages (for validation if needed)
        forceBookOpen?: boolean;
        folderSyncMode?: 'enter' | 'select';
    } = {}
) {
    const { syncFileTree = false, page = 0, folderSyncMode = 'enter' } = options;

    console.log(`📂 Open Item: ${path}, isDir: ${isDir}, sync: ${syncFileTree}`);

    // 1. Sync File Tree (Silent Jump)
    if (syncFileTree) {
        try {
            let targetPath = path;

            // If it is a folder and mode is 'enter', we append a separator so that getParentDirectory returns the folder itself.
            // This causes the file browser to ENTER the folder.
            // If mode is 'select', we leave it as is, so it navigates to parent and selects the folder.
            if (isDir && folderSyncMode === 'enter') {
                const hasBackslash = targetPath.includes('\\');
                const separator = hasBackslash ? '\\' : '/';
                if (!targetPath.endsWith(separator)) {
                    targetPath += separator;
                }
            }

            console.log('🌳 Syncing file tree to:', targetPath);
            await fileBrowserStore.navigateToPath(targetPath);
        } catch (err) {
            console.debug('Sync file tree failed:', err);
        }
    }

    // 2. Open Content
    if (options.forceBookOpen) {
        await bookStore.openBook(path);
        if (page > 0) {
            setTimeout(async () => {
                try {
                    console.log('🔖 Jumping to page:', page);
                    await bookStore.navigateToPage(page);
                } catch (err) {
                    console.error('Jump to page failed:', err);
                }
            }, 100);
        }
        return;
    }

    if (isDir) {
        // If NOT syncing silently, we assume the user wants to switch to the file browser and see the folder.
        if (!syncFileTree) {
            // We use the same logic as above to ensure we enter the folder
            let targetPath = path;
            const hasBackslash = targetPath.includes('\\');
            const separator = hasBackslash ? '\\' : '/';
            if (!targetPath.endsWith(separator)) {
                targetPath += separator;
            }

            await fileBrowserStore.navigateToPath(targetPath);
            setActivePanelTab('folder');
        }
    } else {
        // File
        try {
            // Check if it is a supported archive/book or a standalone video file
            const isArchive = await FileSystemAPI.isSupportedArchive(path);
            const isVideo = !isArchive && isVideoFile(path);

            if (isArchive || isVideo) {
                await bookStore.openBook(path);

                // Navigate to page if specified
                if (page > 0) {
                    // Use setTimeout to ensure book is loaded (simple approach, ideally listen to event)
                    setTimeout(async () => {
                        try {
                            console.log('🔖 Jumping to page:', page);
                            await bookStore.navigateToPage(page);
                        } catch (err) {
                            console.error('Jump to page failed:', err);
                        }
                    }, 100);
                }
            } else {
                // Open with system default application
                await FileSystemAPI.openWithSystem(path);
            }
        } catch (err) {
            console.error('Failed to open file:', err);
        }
    }
}
