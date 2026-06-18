import type { ActionBinding } from '$lib/stores/keybindings/types';

export interface ActionProvider {
	id: string;
	getBindings: () => ActionBinding[];
	execute?: (action: string) => boolean | Promise<boolean>;
}

type ActionProviderModule = {
	actionProvider?: ActionProvider;
	default?: ActionProvider;
};

const providerModules = import.meta.glob('./providers/*.ts', {
	eager: true
}) as Record<string, ActionProviderModule>;

function cloneBinding(binding: ActionBinding): ActionBinding {
	return {
		...binding,
		bindings: binding.bindings.map((input) => ({ ...input })),
		contextBindings: binding.contextBindings?.map((contextBinding) => ({
			...contextBinding,
			input: { ...contextBinding.input }
		}))
	};
}

function getActionProviders(): ActionProvider[] {
	return Object.values(providerModules)
		.map((module) => module.actionProvider ?? module.default)
		.filter((provider): provider is ActionProvider => Boolean(provider));
}

function mergeActionBindings(bindings: ActionBinding[]): ActionBinding[] {
	const seen = new Set<string>();
	const merged: ActionBinding[] = [];

	for (const binding of bindings) {
		if (seen.has(binding.action)) continue;
		seen.add(binding.action);
		merged.push(cloneBinding(binding));
	}

	return merged;
}

export function getProvidedActionBindings(): ActionBinding[] {
	return mergeActionBindings(getActionProviders().flatMap((provider) => provider.getBindings()));
}

export function buildDefaultActionBindings(coreBindings: ActionBinding[]): ActionBinding[] {
	return mergeActionBindings([...coreBindings, ...getProvidedActionBindings()]);
}

export async function executeProvidedAction(action: string): Promise<boolean> {
	for (const provider of getActionProviders()) {
		const handled = await provider.execute?.(action);
		if (handled) return true;
	}
	return false;
}

export function executeProvidedActionSync(action: string): boolean {
	for (const provider of getActionProviders()) {
		const handled = provider.execute?.(action);
		if (!handled) continue;
		if (typeof (handled as Promise<boolean>).then === 'function') {
			void (handled as Promise<boolean>).catch((error) => {
				console.error(`[actionRegistry] Provider action failed: ${action}`, error);
			});
		}
		return true;
	}
	return false;
}
