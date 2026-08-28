// Staff / Users Management Module
window.Users = {
    unsubscribe: null,
    cachedData: [],

    init: function() {
        console.log("Users module initialized.");
        
        document.getElementById('btn-create-user').addEventListener('click', () => this.openFormModal());
        document.getElementById('btn-save-user').addEventListener('click', () => this.saveUser());
        document.getElementById('btn-delete-user').addEventListener('click', () => this.deactivateUser());

        document.querySelectorAll('.modal-close-btn[data-target="modal-user-form"]').forEach(btn => {
            btn.addEventListener('click', () => {
                document.getElementById('modal-user-form').classList.add('hidden');
            });
        });

        window.addEventListener('hashchange', () => {
            if (window.location.hash === '#/users') {
                if(this.cachedData.length === 0) this.fetchData();
            }
        });

        if (window.location.hash === '#/users') {
            this.fetchData();
        }
    },

    fetchData: function() {
        if (this.unsubscribe) {
            this.unsubscribe();
        }

        // Do not query before authentication: rules deny unauthenticated reads
        // which would log a misleading permission error.
        if (!window.firebaseAuth || !window.firebaseAuth.currentUser) {
            return;
        }

        const db = window.firebaseDb;
        if (!db || !window.firebaseConfig || window.firebaseConfig.apiKey === "YOUR_API_KEY") {
            console.warn("Mock Mode: Cannot fetch real users.");
            document.getElementById('users-table-body').innerHTML = `<tr><td colspan="5" class="p-8 text-center text-gray-500">Real Firebase connection required for User Management.</td></tr>`;
            return;
        }

        // We only fetch users if the current user has permissions
        if (!window.Permissions.canAccess('manage_users')) {
            document.getElementById('users-table-body').innerHTML = `<tr><td colspan="5" class="p-8 text-center text-red-500">Access Denied.</td></tr>`;
            return;
        }

        const query = db.collection('users').orderBy('name');

        this.unsubscribe = query.onSnapshot((snapshot) => {
            this.cachedData = [];
            snapshot.forEach(doc => {
                this.cachedData.push({ id: doc.id, ...doc.data() });
            });
            
            if(window.location.hash === '#/users') {
                this.renderTable();
            }
        }, (error) => {
            console.error("Error listening to users:", error);
            document.getElementById('users-table-body').innerHTML = `<tr><td colspan="5" class="p-8 text-center text-red-500">Error loading users. Ensure you have Firestore security rules configured correctly.</td></tr>`;
        });
    },

    renderTable: function() {
        const tbody = document.getElementById('users-table-body');
        
        if (!this.cachedData) return;

        tbody.innerHTML = '';

        if (this.cachedData.length === 0) {
            tbody.innerHTML = `<tr><td colspan="5" class="p-8 text-center text-gray-500">No staff members found.</td></tr>`;
            return;
        }

        this.cachedData.forEach(user => {
            const tr = document.createElement('tr');
            tr.className = 'hover:bg-gray-50 transition';
            
            const roleColor = user.role === 'admin' ? 'bg-red-100 text-red-700' : 
                              (user.role === 'manager' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-700');
            
            const branchDisplay = user.branchId === 'all' ? 'All Branches' : (user.branchId === 'branch_01' ? 'Branch 01' : 'Branch 02');
            
            const statusStyle = user.active === false ? 'opacity-50' : '';
            const esc = (v) => String(v == null ? '' : v).replace(/</g, '&lt;').replace(/>/g, '&gt;');
            const email = esc(user.email);
            const name = esc(user.name);
            const role = esc(user.role);
            const branchDisplayEsc = esc(branchDisplay);

            tr.innerHTML = `
                <td class="p-4 border-b text-gray-800 font-medium ${statusStyle}">${email} ${user.active === false ? '(Inactive)' : ''}</td>
                <td class="p-4 border-b text-gray-800 ${statusStyle}">${name}</td>
                <td class="p-4 border-b">
                    <span class="px-2 py-1 rounded text-xs font-semibold uppercase tracking-wider ${roleColor}">${role}</span>
                </td>
                <td class="p-4 border-b text-gray-500 ${statusStyle}">${branchDisplayEsc}</td>
                <td class="p-4 border-b text-right">
                    <button class="text-primary hover:text-pink-800 p-2 btn-edit-user" title="Edit Staff" data-id="${user.id}">
                        <i class="fa-solid fa-pen-to-square"></i>
                    </button>
                </td>
            `;
            tbody.appendChild(tr);
        });

        document.querySelectorAll('.btn-edit-user').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const id = e.currentTarget.getAttribute('data-id');
                this.openFormModal(id);
            });
        });
    },

    openFormModal: function(userId = null) {
        if (!window.Permissions.canAccess('manage_users')) {
            alert("You do not have permission to manage staff.");
            return;
        }

        const modal = document.getElementById('modal-user-form');
        const title = document.getElementById('user-modal-title');
        const btnDelete = document.getElementById('btn-delete-user');
        const passBlock = document.getElementById('user-form-password-block');

        // Reset form
        document.getElementById('user-form-id').value = '';
        document.getElementById('user-form-email').value = '';
        document.getElementById('user-form-email').disabled = false;
        document.getElementById('user-form-name').value = '';
        document.getElementById('user-form-role').value = 'cashier';
        document.getElementById('user-form-branch').value = 'branch_01';
        document.getElementById('user-form-password').value = '';

        if (userId) {
            title.textContent = 'Edit Staff Member';
            btnDelete.classList.remove('hidden');
            passBlock.classList.add('hidden'); // We won't handle password resets directly in this simple UI yet
            
            const user = this.cachedData.find(u => u.id === userId);
            if (user) {
                document.getElementById('user-form-id').value = user.id;
                document.getElementById('user-form-email').value = user.email;
                document.getElementById('user-form-email').disabled = true; // Prevent changing email
                document.getElementById('user-form-name').value = user.name;
                document.getElementById('user-form-role').value = user.role;
                document.getElementById('user-form-branch').value = user.branchId;
                
                if (user.active === false) {
                     btnDelete.innerText = 'Reactivate';
                } else {
                     btnDelete.innerText = 'Deactivate';
                }
            }
        } else {
            title.textContent = 'Add Staff Member';
            btnDelete.classList.add('hidden');
            passBlock.classList.remove('hidden'); // Show password field for new user
        }

        modal.classList.remove('hidden');
    },

    saveUser: async function() {
        const id = document.getElementById('user-form-id').value;
        const email = document.getElementById('user-form-email').value.trim();
        const name = document.getElementById('user-form-name').value.trim();
        const role = document.getElementById('user-form-role').value;
        const branchId = document.getElementById('user-form-branch').value;
        const password = document.getElementById('user-form-password').value;

        if (!email || !name) {
            alert("Please fill in Email and Name.");
            return;
        }

        const btn = document.getElementById('btn-save-user');
        btn.disabled = true;
        btn.innerText = 'Saving...';

        try {
            const db = window.firebaseDb;
            
            if (id) {
                // UPDATE existing user (Firestore document only)
                await db.collection('users').doc(id).update({
                    name,
                    role,
                    branchId,
                    updatedAt: new Date().toISOString()
                });
                document.getElementById('modal-user-form').classList.add('hidden');
            } else {
                // CREATE new user
                if (!password || password.length < 6) {
                    alert("Please provide a password (min 6 characters) for the new user.");
                    btn.disabled = false;
                    btn.innerText = 'Save User';
                    return;
                }
                
                // Note: In a production Firebase app, creating other users securely usually requires a Firebase Cloud Function (Admin SDK).
                // Doing it from the client SDK (createUserWithEmailAndPassword) will LOG OUT the current admin user and log in as the new user.
                // To avoid logging out the admin, we will simulate the creation process by just writing to Firestore.
                // The actual Firebase Auth creation requires a backend or a secondary app instance.
                // FOR THIS MVP: We will alert the user about this architectural limitation of client-side Firebase.
                
                alert("Note: Due to Firebase client SDK limitations, to truly create an Auth account without logging yourself out, you should create the user in the Firebase Console's Authentication tab first with this email. We will now create their Role profile in the database.");
                
                // We'll use the email as a document ID for simplicity since we don't have the real Auth UID (which we'd get if we created them via Auth).
                // Alternatively, let Firestore auto-generate an ID, and when the user logs in for the first time, a Cloud Function syncs it.
                // For MVP, we will write to the DB.
                await db.collection('users').add({
                    email,
                    name,
                    role,
                    branchId,
                    active: true,
                    createdAt: new Date().toISOString()
                });
                
                document.getElementById('modal-user-form').classList.add('hidden');
            }
            
        } catch (error) {
            console.error("Error saving user:", error);
            alert(`Failed to save user: ${error.message}`);
        } finally {
            btn.disabled = false;
            btn.innerText = 'Save User';
        }
    },

    deactivateUser: async function() {
        const id = document.getElementById('user-form-id').value;
        if (!id) return;

        const btn = document.getElementById('btn-delete-user');
        const isDeactivating = btn.innerText === 'Deactivate';
        
        if (!confirm(`Are you sure you want to ${isDeactivating ? 'deactivate' : 'reactivate'} this staff member?`)) {
            return;
        }

        btn.disabled = true;
        btn.innerText = 'Processing...';

        try {
            const db = window.firebaseDb;
            await db.collection('users').doc(id).update({
                active: !isDeactivating
            });
            document.getElementById('modal-user-form').classList.add('hidden');
        } catch (error) {
            console.error("Error toggling user status:", error);
            alert("Failed to update user status.");
        } finally {
            btn.disabled = false;
        }
    }
};

document.addEventListener('DOMContentLoaded', () => {
    window.Users.init();
});
