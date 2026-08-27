// CakePOS Application Bootstrap
// Order matters with the Vanilla JS / window.* architecture:
//   1. Router (hash routing + route guards)
//   2. POS (product grid, cart interaction)
//   3. Data modules are initialized on their own DOMContentLoaded listeners,
//      which fire before this bootstrap (since their <script> tags precede
//      app.js in index.html).
document.addEventListener('DOMContentLoaded', () => {
    console.log("CakePOS Starting...");

    if (!window.firebaseConfig || window.firebaseConfig.apiKey === "YOUR_API_KEY") {
        console.warn("CakePOS: Firebase is not configured. Some features will be unavailable.");
    }

    // Initialize Router
    if (window.Router) {
        try {
            window.Router.init();
        } catch (e) {
            console.error("Router initialization failed:", e);
        }
    }

    // Initialize POS logic if it exists
    if (window.POS) {
        try {
            window.POS.init();
        } catch (e) {
            console.error("POS initialization failed:", e);
        }
    }
});
