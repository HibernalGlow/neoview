<!-- loading-spinner.svelte - 加载动画 -->
<script lang="ts">
  interface Props {
    size?: 'small' | 'medium' | 'large';
    text?: string;
  }
  
  let {
    size = 'medium',
    text = ''
  }: Props = $props();
  
  const sizes = {
    small: '16px',
    medium: '24px',
    large: '32px'
  };
</script>

<div class="loading-spinner" class:size={size}>
  <div class="spinner"></div>
  {#if text}
    <span class="loading-text">{text}</span>
  {/if}
</div>

<style>
  .loading-spinner {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 8px;
  }
  
  .spinner {
    border: 2px solid var(--border);
    border-top: 2px solid var(--primary);
    border-radius: 50%;
    animation: spin 1s linear infinite;
  }
  
  .size.small .spinner {
    width: 16px;
    height: 16px;
  }
  
  .size.medium .spinner {
    width: 24px;
    height: 24px;
  }
  
  .size.large .spinner {
    width: 32px;
    height: 32px;
  }
  
  .loading-text {
    font-size: 14px;
    color: var(--muted);
  }
  
  @keyframes spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
  }
</style>