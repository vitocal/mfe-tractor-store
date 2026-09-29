import Navigo from 'navigo';
import type { Match } from 'navigo';

class ViRouter extends HTMLElement {
    public router: Navigo | null = null;
    static get observedAttributes(): string[] {
        return ['root'];
    }
    connectedCallback() {
        this.router = new Navigo("/", { hash: true });
        this.setupRoutes();
        this.setupLinkInterception();

        this.router.resolve();
    }

    disconnectedCallback(): void {
        if (this.router) {
            debugger;
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
                        this.render('<explore-p-home></explore-p-home>');
                    }
                },
                '/products': {
                    as: 'explore-p-products',
                    uses: () => {
                        this.render(`<explore-p-category></explore-p-category>`);
                    },
                },
                '/products/:id': {
                    as: 'explore-p-products-bycategory',
                    uses: (match: Match) => {
                        const id = match.data?.id || ''
                        this.render(`<explore-p-category category="${id}"></explore-p-category>`);
                    },
                },
                '/stores': {
                    as: 'explore-p-stores',
                    uses: () => {
                        this.render(`<explore-p-stores></explore-p-stores>`);
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
            this.router.navigate(path);
        }
    }

    private render(htmlContent: string): void {
        this.innerHTML = htmlContent;
    }
}
customElements.define('vi-router', ViRouter);
