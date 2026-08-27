// Authentication Module (Firebase)
window.Auth = {
    init: function() {
        console.log("Auth module initializing...");
        
        // Setup Login Form Listener
        const loginForm = document.getElementById('login-form');
        if (loginForm) {
            loginForm.addEventListener('submit', (e) => this.handleLogin(e));
        }

        // Setup Logout Button Listener
        const logoutBtn = document.getElementById('logout-btn');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', () => this.handleLogout());
        }

        // Listen for Firebase Auth State Changes
        if (window.firebaseAuth) {
            window.firebaseAuth.onAuthStateChanged((user) => {
                if (user) {
                    this.fetchUserRoleAndLogin(user);
                } else {
                    this.showLoginScreen();
                }
            });
        } else {
            console.warn("firebaseAuth not found. Ensure firebase-config.js is loaded.");
            this.showLoginScreen();
        }
    },

    handleLogin: async function(e) {
        e.preventDefault();
        
        const email = document.getElementById('login-email').value;
        const password = document.getElementById('login-password').value;
        const errorEl = document.getElementById('login-error');
        const submitBtn = e.target.querySelector('button[type="submit"]');
        
        errorEl.classList.add('hidden');
        submitBtn.disabled = true;
        submitBtn.innerText = "Logging in...";

        try {
            if (window.firebaseConfig && window.firebaseConfig.apiKey !== "YOUR_API_KEY") {
                await window.firebaseAuth.signInWithEmailAndPassword(email, password);
                // onAuthStateChanged will handle the rest
            } else {
                errorEl.textContent = "Firebase API keys are missing.";
                errorEl.classList.remove('hidden');
                submitBtn.disabled = false;
                submitBtn.innerText = "Log In";
            }
        } catch (error) {
            console.error("Login Error:", error);
            errorEl.textContent = error.message;
            errorEl.classList.remove('hidden');
            submitBtn.disabled = false;
            submitBtn.innerText = "Log In";
        }
    },

    fetchUserRoleAndLogin: async function(user) {
        try {
            const db = window.firebaseDb;
            if (!db) {
                console.error("Firestore unavailable. Cannot authorize user.");
                alert("Database is unavailable. Please try again.");
                this.handleLogout();
                return;
            }

            // SECURITY: Look up the user's profile by their Auth UID, which is the
            // only identifier that cannot be spoofed by the client. Legacy records
            // that were keyed by email are supported as a fallback, but the UID
            // path is authoritative.
            let userDoc = null;
            let userDocId = null;
            try {
                const docRef = await db.collection('users').doc(user.uid).get();
                if (docRef.exists) {
                    userDoc = docRef.data();
                    userDocId = user.uid;
                }
            } catch (e) {
                console.warn("UID document lookup failed, falling back to email query:", e.message);
            }

            if (!userDoc) {
                // Legacy fallback: some deployments created user docs keyed by email.
                const snap = await db.collection('users')
                    .where('email', '==', user.email)
                    .limit(1)
                    .get();
                if (!snap.empty) {
                    userDoc = snap.docs[0].data();
                    userDocId = snap.docs[0].id;
                }
            }

            // SECURITY: Never grant admin (or any role) to a user who has no
            // profile document. A missing profile means the user is not yet an
            // authorized member of the organization - deny access instead of
            // defaulting them to a privileged role.
            if (!userDoc) {
                console.warn("No user profile found for:", user.email);
                alert("Your account has not been set up yet. Please contact an administrator.");
                await this.handleLogout();
                return;
            }

            // Check if the account has been deactivated.
            if (userDoc.active === false) {
                await window.firebaseAuth.signOut();
                alert("This account has been deactivated.");
                return;
            }

            const role = String(userDoc.role || '').toLowerCase();
            if (!['admin', 'manager', 'cashier'].includes(role)) {
                console.warn("User has an invalid/unknown role:", userDoc.role);
                alert("Your account has an invalid role configuration. Please contact an administrator.");
                await this.handleLogout();
                return;
            }

            // Normalize branch assignment: 'all' or a known branch id. Validate so
            // a malformed document cannot grant cross-branch access accidentally.
            let branchId = userDoc.branchId || 'all';
            if (!['all', 'branch_01', 'branch_02'].includes(branchId)) {
                branchId = userDocId === user.uid ? 'all' : branchId;
            }

            // Update Global State
            window.AppState.user = {
                uid: user.uid,
                userDocId,
                email: user.email,
                name: userDoc.name || user.email.split('@')[0],
                role,
                branchId,
                active: true
            };

            // Update UI Sidebar Info
            document.getElementById('current-user-display').textContent = window.AppState.user.name;
            document.getElementById('current-role-display').textContent = role.charAt(0).toUpperCase() + role.slice(1);
            document.getElementById('current-branch-display').textContent =
                branchId === 'all' ? 'All Branches' : (branchId === 'branch_01' ? 'Branch 01 (Main)' : 'Branch 02');

            // Hide Login, Show Sidebar
            document.getElementById('login-view').classList.add('hidden');
            document.getElementById('sidebar').classList.remove('hidden');

            // Re-apply permissions and route
            window.Permissions.applyUIPermissions();

            // Reload data listeners now that the user is authenticated. Modules
            // such as Reports and Inventory may have created their listeners on
            // DOMContentLoaded before authentication; those listeners used an
            // unauthenticated (and thus wrong branch-scope) query and must be
            // re-created with the correct branch scope and credentials. This is a
            // primary fix for the "dashboard shows no content after login" bug.
            try {
                if (window.Reports && typeof window.Reports.refreshSafely === 'function') {
                    window.Reports.refreshSafely();
                } else if (window.Reports && typeof window.Reports.refresh === 'function') {
                    window.Reports.refresh();
                }
                if (window.Inventory && typeof window.Inventory.fetchData === 'function') {
                    window.Inventory.fetchData();
                }
                if (window.Products && typeof window.Products.fetchData === 'function') {
                    window.Products.fetchData();
                }
            } catch (err) {
                console.error("Error reloading data after login:", err);
            }

            // After login, land the user on the sales dashboard for roles that can
            // see it, otherwise send cashiers to the POS.
            const landing = role !== 'cashier' && window.Permissions.canAccess('view_reports')
                ? '#/reports' : '#/pos';
            if (window.location.hash === '' || window.location.hash === '#/') {
                window.location.hash = landing;
            } else {
                window.Router.handleRoute(); // re-evaluate current route
            }

        } catch (error) {
            console.error("Error fetching user role:", error);
            alert("Error fetching user role. Please try again.");
            this.handleLogout();
        }
    },

    handleLogout: async function() {
        if (window.firebaseAuth) {
            try {
                await window.firebaseAuth.signOut();
            } catch (err) {
                console.error("Error signing out:", err);
            }
        }
    },
    
    showLoginScreen: function() {
        window.AppState.user = null;
        document.getElementById('login-view').classList.remove('hidden');
        document.getElementById('sidebar').classList.add('hidden');
        
        // Hide all views
        document.querySelectorAll('.view-section').forEach(view => {
            view.classList.add('hidden');
        });
        
        // Reset Login Button
        const submitBtn = document.querySelector('#login-form button[type="submit"]');
        if(submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerText = "Log In";
        }
    }
};

document.addEventListener('DOMContentLoaded', () => {
    window.Auth.init();
});
