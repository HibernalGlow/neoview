
import {
	type RowData,
	type TableOptions,
	type TableOptionsResolved,
	type TableState,
	createTable,
} from "@tanstack/table-core";

const MERGE_SOURCES_SYMBOL = Symbol("MERGE_SOURCES");

/**
 * Creates a reactive TanStack table object for Svelte.
 * @param options Table options to create the table with.
 * @returns A reactive table object.
 */
export function createSvelteTable<TData extends RowData>(options: TableOptions<TData>) {
	const baseDefaults = {
		state: {},
		onStateChange() {},
		renderFallbackValue: null,
		mergeOptions: (
			defaultOptions: TableOptions<TData>,
			options: Partial<TableOptions<TData>>
		) => {
			return mergeObjects(defaultOptions, options);
		},
	};

	const resolvedOptions: TableOptionsResolved<TData> = mergeObjects(
		baseDefaults,
		options
	);

	const table = createTable(resolvedOptions);
	let state = $state<Partial<TableState>>(table.initialState);

	function updateOptions() {
		// 【性能优化】始终与基础默认值合并，而不是与上一版本的 table.options 合并。
		// 这样可以防止每次更新时都增加一层 Proxy 嵌套。
		table.setOptions(() => {
			return mergeObjects(baseDefaults, options, {
				state: mergeObjects(state, options.state || {}),

				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				onStateChange: (updater: any) => {
					if (updater instanceof Function) state = updater(state);
					else state = mergeObjects(state, updater);

					options.onStateChange?.(updater);
				},
			});
		});
	}

	updateOptions();

	$effect.pre(() => {
		updateOptions();
	});

	return table;
}

type MaybeThunk<T extends object> = T | (() => T | null | undefined);
type Intersection<T extends readonly unknown[]> = (T extends [infer H, ...infer R]
	? H & Intersection<R>
	: unknown) & {};

/**
 * Lazily merges several objects (or thunks) while preserving
 * getter semantics from every source.
 *
 * Proxy-based to avoid known WebKit recursion issue.
 */
export function mergeObjects<Sources extends readonly MaybeThunk<object>[]>(
	...sources: Sources
): Intersection<{ [K in keyof Sources]: Sources[K] }> {
	// 【性能优化】打平嵌套的 mergeObjects 生成的代理
	const flatSources: MaybeThunk<object>[] = [];
	for (const s of sources) {
		if (s && typeof s === "object" && MERGE_SOURCES_SYMBOL in s) {
			flatSources.push(...(s[MERGE_SOURCES_SYMBOL as keyof typeof s] as MaybeThunk<object>[]));
		} else {
			flatSources.push(s);
		}
	}

	const resolve = <T extends object>(src: MaybeThunk<T>): T | undefined =>
		typeof src === "function" ? (src() ?? undefined) : src;

	// 【性能优化】缓存查找结果，避免在一次操作中反复线性查找
	// 注意：此处必须使用标准 Map 而非 SvelteMap，因为在 Proxy get 中写入 
	// 响应式状态会导致无限循环 (effect_update_depth_exceeded)
	// eslint-disable-next-line svelte/prefer-svelte-reactivity
	const lookupCache = new Map<PropertyKey, object | undefined>();

	const findSourceWithKey = (key: PropertyKey) => {
		if (lookupCache.has(key)) return lookupCache.get(key);

		for (let i = flatSources.length - 1; i >= 0; i--) {
			const obj = resolve(flatSources[i]);
			if (obj && key in obj) {
				lookupCache.set(key, obj);
				return obj;
			}
		}
		lookupCache.set(key, undefined);
		return undefined;
	};

	return new Proxy(Object.create(null), {
		get(_target, key) {
			if (key === MERGE_SOURCES_SYMBOL) return flatSources;

			const src = findSourceWithKey(key);
			return src?.[key as keyof typeof src];
		},

		has(_target, key) {
			if (key === MERGE_SOURCES_SYMBOL) return true;
			return !!findSourceWithKey(key);
		},

		ownKeys(): (string | symbol)[] {
			// eslint-disable-next-line svelte/prefer-svelte-reactivity
			const all = new Set<string | symbol>();
			for (const s of flatSources) {
				const obj = resolve(s);
				if (obj) {
					for (const k of Reflect.ownKeys(obj) as (string | symbol)[]) {
						all.add(k);
					}
				}
			}
			return [...all];
		},

		getOwnPropertyDescriptor(_target, key) {
			const src = findSourceWithKey(key);
			if (!src) return undefined;
			return {
				configurable: true,
				enumerable: true,
				value: (src as Record<PropertyKey, unknown>)[key],
				writable: true,
			};
		},
	}) as Intersection<{ [K in keyof Sources]: Sources[K] }>;
}
