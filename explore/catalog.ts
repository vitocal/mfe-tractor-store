// import register from "preact-custom-element";

const NAMESPACE = 'explore'
const CE_EXTENSION = '.ce.tsx'

/** Transform import globs into a clean catalog structure */
function asCatalogMap(import_globs: Record<string, () => void>) {
  const clean_fn = ([filepath, import_fn]) => {
    const [_prefix, type, filename] = filepath.split('/')
    const ce_name = `${NAMESPACE}-${type}-${filename}`.replaceAll(CE_EXTENSION, '')
    return [ce_name, import_fn]
  }
  return Object.fromEntries(Object.entries(import_globs).map(clean_fn))
}

export const pages = asCatalogMap(import.meta.glob(`./pages/**/*.ce.tsx`, { eager: false }))
export const components = asCatalogMap(import.meta.glob(`./components/**/*.ce.tsx`, { eager: false }));
export const catalog = {
  ...pages,
  ...components,
};

export default catalog;


/**
 * Typescript specs
*/
import type { HTMLAttributes, ComponentType } from "preact";
export type PreactProps = HTMLAttributes<HTMLElement> | ComponentType & { loading: "eager" | "visible" | string };

import type { Props as HeaderProps } from "./components/header.ce";
import type { Props as FooterProps } from "./components/footer.ce";
import type { Props as RecommendationsProps } from "./components/recommendations.ce";

declare global {
  namespace preact.JSX {
    interface IntrinsicElements {
      'explore-components-header': HeaderProps & PreactProps;
      'explore-components-footer': FooterProps & PreactProps;
      'explore-components-recommendations': RecommendationsProps & PreactProps;
    }
  }
}
