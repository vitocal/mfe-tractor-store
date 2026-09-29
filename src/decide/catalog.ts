import { HTMLAttributes } from "preact";

const folderMap = {
    "c": "components/",
    "components": "components/",
    "p": "pages/",
    "pages": "pages/"
}

export const catalog = {
    "decide-*": async (ce_name: string) => {
        const { defineCustomElement } = await import("vue");

        let module = null;
        const [_prefix, type, name] = ce_name.split('-');
        const folder = folderMap[type] || `components/`
        const module_url = `./${folder}${name}.ce.vue`;
        try {
            module = (await import(/* @vite-ignore */ module_url)).default;
        } catch (e) {
            throw new Error(`Cant import file ${module_url}`);
        }

        if (!module['render']) {
            throw new Error(`Invalid export of ${module_url}`)
        } else {
            return defineCustomElement(module, { shadowRoot: false })
        }
    }
};
export default catalog;

declare global {
    namespace preact.JSX {
        interface IntrinsicElements {
            'checkout-c-minicart': HTMLAttributes
        }
    }
}