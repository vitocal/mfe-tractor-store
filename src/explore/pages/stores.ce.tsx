import data from "../database/index";

import Store from "../components/store"

import './stores.css';

const Stores = () => {
    return <div data-boundary-page="explore">
        <explore-c-header loading="eager"></explore-c-header>
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
        <explore-c-footer loading="eager"></explore-c-footer>
    </div>
}

export default Stores;