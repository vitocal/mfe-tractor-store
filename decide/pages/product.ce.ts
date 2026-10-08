import { asCustomElement } from "../vue-ce";
import Product from "./product.ce.vue";

/**
 * `<decide-pages-product>`.
 *
 * The SFC is the component; this is the custom element a catalog loader resolves to, which is what
 * `ce-autoloader` defines. The tag is the catalog's key, derived from this file's path.
 */
export default asCustomElement(Product);
