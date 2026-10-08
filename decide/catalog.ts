const NAMESPACE = 'decide'
const CE_EXTENSION = '.ce.ts'

/**
 * Transform import globs into a clean catalog structure.
 *
 * A catalog is a lookup table and nothing more: each entry is a tag and the loader that resolves it,
 * and the loaders are the only thing this file names. Every module the globs find is a `.ce.ts` -
 * the custom element a `<name>.ce.vue` becomes (see [`vue-ce.ts`](./vue-ce.ts)) - so the Vue runtime
 * belongs to a component's chunk rather than to this one's. A catalog that imports its framework
 * drags it into the graph of everyone who reads the catalog, the shell included.
 *
 * `import: 'default'` because a loader has to resolve to the element class itself, not to the module
 * namespace it is exported from.
 */
function asCatalogMap(import_globs: Record<string, () => void>) {
    const clean_fn = ([filepath, import_fn]) => {
        const [_prefix, type, filename] = filepath.split('/')
        const ce_name = `${NAMESPACE}-${type}-${filename}`.replaceAll(CE_EXTENSION, '')
        return [ce_name, import_fn]
    }
    return Object.fromEntries(Object.entries(import_globs).map(clean_fn))
}

export const pages = asCatalogMap(import.meta.glob(`./pages/**/*.ce.ts`, { eager: false, import: 'default' }))
export const components = asCatalogMap(import.meta.glob(`./components/**/*.ce.ts`, { eager: false, import: 'default' }));

export const catalog = {
    ...pages,
    ...components,
};

export default catalog;

