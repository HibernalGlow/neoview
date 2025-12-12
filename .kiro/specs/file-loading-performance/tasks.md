# Implementation Plan

- [x] 1. Set up streaming infrastructure in Rust backend


  - [x] 1.1 Create DirectoryStreamOutput enum and related data structures


    - Define DirectoryStreamOutput, DirectoryBatch, StreamProgress, StreamError, StreamComplete structs
    - Add Serialize derives for Tauri channel compatibility
    - _Requirements: 5.2, 5.3, 5.4_

  - [ ]* 1.2 Write property test for schema consistency
    - **Property 10: Schema Consistency**
    - **Validates: Requirements 5.2**

  - [x] 1.3 Implement StreamManager for stream lifecycle management

    - Create StreamManager struct with DashMap for active streams
    - Implement create_stream, cancel_stream, cancel_all_for_path methods
    - Use tokio_util::sync::CancellationToken for cancellation
    - _Requirements: 1.5, 8.1, 8.2, 8.3, 8.4_

  - [ ]* 1.4 Write property test for stream cancellation behavior
    - **Property 4: Stream Cancellation Behavior**
    - **Validates: Requirements 1.5, 8.1, 8.2, 8.3**

  - [ ]* 1.5 Write property test for stream deduplication
    - **Property 14: Stream Deduplication**
    - **Validates: Requirements 8.4**

- [x] 2. Implement DirectoryScanner with batched streaming


  - [x] 2.1 Create DirectoryScanner struct with configurable batch size

    - Use jwalk for parallel directory traversal
    - Implement scan_streaming method returning async Stream
    - Add skip_hidden and batch_size configuration
    - _Requirements: 1.2, 2.2_

  - [x] 2.2 Implement batched stream logic

    - Collect entries into batches of 15-50 items
    - Yield to event loop after each batch using tokio::task::yield_now()
    - Handle cancellation token checks between batches
    - _Requirements: 1.2, 2.2, 1.5_

  - [ ]* 2.3 Write property test for batch size constraints
    - **Property 2: Batch Size Constraints**
    - **Validates: Requirements 1.2**

  - [ ]* 2.4 Write property test for async yielding
    - **Property 5: Async Yielding**
    - **Validates: Requirements 2.2**

  - [x] 2.5 Implement permission error handling in scanner

    - Skip entries with permission errors and continue scanning
    - Log errors with affected path
    - Track skipped count for completion report
    - _Requirements: 7.1, 7.2, 7.3_

  - [ ]* 2.6 Write property test for permission error handling
    - **Property 13: Permission Error Handling**
    - **Validates: Requirements 7.1, 7.2, 7.3**

- [x] 3. Checkpoint - Make sure all tests are passing

  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Create Tauri streaming commands


  - [x] 4.1 Implement stream_directory command
    - Accept path, options, and Tauri Channel
    - Create stream via StreamManager
    - Spawn async task to run DirectoryScanner and emit batches
    - Return stream_id for cancellation
    - _Requirements: 1.1, 1.2, 1.4_
    - **实现**: `stream_directory_v2` in `stream_commands.rs`


  - [x] 4.2 Implement cancel_directory_stream command
    - Look up stream by ID in StreamManager
    - Trigger cancellation token
    - Clean up resources
    - _Requirements: 8.1, 8.2, 8.3_
    - **实现**: `cancel_directory_stream_v2` in `stream_commands.rs`

  - [x] 4.3 Implement progress reporting in stream
    - Emit StreamProgress events periodically
    - Include loaded count and elapsed time
    - Estimate total if directory size is known
    - _Requirements: 6.1, 6.2, 6.3_
    - **实现**: `scan_blocking` 中每批次后发送 `StreamProgress`

  - [x]* 4.4 Write property test for progress reporting

    - **Property 12: Progress Reporting**
    - **Validates: Requirements 6.2**

  - [x] 4.5 Implement completion signal emission
    - Emit StreamComplete after all batches
    - Include total_items, skipped_items, elapsed_ms, from_cache
    - _Requirements: 1.4, 5.4, 6.3_
    - **实现**: `scan_blocking` 结束时发送 `StreamComplete`

  - [ ]* 4.6 Write property test for stream completion signal
    - **Property 3: Stream Completion Signal**
    - **Validates: Requirements 1.4, 5.4, 6.3**


