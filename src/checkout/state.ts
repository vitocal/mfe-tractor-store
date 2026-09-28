import { signal, effect } from "@preact/signals-core";
import type { Cart } from "./types";

const STORAGE_KEY = "tractor_shopping_cart";

/**
 * Helper to safely read and parse initial state from localStorage
 */
function getInitialCart(): Cart {
    if (typeof window === "undefined") return [];

    try {
        const stored = localStorage.getItem(STORAGE_KEY);
        return stored ? JSON.parse(stored) : [];
    } catch (error) {
        console.error("Failed to load cart from localStorage:", error);
        return [];
    }
}

/**
 * Reactive cart signal initialized with localStorage data
 */
export const cart = signal<Cart>(getInitialCart());

/**
 * Automatically syncs cart signal updates back to localStorage
 */
if (typeof window !== "undefined") {
    effect(() => {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(cart.value));
        } catch (error) {
            console.error("Failed to save cart to localStorage:", error);
        }
    });
}

export const addToCart = async (sku: string) => {
    const items = [...cart.value];
    const lineItem = items.find((i) => i.sku === sku);

    if (lineItem) {
        lineItem.quantity++;
    } else {
        items.push({ sku, quantity: 1 });
    }

    cart.value = items;
};

export const removeFromCart = async (sku: string) => {
    cart.value = cart.value.filter((i) => i.sku !== sku);
};

export const placeOrder = async () => {
    cart.value = [];
}
