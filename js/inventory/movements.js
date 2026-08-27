// Stock Movements & Adjustments Logic
window.Movements = {
    init: function() {
        // Modal Event Listeners
        const modal = document.getElementById('modal-adjust-stock');
        const closeBtns = document.querySelectorAll('.modal-close-btn');
        const saveBtn = document.getElementById('btn-save-adjustment');

        closeBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                modal.classList.add('hidden');
            });
        });

        if (saveBtn) {
            saveBtn.addEventListener('click', this.saveAdjustment.bind(this));
        }
    },

    openAdjustmentModal: function(productId, productName, branchId, currentStock) {
        // Check permissions before opening
        if (!window.Permissions.canAccess('manage_inventory')) {
            alert("You do not have permission to manually adjust stock.");
            return;
        }

        document.getElementById('adj-product-id').value = productId;
        document.getElementById('adj-product-name').value = productName;
        document.getElementById('adj-branch-id').value = branchId;
        document.getElementById('adj-current-stock').value = currentStock;
        
        document.getElementById('adj-quantity').value = 1;
        document.getElementById('adj-reason').value = '';

        document.getElementById('modal-adjust-stock').classList.remove('hidden');
    },

    saveAdjustment: async function() {
        const productId = document.getElementById('adj-product-id').value;
        const branchId = document.getElementById('adj-branch-id').value;
        const type = document.getElementById('adj-type').value; // 'addition' or 'deduction'
        const quantity = parseInt(document.getElementById('adj-quantity').value, 10);
        const reason = document.getElementById('adj-reason').value.trim();

        if (isNaN(quantity) || quantity <= 0) {
            alert("Please enter a valid quantity.");
            return;
        }
        if (!reason) {
            alert("Please provide a reason for the adjustment.");
            return;
        }

        const btn = document.getElementById('btn-save-adjustment');
        btn.disabled = true;
        btn.innerText = 'Saving...';

        try {
            // Stock is adjusted authoritatively and atomically by the
            // `adjustStock` Cloud Function. The caller's identity and branch
            // are derived server-side from context.auth; the client never
            // writes to the inventory or stock_movements collections directly.
            if (!window.firebase || !window.firebase.functions) {
                alert('Stock adjustment service is not available. Please try again later.');
                return;
            }
            const fn = window.firebase.functions().httpsCallable('adjustStock');
            await fn({
                productId,
                branchId,
                type,
                quantity,
                reason
            });

            document.getElementById('modal-adjust-stock').classList.add('hidden');
            window.Inventory.fetchData(); // refresh the table
        } catch (error) {
            console.error("Error adjusting stock:", error);
            const msg = (error && error.message) || '';
            if (msg.indexOf('permission-denied') !== -1 || msg.indexOf('Unauthorized') !== -1 ||
                msg.indexOf('Not authorized') !== -1) {
                alert('You are not authorized to adjust stock for this branch.');
            } else if (msg.indexOf('below zero') !== -1) {
                alert('Cannot deduct below zero stock.');
            } else {
                alert('Failed to adjust stock. Please try again.');
            }
        } finally {
            btn.disabled = false;
            btn.innerText = 'Save Adjustment';
        }
    }
};

document.addEventListener('DOMContentLoaded', () => {
    window.Movements.init();
});
