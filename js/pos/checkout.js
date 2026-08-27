// Checkout & Receipt Generation
window.Checkout = {
    initiate: function() {
        const { total } = window.Cart.getTotals();
        
        // Mock simple checkout process (In real app, open Payment modal)
        if(confirm(`Process payment for $${total.toFixed(2)}?`)) {
            this.processSale();
        }
    },
    
    processSale: function() {
        // 1. Generate Invoice ID
        const invoiceNumber = 'INV-' + Date.now();
        const branchId = window.AppState.activeBranch;
        const items = [...window.Cart.items];
        const totals = window.Cart.getTotals();
        
        const saleData = {
            invoiceNumber,
            branchId,
            items,
            ...totals,
            timestamp: new Date().toISOString(),
            status: 'completed'
        };
        
        // 2. Save to Firestore
        console.log("Saving sale to DB:", saleData);
        
        const saveToDb = async () => {
            try {
                if (window.firebaseDb && window.firebaseConfig && window.firebaseConfig.apiKey !== "YOUR_API_KEY") {
                    await window.firebaseDb.collection('sales').doc(invoiceNumber).set(saleData);
                    console.log("Sale successfully written to Firestore!");
                } else {
                    console.warn("Mock Mode: Sale not written to cloud.");
                }
            } catch (error) {
                console.error("Error writing sale to Firestore:", error);
            }
        };
        
        saveToDb();
        
        // 3. Generate Receipt
        this.printReceipt(saleData);
        
        // 4. Clear Cart
        window.Cart.clear();
        alert("Sale successful!");
    },
    
    printReceipt: function(sale) {
        const printContainer = document.getElementById('print-receipt');
        
        let itemsHtml = '';
        sale.items.forEach(item => {
            itemsHtml += `
                <tr>
                    <td>${item.name} x${item.quantity}</td>
                    <td>$${(item.price * item.quantity).toFixed(2)}</td>
                </tr>
            `;
        });
        
        printContainer.innerHTML = `
            <div class="print-center">
                <h2>CakePOS - ${sale.branchId}</h2>
                <p>123 Sugar Lane, Sweet City</p>
                <p>Tel: (555) 123-4567</p>
                <p>---------------------------------</p>
            </div>
            <p>Invoice: ${sale.invoiceNumber}</p>
            <p>Date: ${new Date(sale.timestamp).toLocaleString()}</p>
            <table>
                <thead>
                    <tr>
                        <th>Item</th>
                        <th>Total</th>
                    </tr>
                </thead>
                <tbody>
                    ${itemsHtml}
                </tbody>
            </table>
            <div style="text-align: right;">
                <p>Subtotal: $${sale.subtotal.toFixed(2)}</p>
                <p>Tax: $${sale.tax.toFixed(2)}</p>
                <h3>Total: $${sale.total.toFixed(2)}</h3>
            </div>
            <div class="print-center">
                <p>---------------------------------</p>
                <p>Thank you for your purchase!</p>
                <div class="barcode-container">
                    <svg id="receipt-barcode"></svg>
                </div>
            </div>
        `;
        
        // Generate Barcode using JsBarcode
        try {
            JsBarcode("#receipt-barcode", sale.invoiceNumber, {
                format: "CODE128",
                width: 1.5,
                height: 40,
                displayValue: true,
                fontSize: 12,
                margin: 0
            });
            
            // Trigger print dialog
            window.print();
        } catch (e) {
            console.error("Barcode generation failed", e);
            window.print(); // Print anyway without barcode
        }
    }
};
