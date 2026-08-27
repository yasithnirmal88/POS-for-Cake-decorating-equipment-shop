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

        const db = window.firebaseDb;
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
            const iconStr = item.imageIcon || item.icon || 'fa-cube';
            
            tr.innerHTML = `
                <td class="p-4 border-b text-center text-gray-400"><i class="fa-solid ${iconStr} text-xl"></i></td>
                <td class="p-4 border-b text-gray-800 font-medium">${item.name}</td>
                <td class="p-4 border-b text-gray-500">
                    <span class="px-2 py-1 bg-gray-100 rounded text-xs font-semibold uppercase tracking-wider">${item.category || 'Uncategorized'}</span>
                </td>
                <td class="p-4 border-b text-gray-500 font-mono text-sm">${item.barcode || '-'}</td>
                <td class="p-4 border-b text-gray-800 font-bold text-right">$${parseFloat(item.price).toFixed(2)}</td>
                <td class="p-4 border-b text-right">
                    <button class="text-primary hover:text-pink-800 p-2 btn-edit-prod" title="Edit Product" data-id="${item.id}">
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

        const btn = document.getElementById('btn-save-product');
        btn.disabled = true;
        btn.innerText = 'Saving...';

        try {
            const db = window.firebaseDb;
            
            const productData = {
                name,
                barcode,
                price,
                category,
                imageIcon,
                updatedAt: new Date().toISOString()
            };

            if (id) {
                // Update
                await db.collection('products').doc(id).update(productData);
            } else {
                // Create
                productData.createdAt = new Date().toISOString();
                
                // Optional: Check if barcode exists first to prevent duplicates
                // Let's just create for now to keep it simple
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

    deleteProduct: async function() {
        const id = document.getElementById('prod-form-id').value;
        if (!id) return;

        if (!confirm("Are you sure you want to delete this product? This action cannot be undone and may affect historical sales reports if not handled properly.")) {
            return;
        }

        const btn = document.getElementById('btn-delete-product');
        btn.disabled = true;
        btn.innerText = 'Deleting...';

        try {
            const db = window.firebaseDb;
            await db.collection('products').doc(id).delete();
            document.getElementById('modal-product-form').classList.add('hidden');
        } catch (error) {
            console.error("Error deleting product:", error);
            alert("Failed to delete product.");
        } finally {
            btn.disabled = false;
            btn.innerText = 'Delete Product';
        }
    }
};

document.addEventListener('DOMContentLoaded', () => {
    window.Products.init();
});
