/**
 * Shared design-system web-components.
 *
 * The modules are collected with `import.meta.glob`, so the bundler can see them and ship
 * them. A bare `import(\`./${name}\`)` can not be analysed statically: with `@vite-ignore`
 * it is left in the output and resolves to a url the server does not have (eg `/button`),
 * which makes every `<ds-button>` fail to upgrade.
 */
const modules = import.meta.glob("./*.tsx");

export const catalog = {
    "ds-*": async (ce_name: string) => {
        const [_prefix, name] = ce_name.split('-');
        const load = modules[`./${name}.tsx`];

        if (!load) {
            throw new Error(`Unknown design system component: <${ce_name}>`);
        }

        return await load();
    }
}
export default catalog;

/**
 * Typescript
 */
import type { HTMLAttributes, ComponentType } from "preact";
export type PreactProps = HTMLAttributes<HTMLElement> | ComponentType & { loading: "eager" | "visible" | string };

import type { Props as ButtonProps } from "./button";

declare global {
    namespace preact.JSX {
        interface IntrinsicElements {
            'ds-button': ButtonProps & PreactProps;
        }
    }
}