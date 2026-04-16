<script lang="ts">
	import type { VideoLoopMode, VideoPlayerSettings } from '$lib/stores/video.svelte';

	interface DecodedFrame {
		bitmap: ImageBitmap;
		durationMs: number;
	}

	interface Props {
		src: string;
		initialPlaybackRate: number;
		initialLoopMode: VideoLoopMode;
		onSettingsChange?: (settings: VideoPlayerSettings) => void;
		onEnded?: () => void;
		onError?: (error: unknown) => void;
	}

	let {
		src,
		initialPlaybackRate,
		initialLoopMode,
		onSettingsChange = () => {},
		onEnded = () => {},
		onError = () => {}
	}: Props = $props();

	let canvasRef = $state<HTMLCanvasElement | null>(null);
	let isPlaying = $state(true);
	let playbackRate = $state(1);
	let loopMode = $state<VideoLoopMode>('list');
	let frames = $state<DecodedFrame[]>([]);
	let currentFrameIndex = $state(0);
	let rafId: number | null = null;
	let lastTick = 0;
	let elapsedInFrame = 0;
	let endedOnce = false;

	async function decodeAnimatedImage(url: string): Promise<DecodedFrame[]> {
		if (!(window as any).ImageDecoder) {
			throw new Error('当前 WebView 不支持 ImageDecoder，无法使用纯前端动图播放器。');
		}

		const response = await fetch(url);
		const blob = await response.blob();
		const data = await blob.arrayBuffer();
		const mimeType = blob.type || 'image/webp';
		const DecoderCtor = (window as any).ImageDecoder;
		const decoder = new DecoderCtor({ data, type: mimeType });

		const frameCount = decoder.tracks?.selectedTrack?.frameCount ?? 1;
		const decoded: DecodedFrame[] = [];

		for (let i = 0; i < frameCount; i++) {
			const result = await decoder.decode({ frameIndex: i });
			const videoFrame = result.image as VideoFrame;
			const durationMs = Math.max(10, Math.round((videoFrame.duration ?? 100000) / 1000));
			const bitmap = await createImageBitmap(videoFrame);
			videoFrame.close();
			decoded.push({ bitmap, durationMs });
		}

		decoder.close();
		return decoded;
	}

	function stopLoop() {
		if (rafId != null) {
			cancelAnimationFrame(rafId);
			rafId = null;
		}
	}

	function drawFrame(index: number) {
		const frame = frames[index];
		if (!frame || !canvasRef) return;

		const canvas = canvasRef;
		const ctx = canvas.getContext('2d');
		if (!ctx) return;

		const dpr = window.devicePixelRatio || 1;
		const width = canvas.clientWidth || 1;
		const height = canvas.clientHeight || 1;
		const targetW = Math.max(1, Math.floor(width * dpr));
		const targetH = Math.max(1, Math.floor(height * dpr));
		if (canvas.width !== targetW || canvas.height !== targetH) {
			canvas.width = targetW;
			canvas.height = targetH;
		}

		ctx.clearRect(0, 0, canvas.width, canvas.height);
		ctx.drawImage(frame.bitmap, 0, 0, canvas.width, canvas.height);
	}

	function advanceFrame() {
		if (frames.length === 0) return;
		if (currentFrameIndex < frames.length - 1) {
			currentFrameIndex += 1;
			return;
		}

		if (loopMode === 'single') {
			currentFrameIndex = 0;
			return;
		}

		if (loopMode === 'list') {
			if (!endedOnce) {
				endedOnce = true;
				onEnded();
			}
			currentFrameIndex = 0;
			return;
		}

		isPlaying = false;
		onEnded();
	}

	function tick(timestamp: number) {
		if (!isPlaying || frames.length === 0) return;
		if (lastTick === 0) {
			lastTick = timestamp;
		}

		const dt = timestamp - lastTick;
		lastTick = timestamp;
		elapsedInFrame += dt * playbackRate;

		const currentDuration = frames[currentFrameIndex]?.durationMs ?? 100;
		if (elapsedInFrame >= currentDuration) {
			elapsedInFrame = 0;
			advanceFrame();
		}

		drawFrame(currentFrameIndex);
		rafId = requestAnimationFrame(tick);
	}

	function startLoop() {
		stopLoop();
		if (!isPlaying || frames.length === 0) return;
		lastTick = 0;
		rafId = requestAnimationFrame(tick);
	}

	async function loadSource(url: string) {
		stopLoop();
		for (const frame of frames) {
			frame.bitmap.close();
		}
		frames = [];
		currentFrameIndex = 0;
		elapsedInFrame = 0;
		endedOnce = false;

		try {
			frames = await decodeAnimatedImage(url);
			drawFrame(0);
			startLoop();
		} catch (error) {
			onError(error);
		}
	}

	$effect(() => {
		if (!src) return;
		void loadSource(src);
	});

	$effect(() => {
		playbackRate = Math.max(0.1, initialPlaybackRate || 1);
	});

	$effect(() => {
		loopMode = initialLoopMode || 'list';
	});

	$effect(() => {
		drawFrame(currentFrameIndex);
	});

	$effect(() => {
		onSettingsChange({
			volume: 1,
			muted: false,
			playbackRate,
			loopMode
		});
	});

	$effect(() => {
		if (isPlaying) {
			startLoop();
		} else {
			stopLoop();
		}
	});

	export function playPause() {
		isPlaying = !isPlaying;
	}

	export function seekForward() {
		if (frames.length === 0) return;
		currentFrameIndex = Math.min(frames.length - 1, currentFrameIndex + 10);
		elapsedInFrame = 0;
	}

	export function seekBackward() {
		if (frames.length === 0) return;
		currentFrameIndex = Math.max(0, currentFrameIndex - 10);
		elapsedInFrame = 0;
	}

	export function setPlaybackRate(nextRate: number) {
		playbackRate = Math.max(0.1, nextRate || 1);
	}

	export function setLoopMode(nextMode: VideoLoopMode) {
		loopMode = nextMode;
	}
</script>

<div class="h-full w-full bg-black">
	<canvas bind:this={canvasRef} class="h-full w-full"></canvas>
</div>
