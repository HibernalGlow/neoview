import { MediaQuery } from "svelte/reactivity";

// 设置为 0 以禁用移动端模式，始终使用桌面端悬停触发逻辑
const DEFAULT_MOBILE_BREAKPOINT = 0;

export class IsMobile extends MediaQuery {
	constructor(breakpoint: number = DEFAULT_MOBILE_BREAKPOINT) {
		super(`max-width: ${breakpoint - 1}px`);
	}
}
