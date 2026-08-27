// Main POS Controller
// Products always come from the real `products` collection (via Products
// module). No mock data is used in production.
window.POS = {
    init: function() {
        this.renderGrid();
        
        // Setup Clear Cart button
        document.getElementById('pos-clear-cart').addEventListener('click', () => {
            if (window.Cart.items.length > 0 && confirm("Clear current order?")) {
                window.Cart.clear();
            }
        });

        // Initialize category filter options
        const cats = document.getElementById('pos-category-filter');
        if (cats && window.Products) {
            cats.addEventListener('change', () => this.renderGrid());
            this.populateCategories();
        }
        
        // Setup Search
        document.getElementById('pos-search').addEventListener('input', () => {
            this.renderGrid();
        });
        
        // Setup Pay Button
        document.getElementById('pos-pay-btn').addEventListener('click', () => {
            window.Checkout.initiate();
        });
    },

    getProductSource: function() {
        if (window.Products && Array.isArray(window.Products.cachedData) && window.Products.cachedData.length > 0) {
            // Filter out inactive products for the POS grid.
            return window.Products.cachedData.filter(p => p.active !== false);
        }
        return [];
    },

    renderGrid: function() {
        const products = this.getProductSource();
        if (products.length === 0) {
            this.renderEmptyGrid();
            return;
        }
        this.renderProductGrid(products);
    },

    renderEmptyGrid: function() {
        const grid = document.getElementById('pos-product-grid');
        if (!grid) return;
        grid.innerHTML = '';
        const empty = document.createElement('div');
        empty.className = 'col-span-full text-center text-gray-400 py-16';
        empty.innerHTML = '<i class="fa-solid fa-box-open text-4xl mb-2"></i><p>Loading products...</p>';
        grid.appendChild(empty);
    },

    renderProductGrid: function(products) {
        const grid = document.getElementById('pos-product-grid');
        if (!grid) return;

        const searchTerm = (document.getElementById('pos-search').value || '').toLowerCase().trim();
        const catFilter = (document.getElementById('pos-category-filter') || {}).value;

        const filtered = products.filter(p => {
            const name = String(p.name || '').toLowerCase();
            const barcode = String(p.barcode || '').toLowerCase();
            const termMatch = !searchTerm || name.includes(searchTerm) || barcode.includes(searchTerm);
            const catMatch = !catFilter || catFilter === 'all' || (p.category || '') === catFilter;
            return termMatch && catMatch;
        });

        grid.innerHTML = '';

        if (filtered.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'col-span-full text-center text-gray-400 py-16';
            empty.innerHTML = '<i class="fa-solid fa-magnifying-glass text-4xl mb-2"></i><p>No products match your search.</p>';
            grid.appendChild(empty);
            return;
        }

        filtered.forEach(p => {
            const card = document.createElement('div');
            card.className = 'bg-white p-4 rounded-lg shadow-sm border border-gray-100 cursor-pointer hover:shadow-md transition text-center flex flex-col items-center justify-between h-36';
            card.addEventListener('click', () => window.Cart.addItem(p));

            const iconStr = String(p.imageIcon || p.icon || p.image || 'fa-cube')
                .replace(/[^a-zA-Z0-9-_ ]/g, '');
            const name = String(p.name == null ? 'Product' : p.name)
                .replace(/</g, '&lt;').replace(/>/g, '&gt;');
            const price = Number(p.price);

            card.innerHTML =
                '<div class="text-primary text-2xl mb-2"><i class="fa-solid ' + iconStr + '"></i></div>' +
                '<div class="font-semibold text-gray-800 text-sm line-clamp-2">' + name + '</div>' +
                '<div class="mt-2 font-bold text-lg text-gray-900">$' + (Number.isFinite(price) ? price.toFixed(2) : '0.00') + '</div>';
            grid.appendChild(card);
        });
    },
    
    populateCategories: function() {
        const cats = document.getElementById('pos-category-filter');
        if (!cats || !window.Products) return;
        const products = window.Products.cachedData || [];
        const categories = new Set();
        products.forEach(p => { if (p.category) categories.add(p.category); });
        // Preserve the "All Categories" option, clear the rest.
        while (cats.options.length > 1) cats.remove(1);
        categories.forEach(c => {
            const opt = document.createElement('option');
            opt.value = c;
            opt.textContent = c;
            cats.appendChild(opt);
        });
    },

    handleBarcodeScan: function(barcode) {
        const dataSource = this.getProductSource();
        const product = dataSource.find(p => String(p.barcode || '') === String(barcode));
        if (product) {
            window.Cart.addItem(product);
            
            // Visual feedback
            const searchInput = document.getElementById('pos-search');
            searchInput.value = '';
            searchInput.placeholder = 'Added ' + product.name + '!';
            setTimeout(() => searchInput.placeholder = "Scan Barcode or Search Products...", 2000);
        } else {
            alert('Product with barcode ' + barcode + ' not found!');
        }
    }
};

document.addEventListener('DOMContentLoaded', () => {
    // POS will be initialized by app.js, or we can self initialize
    // Let's rely on app.js to initialize it, or do it safely here:
    // Actually the previous version didn't self-init via event listener.
    // Wait, the previous version didn't have DOMContentLoaded here. Let's just expose it.
});
