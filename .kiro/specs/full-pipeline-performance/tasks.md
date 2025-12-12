# Implementation Plan

## 1. Core Infrastructure

- [x] 1.1 Create PerfMonitor utility class
  - Create `src/lib/utils/perfMonitor.ts` with metrics tracking
  - Implement record, getStats, checkThresholds methods
  - Support configurable thresholds
  - _Requirements: 7.1, 7.2, 7.3_

- [ ]* 1.2 Write property test for performance threshold warning
  - **Property 21: Performance Threshold Warning**
  - **Validates: Requirements 7.2**

- [x] 1.3 Create SystemCapabilities detector
  - Create `src/lib/utils/systemCapabilities.ts`
  - Detect memory, CPU cores via Tauri API
  - Calculate recommended preload count and cache size
  - _Requirements: 8.1_

- [ ]* 1.4 Write property test for adaptive preload count
  - **Property 22: Adaptive Preload Count**
  - **Validates: Requirements 8.2**

## 2. ImagePool Implementation

- [x] 2.1 Create ImagePool core
  - Create `src/lib/services/imagePool.ts`
  - Implement LRU cache with configurable max memory
  - Add get, preload, cancelPreload, evict methods
  - Track memory usage and entry metadata
  - _Requirements: 1.1, 1.4_

- [ ]* 2.2 Write property test for cache eviction on memory limit
  - **Property 4: Cache Eviction on Memory Limit**
  - **Validates: Requirements 1.4**

- [x] 2.3 Implement preload priority system
  - Add priority levels (high, normal, low)
  - Ensure current page has highest priority
  - Delay low priority requests by configurable amount
  - _Requirements: 1.3_

- [ ]* 2.4 Write property test for preload priority
  - **Property 3: Preload Priority**
  - **Validates: Requirements 1.3**

- [x] 2.5 Implement memory pressure handling
  - Listen for memory pressure events
  - Release cached resources when memory is low
  - Reduce preload count dynamically
  - _Requirements: 8.4_

- [ ]* 2.6 Write property test for memory pressure response
  - **Property 23: Memory Pressure Response**
  - **Validates: Requirements 8.4**

## 3. Checkpoint - Core Infrastructure Tests

- [ ] 3. Checkpoint - Make sure all tests are passing
  - Ensure all tests pass, ask the user if questions arise.

## 4. Preloader Implementation

- [x] 4.1 Create Preloader class
  - Create `src/lib/services/preloader.ts`
  - Implement calculatePreloadPages method
  - Support configurable preload ahead/behind counts
  - _Requirements: 1.2_

- [ ]* 4.2 Write property test for preload queue correctness
  - **Property 2: Preload Queue Correctness**
  - **Validates: Requirements 1.2**

- [x] 4.3 Implement preload cancellation
  - Cancel pending preloads when user skips pages
  - Track pending requests by page index
  - Clean up cancelled requests properly
  - _Requirements: 1.5_

- [ ]* 4.4 Write property test for preload cancellation on rapid navigation
  - **Property 5: Preload Cancellation on Rapid Navigation**
  - **Validates: Requirements 1.5**

- [ ] 4.5 Integrate Preloader with bookStore
  - Hook into page navigation events
  - Update preload queue on page change
  - Detect navigation direction for smarter preloading
  - _Requirements: 1.1, 1.2_

- [ ]* 4.6 Write property test for preloaded image display latency
  - **Property 1: Preloaded Image Display Latency**
  - **Validates: Requirements 1.1**

## 5. ThumbnailManager Implementation

- [x] 5.1 Create ThumbnailManager class
  - Create `src/lib/services/thumbnailManager.ts`
  - Implement request, requestBatch, cancel methods
  - Support priority-based loading
  - _Requirements: 3.1, 3.2_

- [ ]* 5.2 Write property test for thumbnail batch size
  - **Property 8: Thumbnail Batch Size**
  - **Validates: Requirements 3.1**

- [ ]* 5.3 Write property test for thumbnail priority by visibility
  - **Property 9: Thumbnail Priority by Visibility**
  - **Validates: Requirements 3.2**

- [x] 5.4 Implement visibility-based cancellation
  - Track visible items via IntersectionObserver
  - Cancel requests for items that scroll out of view
  - Update priorities on scroll
  - _Requirements: 3.4_

- [ ]* 5.5 Write property test for thumbnail cancellation on scroll
  - **Property 10: Thumbnail Cancellation on Scroll**
  - **Validates: Requirements 3.4**

- [x] 5.6 Implement thumbnail caching
  - Cache loaded thumbnails in memory
  - Return cached thumbnails on subsequent requests
  - Implement LRU eviction for thumbnail cache
  - _Requirements: 3.5_

- [ ]* 5.7 Write property test for thumbnail cache hit
  - **Property 11: Thumbnail Cache Hit**
  - **Validates: Requirements 3.5**

## 6. Checkpoint - Frontend Services Tests

- [ ] 6. Checkpoint - Make sure all tests are passing
  - Ensure all tests pass, ask the user if questions arise.

