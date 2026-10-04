import CEAutoLoader from "ce-autoloader";
import catalog from "./catalog";

window.registry = new CEAutoLoader({ catalog, devErrors: true, hooks: { error: console.error } });

declare global {
    interface Window {
        registry: CEAutoLoader;
    }
}