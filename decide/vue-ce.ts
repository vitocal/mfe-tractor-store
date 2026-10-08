import { defineCustomElement } from "vue";
import type { Component } from "vue";

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
 */
export function asCustomElement(component: Component): CustomElementConstructor {
  return defineCustomElement(component, { shadowRoot: false });
}

export default asCustomElement;
