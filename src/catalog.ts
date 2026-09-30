import ds from "./components/catalog";

import { catalog as explore } from "@vitocal/tractor-explore";
import decide from "./decide/catalog";
import checkout from "./checkout/catalog";

export const catalog = {
    ...ds,
    ...explore,
    ...decide,
    ...checkout
};

export default catalog;