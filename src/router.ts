// import type { Catalog } from 'ce-autoloader';
import CEAutoLoader from 'ce-autoloader';
import Navigo from 'navigo';
import type { Match } from 'navigo';

/** Custom elements referenced by the given html */
// function tagsIn(html) {
//     return [...new Set([...html.matchAll(/<([a-z][a-z0-9]*-[a-z0-9-]*)[\s/>]/g)].map(([, tag]) => tag))];
// }


// function setVisitedCSS() {
//     // 1. Navigation Timing API check
//     const navs = performance.getEntriesByType("navigation") || [];
//     console.log(navs);
//     const nav = [navs]

//     // transferSize > 0 means fetched from server (not loaded from disk/memory cache)
//     const fetchedFromNetwork = nav ? nav.transferSize > 0 : true;
//     console.log(`deliveryType`, nav);
//     const hasVisited = !!sessionStorage.getItem("hasVisited");

//     // 2. Decide whether to skip animation
//     if (hasVisited) {
//         // Subsequent navigation served from cache -> instant render
//         document.documentElement.dataset.visited = "true";
//     } else {
//         // First visit OR hard refresh / cache disabled -> trigger animation
//         sessionStorage.setItem("hasVisited", "true");
//         setTimeout(() => {
//             document.documentElement.dataset.visited = "true";
//         }, 1000);
//     }
// }

class ViRouter extends HTMLElement {
    public router: Navigo | null = null;
    public registry: CEAutoLoader

    static get observedAttributes(): string[] {
        return ['root'];
    }

    connectedCallback() {
        this.router = new Navigo("/", { hash: true });

        this.setupRoutes();
        this.setupLinkInterception();
        this.registry

        this.router.resolve();
    }

    disconnectedCallback(): void {
        if (this.router) {
            this.router.destroy();
            this.router = null;
        }
    }

    preload(components) {
        if (window.registry) {
            performance.mark(`preload:${components[0]}`)
            console.log(`preload`, components);
            window.registry.preload(components)
            return customElements.whenDefined(components[0])
        } else {
            console.warn(`cant preload ${components}`)
            return Promise.resolve();
        }
    }

    private setupRoutes(): void {
        if (!this.router) return;

        // this.router.hooks({
        //     after(match) {
        //         setTimeout(() => {
        //             delete document.documentElement.dataset.appear;
        //         }, 1000)
        //     }
        // })
        this.router
            .on({
                /**
                 * Team Explore
                 */
                '/': {
                    as: 'home',
                    uses: async () => {
                        await this.preload(['explore-pages-home']);
                        return this.render('<explore-pages-home loading="eager"></explore-pages-home>');
                    }
                },
                '/products': {
                    as: 'explore-p-products',
                    uses: async () => {
                        await this.preload(['explore-pages-category']);
                        this.render(`<explore-pages-category></explore-pages-category>`);
                    },
                },
                '/products/:id': {
                    as: 'explore-p-products-bycategory',
                    uses: async (match: Match) => {
                        const id = match.data?.id || ''
                        await this.preload(['explore-pages-category']);

                        this.render(`<explore-pages-category category="${id}"></explore-pages-category>`);
                    },
                },
                '/stores': {
                    as: 'explore-p-stores',
                    uses: async () => {
                        await this.preload(['explore-pages-stores']);
                        this.render(`<explore-pages-stores loading="eager"></explore-pages-stores>`);
                    },
                },

                /**
                 * Team Decide
                 */
                '/product/:id': {
                    as: 'decide-pages-product',
                    uses: async (match: Match) => {
                        const id = match.data?.id
                        const sku = match.params?.sku || ''

                        await this.preload(['decide-p-product']);
                        this.render(`<decide-p-product id="${id}" sku="${sku}"></decide-p-product>`);
                    }
                },

                /**
                 * Team checkout
                 */
                '/checkout/cart': {
                    as: 'checkout-pages-cart',
                    uses: async () => {
                        await this.preload(['checkout-p-cart']);
                        this.render('<checkout-p-cart ></checkout-p-cart>')
                    }
                },
                '/checkout/checkout': {
                    as: 'checkout-pages-checkout',
                    uses: async () => {
                        await this.preload(['checkout-p-checkout']);
                        this.render('<checkout-p-checkout></checkout-p-checkout>')
                    }
                },
                '/checkout/thanks': {
                    as: 'checkout-pages-thanks',
                    uses: async () => {
                        await this.preload(['checkout-p-thanks']);
                        this.render('<checkout-p-thanks></checkout-p-thanks>')
                    }
                }
            })
            .notFound(() => {
                this.render('<h1>404 - Page Not Found</h1>');
            });
    }

    private setupLinkInterception(): void {
        this.addEventListener('click', (event: MouseEvent) => {
            const target = event.target as HTMLElement | null;
            const link = target?.closest<HTMLAnchorElement>('[data-navigo]');

            if (link && this.router) {
                event.preventDefault();
                const href = link.getAttribute('href');
                if (href) {
                    // console.log("link intercepted", this.router.match(href))
                    this.router.navigate(href);

                    // window.scrollTo({ top: 0, behavior: 'smooth' })
                }
            }
        });
    }

    public navigate(path: string): void {
        if (this.router) {
            performance.mark('navigate')
            this.router.navigate(path);
        }
    }

    private render(htmlContent: string): void {
        // Preload the page custom-element, then render the route html
        // const preload_tags = (htmlContent ? tagsIn(htmlContent) : [])
        // this.registry?.preload(preload_tags);
        // setVisitedCSS();

        // console.log(`preload_tags`, preload_tags)
        // performance.mark('preload_tags', { detail: preload_tags })
        if (document.startViewTransition) {
            document.startViewTransition(async () => { this.innerHTML = htmlContent ?? "" })
        } else {
            requestAnimationFrame(() => { this.innerHTML = htmlContent })
        }
    }
}
customElements.define('vi-router', ViRouter);
