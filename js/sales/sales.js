// Sales History Module
// Reads immutable `sales` records (created by the createSale Cloud Function).
// Suffered branch isolation and a searchable table with receipt printing.
window.Sales = {
    unsubscribe: null,
    cachedData: [],

    init: function() {
        const search = document.getElementById('sales-search');
        if (search) search.addEventListener('input', () => this.renderTable());

        window.addEventListener('hashchange', () => {
            if (window.location.hash === '#/sales') this.fetchData();
        });
        if (window.location.hash === '#/sales') this.fetchData();
    },

    fetchData: function() {
        const db = window.firebaseDb;
        if (!db || !window.firebaseConfig || window.firebaseConfig.apiKey === "YOUR_API_KEY") {
            document.getElementById('sales-table-body').innerHTML =
                '<tr><td colspan="7" class="py-8 text-center text-gray-500">Real Firebase connection required.</td></tr>';
            return;
        }
        if (this.unsubscribe) this.unsubscribe();

        // Enforce branch isolation for branch-scoped users.
        let query = db.collection('sales');
        if (window.Permissions.isBranchScoped()) {
            query = query.where('branchId', '==', window.AppState.user.branchId);
        }
        query = query.orderBy('timestamp', 'desc').limit(200);

        this.unsubscribe = query.onSnapshot((snapshot) => {
            this.cachedData = [];
            snapshot.forEach(doc => this.cachedData.push({ id: doc.id, ...doc.data() }));
            this.renderTable();
        }, (error) => {
            console.error("Error listening to sales:", error);
            document.getElementById('sales-table-body').innerHTML =
                '<tr><td colspan="7" class="py-8 text-center text-red-500">Unable to load sales.</td></tr>';
        });
    },

    renderTable: function() {
        const tbody = document.getElementById('sales-table-body');
        const searchTerm = (document.getElementById('sales-search') || { value: '' }).value.toLowerCase().trim();
        tbody.innerHTML = '';

        const data = (this.cachedData || []).filter(s => {
            if (!searchTerm) return true;
            return String(s.invoiceNumber || '').toLowerCase().includes(searchTerm);
        });

        if (data.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" class="py-8 text-center text-gray-500">No sales found.</td></tr>';
            return;
        }

        data.forEach(sale => {
            const tr = document.createElement('tr');
            const date = this._toDate(sale).toLocaleString();
            const branch = sale.branchId === 'branch_01' ? 'Branch 01' : (sale.branchId === 'branch_02' ? 'Branch 02' : (sale.branchId || '-'));
            const invoice = String(sale.invoiceNumber || '-').replace(/</g, '&lt;');
            const cashier = String(sale.cashierName || sale.cashierId || '-').replace(/</g, '&lt;');
            const method = String(sale.paymentMethod || '-');
            const total = Number(sale.total) || Number(sale.totalAmount) || 0;

            tr.innerHTML = `
                <td class="p-4 border-b text-gray-800 font-mono text-sm">${invoice}</td>
                <td class="p-4 border-b text-gray-500">${date}</td>
                <td class="p-4 border-b text-gray-500">${branch}</td>
                <td class="p-4 border-b text-gray-500">${cashier}</td>
                <td class="p-4 border-b text-gray-500 capitalize">${method}</td>
                <td class="p-4 border-b text-gray-800 font-bold text-right">$${total.toFixed(2)}</td>
                <td class="p-4 border-b text-right">
                    <button class="btn-reprint-sale text-primary hover:text-pink-800 p-2" title="Print Receipt" data-id="${sale.id}">
                        <i class="fa-solid fa-print"></i>
                    </button>
                </td>
            `;
            tbody.appendChild(tr);
        });

        document.querySelectorAll('.btn-reprint-sale').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const id = e.currentTarget.getAttribute('data-id');
                const sale = (this.cachedData || []).find(s => s.id === id);
                if (sale) this.printReceipt(sale);
            });
        });
    },

    _toDate: function(sale) {
        let t = sale && sale.timestamp;
        if (t == null) t = sale && sale.createdAt;
        if (t == null) t = sale && sale.createdMillis;
        if (t == null) return new Date(0);
        if (t.toDate && typeof t.toDate === 'function') return t.toDate();
        if (t instanceof Date) return t;
        const d = new Date(t);
        return isNaN(d.getTime()) ? new Date(0) : d;
    },

    printReceipt: function(sale) {
        // Reuse Checkout.printReceipt for consistent 58/80mm output.
        if (window.Checkout && typeof window.Checkout.printReceipt === 'function') {
            window.Checkout.printReceipt(sale);
        } else {
            console.warn("Checkout module unavailable for receipt printing.");
        }
    }
};

document.addEventListener('DOMContentLoaded', () => {
    window.Sales.init();
});
