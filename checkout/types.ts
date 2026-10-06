export interface CartItem {
    sku: string,
    quantity: number
}

export type Cart = CartItem[];