// Product Management Module
window.Products = {
    unsubscribe: null,
    cachedData: [],

    init: function() {
        console.log("Products module initialized.");
        
        // Listeners for UI
        document.getElementById('btn-create-product').addEventListener('click', () => this.openFormModal());
        document.getElementById('prod-search').addEventListener('input', () => this.renderTable());
        document.getElementById('btn-save-product').addEventListener('click', () => this.saveProduct());
        document.getElementById('btn-delete-product').addEventListener('click', () => this.deleteProduct());

        // Modal Close handlers (some might be handled by global movements.js, but let's be safe)
        document.querySelectorAll('.modal-close-btn[data-target="modal-product-form"]').forEach(btn => {
            btn.addEventListener('click', () => {
                document.getElementById('modal-product-form').classList.add('hidden');
            });
        });

        // Load data initially or when hash changes
        window.addEventListener('hashchange', () => {
            if (window.location.hash === '#/products') {
                if(this.cachedData.length === 0) this.fetchData();
            }
        });

        // Fetch data immediately so POS has access to it
        this.fetchData();
    },

    fetchData: function() {
        if (this.unsubscribe) {
            this.unsubscribe();
        }

        // Do not attach a listener before authentication: the rules deny
        // unauthenticated reads (correctly), which would log a misleading
        // permission error on every page load. auth.js calls fetchData() again
        // after login with valid credentials.
        const currentUser = window.firebaseAuth && window.firebaseAuth.currentUser;
        if (!currentUser) {
            this.cachedData = [];
            return;
        }

        const db = window.firebaseDb;
        if (!db || !window.firebaseConfig || window.firebaseConfig.apiKey === "YOUR_API_KEY") {
            console.warn("Real Firebase connection required for products.");
            return;
        }
        const query = db.collection('products').orderBy('name');

        if (typeof query.onSnapshot === 'function' && window.firebaseConfig && window.firebaseConfig.apiKey !== "YOUR_API_KEY") {
            this.unsubscribe = query.onSnapshot((snapshot) => {
                this.cachedData = [];
                snapshot.forEach(doc => {
                    this.cachedData.push({ id: doc.id, ...doc.data() });
                });
                
                // If we are on the products tab, render the table
                if(window.location.hash === '#/products') {
                    this.renderTable();
                }

                // If POS is active, tell it to re-render the grid
                if (window.POS && typeof window.POS.renderGrid === 'function') {
                    window.POS.renderGrid();
                }
            }, (error) => {
                console.error("Error listening to products:", error);
            });
        } else {
            console.warn("Mock Mode: Products fetch simulated.");
            // We'll fall back to POS mock data if no Firebase
            setTimeout(() => {
                if (window.POS && window.POS.mockProducts) {
                    this.cachedData = [...window.POS.mockProducts];
                    if(window.location.hash === '#/products') this.renderTable();
                }
            }, 500);
        }
    },

    renderTable: function() {
        const tbody = document.getElementById('products-table-body');
        const searchTerm = document.getElementById('prod-search').value.toLowerCase();
        
        if (!this.cachedData) return;

        const filteredData = this.cachedData.filter(item => {
            const nameMatch = (item.name || '').toLowerCase().includes(searchTerm);
            const barcodeMatch = (item.barcode || '').toLowerCase().includes(searchTerm);
            return nameMatch || barcodeMatch;
        });

        tbody.innerHTML = '';

        if (filteredData.length === 0) {
            tbody.innerHTML = `<tr><td colspan="6" class="p-8 text-center text-gray-500">No products found.</td></tr>`;
            return;
        }

        filteredData.forEach(item => {
            const tr = document.createElement('tr');
            tr.className = 'hover:bg-gray-50 transition';
            const iconStr = String(item.imageIcon || item.icon || 'fa-cube').replace(/[^a-zA-Z0-9-_ ]/g, '');
            const name = String(item.name || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
            const cat = String(item.category || 'Uncategorized').replace(/</g, '&lt;').replace(/>/g, '&gt;');
            const barcode = String(item.barcode || '-').replace(/</g, '&lt;').replace(/>/g, '&gt;');
            const price = Number(item.price);
            const inactive = item.active === false;
            const inactiveRow = inactive ? ' opacity-50' : '';

            tr.innerHTML = `
                <td class="p-4 border-b text-center text-gray-400"><i class="fa-solid ${iconStr} text-xl"></i></td>
                <td class="p-4 border-b text-gray-800 font-medium${inactiveRow}">${name}${inactive ? ' <span class="text-red-500 text-xs">(Inactive)</span>' : ''}</td>
                <td class="p-4 border-b text-gray-500${inactiveRow}">
                    <span class="px-2 py-1 bg-gray-100 rounded text-xs font-semibold uppercase tracking-wider">${cat}</span>
                </td>
                <td class="p-4 border-b text-gray-500 font-mono text-sm${inactiveRow}">${barcode}</td>
                <td class="p-4 border-b text-gray-800 font-bold text-right${inactiveRow}">$${(Number.isFinite(price) ? price.toFixed(2) : '0.00')}</td>
                <td class="p-4 border-b text-right${inactiveRow}">
                    <button class="btn-edit-prod text-primary hover:text-pink-800 p-2" title="Edit Product" data-id="${item.id}">
                        <i class="fa-solid fa-pen-to-square"></i>
                    </button>
                </td>
            `;
            tbody.appendChild(tr);
        });

        // Add event listeners to edit buttons
        document.querySelectorAll('.btn-edit-prod').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const id = e.currentTarget.getAttribute('data-id');
                this.openFormModal(id);
            });
        });
    },

    openFormModal: function(productId = null) {
        if (!window.Permissions.canAccess('manage_products')) {
            alert("You do not have permission to manage products.");
            return;
        }

        const modal = document.getElementById('modal-product-form');
        const title = document.getElementById('prod-modal-title');
        const btnDelete = document.getElementById('btn-delete-product');

        // Reset form
        document.getElementById('prod-form-id').value = '';
        document.getElementById('prod-form-name').value = '';
        document.getElementById('prod-form-barcode').value = '';
        document.getElementById('prod-form-price').value = '';
        document.getElementById('prod-form-category').value = '';
        document.getElementById('prod-form-icon').value = 'fa-cube';

        if (productId) {
            title.textContent = 'Edit Product';
            btnDelete.classList.remove('hidden');
            
            const product = this.cachedData.find(p => p.id === productId);
            if (product) {
                document.getElementById('prod-form-id').value = product.id;
                document.getElementById('prod-form-name').value = product.name;
                document.getElementById('prod-form-barcode').value = product.barcode || '';
                document.getElementById('prod-form-price').value = product.price || '';
                document.getElementById('prod-form-category').value = product.category || '';
                document.getElementById('prod-form-icon').value = product.imageIcon || product.icon || 'fa-cube';
            }
        } else {
            title.textContent = 'Add New Product';
            btnDelete.classList.add('hidden');
        }

        modal.classList.remove('hidden');
    },

    saveProduct: async function() {
        const id = document.getElementById('prod-form-id').value;
        const name = document.getElementById('prod-form-name').value.trim();
        const barcode = document.getElementById('prod-form-barcode').value.trim();
        const price = parseFloat(document.getElementById('prod-form-price').value);
        const category = document.getElementById('prod-form-category').value.trim();
        const imageIcon = document.getElementById('prod-form-icon').value.trim() || 'fa-cube';

        if (!name || !barcode || isNaN(price)) {
            alert("Please fill in all required fields (Name, Barcode, Price).");
            return;
        }
        if (price < 0) {
            alert("Price cannot be negative.");
            return;
        }

        const btn = document.getElementById('btn-save-product');
        btn.disabled = true;
        btn.innerText = 'Saving...';

        try {
            const db = window.firebaseDb;
            if (!db) {
                alert("Database is not available.");
                return;
            }

            // Prevent duplicate barcodes (server-side rules do not yet scan the
            // collection, so add a client-side check for a clear message).
            if (!id) {
                const dup = await db.collection('products')
                    .where('barcode', '==', barcode).limit(1).get();
                if (!dup.empty) {
                    alert("A product with this barcode already exists.");
                    return;
                }
            }

            const productData = {
                name,
                barcode,
                price,
                category,
                imageIcon,
                updatedAt: new Date().toISOString()
            };

            if (id) {
                // Update - do NOT touch `active` so editing never silently
                // reactivates a soft-deleted product.
                await db.collection('products').doc(id).update(productData);
            } else {
                // Create
                productData.active = true;
                productData.createdAt = new Date().toISOString();
                await db.collection('products').add(productData);
            }

            document.getElementById('modal-product-form').classList.add('hidden');
            
        } catch (error) {
            console.error("Error saving product:", error);
            alert("Failed to save product. See console for details.");
        } finally {
            btn.disabled = false;
            btn.innerText = 'Save Product';
        }
    },

    // Soft delete: mark the product inactive so historical sales keep their
    // product references and reports remain accurate. The document is never
    // hard-deleted (Firestore rules forbid deletes).
    deleteProduct: async function() {
        const id = document.getElementById('prod-form-id').value;
        if (!id) return;

        if (!confirm("Mark this product as inactive? It will be hidden from the POS and maintain historical sales references.")) {
            return;
        }

        const btn = document.getElementById('btn-delete-product');
        btn.disabled = true;
        btn.innerText = 'Processing...';

        try {
            const db = window.firebaseDb;
            if (!db) {
                alert("Database is not available.");
                return;
            }
            await db.collection('products').doc(id).update({
                active: false,
                updatedAt: new Date().toISOString()
            });
            document.getElementById('modal-product-form').classList.add('hidden');
            // Clear the modal id so re-opening creates a new product.
            document.getElementById('prod-form-id').value = '';
        } catch (error) {
            console.error("Error deactivating product:", error);
            alert("Failed to deactivate product.");
        } finally {
            btn.disabled = false;
            btn.innerText = 'Mark Inactive';
        }
    }
};

document.addEventListener('DOMContentLoaded', () => {
    window.Products.init();
});
