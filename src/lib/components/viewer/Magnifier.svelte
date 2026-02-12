<script lang="ts">
	import { spring } from 'svelte/motion';

	let {
		imageUrl,
        containerRect,
        imageWidth,
        imageHeight,
		zoom = 2.0,
		size = 200,
		enabled = false
	}: {
		imageUrl: string;
        containerRect: DOMRect | null;
        imageWidth?: number;
        imageHeight?: number;
		zoom?: number;
		size?: number;
		enabled?: boolean;
	} = $props();

	// Mouse position state
	let mouseX = $state(0);
	let mouseY = $state(0);
	let isVisible = $state(false);

	// Smooth movement for the lens itself
	const pos = spring({ x: 0, y: 0 }, {
		stiffness: 0.2,
		damping: 0.8
	});

	function handleMouseMove(e: MouseEvent) {
		if (!enabled) return;
		mouseX = e.clientX;
		mouseY = e.clientY;
		pos.set({ x: mouseX, y: mouseY });
		isVisible = true;
	}
    
    function handleMouseEnter() {
        if (enabled) isVisible = true;
    }

	function handleMouseLeave() {
		isVisible = false;
	}

	$effect(() => {
		if (enabled) {
			window.addEventListener('mousemove', handleMouseMove);
            window.addEventListener('mouseenter', handleMouseEnter);
			window.addEventListener('mouseout', handleMouseLeave);
		} else {
			isVisible = false;
		}
		return () => {
			window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseenter', handleMouseEnter);
			window.removeEventListener('mouseout', handleMouseLeave);
		};
	});

    // Calculate background styles
    let lensStyle = $derived.by(() => {
        if (!containerRect) return 'display: none;';

        const containerW = containerRect.width;
        const containerH = containerRect.height;
        
        // Calculate the "contained" size of the image within the container
        let renderW = containerW;
        let renderH = containerH;
        let offsetX = 0;
        let offsetY = 0;

        if (imageWidth && imageHeight) {
            const containerRatio = containerW / containerH;
            const imageRatio = imageWidth / imageHeight;

            if (imageRatio > containerRatio) {
                // Constraints by width
                renderW = containerW;
                renderH = containerW / imageRatio;
                offsetY = (containerH - renderH) / 2;
            } else {
                // Constraints by height
                renderH = containerH;
                renderW = containerH * imageRatio;
                offsetX = (containerW - renderW) / 2;
            }
        }
        
        // Lens position on screen (centered on mouse)
        const left = $pos.x - size / 2;
        const top = $pos.y - size / 2;
        
        // Calculate background position relative to the container
        const relX = $pos.x - containerRect.left;
        const relY = $pos.y - containerRect.top;
        
        // Adjust relative coordinates to be relative to the actual image area
        const imgX = relX - offsetX;
        const imgY = relY - offsetY;

        // Calculate background position
        // We want the point (imgX/renderW, imgY/renderH) of the image to be at the lens center
        // The background size is (renderW * zoom, renderH * zoom)
        
        const zoomW = renderW * zoom;
        const zoomH = renderH * zoom;

        const bgPosX = (size / 2) - (imgX * zoom);
        const bgPosY = (size / 2) - (imgY * zoom);
        
        return `
            width: ${size}px;
            height: ${size}px;
            left: ${left}px;
            top: ${top}px;
            display: ${isVisible && enabled ? 'block' : 'none'};
            background-image: url('${imageUrl}');
            background-repeat: no-repeat;
            background-position: ${bgPosX}px ${bgPosY}px;
            background-size: ${zoomW}px ${zoomH}px;
        `;
    });

</script>

<div class="magnifier-lens" style={lensStyle}></div>

<style>
	.magnifier-lens {
		position: fixed;
		z-index: 9999;
		border-radius: 50%;
		border: 2px solid rgba(255, 255, 255, 0.5);
		box-shadow: 0 4px 8px rgba(0, 0, 0, 0.3), inset 0 0 20px rgba(0,0,0,0.1);
		pointer-events: none;
        background-color: var(--background, #000);
        will-change: transform, left, top, background-position;
	}
</style>
