<script lang="ts">
	import { AlertCircle, Check, Info, X } from '@lucide/svelte';
	import { settingsManager } from '$lib/settings/settingsManager';
	import LiquidGlass from '$lib/vendor/liquid-glass/LiquidGlass.svelte';
	import type { ToastScope } from '$lib/utils/toast';

	type NotificationMessageStyle = 'none' | 'normal' | 'normalIconOnly' | 'tiny' | 'tinyIconOnly';
	type ToastStyle = Exclude<NotificationMessageStyle, 'none'>;

	interface ToastItem {
		id: string;
		type: 'success' | 'error' | 'info';
		title: string;
		description?: string;
		duration?: number;
		style: ToastStyle;
		scope: ToastScope;
	}

	type ToastEventDetail = Omit<ToastItem, 'id' | 'style' | 'scope'> & { scope?: ToastScope };

	interface NotificationConfig {
		messageStyle: NotificationMessageStyle;
		durationMs: number;
		maxVisible: number;
	}

	function getNotificationConfig(): NotificationConfig {
		const settings = settingsManager.getSettings();
		const view = settings.view;
		const base: NotificationConfig = {
			messageStyle: 'normal',
			durationMs: 3000,
			maxVisible: 3
		};

		const raw = view.notification;
		if (!raw) return base;

		return {
			messageStyle: (raw.messageStyle ?? base.messageStyle) as NotificationMessageStyle,
			durationMs: raw.durationMs ?? base.durationMs,
			maxVisible: raw.maxVisible ?? base.maxVisible
		};
	}

	let toasts = $state<ToastItem[]>([]);
	let settings = $state(settingsManager.getSettings());
	let toastIdCounter = 0;
	const normalToasts = $derived(toasts.filter((toast) => toast.scope !== 'switch'));
	const switchToasts = $derived(toasts.filter((toast) => toast.scope === 'switch'));
	const switchToastStyle = $derived.by(() => {
		const cfg = settings.view.switchToast;
		const x = clampNumber(cfg?.positionX, 0, 4096, 20);
		const y = clampNumber(cfg?.positionY, 0, 4096, 20);
		const opacity = clampNumber(cfg?.opacity, 0.1, 1, 0.92);
		return [
			`--switch-toast-x:${x}px`,
			`--switch-toast-y:${y}px`,
			`--switch-toast-opacity:${opacity}`,
			`--switch-toast-opacity-percent:${opacity * 100}%`
		].join(';');
	});
	const switchToastLiquidGlass = $derived(settings.view.switchToast?.liquidGlass ?? false);
	const switchToastOpacity = $derived(clampNumber(settings.view.switchToast?.opacity, 0.1, 1, 0.92));
	const liquidGlassContrast = $derived(
		settings.theme.theme === 'light' ? 'light-contrast' : 'dark-contrast'
	);

	// 去重机制
	let lastToastKey = '';
	let lastToastTime = 0;
	const TOAST_DEBOUNCE_MS = 500;

	function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
		if (typeof value !== 'number' || !Number.isFinite(value)) {
			return fallback;
		}
		return Math.min(max, Math.max(min, value));
	}

	function addToast(toast: ToastEventDetail) {
		const cfg = getNotificationConfig();
		if (cfg.messageStyle === 'none') {
			return;
		}

		// 去重检查：相同内容在短时间内不重复显示
		const toastKey = `${toast.type}:${toast.title}:${toast.description || ''}`;
		const now = Date.now();
		if (toastKey === lastToastKey && now - lastToastTime < TOAST_DEBOUNCE_MS) {
			return;
		}
		lastToastKey = toastKey;
		lastToastTime = now;

		const id = `toast-${toastIdCounter++}`;
		const style: ToastStyle = (cfg.messageStyle as ToastStyle) ?? 'normal';
		const duration = toast.duration ?? cfg.durationMs ?? 3000;
		const scope = toast.scope ?? 'normal';

		const next: ToastItem[] = [...toasts, { ...toast, id, style, scope }];
		const maxVisible = cfg.maxVisible ?? 3;
		const overflow = Math.max(0, next.length - maxVisible);
		toasts = overflow > 0 ? next.slice(overflow) : next;

		setTimeout(() => removeToast(id), duration);
	}

	function removeToast(id: string) {
		toasts = toasts.filter((t) => t.id !== id);
	}

	function handleShowToast(event: CustomEvent<ToastEventDetail>) {
		const { type, title, description, duration, scope } = event.detail;
		addToast({ type, title, description, duration, scope });
	}

	$effect(() => {
		window.addEventListener('show-toast', handleShowToast as EventListener);
		const unsubscribe = settingsManager.addListener((next) => {
			settings = next;
		});
		return () => {
			window.removeEventListener('show-toast', handleShowToast as EventListener);
			unsubscribe();
		};
	});
