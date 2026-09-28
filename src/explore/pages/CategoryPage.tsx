import register from "preact-custom-element";

import data from "../database/index.js";
import Product from "../components/Product.jsx";
import Filter from "../components/Filter.jsx";

import './CategoryPage.css';

/**
 * CategoryPage component.
 */
export const CategoryPage = ({ category }: { category: String }) => {
  const cat = category && data.categories.find((c) => c.key === category);

  const title = cat ? cat.name : "All Machines";
  const products = cat
    ? cat.products
    : data.categories.flatMap((c) => c.products);
  // sort products by price descending
  products.sort((a, b) => b.startPrice - a.startPrice);
  const filters = [
    { url: "/products", name: "All", active: !cat },
    ...data.categories.map((c) => ({
      url: `/products/${c.key}`,
      name: c.name,
      active: c.key === category,
    })),
  ];

  return (<>
    <explore-header ></explore-header>
    <main className="e_CategoryPage">
      <h2>{title}</h2>
      <div className="e_CategoryPage__subline">
        <p>{products.length} products</p>
        {Filter({ filters })}
      </div>
      <ul className="e_CategoryPage_list">
        {products.map(Product)}
      </ul>
    </main>
    <explore-footer ></explore-footer>
  </>);
};


export default register(CategoryPage, 'explore-page-category', ["category"]);
