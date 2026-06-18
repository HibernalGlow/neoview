<script lang="ts">
	/**
	 * 鼠标手势录制组件
	 * 专门用于录制鼠标拖拽手势
	 */
	import { Button } from '$lib/components/ui/button';
	import { Mouse, RotateCcw } from '@lucide/svelte';

	let { onComplete, onCancel } = $props();

	let isRecording = $state(false);
	let points = $state<{ x: number; y: number; time: number }[]>([]);
	let currentGesture = $state('');
	let mousePosition = $state({ x: 0, y: 0 });
	let isDragging = $state(false);
	let dragButton = $state<'left' | 'right' | 'middle'>('left');

	// 开始录制
	function startRecording() {
		isRecording = true;
		points = [];
		currentGesture = '';
		isDragging = false;
		console.log('开始录制鼠标手势...');
	}

	// 停止录制
	function stopRecording() {
		isRecording = false;
		isDragging = false;
	}

	// 处理鼠标按下
	function handleMouseDown(e: MouseEvent) {
		if (!isRecording) return;
		e.preventDefault();
		e.stopPropagation();

		const button = e.button === 0 ? 'left' : e.button === 1 ? 'middle' : 'right';
		dragButton = button;
		isDragging = true;
		points = [{ x: e.clientX, y: e.clientY, time: Date.now() }];

		console.log('开始拖拽手势，按钮:', button);
	}

	// 处理鼠标移动
	function handleMouseMove(e: MouseEvent) {
		mousePosition = { x: e.clientX, y: e.clientY };

		if (!isDragging || !isRecording) return;

		const lastPoint = points[points.length - 1];
		const distance = Math.sqrt(
			Math.pow(e.clientX - lastPoint.x, 2) + Math.pow(e.clientY - lastPoint.y, 2)
		);

		// 最小移动距离
		if (distance > 20) {
			points.push({ x: e.clientX, y: e.clientY, time: Date.now() });
			analyzeGesture();
		}
	}

	// 处理鼠标释放
	function handleMouseUp(e: MouseEvent) {
		if (!isDragging || !isRecording) return;
		e.preventDefault();
		e.stopPropagation();

		isDragging = false;

		if (points.length > 1) {
			analyzeGesture();

			// 标记为已完成，不自动保存
			// 用户需要手动点击"使用此手势"按钮
		}
	}

	// 分析手势
	function analyzeGesture() {
		if (points.length < 2) return;

		const startPoint = points[0];
		const endPoint = points[points.length - 1];

		const dx = endPoint.x - startPoint.x;
		const dy = endPoint.y - startPoint.y;

		// 计算主要方向
		const absDx = Math.abs(dx);
		const absDy = Math.abs(dy);

		let direction = '';

		if (Math.max(absDx, absDy) < 30) {
			return; // 移动距离太短
		} else if (absDx > absDy) {
			// 水平方向
			direction = dx > 0 ? 'R' : 'L';
		} else {
			// 垂直方向
			direction = dy > 0 ? 'D' : 'U';
		}

		// 检查是否有转折
		const corners = detectCorners();
		if (corners.length > 0) {
			currentGesture = direction + corners.join('');
		} else {
			currentGesture = direction;
		}
	}

	// 检测转折点
	function detectCorners(): string[] {
		if (points.length < 3) return [];

		const corners: string[] = [];
		const angleThreshold = 45;

		for (let i = 1; i < points.length - 1; i++) {
			const p1 = points[i - 1];
			const p2 = points[i];
			const p3 = points[i + 1];

			const angle1 = (Math.atan2(p2.y - p1.y, p2.x - p1.x) * 180) / Math.PI;
			const angle2 = (Math.atan2(p3.y - p2.y, p3.x - p2.x) * 180) / Math.PI;
			const angleDiff = Math.abs(angle2 - angle1);

			if (angleDiff > angleThreshold && angleDiff < 180 - angleThreshold) {
				const dx = p3.x - p1.x;
				const dy = p3.y - p1.y;

				if (Math.abs(dx) > Math.abs(dy)) {
					corners.push(dx > 0 ? 'R' : 'L');
				} else {
					corners.push(dy > 0 ? 'D' : 'U');
				}
			}
		}

		return corners;
	}

	// 重置录制
	function resetRecording() {
		stopRecording();
		currentGesture = '';
		points = [];
		startRecording();
	}

	// 获取手势描述
	function getGestureDescription() {
		if (!currentGesture) return '';

		const descriptions: Record<string, string> = {
			L: '向左滑动',
			R: '向右滑动',
			U: '向上滑动',
			D: '向下滑动',
			LD: '左下滑动',
			LU: '左上滑动',
			RD: '右下滑动',
			RU: '右上滑动',
			LR: '左右滑动',
			RL: '右左滑动',
			UD: '上下滑动',
			DU: '下上滑动'
		};

		return descriptions[currentGesture] || currentGesture;
	}

	// 获取按钮描述
	function getButtonDescription() {
		switch (dragButton) {
			case 'left':
				return '左键';
			case 'right':
				return '右键';
			case 'middle':
				return '中键';
			default:
				return '左键';
		}
	}