</script>

{#if normalToasts.length > 0}
	<div class="toast-container">
		{#each normalToasts as toast (toast.id)}
			<div class="toast-item" data-type={toast.type} data-style={toast.style}>
				<div class="toast-icon" aria-hidden="true">
					{#if toast.type === 'success'}
						<Check style="width: 1rem; height: 1rem" />
					{:else if toast.type === 'error'}
						<AlertCircle style="width: 1rem; height: 1rem" />
					{:else}
						<Info style="width: 1rem; height: 1rem" />
					{/if}
				</div>
				{#if toast.style === 'normalIconOnly' || toast.style === 'tinyIconOnly'}
					<!-- icon-only style: no text body -->
				{:else}
					<div class="toast-body">
						<p class="toast-title">{toast.title}</p>
						{#if toast.description}
							<p class="toast-description">{toast.description}</p>
						{/if}
					</div>
				{/if}
				<button type="button" class="toast-close" onclick={() => removeToast(toast.id)}>
					<span class="sr-only">关闭</span>
					<X style="width: 1rem; height: 1rem" />
				</button>
			</div>
		{/each}
	</div>
{/if}

{#if switchToasts.length > 0}
	<div class="toast-container switch-toast-container" style={switchToastStyle}>
		{#each switchToasts as toast (toast.id)}
			{#if switchToastLiquidGlass}
				<LiquidGlass
					class="switch-toast-glass"
					contrast={liquidGlassContrast}
					accent="var(--accent)"
					roundness={8}
					opacity={switchToastOpacity}
				>
					<div
						class="toast-item"
						data-type={toast.type}
						data-style={toast.style}
						data-scope="switch"
						data-liquid-glass="true"
					>
						<div class="toast-icon" aria-hidden="true">
							{#if toast.type === 'success'}
								<Check style="width: 1rem; height: 1rem" />
							{:else if toast.type === 'error'}
								<AlertCircle style="width: 1rem; height: 1rem" />
							{:else}
								<Info style="width: 1rem; height: 1rem" />
							{/if}
						</div>
						{#if toast.style === 'normalIconOnly' || toast.style === 'tinyIconOnly'}
							<!-- icon-only style: no text body -->
						{:else}
							<div class="toast-body">
								<p class="toast-title">{toast.title}</p>
								{#if toast.description}
									<p class="toast-description">{toast.description}</p>
								{/if}
							</div>
						{/if}
						<button type="button" class="toast-close" onclick={() => removeToast(toast.id)}>
							<span class="sr-only">关闭</span>
							<X style="width: 1rem; height: 1rem" />
						</button>
					</div>
				</LiquidGlass>
			{:else}
				<div
					class="toast-item"
					data-type={toast.type}
					data-style={toast.style}
					data-scope="switch"
					data-liquid-glass="false"
				>
					<div class="toast-icon" aria-hidden="true">
						{#if toast.type === 'success'}
							<Check style="width: 1rem; height: 1rem" />
						{:else if toast.type === 'error'}
							<AlertCircle style="width: 1rem; height: 1rem" />
						{:else}
							<Info style="width: 1rem; height: 1rem" />
						{/if}
					</div>
					{#if toast.style === 'normalIconOnly' || toast.style === 'tinyIconOnly'}
						<!-- icon-only style: no text body -->
					{:else}
						<div class="toast-body">
							<p class="toast-title">{toast.title}</p>
							{#if toast.description}
								<p class="toast-description">{toast.description}</p>
							{/if}
						</div>
					{/if}
					<button type="button" class="toast-close" onclick={() => removeToast(toast.id)}>
						<span class="sr-only">关闭</span>
						<X style="width: 1rem; height: 1rem" />
					</button>
				</div>
			{/if}
		{/each}
	</div>
{/if}

<style>
	@keyframes toast-enter {
		from {
			transform: translate3d(0, -10px, 0) scale(0.98);
			opacity: 0;
		}
		to {
			transform: translate3d(0, 0, 0) scale(1);
			opacity: 1;
		}
	}

	.toast-container {
		position: fixed;
		top: 1.25rem;
		right: 1.25rem;
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		z-index: 80;
		pointer-events: none;
	}

	.switch-toast-container {
		top: var(--switch-toast-y);
		right: auto;
		left: var(--switch-toast-x);
	}

	.toast-item {
		pointer-events: auto;
		display: flex;
		align-items: flex-start;
		gap: 0.75rem;
		min-width: 16rem;
		max-width: 22rem;
		padding: 0.85rem 1rem;
		border-radius: var(--radius);
		border: 1px solid color-mix(in srgb, var(--border) 80%, transparent);
		background: color-mix(in srgb, var(--card) 92%, transparent);
		box-shadow: 0 18px 40px rgba(15, 23, 42, 0.25);
		backdrop-filter: blur(20px);
		animation: toast-enter 220ms ease forwards;
	}

	.toast-item[data-scope='switch'] {
		background: color-mix(in srgb, var(--card) var(--switch-toast-opacity-percent), transparent);
	}

	.toast-item[data-liquid-glass='true'] {
		border-color: transparent;
		background: transparent;
		box-shadow: none;
	}

	:global(.switch-toast-glass) {
		min-width: 16rem;
		max-width: 22rem;
	}

	.toast-item[data-style='tiny'],
	.toast-item[data-style='tinyIconOnly'] {
		min-width: 12rem;
		max-width: 18rem;
		padding: 0.5rem 0.75rem;
		box-shadow: 0 12px 24px rgba(15, 23, 42, 0.2);
	}

	.toast-item[data-style='tiny'] .toast-title {
		font-size: 0.8rem;
	}

	.toast-item[data-style='tiny'] .toast-description {
		font-size: 0.75rem;
	}

	.toast-item[data-style='normalIconOnly'],
	.toast-item[data-style='tinyIconOnly'] {
		min-width: auto;
		max-width: auto;
	}

	.toast-item[data-type='success'] {
		border-color: color-mix(in srgb, var(--primary) 60%, transparent);
	}

	.toast-item[data-type='error'] {
		border-color: color-mix(in srgb, var(--destructive) 65%, transparent);
	}

	.toast-item[data-type='info'] {
		border-color: color-mix(in srgb, var(--accent) 60%, transparent);
	}

	.toast-icon {
		flex-shrink: 0;
		width: 2rem;
		height: 2rem;
		border-radius: 9999px;
		display: flex;
		align-items: center;
		justify-content: center;
		background: color-mix(in srgb, currentColor 15%, transparent);
	}

	.toast-item[data-type='success'] .toast-icon {
		color: var(--primary);
	}

	.toast-item[data-type='error'] .toast-icon {
		color: var(--destructive);
	}

	.toast-item[data-type='info'] .toast-icon {
		color: var(--accent);
	}

	.toast-body {
		flex: 1;
		min-width: 0;
		color: var(--foreground);
	}

	.toast-title {
		font-size: 0.92rem;
		font-weight: 600;
		line-height: 1.2;
	}

	.toast-description {
		margin-top: 0.25rem;
		font-size: 0.84rem;
		line-height: 1.35;
		color: var(--muted-foreground);
	}

	.toast-close {
		pointer-events: auto;
		border: none;
		background: transparent;
		color: var(--muted-foreground);
		padding: 0;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		transition: color 120ms ease;
	}

	.toast-close:hover {
		color: var(--foreground);
	}

	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		padding: 0;
		margin: -1px;
		overflow: hidden;
		clip: rect(0, 0, 0, 0);
		white-space: nowrap;
		border: 0;
	}
</style>
