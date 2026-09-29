const folderMap = {
    "c": "components/",
    "p": "pages/",
}

export const catalog = {
    "checkout-*": async (ce_name: string) => {

        let module = null;
        const [_prefix, type, name] = ce_name.split('-');
        const folder = folderMap[type] || `components/`
        const module_url = `./${folder}${name}.ce.svelte`;

        try {
            module = (await import(/* @vite-ignore */ module_url)).default;
        } catch (e) {
            throw new Error(`Cant import file ${module_url}`);
        }

        if (typeof module !== "function") {
            throw new Error(`Invalid export of ${module_url}`)
        } else {
            return module;
        }

        return module;
    }
};
export default catalog;