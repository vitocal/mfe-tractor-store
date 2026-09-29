import register from "preact-custom-element";

import data from "../database/index";

import Store from "../components/store"

import './stores.css';

const Stores = () => {
    return <div data-boundary-page="explore">
        <explore-components-header loading="eager"></explore-components-header>
        <main class="e_StoresPage">
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

export default register(Stores, 'explore-pages-stores');