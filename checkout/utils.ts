import type { Action } from 'svelte/action';

// use the image server if not using local images
export const IMAGE_SERVER = "";

/**
 * Replaces the placeholder "[size]" in the image URL with the specified size.
 * @param {string} image - The original image URL.
 * @param {number} size - The desired size for the image.
 * @returns {string} - The modified image URL with the size placeholder replaced.
 */
export function src(image: string, size: number) {
  return IMAGE_SERVER + image.replace("[size]", `${size}`);
}

/**
 * Generates the srcset attribute value for an image with different sizes.
 * @param {string} image - The original image URL.
 * @param {number[]} sizes - The array of sizes for the image.
 * @returns {string} - The srcset attribute value.
 */
export function srcset(image: string, sizes: number[] = []) {
  return sizes.map((size) => `${src(image, size)} ${size}w`).join(", ");
}

/**
 * Formats a price value.
 * @param {number} price - The price value to format.
 * @returns {string} - The formatted price.
 */
export function fmtprice(price: number) {
  return `${price},00 Ø`;
}


/**
 * A Svelte Action that defers setting properties on a Custom Element
 * until the element is registered and upgraded in customElements.
 */
export const upgradedProps: Action<HTMLElement, Record<string, unknown>> = (node, initialProps) => {
  let currentProps = initialProps;
  let isMounted = true;

  const tag = node.tagName.toLowerCase();

  const applyProps = () => {
    if (isMounted && node.isConnected) {
      Object.assign(node, currentProps);
    }
  };

  const sync = () => {
    if (customElements.get(tag)) {
      applyProps();
    } else {
      customElements.whenDefined(tag).then(applyProps);
    }
  };

  // Initial check/deferral on mount
  sync();

  return {
    // Called by Svelte whenever reactive arguments passed to use:upgradedProps change
    update(newProps) {
      currentProps = newProps;
      sync();
    },
    destroy() {
      isMounted = false;
    }
  };

};

/** The class Svelte generates for a custom element, as far as adopting the markup cares */
type SvelteCustomElement = new () => HTMLElement & { connectedCallback?(): void };

/**
 * A custom element that replaces the markup a prerendered page arrives with.
 *
 * Svelte mounts a component by *appending* into its host, so on a prerendered page the
 * build-time render stays put and the live one lands below it. `/checkout/cart` was showing
 * "No items in cart" and "Total: $0 Ø" - the basket as it was when the page was built - with
 * the real one underneath, which reads as an empty cart.
 *
 * `extend` runs before Svelte mounts the component, which is the one moment the host can be
 * emptied. Preact and Vue replace the markup on their own, so this is what makes Svelte match
 * them, and what keeps a prerendered page from being shown twice.
 *
 * Used through `<svelte:options customElement={{ ..., extend: adoptPrerenderedMarkup }} />`.
 */
export const adoptPrerenderedMarkup = (CustomElement: SvelteCustomElement) =>
  class extends CustomElement {
    connectedCallback() {
      // Every one of these elements is `shadow: "none"`, so what the page arrived with is the
      // light DOM. A shadow element would keep its prerendered markup in the shadow root.
      if (!this.shadowRoot) this.replaceChildren();

      // Svelte's own `connectedCallback` is what mounts the component.
      super.connectedCallback?.();
    }
  };
