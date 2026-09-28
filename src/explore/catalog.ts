export const catalog = {
  "explore-header": () => import("./components/Header"),
  "explore-recommendations": () => import("./components/Recommendations"),
  "explore-footer": () => import("./components/Footer"),
  "explore-storepicker": () => import("./components/StorePicker"),

  "explore-page-home": () => import("./pages/HomePage"),
  "explore-page-category": () => import("./pages/CategoryPage"),
};

export default catalog;


/**
 * Typescript specs
*/
import type { HTMLAttributes, ComponentType } from "preact";
export type PreactProps = HTMLAttributes<HTMLElement> | ComponentType;

import type { Props as HeaderProps } from "./components/Header";
import type { Props as FooterProps } from "./components/Footer";
import type { Props as RecommendationsProps } from "./components/Recommendations";

declare global {
  namespace preact.JSX {
    interface IntrinsicElements {
      'explore-header': HeaderProps & PreactProps;
      'explore-footer': FooterProps & PreactProps;
      'explore-recommendations': RecommendationsProps & PreactProps;
    }
  }
}
