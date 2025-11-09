<script lang="ts">
	/**
	 * 鼠标操作录制区域组件
	 * 提供一个专门的区域来录制鼠标操作
	 */
	import { Button } from '$lib/components/ui/button';
	import { Mouse, RotateCcw } from '@lucide/svelte';

	let { 
		onComplete, 
		onCancel 
	} = $props();

	let isActive = $state(false);
	let isHovering = $state(false);
	let recordedGesture = $state<{ gesture: string; button: string; action: string } | null>(null);
	let countdown = $state(0);
	let recordingStartTime = $state(0);

	// 鼠标操作状态
	let mousePosition = $state({ x: 0, y: 0 });
	let wheelDirection = $state<'up' | 'down' | null>(null);
	let clickCount = $state(0);
	let lastClickTime = $state(0);
	let pressedButton = $state<string | null>(null);

	// 倒计时
	$effect(() => {
		if (countdown > 0) {
			const timer = setTimeout(() => {
				countdown--;
			}, 1000);
			return () => clearTimeout(timer);
		} else if (countdown === 0 && isActive) {
			startRecording();
		}
	});

	// 开始倒计时
	function startCountdown() {
		countdown = 3;
		isActive = true;
		recordedGesture = null;
		wheelDirection = null;
		clickCount = 0;
		pressedButton = null;
	}

	// 开始录制
	function startRecording() {
		recordingStartTime = Date.now();
		console.log('开始录制鼠标操作...');
	}

	// 停止录制
	function stopRecording() {
		isActive = false;
		countdown = 0;
	}

	// 处理鼠标进入
	function handleMouseEnter() {
		if (!isActive) return;
		isHovering = true;
		console.log('鼠标进入录制区域');
	}

	// 处理鼠标离开
	function handleMouseLeave() {
		isHovering = false;
		pressedButton = null;
		console.log('鼠标离开录制区域');
	}

	// 处理鼠标移动
	function handleMouseMove(e: MouseEvent) {
		if (!isHovering || !isActive) return;
		mousePosition = { x: e.offsetX, y: e.offsetY };
	}

	// 处理滚轮
	function handleWheel(e: WheelEvent) {
		if (!isHovering || !isActive) return;
		e.preventDefault();
		
		wheelDirection = e.deltaY < 0 ? 'up' : 'down';
		recordedGesture = {
			gesture: `wheel-${wheelDirection}`,
			button: 'middle',
			action: 'wheel'
		};
		
		console.log('检测到滚轮操作:', wheelDirection);
		
		// 延迟完成录制
		setTimeout(() => {
			if (recordedGesture) {
				onComplete(recordedGesture.gesture, recordedGesture.button, recordedGesture.action);
			}
		}, 500);
	}

	// 处理鼠标按下
	function handleMouseDown(e: MouseEvent) {
		if (!isHovering || !isActive) return;
		e.preventDefault();
		
		const button = e.button === 0 ? 'left' : e.button === 1 ? 'middle' : 'right';
		pressedButton = button;
		
		// 立即记录按下操作
		recordedGesture = {
			gesture: 'press',
			button: button,
			action: 'press'
		};
		
		console.log('检测到鼠标按下:', button);
		
		// 延迟完成录制
		setTimeout(() => {
			if (recordedGesture && recordedGesture.action === 'press') {
				onComplete(recordedGesture.gesture, recordedGesture.button, recordedGesture.action);
			}
		}, 300);
	}

	// 处理鼠标点击
	function handleClick(e: MouseEvent) {
		if (!isHovering || !isActive) return;
		e.preventDefault();
		
		const button = e.button === 0 ? 'left' : e.button === 1 ? 'middle' : 'right';
		const currentTime = Date.now();
		
		// 检测双击
		if (currentTime - lastClickTime < 500) {
			clickCount++;
			if (clickCount === 2) {
				// 双击
				recordedGesture = {
					gesture: 'double-click',
					button: button,
					action: 'double-click'
				};
				console.log('检测到双击:', button);
				
				setTimeout(() => {
					if (recordedGesture) {
						onComplete(recordedGesture.gesture, recordedGesture.button, recordedGesture.action);
					}
				}, 300);
			}
		} else {
			clickCount = 1;
			// 单击（如果不是按下操作）
			if (!pressedButton) {
				recordedGesture = {
					gesture: 'click',
					button: button,
					action: 'click'
				};
				console.log('检测到单击:', button);
				
				setTimeout(() => {
					if (recordedGesture && recordedGesture.action === 'click') {
						onComplete(recordedGesture.gesture, recordedGesture.button, recordedGesture.action);
					}
				}, 300);
			}
		}
		
		lastClickTime = currentTime;
	}

	// 处理鼠标释放
	function handleMouseUp(e: MouseEvent) {
		if (!isHovering || !isActive) return;
		pressedButton = null;
	}

	// 重置录制
	function resetRecording() {
		stopRecording();
		recordedGesture = null;
		wheelDirection = null;
		clickCount = 0;
		pressedButton = null;
		startCountdown();
	}

	// 获取操作描述
	function getOperationDescription() {
		if (!recordedGesture) return '';
		
		const { gesture, button, action } = recordedGesture;
		let buttonText = '';
		switch (button) {
			case 'left': buttonText = '左键'; break;
			case 'right': buttonText = '右键'; break;
			case 'middle': buttonText = '中键'; break;
		}
		
		if (gesture === 'wheel-up') return `${buttonText} 滚轮向上`;
		if (gesture === 'wheel-down') return `${buttonText} 滚轮向下`;
		if (gesture === 'click') return `${buttonText} 单击`;
		if (gesture === 'double-click') return `${buttonText} 双击`;
		if (gesture === 'press') return `${buttonText} 按下`;
		
		return `${buttonText} ${gesture}`;
	}
