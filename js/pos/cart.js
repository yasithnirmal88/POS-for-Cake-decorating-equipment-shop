// Cart Management Logic
window.Cart = {
    items: [],
    
    addItem: function(product) {
        if (!product || !product.id) return;
        const price = Number(product.price);
        if (!Number.isFinite(price) || price < 0) return;
        const existingItem = this.items.find(item => item.id === product.id);
        if (existingItem) {
            existingItem.quantity += 1;
        } else {
            this.items.push({ ...product, price, quantity: 1 });
        }
        this.render();
    },
    
    updateQuantity: function(productId, qty) {
        const item = this.items.find(item => item.id === productId);
        if (!item) return;
        let parsed = parseInt(qty, 10);
        if (isNaN(parsed) || parsed < 1) parsed = 1;
        item.quantity = Math.min(parsed, 999);
        this.render();
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
        let subtotal = 0;
        this.items.forEach(item => {
            const price = Number(item.price);
            const qty = Number(item.quantity);
            if (Number.isFinite(price) && Number.isFinite(qty)) {
                subtotal += price * qty;
            }
        });
        const taxRate = 0.10; // 10% tax, must match Cloud Function TAX_RATE
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

            const name = String(item.name == null ? '' : item.name).replace(/</g, '&lt;').replace(/>/g, '&gt;');
            const meta = String(item.barcode == null ? (item.id || '') : item.barcode)
                .replace(/</g, '&lt;').replace(/>/g, '&gt;');
            const price = Number(item.price) || 0;
            const qty = Number(item.quantity) || 1;

            const minBtn = document.createElement('button');
            minBtn.className = 'bg-gray-100 px-2 py-1 rounded text-gray-600 hover:bg-gray-200';
            minBtn.textContent = '-';
            minBtn.addEventListener('click', () => window.Cart.updateQuantity(item.id, qty - 1));

            const plusBtn = document.createElement('button');
            plusBtn.className = 'bg-gray-100 px-2 py-1 rounded text-gray-600 hover:bg-gray-200';
            plusBtn.textContent = '+';
            plusBtn.addEventListener('click', () => window.Cart.updateQuantity(item.id, qty + 1));

            const trashBtn = document.createElement('button');
            trashBtn.className = 'text-red-500 hover:text-red-700 ml-2';
            trashBtn.innerHTML = '<i class="fa-solid fa-trash"></i>';
            trashBtn.setAttribute('aria-label', 'Remove ' + item.name);
            trashBtn.addEventListener('click', () => window.Cart.removeItem(item.id));

            const qtySpan = document.createElement('span');
            qtySpan.className = 'w-6 text-center text-sm font-semibold';
            qtySpan.textContent = qty;

            const controls = document.createElement('div');
            controls.className = 'flex items-center space-x-2 ml-2';
            controls.append(minBtn, qtySpan, plusBtn, trashBtn);

            const info = document.createElement('div');
            info.className = 'flex-1';
            info.innerHTML =
                '<h4 class="font-semibold text-gray-800 text-sm truncate">' + name + '</h4>' +
                '<div class="text-xs text-gray-500">' + meta + '</div>' +
                '<div class="text-sm font-bold text-primary mt-1">$' + price.toFixed(2) + '</div>';

            row.append(info, controls);
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
