<script lang="ts">
	/**
	 * NeoView - Sidebar Management Panel Component
	 * 边栏管理面板 - 类似Notion的三区域拖拽布局管理
	 */
	
	// 边栏管理状态
	let sidebarManagement = $state({
		// 可用面板列表
		availablePanels: [
			{ id: 'fileBrowser', name: '文件浏览器', icon: '📁', category: '导航' },
			{ id: 'bookmark', name: '书签', icon: '🔖', category: '导航' },
			{ id: 'thumbnail', name: '缩略图', icon: '🖼️', category: '导航' },
			{ id: 'metadata', name: '元数据', icon: '📋', category: '信息' },
			{ id: 'history', name: '历史记录', icon: '📚', category: '导航' },
			{ id: 'search', name: '搜索', icon: '🔍', category: '工具' },
			{ id: 'filter', name: '过滤器', icon: '🎛️', category: '工具' },
			{ id: 'tools', name: '工具', icon: '🔧', category: '工具' }
		],
		// 等待区面板
		waitingArea: [] as Array<{ id: string, name: string, icon: string, category: string }>,
		// 左侧栏面板
		leftSidebar: [] as Array<{ id: string, name: string, icon: string, category: string }>,
		// 右侧栏面板
		rightSidebar: [] as Array<{ id: string, name: string, icon: string, category: string }>,
	});

	// 拖拽状态
	let draggedPanel = $state<{ panel: any, source: string } | null>(null);
	let dragOverArea = $state<string | null>(null);

	// 拖拽处理函数
	function handleDragStart(event: DragEvent, panel: any, source: string) {
		draggedPanel = { panel, source };
		if (event.dataTransfer) {
			event.dataTransfer.effectAllowed = 'move';
		}
	}

	function handleDragOver(event: DragEvent, targetArea: string) {
		event.preventDefault();
		dragOverArea = targetArea;
		if (event.dataTransfer) {
			event.dataTransfer.dropEffect = 'move';
		}
	}

	function handleDragLeave() {
		dragOverArea = null;
	}

	function handleDrop(event: DragEvent, targetArea: string) {
		event.preventDefault();
		dragOverArea = null;

		if (!draggedPanel) return;

		const { panel, source } = draggedPanel;

		// 从源区域移除
		if (source === 'waitingArea') {
			sidebarManagement.waitingArea = sidebarManagement.waitingArea.filter(p => p.id !== panel.id);
		} else if (source === 'leftSidebar') {
			sidebarManagement.leftSidebar = sidebarManagement.leftSidebar.filter(p => p.id !== panel.id);
		} else if (source === 'rightSidebar') {
			sidebarManagement.rightSidebar = sidebarManagement.rightSidebar.filter(p => p.id !== panel.id);
		}

		// 添加到目标区域
		if (targetArea === 'waitingArea') {
			if (!sidebarManagement.waitingArea.find(p => p.id === panel.id)) {
				sidebarManagement.waitingArea.push(panel);
			}
		} else if (targetArea === 'leftSidebar') {
			if (!sidebarManagement.leftSidebar.find(p => p.id === panel.id)) {
				sidebarManagement.leftSidebar.push(panel);
			}
		} else if (targetArea === 'rightSidebar') {
			if (!sidebarManagement.rightSidebar.find(p => p.id === panel.id)) {
				sidebarManagement.rightSidebar.push(panel);
			}
		}

		// 保存到localStorage
		saveSidebarLayout();

		draggedPanel = null;
	}

	// 保存布局到localStorage
	function saveSidebarLayout() {
		localStorage.setItem('neoview-sidebar-management', JSON.stringify({
			waitingArea: sidebarManagement.waitingArea,
			leftSidebar: sidebarManagement.leftSidebar,
			rightSidebar: sidebarManagement.rightSidebar
		}));
	}

	// 初始化面板到等待区
	function initializeSidebarPanels() {
		const savedPanels = localStorage.getItem('neoview-sidebar-management');
		if (savedPanels) {
			try {
				const saved = JSON.parse(savedPanels);
				sidebarManagement.waitingArea = saved.waitingArea || [];
				sidebarManagement.leftSidebar = saved.leftSidebar || [];
				sidebarManagement.rightSidebar = saved.rightSidebar || [];
			} catch (e) {
				console.error('Failed to load sidebar management:', e);
				// 默认将所有面板放入等待区
				sidebarManagement.waitingArea = [...sidebarManagement.availablePanels];
			}
		} else {
			// 默认将所有面板放入等待区
			sidebarManagement.waitingArea = [...sidebarManagement.availablePanels];
		}
	}

	// 重置布局
	function resetLayout() {
		if (confirm('确定要重置所有面板布局吗？')) {
			sidebarManagement.waitingArea = [...sidebarManagement.availablePanels];
			sidebarManagement.leftSidebar = [];
			sidebarManagement.rightSidebar = [];
			saveSidebarLayout();
		}
	}

	// 初始化
	$effect(() => {
		initializeSidebarPanels();
	});
