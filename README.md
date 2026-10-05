# Micro-Frontends Store Example

Tractor Micro-Frontends (MFE) example with lazy loaded web-components, using ce-autoloader, preact, svelte and vue.

The objective is to have a large site with hundreds of components on multiple frontend frameworks while
generating lean pages and components that can talk to each other between boundaries.

Without manual hard-coded imports, without complex build-step tooling(module federation)

## Architecture

- Each team ([checkout](./src/checkout/), [decide](./src/checkout/) and [explore](./explore/)) has an isolated repository.
- Each team can choose their frontend technology stack, as long as they export web-components.
- Each team can use another team component inside their projects without importing/linking them before-hand.
  - Teams can mock components for local isolated development.

- Each team publishes a bunch of files, independently of one another:
  - A [manifest file](./src/checkout/dist/manifest.json)
  - A [routing file](./src/checkout/routes.ts)
  - A web-components [catalog](./src/checkout/catalog.ts)
  - Several compiled [web-components files](./src/checkout/components/minicart.svelte) and it's assets.

- A shell glues/bundles them together:
  - A [router](./src/components/router.ts) reads each routing table
  - A [Master catalog](./src/catalog.ts) joins each team catalog together
  - Support for dynamic-sites(server side), where the components and pages are be updated real-time.
  - Support for static-sites(local), the components and pages are updated after the build step.

- WebComponents not used on the page are not downloaded!
- WebComponents are lazy-loaded, with proper loading animation (skeleton screens)
- Errors in components are contained:
  - A single bad component wont break the site compilation and runtime.
- Inner components , since they're only consumable by their own team.
- State is shared between team boundaries via `signals` or other native browser features (`localStorage`)

## Preview the whole site

```bash
npm install
npm run dev
```

Open `http://localhost:5147` in your browser

## Preview a single team

In your terminal, enter the team folder and run `npm run dev`

Open `http://localhost:4001`, a playground will let you preview the teams components

## Building and publishing

To publish a single team work, run `npm run build` inside the team folder (eg: [explore](./explore/))

## WIP

In SPA mode, the routing is done client-side. Browser navigation with hash urls `/#/products/classic`

