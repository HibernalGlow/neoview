#!/usr/bin/env node

/**
 * convertFileSrc 独立测试脚本
 * 用于在NeoView环境中测试convertFileSrc函数
 */

console.log('🎯 convertFileSrc 独立测试脚本');
console.log('================================');

// 模拟测试用例
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
  }
];

/**
 * 模拟convertFileSrc函数（在实际Tauri环境中会被替换）
 */
function mockConvertFileSrc(filePath) {
  // 这是一个简化的模拟，实际的convertFileSrc会将file:// URL转换为asset:// URL
  if (filePath.startsWith('file://')) {
    return filePath.replace('file://', 'asset://localhost/');
  }

  // 对于Windows路径，转换为asset URL
  if (filePath.includes(':\\') || filePath.startsWith('\\\\')) {
    return `asset://localhost/${filePath.replace(/\\/g, '/')}`;
  }

  // 对于相对路径
  return `asset://localhost/${filePath.replace(/\\/g, '/')}`;
}

/**
 * 运行单个测试用例
 */
function runTest(testCase) {
  console.log(`\n🧪 运行测试: ${testCase.name}`);
  console.log(`📝 描述: ${testCase.description}`);
  console.log(`📥 输入: ${testCase.input}`);

  try {
    const result = mockConvertFileSrc(testCase.input);
    console.log(`📤 输出: ${result}`);

    let success = true;
    let error = null;

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

    return { success, error, result };

  } catch (err) {
    console.error(`❌ 测试异常: ${err}`);
    return { success: false, error: `异常: ${err}`, result: null };
  }
}

/**
 * 运行所有测试
 */
function runAllTests() {
  console.log('🚀 开始 convertFileSrc 函数测试\n');

  const results = [];
  let passed = 0;
  let failed = 0;

  for (const testCase of testCases) {
    const result = runTest(testCase);
    results.push({ ...result, name: testCase.name });

    if (result.success) {
      passed++;
    } else {
      failed++;
    }
  }

  const total = testCases.length;
  const successRate = Math.round((passed / total) * 100);

  console.log(`\n📊 测试总结:`);
  console.log(`总测试数: ${total}`);
  console.log(`✅ 通过: ${passed}`);
  console.log(`❌ 失败: ${failed}`);
  console.log(`📈 成功率: ${successRate}%`);

  if (failed > 0) {
    console.log('\n❌ 失败的测试:');
    results.filter(r => !r.success).forEach(result => {
      console.log(`- ${result.name}: ${result.error}`);
    });
  }

  return { total, passed, failed, successRate };
}

// 检查命令行参数
const args = process.argv.slice(2);
if (args.includes('--test') || args.includes('-t')) {
  // 运行测试
  const summary = runAllTests();
  process.exit(summary.failed > 0 ? 1 : 0);
} else {
  // 显示帮助信息
  console.log('用法:');
  console.log('  node convertFileSrc-test.js --test    运行所有测试');
  console.log('  node convertFileSrc-test.js -t       运行所有测试');
  console.log('');
  console.log('说明:');
  console.log('  此脚本用于测试convertFileSrc函数的模拟实现');
  console.log('  在实际Tauri应用中，convertFileSrc会将本地文件路径');
  console.log('  转换为可在前端安全使用的asset:// URL');
  console.log('');

  // 运行测试
  runAllTests();
}
