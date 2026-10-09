import { createApp, createSSRApp, defineCustomElement } from "vue";
import type { App, Component } from "vue";

/**
 * A Vue SFC as the custom element a catalog loader hands back.
 *
 * A catalog is a lookup table, not a place a framework is imported from: what it holds is a tag and
 * a loader, and the loader's promise has to resolve to a `CustomElementConstructor`. Preact and
 * Svelte components register themselves when their module is imported, but Vue's compiler owns the
 * module's default export - it is the component options, not an element - so the conversion needs
 * a module of its own. That module is a `<name>.ce.ts` next to the SFC, and this is what it calls.
 *
 * Keeping the conversion here rather than in `catalog.ts` is what keeps the catalog free of the
 * runtime: the Vue chunks are then reachable from a *component's* chunk, not from the catalog's,
 * so a page that loads the catalog - or a tool that only reads it, like the SSG's style index -
 * pulls in no framework at all.
 *
 * `shadowRoot: false` because these elements are styled by the stylesheets the page links; a shadow
 * root would cut them off from the page's own css.
 *
 * The element adopts the markup a prerendered page already has, rather than rendering over it, so
 * the nodes a view transition captured are still there when it runs. Why that takes the three
 * lines below: the README's SSG notes, "No framework adopts the markup the pass wrote".
 */
export function asCustomElement(component: Component): CustomElementConstructor {
  const Element = defineElement(component, { shadowRoot: false }, createForHost);

  // Vue moves the host's children into slots, and out of the document, before it mounts - the
  // opposite of adopting them. `_renderSlots` then reaches for the `<slot>` inside `ds-button`.
  (Element.prototype as Record<string, unknown>)._parseSlots = () => {};
  (Element.prototype as Record<string, unknown>)._renderSlots = () => {};

  return Element;
}

/** Hydrate the markup already in the host; render from nothing when there is none. */
function createForHost(this: HTMLElement, definition: Component): App {
  return this.hasChildNodes() ? createSSRApp(definition) : createApp(definition);
}

/** `defineCustomElement` takes the app factory as a third argument; the types leave it out. */
const defineElement = defineCustomElement as (
  component: Component,
  options: { shadowRoot: false },
  createApp: (definition: Component) => App,
) => CustomElementConstructor;

export default asCustomElement;
