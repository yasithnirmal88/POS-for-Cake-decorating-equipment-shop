// Checkout & Receipt Generation
// The authoritative sale is created by the `createSale` Cloud Function, which
// re-derives prices/totals server-side and deducts inventory atomically.
// The client only supplies the cart (product ids + quantities) and the
// payment method; it never writes to the sales collection directly.
window.Checkout = {
    inProgress: false,

    initiate: function() {
        if (this.inProgress) return;
        const { total } = window.Cart.getTotals();
        if (window.Cart.items.length === 0) {
            alert("Your cart is empty.");
            return;
        }
        // Open the payment modal; onConfirm runs after the cashier confirms.
        window.Payment.openModal(total, (paymentMethod) => this.processSale(paymentMethod));
    },

    processSale: async function(paymentMethod) {
        if (this.inProgress) return;
        this.inProgress = true;

        // Build a unique idempotency key for this checkout attempt so retries
        // after a network failure cannot create duplicate sales.
        const requestId = this.generateRequestId();

        const branchId = window.AppState.user && window.AppState.user.branchId !== 'all'
            ? window.AppState.user.branchId
            : (window.AppState.activeBranch || 'branch_01');

        // Only send product ids + quantities. Prices are NOT trusted from the
        // client - the Cloud Function reads authoritative prices.
        const items = window.Cart.items.map(item => ({
            productId: item.id,
            quantity: item.quantity
        }));

        try {
            const result = await this.callCreateSale({
                branchId,
                requestId,
                paymentMethod,
                items
            });

            if (!result || !result.ok) {
                throw new Error("Sale could not be confirmed by the server.");
            }

            const sale = result.sale || result;

            // Sale confirmed server-side: print receipt, clear cart, notify.
            this.printReceipt(sale);
            window.Cart.clear();
            window.Payment.closeModal();
            alert("Sale successful! Invoice: " + (sale.invoiceNumber || ''));
            if (window.Reports && typeof window.Reports.refresh === 'function') {
                window.Reports.refresh();
            }
        } catch (err) {
            console.error("Checkout failed:", err);
            // Re-throw so the payment modal can display the error and re-enable.
            throw err;
        } finally {
            this.inProgress = false;
        }
    },

    generateRequestId: function() {
        // UUID v4-like random id (client-side only used as an idempotency key).
        if (window.crypto && typeof window.crypto.randomUUID === 'function') {
            return window.crypto.randomUUID();
        }
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
            const r = Math.random() * 16 | 0;
            const v = c === 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    },

    callCreateSale: async function(payload) {
        // Prefer the callable Cloud Function when available.
        if (window.firebase && window.firebase.functions) {
            try {
                const fn = window.firebase.functions().httpsCallable('createSale');
                const res = await fn(payload);
                return res.data;
            } catch (err) {
                // If the function is not deployed, surface a clear error rather
                // than silently falling back to an insecure client write.
                console.error("createSale callable failed:", err);
                throw new Error(this.friendlyError(err));
            }
        }
        throw new Error("Payment service is not available. Please try again later.");
    },

    friendlyError: function(err) {
        const m = (err && err.message) || '';
        if (m.indexOf('INSUFFICIENT_STOCK') !== -1 || m.indexOf('Insufficient stock') !== -1) {
            return 'Insufficient stock for one or more items.';
        }
        if (m.indexOf('unauthenticated') !== -1 || m.indexOf('permission-denied') !== -1) {
            return 'You are not authorized to complete this sale.';
        }
        if (m.indexOf('failed-precondition') !== -1) {
            return 'A product in your cart is no longer available.';
        }
        return 'Payment could not be processed. Please try again.';
    },

    printReceipt: function(sale) {
        const printContainer = document.getElementById('print-receipt');
        if (!printContainer) return;

        const items = sale.items || [];
        let itemsHtml = '';
        items.forEach(item => {
            const unit = Number(item.price) || 0;
            const qty = Number(item.quantity) || 1;
            itemsHtml += `
                <tr>
                    <td>${this.esc(item.name)} x${qty}</td>
                    <td>$${(unit * qty).toFixed(2)}</td>
                </tr>
            `;
        });

        const branchName = sale.branchId === 'branch_01' ? 'Branch 01 (Main)'
            : (sale.branchId === 'branch_02' ? 'Branch 02' : (sale.branchId || ''));

        printContainer.innerHTML = `
            <div class="print-center">
                <h2>CakePOS</h2>
                <p>${this.esc(branchName)}</p>
                <p>123 Sugar Lane, Sweet City</p>
                <p>Tel: (555) 123-4567</p>
                <p>---------------------------------</p>
            </div>
            <p>Invoice: ${this.esc(sale.invoiceNumber || '')}</p>
            <p>Cashier: ${this.esc(sale.cashierName || '')}</p>
            <p>Date: ${new Date(sale.timestamp || sale.createdMillis || Date.now()).toLocaleString()}</p>
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
                <p>Subtotal: $${(Number(sale.subtotal) || 0).toFixed(2)}</p>
                <p>Tax: $${(Number(sale.tax) || 0).toFixed(2)}</p>
                <h3>Total: $${(Number(sale.total) || 0).toFixed(2)}</h3>
                <p>Payment: ${this.esc(sale.paymentMethod || '')}</p>
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
            if (window.JsBarcode) {
                JsBarcode("#receipt-barcode", sale.invoiceNumber || 'N/A', {
                    format: "CODE128",
                    width: 1.5,
                    height: 40,
                    displayValue: true,
                    fontSize: 12,
                    margin: 0
                });
            }
            window.print();
        } catch (e) {
            console.error("Barcode generation failed", e);
            window.print(); // Print anyway without barcode
        }
    },

    esc: function(str) {
        return String(str == null ? '' : str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }
};
