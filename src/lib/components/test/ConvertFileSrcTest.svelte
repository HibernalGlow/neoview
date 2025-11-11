<script lang="ts">
  import { onMount } from 'svelte';
  import { convertFileSrc } from '@tauri-apps/api/core';

  // 测试状态
  let isRunning = false;
  let testResults: Array<{
    name: string;
    success: boolean;
    input: string;
    output: string;
    error?: string;
    description: string;
  }> = [];

  let summary = {
    total: 0,
    passed: 0,
    failed: 0
  };

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
  async function runTest(testCase: typeof testCases[0]): Promise<void> {
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

      testResults.push({
        name: testCase.name,
        success,
        input: testCase.input,
        output: result,
        error,
        description: testCase.description
      });

    } catch (err) {
      console.error(`❌ 测试异常: ${err}`);
      testResults.push({
        name: testCase.name,
        success: false,
        input: testCase.input,
        output: '',
        error: `异常: ${err}`,
        description: testCase.description
      });
    }
  }

  /**
   * 运行所有测试
   */
  async function runAllTests(): Promise<void> {
    if (isRunning) return;

    isRunning = true;
    testResults = [];
    summary = { total: 0, passed: 0, failed: 0 };

    console.log('🚀 开始 convertFileSrc 函数测试\n');

    try {
      for (const testCase of testCases) {
        await runTest(testCase);
      }

      // 计算总结
      summary.total = testResults.length;
      summary.passed = testResults.filter(r => r.success).length;
      summary.failed = testResults.filter(r => !r.success).length;

      console.log(`\n📊 测试总结:`);
      console.log(`总测试数: ${summary.total}`);
      console.log(`✅ 通过: ${summary.passed}`);
      console.log(`❌ 失败: ${summary.failed}`);

    } catch (err) {
      console.error('测试运行失败:', err);
    } finally {
      isRunning = false;
    }
  }

  /**
   * 测试CSP兼容性
   */
  async function testCSPCompatibility(): Promise<void> {
    console.log('\n🔒 测试CSP兼容性:');

    const testUrls = [
      { url: 'asset://localhost/C:/Users/test/image.jpg', desc: 'asset协议' },
      { url: 'http://asset.localhost/C:/Users/test/image.jpg', desc: 'http asset协议' }
    ];

    for (const { url, desc } of testUrls) {
      console.log(`🔍 测试URL (${desc}): ${url}`);

      try {
        const img = new Image();
        img.src = url;

        await new Promise<void>((resolve) => {
          img.onload = () => {
            console.log(`✅ 图片加载成功 (${desc})`);
            resolve();
          };
          img.onerror = (e) => {
            console.log(`❌ 图片加载失败 (${desc}): ${e.type}`);
            resolve();
          };
          setTimeout(() => {
            console.log(`⏰ 加载超时 (${desc})`);
            resolve();
          }, 2000);
        });
      } catch (err) {
        console.log(`❌ 创建图片元素失败 (${desc}): ${err}`);
      }
    }
  }

  /**
   * 清除测试结果
   */
  function clearResults(): void {
    testResults = [];
    summary = { total: 0, passed: 0, failed: 0 };
  }

  // 组件挂载时自动运行测试
  onMount(() => {
    console.log('🎯 convertFileSrc 测试组件已加载');
  });
</script>

