const functions = require("firebase-functions");
const admin = require("firebase-admin");

admin.initializeApp();

// Example Cloud Function: Deduct inventory when a sale is finalized
exports.onSaleCompleted = functions.firestore
    .document('sales/{saleId}')
    .onCreate(async (snap, context) => {
        const sale = snap.data();
        const branchId = sale.branchId;
        const items = sale.items;

        const batch = admin.firestore().batch();
        
        // Decrement stock logic here
        // for (const item of items) {
        //     const inventoryRef = admin.firestore().collection('inventory').doc(`${branchId}_${item.id}`);
        //     batch.update(inventoryRef, { stockQuantity: admin.firestore.FieldValue.increment(-item.quantity) });
        // }
        
        console.log(`Processing inventory deduction for sale ${context.params.saleId}`);
        // await batch.commit();
        return null;
    });

// Scheduled Backup Function (Runs daily)
exports.scheduledBackup = functions.pubsub.schedule('every 24 hours').onRun((context) => {
    console.log('Running daily backup process...');
    // Backup logic to dump Firestore collections to Cloud Storage
    return null;
});
