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
            const db = window.firebaseDb;
            if (!db || !window.firebaseConfig || window.firebaseConfig.apiKey === "YOUR_API_KEY") {
                alert("Real Firebase connection required for stock adjustments.");
                return;
            }
            const user = window.AppState.user ? (window.AppState.user.name || window.AppState.user.email) : 'unknown';
            
            // Document ID format: branchId_productId
            const inventoryDocId = `${branchId}_${productId}`;
            const inventoryRef = db.collection('inventory').doc(inventoryDocId);
            const movementRef = db.collection('stock_movements').doc();

            const qtyChange = type === 'addition' ? quantity : -quantity;

            // Use FieldValue.increment for an atomic, concurrency-safe update.
            // This avoids the lost-update hazard of read-modify-write.
            const _increment = window.firebase.firestore.FieldValue.increment;
            await inventoryRef.set({
                branchId,
                productId,
                stockQuantity: _increment(qtyChange),
                lastUpdated: new Date().toISOString()
            }, { merge: true });

            await movementRef.set({
                productId,
                branchId,
                type,
                quantity,
                reason,
                user,
                byUid: window.AppState.user ? window.AppState.user.uid : null,
                timestamp: new Date().toISOString()
            });

            document.getElementById('modal-adjust-stock').classList.add('hidden');
            window.Inventory.fetchData(); // refresh the table
        } catch (error) {
            console.error("Error adjusting stock:", error);
            alert("Failed to adjust stock. See console for details.");
        } finally {
            btn.disabled = false;
            btn.innerText = 'Save Adjustment';
        }
    }
};

document.addEventListener('DOMContentLoaded', () => {
    window.Movements.init();
});
