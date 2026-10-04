import ds from "./components/catalog";

import { catalog as explore } from "@vitocal/tractor-explore";
import decide from "./decide/catalog";
import checkout from "./checkout/catalog";

const vendors = {
    "json-viewer": "https://esm.sh/@alenaksu/json-viewer?standalone"
}

export const catalog = {
    ...ds,
    ...explore,
    ...decide,
    ...checkout,
    ...vendors
};

export default catalog;