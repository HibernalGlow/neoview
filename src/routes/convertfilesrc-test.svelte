<script lang="ts">
  import { onMount } from 'svelte';
  import { convertFileSrc } from '@tauri-apps/api/core';

  // 测试状态
  let isRunning = $state(false);
  let testResults = $state([]);
  let cspResults = $state([]);
  let summary = $state({ total: 0, passed: 0, failed: 0 });

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
  async function runTest(testCase) {
    try {
      console.log(`🧪 运行测试: ${testCase.name}`);
      console.log(`📥 输入: ${testCase.input}`);

      const result = convertFileSrc(testCase.input);
      console.log(`📤 输出: ${result}`);

      let success = true;
      let error = null;

      // 检查结果是否符合预期模式
      if (testCase.expectedPattern && !testCase.expectedPattern.test(result)) {
        success = false;
        error = `输出不符合预期模式。期望匹配 ${testCase.expectedPattern}，实际: ${result}`;
      }

      // 检查结果是否为有效的URL
      try {
        new URL(result);
      } catch (urlError) {
        success = false;
        error = `输出不是有效的URL: ${urlError}`;
      }

      // 检查URL是否以asset://开头
      if (!result.startsWith('asset://')) {
        success = false;
        error = `输出不是asset协议URL: ${result}`;
      }

      return {
        name: testCase.name,
        success,
        input: testCase.input,
        output: result,
        error,
        description: testCase.description
      };

    } catch (err) {
      return {
        name: testCase.name,
        success: false,
        input: testCase.input,
        output: '',
        error: `异常: ${err}`,
        description: testCase.description
      };
    }
  }

  /**
   * 运行所有测试
   */
  async function runAllTests() {
    if (isRunning) return;

    isRunning = true;
    testResults = [];
    summary = { total: 0, passed: 0, failed: 0 };

    console.log('🚀 开始 convertFileSrc 函数测试');

    for (const testCase of testCases) {
      const result = await runTest(testCase);
      testResults.push(result);
    }

    // 计算总结
    summary.total = testResults.length;
    summary.passed = testResults.filter(r => r.success).length;
    summary.failed = testResults.filter(r => !r.success).length;

    isRunning = false;
  }

  /**
   * 测试CSP兼容性
   */
  async function testCSPCompatibility() {
    cspResults = [];
    console.log('🔒 测试CSP兼容性');

    const testUrls = [
      { url: 'asset://localhost/C:/Users/test/image.jpg', desc: 'asset协议' },
      { url: 'http://asset.localhost/C:/Users/test/image.jpg', desc: 'http asset协议' }
    ];

    for (const { url, desc } of testUrls) {
      try {
        const img = new Image();
        img.src = url;

        const result = await new Promise((resolve) => {
          img.onload = () => resolve({ success: true, error: null });
          img.onerror = (e) => resolve({ success: false, error: '图片加载失败' });
          setTimeout(() => resolve({ success: false, error: '加载超时' }), 2000);
        });

        cspResults.push({
          url,
          description: desc,
          success: result.success,
          error: result.error
        });

      } catch (err) {
        cspResults.push({
          url,
          description: desc,
          success: false,
          error: `异常: ${err}`
        });
      }
    }
  }

  /**
   * 清除结果
   */
  function clearResults() {
    testResults = [];
    cspResults = [];
    summary = { total: 0, passed: 0, failed: 0 };
  }

  onMount(() => {
    console.log('🎯 convertFileSrc 测试页面已加载');
  });
</script>

<svelte:head>
  <title>convertFileSrc 函数测试 - NeoView</title>
</svelte:head>

