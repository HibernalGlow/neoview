declare module 'fast-base64' {
	export function toBytes(base64: string): Promise<Uint8Array>;
}
