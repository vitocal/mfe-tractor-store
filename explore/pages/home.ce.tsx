import register from "preact-custom-element";

import { src, srcset, useUpgradedProps } from "../utils";

import data from "../database/index";

import './home.css';
import { useState } from "preact/hooks";

export const Home = ({ }) => {
    const [skus, _setSkus] = useState(["CL-01-GY", "AU-07-MT"])
    const recsRef = useUpgradedProps({ skus });

    return <div data-boundary-page="explore">
        <explore-components-header loading="eager" style="min-height: 180px"></explore-components-header>
        <main className="e_HomePage">
            {data.teaser.map(
                ({ title, image, url }) =>
                    <a className="e_HomePage__categoryLink" href={url} key={url} data-navigo>
                        <img
                            src={src(image, 500)}
                            srcSet={srcset(image, [500, 1000])}
                            sizes="100vw, (min-width: 500px) 50vw"
                            alt=""
                        />
                        {title}
                    </a>,
            )}
            <div className="e_HomePage__recommendations">
                <explore-components-recommendations ref={recsRef} loading="visible"></explore-components-recommendations>
            </div>
        </main >
        <explore-components-footer loading="eager"></explore-components-footer>
    </div>
}

export default register(Home, 'explore-pages-home');