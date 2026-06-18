<script lang="ts">
	/**
	 * 手势可视化组件
	 * 支持鼠标手势和触摸手势的可视化录制
	 */
	import { onMount, onDestroy } from 'svelte';
	import { Button } from '$lib/components/ui/button';

	let { type = 'mouse', onGestureComplete, onCancel } = $props();

	let canvas: HTMLCanvasElement;
	let ctx: CanvasRenderingContext2D | null = null;
	let isRecording = $state(false);
	let points: { x: number; y: number; time: number }[] = [];
	let currentGesture = $state('');
	let showInstructions = $state(true);

	const CANVAS_SIZE = 300;
	const MIN_DISTANCE = 20;
	const GESTURE_THRESHOLD = 50;

	onMount(() => {
		if (canvas) {
			ctx = canvas.getContext('2d');
			setupCanvas();
			startRecording();
		}
	});

	onDestroy(() => {
		stopRecording();
	});

	function setupCanvas() {
		if (!ctx) return;

		// 设置画布样式
		ctx.strokeStyle = type === 'mouse' ? '#10b981' : '#8b5cf6';
		ctx.lineWidth = 3;
		ctx.lineCap = 'round';
		ctx.lineJoin = 'round';

		// 清空画布
		clearCanvas();
	}

	function clearCanvas() {
		if (!ctx || !canvas) return;
		ctx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

		// 绘制中心点
		ctx.fillStyle = '#e5e7eb';
		ctx.beginPath();
		ctx.arc(CANVAS_SIZE / 2, CANVAS_SIZE / 2, 5, 0, Math.PI * 2);
		ctx.fill();

		// 绘制方向提示
		ctx.strokeStyle = '#d1d5db';
		ctx.lineWidth = 1;
		ctx.setLineDash([5, 5]);

		// 水平线
		ctx.beginPath();
		ctx.moveTo(0, CANVAS_SIZE / 2);
		ctx.lineTo(CANVAS_SIZE, CANVAS_SIZE / 2);
		ctx.stroke();

		// 垂直线
		ctx.beginPath();
		ctx.moveTo(CANVAS_SIZE / 2, 0);
		ctx.lineTo(CANVAS_SIZE / 2, CANVAS_SIZE);
		ctx.stroke();

		ctx.setLineDash([]);
	}

	function startRecording() {
		isRecording = true;
		points = [];
		currentGesture = '';
		showInstructions = true;
		clearCanvas();

		if (type === 'mouse') {
			document.addEventListener('mousedown', handleMouseDown);
			document.addEventListener('mousemove', handleMouseMove);
			document.addEventListener('mouseup', handleMouseUp);
		} else {
			document.addEventListener('touchstart', handleTouchStart);
			document.addEventListener('touchmove', handleTouchMove);
			document.addEventListener('touchend', handleTouchEnd);
		}
	}

	function stopRecording() {
		isRecording = false;

		if (type === 'mouse') {
			document.removeEventListener('mousedown', handleMouseDown);
			document.removeEventListener('mousemove', handleMouseMove);
			document.removeEventListener('mouseup', handleMouseUp);
		} else {
			document.removeEventListener('touchstart', handleTouchStart);
			document.removeEventListener('touchmove', handleTouchMove);
			document.removeEventListener('touchend', handleTouchEnd);
		}
	}

	function handleMouseDown(e: MouseEvent) {
		if (!isRecording || e.button !== 0) return;
		showInstructions = false;
		points = [{ x: e.clientX, y: e.clientY, time: Date.now() }];
	}

	function handleMouseMove(e: MouseEvent) {
		if (!isRecording || points.length === 0) return;

		const point = { x: e.clientX, y: e.clientY, time: Date.now() };
		const lastPoint = points[points.length - 1];

		// 检查距离是否足够
		const distance = Math.sqrt(
			Math.pow(point.x - lastPoint.x, 2) + Math.pow(point.y - lastPoint.y, 2)
		);

		if (distance > MIN_DISTANCE) {
			points.push(point);
			drawGesture();
		}
	}

	function handleMouseUp(e: MouseEvent) {
		if (!isRecording || points.length === 0) return;

		if (e.button === 0) {
			analyzeGesture();
			stopRecording();
		}
	}

	function handleTouchStart(e: TouchEvent) {
		if (!isRecording) return;
		e.preventDefault();
		showInstructions = false;

		const touch = e.touches[0];
		points = [{ x: touch.clientX, y: touch.clientY, time: Date.now() }];
	}

	function handleTouchMove(e: TouchEvent) {
		if (!isRecording || points.length === 0) return;
		e.preventDefault();

		const touch = e.touches[0];
		const point = { x: touch.clientX, y: touch.clientY, time: Date.now() };
		const lastPoint = points[points.length - 1];

		// 检查距离是否足够
		const distance = Math.sqrt(
			Math.pow(point.x - lastPoint.x, 2) + Math.pow(point.y - lastPoint.y, 2)
		);

		if (distance > MIN_DISTANCE) {
			points.push(point);
			drawGesture();
		}
	}

	function handleTouchEnd(e: TouchEvent) {
		if (!isRecording || points.length === 0) return;
		e.preventDefault();

		analyzeGesture();
		stopRecording();
	}

	function drawGesture() {
		if (!ctx || points.length < 2) return;

		// 转换坐标到画布坐标系
		const canvasPoints = points.map((p) => ({
			x: (p.x - canvas!.getBoundingClientRect().left) * (CANVAS_SIZE / canvas!.offsetWidth),
			y: (p.y - canvas!.getBoundingClientRect().top) * (CANVAS_SIZE / canvas!.offsetHeight)
		}));

		// 清空画布并重绘
		clearCanvas();

		// 绘制手势路径
		ctx.strokeStyle = type === 'mouse' ? '#10b981' : '#8b5cf6';
		ctx.lineWidth = 3;
		ctx.beginPath();
		ctx.moveTo(canvasPoints[0].x, canvasPoints[0].y);

		for (let i = 1; i < canvasPoints.length; i++) {
			ctx.lineTo(canvasPoints[i].x, canvasPoints[i].y);
		}

		ctx.stroke();

		// 绘制起点和终点
		// 起点
		ctx.fillStyle = '#10b981';
		ctx.beginPath();
		ctx.arc(canvasPoints[0].x, canvasPoints[0].y, 6, 0, Math.PI * 2);
		ctx.fill();

		// 终点
		ctx.fillStyle = '#ef4444';
		ctx.beginPath();
		ctx.arc(
			canvasPoints[canvasPoints.length - 1].x,
			canvasPoints[canvasPoints.length - 1].y,
			6,
			0,
			Math.PI * 2
		);
		ctx.fill();
	}

	function analyzeGesture() {
		if (points.length < 2) {
			currentGesture = '';
			return;
		}

		const startPoint = points[0];
		const endPoint = points[points.length - 1];

		const dx = endPoint.x - startPoint.x;
		const dy = endPoint.y - startPoint.y;

		// 计算主要方向
		const absDx = Math.abs(dx);
		const absDy = Math.abs(dy);

		let direction = '';

		if (Math.max(absDx, absDy) < GESTURE_THRESHOLD) {
			// 短距离点击或触摸
			const duration = endPoint.time - startPoint.time;
			if (duration < 200) {
				direction = type === 'mouse' ? 'click' : 'tap';
			} else {
				direction = 'long-press';
			}
		} else if (absDx > absDy) {
			// 水平方向
			if (dx > 0) {
				direction = 'R'; // 右
			} else {
				direction = 'L'; // 左
			}
		} else {
			// 垂直方向
			if (dy > 0) {
				direction = 'D'; // 下
			} else {
				direction = 'U'; // 上
			}
		}

		// 检查是否有转折（复杂手势）
		const corners = detectCorners();
		if (corners.length > 0) {
			// 简单的多方向手势
			currentGesture = direction + corners.join('');
		} else {
			currentGesture = direction;
		}

		// 延迟后自动完成
		setTimeout(() => {
			if (currentGesture) {
				onGestureComplete(currentGesture);
			}
		}, 500);
	}

	function detectCorners(): string[] {
		if (points.length < 3) return [];

		const corners: string[] = [];
		const angleThreshold = 45; // 角度阈值（度）

		for (let i = 1; i < points.length - 1; i++) {
			const p1 = points[i - 1];
			const p2 = points[i];
			const p3 = points[i + 1];

			// 计算角度
			const angle1 = (Math.atan2(p2.y - p1.y, p2.x - p1.x) * 180) / Math.PI;
			const angle2 = (Math.atan2(p3.y - p2.y, p3.x - p2.x) * 180) / Math.PI;
			const angleDiff = Math.abs(angle2 - angle1);

			if (angleDiff > angleThreshold && angleDiff < 180 - angleThreshold) {
				// 检测到转折
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

	function handleCancel() {
		stopRecording();
		onCancel();
	}

	function retry() {
		startRecording();
	}
</script>

<div class="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
	<div class="bg-background mx-4 w-full max-w-md space-y-4 rounded-lg border p-6">
		<div class="space-y-2">
			<h4 class="flex items-center gap-2 font-semibold">
				{#if type === 'mouse'}
					<span class="text-green-500">🖱️</span>
					鼠标手势录制
				{:else}
					<span class="text-purple-500">👆</span>
					触摸手势录制
				{/if}
			</h4>
			<p class="text-muted-foreground text-sm">
				{#if type === 'mouse'}
					按住鼠标左键并拖动来录制手势
				{:else}
					在触摸屏上滑动来录制手势
				{/if}
			</p>
		</div>

		<!-- 手势画布 -->
		<div class="bg-muted/30 relative rounded-lg p-4">
			<canvas
				bind:this={canvas}
				width={CANVAS_SIZE}
				height={CANVAS_SIZE}
				class="border-muted-foreground/30 h-auto w-full rounded border-2 border-dashed"
			></canvas>

			{#if showInstructions}
				<div class="pointer-events-none absolute inset-0 flex items-center justify-center">
					<div class="space-y-2 text-center">
						<div class="text-2xl">
							{#if type === 'mouse'}
								🖱️
							{:else}
								👆
							{/if}
						</div>
						<p class="text-muted-foreground text-sm">
							{#if type === 'mouse'}
								按住并拖动鼠标
							{:else}
								在屏幕上滑动
							{/if}
						</p>
					</div>
				</div>
			{/if}

			{#if currentGesture}
				<div
					class="bg-background absolute top-2 right-2 rounded border px-2 py-1 font-mono text-sm"
				>
					{currentGesture}
				</div>
			{/if}
		</div>

		<!-- 手势说明 -->
		<div class="text-muted-foreground space-y-1 text-xs">
			<p>支持的手势：</p>
			<div class="grid grid-cols-2 gap-2">
				<div>• L/R - 左/右滑动</div>
				<div>• U/D - 上/下滑动</div>
				<div>• LD/RU - 左下/右上</div>
				<div>• 点击/轻触</div>
			</div>
		</div>

		<!-- 操作按钮 -->
		<div class="flex justify-end gap-2">
			<Button variant="outline" onclick={handleCancel}>取消</Button>
			{#if !isRecording && currentGesture}
				<Button onclick={() => onGestureComplete(currentGesture)}>使用此手势</Button>
			{:else if !isRecording}
				<Button variant="outline" onclick={retry}>重新录制</Button>
			{/if}
		</div>
	</div>
</div>