</script>

<div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
	<div class="bg-background border rounded-lg p-6 max-w-2xl w-full mx-4 space-y-6">
		<div class="space-y-2">
			<h4 class="font-semibold flex items-center gap-2">
				<Mouse class="h-4 w-4 text-green-500" />
				鼠标操作录制
			</h4>
			<p class="text-sm text-muted-foreground">
				将鼠标悬停在录制区域上，然后执行鼠标操作（滚轮、点击、按下等）
			</p>
		</div>

		<!-- 录制区域 -->
		<div class="relative">
			<div
				class="relative h-64 border-2 border-dashed rounded-lg transition-all duration-300 {
					isActive 
						? isHovering 
							? 'border-green-500 bg-green-50' 
							: 'border-blue-500 bg-blue-50'
						: 'border-muted-foreground/30 bg-muted/30'
				}"
				onmouseenter={handleMouseEnter}
				onmouseleave={handleMouseLeave}
				onmousemove={handleMouseMove}
				onwheel={handleWheel}
				onmousedown={handleMouseDown}
				onclick={handleClick}
				onmouseup={handleMouseUp}
			>
				<!-- 状态指示器 -->
				<div class="absolute inset-0 flex items-center justify-center pointer-events-none">
					{#if countdown > 0}
						<div class="text-center space-y-2">
							<div class="text-6xl font-bold text-primary">{countdown}</div>
							<p class="text-sm text-muted-foreground">准备开始录制...</p>
						</div>
					{:else if isActive && !recordedGesture}
						<div class="text-center space-y-2">
							<div class="text-2xl">
								{#if isHovering}
									🎯
								{:else}
									👆
								{/if}
							</div>
							<p class="text-sm text-muted-foreground">
								{#if isHovering}
									正在感应鼠标操作...
								{:else}
									请将鼠标悬停在此区域
								{/if}
							</p>
						</div>
					{:else if recordedGesture}
						<div class="text-center space-y-2">
							<div class="text-2xl">✅</div>
							<p class="text-sm font-medium">{getOperationDescription()}</p>
							<p class="text-xs text-muted-foreground">操作已录制</p>
						</div>
					{:else}
						<div class="text-center space-y-2">
							<div class="text-2xl">🖱️</div>
							<p class="text-sm text-muted-foreground">点击下方按钮开始录制</p>
						</div>
					{/if}
				</div>

				<!-- 实时信息显示 -->
				{#if isActive && isHovering}
					<div class="absolute top-2 left-2 text-xs text-muted-foreground">
						<div>位置: ({mousePosition.x}, {mousePosition.y})</div>
						{#if wheelDirection}
							<div>滚轮: {wheelDirection === 'up' ? '向上' : '向下'}</div>
						{/if}
						{#if pressedButton}
							<div>按下: {pressedButton === 'left' ? '左键' : pressedButton === 'right' ? '右键' : '中键'}</div>
						{/if}
					</div>
				{/if}
			</div>
		</div>

		<!-- 操作说明 -->
		<div class="text-xs text-muted-foreground space-y-1">
			<p>支持的操作：</p>
			<div class="grid grid-cols-2 gap-2">
				<div>• 🖱️ 滚轮向上/向下</div>
				<div>• 👆 左键/右键/中键单击</div>
				<div>• 👆👆 左键/右键/中键双击</div>
				<div>• 🖱️ 左键/右键/中键按下</div>
			</div>
		</div>

		<!-- 操作按钮 -->
		<div class="flex justify-between">
			<div class="flex gap-2">
				{#if !isActive}
					<Button onclick={startCountdown}>
						<Mouse class="h-4 w-4 mr-2" />
						开始录制
					</Button>
				{:else}
					<Button variant="outline" onclick={resetRecording}>
						<RotateCcw class="h-4 w-4 mr-2" />
						重新录制
					</Button>
				{/if}
			</div>
			<div class="flex gap-2">
				<Button variant="outline" onclick={onCancel}>取消</Button>
				{#if recordedGesture}
					<Button onclick={() => onComplete(recordedGesture.gesture, recordedGesture.button, recordedGesture.action)}>
						使用此操作
					</Button>
				{/if}
			</div>
		</div>
	</div>
</div>