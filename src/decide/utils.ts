import { ref, watchEffect, onUnmounted, type Ref } from 'vue';

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
 * A Vue 3 composable that defers assigning complex properties to a Custom Element
 * until the element has been registered and upgraded in the browser.
 *
 * @param propsGetter A reactive getter function returning the properties to assign.
 * @returns A template ref to attach to the custom element in JSX or template.
 */
export function useUpgradedProps<T extends HTMLElement = HTMLElement>(
  propsGetter: () => Record<string, unknown>
): Ref<T | null> {
  const elRef = ref<T | null>(null) as Ref<T | null>;
  let isDisposed = false;

  onUnmounted(() => {
    isDisposed = true;
  });

  watchEffect(() => {
    const domNode = elRef.value;
    const props = propsGetter();

    if (!domNode) return;

    const tag = domNode.tagName.toLowerCase();

    const applyProps = () => {
      if (!isDisposed && domNode.isConnected) {
        Object.assign(domNode, props);
      }
    };

    if (customElements.get(tag)) {
      applyProps();
    } else {
      customElements.whenDefined(tag).then(applyProps);
    }
  });

  return elRef;
}