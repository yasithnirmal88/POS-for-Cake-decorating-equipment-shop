// Cart Management Logic
window.Cart = {
    items: [],
    
    addItem: function(product) {
        const existingItem = this.items.find(item => item.id === product.id);
        if (existingItem) {
            existingItem.quantity += 1;
        } else {
            this.items.push({ ...product, quantity: 1 });
        }
        this.render();
    },
    
    updateQuantity: function(productId, qty) {
        const item = this.items.find(item => item.id === productId);
        if (item) {
            item.quantity = Math.max(1, parseInt(qty) || 1);
            this.render();
        }
    },
    
    removeItem: function(productId) {
        this.items = this.items.filter(item => item.id !== productId);
        this.render();
    },
    
    clear: function() {
        this.items = [];
        this.render();
    },
    
    getTotals: function() {
        const subtotal = this.items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
        const taxRate = 0.10; // 10% tax example
        const tax = subtotal * taxRate;
        const total = subtotal + tax;
        
        return { subtotal, tax, total };
    },
    
    render: function() {
        const cartContainer = document.getElementById('pos-cart-items');
        const emptyState = document.getElementById('pos-cart-empty');
        
        // Remove existing item elements but keep empty state hidden if needed
        cartContainer.querySelectorAll('.cart-item-row').forEach(el => el.remove());
        
        if (this.items.length === 0) {
            emptyState.style.display = 'block';
            this.updateTotals();
            return;
        }
        
        emptyState.style.display = 'none';
        
        this.items.forEach(item => {
            const row = document.createElement('div');
            row.className = 'cart-item-row flex justify-between items-center bg-white border border-gray-200 p-3 rounded-md shadow-sm';
            row.innerHTML = `
                <div class="flex-1">
                    <h4 class="font-semibold text-gray-800 text-sm truncate">${item.name}</h4>
                    <div class="text-xs text-gray-500">${item.barcode || item.id}</div>
                    <div class="text-sm font-bold text-primary mt-1">$${item.price.toFixed(2)}</div>
                </div>
                <div class="flex items-center space-x-2 ml-2">
                    <button class="bg-gray-100 px-2 py-1 rounded text-gray-600 hover:bg-gray-200" onclick="window.Cart.updateQuantity('${item.id}', ${item.quantity - 1})">-</button>
                    <span class="w-6 text-center text-sm font-semibold">${item.quantity}</span>
                    <button class="bg-gray-100 px-2 py-1 rounded text-gray-600 hover:bg-gray-200" onclick="window.Cart.updateQuantity('${item.id}', ${item.quantity + 1})">+</button>
                    <button class="text-red-500 hover:text-red-700 ml-2" onclick="window.Cart.removeItem('${item.id}')"><i class="fa-solid fa-trash"></i></button>
                </div>
            `;
            cartContainer.appendChild(row);
        });
        
        this.updateTotals();
    },
    
    updateTotals: function() {
        const { subtotal, tax, total } = this.getTotals();
        
        document.getElementById('pos-subtotal').textContent = `$${subtotal.toFixed(2)}`;
        document.getElementById('pos-tax').textContent = `$${tax.toFixed(2)}`;
        document.getElementById('pos-total').textContent = `$${total.toFixed(2)}`;
        document.getElementById('pos-btn-total').textContent = `$${total.toFixed(2)}`;
        
        const payBtn = document.getElementById('pos-pay-btn');
        if (this.items.length > 0) {
            payBtn.removeAttribute('disabled');
        } else {
            payBtn.setAttribute('disabled', 'true');
        }
    }
};
