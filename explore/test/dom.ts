/**
 * Minimal Happy DOM harness for the explore web components.
 *
 * Components are loaded through the *built* team catalog (`explore/dist`), the
 * same way the shell loads them at runtime: the catalog maps every custom
 * element tag to a lazy loader. The source files can't be used here - they
 * import `.css` and use JSX, which Node can't load - while the built chunks are
 * plain ESM, which is exactly what makes them runnable outside a browser.
 *
 * Requires the Happy DOM environment to be registered first (see
 * `./happy-dom-env.ts`).
 */

/** Custom element tag -> lazy loader, the shape a team catalog exports */
export type Catalog = Record<string, () => Promise<unknown>>;

/**
 * The built catalog, imported through a variable specifier because the built
 * file ships without type declarations of its own.
 */
export const catalog: Catalog = (
  await import(/* @vite-ignore */ new URL("../dist/catalog.js", import.meta.url).href)
).default;

export interface MountOptions {
  /** Attributes to set before the element is connected */
  attributes?: Record<string, string>;
  /** Properties to assign before the element is connected */
  props?: Record<string, unknown>;
}

/**
 * Imports the catalog entry that defines `tag` and waits until it is registered.
 * Safe to call repeatedly, the module is only imported once.
 */
export async function define(tag: string): Promise<void> {
  if (customElements.get(tag)) return;

  const load = catalog[tag];
  if (!load) {
    throw new Error(`<${tag}> is not in the explore catalog: ${Object.keys(catalog).join(", ")}`);
  }

  await load();
  await customElements.whenDefined(tag);
}

/**
 * Mounts `<tag>` in the document and resolves once the component has rendered.
 */
export async function mount<T extends HTMLElement = HTMLElement>(
  tag: string,
  { attributes = {}, props = {} }: MountOptions = {},
): Promise<T> {
  await define(tag);

  const el = document.createElement(tag) as T;

  for (const [name, value] of Object.entries(attributes)) {
    el.setAttribute(name, value);
  }
  Object.assign(el, props);

  document.body.append(el);
  await flush();

  return el;
}

/** Lets the framework flush its render into the DOM */
export function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/** Removes everything mounted by a previous test */
export function cleanup(): void {
  document.body.innerHTML = "";
}

