// Role-Based Access Control Module
window.Permissions = {
    // Check if the current user has access to a specific action or view.
    // NOTE: These are UI/usability controls only. The authoritative enforcement
    // lives in Firestore Security Rules and Cloud Functions.
    canAccess: function(action) {
        if (!window.AppState.user) return false;
        
        const currentRole = window.AppState.user.role.toLowerCase();
        
        // Admin has full access
        if (currentRole === 'admin') return true;

        // Manager: full access except user management and settings changes.
        if (currentRole === 'manager') {
            const managerDenied = [
                'manage_users',
                'manage_settings'
            ];
            return !managerDenied.includes(action);
        }
        
        // Cashier: only POS and read-only views for their branch.
        if (currentRole === 'cashier') {
            const cashierAllowed = [
                'view_pos',
                'create_sale',
                'view_inventory',
                'view_products',
                'manage_cart',
                'view_customers',
                'view_sales'
            ];
            return cashierAllowed.includes(action);
        }
        
        return false;
    },
    
    // Whether the current user is branch-scoped (single branch) or global (all).
    isBranchScoped: function() {
        if (!window.AppState.user) return false;
        const b = window.AppState.user.branchId;
        return b === 'branch_01' || b === 'branch_02';
    },
    
    // Utility to hide/show UI elements based on permission
    applyUIPermissions: function() {
        document.querySelectorAll('[data-permission]').forEach(el => {
            const requiredAction = el.getAttribute('data-permission');
            if (!this.canAccess(requiredAction)) {
                el.style.display = 'none';
            } else {
                // Determine display type based on element
                if (el.tagName.toLowerCase() === 'a' && el.classList.contains('block')) {
                    el.style.display = 'block';
                } else {
                    el.style.display = '';
                }
            }
        });
    }
};
