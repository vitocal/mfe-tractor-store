<svelte:options customElement={{ tag: "checkout-pages-cart", shadow: "none", extend: adoptPrerenderedMarkup }} />

<script>
  import { adoptPrerenderedMarkup, upgradedProps } from "../utils";
  import data from "../database/index";
  import { cart, removeFromCart } from "../state";

  import "./cart.css";
  import LineItem from "../components/lineitem.ce.svelte";

  /**
   * Converts state line items to cart line items.
   * @param {CookieLineItem[]} items - List of cookie line items.
   * @returns {LineItem[]} - Cart line items.
   */
  function convertToLineItems(items) {
    return items.reduce((res, { sku, quantity }) => {
      const variant = data.variants.find((p) => p.sku === sku);
      if (variant) {
        res.push({ ...variant, quantity, total: variant.price * quantity });
      }
      return res;
    }, []);
  }

  /** Remove a item from cart */
  async function handleCartRemove(event, sku) {
    event.preventDefault();

    await removeFromCart(sku);
  }

  // State variable to trigger Svelte re-renders when the signal changes
  let currentCart = cart.value;

  // Subscribe to Preact signal updates
  cart.subscribe((value) => {
    currentCart = value;
  });

  // Reactive declarations: these re-evaluate automatically whenever `currentCart` changes
  $: lineItems = convertToLineItems(currentCart);
  $: total = lineItems.reduce((res, { total }) => res + total, 0);
  $: skus = lineItems.map(({ sku }) => sku);
</script>

<div data-boundary-page="checkout" class="page">
  <explore-components-header></explore-components-header>
  <main class="c_CartPage" id="main">
    <h2>Basket</h2>
    <ul class="c_CartPage__lineItems">
      {#each lineItems as item (item.sku)}
        <LineItem {...item} onItemRemove={handleCartRemove} />
      {/each}
    </ul>
    {#if lineItems.length == 0}
      <p>No items in cart</p>
    {/if}
    <hr />
    <p class="c_CartPage__total">Total: ${total} Ø</p>

    <div class="c_CartPage__buttons">
      <ds-button href="/checkout/checkout" variant="primary" data-navigo>Checkout</ds-button>
      <ds-button href="/" variant="secondary" data-navigo>Continue Shopping</ds-button>
    </div>

    <explore-components-recommendations use:upgradedProps={{ skus: skus }}></explore-components-recommendations>
  </main>
  <explore-components-footer></explore-components-footer>
</div>
