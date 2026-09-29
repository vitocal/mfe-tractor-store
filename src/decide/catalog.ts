import { HTMLAttributes } from "preact";

export const catalog = {
    "decide-*": async (ce_name: string) => {
        const { defineCustomElement } = await import("vue");

        const [_prefix, type, name] = ce_name.split('-');
        const module = await import(`./${type}/${name}.ce.vue`);

        return defineCustomElement(module.default, { shadowRoot: false })
    }
};
export default catalog;

declare global {
    namespace preact.JSX {
        interface IntrinsicElements {
            'checkout-components-minicart': HTMLAttributes
        }
    }
}