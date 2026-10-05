import ds from "./components/catalog";

import { catalog as explore } from "@mfe-tractor/explore";
import { catalog as decide } from "@mfe-tractor/decide";
import checkout from "./checkout/catalog";

const vendors = {
    "json-viewer": "https://esm.sh/@alenaksu/json-viewer?standalone"
}

console.log(decide);

export const catalog = {
    ...ds,
    ...explore,
    ...decide,
    ...checkout,
    ...vendors
};

export default catalog;