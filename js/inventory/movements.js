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
            const user = window.AppState.user ? window.AppState.user.email : 'unknown';
            
            // Document ID format: branch_01_p123
            const inventoryDocId = `${branchId}_${productId}`;
            const inventoryRef = db.collection('inventory').doc(inventoryDocId);
            const movementRef = db.collection('stock_movements').doc();

            // We use a batch write to ensure both the inventory is updated and the audit log is created atomically.
            // Note: In real Firebase SDK, we'd use db.batch(). Our mock doesn't fully support batch, 
            // but we will write it as close to the real SDK as possible.
            
            // For the mock/real fallback, we'll use individual promises if batch isn't fully mocked
            const qtyChange = type === 'addition' ? quantity : -quantity;
            
            // Since we might not have a real batch in the mock, let's just do individual writes for now
            // In production with Firebase, you'd do:
            // const batch = db.batch();
            // batch.set(inventoryRef, { stockQuantity: firebase.firestore.FieldValue.increment(qtyChange) }, { merge: true });
            // batch.set(movementRef, { ... });
            // await batch.commit();

            // Get current doc to update it (Simulating the increment without FieldValue for mock compatibility)
            const doc = await inventoryRef.get();
            let newStock = qtyChange;
            if (doc.exists) {
                newStock = (doc.data().stockQuantity || 0) + qtyChange;
            }

            await inventoryRef.set({
                branchId,
                productId,
                stockQuantity: newStock,
                lastUpdated: new Date().toISOString()
            }, { merge: true });

            await movementRef.set({
                productId,
                branchId,
                type,
                quantity,
                reason,
                user,
                timestamp: new Date().toISOString()
            });

            document.getElementById('modal-adjust-stock').classList.add('hidden');
            
            // If using the mock DB, manually trigger a refresh of the table
            if (window.firebaseConfig && window.firebaseConfig.apiKey === "YOUR_API_KEY") {
                 window.Inventory.fetchData(); // Mock manual refresh
            }
            
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
