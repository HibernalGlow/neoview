# AGENTS.md

## Build, Lint, and Test Commands

### Development

```bash
npm run dev              # Start dev server (port 1420)
npm run dev:web          # Web-only mode (no Tauri backend)
```

### Building

```bash
npm run build            # Build for production
npm run preview          # Preview production build
npm run tauri [command]  # Run Tauri CLI commands
```

### Type Checking

```bash
npm run check            # Run svelte-check and TypeScript check
```

### Formatting & Linting

```bash
npm run format           # Format code with Prettier (writes)
npm run lint             # Check format and ESLint (read-only)
```

### Testing

```bash
npm run test             # Run all tests
npx vitest run src/lib/stores/imageStore.test.ts  # Run single test file
npx vitest run --reporter=verbose src/lib/**/*.test.ts  # Run with verbose output
```

---

## Code Style Guidelines

### General Principles

- Use **Svelte 5 Runes** (`$state`, `$derived`, `$derived.by`, `$effect`) for reactivity
- Prefer `.svelte.ts` files for stateful logic (class-like pattern with runes)
- Keep components focused; extract complex logic to stores or utility files

### Imports

- Use `$lib` alias: `import { something } from '$lib/stores/name.svelte'`
- Group imports: 1) Svelte/ runes, 2) External libs, 3) Internal `$lib` imports, 4) Types
- Use `import type` for type-only imports

```typescript
import { effect, state } from 'svelte/reactivity';
import type { Component } from 'svelte';
import { useStore } from '$lib/stores/core.svelte';
```

### File Naming

- **Components**: `PascalCase.svelte` (e.g., `CardPanelManager.svelte`)
- **State/Store files**: `camelCase.svelte.ts` (e.g., `cardConfig.svelte.ts`)
- **Utils**: `camelCase.ts` (e.g., `imageTransitionManager.ts`)
- **Tests**: `filename.test.ts` co-located with source

### TypeScript Conventions

- Enable `strict: true` via inherited config
- Use interfaces for object shapes, types for unions/primitives
- Export types at top of file for re-export
- Avoid `any`; use `unknown` with type guards

```typescript
export interface CardConfig {
	id: string;
	panelId: PanelId;
	visible: boolean;
}

export type PanelId = 'folder' | 'book' | 'settings';
```

### Naming Conventions

- **Variables/functions**: `camelCase` (e.g., `getPanelCards`, `isVisible`)
- **Constants**: `SCREAMING_SNAKE_CASE` (e.g., `STORAGE_KEY`)
- **Classes/Types**: `PascalCase` (e.g., `ImageStore`, `PanelConfig`)
- **Booleans**: Prefix with `is`, `has`, `can` (e.g., `isExpanded`, `canHide`)

### Svelte 5 Patterns

#### State Management

```typescript
// State file (.svelte.ts)
function createStore() {
	let value = $state(initialValue);

	function setValue(val: T) {
		value = val;
		saveToStorage();
	}

	return {
		get value() {
			return value;
		},
		setValue
	};
}
```

#### Derived State

```typescript
// Use $derived for simple derivations
const filteredItems = $derived(items.filter(predicate));

// Use $derived.by for complex computations
const summary = $derived.by(() => {
	return computeSummary(data);
});
```

#### Effects

```typescript
$effect(() => {
	// Track dependencies automatically
	saveToStorage(config.value);
	return () => {
		/* cleanup */
	};
});
```

### Component Structure (`.svelte`)

```svelte
<script lang="ts">
	// 1. Imports (grouped)
	import type { Props } from './types';

	// 2. Props with defaults
	let { title = 'Default' }: Props = $props();

	// 3. State (if needed in component)
	let isOpen = $state(false);

	// 4. Derived/computed
	let displayTitle = $derived(isOpen ? title : '...');
</script>

<!-- Template -->
<div class="panel">
	<header>{displayTitle}</header>
</div>

<style>
	/* CSS if not using Tailwind */
</style>
```

### Tailwind CSS

- Use Tailwind v4 with `@tailwindcss/vite`
- Prefer utility classes over custom CSS
- Use `cn()` helper (`clsx` + `tailwind-merge`) for conditional classes

```svelte
<div class={cn(
    'base-class',
    condition && 'conditional-class',
    variant === 'primary' && 'bg-primary'
)}>
```

### Error Handling

- Use `try/catch` with typed errors
- Log warnings with context for recoverable errors
- Propagate critical errors to user via toast/store

```typescript
try {
	await loadData();
} catch (e) {
	console.warn('Failed to load panel data:', e);
	errorStore.set('Unable to load data. Please try again.');
}
```

### Persistence

- Use `localStorage` with versioning for user configs
- Include version constant: `const CURRENT_CONFIG_VERSION = 13;`
- Handle migration: clear storage on version mismatch

```typescript
const STORAGE_KEY = `neoview_card_configs_v${CURRENT_CONFIG_VERSION}`;
```

### Testing

- Use `vitest` with `fast-check` for property-based tests
- Mock dependencies with `vi.mock()`
- Co-locate tests: `imageStore.test.ts` next to `imageStore.svelte.ts`

```typescript
describe('imageStore dimension cache', () => {
	it('should return consistent dimensions', () => {
		fc.assert(
			fc.property(validPageIndex, (index) => {
				// test logic
			}),
			{ numRuns: 100 }
		);
	});
});
```

### Git Conventions

- Feature branches: `feature/description` or `feat/component-name`
- Bug fixes: `fix/issue-description`
- Commit messages: Present tense, imperative mood (`"Add card drag sorting"`)

---

## Project Structure

```
src/
├── lib/
│   ├── cards/          # Card components and definitions
│   ├── components/     # UI components (panels, ui/, common/)
│   ├── stores/         # State stores (.svelte.ts files)
│   ├── actions/        # Svelte actions
│   ├── utils/          # Utility functions
│   └── settings/       # Settings management
├── routes/             # SvelteKit routes (if used)
└── app.html
```

---

## Key Dependencies

- **Framework**: Svelte 5 + SvelteKit (or raw Svelte)
- **UI**: shadcn-svelte + bits-ui + Tailwind v4
- **State**: Svelte 5 Runes
- **Table**: TanStack Table v8
- **Testing**: Vitest + fast-check
- **Build**: Vite + Tauri 2
