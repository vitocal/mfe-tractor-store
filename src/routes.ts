import explore_routes from "@mfe-tractor/explore/routes"
import decide_routes from "@mfe-tractor/decide/routes";
import checkout_routes from "@mfe-tractor/checkout/routes";

export const routes = [...explore_routes, ...decide_routes, ...checkout_routes];
export default routes