<div class="convertfilesrc-test">
  <h2>🔍 convertFileSrc 函数测试</h2>

  <div class="test-controls">
    <button
      class="test-button primary"
      on:click={runAllTests}
      disabled={isRunning}
    >
      {#if isRunning}
        🏃 运行中...
      {:else}
        🚀 运行所有测试
      {/if}
    </button>

    <button
      class="test-button secondary"
      on:click={testCSPCompatibility}
      disabled={isRunning}
    >
      🔒 测试CSP兼容性
    </button>

    <button
      class="test-button danger"
      on:click={clearResults}
      disabled={isRunning}
    >
      🗑️ 清除结果
    </button>
  </div>

  {#if summary.total > 0}
    <div class="test-summary">
      <h3>📊 测试总结</h3>
      <div class="summary-stats">
        <div class="stat">
          <span class="stat-label">总测试数:</span>
          <span class="stat-value">{summary.total}</span>
        </div>
        <div class="stat passed">
          <span class="stat-label">✅ 通过:</span>
          <span class="stat-value">{summary.passed}</span>
        </div>
        <div class="stat failed">
          <span class="stat-label">❌ 失败:</span>
          <span class="stat-value">{summary.failed}</span>
        </div>
      </div>
    </div>
  {/if}

  {#if testResults.length > 0}
    <div class="test-results">
      <h3>📋 测试结果详情</h3>

      {#each testResults as result}
        <div class="test-result {result.success ? 'success' : 'failure'}">
          <div class="result-header">
            <span class="result-icon">{result.success ? '✅' : '❌'}</span>
            <span class="result-name">{result.name}</span>
          </div>

          <div class="result-details">
            <div class="result-description">{result.description}</div>
            <div class="result-input">
              <strong>输入:</strong>
              <code>{result.input}</code>
            </div>
            <div class="result-output">
              <strong>输出:</strong>
              <code>{result.output}</code>
            </div>
            {#if result.error}
              <div class="result-error">
                <strong>错误:</strong>
                <span class="error-text">{result.error}</span>
              </div>
            {/if}
          </div>
        </div>
      {/each}
    </div>
  {/if}
</div>

<style>
  .convertfilesrc-test {
    padding: 20px;
    max-width: 1000px;
    margin: 0 auto;
  }

  h2 {
    color: #333;
    border-bottom: 2px solid #007acc;
    padding-bottom: 10px;
    margin-bottom: 20px;
  }

  .test-controls {
    display: flex;
    gap: 10px;
    margin-bottom: 20px;
    flex-wrap: wrap;
  }

  .test-button {
    padding: 10px 20px;
    border: none;
    border-radius: 5px;
    cursor: pointer;
    font-weight: bold;
    transition: background-color 0.2s;
  }

  .test-button:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .test-button.primary {
    background-color: #007acc;
    color: white;
  }

  .test-button.primary:hover:not(:disabled) {
    background-color: #005aa3;
  }

  .test-button.secondary {
    background-color: #28a745;
    color: white;
  }

  .test-button.secondary:hover:not(:disabled) {
    background-color: #218838;
  }

  .test-button.danger {
    background-color: #dc3545;
    color: white;
  }

  .test-button.danger:hover:not(:disabled) {
    background-color: #c82333;
  }

  .test-summary {
    background-color: #f8f9fa;
    padding: 15px;
    border-radius: 5px;
    margin-bottom: 20px;
    border: 1px solid #dee2e6;
  }

  .test-summary h3 {
    margin-top: 0;
    color: #495057;
  }

  .summary-stats {
    display: flex;
    gap: 20px;
    flex-wrap: wrap;
  }

  .stat {
    display: flex;
    align-items: center;
    gap: 5px;
  }

  .stat-label {
    font-weight: bold;
  }

  .stat-value {
    font-size: 1.2em;
    font-weight: bold;
  }

  .stat.passed {
    color: #28a745;
  }

  .stat.failed {
    color: #dc3545;
  }

  .test-results {
    margin-top: 20px;
  }

  .test-results h3 {
    color: #495057;
    margin-bottom: 15px;
  }

  .test-result {
    border: 1px solid #dee2e6;
    border-radius: 5px;
    margin-bottom: 15px;
    overflow: hidden;
  }

  .test-result.success {
    border-color: #28a745;
    background-color: #d4edda;
  }

  .test-result.failure {
    border-color: #dc3545;
    background-color: #f8d7da;
  }

  .result-header {
    background-color: rgba(255, 255, 255, 0.8);
    padding: 10px 15px;
    display: flex;
    align-items: center;
    gap: 10px;
    font-weight: bold;
  }

  .result-icon {
    font-size: 1.2em;
  }

  .result-details {
    padding: 15px;
  }

  .result-description {
    margin-bottom: 10px;
    font-style: italic;
    color: #666;
  }

  .result-input,
  .result-output,
  .result-error {
    margin-bottom: 8px;
  }

  code {
    background-color: #f8f9fa;
    padding: 2px 4px;
    border-radius: 3px;
    font-family: 'Courier New', monospace;
    word-break: break-all;
  }

  .result-error {
    color: #721c24;
  }

  .error-text {
    color: #721c24;
    font-weight: bold;
  }
</style>