</script>

<div class="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
	<div class="bg-background mx-4 w-full max-w-2xl space-y-6 rounded-lg border p-6">
		<div class="space-y-2">
			<h4 class="flex items-center gap-2 font-semibold">
				<Mouse class="h-4 w-4 text-green-500" />
				鼠标手势录制
			</h4>
			<p class="text-muted-foreground text-sm">按住鼠标左键、右键或中键并拖动来录制手势</p>
		</div>

		<!-- 录制区域 -->
		<div class="relative">
			<div
				class="relative h-64 rounded-lg border-2 border-dashed transition-all duration-300 {isRecording
					? isDragging
						? 'border-green-500 bg-green-50'
						: 'border-blue-500 bg-blue-50'
					: 'border-muted-foreground/30 bg-muted/30'}"
				role="button"
				tabindex="0"
				aria-label="鼠标手势录制区域"
				oncontextmenu={(e) => e.preventDefault()}
				onmousedown={handleMouseDown}
				onmousemove={handleMouseMove}
				onmouseup={handleMouseUp}
				onkeydown={() => {}}
			>
				<!-- 状态指示器 -->
				<div class="pointer-events-none absolute inset-0 flex items-center justify-center">
					{#if !isRecording}
						<div class="space-y-2 text-center">
							<div class="text-2xl">🖱️</div>
							<p class="text-muted-foreground text-sm">点击下方按钮开始录制</p>
						</div>
					{:else if !isDragging}
						<div class="space-y-2 text-center">
							<div class="text-2xl">👆</div>
							<p class="text-muted-foreground text-sm">按住鼠标并拖动</p>
						</div>
					{:else if currentGesture}
						<div class="space-y-2 text-center">
							<div class="text-2xl">✅</div>
							<p class="text-sm font-medium">{getButtonDescription()} {getGestureDescription()}</p>
							<p class="text-muted-foreground text-xs">手势已录制</p>
						</div>
					{:else}
						<div class="space-y-2 text-center">
							<div class="text-2xl">🎯</div>
							<p class="text-muted-foreground text-sm">正在录制手势...</p>
						</div>
					{/if}
				</div>

				<!-- 实时信息显示 -->
				{#if isRecording}
					<div class="text-muted-foreground absolute top-2 left-2 text-xs">
						<div>位置: ({mousePosition.x}, {mousePosition.y})</div>
						<div>按钮: {getButtonDescription()}</div>
						{#if currentGesture}
							<div>手势: {currentGesture}</div>
						{/if}
					</div>
				{/if}
			</div>
		</div>

		<!-- 操作说明 -->
		<div class="text-muted-foreground space-y-1 text-xs">
			<p>支持的手势：</p>
			<div class="grid grid-cols-2 gap-2">
				<div>• L/R - 左/右滑动</div>
				<div>• U/D - 上/下滑动</div>
				<div>• LD/RU - 左下/右上</div>
				<div>• LU/RD - 左上/右下</div>
			</div>
		</div>

		<!-- 操作按钮 -->
		<div class="flex justify-between">
			<div class="flex gap-2">
				{#if !isRecording}
					<Button onclick={startRecording}>
						<Mouse class="mr-2 h-4 w-4" />
						开始录制
					</Button>
				{:else}
					<Button variant="outline" onclick={resetRecording}>
						<RotateCcw class="mr-2 h-4 w-4" />
						重新录制
					</Button>
				{/if}
			</div>
			<div class="flex gap-2">
				<Button variant="outline" onclick={onCancel}>取消</Button>
				{#if currentGesture}
					<Button onclick={() => onComplete(currentGesture, dragButton, 'gesture')}>
						使用此手势
					</Button>
				{/if}
			</div>
		</div>
	</div>
</div>
