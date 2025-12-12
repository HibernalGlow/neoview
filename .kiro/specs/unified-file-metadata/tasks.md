# Implementation Plan

## 1. Core Infrastructure

- [ ] 1.1 Create LRU Cache utility class
  - Create `src/lib/utils/lruCache.ts` with generic LRU cache implementation
  - Implement get, set, has, delete, clear methods
  - Support configurable max size (default 1000)
  - _Requirements: 2.5_

- [ ]* 1.2 Write property test for LRU Cache
  - **Property 7: LRU eviction**
  - Test that adding entries beyond maxSize evicts least recently used
  - **Validates: Requirements 2.5**

- [ ] 1.3 Create ImageMetadata type definitions
  - Create `src/lib/types/metadata.ts` with ImageMetadata interface
  - Include all fields: path, innerPath, name, size, dimensions, format, etc.
  - Add MetadataRequest and MetadataError types
  - _Requirements: 2.1, 5.1_

## 2. MetadataService Implementation

- [ ] 2.1 Create MetadataService core
  - Create `src/lib/services/metadataService.ts`
  - Implement singleton pattern with LRU cache
  - Add getMetadata method with cache-first strategy
  - Add cache key generation for regular files and archive entries
  - _Requirements: 2.1, 2.2, 2.4_

- [ ]* 2.2 Write property test for cache hit behavior
  - **Property 5: Cache hit behavior**
  - Test that cached metadata is returned without backend call
  - **Validates: Requirements 2.2**

- [ ] 2.3 Implement metadata reuse from Page
  - Add updateFromPage method to MetadataService
  - Extract metadata from Page object (width, height, size, modified)
  - Skip backend request when Page has complete metadata
  - _Requirements: 2.3, 3.3_

- [ ]* 2.4 Write property test for Page metadata reuse
  - **Property 6: Metadata reuse from Page**
  - Test that Page metadata is used without backend request
  - **Validates: Requirements 2.3, 3.3**

- [ ] 2.5 Implement dimension update method
  - Add updateDimensions method to MetadataService
  - Update cache entry with new dimensions
  - Trigger sync if current page is updated
  - _Requirements: 3.2_

- [ ]* 2.6 Write property test for dimension update propagation
  - **Property 8: Dimension update propagation**
  - Test that dimension updates propagate to infoPanelStore
  - **Validates: Requirements 3.2, 3.4**

## 3. Checkpoint - Core Service Tests

- [ ] 3. Checkpoint - Make sure all tests are passing
  - Ensure all tests pass, ask the user if questions arise.

## 4. InfoPanelStore Integration

- [ ] 4.1 Implement syncCurrentPageMetadata method
  - Add method to sync current page metadata to infoPanelStore
  - Convert ImageMetadata to ViewerImageInfo format
  - Handle null/undefined values gracefully
  - _Requirements: 1.1, 3.4_

- [ ]* 4.2 Write property test for metadata sync on navigation
  - **Property 1: Metadata sync on page navigation**
  - Test that infoPanelStore is updated on page change
  - **Validates: Requirements 1.1**

- [ ] 4.3 Implement race condition handling
  - Add request cancellation mechanism
  - Use request ID to discard stale responses
  - Ensure only current page metadata is displayed
  - _Requirements: 1.5_

- [ ]* 4.4 Write property test for race condition handling
  - **Property 4: Race condition handling**
  - Test rapid page changes result in correct final state
  - **Validates: Requirements 1.5**

## 5. BookStore Integration

- [ ] 5.1 Integrate MetadataService with bookStore
  - Add effect to sync metadata on page change
  - Call updateFromPage when book is opened
  - Update Page dimensions when image loads
  - _Requirements: 1.1, 3.1, 3.2_

- [ ] 5.2 Update StackView to report image dimensions
  - Call metadataService.updateDimensions on image load
  - Pass width, height from naturalWidth/naturalHeight
  - Include innerPath for archive images
  - _Requirements: 3.2_

## 6. Checkpoint - Integration Tests

- [ ] 6. Checkpoint - Make sure all tests are passing
  - Ensure all tests pass, ask the user if questions arise.

## 7. Backend API Extension

- [ ] 7.1 Create get_image_metadata command
  - Create `src-tauri/src/commands/metadata_commands.rs`
  - Implement metadata retrieval for regular files
  - Use image crate to get dimensions and format
  - _Requirements: 3.1_

- [ ] 7.2 Add archive entry metadata support
  - Extend get_image_metadata to handle inner_path parameter
  - Extract metadata from archive entries
  - Decode image header for dimensions without full decode
  - _Requirements: 1.3_

- [ ]* 7.3 Write property test for archive metadata retrieval
  - **Property 3: Archive metadata retrieval**
  - Test that archive entries return correct metadata
  - **Validates: Requirements 1.3**

- [ ] 7.4 Register new command in lib.rs
  - Add get_image_metadata to tauri::generate_handler
  - Add MetadataState if needed for caching
  - _Requirements: 2.1_

## 8. UI Component Updates

- [ ] 8.1 Update ImageInfoCard to use MetadataService
  - Subscribe to infoPanelStore.imageInfo
  - Display placeholder "—" for missing fields
  - Format dimensions as "width × height"
  - _Requirements: 1.2, 1.4_

- [ ]* 8.2 Write property test for dimension formatting
  - **Property 2: Dimension formatting consistency**
  - Test that dimensions are formatted correctly
  - **Validates: Requirements 1.2**

- [ ] 8.3 Update ImageInfoLayer to use shared metadata
  - Ensure InfoOverlay uses same data source as ImageInfoCard
  - Remove duplicate metadata fetching logic
  - _Requirements: 4.1, 4.3_

- [ ]* 8.4 Write property test for cross-component consistency
  - **Property 9: Consistency across components**
  - Test that all components show identical metadata
  - **Validates: Requirements 4.1, 4.3**

## 9. Extensibility Support

- [ ] 9.1 Implement unknown field preservation
  - Add extra field to ImageMetadata type
  - Preserve unknown fields from backend response
  - Make extra fields accessible to consumers
  - _Requirements: 5.2_

- [ ]* 9.2 Write property test for unknown field preservation
  - **Property 10: Unknown field preservation**
  - Test that unknown fields are preserved in extra
  - **Validates: Requirements 5.2**

## 10. Final Checkpoint

- [ ] 10. Final Checkpoint - Make sure all tests are passing
  - Ensure all tests pass, ask the user if questions arise.