- [x] 5. Checkpoint - Make sure all tests are passing
  - `yarn check` 和 `cargo check` 均通过


- [x] 6. Enhance cache layer with streaming support
  - [x] 6.1 Add mtime validation to existing cache

    - Store mtime with cache entries
    - Validate mtime on cache lookup
    - Invalidate if mtime differs
    - _Requirements: 3.1, 3.2, 3.3_

  - [ ]* 6.2 Write property test for cache mtime validation
    - **Property 6: Cache Mtime Validation**
    - **Validates: Requirements 3.1, 3.2, 3.3**

  - [x] 6.3 Implement hybrid LRU+LFU eviction strategy

    - Track access count and last access time
    - Calculate eviction score combining recency and frequency
    - Evict lowest score entry when capacity exceeded
    - _Requirements: 3.4_

  - [ ]* 6.4 Write property test for cache eviction strategy
    - **Property 7: Cache Eviction Strategy**
    - **Validates: Requirements 3.4**


  - [x] 6.5 Add streaming cache writer
    - Create StreamCacheWriter for incremental cache population
    - Support appendBatch, complete, abort operations
    - Mark entry as incomplete until complete() called
    - _Requirements: 3.1_
    - **实现**: `StreamCacheWriter`, `append_to_stream`, `complete_stream`, `abort_stream` in `directory_cache.rs`

- [x] 7. Implement frontend stream consumer

  - [x] 7.1 Create DirectoryStreamConsumer class

    - Handle Tauri channel events
    - Provide onBatch, onProgress, onComplete, onError callbacks
    - Return StreamHandle with cancel method
    - _Requirements: 1.4, 5.3, 5.4_

  - [x] 7.2 Integrate stream consumer with existing folder panel

    - Replace browseDirectory calls with streaming API
    - Update VirtualizedFileList to handle incremental data
    - Show loading indicator during streaming
    - _Requirements: 1.1, 1.3_

  - [x] 7.3 Implement stream cancellation on navigation

    - Cancel active stream when user navigates away
    - Clean up event listeners
    - _Requirements: 1.5, 8.1_

  - [ ]* 7.4 Write property test for first batch latency
    - **Property 1: First Batch Latency**
    - **Validates: Requirements 1.1**


- [x] 8. Implement streaming search
  - [x] 8.1 Create streaming search command in Rust

    - Accept path, query, and Tauri Channel
    - Stream matching results as found
    - Support cancellation
    - _Requirements: 4.1, 4.2_

  - [x] 8.2 Implement search cancellation on query change

    - Cancel previous search when query modified
    - Start new search with updated query
    - _Requirements: 4.4_

  - [ ]* 8.3 Write property test for streaming search results
    - **Property 8: Streaming Search Results**
    - **Validates: Requirements 4.1, 4.2**

  - [ ]* 8.4 Write property test for search cancellation
    - **Property 9: Search Cancellation**
    - **Validates: Requirements 4.4**

- [x] 9. Checkpoint - Make sure all tests are passing

  - Ensure all tests pass, ask the user if questions arise.

- [x] 10. Implement error event typing

  - [x] 10.1 Define typed error events

    - Create StreamError struct with message, path, skipped_count
    - Ensure all error paths emit typed events
    - _Requirements: 5.3_

  - [ ]* 10.2 Write property test for error event typing
    - **Property 11: Error Event Typing**
    - **Validates: Requirements 5.3**

- [x] 11. Register new commands in Tauri

  - [x] 11.1 Add streaming commands to lib.rs

    - Register stream_directory, cancel_directory_stream, cancel_streams_for_path
    - Add StreamManagerState to app state
    - _Requirements: 5.1_


  - [x] 11.2 Update frontend API module
    - Add TypeScript types for streaming API
    - Create streamDirectory, cancelStream functions
    - _Requirements: 5.1, 5.2_
    - **实现**: `filesystem.ts` 中添加了 `DirectoryStreamOutput`, `StreamHandle`, `streamDirectory`, `streamSearch` 等类型和函数


- [x] 12. Final Checkpoint - Make sure all tests are passing


  - Ensure all tests pass, ask the user if questions arise.

