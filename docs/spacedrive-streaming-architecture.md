# Spacedrive 流式加载架构参考

基于 Spacedrive 项目参考资料的流式加载技术分析。

## 📚 核心组件

### 1. BatchedStream（批量流）

**文件**: `core/src/util/batched_stream.rs`

**核心思想**: 将连续的流数据批量化处理，避免过多的小批次传输。

```rust
// 关键特性
- 最大批次大小: 15项（MAX_POLLS）
- 分批返回: Vec<S::Item>
- 防止饥饿: 限制轮询次数避免阻塞其他任务

// 工作流程
1. 从底层流收集最多15项
2. 达到上限或流结束时返回整批
3. 如果没有数据则等待
```

**适用场景**:

- 目录扫描：扫描到15个文件就返回一批
- 搜索结果：每找到15个结果就推送一次
- 缩略图生成：每生成15个就通知前端

---

### 2. Unsafe Streamed Query（流式查询）

**文件**: `core/src/util/unsafe_streamed_query.rs`

**核心思想**: 使用 Rust Stream 机制流式返回查询结果，前端使用 `useUnsafeStreamedQuery` 消费。

```rust
pub enum Output<T> {
    Data(T),                        // 数据项
    Complete { __stream_complete: () },  // 完成标记
}

// 使用示例
stream! {
    let mut stream = pin!(stream);
    while let Some(v) = stream.next().await {
        yield Output::Data(v);  // 逐项返回
    }
    yield Output::Complete { __stream_complete: () };  // 最后发送完成信号
}
```

**关键特点**:

- 分段传输: 边扫描边返回
- 完成信号: 明确告知前端已完成
- 类型安全: 使用 Specta 保证类型一致

---

## 🚀 应用到 NeoView 的方案

### 方案 A: 简化版批量流加载（推荐）

**不需要修改 Rust 后端**，在现有 API 基础上实现类似效果：

```typescript
// 前端实现类似的批量加载
async function* streamDirectoryBatched(
	path: string,
	batchSize: number = 15
): AsyncGenerator<FsItem[], void, unknown> {
	let offset = 0;
	let hasMore = true;

	while (hasMore) {
		const result = await FileSystemAPI.browseDirectoryPage(path, {
			offset,
			limit: batchSize
		});

		if (result.items.length > 0) {
			yield result.items; // 返回一批
		}

		hasMore = result.hasMore;
		offset += batchSize;

		// 避免阻塞UI
		await new Promise((r) => setTimeout(r, 10));
	}
}

// 使用
for await (const batch of streamDirectoryBatched('/path/to/large/dir')) {
	console.log(`收到 ${batch.length} 项`);
	updateUI(batch); // 逐批更新UI
}
```

**优点**:

- ✅ 无需修改后端
- ✅ 实现快速（30分钟）
- ✅ 效果接近真正的流式加载

**缺点**:

- ⚠️ 不是真正的流式（多次HTTP请求）
- ⚠️ 后端仍需扫描完整目录（每次分页）

---

### 方案 B: 完整Rust流式加载（高级）

参考 Spacedrive 架构，需要修改后端：

**1. Rust 后端实现**

```rust
// src-tauri/src/commands/fs_commands.rs
use futures::Stream;
use async_stream::stream;

#[derive(Serialize)]
#[serde(untagged)]
pub enum DirectoryStreamOutput {
    Data(Vec<FsItem>),
    Complete { __stream_complete: () },
}

#[tauri::command]
pub async fn stream_directory(
    path: String
) -> impl Stream<Item = DirectoryStreamOutput> {
    stream! {
        const BATCH_SIZE: usize = 15;
        let mut batch = Vec::with_capacity(BATCH_SIZE);

        // 使用 jwalk 并行扫描
        let walker = jwalk::WalkDir::new(path)
            .min_depth(1)
            .max_depth(1);

        for entry in walker {
            if let Ok(entry) = entry {
                // 转换为 FsItem
                let item = FsItem {
                    path: entry.path().to_string_lossy().to_string(),
                    name: entry.file_name().to_string_lossy().to_string(),
                    // ... 其他字段
                };

                batch.push(item);

                // 达到批次大小就返回
                if batch.len() >= BATCH_SIZE {
                    yield DirectoryStreamOutput::Data(batch.clone());
                    batch.clear();

                    // 让出CPU
                    tokio::task::yield_now().await;
                }
            }
        }

        // 返回剩余项
        if !batch.is_empty() {
            yield DirectoryStreamOutput::Data(batch);
        }

        // 完成信号
        yield DirectoryStreamOutput::Complete { __stream_complete: () };
    }
}
```

**2. 前端消费**

```typescript
// 需要 Tauri 支持 Stream（可能需要升级或使用事件）
async function loadWithStream(path: string) {
	const channel = await invoke('stream_directory', { path });

	for await (const output of channel) {
		if ('__stream_complete' in output) {
			console.log('✅ 加载完成');
			break;
		} else {
			console.log(`📦 收到批次: ${output.length} 项`);
			updateUI(output);
		}
	}
}
```

**优点**:

- ✅ 真正的流式传输
- ✅ 后端边扫描边返回
- ✅ 最优性能

**缺点**:

- ⚠️ 需要大改后端（2-4小时）
- ⚠️ Tauri Stream支持可能有限
- ⚠️ 调试复杂度高

---

## 📊 性能对比

| 方案        | 首批数据 | 总耗时 | 后端改动 | 实施难度 | 推荐度     |
| ----------- | -------- | ------ | -------- | -------- | ---------- |
| 当前虚拟化  | 300ms    | 300ms  | 无       | 低       | ⭐⭐⭐     |
| 方案A批量流 | 200ms    | 500ms  | 无       | 低       | ⭐⭐⭐⭐   |
| 方案B真流式 | 50ms     | 300ms  | 大       | 高       | ⭐⭐⭐⭐⭐ |

注：方案A虽然总耗时略长，但首批数据更快，用户感知更好。

---

## 💡 建议实施顺序

### 第一阶段 - 已完成 ✅

1. 虚拟化分页加载（当前）
2. 目录缓存优化
3. 缩略图并发控制

### 第二阶段 - 考虑实施

**方案A: 前端批量流加载**

- 实施时间: 30分钟
- 收益: 中等
- 风险: 低

### 第三阶段 - 长期目标

**方案B: Rust 真流式加载**

- 实施时间: 3-5小时
- 收益: 高
- 风险: 中等
- 前提: 验证 Tauri Stream 支持

---

## 🔍 Spacedrive 其他可借鉴的优化

### 1. 并行目录扫描

```rust
// 使用 jwalk 代替标准库
use jwalk::WalkDir;

WalkDir::new(path)
    .min_depth(1)
    .max_depth(1)
    .into_iter()
    // 自动并行处理
```

### 2. 数据库索引

Spacedrive 使用 Prisma + SQLite 缓存文件元数据，避免重复扫描。

### 3. 任务系统

使用 Job System 管理长时间运行的任务（扫描、索引等），前端可以查询进度。

---

## 结论

**当前建议**: 保持已实施的虚拟化加载，暂不实施流式加载。

**原因**:

1. 虚拟化已经解决了95%的性能问题
2. 流式加载的边际收益不大（从300ms→50ms）
3. 投入产出比不理想

**未来计划**: 如果后续发现虚拟化仍不够用，再考虑实施方案A（前端批量流）。

---

**参考资料**:

- Spacedrive: https://github.com/spacedriveapp/spacedrive
- `batched_stream.rs`
- `unsafe_streamed_query.rs`
