// Global State Management
window.AppState = {
    user: null,
    role: null, // 'Admin' or 'Cashier'
    activeBranch: 'branch_01', // Default branch
    cart: [],
    
    setUser: function(user, role) {
        this.user = user;
        this.role = role;
        
        // Update UI
        if (user) {
            document.getElementById('current-user-display').textContent = user.email || 'User';
            document.getElementById('current-role-display').textContent = role || 'Staff';
        }
    },
    
    setBranch: function(branchId) {
        this.activeBranch = branchId;
        const branchSelect = document.getElementById('branch-selector');
        if (branchSelect) branchSelect.value = branchId;
        
        // Update UI
        const branchNames = { 'branch_01': 'Branch 01 (Main)', 'branch_02': 'Branch 02' };
        const branchDisplay = document.getElementById('current-branch-display');
        if (branchDisplay) branchDisplay.textContent = branchNames[branchId] || branchId;
    }
};
