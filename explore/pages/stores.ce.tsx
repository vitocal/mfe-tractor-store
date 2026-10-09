import register from "preact-custom-element";

import data from "../database/index";

import Store from "../components/store"
import "../components/header.ce.tsx"

import './stores.css';

const Stores = () => {
    //     const css = new CSSStyleSheet();
    //     css.insertRule(`explore-components-header {
    //   display: block;
    //   min-height: 180px;
    //   margin: 1rem auto 0;
    // }`);

    //     adoptStylesheet(this || document, css);

    return <div data-boundary-page="explore" class="page">
        <explore-components-header></explore-components-header>
        <main id="main" class="e_StoresPage">
            <h2>Our Stores</h2>
            <p>
                Want to see our products in person? Visit one of our stores to see
                our products up close and talk to our experts. We have stores in the
                following locations:
            </p>
            <ul class="e_StoresPage_list">
                {data.stores.map((store) => <Store {...store} />)}
            </ul>
        </main>
        <explore-components-footer loading="eager"></explore-components-footer>
    </div>
}


export default register(Stores, 'explore-pages-stores', []);