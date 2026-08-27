// Customers Management Module
// Only minimal contact info (name, phone, email) is stored - no unnecessary
// sensitive personal data. Reads are available to all staff; writes
// (create/update/remove) are restricted to managers/admins by both the UI and
// Firestore Security Rules.
window.Customers = {
    unsubscribe: null,
    cachedData: [],

    init: function() {
        console.log("Customers module initialized.");

        document.getElementById('btn-add-customer').addEventListener('click', () => this.openFormModal());
        document.getElementById('btn-save-customer').addEventListener('click', () => this.saveCustomer());
        document.getElementById('btn-delete-customer').addEventListener('click', () => this.deleteCustomer());
        const search = document.getElementById('customers-search');
        if (search) search.addEventListener('input', () => this.renderTable());

        document.querySelectorAll('.modal-close-btn[data-target="modal-customer-form"]').forEach(btn => {
            btn.addEventListener('click', () => {
                document.getElementById('modal-customer-form').classList.add('hidden');
            });
        });

        window.addEventListener('hashchange', () => {
            if (window.location.hash === '#/customers' && window.AppState.user) {
                this.fetchData();
            }
        });
    },

    fetchData: function() {
        if (this.unsubscribe) this.unsubscribe();

        const db = window.firebaseDb;
        if (!db || !window.firebaseConfig || window.firebaseConfig.apiKey === "YOUR_API_KEY") {
            this.showMessage("Real Firebase connection required.");
            return;
        }
        if (!window.Permissions.canAccess('view_customers')) {
            this.showMessage("Access Denied.");
            return;
        }

        try {
            this.unsubscribe = db.collection('customers').orderBy('name').onSnapshot((snapshot) => {
                this.cachedData = [];
                snapshot.forEach(doc => {
                    this.cachedData.push({ id: doc.id, ...doc.data() });
                });
                if (window.location.hash === '#/customers') this.renderTable();
            }, (error) => {
                console.error("Error listening to customers:", error);
                this.showMessage("Error loading customers.");
            });
        } catch (error) {
            console.error("Error fetching customers:", error);
            this.showMessage("Could not load customers.");
        }
    },

    showMessage: function(msg) {
        const tbody = document.getElementById('customers-table-body');
        if (tbody) tbody.innerHTML = `<tr><td colspan="4" class="p-8 text-center text-gray-500">${this.esc(msg)}</td></tr>`;
    },

    renderTable: function() {
        const tbody = document.getElementById('customers-table-body');
        if (!this.cachedData) return;

        const searchTerm = document.getElementById('customers-search').value.toLowerCase().trim();
        let filtered = this.cachedData;
        if (searchTerm) {
            filtered = filtered.filter(c =>
                String(c.name || '').toLowerCase().includes(searchTerm) ||
                String(c.phone || '').toLowerCase().includes(searchTerm) ||
                String(c.email || '').toLowerCase().includes(searchTerm));
        }

        tbody.innerHTML = '';
        if (filtered.length === 0) {
            this.showMessage("No customers found.");
            return;
        }

        let canManage = window.Permissions.canAccess('manage_customers');
        filtered.forEach(c => {
            const tr = document.createElement('tr');
            const actions = canManage
                ? `<button class="text-primary hover:text-pink-800 p-2 btn-edit-customer" title="Edit Customer" data-id="${this.esc(c.id)}"><i class="fa-solid fa-pen-to-square"></i></button>`
                : '';
            tr.innerHTML = `
                <td class="p-4 border-b text-gray-800 font-medium">${this.esc(c.name)}</td>
                <td class="p-4 border-b text-gray-600">${this.esc(c.phone || '')}</td>
                <td class="p-4 border-b text-gray-600">${this.esc(c.email || '')}</td>
                <td class="p-4 border-b text-right">${actions}</td>
            `;
            tbody.appendChild(tr);
        });

        if (canManage) {
            tbody.querySelectorAll('.btn-edit-customer').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    const id = e.currentTarget.getAttribute('data-id');
                    this.openFormModal(id);
                });
            });
        }
    },

    openFormModal: function(customerId = null) {
        if (!window.Permissions.canAccess('manage_customers')) {
            alert("You do not have permission to manage customers.");
            return;
        }

        const modal = document.getElementById('modal-customer-form');
        const title = document.getElementById('customer-modal-title');
        const btnDelete = document.getElementById('btn-delete-customer');

        document.getElementById('customer-form-id').value = '';
        document.getElementById('customer-form-name').value = '';
        document.getElementById('customer-form-phone').value = '';
        document.getElementById('customer-form-email').value = '';
        document.getElementById('customer-form-notes').value = '';

        if (customerId) {
            title.textContent = 'Edit Customer';
            btnDelete.classList.remove('hidden');
            const c = this.cachedData.find(x => x.id === customerId);
            if (c) {
                document.getElementById('customer-form-id').value = c.id;
                document.getElementById('customer-form-name').value = c.name || '';
                document.getElementById('customer-form-phone').value = c.phone || '';
                document.getElementById('customer-form-email').value = c.email || '';
                document.getElementById('customer-form-notes').value = c.notes || '';
            }
        } else {
            title.textContent = 'Add Customer';
            btnDelete.classList.add('hidden');
        }

        modal.classList.remove('hidden');
    },

    saveCustomer: async function() {
        const id = document.getElementById('customer-form-id').value;
        const name = document.getElementById('customer-form-name').value.trim();
        const phone = document.getElementById('customer-form-phone').value.trim();
        const email = document.getElementById('customer-form-email').value.trim();
        const notes = document.getElementById('customer-form-notes').value.trim();

        if (!name) {
            alert("Customer name is required.");
            return;
        }
        if (phone && !/^[0-9+\-\s()]{5,30}$/.test(phone)) {
            alert("Please enter a valid phone number.");
            return;
        }
        if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            alert("Please enter a valid email address.");
            return;
        }
        if (!window.Permissions.canAccess('manage_customers')) {
            alert("You do not have permission to manage customers.");
            return;
        }

        const btn = document.getElementById('btn-save-customer');
        btn.disabled = true;
        btn.innerText = 'Saving...';

        try {
            const db = window.firebaseDb;
            const updatedAt = new Date().toISOString();
            if (id) {
                await db.collection('customers').doc(id).update({
                    name, phone, email, notes, updatedAt
                });
            } else {
                await db.collection('customers').add({
                    name, phone, email, notes,
                    createdAt: new Date().toISOString(),
                    updatedAt
                });
            }
            document.getElementById('modal-customer-form').classList.add('hidden');
        } catch (error) {
            console.error("Error saving customer:", error);
            alert("Failed to save customer. You may not have permission, or the database is unreachable.");
        } finally {
            btn.disabled = false;
            btn.innerText = 'Save Customer';
        }
    },

    deleteCustomer: async function(remove) {
        const id = document.getElementById('customer-form-id').value;
        if (!id) return;
        if (!confirm("Remove this customer? Their contact details will be permanently deleted.")) return;

        const btn = document.getElementById('btn-delete-customer');
        btn.disabled = true;
        try {
            await window.firebaseDb.collection('customers').doc(id).delete();
            document.getElementById('modal-customer-form').classList.add('hidden');
        } catch (error) {
            console.error("Error deleting customer:", error);
            alert("Failed to delete customer.");
        } finally {
            btn.disabled = false;
        }
    },

    esc: function(str) {
        return String(str == null ? '' : str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }
};
