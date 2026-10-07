import ds from "./components/catalog";

import { catalog as explore } from "@mfe-tractor/explore";
import { catalog as decide } from "@mfe-tractor/decide";
import { catalog as checkout } from "@mfe-tractor/checkout";

/**
 * The shell's own custom elements, alongside the teams' and the design system's.
 *
 * The ribbon that reports how the page on screen was rendered - see `./components/ribbon.ts`.
 * `index.html` carries `<render-mode>` on every page, and this is the loader `ce-autoloader`
 * upgrades it with. The key has to be the tag the element registers itself under (`RIBBON_TAG`
 * in `./components/ribbon.ts`).
 */
const shell = {
    "render-mode": () => import("./components/ribbon"),
};

const vendors = {
    "json-viewer": "https://esm.sh/@alenaksu/json-viewer?standalone"
}

export const catalog = {
    ...shell,
    ...ds,
    ...explore,
    ...decide,
    ...checkout,
    ...vendors
};

export default catalog;