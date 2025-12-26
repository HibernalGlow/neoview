<script lang="ts">
/**
 * GitHub Gist 同步配置面板
 * 支持登录、上传、下载设置到 GitHub Gist
 */
import { Button } from '$lib/components/ui/button';
import { Input } from '$lib/components/ui/input';
import { Label } from '$lib/components/ui/label';
import Switch from '$lib/components/ui/switch/switch.svelte';
import { gistSyncStore, type GistResponse } from '$lib/stores/gistSync.svelte';
import { settingsManager as exportManager, type FullExportPayload } from '$lib/stores/settingsManager';
import {
	Github,
	LogIn,
	LogOut,
	Upload,
	Download,
	RefreshCw,
	CheckCircle,
	XCircle,
	Loader2,
	ExternalLink,
	Copy,
	Check,
	Cloud,
	CloudOff,
	Key,
	Settings,
	List,
	Link
} from '@lucide/svelte';
import { toast } from 'svelte-sonner';
import { onMount, onDestroy } from 'svelte';

// 状态
let tokenInput = $state('');
let gistIdInput = $state('');
let showToken = $state(false);
let isLoggingIn = $state(false);
let isSyncing = $state(false);
let copiedToken = $state(false);
let copiedGistId = $state(false);
let userGists = $state<GistResponse[]>([]);
let loadingGists = $state(false);
let showGistList = $state(false);

// 从 store 获取响应式状态
let config = $derived(gistSyncStore.config);
let status = $derived(gistSyncStore.status);
let statusMessage = $derived(gistSyncStore.statusMessage);
let user = $derived(gistSyncStore.user);
let isLoggedIn = $derived(gistSyncStore.isLoggedIn);

// 格式化时间
function formatTime(timestamp: number): string {
	if (!timestamp) return '从未';
	const date = new Date(timestamp);
	return date.toLocaleString('zh-CN', {
		year: 'numeric',
		month: '2-digit',
		day: '2-digit',
		hour: '2-digit',
		minute: '2-digit'
	});
}

// 登录
async function handleLogin() {
	if (!tokenInput.trim()) {
		toast.error('请输入 GitHub Personal Access Token');
		return;
	}

	isLoggingIn = true;
	const result = await gistSyncStore.login(tokenInput.trim());
	isLoggingIn = false;

	if (result.success) {
		toast.success(result.message);
		tokenInput = '';
	} else {
		toast.error(result.message);
	}
}

// 登出
function handleLogout() {
	gistSyncStore.logout();
	toast.info('已退出登录');
}

// 上传设置到 Gist
async function handleUpload() {
	isSyncing = true;
	try {
		const payload = exportManager.buildFullPayload({
			includeNativeSettings: true,
			includeExtendedData: true
		});

		if (!payload) {
			toast.error('没有可上传的数据');
			return;
		}

		const content = JSON.stringify(payload, null, 2);
		const result = await gistSyncStore.updateGist(content);

		if (result.success) {
			toast.success(result.message);
		} else {
			toast.error(result.message);
		}
	} catch (e) {
		toast.error(`上传失败: ${e}`);
	} finally {
		isSyncing = false;
	}
}

// 从 Gist 下载设置
async function handleDownload() {
	isSyncing = true;
	try {
		const result = await gistSyncStore.downloadFromGist();

		if (result.success && result.content) {
			const payload = JSON.parse(result.content) as FullExportPayload;
			
			// 应用设置
			await exportManager.applyFullPayload(payload, {
				importNativeSettings: true,
				modules: {
					nativeSettings: true,
					keybindings: true,
					emmConfig: true,
					fileBrowserSort: true,
					uiState: true,
					panelsLayout: true,
					bookmarks: true,
					history: false,
					historySettings: true,
					searchHistory: false,
					upscaleSettings: true,
					customThemes: true,
					performanceSettings: true
				},
				strategy: 'merge'
			});

			toast.success('设置已从 Gist 恢复，部分设置可能需要重启生效');
		} else {
			toast.error(result.message);
		}
	} catch (e) {
		toast.error(`下载失败: ${e}`);
	} finally {
		isSyncing = false;
	}
}

// 加载用户 Gist 列表
async function loadUserGists() {
	loadingGists = true;
	userGists = await gistSyncStore.listUserGists();
	loadingGists = false;
}

// 选择现有 Gist
async function selectGist(gist: GistResponse) {
	const result = await gistSyncStore.useGist(gist.id);
	if (result.success) {
		toast.success(`已关联 Gist: ${gist.description || gist.id}`);
		showGistList = false;
	} else {
		toast.error(result.message);
	}
}

// 使用手动输入的 Gist ID
async function handleUseGistId() {
	if (!gistIdInput.trim()) {
		toast.error('请输入 Gist ID');
		return;
	}

	const result = await gistSyncStore.useGist(gistIdInput.trim());
	if (result.success) {
		toast.success(result.message);
		gistIdInput = '';
	} else {
		toast.error(result.message);
	}
}

