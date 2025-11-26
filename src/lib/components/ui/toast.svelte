<script lang="ts">
  import {
    AlertCircle,
    Check,
    Info,
    X
  } from '@lucide/svelte';

  interface ToastItem {
    id: string;
    type: 'success' | 'error' | 'info';
    title: string;
    description?: string;
    duration?: number;
  }

  type ToastEventDetail = Omit<ToastItem, 'id'>;

  let toasts = $state<ToastItem[]>([]);
  let toastIdCounter = 0;

  function addToast(toast: ToastEventDetail) {
    const id = `toast-${toastIdCounter++}`;
    toasts = [...toasts, { ...toast, id }];
    const duration = toast.duration ?? 3000;
    setTimeout(() => removeToast(id), duration);
  }

  function removeToast(id: string) {
    toasts = toasts.filter((t) => t.id !== id);
  }

  function handleShowToast(event: CustomEvent<ToastEventDetail>) {
    const { type, title, description, duration } = event.detail;
    addToast({ type, title, description, duration });
  }

  $effect(() => {
    window.addEventListener('show-toast', handleShowToast as EventListener);
    return () => window.removeEventListener('show-toast', handleShowToast as EventListener);
  });
</script>

{#if toasts.length > 0}
  <div class="toast-container">
    {#each toasts as toast (toast.id)}
      <div class="toast-item" data-type={toast.type}>
        <div class="toast-icon" aria-hidden="true">
          {#if toast.type === 'success'}
            <Check style="width: 1rem; height: 1rem" />
          {:else if toast.type === 'error'}
            <AlertCircle style="width: 1rem; height: 1rem" />
          {:else}
            <Info style="width: 1rem; height: 1rem" />
          {/if}
        </div>
        <div class="toast-body">
          <p class="toast-title">{toast.title}</p>
          {#if toast.description}
            <p class="toast-description">{toast.description}</p>
          {/if}
        </div>
        <button type="button" class="toast-close" onclick={() => removeToast(toast.id)}>
          <span class="sr-only">关闭</span>
          <X style="width: 1rem; height: 1rem" />
        </button>
      </div>
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