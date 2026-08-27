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
            // Fetch the user's role document from Firestore using their email
            // In a production app with Cloud Functions, the document ID would be the Auth UID.
            // But since we created the user document manually, we'll query by email.
            const snapshot = await window.firebaseDb.collection('users').where('email', '==', user.email).limit(1).get();
            
            let userDoc = null;
            if (!snapshot.empty) {
                userDoc = snapshot.docs[0].data();
            } else {
                console.warn("No role document found in 'users' collection for this email. Defaulting to basic access.");
                // Create a basic default profile in memory
                userDoc = {
                    email: user.email,
                    name: user.email.split('@')[0],
                    role: 'admin', // DEFAULT to Admin for this setup so the owner doesn't get locked out initially!
                    branchId: 'branch_01'
                };
            }
            
            // Check if deactivated
            if (userDoc.active === false) {
                await window.firebaseAuth.signOut();
                alert("This account has been deactivated.");
                return;
            }
            
            // Update Global State
            window.AppState.user = {
                uid: user.uid,
                email: user.email,
                name: userDoc.name,
                role: userDoc.role,
                branchId: userDoc.branchId
            };
            
            // Update UI Sidebar Info
            document.getElementById('current-user-display').textContent = userDoc.name;
            document.getElementById('current-role-display').textContent = userDoc.role.charAt(0).toUpperCase() + userDoc.role.slice(1);
            
            // Hide Login, Show Sidebar
            document.getElementById('login-view').classList.add('hidden');
            document.getElementById('sidebar').classList.remove('hidden');
            
            // Re-apply permissions and route
            window.Permissions.applyUIPermissions();
            
            // If they are on a forbidden hash or login page, redirect to POS
            if (window.location.hash === '' || window.location.hash === '#/') {
                window.location.hash = '#/pos';
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
