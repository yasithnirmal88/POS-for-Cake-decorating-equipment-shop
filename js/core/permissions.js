// Role-Based Access Control Module
window.Permissions = {
    // Check if the current user has access to a specific action or view
    canAccess: function(action) {
        if (!window.AppState.user) return false;
        
        const currentRole = window.AppState.user.role.toLowerCase();
        
        // Admin has full access
        if (currentRole === 'admin') return true;

        // Manager has mostly full access, maybe excluding user management in a strict system
        if (currentRole === 'manager') {
            const managerDenied = [
                'manage_users'
            ];
            return !managerDenied.includes(action);
        }
        
        // Cashier permissions
        if (currentRole === 'cashier') {
            const cashierAllowed = [
                'view_pos',
                'create_sale',
                'view_inventory', // Can view but not edit globally
                'view_customers'
            ];
            return cashierAllowed.includes(action);
        }
        
        return false;
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
