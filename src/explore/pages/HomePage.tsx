import register from "preact-custom-element";
import { src, srcset, useUpgradedProps } from "../utils";

import data from "../database/index.js";

import './HomePage.css';

const HomePage = () => {

    const recsRef = useUpgradedProps({ skus: ["CL-01-GY", "AU-07-MT"] });

    return <div data-boundary="explore">
        <explore-header loading="eager"></explore-header>
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
                <explore-recommendations ref={recsRef} loading="visible"></explore-recommendations>
            </div>
        </main >
        <explore-footer loading="eager"></explore-footer>
    </div>
}



const WebHomePage = register(HomePage, 'explore-page-home');

export default WebHomePage;
