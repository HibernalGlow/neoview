# 条件系统测试指南

## 运行测试

### 安装依赖
```bash
yarn install
```

### 运行所有测试
```bash
yarn test
```

### 运行测试并查看覆盖率
```bash
yarn test:run --coverage
```

### 使用 UI 界面运行测试
```bash
yarn test:ui
```

## 测试覆盖范围

### 1. 条件匹配逻辑 (`conditions.test.ts`)
- ✅ 按优先级匹配条件
- ✅ 禁用条件跳过
- ✅ 宽高阈值匹配
- ✅ 正则表达式匹配（路径）
- ✅ 元数据条件匹配
- ✅ 排除预超分功能
- ✅ 动作参数应用

### 2. 建议添加的测试

#### UI 组件测试
- `UpscalePanelConditionTabs.svelte` 组件交互
- 条件添加/删除/排序
- 参数输入验证

#### 集成测试
- 完整的条件评估流程
- 与 bookStore 的会话管理集成
- 与 preloadManager 的预超分过滤集成

#### 边界情况测试
- 空条件列表
- 无效的正则表达式
- 极大的元数据值
- 并发条件评估

## 测试最佳实践

1. **隔离测试**：每个测试用例独立，不依赖其他测试的状态
2. **模拟数据**：使用固定的测试数据，确保测试结果可重现
3. **边界测试**：测试最小/最大值、空值、特殊字符等边界情况
4. **错误处理**：验证错误输入的优雅处理
5. **性能考虑**：复杂条件评估的性能测试

## 调试测试

### 单独运行特定测试
```bash
yarn test -- conditions.test.ts
```

### 调试模式
```bash
yarn test --no-coverage --inspect-brk
```

### 查看详细输出
```bash
yarn test --reporter=verbose
```