export interface Variant {
    name: string,
    image: string,
    sku: string,
    color: string,
    price: number
}

export interface Product {
    id: string,
    name: string,
    category: string,
    highlights: string[],
    variants: Variant[]
}

/**
 * @typedef {object} Database
 * @property {Product[]} products - The products in the database.
 */
export type Database = {
    products: Product[]
}