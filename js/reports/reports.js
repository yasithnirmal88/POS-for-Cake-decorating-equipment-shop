// Sales Reporting & Analytics Module
window.Reports = {
    unsubscribeSales: null,
    unsubscribeInventory: null,
    cachedSalesData: [],
    cachedInventoryData: [],
    charts: {}, // Store chart instances

    init: function() {
        console.log("Reports module initialized.");
        
        // Listeners for filters
        document.getElementById('report-branch-filter').addEventListener('change', () => this.fetchData());
        
        const dateFilter = document.getElementById('report-date-filter');
        const customDateDiv = document.getElementById('custom-date-range');
        
        dateFilter.addEventListener('change', (e) => {
            if (e.target.value === 'custom') {
                customDateDiv.classList.remove('hidden');
            } else {
                customDateDiv.classList.add('hidden');
                this.fetchData();
            }
        });

        document.getElementById('btn-apply-custom-date').addEventListener('click', () => this.fetchData());
        
        // Export button
        document.getElementById('btn-export-csv').addEventListener('click', () => this.exportCSV());

        // Load data when hash changes to reports (only once authenticated -
        // auth.js triggers a full refresh after login).
        window.addEventListener('hashchange', () => {
            if (window.location.hash === '#/reports' && window.AppState.user) {
                this.fetchData();
                this.fetchInventoryData();
            }
        });
    },

    fetchData: function() {
        // Do not query before authentication (rules deny unauthenticated reads
        // and produce a confusing permission error). auth.js calls refresh()
        // after login.
        if (!window.firebaseAuth || !window.firebaseAuth.currentUser) {
            return;
        }

        let branchFilter = document.getElementById('report-branch-filter').value;
        const dateFilter = document.getElementById('report-date-filter').value;
        
        if (this.unsubscribeSales) {
            this.unsubscribeSales();
            this.unsubscribeSales = null;
        }

        // Enforce branch isolation: a branch-scoped user always reads only
        // their own branch regardless of the UI filter.
        if (window.Permissions.isBranchScoped()) {
            branchFilter = window.AppState.user.branchId;
            const sel = document.getElementById('report-branch-filter');
            if (sel) sel.value = branchFilter;
        }

        const db = window.firebaseDb;
        if (!db || !window.firebaseConfig || window.firebaseConfig.apiKey === "YOUR_API_KEY") {
            document.getElementById('report-cashier-sales').innerHTML =
                '<tr><td colspan="2" class="py-4 text-center text-gray-500">Real Firebase connection required.</td></tr>';
            return;
        }

        let query = db.collection('sales');

        if (branchFilter && branchFilter !== 'all') {
            query = query.where('branchId', '==', branchFilter);
        }

        this.unsubscribeSales = query.onSnapshot((snapshot) => {
            let rawData = [];
            snapshot.forEach(doc => {
                rawData.push({ id: doc.id, ...doc.data() });
            });
            
            // Client-side date filter
            this.cachedSalesData = this.filterByDate(rawData, dateFilter);
            this.processData();
        }, (error) => {
            console.error("Error listening to sales:", error);
            document.getElementById('report-cashier-sales').innerHTML =
                '<tr><td colspan="2" class="py-4 text-center text-red-500">Unable to load sales data.</td></tr>';
        });
    },

    // Called by checkout.js after a successful sale to refresh the dashboard
    // KPIs without a page reload (listeners already update on change; this is
    // a hint that data may have changed).
    refresh: function() {
        this.fetchData();
        this.fetchInventoryData();
    },

    // Called right after login (authenticated context). Ignores when the user
    // is not yet logged in so pre-auth listeners are not created pointlessly.
    refreshSafely: function() {
        if (!window.AppState.user) return;
        this.refresh();
    },

    fetchInventoryData: function() {
        const db = window.firebaseDb;
        if (!db || !window.firebaseConfig || window.firebaseConfig.apiKey === "YOUR_API_KEY") return;
        
        if (this.unsubscribeInventory) {
            this.unsubscribeInventory();
        }

        // Inventory stock lives in the `inventory` collection (branch-scoped),
        // not on the `products` documents. Read each branch's inventory and
        // join to the products catalog for names. For branch-scoped users only
        // their branch's inventory is queried (enforced by rules too).
        const branch = this.currentBranchId();

        // Keep a product-name lookup from the products list.
        const loadProducts = db.collection('products').onSnapshot((snap) => {
            this.cachedProducts = {};
            snap.forEach(doc => {
                this.cachedProducts[doc.id] = doc.data();
            });
            // Re-render inventory if we already have inventory data.
            if (this.cachedInventoryData) this.renderInventoryStatus();
        }, (err) => console.error("Error listening to products:", err));

        let query = db.collection('inventory');
        if (branch && branch !== 'all') {
            query = query.where('branchId', '==', branch);
        }

        this.unsubscribeInventory = query.onSnapshot((snapshot) => {
            this.cachedInventoryData = [];
            snapshot.forEach(doc => {
                const d = doc.data();
                // Join product name/barcode from the products catalog.
                const p = this.cachedProducts && this.cachedProducts[d.productId];
                this.cachedInventoryData.push({
                    id: doc.id,
                    ...d,
                    productName: (p && p.name) || d.productName || 'Unknown Product',
                    barcode: (p && p.barcode) || d.barcode || ''
                });
            });
            this.renderInventoryStatus();
        }, (err) => {
            console.error("Error listening to inventory:", err);
            document.getElementById('report-inventory-status').innerHTML =
                '<tr><td colspan="4" class="py-4 text-center text-red-500">Unable to load inventory data.</td></tr>';
        });

        // Keep product listener so unsubscribing doesn't leak.
        this._unsubscribeProducts = loadProducts;
    },

    // Which branch should reports read? Branch-scoped users are locked to
    // their branch; admins/managers with branchId 'all' can read all branches.
    currentBranchId: function() {
        const u = window.AppState.user;
        if (!u) return 'all';
        if (u.branchId === 'branch_01' || u.branchId === 'branch_02') return u.branchId;
        return 'all';
    },

    filterByDate: function(data, dateFilter) {
        const now = new Date();
        let startDate = new Date(0);
        let endDate = new Date('2100-01-01'); // Far future

        if (dateFilter === 'today') {
            startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        } else if (dateFilter === 'week') {
            startDate = new Date(now.setDate(now.getDate() - now.getDay())); // Sunday
            startDate.setHours(0, 0, 0, 0);
        } else if (dateFilter === 'month') {
            startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        } else if (dateFilter === 'custom') {
            const startVal = document.getElementById('report-start-date').value;
            const endVal = document.getElementById('report-end-date').value;
            
            if (startVal) startDate = new Date(startVal);
            if (endVal) {
                endDate = new Date(endVal);
                endDate.setHours(23, 59, 59, 999);
            }
        }

        return data.filter(sale => {
            const saleDate = this.toDate(sale);
            return saleDate >= startDate && saleDate <= endDate;
        });
    },

    // Convert a sale's timestamp (Firestore Timestamp, JS Date, ISO string, or
    // epoch millis) to a JS Date consistently across seed data, the POS, and
    // Cloud Function records.
    toDate: function(sale) {
        let t = sale && sale.timestamp;
        if (t == null) t = sale && sale.createdAt;
        if (t == null) t = sale && sale.createdMillis;
        if (t == null) return new Date(0);
        // Firestore Timestamp object (has toDate)
        if (t.toDate && typeof t.toDate === 'function') return t.toDate();
        if (t instanceof Date) return t;
        // ISO string or milliseconds number
        const d = new Date(t);
        return isNaN(d.getTime()) ? new Date(0) : d;
    },

    processData: function() {
        if (!this.cachedSalesData) return;
        
        const data = this.cachedSalesData;
        
        // Metrics
        let totalRevenue = 0;
        let returnsAmount = 0;
        let transactions = data.length;
        
        // Chart aggregations
        const productStats = {};
        const dailyStats = {};
        const paymentStats = { cash: 0, card: 0, other: 0 };
        const branchStats = {};
        const cashierStats = {};
        
        data.forEach(sale => {
            const total = (sale.total || sale.totalAmount || 0);
            
            // Returns handling (Assuming negative total or 'returned' status)
            if (sale.status === 'returned' || total < 0) {
                returnsAmount += Math.abs(total);
            } else {
                totalRevenue += total;
            }

            // Payment Methods
            const pm = sale.paymentMethod ? sale.paymentMethod.toLowerCase() : 'other';
            if (paymentStats[pm] !== undefined) paymentStats[pm] += total;
            else paymentStats.other += total;

            // Branch Stats
            const b = sale.branchId || 'Unknown';
            branchStats[b] = (branchStats[b] || 0) + total;

            // Cashier Stats
            const c = sale.cashierId || 'Unknown';
            cashierStats[c] = (cashierStats[c] || 0) + total;

            // Daily Stats for trend chart
            const saleDate = this.toDate(sale);
            // Format as YYYY-MM-DD
            const dateString = saleDate.toISOString().split('T')[0];
            dailyStats[dateString] = (dailyStats[dateString] || 0) + total;

            // Products
            if(sale.items && sale.status !== 'returned' && total > 0) {
                sale.items.forEach(item => {
                    const name = item.name;
                    if (!productStats[name]) productStats[name] = { name: name, qty: 0, revenue: 0 };
                    productStats[name].qty += item.quantity;
                    productStats[name].revenue += (item.quantity * item.price);
                });
            }
        });
        
        const aov = transactions > 0 ? totalRevenue / transactions : 0;
        
        // Update KPIs
        document.getElementById('kpi-revenue').textContent = `$${totalRevenue.toFixed(2)}`;
        document.getElementById('kpi-transactions').textContent = transactions;
        document.getElementById('kpi-aov').textContent = `$${aov.toFixed(2)}`;
        document.getElementById('kpi-returns').textContent = `$${returnsAmount.toFixed(2)}`;

        // Process arrays for rendering
        const sortedProducts = Object.values(productStats).sort((a, b) => b.revenue - a.revenue).slice(0, 10);
        this.renderTopProducts(sortedProducts);
        this.renderCashierSales(cashierStats);

        // Update Charts
        this.updateCharts(dailyStats, paymentStats, branchStats);
    },

    renderTopProducts: function(products) {
        const tbody = document.getElementById('report-top-products');
        tbody.innerHTML = '';
        
        if (products.length === 0) {
            tbody.innerHTML = '<tr><td colspan="3" class="py-4 text-center text-gray-500">No product data</td></tr>';
            return;
        }
        
        products.forEach(p => {
            const tr = document.createElement('tr');
            const name = String(p.name || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
            tr.innerHTML = `
                <td class="py-3 border-b text-gray-800">${name}</td>
                <td class="py-3 border-b text-right font-semibold text-gray-600">${p.qty}</td>
                <td class="py-3 border-b text-right font-bold text-primary">$${(Number(p.revenue) || 0).toFixed(2)}</td>
            `;
            tbody.appendChild(tr);
        });
    },

    renderCashierSales: function(cashierStats) {
        const tbody = document.getElementById('report-cashier-sales');
        tbody.innerHTML = '';

        const sorted = Object.entries(cashierStats).sort((a, b) => b[1] - a[1]);
        if(sorted.length === 0) {
            tbody.innerHTML = '<tr><td colspan="2" class="py-4 text-center text-gray-500">No cashier data</td></tr>';
            return;
        }

        sorted.forEach(([cashier, total]) => {
            const tr = document.createElement('tr');
            const name = String(cashier).replace(/</g, '&lt;').replace(/>/g, '&gt;');
            tr.innerHTML = `
                <td class="py-2 border-b text-gray-800">${name}</td>
                <td class="py-2 border-b text-right font-bold text-gray-800">$${(Number(total) || 0).toFixed(2)}</td>
            `;
            tbody.appendChild(tr);
        });
    },

    renderInventoryStatus: function() {
        const tbody = document.getElementById('report-inventory-status');
        tbody.innerHTML = '';

        if (!this.cachedInventoryData || this.cachedInventoryData.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" class="py-4 text-center text-gray-500">No inventory data</td></tr>';
            return;
        }

        // Sort by stock to show low stock first
        const sorted = [...this.cachedInventoryData].sort(
            (a, b) => (Number(a.stockQuantity) || 0) - (Number(b.stockQuantity) || 0));

        sorted.forEach(p => {
            const stock = Number(p.stockQuantity) || 0;
            let statusHtml = '<span class="px-2 py-1 bg-green-100 text-green-800 rounded-full text-xs font-semibold tracking-wider">OK</span>';
            
            if (stock <= 0) {
                statusHtml = '<span class="px-2 py-1 bg-red-100 text-red-800 rounded-full text-xs font-semibold tracking-wider">OUT OF STOCK</span>';
            } else if (stock < 10) { // Threshold for low stock
                statusHtml = '<span class="px-2 py-1 bg-yellow-100 text-yellow-800 rounded-full text-xs font-semibold tracking-wider">LOW STOCK</span>';
            }

            const name = String(p.productName || p.name || 'Unknown')
                .replace(/</g, '&lt;').replace(/>/g, '&gt;');
            const barcode = String(p.barcode || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
            const category = String(p.category || 'N/A')
                .replace(/</g, '&lt;').replace(/>/g, '&gt;');

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td class="py-3 border-b text-gray-800">${name}${barcode ? ' <div class="text-xs text-gray-400">Barcode: ' + barcode + '</div>' : ''}</td>
                <td class="py-3 border-b text-gray-500 capitalize">${category}</td>
                <td class="py-3 border-b text-right font-semibold ${stock < 10 ? 'text-red-500' : 'text-gray-800'}">${stock}</td>
                <td class="py-3 border-b text-center">${statusHtml}</td>
            `;
            tbody.appendChild(tr);
        });
    },

    updateCharts: function(dailyStats, paymentStats, branchStats) {
        if (!window.Chart) {
            console.warn("Chart.js not loaded.");
            return;
        }

        // 1. Daily Sales Line Chart
        const dailyCtx = document.getElementById('chart-daily-sales');
        if (dailyCtx) {
            const sortedDates = Object.keys(dailyStats).sort();
            const dailyLabels = sortedDates;
            const dailyData = sortedDates.map(d => dailyStats[d]);

            if (this.charts.daily) this.charts.daily.destroy();
            this.charts.daily = new Chart(dailyCtx, {
                type: 'line',
                data: {
                    labels: dailyLabels,
                    datasets: [{
                        label: 'Revenue ($)',
                        data: dailyData,
                        borderColor: '#e83e8c', // Primary color
                        backgroundColor: 'rgba(232, 62, 140, 0.1)',
                        borderWidth: 2,
                        tension: 0.3,
                        fill: true
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    scales: { y: { beginAtZero: true } }
                }
            });
        }

        // 2. Payment Methods Pie Chart
        const pmCtx = document.getElementById('chart-payment-methods');
        if (pmCtx) {
            if (this.charts.pm) this.charts.pm.destroy();
            this.charts.pm = new Chart(pmCtx, {
                type: 'doughnut',
                data: {
                    labels: ['Cash', 'Card', 'Other'],
                    datasets: [{
                        data: [paymentStats.cash, paymentStats.card, paymentStats.other],
                        backgroundColor: ['#4ade80', '#60a5fa', '#9ca3af'],
                        borderWidth: 0
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false
                }
            });
        }

        // 3. Branch Sales Bar Chart
        const branchCtx = document.getElementById('chart-branch-sales');
        if (branchCtx) {
            const branches = Object.keys(branchStats);
            const revenues = branches.map(b => branchStats[b]);

            if (this.charts.branch) this.charts.branch.destroy();
            this.charts.branch = new Chart(branchCtx, {
                type: 'bar',
                data: {
                    labels: branches.map(b => b === 'branch_01' ? 'Branch 01' : (b === 'branch_02' ? 'Branch 02' : b)),
                    datasets: [{
                        label: 'Revenue',
                        data: revenues,
                        backgroundColor: '#e83e8c'
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: { legend: { display: false } },
                    scales: { y: { beginAtZero: true } }
                }
            });
        }
    },

    exportCSV: function() {
        if (!this.cachedSalesData || this.cachedSalesData.length === 0) {
            alert("No data to export.");
            return;
        }

        // Define headers
        const headers = ['Invoice Number', 'Date', 'Branch', 'Cashier', 'Payment Method', 'Status', 'Total ($)'];
        
        // Map data to rows
        const rows = this.cachedSalesData.map(sale => {
            const date = this.toDate(sale).toLocaleString();
            return [
                String(sale.invoiceNumber || '').replace(/"/g, '""'),
                '"' + date.replace(/"/g, '""') + '"',
                String(sale.branchId || '').replace(/"/g, '""'),
                String(sale.cashierId || '').replace(/"/g, '""'),
                String(sale.paymentMethod || '').replace(/"/g, '""'),
                String(sale.status || 'completed').replace(/"/g, '""'),
                (Number(sale.total) || Number(sale.totalAmount) || 0).toFixed(2)
            ].join(',');
        });

        // Combine
        const csvContent = headers.join(',') + '\n' + rows.join('\n');
        
        // Create download link
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.setAttribute("href", url);
        link.setAttribute("download", `cakepos_sales_export_${new Date().toISOString().split('T')[0]}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }
};

document.addEventListener('DOMContentLoaded', () => {
    window.Reports.init();
});
