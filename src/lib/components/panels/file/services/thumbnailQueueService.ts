import type { FsItem } from '$lib/types';
import {
  configureThumbnailManager,
  enqueueThumbnail,
  enqueueArchiveThumbnail,
  clearQueue,
} from '$lib/utils/thumbnailManager';

export type ThumbnailJobKind = 'folder' | 'image' | 'archive';
export type ThumbnailPriority = 'high' | 'normal';

interface EnqueueOptions {
  priority?: ThumbnailPriority;
  source?: string;
}

interface ThumbnailJob {
  path: string;
  kind: ThumbnailJobKind;
  priority: ThumbnailPriority;
  source?: string;
}

class ThumbnailQueueService {
  private initialized = false;
  private addThumbnail: (path: string, url: string) => void;

  constructor(addThumbnail: (path: string, url: string) => void) {
    this.addThumbnail = addThumbnail;
  }

  init() {
    if (this.initialized) return;

    configureThumbnailManager({
      addThumbnail: (path, url) => this.addThumbnail(path, url),
      maxConcurrentLocal: 4,
      maxConcurrentArchive: 2,
    });

    this.initialized = true;
  }

  enqueueItems(items: FsItem[], options: EnqueueOptions = {}) {
    const jobs: ThumbnailJob[] = items.map(item => {
      const kind: ThumbnailJobKind = item.isDir ? 'folder' : item.isImage ? 'image' : 'archive';
      return {
        path: item.path,
        kind,
        priority: options.priority ?? 'normal',
        source: options.source,
      };
    });

    this.enqueueMany(jobs);
  }

  enqueueMany(jobs: ThumbnailJob[]) {
    for (const job of jobs) {
      this.enqueue(job);
    }
  }

  enqueue(job: ThumbnailJob) {
    this.init();

    switch (job.kind) {
      case 'folder':
        enqueueThumbnail(job.path, true);
        break;
      case 'image':
        enqueueThumbnail(job.path, false);
        break;
      case 'archive':
        enqueueArchiveThumbnail(job.path);
        break;
    }
  }

  clear() {
    clearQueue();
  }
}

let instance: ThumbnailQueueService | null = null;

export function getThumbnailQueue(addThumbnail: (path: string, url: string) => void) {
  if (!instance) {
    instance = new ThumbnailQueueService(addThumbnail);
  }
  return instance;
}
