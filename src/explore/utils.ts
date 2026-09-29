import { useRef, useEffect } from 'preact/hooks';

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
 * Useful for passing complex properties like arrays objects to custom elements.
 * Applies complex properties to a Custom Element after it has been upgraded in the browser.
 *
 * @param props An object containing the properties/props to set on the DOM node.
 * @return A Preact/React compatible ref callback function.
 */
export function lazyProps<T extends HTMLElement = HTMLElement>(
  props: Record<string, unknown>
): (domNode: T | null) => void {
  return (domNode: T | null): void => {
    if (!domNode) return;

    const tag = domNode.tagName.toLowerCase();

    if (customElements.get(tag)) {
      // Custom element is already defined; set properties directly
      Object.assign(domNode, props);
    } else {
      // Defer assignment until the browser registers the element
      customElements.whenDefined(tag).then(() => {
        if (domNode.isConnected) {
          Object.assign(domNode, props);
        }
      });
    }
  };
}

/**
 * Pass complex properties like arrays objects to an custom element after they're upgraded.
 *
 * @param props An object containing the properties/props to set on the DOM node.
 * @return A Preact/React compatible ref callback function.
 */
export function useUpgradedProps<T extends HTMLElement = HTMLElement>(
  props: Record<string, unknown>
) {
  const nodeRef = useRef<T | null>(null);

  useEffect(() => {
    const domNode = nodeRef.current;
    if (!domNode) return;

    const tag = domNode.tagName.toLowerCase();

    const applyProps = () => {
      if (domNode.isConnected) {
        Object.assign(domNode, props);
      }
    };

    if (customElements.get(tag)) {
      applyProps();
    } else {
      customElements.whenDefined(tag).then(applyProps);
    }
  }, [props]); // Re-runs whenever `props` reference or reactive values inside change

  return nodeRef;
}