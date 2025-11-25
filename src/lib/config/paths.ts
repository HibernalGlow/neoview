export const DEFAULT_THUMBNAIL_DIRECTORY = 'D:\\temp\\neoview';

export function normalizeThumbnailDirectoryPath(input: string | null | undefined): string {
    let value = (input ?? '').trim();
    if (!value) {
        return DEFAULT_THUMBNAIL_DIRECTORY;
    }

    value = value.replace(/\//g, '\\');

    if (value.length >= 2 && /[A-Za-z]/.test(value[0]) && value[1] === '\\') {
        if (value.length < 3 || value[2] !== ':') {
            value = `${value[0]}:\\${value.slice(2)}`;
        }
    }

    return value;
}
