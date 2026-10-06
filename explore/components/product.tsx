import { useRef } from "preact/hooks";
import { src, srcset, fmtprice } from "../utils";

import "./Product.css";

/**
 * Product component.
 * @param {Product} props - The properties of the Product component.
 * @returns {string} The Product component markup.
 */
export default ({ name, url, image, startPrice, className }) => {
  const onClick = (ev) => {
    if ('startViewTransition' in document) {
      const link = ev.currentTarget;
      const img = link.querySelector('.e_Product_image');
      const nameEl = link.querySelector('.e_Product_name');

      if (img) img.style.viewTransitionName = 'product-image';
      if (nameEl) nameEl.style.viewTransitionName = 'product-title';
    }
  };

  return (
    <li className={["e_Product", className].filter(Boolean).join(' ')} key={url} >
      <a className="e_Product_link" href={url} onClick={onClick} data-navigo>
        <img
          className="e_Product_image"
          src={src(image, 200)}
          srcSet={srcset(image, [200, 400, 800])}
          sizes="300px"
          width="200"
          height="200"
        />
        <span className="e_Product_name">{name}</span>
        <span className="e_Product_price">{fmtprice(startPrice)}</span>
      </a>
    </li>
  );
};
