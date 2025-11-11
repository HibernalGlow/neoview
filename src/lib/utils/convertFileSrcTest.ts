/**
 * convertFileSrc 测试运行器
 * 用于在NeoView应用中运行convertFileSrc测试
 */

import { convertFileSrc } from '@tauri-apps/api/core';

// 测试结果接口
export interface ConvertFileSrcTestResult {
  testName: string;
  input: string;
  output: string;
  success: boolean;
  error?: string;
  description: string;
  timestamp: string;
}

// 测试用例
const testCases = [
  {
    name: 'Windows绝对路径转换',
    input: 'C:\\Users\\test\\image.jpg',
    expectedPattern: /^asset:\/\/localhost\/.*$/,
    description: '测试Windows绝对路径转换为asset URL'
  },
  {
    name: '相对路径转换',
    input: 'images\\thumbnail.jpg',
    expectedPattern: /^asset:\/\/localhost\/.*$/,
    description: '测试相对路径转换为asset URL'
  },
  {
    name: '应用数据目录路径',
    input: 'C:\\Users\\username\\AppData\\Roaming\\neoview\\thumbnails\\test.webp',
    expectedPattern: /^asset:\/\/localhost\/.*$/,
    description: '测试应用数据目录中的缩略图路径转换'
  },
  {
    name: 'UNC路径转换',
    input: '\\\\server\\share\\image.png',
    expectedPattern: /^asset:\/\/localhost\/.*$/,
    description: '测试UNC网络路径转换'
  },
  {
    name: '缩略图实际路径',
    input: 'C:\\Users\\username\\AppData\\Roaming\\neoview\\thumbnails\\2024\\11\\11\\image_123.webp',
    expectedPattern: /^asset:\/\/localhost\/.*$/,
    description: '测试实际缩略图文件路径转换'
  }
];

/**
 * 运行单个测试用例
 */
export async function runConvertFileSrcTest(testCase: typeof testCases[0]): Promise<ConvertFileSrcTestResult> {
  const startTime = Date.now();

  try {
    console.log(`🧪 运行测试: ${testCase.name}`);
    console.log(`📝 描述: ${testCase.description}`);
    console.log(`📥 输入: ${testCase.input}`);

    const result = convertFileSrc(testCase.input);
    console.log(`📤 输出: ${result}`);

    let success = true;
    let error: string | undefined;

    // 检查结果是否符合预期模式
    if (testCase.expectedPattern) {
      if (!testCase.expectedPattern.test(result)) {
        success = false;
        error = `输出不符合预期模式。期望匹配 ${testCase.expectedPattern}，实际: ${result}`;
      }
    }

    // 检查结果是否为有效的URL
    try {
      new URL(result);
      console.log('✅ 输出是有效的URL');
    } catch (urlError) {
      success = false;
      error = `输出不是有效的URL: ${urlError}`;
    }

    // 检查URL是否以asset://开头
    if (!result.startsWith('asset://')) {
      success = false;
      error = `输出不是asset协议URL: ${result}`;
    }

    console.log(`✅ 测试结果: ${success ? '通过' : '失败'}`);
    if (error) {
      console.error(`❌ 错误: ${error}`);
    }

    return {
      testName: testCase.name,
      input: testCase.input,
      output: result,
      success,
      error,
      description: testCase.description,
      timestamp: new Date().toISOString()
    };

  } catch (err) {
    console.error(`❌ 测试异常: ${err}`);
    return {
      testName: testCase.name,
      input: testCase.input,
      output: '',
      success: false,
      error: `异常: ${err}`,
      description: testCase.description,
      timestamp: new Date().toISOString()
    };
  }
}

/**
 * 运行所有convertFileSrc测试
 */
export async function runAllConvertFileSrcTests(): Promise<{
  results: ConvertFileSrcTestResult[];
  summary: {
    total: number;
    passed: number;
    failed: number;
    duration: number;
  };
}> {
  const startTime = Date.now();
  const results: ConvertFileSrcTestResult[] = [];

  console.log('🚀 开始 convertFileSrc 函数测试\n');

  for (const testCase of testCases) {
    const result = await runConvertFileSrcTest(testCase);
    results.push(result);
  }

  const duration = Date.now() - startTime;
  const passed = results.filter(r => r.success).length;
  const failed = results.filter(r => !r.success).length;
  const total = results.length;

  console.log(`\n📊 测试总结:`);
  console.log(`总测试数: ${total}`);
  console.log(`✅ 通过: ${passed}`);
  console.log(`❌ 失败: ${failed}`);
  console.log(`⏱️ 总耗时: ${duration}ms`);

  if (failed > 0) {
    console.log('\n❌ 失败的测试:');
    results.filter(r => !r.success).forEach(result => {
      console.log(`- ${result.testName}: ${result.error}`);
    });
  }

  return {
    results,
    summary: {
      total,
      passed,
      failed,
      duration
    }
  };
}

/**
 * 测试CSP兼容性
 */
export async function testCSPCompatibility(): Promise<{
  results: Array<{
    url: string;
    description: string;
    accessible: boolean;
    error?: string;
  }>;
}> {
  console.log('\n🔒 测试CSP兼容性:');

  const testUrls = [
    { url: 'asset://localhost/C:/Users/test/image.jpg', desc: 'asset协议' },
    { url: 'http://asset.localhost/C:/Users/test/image.jpg', desc: 'http asset协议' }
  ];

  const results = [];

  for (const { url, desc } of testUrls) {
    console.log(`🔍 测试URL (${desc}): ${url}`);

    try {
      const img = new Image();
      img.src = url;

      const accessible = await new Promise<boolean>((resolve) => {
        img.onload = () => {
          console.log(`✅ 图片加载成功 (${desc})`);
          resolve(true);
        };
        img.onerror = (e) => {
          const errorType = (e && typeof e === 'object' && 'type' in e) ? e.type : '未知错误';
          console.log(`❌ 图片加载失败 (${desc}): ${errorType}`);
          resolve(false);
        };
        setTimeout(() => {
          console.log(`⏰ 加载超时 (${desc})`);
          resolve(false);
        }, 2000);
      });

      results.push({
        url,
        description: desc,
        accessible,
        error: accessible ? undefined : '图片加载失败'
      });

    } catch (err) {
      console.log(`❌ 创建图片元素失败 (${desc}): ${err}`);
      results.push({
        url,
        description: desc,
        accessible: false,
        error: `创建图片元素失败: ${err}`
      });
    }
  }

  return { results };
}

// 默认导出主要测试函数
export default {
  runAllTests: runAllConvertFileSrcTests,
  runSingleTest: runConvertFileSrcTest,
  testCSPCompatibility
};