</script>

<div class="p-6 space-y-6">
	<div class="space-y-2">
		<h3 class="text-lg font-semibold">边栏管理</h3>
		<p class="text-sm text-muted-foreground">拖拽面板到不同区域来自定义您的界面布局</p>
	</div>

	<!-- 操作按钮 -->
	<div class="flex items-center gap-2">
		<button 
			type="button"
			class="px-3 py-1.5 text-sm bg-secondary hover:bg-secondary/80 rounded-md transition-colors"
			onclick={resetLayout}
		>
			重置布局
		</button>
	</div>

	<!-- 三栏布局 -->
	<div class="grid grid-cols-3 gap-4 min-h-[400px]">
		<!-- 等待区 -->
		<div 
			class="border-2 border-dashed rounded-lg p-4 {dragOverArea === 'waitingArea' ? 'border-primary bg-primary/5' : 'border-muted-foreground/30'}"
			ondragover={(e) => handleDragOver(e, 'waitingArea')}
			ondragleave={handleDragLeave}
			ondrop={(e) => handleDrop(e, 'waitingArea')}
		>
			<h4 class="font-medium text-sm mb-3 text-center">等待区</h4>
			<div class="space-y-2 min-h-[300px]">
				{#each sidebarManagement.waitingArea as panel}
					<div 
						class="bg-card border rounded-md p-3 hover:bg-accent/50 transition-colors"
					>
						<div class="flex items-center gap-2">
							<!-- 拖拽手柄 -->
							<div 
								class="cursor-grab active:cursor-grabbing p-1 hover:bg-accent/50 rounded"
								draggable="true"
								ondragstart={(e) => handleDragStart(e, panel, 'waitingArea')}
							>
								<svg class="w-4 h-4 text-muted-foreground" fill="currentColor" viewBox="0 0 20 20">
									<path d="M7 2a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM7 8a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM7 14a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM13 2a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM13 8a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM13 14a2 2 0 1 0 0 4 2 2 0 0 0 0-4z"/>
								</svg>
							</div>
							<span class="text-lg">{panel.icon}</span>
							<div>
								<div class="font-medium text-sm">{panel.name}</div>
								<div class="text-xs text-muted-foreground">{panel.category}</div>
							</div>
						</div>
					</div>
				{/each}
				{#if sidebarManagement.waitingArea.length === 0}
					<div class="text-center text-muted-foreground text-sm py-8">
						拖拽面板到这里
					</div>
				{/if}
			</div>
		</div>

		<!-- 左侧栏 -->
		<div 
			class="border-2 border-dashed rounded-lg p-4 {dragOverArea === 'leftSidebar' ? 'border-primary bg-primary/5' : 'border-muted-foreground/30'}"
			ondragover={(e) => handleDragOver(e, 'leftSidebar')}
			ondragleave={handleDragLeave}
			ondrop={(e) => handleDrop(e, 'leftSidebar')}
		>
			<h4 class="font-medium text-sm mb-3 text-center">左侧栏</h4>
			<div class="space-y-2 min-h-[300px]">
				{#each sidebarManagement.leftSidebar as panel}
					<div 
						class="bg-card border rounded-md p-3 hover:bg-accent/50 transition-colors"
					>
						<div class="flex items-center gap-2">
							<!-- 拖拽手柄 -->
							<div 
								class="cursor-grab active:cursor-grabbing p-1 hover:bg-accent/50 rounded"
								draggable="true"
								ondragstart={(e) => handleDragStart(e, panel, 'leftSidebar')}
							>
								<svg class="w-4 h-4 text-muted-foreground" fill="currentColor" viewBox="0 0 20 20">
									<path d="M7 2a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM7 8a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM7 14a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM13 2a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM13 8a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM13 14a2 2 0 1 0 0 4 2 2 0 0 0 0-4z"/>
								</svg>
							</div>
							<span class="text-lg">{panel.icon}</span>
							<div>
								<div class="font-medium text-sm">{panel.name}</div>
								<div class="text-xs text-muted-foreground">{panel.category}</div>
							</div>
						</div>
					</div>
				{/each}
				{#if sidebarManagement.leftSidebar.length === 0}
					<div class="text-center text-muted-foreground text-sm py-8">
						拖拽面板到这里
					</div>
				{/if}
			</div>
		</div>

		<!-- 右侧栏 -->
		<div 
			class="border-2 border-dashed rounded-lg p-4 {dragOverArea === 'rightSidebar' ? 'border-primary bg-primary/5' : 'border-muted-foreground/30'}"
			ondragover={(e) => handleDragOver(e, 'rightSidebar')}
			ondragleave={handleDragLeave}
			ondrop={(e) => handleDrop(e, 'rightSidebar')}
		>
			<h4 class="font-medium text-sm mb-3 text-center">右侧栏</h4>
			<div class="space-y-2 min-h-[300px]">
				{#each sidebarManagement.rightSidebar as panel}
					<div 
						class="bg-card border rounded-md p-3 hover:bg-accent/50 transition-colors"
					>
						<div class="flex items-center gap-2">
							<!-- 拖拽手柄 -->
							<div 
								class="cursor-grab active:cursor-grabbing p-1 hover:bg-accent/50 rounded"
								draggable="true"
								ondragstart={(e) => handleDragStart(e, panel, 'rightSidebar')}
							>
								<svg class="w-4 h-4 text-muted-foreground" fill="currentColor" viewBox="0 0 20 20">
									<path d="M7 2a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM7 8a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM7 14a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM13 2a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM13 8a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM13 14a2 2 0 1 0 0 4 2 2 0 0 0 0-4z"/>
								</svg>
							</div>
							<span class="text-lg">{panel.icon}</span>
							<div>
								<div class="font-medium text-sm">{panel.name}</div>
								<div class="text-xs text-muted-foreground">{panel.category}</div>
							</div>
						</div>
					</div>
				{/each}
				{#if sidebarManagement.rightSidebar.length === 0}
					<div class="text-center text-muted-foreground text-sm py-8">
						拖拽面板到这里
					</div>
				{/if}
			</div>
		</div>
	</div>

	<!-- 说明信息 -->
	<div class="mt-6 p-4 bg-muted/30 rounded-lg">
		<h4 class="font-medium text-sm mb-2">使用说明</h4>
		<ul class="text-sm text-muted-foreground space-y-1">
			<li>• 拖拽面板到不同区域来调整布局</li>
			<li>• 等待区：存放未使用的面板</li>
			<li>• 左侧栏/右侧栏：显示激活的面板</li>
			<li>• 布局会自动保存</li>
		</ul>
	</div>
</div>