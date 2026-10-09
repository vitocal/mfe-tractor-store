<svelte:options customElement={{ tag: "checkout-pages-thanks", shadow: "none", extend: adoptPrerenderedMarkup }} />

<script>
  import { adoptPrerenderedMarkup } from "../utils";
  import { onMount } from "svelte";

  import "./thanks.css";

  onMount(() => {
    import("https://cdn.jsdelivr.net/npm/canvas-confetti@1.9.2/+esm")
      .then(({ default: confetti }) => {
        var end = Date.now() + 1000;

        const settings = {
          particleCount: 3,
          scalar: 1.5,
          colors: ["#FFDE54", "#FF5A54", "#54FF90"],
          spread: 70,
        };
        /**
         * Animates confetti particles.
         */
        function frame() {
          confetti({
            ...settings,
            angle: 60,
            origin: { x: 0 },
          });
          confetti({
            ...settings,
            angle: 120,
            origin: { x: 1 },
          });

          if (Date.now() < end) {
            window.requestAnimationFrame(frame);
          }
        }
        frame();
      })
      // The module comes from a CDN, and this page can be rendered without one: a build, a browser
      // that is offline, or a request an extension blocked. The import then resolves without a
      // usable default and `frame()` throws. Confetti is a flourish - the page is complete without
      // it - so this catches it rather than letting it surface as an unhandled rejection.
      .catch(() => {});
  });
</script>

<div data-boundary-page="checkout" class="page">
  <explore-components-header></explore-components-header>
  <main class="c_Thanks">
    <h2 class="c_Thanks__title">Thanks for your order!</h2>
    <p class="c_Thanks__text">We'll notify you, when its ready for pickup.</p>

    <ds-button href="/" variant="secondary" data-navigo>Continue Shopping</ds-button>
  </main>
  <explore-components-footer></explore-components-footer>
</div>
