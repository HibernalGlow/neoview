import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const preloadCalls: Array<{ keys: string[]; priority: string }> = [];
const invokeMock = vi.fn();
const adaptiveConfigMock = vi.fn(async () => ({
  preloadAhead: 3,
  preloadBehind: 1,
  maxConcurrentLoads: 2,
}));

vi.mock('./imagePool', () => ({
  imagePool: {
    preload: (keys: string[], priority: string) => {
      preloadCalls.push({ keys, priority });
    },
    cancelPreload: vi.fn(),
  },
}));

vi.mock('$lib/utils/systemCapabilities', () => ({
  getAdaptiveConfig: () => adaptiveConfigMock(),
}));

vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args: unknown[]) => invokeMock(...(args as [])),
}));

vi.mock('$lib/utils/perfMonitor', () => ({
  perfMonitor: {
    record: vi.fn(),
  },
}));

interface NavigationStep {
  page: number;
  dtMs: number;
}

interface PreloaderSweepResult {
  ahead: number;
  behind: number;
  hitRate: number;
  avgKeysPerStep: number;
}

interface IpcSweepResult {
  batchWindowMs: number;
  maxBatchSize: number;
  throughput: number;
  p95Latency: number;
  invokeCount: number;
  batchInvokeCount: number;
}

const NAV_SEQUENCE: NavigationStep[] = [
  { page: 100, dtMs: 0 },
  { page: 101, dtMs: 90 },
  { page: 102, dtMs: 80 },
  { page: 104, dtMs: 70 },
  { page: 107, dtMs: 65 },
  { page: 108, dtMs: 75 },
  { page: 109, dtMs: 70 },
  { page: 106, dtMs: 120 },
  { page: 105, dtMs: 95 },
  { page: 106, dtMs: 90 },
  { page: 107, dtMs: 85 },
  { page: 110, dtMs: 65 },
  { page: 113, dtMs: 60 },
  { page: 116, dtMs: 60 },
  { page: 117, dtMs: 70 },
  { page: 118, dtMs: 80 },
  { page: 115, dtMs: 130 },
  { page: 114, dtMs: 110 },
  { page: 115, dtMs: 90 },
  { page: 116, dtMs: 80 },
];

const PRELOADER_MATRIX: Array<{ ahead: number; behind: number }> = [
  { ahead: 2, behind: 1 },
  { ahead: 3, behind: 1 },
  { ahead: 4, behind: 1 },
  { ahead: 5, behind: 2 },
  { ahead: 6, behind: 2 },
];

const IPC_MATRIX: Array<{ batchWindowMs: number; maxBatchSize: number }> = [
  { batchWindowMs: 8, maxBatchSize: 8 },
  { batchWindowMs: 12, maxBatchSize: 12 },
  { batchWindowMs: 20, maxBatchSize: 16 },
  { batchWindowMs: 32, maxBatchSize: 24 },
  { batchWindowMs: 48, maxBatchSize: 32 },
];

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.floor((p / 100) * sorted.length)));
  return sorted[idx];
}

