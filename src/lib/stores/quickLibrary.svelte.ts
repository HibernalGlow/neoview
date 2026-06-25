/**
 * NeoView - Quick Library Store
 * 快捷库/书架视窗状态管理
 */

class QuickLibraryStore {
	#isOpen = $state(false);

	get isOpen() {
		return this.#isOpen;
	}

	set isOpen(value: boolean) {
		this.#isOpen = value;
	}

	open() {
		this.#isOpen = true;
	}

	close() {
		this.#isOpen = false;
	}

	toggle() {
		this.#isOpen = !this.#isOpen;
	}
}

export const quickLibraryStore = new QuickLibraryStore();
