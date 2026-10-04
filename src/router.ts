// import type { Catalog } from 'ce-autoloader';
import CEAutoLoader from 'ce-autoloader';
import Navigo from 'navigo';
import type { Match } from 'navigo';

/** Custom elements referenced by the given html */
function tagsIn(html) {
    return [...new Set([...html.matchAll(/<([a-z][a-z0-9]*-[a-z0-9-]*)[\s/>]/g)].map(([, tag]) => tag))];
}

class ViRouter extends HTMLElement {
    public router: Navigo | null = null;
    public registry: CEAutoLoader

    static get observedAttributes(): string[] {
        return ['root'];
    }

    connectedCallback() {
        this.router = new Navigo("/", { hash: true });
        this.registry = (window.registry) || null
        // console.log(this.registry);
        // this.router.hooks({
        //     before(done, match) {

        //         // match is url,queryString, so we dont know which component to preload
        //         console.log("router: before all (will run viewTransition)", match)
        //         // if(this.registry){
        //         //     this.regisry.preload([])
        //         // }
        //         done();
        //     }
        // })
        this.setupRoutes();
        this.setupLinkInterception();

        this.router.resolve();
    }

    disconnectedCallback(): void {
        if (this.router) {
            this.router.destroy();
            this.router = null;
        }
    }

    private setupRoutes(): void {
        if (!this.router) return;

        this.router
            .on({
                /**
                 * Team Explore
                 */
                '/': {
                    as: 'home',
                    uses: () => {
                        this.render('<explore-pages-home></explore-pages-home>');
                    }
                },
                '/products': {
                    as: 'explore-p-products',
                    uses: () => {
                        this.render(`<explore-pages-category></explore-pages-category>`);
                    },
                },
                '/products/:id': {
                    as: 'explore-p-products-bycategory',
                    uses: (match: Match) => {
                        const id = match.data?.id || ''
                        this.render(`<explore-pages-category category="${id}"></explore-pages-category>`);
                    },
                },
                '/stores': {
                    as: 'explore-p-stores',
                    uses: () => {
                        this.render(`<explore-pages-stores></explore-pages-stores>`);
                    },
                },

                /**
                 * Team Decide
                 */
                '/product/:id': {
                    as: 'decide-pages-product',
                    uses: (match: Match) => {
                        const id = match.data?.id
                        const sku = match.params?.sku || ''

                        this.render(`<decide-p-product id="${id}" sku="${sku}"></decide-p-product>`);
                    }
                },

                /**
                 * Team checkout
                 */
                '/checkout/cart': {
                    as: 'checkout-pages-cart',
                    uses: () => {
                        this.render('<checkout-p-cart ></checkout-p-cart>')
                    }
                },
                '/checkout/checkout': {
                    as: 'checkout-pages-checkout',
                    uses: () => {
                        this.render('<checkout-p-checkout></checkout-p-checkout>')
                    }
                },
                '/checkout/thanks': {
                    as: 'checkout-pages-thanks',
                    uses: () => {
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
                    this.router.navigate(href);
                    window.scrollTo({ top: 0, behavior: 'smooth' })
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
        const preload_tags = (htmlContent ? tagsIn(htmlContent) : [])
        this.registry?.preload(preload_tags);

        console.log(`preload_tags`, preload_tags)
        this.innerHTML = htmlContent ?? "";
    }
}
customElements.define('vi-router', ViRouter);
