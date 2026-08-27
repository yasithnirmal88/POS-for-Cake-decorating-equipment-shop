// Inventory Main Controller
window.Inventory = {
    unsubscribe: null,
    
    // Fallback mock data if Firebase isn't connected
    mockInventory: [
        { id: 'branch_01_p1', productId: 'p1', branchId: 'branch_01', stockQuantity: 45, productName: 'Premium Vanilla Fondant 1kg', barcode: '123456789' },
        { id: 'branch_01_p2', productId: 'p2', branchId: 'branch_01', stockQuantity: 5, productName: 'Gold Sprinkles 50g', barcode: '987654321' },
        { id: 'branch_02_p1', productId: 'p1', branchId: 'branch_02', stockQuantity: 12, productName: 'Premium Vanilla Fondant 1kg', barcode: '123456789' },
        { id: 'branch_02_p3', productId: 'p3', branchId: 'branch_02', stockQuantity: 0, productName: 'Piping Bag Set (100pcs)', barcode: '111222333' }
    ],

    init: function() {
        console.log("Inventory module initialized.");
        
        // Listeners for filters
        document.getElementById('inv-branch-filter').addEventListener('change', () => this.fetchData());
        document.getElementById('inv-search').addEventListener('input', () => this.renderTable()); // Client-side search

        // Trigger initial fetch when the view becomes active
        // This is a naive way, better to listen to router changes
        window.addEventListener('hashchange', () => {
            if (window.location.hash === '#/inventory') {
                this.fetchData();
            }
        });
        
        // Initial fetch if we start on this page
        if (window.location.hash === '#/inventory') {
            this.fetchData();
        }
    },

    fetchData: function() {
        const branchFilter = document.getElementById('inv-branch-filter').value;
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

        const db = window.firebaseDb;
        let query = db.collection('inventory');

        if (branchFilter !== 'all') {
            query = query.where('branchId', '==', branchFilter);
        }

        // If it's a real Firebase instance, we use onSnapshot for real-time updates.
        // If it's the mock, we simulate a fetch.
        if (typeof query.onSnapshot === 'function') {
            this.unsubscribe = query.onSnapshot((snapshot) => {
                this.cachedData = [];
                snapshot.forEach(doc => {
                    const data = doc.data();
                    // In a real app, we would join this with the 'products' collection 
                    // to get the product name and barcode. For now, we assume it's duplicated 
                    // or fetched alongside.
                    this.cachedData.push({ id: doc.id, ...data });
                });
                this.renderTable();
            }, (error) => {
                console.error("Error listening to inventory:", error);
                tbody.innerHTML = `<tr><td colspan="6" class="p-4 text-center text-red-500">Error loading data.</td></tr>`;
            });
        } else {
            // Mock Fetch
            setTimeout(() => {
                this.cachedData = this.mockInventory.filter(item => branchFilter === 'all' || item.branchId === branchFilter);
                this.renderTable();
            }, 500);
        }
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
            const isLowStock = item.stockQuantity <= 5;
            const isOut = item.stockQuantity <= 0;
            
            let statusBadge = '<span class="px-2 py-1 bg-green-100 text-green-700 rounded-full text-xs font-semibold">In Stock</span>';
            if (isOut) {
                statusBadge = '<span class="px-2 py-1 bg-red-100 text-red-700 rounded-full text-xs font-semibold">Out of Stock</span>';
            } else if (isLowStock) {
                statusBadge = '<span class="px-2 py-1 bg-yellow-100 text-yellow-700 rounded-full text-xs font-semibold">Low Stock</span>';
            }

            const branchName = item.branchId === 'branch_01' ? 'Branch 01' : 'Branch 02';

            const tr = document.createElement('tr');
            tr.className = 'hover:bg-gray-50 transition';
            tr.innerHTML = `
                <td class="p-4 border-b text-gray-800 font-medium">${item.productName || 'Unknown Product'}</td>
                <td class="p-4 border-b text-gray-500">${item.barcode || '-'}</td>
                <td class="p-4 border-b text-gray-500">${branchName}</td>
                <td class="p-4 border-b text-gray-800 font-bold text-right">${item.stockQuantity}</td>
                <td class="p-4 border-b text-center">${statusBadge}</td>
                <td class="p-4 border-b text-right space-x-2">
                    <button class="text-primary hover:text-pink-800 p-2" title="Adjust Stock" onclick="window.Movements.openAdjustmentModal('${item.productId}', '${item.productName}', '${item.branchId}', ${item.stockQuantity})">
                        <i class="fa-solid fa-pen-to-square"></i>
                    </button>
                    <button class="text-blue-500 hover:text-blue-700 p-2" title="Transfer Stock">
                        <i class="fa-solid fa-truck-fast"></i>
                    </button>
                </td>
            `;
            tbody.appendChild(tr);
        });
    }
};

// Initialize after DOM loads
document.addEventListener('DOMContentLoaded', () => {
    window.Inventory.init();
});