// 复制到剪贴板
async function copyToClipboard(text: string, type: 'token' | 'gistId') {
	try {
		await navigator.clipboard.writeText(text);
		if (type === 'token') {
			copiedToken = true;
			setTimeout(() => (copiedToken = false), 2000);
		} else {
			copiedGistId = true;
			setTimeout(() => (copiedGistId = false), 2000);
		}
	} catch {
		toast.error('复制失败');
	}
}

// 打开 GitHub 链接
function openGitHubTokenPage() {
	window.open('https://github.com/settings/tokens/new?scopes=gist&description=NeoView%20Settings%20Sync', '_blank');
}

function openGistPage() {
	if (config.gistId) {
		window.open(`https://gist.github.com/${config.gistId}`, '_blank');
	}
}

// 更新配置
function updateAutoSync(checked: boolean) {
	gistSyncStore.updateConfig({ autoSync: checked });
}

function updateSyncOnChange(checked: boolean) {
	gistSyncStore.updateConfig({ syncOnChange: checked });
}

function updateSyncInterval(e: Event) {
	const value = parseInt((e.target as HTMLInputElement).value);
	if (value >= 1) {
		gistSyncStore.updateConfig({ syncInterval: value });
	}
}

function updateIsPublic(checked: boolean) {
	gistSyncStore.updateConfig({ isPublic: checked });
}

function updateDescription(e: Event) {
	gistSyncStore.updateConfig({ description: (e.target as HTMLInputElement).value });
}

// 自动同步事件监听
function handleAutoSync() {
	if (isLoggedIn && !isSyncing) {
		handleUpload();
	}
}

onMount(() => {
	window.addEventListener('gist-auto-sync', handleAutoSync);
});

onDestroy(() => {
	window.removeEventListener('gist-auto-sync', handleAutoSync);
});
</script>

