<script lang="ts">
	interface ToastItem {
		id: string;
		type: 'success' | 'error' | 'info';
		title: string;
		description?: string;
		duration?: number;
	}

	let toasts = $state<ToastItem[]>([]);
	let toastIdCounter = 0;

	function addToast(toast: Omit<ToastItem, 'id'>) {
		const id = `toast-${toastIdCounter++}`;
		const newToast: ToastItem = { ...toast, id };
		toasts = [...toasts, newToast];

		// 自动移除
		const duration = toast.duration || 3000;
		setTimeout(() => {
			removeToast(id);
		}, duration);
	}

	function removeToast(id: string) {
		toasts = toasts.filter(t => t.id !== id);
	}

	// 监听全局 toast 事件
	function handleShowToast(e: CustomEvent) {
		const { type, title, description, duration } = e.detail;
		addToast({
			type,
			title,
			description,
			duration
		});
	}

	// 在组件挂载时添加事件监听
	$effect(() => {
		window.addEventListener('show-toast', handleShowToast as EventListener);
		return () => {
			window.removeEventListener('show-toast', handleShowToast as EventListener);
		};
	});
</script>

{#if toasts.length > 0}
	<div class="toast-container">
		{#each toasts as toast (toast.id)}
			<div 
				class="toast-item"
				class:success={toast.type === 'success'}
				class:error={toast.type === 'error'}
				class:info={toast.type === 'info'}
			>
				<div class="toast-content">
					<div class="toast-icon">
						{#if toast.type === 'success'}
							<div class="w-5 h-5 rounded-full bg-green-500 flex items-center justify-center">
								<svg class="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
									<path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414l4 4 6.586-6.586a1 1 0 111.414 1.414l-6.586 6.586a1 1 0 01-1.414 0z" clip-rule="evenodd"/>
								</svg>
							</div>
						{:else if toast.type === 'error'}
							<div class="w-5 h-5 rounded-full bg-red-500 flex items-center justify-center">
								<svg class="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
									<path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8. 586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd"/>
								</svg>
							</div>
						{:else}
							<div class="w-5 h-5 rounded-full bg-blue-500 flex items-center justify-center">
								<svg class="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
									<path fill-rule="evenodd" d="M18 10a8 8 0 11-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd"/>
								</svg>
							</div>
						{/if}
					</div>
					<div class="toast-text">
						<p class="toast-title">{toast.title}</p>
						{#if toast.description}
							<p class="toast-description">{toast.description}</p>
						{/if}
					</div>
					<button 
						type="button"
						class="toast-close"
						onclick={() => removeToast(toast.id)}
					>
						<span class="sr-only">关闭</span>
						<svg class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
							<path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l-4.293-4.293a1 1 0 01-1.414 0l4 4 6.586-6.586a1 1 0 111.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd"/>
						</svg>
					</button>
				</div>
			</div>
		{/each}
	</div>
{/if}

<style>
	
	
	@keyframes slideInFromRight {
		from {
			transform: translateX(100%);
			opacity: 0;
		}
		to {
			transform: translateX(0);
			opacity: 1;
		}
	}
	
	/* Toast 样式 */
	.toast-container {
		position: fixed;
		top: 1rem;
		right: 1rem;
		z-index: 50;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		pointer-events: none;
	}
	
	.toast-item {
		max-width: 20rem;
		padding: 1rem;
		border-radius: 0.5rem;
		box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.1);
		border: 1px solid;
		transition: all 0.3s ease;
		transform: translateX(0);
			opacity: 0.95;
		background: rgba(255, 255, 255, 0.95);
		backdrop-filter: blur(10px);
	}
	
	.toast-item.success {
		border-color: rgba(34, 197, 94, 0.5);
		box-shadow: 0 10px 25px -5px rgba(34, 197, 94, 0.2);
	}
	
	.toast-item.error {
		border-color: rgba(239, 68, 68, 0.5);
		box-shadow: 0 10px 25px -5px rgba(239, 68, 68, 0.2);
	}
	
	.toast-item.info {
		border-color: rgba(59, 130, 246, 0.5);
		box-shadow: 0 10px 25px -5px rgba(59, 130, 246, 0.2);
	}
	
	.toast-content {
		display: flex;
		align-items: flex-start;
		gap: 0.75rem;
	}
	
	.toast-icon {
		flex-shrink: 0;
		margin-top: 0.125rem;
		width: 1.25rem;
		height: 1.25rem;
		border-radius: 9999px;
		display: flex;
		align-items: center;
		justify-content: center;
	}
	
	.toast-text {
		flex: 1;
		min-width: 0;
	}
	
	.toast-title {
		font-size: 0.875rem;
		font-weight: 500;
		color: rgba(255, 255, 255, 1);
		line-height: 1.25rem;
	}
	
	.toast-description {
		font-size: 0.8125rem;
		color: rgba(255, 255, 255, 0.8);
		line-height: 1.25rem;
		margin-top: 0.25rem;
	}
	
	.toast-close {
		flex-shrink: 0;
		display: inline-flex;
		color: rgba(255, 255, 255, 0.6);
			transition: color 0.2s;
	}
	
	.toast-close:hover {
		color: rgba(255, 255, 255, 1);
	}
</style>