## 7. Backend ImageLoader Enhancement

- [ ] 7.1 Implement large image detection
  - Add size threshold check (5MB default)
  - Route large images to background thread
  - Use spawn_blocking for CPU-intensive decoding
  - _Requirements: 2.1_

- [ ]* 7.2 Write property test for large image background decoding
  - **Property 6: Large Image Background Decoding**
  - **Validates: Requirements 2.1**

- [ ] 7.3 Implement decode error handling
  - Catch decode errors gracefully
  - Return structured error with path and reason
  - Log errors with context
  - _Requirements: 2.5_

- [ ]* 7.4 Write property test for decode error handling
  - **Property 7: Decode Error Handling**
  - **Validates: Requirements 2.5**

## 8. Backend ArchiveExtractor Enhancement

- [ ] 8.1 Implement parallel extraction
  - Use rayon for parallel file extraction
  - Configure parallelism based on CPU cores
  - Track extraction progress
  - _Requirements: 5.3_

- [ ]* 8.2 Write property test for parallel archive extraction
  - **Property 16: Parallel Archive Extraction**
  - **Validates: Requirements 5.3**

- [ ] 8.3 Implement archive caching
  - Cache file list after first extraction
  - Cache extracted images on disk
  - Validate cache on archive mtime change
  - _Requirements: 5.4_

- [ ]* 8.4 Write property test for archive cache hit
  - **Property 17: Archive Cache Hit**
  - **Validates: Requirements 5.4**

- [ ] 8.5 Implement extraction error recovery
  - Skip failed entries and continue
  - Report errors without crashing
  - Return partial results with error list
  - _Requirements: 5.5_

- [ ]* 8.6 Write property test for archive extraction error recovery
  - **Property 18: Archive Extraction Error Recovery**
  - **Validates: Requirements 5.5**

- [ ] 8.7 Optimize first page loading
  - Prioritize first page extraction
  - Start displaying before full extraction
  - Target 500ms first page display
  - _Requirements: 5.1_

- [ ]* 8.8 Write property test for archive first page latency
  - **Property 15: Archive First Page Latency**
  - **Validates: Requirements 5.1**

## 9. Checkpoint - Backend Tests

- [ ] 9. Checkpoint - Make sure all tests are passing
  - Ensure all tests pass, ask the user if questions arise.

## 10. IPC Optimization

- [x] 10.1 Implement request batching
  - Create IPC request queue
  - Batch small requests within 50ms window
  - Merge requests into single IPC call
  - _Requirements: 4.2_

- [ ]* 10.2 Write property test for IPC request batching
  - **Property 12: IPC Request Batching**
  - **Validates: Requirements 4.2**

- [ ] 10.3 Implement streaming for large data
  - Use Tauri Channel for large transfers
  - Emit progress events every 100KB
  - Support cancellation during transfer
  - _Requirements: 4.3_

- [ ]* 10.4 Write property test for large data streaming
  - **Property 13: Large Data Streaming**
  - **Validates: Requirements 4.3**

- [x] 10.5 Implement retry with exponential backoff
  - Retry failed IPC calls up to 3 times
  - Use exponential backoff (50ms, 100ms, 200ms)
  - Log retry attempts
  - _Requirements: 4.4_

- [ ]* 10.6 Write property test for IPC retry with backoff
  - **Property 14: IPC Retry with Backoff**
  - **Validates: Requirements 4.4**

## 11. UI Performance Optimization

- [ ] 11.1 Optimize virtualized list rendering
  - Ensure only visible items are rendered
  - Add buffer of 10 items above/below viewport
  - Recycle DOM elements on scroll
  - _Requirements: 6.2_

- [ ]* 11.2 Write property test for virtualization render count
  - **Property 19: Virtualization Render Count**
  - **Validates: Requirements 6.2**

- [ ] 11.3 Optimize sort/filter operations
  - Use efficient sorting algorithms
  - Implement incremental filtering
  - Target 100ms for 10000 items
  - _Requirements: 6.4_

- [ ]* 11.4 Write property test for sort/filter performance
  - **Property 20: Sort/Filter Performance**
  - **Validates: Requirements 6.4**

## 12. Integration and Polish

- [ ] 12.1 Integrate all components
  - Wire up ImagePool with Preloader
  - Connect ThumbnailManager with file browser
  - Hook PerfMonitor into all services
  - _Requirements: All_

- [ ] 12.2 Add loading placeholders
  - Show placeholder during image load
  - Display progress for large images
  - Show error placeholder on failure
  - _Requirements: 2.3, 3.3_

- [ ] 12.3 Implement adaptive configuration
  - Adjust settings based on SystemCapabilities
  - Reduce preload on low-end devices
  - Increase cache on high-end devices
  - _Requirements: 8.2, 8.3_

## 13. Final Checkpoint

- [ ] 13. Final Checkpoint - Make sure all tests are passing
  - Ensure all tests pass, ask the user if questions arise.
