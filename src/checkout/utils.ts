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