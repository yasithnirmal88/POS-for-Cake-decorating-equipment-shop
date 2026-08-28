// Inventory Admin Dashboard
window.Inventory = {
    unsubscribe: null,
    
    init: function() {
        console.log("Inventory module initialized.");
        
        // Listeners for filters
        document.getElementById('inv-branch-filter').addEventListener('change', () => this.fetchData());
        document.getElementById('inv-search').addEventListener('input', () => this.renderTable()); // Client-side search

        // Trigger initial fetch when the view becomes active (only once
        // authenticated; auth.js triggers a full refresh after login).
        window.addEventListener('hashchange', () => {
            if (window.location.hash === '#/inventory' && window.AppState.user) {
                this.fetchData();
            }
        });
    },

    fetchData: function() {
        // Do not query before authentication (rules deny unauthenticated reads
        // and produce a confusing permission error). auth.js calls fetchData()
        // again after login.
        if (!window.firebaseAuth || !window.firebaseAuth.currentUser) {
            return;
        }

        let branchFilter = document.getElementById('inv-branch-filter').value;
        const tbody = document.getElementById('inventory-table-body');
        
        // Cancel previous listener
        if (this.unsubscribe) {
            this.unsubscribe();
            this.unsubscribe = null;
        }

        // Show loading
        tbody.innerHTML = `
            <tr>
                <td colspan="6" class="p-8 text-center text-gray-400">
                    <i class="fa-solid fa-spinner fa-spin text-2xl mb-2"></i>
                    <p>Loading inventory data...</p>
                </td>
            </tr>
        `;

        // Enforce branch isolation for branch-scoped users: they may not ask
        // for "all" branches (or another branch), regardless of the UI filter.
        if (window.Permissions.isBranchScoped()) {
            branchFilter = window.AppState.user.branchId;
            const sel = document.getElementById('inv-branch-filter');
            if (sel) sel.value = branchFilter;
        }

        const db = window.firebaseDb;
        let query = db.collection('inventory');

        if (branchFilter && branchFilter !== 'all') {
            query = query.where('branchId', '==', branchFilter);
        }

        // Join product names/barcodes from the products catalog once.
        const loadProducts = db.collection('products').onSnapshot((snap) => {
            this.cachedProducts = {};
            snap.forEach(doc => { this.cachedProducts[doc.id] = doc.data(); });
            if (this.cachedData) this.renderTable();
        }, (err) => console.error("Error listening to products:", err));
        this._unsubscribeProducts = loadProducts;

        this.unsubscribe = query.onSnapshot((snapshot) => {
            this.cachedData = [];
            snapshot.forEach(doc => {
                const data = doc.data();
                const p = this.cachedProducts && this.cachedProducts[data.productId];
                this.cachedData.push({
                    id: doc.id,
                    ...data,
                    productName: (p && p.name) || data.productName || 'Unknown Product',
                    barcode: (p && p.barcode) || data.barcode || ''
                });
            });
            this.renderTable();
        }, (error) => {
            console.error("Error listening to inventory:", error);
            tbody.innerHTML = `<tr><td colspan="6" class="p-4 text-center text-red-500">Error loading data.</td></tr>`;
        });
    },

    renderTable: function() {
        const tbody = document.getElementById('inventory-table-body');
        const searchTerm = document.getElementById('inv-search').value.toLowerCase();
        
        if (!this.cachedData) return;

        // Apply client-side search filter
        const filteredData = this.cachedData.filter(item => {
            const nameMatch = (item.productName || '').toLowerCase().includes(searchTerm);
            const barcodeMatch = (item.barcode || '').toLowerCase().includes(searchTerm);
            return nameMatch || barcodeMatch;
        });

        tbody.innerHTML = '';

        if (filteredData.length === 0) {
            tbody.innerHTML = `<tr><td colspan="6" class="p-8 text-center text-gray-500">No inventory records found.</td></tr>`;
            return;
        }

        filteredData.forEach(item => {
            const stock = Number(item.stockQuantity);
            const isLowStock = stock <= 5;
            const isOut = stock <= 0;
            
            let statusBadge = '<span class="px-2 py-1 bg-green-100 text-green-700 rounded-full text-xs font-semibold">In Stock</span>';
            if (isOut) {
                statusBadge = '<span class="px-2 py-1 bg-red-100 text-red-700 rounded-full text-xs font-semibold">Out of Stock</span>';
            } else if (isLowStock) {
                statusBadge = '<span class="px-2 py-1 bg-yellow-100 text-yellow-700 rounded-full text-xs font-semibold">Low Stock</span>';
            }

            const branchName = item.branchId === 'branch_01' ? 'Branch 01' : 'Branch 02';
            const prodName = String(item.productName || 'Unknown Product').replace(/</g, '&lt;').replace(/>/g, '&gt;');
            const barcode = String(item.barcode || '-').replace(/</g, '&lt;').replace(/>/g, '&gt;');
            const canEdit = window.Permissions.canAccess('manage_inventory');

            const tr = document.createElement('tr');
            tr.className = 'hover:bg-gray-50 transition';
            tr.innerHTML = `
                <td class="p-4 border-b text-gray-800 font-medium">${prodName}</td>
                <td class="p-4 border-b text-gray-500">${barcode}</td>
                <td class="p-4 border-b text-gray-500">${branchName}</td>
                <td class="p-4 border-b text-gray-800 font-bold text-right">${stock}</td>
                <td class="p-4 border-b text-center">${statusBadge}</td>
                <td class="p-4 border-b text-right space-x-2">${canEdit ? `
                    <button class="text-primary hover:text-pink-800 p-2 btn-adjust-stock" title="Adjust Stock" data-product-id="${item.productId}" data-product-name="${item.productName}" data-branch-id="${item.branchId}" data-stock="${stock}">
                        <i class="fa-solid fa-pen-to-square"></i>
                    </button>` : ''}${canEdit ? `
                    <button class="text-blue-500 hover:text-blue-700 p-2 btn-transfer-stock" title="Transfer Stock" data-product-id="${item.productId}" data-product-name="${item.productName}" data-branch-id="${item.branchId}" data-stock="${stock}">
                        <i class="fa-solid fa-truck-fast"></i>
                    </button>` : ''}
                </td>
            `;
            tbody.appendChild(tr);
        });

        // Wire up action buttons using addEventListener (no inline onclick).
        this.bindRowActions();
    },

    bindRowActions: function() {
        document.querySelectorAll('.btn-adjust-stock').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const el = e.currentTarget;
                window.Movements.openAdjustmentModal(
                    el.getAttribute('data-product-id'),
                    el.getAttribute('data-product-name'),
                    el.getAttribute('data-branch-id'),
                    parseInt(el.getAttribute('data-stock'), 10)
                );
            });
        });
        document.querySelectorAll('.btn-transfer-stock').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const el = e.currentTarget;
                if (window.Transfers) {
                    window.Transfers.openTransferModal(
                        el.getAttribute('data-product-id'),
                        el.getAttribute('data-product-name'),
                        el.getAttribute('data-branch-id'),
                        parseInt(el.getAttribute('data-stock'), 10)
                    );
                }
            });
        });
    }
};

// Initialize after DOM loads
document.addEventListener('DOMContentLoaded', () => {
    window.Inventory.init();
});
