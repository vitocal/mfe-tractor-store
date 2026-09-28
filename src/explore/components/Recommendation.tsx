import register from "preact-custom-element";
import { src, srcset } from "../utils";

import type { RecoItem } from '../types'

import "./Recommendation.css";

export interface RecommendationProps {
  image: string,
  url: string,
  name: string
}

/**
 * Recommendation component.
 */
export const Recommendation = ({ image, url, name }: RecoItem) => {
  return (
    <li className="e_Recommendation" key={url}>
      <a className="e_Recommendation_link" href={url} data-navigo>
        <img
          className="e_Recommendation_image"
          src={src(image, 200)}
          srcSet={srcset(image, [200, 400])}
          alt=""
          sizes="200px"
          width="200"
          height="200"
        />
        <span className="e_Recommendation_name">{name}</span>
      </a>
    </li>
  );
};
export default register(Recommendation, "explore-recommendation", ["image", "url", "name"]);
