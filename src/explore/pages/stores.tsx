import register from "preact-custom-element";

import data from "../database/index";

import Store from "../components/Store"

import './stores.css';

const Stores = () => {
    return <div data-boundary="explore">
        <explore-header loading="eager"></explore-header>
        <main class="e_StoresPage">
            <h2>Our Stores</h2>
            <p>
                Want to see our products in person? Visit one of our stores to see
                our products up close and talk to our experts. We have stores in the
                following locations:
            </p>
            <ul class="e_StoresPage_list">
                {data.stores.map(Store)}
            </ul>
        </main>
        <explore-footer loading="eager"></explore-footer>
    </div>
}

export default register(Stores, 'explore-page-stores')