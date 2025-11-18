import { invoke as tauriInvoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';

type CommandMap = Record<string, (...args: any[]) => Promise<unknown>>;

export interface IpcOptions {
	mockCommands?: CommandMap;
}

export class IpcService {
	private mockCommands?: CommandMap;

	constructor(options: IpcOptions = {}) {
		this.mockCommands = options.mockCommands;
	}

	async invoke<TResult = unknown>(command: string, payload?: Record<string, unknown>): Promise<TResult> {
		if (this.mockCommands && this.mockCommands[command]) {
			return (this.mockCommands[command] as (...args: any[]) => Promise<TResult>)(payload);
		}
		return tauriInvoke<TResult>(command, payload);
	}

	async on<TPayload = unknown>(event: string, handler: (payload: TPayload) => void): Promise<() => void> {
		const unlisten = await listen<TPayload>(event, (emitted) => handler(emitted.payload));
		return () => {
			void unlisten();
		};
	}
}

export const ipcService = new IpcService();










