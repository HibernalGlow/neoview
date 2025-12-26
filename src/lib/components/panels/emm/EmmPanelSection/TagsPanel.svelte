<scs">
/**
 * 标签管理面板
 * 从
 * 负责显示和管理
 */
importte';
import * as Button;
import { emmMetadat;
import type { EM';
import type { Vvelte';

// Props 定义
interface Props {
	bookInfo: ViewerBookInf;
	collectTags: EMMCollectTag[];
	order: number;
	canMoveUp: boolean;
	canMoveDown: boolean;
	onMoveUp: () => void;
	onMoveDod;
	onRefreshCollectTags: () => void;
}

let {
	bookInfo,
	collectTags,
	order,
	canMoveUp,
	canMoveDown,
	onMoveUp,
	onM
	onRefreshCollec
}: Props;

// 本地存储键
const TAG_VIEW_MODE_STORAGE_KEY = 'e';
const TAG_FILTER_MO;

// 标签视图状态
let tagViewMode = $state<'flat' | 'grouped'>('grouped');
let tagFilterMode = $state<'a
let showTagsCard = $state(true);

// 翻译字典
const translationDict = $derived.by(() => {
	return ect();
});

// 所有标签（带收藏状态）

	if (!
		return [];
	}

	const
		categor
		tag: string;
		isCollect: boolean;
		color?: string;
		display?: string;
	}> = [];
	const magMap;
	const normalize = (s);

	gs)) {
		for (const tag ist) {
			const fullTagKey = norma);
			let collectTag = map.Key);

			if (!colTag) {
				collectTag = map.get(g));
			}

			const ;
			const translatedTag = emmTran);
			const sho);
			const displayStr = `${shortCate;

			tags.push({
				category,
				tag,
				isCollect,
				color: collectr,
				display: displayStr
			});
		}
	}

	/在前面
	return tags.sort((a, b) => {
		if (a.isCollecn -1;
		if (!a.isCollectn 1;
		return 0;
	});
});

// 根据过滤模式显示的标签
const displayTags = $derived(() => {
	const tags = al);
	if (tagFilterMode === 'collect') {
		ret;
	}
	return tags;
});

// 分组后的标签
const groupedTa
	const tags = displayTags();
	const groups: Array<{
		category: string;
		shortCategory: string;
		items: typ
	}> = [];

	const groupMags }>();

	for (con{
		const key = tag.category;
		let group = groupMap.get(key);
		if (!group) {
			group = {
				category: key,
				shortCategokey),
				items]
			};
			groupMap.set(key, group);
			groups.push(group);
		}
		group.items.push(tag);
	}

	return groups;
});

// 获取标签的 tooltip 内容
function getTagTitle(tagInfo: { clean }) {
	const raw = `${tagInfoag}`;
	const lines: string[] = [`原始: ${raw}`];
	if (tagInfo.display && t) {
		lines.pus
	}
	t) {
		lines.push('状态: 收藏标签');
	}
	return lines.jo;
}

// 从本地存储加载视图偏好
$effect(() => {
	if (typeoreturn;
	tr
		const stor
		if (storedView === 'flat' || stor{
			tagViewMode = storedView;
		}
		const storedFilter
		if (storedFilter === 'all' || storedFilter === 'collect') {
			tagFilterMode = storedFilter;
		}
	}
		console.error('[TagsPanerr);
	}
});

地存储
$effect(> {
	const m
	in;
	try {
		localStorage.setItem(TAG
	} catch (err) {
		console.e;
	}
});

// 存储

	const fil
	iurn;
	try {
		localStorage.setItem;
	} catch (err) {
		conso', err);
	}
});
</pt>

ngth > 0}
	<div 
		" 
		style={`order: ${order}`}
	>
		<!-- 标题栏 -->
		<div class="flex items-center2">
			<div class="flex items-center gap-2 font-semibold text-sm">
				<Tag class="h-4 w-4" />

				<span class="text-[10px] t>
					(已加载收藏: {collectTags.length})
				</span>
				
				<!-- 视图切换按钮 -->
				<div clal">
					<span class="
	
'}
						size="sm"
		"
						onclick={() => 
					>
					
					</Button.Root>
					<Button.Root
						variant={tagViewMode === 'grouped' ?utline'}
						size="sm"
						class="h-6 px-2 text-[10px]"
						onclick={() => (tagouped')}
			
	分组
					</Button.Root>
		>
n.Root
						variant={'}
						size="
						class="h-6 px]"
						onclick={() => (tagFilterMode
>
						全部
					</Button.Root>
					<Button.Root
						variant={te'}
						size="sm"
						class="h-6 px-2 text-[10px]"
						onclick={() => (tagFilt}
					>
						收藏
					</Button.Root>
				</div>
	
				<!-- 刷新按钮 -->
				<Button.Root
					variant="ghost"
					size="icon"
					class="h-5 w-5 ml-1"
					title="重新加载收藏标签"
				}

					<svg
						xmlns/svg"
						width"12"
						height="12"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-w="2"
						strok
			und"
		>
						<path
						<path d="M3 3v5h5" />
					</svg>
				</Button.Root>
			</div>
			
			<!--钮 -->
			<10px]">
	Root
					variant="ghost"
					size="icon"
					class="
					onclick={() => )}
				'展开'}
				>
					{#id}
						<ChevronUp class="h-3 w-3" />
					{:else}
						<ChevronDown class="h-3 w-3" />
					{/if}
>
			t
					variant="ghost"
					size="icon"
				h-5 w-5"
					onclick={onMoveUp}
					disabled={!canMoveUp}
					title="上移"
				>
/>
				</Button.Root>
				<Button.Root
					vari
					size="con"
					class="h-55"
					onclick={onMo
					disabled={!cveDown}
					title="下移"
				>
		/>
>
			</div>
		</div>

		<!-- 标签内容 -->
		{#ird}
			t'}
				<!-- 扁平视图 -->
				<div class="flex flex-wrap gap-1.5">
gInfo}
						
							class="inlinet
								? 'font-semibold'
								: 'bg-muted border-border/60 text-muted-for}"
			lect

								: ''}
							title={getTagTitle(tagInfo)}
						>
isplay}
						</span>
					{/each}
				</div>
			{:else
				<!-- 分组视图 -->
-2">
				
						<div class="space-y-1">
		>
				)
						iv>
	">
								{#each group.items as tagInfo}
									<span
										class="inline-
											? 'font-ld'
											: 'bg-muted border}"
				
											? `background-color: $};`
											: ''}
										title={getTagT(tagInfo)}
									>
lay}
									</span>
								{/each}
							</div>
						</div>
					{/each}
				</
			{/if}
		{/if}
	</div>
{/if}
