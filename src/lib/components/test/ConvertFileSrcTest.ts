/**
 * convertFileSrc 函数测试
 * 测试本地文件路径转换为前端URL的功能
 */

import { convertFileSrc } from '@tauri-apps/api/core';

// 测试用例
interface TestCase {
    name: string;
    input: string;
    expectedPattern?: RegExp;
    description: string;
}

// 测试用例定义
const testCases: TestCase[] = [
    {
        name: '基本文件路径转换',
        input: 'C:\\Users\\test\\image.jpg',
        expectedPattern: /^asset:\/\/localhost\/.*$/,
        description: '测试Windows绝对路径转换'
    },
    {
        name: '相对路径转换',
        input: 'images\\thumbnail.jpg',
        expectedPattern: /^asset:\/\/localhost\/.*$/,
        description: '测试相对路径转换'
    },
    {
        name: '应用数据目录路径',
        input: 'C:\\Users\\username\\AppData\\Roaming\\neoview\\thumbnails\\test.webp',
        expectedPattern: /^asset:\/\/localhost\/.*$/,
        description: '测试应用数据目录中的缩略图路径'
    },
    {
        name: 'UNC路径',
        input: '\\\\server\\share\\image.png',
        expectedPattern: /^asset:\/\/localhost\/.*$/,
        description: '测试UNC网络路径转换'
    }
];

// 测试结果接口
interface TestResult {
    testName: string;
    input: string;
    output: string;
    success: boolean;
    error?: string;
    description: string;
}

/**
 * 运行单个测试用例
 */
async function runTest(testCase: TestCase): Promise<TestResult> {
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
                error = `输出不符合预期模式。期望: ${testCase.expectedPattern}, 实际: ${result}`;
            }
        }

        // 检查结果是否为有效的URL
        try {
            new URL(result);
        } catch (urlError) {
            success = false;
            error = `输出不是有效的URL: ${urlError}`;
        }

        console.log(`✅ 测试结果: ${success ? '通过' : '失败'}`);
        if (error) {
            console.error(`❌ 错误: ${error}`);
        }
        console.log('---');

        return {
            testName: testCase.name,
            input: testCase.input,
            output: result,
            success,
            error,
            description: testCase.description
        };

    } catch (err) {
        console.error(`❌ 测试异常: ${err}`);
        return {
            testName: testCase.name,
            input: testCase.input,
            output: '',
            success: false,
            error: `异常: ${err}`,
            description: testCase.description
        };
    }
}

/**
 * 运行所有测试
 */
async function runAllTests(): Promise<void> {
    console.log('🚀 开始 convertFileSrc 函数测试\n');

    const results: TestResult[] = [];

    for (const testCase of testCases) {
        const result = await runTest(testCase);
        results.push(result);
    }

    // 输出测试总结
    console.log('\n📊 测试总结:');
    console.log('='.repeat(50));

    const passed = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;

    console.log(`总测试数: ${results.length}`);
    console.log(`✅ 通过: ${passed}`);
    console.log(`❌ 失败: ${failed}`);

    if (failed > 0) {
        console.log('\n❌ 失败的测试:');
        results.filter(r => !r.success).forEach(result => {
            console.log(`- ${result.testName}: ${result.error}`);
        });
    }

    // 输出详细信息
    console.log('\n📋 详细结果:');
    results.forEach(result => {
        console.log(`${result.success ? '✅' : '❌'} ${result.testName}`);
        console.log(`   输入: ${result.input}`);
        console.log(`   输出: ${result.output}`);
        if (result.error) {
            console.log(`   错误: ${result.error}`);
        }
        console.log('');
    });
}

/**
 * 测试实际的缩略图路径
 */
async function testThumbnailPaths(): Promise<void> {
    console.log('\n🖼️ 测试实际缩略图路径:');

    // 模拟一些常见的缩略图路径
    const thumbnailPaths = [
        'C:\\Users\\username\\AppData\\Roaming\\neoview\\thumbnails\\2024\\11\\11\\image_123.webp',
        'C:\\temp\\neoview_thumbnails_test\\2024\\11\\11\\folder_thumb.webp',
        'D:\\Images\\thumbnails\\photo.webp'
    ];

    for (const path of thumbnailPaths) {
        try {
            const converted = convertFileSrc(path);
            console.log(`📁 ${path}`);
            console.log(`🔗 ${converted}`);

            // 测试URL是否可访问（这会失败，但我们可以看到URL格式）
            try {
                const response = await fetch(converted, { method: 'HEAD' });
                console.log(`🌐 HTTP状态: ${response.status}`);
            } catch (fetchError) {
                console.log(`🌐 访问测试: 预期失败 (CSP限制) - ${fetchError}`);
            }

            console.log('');
        } catch (err) {
            console.error(`❌ 转换失败 ${path}: ${err}`);
        }
    }
}

/**
 * 测试CSP兼容性
 */
async function testCSPCompatibility(): Promise<void> {
    console.log('\n🔒 测试CSP兼容性:');

    const testUrls = [
        'asset://localhost/C:/Users/test/image.jpg',
        'http://asset.localhost/C:/Users/test/image.jpg',
        'file:///C:/Users/test/image.jpg'
    ];

    for (const url of testUrls) {
        console.log(`🔍 测试URL: ${url}`);

        try {
            // 尝试创建图片元素来测试CSP
            const img = new Image();
            img.src = url;

            // 监听加载事件
            await new Promise<void>((resolve, reject) => {
                img.onload = () => {
                    console.log(`✅ 图片加载成功`);
                    resolve();
                };
                img.onerror = (e) => {
                    console.log(`❌ 图片加载失败: ${e}`);
                    resolve(); // 不抛出错误，继续测试
                };

                // 设置超时
                setTimeout(() => {
                    console.log(`⏰ 图片加载超时`);
                    resolve();
                }, 2000);
            });
        } catch (err) {
            console.log(`❌ 创建图片元素失败: ${err}`);
        }

        console.log('');
    }
}

// 导出测试函数
export {
    runAllTests,
    testThumbnailPaths,
    testCSPCompatibility,
    runTest
};

// 如果直接运行此文件，执行所有测试
if (typeof window !== 'undefined') {
    // 浏览器环境，等待DOM加载完成
    document.addEventListener('DOMContentLoaded', async () => {
        console.log('🎯 convertFileSrc 测试开始...');
        await runAllTests();
        await testThumbnailPaths();
        await testCSPCompatibility();
        console.log('🎯 测试完成！');
    });
} else {
    // Node.js环境，直接运行
    console.log('🎯 convertFileSrc 测试开始...');
    runAllTests()
        .then(() => testThumbnailPaths())
        .then(() => testCSPCompatibility())
        .then(() => console.log('🎯 测试完成！'))
        .catch(err => console.error('测试失败:', err));
}