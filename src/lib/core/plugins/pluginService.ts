export interface PluginManifest {
	id: string;
	name: string;
	version: string;
	description?: string;
	author?: string;
	permissions?: string[];
	entry: () => Promise<void> | void;
}

export class PluginService {
	private registry = new Map<string, PluginManifest>();
	private loaded = new Set<string>();

	register(manifest: PluginManifest): void {
		if (this.registry.has(manifest.id)) {
			throw new Error(`Plugin ${manifest.id} already registered`);
		}
		this.registry.set(manifest.id, manifest);
	}

	async activate(id: string): Promise<void> {
		const manifest = this.registry.get(id);
		if (!manifest) {
			throw new Error(`Plugin ${id} not found`);
		}
		if (this.loaded.has(id)) {
			return;
		}
		await manifest.entry();
		this.loaded.add(id);
	}

	getPlugins(): PluginManifest[] {
		return Array.from(this.registry.values());
	}
}

export const pluginService = new PluginService();





