import CEAutoLoader from "ce-autoloader";
import catalog from "./catalog";

window.registry = new CEAutoLoader({ catalog });

declare global {
    interface Window {
        registry: CEAutoLoader;
    }
}