<div class="space-y-4 border-t pt-4">
	<!-- 标题 -->
	<div class="flex items-center gap-2">
		<Github class="h-4 w-4 text-muted-foreground" />
		<Label class="text-sm font-semibold">GitHub Gist 同步</Label>
	</div>
	
	<p class="text-xs text-muted-foreground">
		将设置备份到 GitHub Gist，支持跨设备同步
	</p>

	<!-- 登录状态 -->
	{#if isLoggedIn && user}
		<div class="flex items-center gap-3 rounded-lg border bg-green-500/10 p-3">
			<img src={user.avatar_url} alt={user.login} class="h-10 w-10 rounded-full" />
			<div class="flex-1">
				<p class="font-medium">{user.name || user.login}</p>
				<p class="text-xs text-muted-foreground">@{user.login}</p>
			</div>
			<Button variant="outline" size="sm" onclick={handleLogout}>
				<LogOut class="mr-1 h-4 w-4" />
				退出
			</Button>
		</div>

		<!-- Gist 信息 -->
		<div class="space-y-3">
			<div class="flex items-center justify-between">
				<Label class="text-sm font-medium">关联的 Gist</Label>
				{#if config.gistId}
					<div class="flex items-center gap-2">
						<code class="rounded bg-muted px-2 py-1 text-xs">{config.gistId.slice(0, 8)}...</code>
						<Button variant="ghost" size="icon" class="h-7 w-7" onclick={() => copyToClipboard(config.gistId, 'gistId')}>
							{#if copiedGistId}
								<Check class="h-3 w-3 text-green-500" />
							{:else}
								<Copy class="h-3 w-3" />
							{/if}
						</Button>
						<Button variant="ghost" size="icon" class="h-7 w-7" onclick={openGistPage}>
							<ExternalLink class="h-3 w-3" />
						</Button>
					</div>
				{:else}
					<span class="text-xs text-muted-foreground">未关联</span>
				{/if}
			</div>

			{#if config.lastSyncTime}
				<p class="text-xs text-muted-foreground">
					上次同步: {formatTime(config.lastSyncTime)}
				</p>
			{/if}
		</div>

		<!-- 操作按钮 -->
		<div class="grid grid-cols-2 gap-3">
			<Button onclick={handleUpload} disabled={isSyncing} class="gap-2">
				{#if isSyncing && status === 'syncing'}
					<Loader2 class="h-4 w-4 animate-spin" />
				{:else}
					<Upload class="h-4 w-4" />
				{/if}
				上传到 Gist
			</Button>
			<Button variant="outline" onclick={handleDownload} disabled={isSyncing || !config.gistId} class="gap-2">
				{#if isSyncing && status === 'syncing'}
					<Loader2 class="h-4 w-4 animate-spin" />
				{:else}
					<Download class="h-4 w-4" />
				{/if}
				从 Gist 恢复
			</Button>
		</div>

		<!-- Gist 选择 -->
		<div class="space-y-3 border-t pt-4">
			<div class="flex items-center justify-between">
				<Label class="text-sm font-medium">选择 Gist</Label>
				<Button variant="ghost" size="sm" onclick={() => { showGistList = !showGistList; if (showGistList) loadUserGists(); }}>
					<List class="mr-1 h-4 w-4" />
					{showGistList ? '隐藏列表' : '浏览我的 Gist'}
				</Button>
			</div>

			{#if showGistList}
				<div class="max-h-48 space-y-2 overflow-auto rounded-lg border p-2">
					{#if loadingGists}
						<div class="flex items-center justify-center py-4">
							<Loader2 class="h-5 w-5 animate-spin text-muted-foreground" />
						</div>
					{:else if userGists.length === 0}
						<p class="py-4 text-center text-xs text-muted-foreground">没有找到 Gist</p>
					{:else}
						{#each userGists as gist}
							<button
								class="flex w-full items-center gap-2 rounded-md p-2 text-left hover:bg-accent {config.gistId === gist.id ? 'bg-primary/10' : ''}"
								onclick={() => selectGist(gist)}
							>
								<div class="flex-1 truncate">
									<p class="truncate text-sm font-medium">{gist.description || '(无描述)'}</p>
									<p class="text-xs text-muted-foreground">{Object.keys(gist.files).join(', ')}</p>
								</div>
								{#if config.gistId === gist.id}
									<CheckCircle class="h-4 w-4 text-green-500" />
								{/if}
							</button>
						{/each}
					{/if}
				</div>
			{/if}

			<!-- 手动输入 Gist ID -->
			<div class="flex gap-2">
				<Input
					bind:value={gistIdInput}
					placeholder="或输入 Gist ID..."
					class="flex-1"
				/>
				<Button variant="outline" size="icon" onclick={handleUseGistId} disabled={!gistIdInput.trim()}>
					<Link class="h-4 w-4" />
				</Button>
			</div>
		</div>

		<!-- 同步设置 -->
		<div class="space-y-4 border-t pt-4">
			<h4 class="text-sm font-medium">同步设置</h4>
			
			<div class="flex items-center justify-between">
				<div>
					<Label class="text-sm">自动同步</Label>
					<p class="text-xs text-muted-foreground">定时自动上传设置到 Gist</p>
				</div>
				<Switch checked={config.autoSync} onCheckedChange={updateAutoSync} />
			</div>

			{#if config.autoSync}
				<div class="flex items-center gap-3">
					<Label class="text-sm">同步间隔</Label>
					<Input
						type="number"
						value={config.syncInterval}
						onchange={updateSyncInterval}
						min="1"
						class="w-20"
					/>
					<span class="text-sm text-muted-foreground">分钟</span>
				</div>
			{/if}

			<div class="flex items-center justify-between">
				<div>
					<Label class="text-sm">公开 Gist</Label>
					<p class="text-xs text-muted-foreground">设置为公开后任何人都可以查看</p>
				</div>
				<Switch checked={config.isPublic} onCheckedChange={updateIsPublic} />
			</div>

			<div>
				<Label class="text-sm">Gist 描述</Label>
				<Input
					value={config.description}
					onchange={updateDescription}
					placeholder="NeoView Settings Backup"
					class="mt-1"
				/>
			</div>
		</div>
	{:else}
		<!-- 未登录状态 -->
		<div class="space-y-4">
			<div class="rounded-lg border bg-muted/50 p-4">
				<h4 class="mb-2 font-medium">如何获取 Token?</h4>
				<ol class="list-inside list-decimal space-y-1 text-sm text-muted-foreground">
					<li>点击下方按钮前往 GitHub</li>
					<li>登录 GitHub 账号</li>
					<li>确保勾选 <code class="rounded bg-muted px-1">gist</code> 权限</li>
					<li>生成 Token 并复制到下方</li>
				</ol>
				<Button variant="outline" class="mt-3 gap-2" onclick={openGitHubTokenPage}>
					<ExternalLink class="h-4 w-4" />
					前往 GitHub 创建 Token
				</Button>
			</div>

			<div class="space-y-2">
				<Label>Personal Access Token</Label>
				<div class="flex gap-2">
					<div class="relative flex-1">
						<Input
							bind:value={tokenInput}
							type={showToken ? 'text' : 'password'}
							placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
							class="pr-10"
						/>
						<button
							type="button"
							class="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
							onclick={() => (showToken = !showToken)}
						>
							<Key class="h-4 w-4" />
						</button>
					</div>
					<Button onclick={handleLogin} disabled={isLoggingIn || !tokenInput.trim()}>
						{#if isLoggingIn}
							<Loader2 class="mr-1 h-4 w-4 animate-spin" />
						{:else}
							<LogIn class="mr-1 h-4 w-4" />
						{/if}
						登录
					</Button>
				</div>
			</div>
		</div>
	{/if}

	<!-- 状态消息 -->
	{#if statusMessage}
		<div class="flex items-center gap-2 text-sm {status === 'success' ? 'text-green-500' : status === 'error' ? 'text-red-500' : 'text-muted-foreground'}">
			{#if status === 'syncing'}
				<Loader2 class="h-4 w-4 animate-spin" />
			{:else if status === 'success'}
				<CheckCircle class="h-4 w-4" />
			{:else if status === 'error'}
				<XCircle class="h-4 w-4" />
			{/if}
			{statusMessage}
		</div>
	{/if}
</div>
