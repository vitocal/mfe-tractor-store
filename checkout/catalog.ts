const NAMESPACE = 'checkout'
const CE_EXTENSION = '.ce.svelte'

/** Transform import globs into a clean catalog structure */
function asCatalogMap(import_globs: Record<string, () => void>) {
    const clean_fn = ([filepath, import_fn]) => {
        const [_prefix, type, filename] = filepath.split('/')
        const ce_name = `${NAMESPACE}-${type}-${filename}`.replaceAll(CE_EXTENSION, '')
        return [ce_name, import_fn]
    }
    return Object.fromEntries(Object.entries(import_globs).map(clean_fn))
}

export const pages = asCatalogMap(import.meta.glob(`./pages/**/*.ce.svelte`, { eager: false }))
export const components = asCatalogMap(import.meta.glob(`./components/**/*.ce.svelte`, { eager: false }));
export const catalog = {
    ...pages,
    ...components,
};

export default catalog;