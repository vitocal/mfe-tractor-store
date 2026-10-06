// export const catalog = {
//     "checkout-*": async (ce_name: string) => {

//         let module = null;
//         const [_prefix, type, name] = ce_name.split('-');
//         const module_url = `./${type}/${name}.ce.svelte`;

//         try {
//             module = (await import(/* @vite-ignore */ module_url)).default;
//         } catch (e) {
//             throw new Error(`Cant import file ${module_url}`);
//         }

//         if (typeof module !== "function") {
//             throw new Error(`Invalid export of ${module_url}`)
//         } else {
//             return module;
//         }

//         return module;
//     }
// };

const NAMESPACE = 'checkout'
const CE_EXTENSION = '.ce.svelte'

// export const catalog = {
//     "decide-*": async (ce_name: string) => {
//         const { defineCustomElement } = await import("vue");

//         let module = null;
//         const [_prefix, type, name] = ce_name.split('-');
//         const folder = folderMap[type] || `components/`
//         const module_url = `./${folder}${name}.ce.vue`;
//         try {
//             module = (await import(/* @vite-ignore */ module_url)).default;
//         } catch (e) {
//             throw new Error(`Cant import file ${module_url}`);
//         }

//         if (!module['render']) {
//             throw new Error(`Invalid export of ${module_url}`)
//         } else {
//             return defineCustomElement(module, { shadowRoot: false })
//         }
//     }
// };

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