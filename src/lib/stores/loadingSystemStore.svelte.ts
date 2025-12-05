/**
 * 加载系统切换 Store
 * 
 * 管理新旧加载系统的切换：
 * - legacy: 老的前端主导加载系统（imageReader, preloadManager 等）
 * - neoview: 新的后端主导加载系统（pageManager）
 */

export type LoadingSystem = 'legacy' | 'neoview';

const STORAGE_KEY = 'neoview-loading-system';

function createLoadingSystemStore() {
	// 从 localStorage 加载
	function loadSystem(): LoadingSystem {
		try {
			const stored = localStorage.getItem(STORAGE_KEY);
			if (stored === 'legacy' || stored === 'neoview') {
				return stored;
			}
		} catch {
			// 忽略
		}
		// 默认使用新系统
		return 'neoview';
	}

	let system = $state<LoadingSystem>(loadSystem());

	function saveSystem() {
		try {
			localStorage.setItem(STORAGE_KEY, system);
		} catch {
			// 忽略
		}
	}

	/**
	 * 设置加载系统
	 */
	function setSystem(newSystem: LoadingSystem) {
		if (system !== newSystem) {
			system = newSystem;
			saveSystem();
			console.log(`🔄 切换加载系统: ${newSystem === 'neoview' ? 'NeoView (后端主导)' : 'Legacy (前端主导)'}`);
		}
	}

	/**
	 * 切换加载系统
	 */
	function toggle() {
		setSystem(system === 'neoview' ? 'legacy' : 'neoview');
	}

	/**
	 * 使用新系统
	 */
	function useNeoView() {
		setSystem('neoview');
	}

	/**
	 * 使用旧系统
	 */
	function useLegacy() {
		setSystem('legacy');
	}

	return {
		// 状态
		get system() { return system; },
		get isNeoView() { return system === 'neoview'; },
		get isLegacy() { return system === 'legacy'; },
		
		// 标签
		get label() {
			return system === 'neoview' ? 'NeoView (后端)' : 'Legacy (前端)';
		},
		get description() {
			return system === 'neoview'
				? '后端主导加载，自动预加载和缓存管理'
				: '前端主导加载，手动控制预加载';
		},
		
		// 方法
		setSystem,
		toggle,
		useNeoView,
		useLegacy
	};
}

export const loadingSystemStore = createLoadingSystemStore();
