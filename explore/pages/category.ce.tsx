import register from "preact-custom-element";

import data from "../database/index";
import Product from "../components/product";
import Filter from "../components/filter";

import './category.css';

/**
 * CategoryPage component.
 */
export const Category = ({ category }: { category: String }) => {
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
      url: `${c.key}`,
      name: c.name,
      active: c.key === category,
    })),
  ];

  return (<div data-boundary-page="explore">
    <explore-components-header ></explore-components-header>
    <main id="main" className="e_CategoryPage">
      <h2>{title}</h2>
      <div className="e_CategoryPage__subline">
        <p>{products.length} products</p>
        <Filter filters={filters} />
      </div>
      <ul className="e_CategoryPage_list">
        {products.map((p) => <Product {...p} />)}
      </ul>
    </main>
    <explore-components-footer ></explore-components-footer>
  </div>);
};

Category.propTypes = ["category"]
export default register(Category, 'explore-pages-category');