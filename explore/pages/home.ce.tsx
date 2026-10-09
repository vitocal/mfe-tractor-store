import register from "preact-custom-element";

import { useState } from "preact/hooks";
import { src, srcset, useUpgradedProps } from "../utils";

import data from "../database/index";
import "../components/recommendations.ce";

import './home.css';

export const Home = ({ }) => {
    const [skus, _setSkus] = useState(["CL-01-GY", "AU-07-MT"])
    const recsRef = useUpgradedProps({ skus });

    return <div data-boundary-page="explore" class="page">
        <explore-components-header loading="eager"></explore-components-header>
        <main id="main" className="e_HomePage">
            {data.teaser.map(
                ({ title, image, url }) =>
                    <a className="e_HomePage__categoryLink appear-once appear-elegant appear-staggered" href={url} key={url} data-navigo>
                        <img
                            src={src(image, 500)}
                            srcSet={srcset(image, [500, 1000])}
                            fetchpriority="high"
                            sizes="100vw, (min-width: 500px) 50vw"
                            alt=""
                        />
                        {title}
                    </a>,
            )}
            <div className="e_HomePage__recommendations">
                <explore-components-recommendations ref={recsRef} loading="visible"
                    class="appear-elegant appear-once"></explore-components-recommendations>
            </div>
        </main >
        <explore-components-footer loading="eager"></explore-components-footer>
    </div>
}

export default register(Home, 'explore-pages-home');