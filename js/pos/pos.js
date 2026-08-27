// Main POS Controller
window.POS = {
    // Fallback mock data in case Products module fails or hasn't loaded
    mockProducts: [
        { id: 'p1', barcode: '123456789', name: 'Premium Vanilla Fondant 1kg', price: 15.99, category: 'fondant', imageIcon: 'fa-cube' },
        { id: 'p2', barcode: '987654321', name: 'Gold Sprinkles 50g', price: 4.50, category: 'sprinkles', imageIcon: 'fa-sparkles' }
    ],

    init: function() {
        this.renderGrid();
        
        // Setup Clear Cart button
        document.getElementById('pos-clear-cart').addEventListener('click', () => {
            if(confirm("Clear current order?")) {
                window.Cart.clear();
            }
        });
        
        // Setup Search
        document.getElementById('pos-search').addEventListener('input', (e) => {
            const term = e.target.value.toLowerCase();
            const dataSource = (window.Products && window.Products.cachedData && window.Products.cachedData.length > 0) 
                                ? window.Products.cachedData : this.mockProducts;
                                
            const filtered = dataSource.filter(p => 
                (p.name && p.name.toLowerCase().includes(term)) || 
                (p.barcode && p.barcode.includes(term))
            );
            this.renderProductGrid(filtered);
        });
        
        // Setup Pay Button
        document.getElementById('pos-pay-btn').addEventListener('click', () => {
            window.Checkout.initiate();
        });
    },

    renderGrid: function() {
        if (window.Products && window.Products.cachedData && window.Products.cachedData.length > 0) {
            this.renderProductGrid(window.Products.cachedData);
        } else {
            // Wait for products to load, or show mock
            this.renderProductGrid(this.mockProducts);
        }
    },
    
    renderProductGrid: function(products) {
        const grid = document.getElementById('pos-product-grid');
        if (!grid) return;
        
        grid.innerHTML = '';
        
        products.forEach(p => {
            const card = document.createElement('div');
            card.className = 'bg-white p-4 rounded-lg shadow-sm border border-gray-100 cursor-pointer hover:shadow-md transition text-center flex flex-col items-center justify-between h-36';
            card.onclick = () => window.Cart.addItem(p);
            
            const iconStr = p.imageIcon || p.icon || p.image || 'fa-cube';
            
            card.innerHTML = `
                <div class="text-primary text-2xl mb-2"><i class="fa-solid ${iconStr}"></i></div>
                <div class="font-semibold text-gray-800 text-sm line-clamp-2">${p.name}</div>
                <div class="mt-2 font-bold text-lg text-gray-900">$${parseFloat(p.price).toFixed(2)}</div>
            `;
            grid.appendChild(card);
        });
    },
    
    handleBarcodeScan: function(barcode) {
        const dataSource = (window.Products && window.Products.cachedData && window.Products.cachedData.length > 0) 
            ? window.Products.cachedData : this.mockProducts;

        const product = dataSource.find(p => p.barcode === barcode);
        if (product) {
            window.Cart.addItem(product);
            
            // Visual feedback
            const searchInput = document.getElementById('pos-search');
            searchInput.value = '';
            searchInput.placeholder = `Added ${product.name}!`;
            setTimeout(() => searchInput.placeholder = "Scan Barcode or Search Products...", 2000);
        } else {
            alert(`Product with barcode ${barcode} not found!`);
        }
    }
};

document.addEventListener('DOMContentLoaded', () => {
    // POS will be initialized by app.js, or we can self initialize
    // Let's rely on app.js to initialize it, or do it safely here:
    // Actually the previous version didn't self-init via event listener.
    // Wait, the previous version didn't have DOMContentLoaded here. Let's just expose it.
});
