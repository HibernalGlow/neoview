# Web 浏览模式迁移指南

## 概述

为了支持 Web 浏览模式，需要将 Tauri API 的 import 替换为适配器。

## 替换规则

### 1. invoke 调用

**之前：**
```typescript
import { invoke } from '@tauri-apps/api/core';
```

**之后：**
```typescript
import { invoke } from '$lib/api/adapter';
```

### 2. convertFileSrc 调用

**之前：**
```typescript
import { convertFileSrc } from '@tauri-apps/api/core';
```

**之后：**
```typescript
import { convertFileSrc } from '$lib/api/adapter';
```

### 3. 事件监听

**之前：**
```typescript
import { listen, emit } from '@tauri-apps/api/event';
```

**之后：**
```typescript
import { listen, emit } from '$lib/api/adapter';
```

## 批量替换命令

在项目根目录运行：

```bash
# 替换 invoke
find src -name "*.ts" -o -name "*.svelte" | xargs sed -i "s/from '@tauri-apps\/api\/core'/from '\$lib\/api\/adapter'/g"

# 替换 event
find src -name "*.ts" -o -name "*.svelte" | xargs sed -i "s/from '@tauri-apps\/api\/event'/from '\$lib\/api\/adapter'/g"
```

## 注意事项

1. 适配器会自动检测运行环境
2. 在 Tauri 桌面模式下，使用原生 IPC
3. 在浏览器模式下，使用 HTTP API (端口 3457)
4. 前端静态文件由 tauri-plugin-localhost 提供 (端口 3456)

## 测试

启动应用后，在浏览器中访问 `http://localhost:3456` 即可使用 Web 版本。
