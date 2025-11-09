/**
 * NavigationHistory - 文件浏览导航历史管理
 * 支持前进、后退、主页功能
 */

export class NavigationHistory {
	private history: string[] = [];
	private currentIndex: number = -1;
	private homepage: string = '';
	private maxHistorySize: number = 50;

	constructor(homepage: string = '') {
		this.homepage = homepage;
	}

	/**
	 * 设置主页路径
	 */
	setHomepage(path: string) {
		this.homepage = path;
	}

	/**
	 * 获取主页路径
	 */
	getHomepage(): string {
		return this.homepage;
	}

	/**
	 * 添加新路径到历史记录
	 */
	push(path: string) {
		// 如果当前不在历史记录末尾，删除后面的记录
		if (this.currentIndex < this.history.length - 1) {
			this.history = this.history.slice(0, this.currentIndex + 1);
		}

		// 如果新路径与当前路径相同，不添加
		if (this.history[this.currentIndex] === path) {
			return;
		}

		this.history.push(path);
		this.currentIndex = this.history.length - 1;

		// 限制历史记录大小
		if (this.history.length > this.maxHistorySize) {
			this.history = this.history.slice(-this.maxHistorySize);
			this.currentIndex = this.history.length - 1;
		}
	}

	/**
	 * 后退
	 */
	back(): string | null {
		if (this.canGoBack()) {
			this.currentIndex--;
			return this.history[this.currentIndex];
		}
		return null;
	}

	/**
	 * 前进
	 */
	forward(): string | null {
		if (this.canGoForward()) {
			this.currentIndex++;
			return this.history[this.currentIndex];
		}
		return null;
	}

	/**
	 * 能否后退
	 */
	canGoBack(): boolean {
		return this.currentIndex > 0;
	}

	/**
	 * 能否前进
	 */
	canGoForward(): boolean {
		return this.currentIndex < this.history.length - 1;
	}

	/**
	 * 获取当前路径
	 */
	getCurrentPath(): string | null {
		return this.history[this.currentIndex] || null;
	}

	/**
	 * 清空历史记录
	 */
	clear() {
		this.history = [];
		this.currentIndex = -1;
	}

	/**
	 * 获取历史记录统计
	 */
	getStats() {
		return {
			total: this.history.length,
			currentIndex: this.currentIndex,
			canGoBack: this.canGoBack(),
			canGoForward: this.canGoForward()
		};
	}
}
