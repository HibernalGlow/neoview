/**
 * Path Hash 工具测试
 */

import { 
  buildImagePathKey, 
  getStableImageHash, 
  buildImageContext,
  batchGenerateHashes,
  clearHashCache,
  normalizePath,
  getCachedHash
} from './pathHash';

// 测试数据
const testCases = [
  {
    name: '普通文件',
    context: {
      bookPath: 'D:\\Comics\\Test\\volume1',
      bookType: 'folder' as const,
      pagePath: 'D:\\Comics\\Test\\volume1\\001.jpg'
    },
    expectedPathKey: 'D:/Comics/Test/volume1/001.jpg'
  },
  {
    name: '压缩包文件',
    context: {
      bookPath: 'D:\\Comics\\Test\\archive.zip',
      bookType: 'archive' as const,
      pagePath: '001.jpg',
      innerPath: 'chapter1/001.jpg'
    },
    expectedPathKey: 'D:/Comics/Test/archive.zip::chapter1/001.jpg'
  },
  {
    name: '压缩包文件（只有pagePath）',
    context: {
      bookPath: 'D:\\Comics\\Test\\archive.zip',
      bookType: 'archive' as const,
      pagePath: 'chapter1/001.jpg'
    },
    expectedPathKey: 'D:/Comics/Test/archive.zip::chapter1/001.jpg'
  },
  {
    name: '文件书（bookType=file）',
    context: {
      bookPath: 'D:\\Comics\\Test\\volume1.cbz',
      bookType: 'file' as const,
      pagePath: 'D:\\Comics\\Test\\volume1.cbz\\001.jpg'
    },
    expectedPathKey: 'D:/Comics/Test/volume1.cbz/001.jpg'
  }
];

// 测试路径键生成
describe('buildImagePathKey', () => {
  test.each(testCases, '$name', ({ context, expectedPathKey }) => {
    const result = buildImagePathKey(context);
    expect(result).toBe(expectedPathKey);
  });
});

// 测试路径规范化
describe('normalizePath', () => {
  test('统一斜杠方向', () => {
    expect(normalizePath('D:\\Test\\Path')).toBe('D:/Test/Path');
  });
  
  test('移除尾部斜杠', () => {
    expect(normalizePath('D:/Test/Path/')).toBe('D:/Test/Path');
  });
});

// 测试上下文构建
describe('buildImageContext', () => {
  test('构建完整上下文', () => {
    const ctx = buildImageContext(
      'D:\\Comics\\Test',
      '001.jpg',
      'folder',
      'chapter1/001.jpg'
    );
    
    expect(ctx.bookPath).toBe('D:/Comics/Test');
    expect(ctx.pagePath).toBe('D:/Comics/Test/001.jpg');
    expect(ctx.innerPath).toBe('D:/Comics/Test/chapter1/001.jpg');
  });
  
  test('压缩包上下文（优先innerPath）', () => {
    const ctx1 = buildImageContext(
      'D:\\Comics\\Test\\archive.zip',
      '001.jpg',
      'archive',
      'chapter1/001.jpg'
    );
    
    const ctx2 = buildImageContext(
      'D:\\Comics\\Test\\archive.zip',
      'chapter1/001.jpg',
      'archive'
    );
    
    // 两种方式应该产生相同的 pathKey
    expect(buildImagePathKey(ctx1)).toBe(buildImagePathKey(ctx2));
  });
});

// 测试缓存机制
describe('Hash Cache', () => {
  beforeEach(() => {
    clearHashCache();
  });
  
  test('缓存命中', async () => {
    const ctx = testCases[0].context;
    const pathKey = buildImagePathKey(ctx);
    
    // 第一次调用应该计算并缓存
    const hash1 = await getStableImageHash(pathKey);
    expect(hash1).toBeTruthy();
    expect(getCachedHash(pathKey)).toBe(hash1);
    
    // 第二次调用应该直接返回缓存值
    const hash2 = await getStableImageHash(pathKey);
    expect(hash2).toBe(hash1);
  });
  
  test('缓存未命中', async () => {
    const ctx1 = testCases[0].context;
    const ctx2 = testCases[1].context;
    
    const hash1 = await getStileImageHash(buildImagePathKey(ctx1));
    const hash2 = await getStableImageHash(buildImagePathKey(ctx2));
    
    // 不同的路径应该产生不同的哈希
    expect(hash1).not.toBe(hash2);
  });
});

// 测试批量生成
describe('batchGenerateHashes', () => {
  test('批量生成哈希', async () => {
    const contexts = testCases.map(tc => tc.context);
    const results = await batchGenerateHashes(contexts);
    
    expect(results.size).toBe(testCases.length);
    
    // 验证每个结果都存在
    for (const tc of testCases) {
      const pathKey = buildImagePathKey(tc.context);
      expect(results.has(pathKey)).toBe(true);
      expect(results.get(pathKey)).toBeTruthy();
    }
  });
});

// 导出测试数据供其他模块使用
export { testCases };