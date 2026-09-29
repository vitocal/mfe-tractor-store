import type { RecoItem } from '../types'

import data from "../database/index";
import { Recommendation } from "./recommendation";

import "./recommendations.css";
const r = data.recommendations;

export interface Props {
  skus?: string[]
}

/**
 * Calculates the average color of an array of colors.
 * @param {number[][]} colors - The array of rgb.
 * @returns {number[]} The average rgb.
 */
function averageColor(colors: number[][]): number[] {
  const total = colors.reduce(
    (acc, [r, g, b]) => [acc[0] + r, acc[1] + g, acc[2] + b],
    [0, 0, 0],
  );
  return total.map((c) => Math.round(c / colors.length));
}

/**
 * Finds the colors of a list of SKUs.
 * @param {string[]} skus - The array of SKUs.
 * @returns {number[][]} The array of colors.
 */
function skusToColors(skus: string[]): number[][] {
  return skus.filter((sku) => r[sku]).map((sku) => r[sku].rgb);
}

/**
 * Calculates the distance between two RGB colors.
 * @param {number[]} rgb1 - The first RGB color.
 * @param {number[]} rgb2 - The second RGB color.
 * @returns {number} The distance between the colors.
 */
function colorDistance(rgb1: number[], rgb2: number[]): number {
  const [r1, g1, b1] = rgb1;
  const [r2, g2, b2] = rgb2;
  return Math.sqrt(
    Math.pow(r1 - r2, 2) + Math.pow(g1 - g2, 2) + Math.pow(b1 - b2, 2),
  );
}

/**
 * Finds recommendations based on color similarity.
 * @param {string[]} skus - The array of SKUs.
 * @param {number} [length=5] - The number of recommendations to return.
 * @returns {RecoItem[]} The array of recommendations.
 */
function recosForSkus(skus: string[], length: number = 4): RecoItem[] {
  const targetRgb = averageColor(skusToColors(skus));
  let distances = [];

  for (let sku in r) {
    if (!skus.includes(sku)) {
      const distance = colorDistance(targetRgb, r[sku].rgb);
      distances.push({ sku, distance });
    }
  }

  distances.sort((a, b) => a.distance - b.distance);
  return distances.slice(0, length).map((d) => r[d.sku]);
}


/**
 * Recommendations component.
 * @param {object} props - The properties of the Recommendations component.
 * @param {string[]} props.skus - The SKUs of the variants to get recommendations for.
 * @returns {string} The component markup.
 */
export const Recommendations = ({ skus }: Props) => {
  const recos = recosForSkus(skus || []);

  return recos.length ? (
    <div className="e_Recommendations" data-boundary="explore">
      <h2>Recommendations</h2>
      <ul className="e_Recommendations_list">{recos.map((r) => <Recommendation {...r} />)}</ul>
    </div>
  ) : (
    <></>
  );
};
Recommendations.propTypes = ["skus"]

export default Recommendations;