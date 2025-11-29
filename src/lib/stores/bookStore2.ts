/**
 * BookStore2 - 新系统书籍状态管理（占位符）
 * 此文件为保持 stackview 等新系统组件兼容性而保留
 */

import { writable } from 'svelte/store';

// 空的占位符状态
const initialState = {
	currentIndex: 0,
	virtualPageCount: 0,
	divideLandscape: false,
	autoRotate: false
};

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const { subscribe, set, update } = writable(initialState);

export const bookStore2 = {
	subscribe,
	
	// 占位符方法
	nextPage: () => {},
	prevPage: () => {},
	goToPage: (_index: number) => {},
	openBook: async (_path: string) => {},
	closeBook: () => {},
	getVirtualPage: (_index: number) => null,
	setDivideLandscape: (_value: boolean) => {
		update(s => ({ ...s, divideLandscape: _value }));
	},
	setAutoRotate: (_value: boolean) => {
		update(s => ({ ...s, autoRotate: _value }));
	}
};