<div class="convertfilesrc-test-page">
  <div class="header">
    <h1>🔍 convertFileSrc 函数测试</h1>
    <p class="description">
      测试 <code>convertFileSrc</code> 函数是否正确地将本地文件路径转换为可在前端使用的URL。
    </p>
  </div>

  <div class="controls">
    <button
      class="btn primary"
      on:click={runAllTests}
      disabled={isRunning}
    >
      {#if isRunning}
        🏃 运行中...
      {:else}
        🚀 运行所有测试
      {/if}
    </button>

    <button class="btn secondary" on:click={testCSPCompatibility}>
      🔒 测试CSP兼容性
    </button>

    <button class="btn danger" on:click={clearResults}>
      🗑️ 清除结果
    </button>
  </div>

  {#if summary.total > 0}
    <div class="summary">
      <h2>📊 测试总结</h2>
      <div class="stats">
        <div class="stat">
          <span class="label">总测试数:</span>
          <span class="value">{summary.total}</span>
        </div>
        <div class="stat passed">
          <span class="label">✅ 通过:</span>
          <span class="value">{summary.passed}</span>
        </div>
        <div class="stat failed">
          <span class="label">❌ 失败:</span>
          <span class="value">{summary.failed}</span>
        </div>
      </div>
    </div>
  {/if}

  {#if testResults.length > 0}
    <div class="results">
      <h2>📋 测试结果详情</h2>

      {#each testResults as result}
        <div class="result-card {result.success ? 'success' : 'failure'}">
          <div class="result-header">
            <span class="icon">{result.success ? '✅' : '❌'}</span>
            <h3>{result.name}</h3>
          </div>

          <div class="result-content">
            <p class="description">{result.description}</p>

            <div class="input-output">
              <div class="input">
                <strong>输入:</strong>
                <code>{result.input}</code>
              </div>
              <div class="output">
                <strong>输出:</strong>
                <code>{result.output}</code>
              </div>
            </div>

            {#if result.error}
              <div class="error">
                <strong>错误:</strong>
                <span>{result.error}</span>
              </div>
            {/if}
          </div>
        </div>
      {/each}
    </div>
  {/if}

  {#if cspResults.length > 0}
    <div class="csp-results">
      <h2>🔒 CSP兼容性测试结果</h2>

      {#each cspResults as result}
        <div class="csp-result {result.success ? 'success' : 'failure'}">
          <div class="csp-header">
            <span class="icon">{result.success ? '✅' : '❌'}</span>
            <strong>{result.description}</strong>
          </div>
          <div class="csp-url">
            <code>{result.url}</code>
          </div>
          {#if result.error}
            <div class="csp-error">{result.error}</div>
          {/if}
        </div>
      {/each}
    </div>
  {/if}
</div>

<style>
  .convertfilesrc-test-page {
    max-width: 1200px;
    margin: 0 auto;
    padding: 20px;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  }

  .header {
    text-align: center;
    margin-bottom: 30px;
  }

  .header h1 {
    color: #333;
    margin-bottom: 10px;
  }

  .description {
    color: #666;
    font-size: 16px;
  }

  code {
    background: #f4f4f4;
    padding: 2px 6px;
    border-radius: 3px;
    font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
  }

  .controls {
    display: flex;
    gap: 10px;
    margin-bottom: 30px;
    justify-content: center;
    flex-wrap: wrap;
  }

  .btn {
    padding: 12px 24px;
    border: none;
    border-radius: 6px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s;
    font-size: 14px;
  }

  .btn:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .btn.primary {
    background: #007acc;
    color: white;
  }

  .btn.primary:hover:not(:disabled) {
    background: #005aa3;
  }

  .btn.secondary {
    background: #28a745;
    color: white;
  }

  .btn.secondary:hover {
    background: #218838;
  }

  .btn.danger {
    background: #dc3545;
    color: white;
  }

  .btn.danger:hover {
    background: #c82333;
  }

  .summary {
    background: #f8f9fa;
    padding: 20px;
    border-radius: 8px;
    margin-bottom: 30px;
    border: 1px solid #dee2e6;
  }

  .summary h2 {
    margin-top: 0;
    color: #495057;
  }

  .stats {
    display: flex;
    gap: 30px;
    justify-content: center;
    flex-wrap: wrap;
  }

  .stat {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .stat .label {
    font-weight: 600;
    color: #495057;
  }

  .stat .value {
    font-size: 24px;
    font-weight: bold;
  }

  .stat.passed .value {
    color: #28a745;
  }

  .stat.failed .value {
    color: #dc3545;
  }

  .results, .csp-results {
    margin-bottom: 30px;
  }

  .results h2, .csp-results h2 {
    color: #495057;
    margin-bottom: 20px;
  }

  .result-card, .csp-result {
    border: 1px solid #dee2e6;
    border-radius: 8px;
    margin-bottom: 15px;
    overflow: hidden;
  }

  .result-card.success {
    border-color: #28a745;
    background: #d4edda;
  }

  .result-card.failure {
    border-color: #dc3545;
    background: #f8d7da;
  }

  .csp-result.success {
    border-color: #28a745;
    background: #d4edda;
  }

  .csp-result.failure {
    border-color: #dc3545;
    background: #f8d7da;
  }

  .result-header, .csp-header {
    background: rgba(255, 255, 255, 0.8);
    padding: 15px;
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .result-header h3, .csp-header strong {
    margin: 0;
    font-size: 16px;
  }

  .icon {
    font-size: 20px;
  }

  .result-content, .csp-url, .csp-error {
    padding: 15px;
  }

  .result-content .description {
    color: #666;
    margin-bottom: 15px;
    font-style: italic;
  }

  .input-output {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 15px;
    margin-bottom: 15px;
  }

  .input, .output {
    background: rgba(255, 255, 255, 0.6);
    padding: 10px;
    border-radius: 4px;
  }

  .input code, .output code {
    word-break: break-all;
    display: block;
    margin-top: 5px;
  }

  .error, .csp-error {
    background: rgba(255, 255, 255, 0.8);
    padding: 10px;
    border-radius: 4px;
    border-left: 4px solid #dc3545;
  }

  .error strong, .csp-error {
    color: #721c24;
  }

  @media (max-width: 768px) {
    .input-output {
      grid-template-columns: 1fr;
    }

    .stats {
      flex-direction: column;
      align-items: center;
    }

    .controls {
      flex-direction: column;
      align-items: center;
    }
  }
</style>