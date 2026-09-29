const folderMap = {
  "c": "components/",
  "components": "components/",
  "p": "pages/",
  "pages": "pages/"
}

export const catalog = {
  "explore-*": async (ce_name: string) => {
    const register = (await import("preact-custom-element")).default;

    let module = null;
    const [_prefix, type, name] = ce_name.split('-');
    const folder = folderMap[type] || `components/`
    const module_url = `./${folder}${name}.ce.tsx`;
    try {
      module = (await import(/* @vite-ignore */ module_url)).default;
    } catch (e) {
      throw new Error(`Cant import file ${module_url}`);
    }

    if (typeof module !== "function") {
      throw new Error(`Invalid export of ${module_url}`)
    } else if (module.prototype instanceof HTMLElement) {
      return module;
    } else {
      // Not a CustomElement, so let's wrap it in one.
      const prop_types = Array.isArray(module.propTypes)
        ? module.propTypes
        : Object.keys(module.propTypes || {});

      return register(module, ce_name, prop_types);
    }

  },
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
      'explore-c-header': HeaderProps & PreactProps;
      'explore-c-footer': FooterProps & PreactProps;
      'explore-c-recommendations': RecommendationsProps & PreactProps;
    }
  }
}
