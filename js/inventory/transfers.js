// Stock Transfers between Branches Logic
// Transfers are executed by the `transferStock` Cloud Function for atomicity
// and server-side branch authorization. This module drives the transfer modal.
window.Transfers = {
    init: function() {
        const modal = document.getElementById('modal-transfer-stock');
        document.querySelectorAll('[data-close-transfer]').forEach(btn => {
            btn.addEventListener('click', () => this.closeModal());
        });
        const confirmBtn = document.getElementById('btn-confirm-transfer');
        if (confirmBtn) confirmBtn.addEventListener('click', () => this.confirmTransfer());
    },

    openTransferModal: function(productId, productName, currentBranchId, currentStock) {
        if (!window.Permissions.canAccess('manage_inventory')) {
            alert("You do not have permission to transfer stock.");
            return;
        }
        // A branch-scoped user can only transfer from their own branch.
        if (window.Permissions.isBranchScoped() &&
            window.AppState.user.branchId !== currentBranchId) {
            alert("You can only transfer stock from your assigned branch.");
            return;
        }

        document.getElementById('tr-product-id').value = productId;
        document.getElementById('tr-product-name').value = productName;
        document.getElementById('tr-from-branch').value = currentBranchId;
        document.getElementById('tr-from-branch-display').value =
            currentBranchId === 'branch_01' ? 'Branch 01' : 'Branch 02';

        // Default destination to the other branch.
        const toSel = document.getElementById('tr-to-branch');
        toSel.value = currentBranchId === 'branch_01' ? 'branch_02' : 'branch_01';

        document.getElementById('tr-quantity').value = 1;
        this.hideError();
        document.getElementById('btn-confirm-transfer').disabled = false;
        document.getElementById('btn-confirm-transfer').innerText = 'Transfer Stock';

        document.getElementById('modal-transfer-stock').classList.remove('hidden');
    },

    closeModal: function() {
        document.getElementById('modal-transfer-stock').classList.add('hidden');
    },

    confirmTransfer: async function() {
        const productId = document.getElementById('tr-product-id').value;
        const fromBranch = document.getElementById('tr-from-branch').value;
        const toBranch = document.getElementById('tr-to-branch').value;
        const qty = parseInt(document.getElementById('tr-quantity').value, 10);

        if (!productId || !fromBranch || !toBranch) {
            this.showError('Missing transfer information.');
            return;
        }
        if (fromBranch === toBranch) {
            this.showError('Source and destination branches must differ.');
            return;
        }
        if (isNaN(qty) || qty <= 0) {
            this.showError('Please enter a valid quantity.');
            return;
        }

        const btn = document.getElementById('btn-confirm-transfer');
        btn.disabled = true;
        btn.innerText = 'Transferring...';

        try {
            if (!window.firebase || !window.firebase.functions) {
                this.showError('Transfer service is not available. Please try again later.');
                btn.disabled = false;
                btn.innerText = 'Transfer Stock';
                return;
            }
            const fn = window.firebase.functions().httpsCallable('transferStock');
            await fn({ productId, fromBranch, toBranch, quantity: qty });
            this.closeModal();
            alert('Stock transferred successfully.');
            if (window.Inventory && typeof window.Inventory.fetchData === 'function') {
                window.Inventory.fetchData();
            }
        } catch (err) {
            console.error('Transfer failed:', err);
            const msg = (err && err.message) || '';
            if (msg.indexOf('Insufficient stock') !== -1) {
                this.showError('Insufficient stock in the source branch.');
            } else if (msg.indexOf('permission-denied') !== -1 || msg.indexOf('Unauthorized') !== -1) {
                this.showError('You are not authorized to perform this transfer.');
            } else {
                this.showError('Transfer failed. Please try again.');
            }
            btn.disabled = false;
            btn.innerText = 'Transfer Stock';
        }
    },

    showError: function(msg) {
        const el = document.getElementById('tr-error');
        el.textContent = msg;
        el.classList.remove('hidden');
    },

    hideError: function() {
        const el = document.getElementById('tr-error');
        el.classList.add('hidden');
        el.textContent = '';
    }
};

document.addEventListener('DOMContentLoaded', () => {
    window.Transfers.init();
});
