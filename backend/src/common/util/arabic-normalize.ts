const TASHKEEL_RE = /[\u064B-\u0652\u0670\u0640]/g

export function arabicNormalize(input: string): string {
    return input
        .trim()
        .toLowerCase()
        .replace(TASHKEEL_RE, '')
        .replace(/[أإآٱ]/g, 'ا')
        .replace(/ى/g, 'ي')
        .replace(/ة/g, 'ه')
        .replace(/ؤ/g, 'و')
        .replace(/ئ/g, 'ي')
        .replace(/\s+/g, ' ')
}
