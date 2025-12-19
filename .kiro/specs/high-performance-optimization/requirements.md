# 高性能优化需求文档

## 背景

当前 archive instant loading 功能虽然实现了缓存机制，但性能提升不明显。需要采用更激进的优化策略，包括：
- 使用更高效的 Rust 库替换现有实现
- 减少 IPC 开销（invoke 调用）
- 使用 Custom Protocol 直接传输数据
- 前端使用 SharedArrayBuffer 实现零拷贝

## 用户故事

### US-1: 零拷贝压缩包读取
**作为** 用户
**我希望** 压缩包图片能够瞬间加载
**以便** 获得流畅的阅读体验

**验收标准:**
- AC-1.1: 使用 memmap2 内存映射大文件，避免完整读取
- AC-1.2: 使用 rawzip/zip-oxide 替代 zip crate，提升解压速度
- AC-1.3: 图片数据直接通过 Custom Protocol 传输，绕过 invoke 序列化

### US-2: 高性能序列化
**作为** 开发者
**我希望** 缓存数据能够快速序列化/反序列化
**以便** 减少 I/O 等待时间

**验收标准:**
- AC-2.1: 使用 rkyv 替代 bincode，实现零拷贝反序列化
- AC-2.2: 索引缓存加载时间 < 1ms（当前约 5-10ms）

### US-3: 高性能缓存
**作为** 系统
**我希望** 缓存系统能够高效管理内存
**以便** 在有限内存下最大化缓存命中率

**验收标准:**
- AC-3.1: 使用 stretto 替代 lru，支持 TinyLFU 驱逐策略
- AC-3.2: 缓存命中率提升 20%+
- AC-3.3: 使用 mimalloc 作为全局分配器，减少内存碎片

### US-4: 高效字符串处理
**作为** 系统
**我希望** 文件路径处理更高效
**以便** 减少字符串分配开销

**验收标准:**
- AC-4.1: 使用 bstr 处理文件路径，避免 UTF-8 验证开销
- AC-4.2: 路径比较和哈希计算速度提升 50%+

### US-5: 前端零拷贝数据传输
**作为** 前端
**我希望** 能够直接访问后端内存
**以便** 避免数据拷贝和序列化开销

**验收标准:**
- AC-5.1: 使用 Tauri Custom Protocol 传输图片数据
- AC-5.2: 前端使用 SharedArrayBuffer 接收数据（如果浏览器支持）
- AC-5.3: 减少 invoke 调用次数 50%+

### US-6: 性能分析
**作为** 开发者
**我希望** 能够分析性能瓶颈
**以便** 持续优化

**验收标准:**
- AC-6.1: 集成 puffin profiler 进行性能分析
- AC-6.2: 关键路径有详细的性能指标

## 技术约束

1. 必须保持向后兼容，现有 API 不变
2. 优化应该是渐进式的，可以分阶段实施
3. 需要在 Windows/macOS/Linux 上都能工作
4. SharedArrayBuffer 需要特定的 COOP/COEP 头，可能需要配置

## 优先级

1. **P0 - 必须**: memmap2 + Custom Protocol（最大收益）
2. **P1 - 重要**: rkyv + stretto（缓存优化）
3. **P2 - 可选**: mimalloc + bstr + puffin（进一步优化）
4. **P3 - 实验**: SharedArrayBuffer（需要额外配置）

## 依赖库

| 库 | 用途 | 替换 |
|---|---|---|
| memmap2 | 内存映射文件 | 直接文件读取 |
| rawzip/zip-oxide | 高性能 ZIP 解压 | zip crate |
| rkyv | 零拷贝序列化 | bincode |
| stretto | TinyLFU 缓存 | lru |
| mimalloc | 高性能分配器 | 系统分配器 |
| bstr | 字节字符串 | String |
| puffin | 性能分析 | - |