async function runPreloaderScenario(ahead: number, behind: number): Promise<PreloaderSweepResult> {
  vi.resetModules();
  preloadCalls.length = 0;

  adaptiveConfigMock.mockResolvedValueOnce({
    preloadAhead: ahead,
    preloadBehind: behind,
    maxConcurrentLoads: 2,
  });

  const mod = await import('./preloader');
  const preloader = mod.preloader;

  await preloader.init();
  preloader.setTotalPages(5000);
  preloader.setPageKeyFn((page) => `p-${page}`);
  preloader.clear();

  let now = new Date('2026-03-27T00:00:00.000Z').getTime();
  vi.setSystemTime(now);

  let hitCount = 0;
  let totalPredictions = 0;
  let totalKeys = 0;
  let callCursor = 0;

  for (let i = 0; i < NAV_SEQUENCE.length - 1; i++) {
    now += NAV_SEQUENCE[i].dtMs;
    vi.setSystemTime(now);

    preloader.updateQueue(NAV_SEQUENCE[i].page);

    const stepCalls = preloadCalls.slice(callCursor);
    callCursor = preloadCalls.length;
    const preloaded = new Set(stepCalls.flatMap((item) => item.keys));
    totalKeys += preloaded.size;

    const expectedNextKey = `p-${NAV_SEQUENCE[i + 1].page}`;
    if (preloaded.has(expectedNextKey)) {
      hitCount += 1;
    }
    totalPredictions += 1;
  }

  return {
    ahead,
    behind,
    hitRate: totalPredictions > 0 ? hitCount / totalPredictions : 0,
    avgKeysPerStep: totalPredictions > 0 ? totalKeys / totalPredictions : 0,
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runIpcScenario(batchWindowMs: number, maxBatchSize: number): Promise<IpcSweepResult> {
  vi.resetModules();
  invokeMock.mockReset();

  invokeMock.mockImplementation(async (command: string, args?: Record<string, unknown>) => {
    if (command.startsWith('batch_')) {
      const requests = (args?.requests as Array<Record<string, unknown>> | undefined) ?? [];
      return requests.map((req) => ({ ok: true, req }));
    }
    return { ok: true };
  });

  const mod = await import('./ipcBatcher');
  const ipcBatcher = mod.ipcBatcher;

  ipcBatcher.cancelAll();
  ipcBatcher.setConfig({
    batchWindowMs,
    maxBatchSize,
    maxRetries: 0,
    retryDelays: [0],
  });

  const waves = 12;
  const perWave = 15;
  const gapMs = 10;
  const latencies: number[] = [];
  const started = performance.now();
  const tasks: Promise<unknown>[] = [];

  for (let w = 0; w < waves; w++) {
    for (let i = 0; i < perWave; i++) {
      const t0 = performance.now();
      const requestId = w * perWave + i;
      tasks.push(
        ipcBatcher
          .queueRequest('load_page_meta', {
            requestId,
            page: 100 + requestId,
          })
          .then((res) => {
            latencies.push(performance.now() - t0);
            return res;
          })
      );
    }
    await sleep(gapMs);
  }

  await Promise.all(tasks);
  const elapsedMs = performance.now() - started;
  const totalRequests = waves * perWave;

  const batchInvokeCount = invokeMock.mock.calls.filter(
    (c) => typeof c?.[0] === 'string' && (c[0] as string).startsWith('batch_')
  ).length;

  return {
    batchWindowMs,
    maxBatchSize,
    throughput: totalRequests / Math.max(elapsedMs / 1000, Number.EPSILON),
    p95Latency: percentile(latencies, 95),
    invokeCount: invokeMock.mock.calls.length,
    batchInvokeCount,
  };
}

describe('reading experience parameter sweep', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-27T00:00:00.000Z'));
    preloadCalls.length = 0;
    invokeMock.mockReset();
    adaptiveConfigMock.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should rank preloader window configs by hit rate and cost', async () => {
    const results: PreloaderSweepResult[] = [];
    for (const cfg of PRELOADER_MATRIX) {
      results.push(await runPreloaderScenario(cfg.ahead, cfg.behind));
    }

    results.sort((a, b) => {
      if (b.hitRate !== a.hitRate) return b.hitRate - a.hitRate;
      return a.avgKeysPerStep - b.avgKeysPerStep;
    });

    console.log('[PERF][preloader][ranking] best -> worst');
    for (let i = 0; i < results.length; i++) {
      const item = results[i];
      console.log(
        `[PERF][preloader][rank ${i + 1}] ahead=${item.ahead} behind=${item.behind} hitRate=${(
          item.hitRate * 100
        ).toFixed(2)}% avgKeysPerStep=${item.avgKeysPerStep.toFixed(2)}`
      );
    }

    expect(results.length).toBeGreaterThan(0);
    expect(results[0].hitRate).toBeGreaterThan(0);
  });

  it('should rank ipc batching configs by p95 latency and throughput', async () => {
    vi.useRealTimers();
    const results: IpcSweepResult[] = [];
    for (const cfg of IPC_MATRIX) {
      results.push(await runIpcScenario(cfg.batchWindowMs, cfg.maxBatchSize));
    }

    results.sort((a, b) => {
      if (a.p95Latency !== b.p95Latency) return a.p95Latency - b.p95Latency;
      return b.throughput - a.throughput;
    });

    console.log('[PERF][ipc][ranking] best -> worst');
    for (let i = 0; i < results.length; i++) {
      const item = results[i];
      console.log(
        `[PERF][ipc][rank ${i + 1}] batchWindowMs=${item.batchWindowMs} maxBatchSize=${item.maxBatchSize} p95LatencyMs=${item.p95Latency.toFixed(
          2
        )} throughput=${item.throughput.toFixed(2)} req/s invokeCount=${item.invokeCount} batchInvokeCount=${item.batchInvokeCount}`
      );
    }

    expect(results.length).toBeGreaterThan(0);
    expect(results[0].p95Latency).toBeGreaterThanOrEqual(0);
  });
});
