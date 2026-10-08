/**
 * An SFC, as the module a `.ce.ts` imports.
 *
 * Vue's compiler emits the component from a `.vue` file, and TypeScript has no idea what that is: it
 * only knows the extensions it was told about. `defineCustomElement` accepts a component, so the
 * declaration is the component type it accepts - the runtime is unaffected either way, this is what
 * keeps the import in a `.ce.ts` from being an error in an editor.
 */
declare module "*.vue" {
  import type { DefineComponent } from "vue";

  const component: DefineComponent<Record<string, unknown>, Record<string, unknown>, unknown>;
  export default component;
}
