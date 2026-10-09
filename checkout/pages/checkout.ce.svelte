<svelte:options customElement={{ tag: "checkout-pages-checkout", shadow: "none", extend: adoptPrerenderedMarkup }} />

<script>
  import { adoptPrerenderedMarkup } from "../utils";
  import { onMount, tick } from "svelte";
  import { placeOrder } from "../state";

  import "./checkout.css";

  let formElement;
  let storePickerElement;
  let storeId = "";
  let isFormValid = "";

  const validateForm = () => {
    // Check HTML5 validity of inputs + ensure storeId is present
    isFormValid = Boolean(formElement?.checkValidity()) && storeId !== "";
    return isFormValid;
  };

  async function handleSubmit(event) {
    event.preventDefault();
    debugger;

    if (validateForm()) {
      await placeOrder();
      window.location = "/checkout/thanks";
    }
  }

  async function handleStoreSelected(e) {
    storeId = e.detail;
    await tick();
    validateForm();
  }

  onMount(() => {
    storePickerElement?.addEventListener("explore:store-selected", handleStoreSelected);

    return () => {
      storePickerElement?.removeEventListener("explore:store-selected", handleStoreSelected);
    };
  });
</script>

<div data-boundary-page="checkout" class="page">
  <checkout-components-compactheader></checkout-components-compactheader>
  <main class="c_Checkout" id="main">
    <h2>Checkout</h2>
    <form class="c_Checkout__form" bind:this={formElement} on:input={validateForm} on:submit={handleSubmit}>
      <h3>Personal Data</h3>
      <fieldset class="c_Checkout__name">
        <div>
          <label class="c_Checkout__label" for="c_firstname"> First name </label>
          <input class="c_Checkout__input" type="text" id="c_firstname" name="firstname" required />
        </div>
        <div>
          <label class="c_Checkout__label" for="c_lastname">Last name</label>
          <input class="c_Checkout__input" type="text" id="c_lastname" name="lastname" required />
        </div>
      </fieldset>

      <h3>Store Pickup</h3>
      <fieldset>
        <div class="c_Checkout__store" bind:this={storePickerElement}>
          <explore-components-storepicker></explore-components-storepicker>
        </div>
        <label class="c_Checkout__label" for="c_storeId">Store ID</label>
        <input
          class="c_Checkout__input"
          id="c_storeId"
          type="text"
          name="storeId"
          required
          readonly
          bind:value={storeId}
        />
      </fieldset>

      <div class="c_Checkout__buttons">
        <ds-button type="submit" variant="primary"> Place order </ds-button>
        <ds-button href="/checkout/cart" variant="secondary" data-navigo>Back to cart</ds-button>
      </div>
    </form>
  </main>
  <explore-components-footer></explore-components-footer>
</div>
