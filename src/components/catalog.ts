/** Shared design-system web-components  */
export const catalog = {
    "ds-*": async (ce_name: string) => {
        const [_prefix, name] = ce_name.split('-');
        const module = await import(/* @vite-ignore */`./${name}`);

        return module;
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