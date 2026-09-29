import { src, srcset, useUpgradedProps } from "../utils";

import data from "../database/index";

import './home.css';

export const Home = ({ }) => {
    const recsRef = useUpgradedProps({ skus: ["CL-01-GY", "AU-07-MT"] });

    return <div data-boundary-page="explore">
        <explore-c-header loading="eager"></explore-c-header>
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
                <explore-c-recommendations ref={recsRef} loading="visible"></explore-c-recommendations>
            </div>
        </main >
        <explore-c-footer loading="eager"></explore-c-footer>
    </div>
}

export default Home;
