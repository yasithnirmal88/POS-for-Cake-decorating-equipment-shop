// Payment Processing Logic
// Supports Cash, Card, and Other approved methods. No third-party payment
// provider is integrated - "card" / "other" represent point-of-sale
// terminals keyed manually by the cashier. The authoritative sale record is
// created by the `createSale` Cloud Function, which is invoked after the
// cashier confirms the payment.
window.Payment = {
    amountDue: 0,
    onConfirm: null, // async callback once payment is confirmed

    init: function() {
        const modal = document.getElementById('modal-payment');
        // Close button
        const closeBtn = document.getElementById('payment-modal-close');
        if (closeBtn) closeBtn.addEventListener('click', () => this.closeModal());
        document.querySelectorAll('[data-close-payment]').forEach(btn => {
            btn.addEventListener('click', () => this.closeModal());
        });
        modal.querySelectorAll('.modal-close-btn').forEach(btn => {
            btn.addEventListener('click', () => this.closeModal());
        });

        // Method change - show/hide cash input
        const methodSel = document.getElementById('pay-method');
        methodSel.addEventListener('change', () => this.onMethodChange());

        // Cash received - compute change live
        const cashInput = document.getElementById('pay-cash-received');
        cashInput.addEventListener('input', () => this.updateChange());

        // Confirm
        document.getElementById('btn-confirm-payment')
            .addEventListener('click', () => this.confirm());
    },

    openModal: function(total, onConfirm) {
        this.amountDue = total;
        this.onConfirm = onConfirm || null;

        document.getElementById('pay-amount-due').textContent = '$' + total.toFixed(2);
        document.getElementById('pay-cash-received').value = '';
        document.getElementById('pay-change-due').textContent = '$0.00';
        this.hideError();
        document.getElementById('pay-method').value = 'cash';
        this.onMethodChange();
        document.getElementById('btn-confirm-payment').disabled = false;
        document.getElementById('btn-confirm-payment').innerText = 'Confirm Payment';

        const modal = document.getElementById('modal-payment');
        modal.classList.remove('hidden');
        // Focus the cash received input for quick cash tendering
        const cashInput = document.getElementById('pay-cash-received');
        cashInput.focus();
    },

    closeModal: function() {
        document.getElementById('modal-payment').classList.add('hidden');
    },

    onMethodChange: function() {
        const method = document.getElementById('pay-method').value;
        const cashBlock = document.getElementById('pay-cash-block');
        const changeBlock = document.getElementById('pay-change-block');
        if (method === 'cash') {
            cashBlock.classList.remove('hidden');
            changeBlock.classList.remove('hidden');
        } else {
            cashBlock.classList.add('hidden');
            changeBlock.classList.add('hidden');
        }
        this.hideError();
    },

    getMethod: function() {
        return document.getElementById('pay-method').value;
    },

    updateChange: function() {
        const method = this.getMethod();
        if (method !== 'cash') return;
        const received = parseFloat(document.getElementById('pay-cash-received').value);
        const change = (Number.isFinite(received) ? received : 0) - this.amountDue;
        document.getElementById('pay-change-due').textContent =
            '$' + Math.max(change, 0).toFixed(2);
        return change;
    },

    /**
     * Validate the tender and invoke the onConfirm callback.
     * No success is reported here - checkout.js is responsible for awaiting
     * the Cloud Function and only showing 'Sale successful' once confirmed.
     */
    confirm: async function() {
        const method = this.getMethod();
        const btn = document.getElementById('btn-confirm-payment');

        if (method === 'cash') {
            const received = parseFloat(document.getElementById('pay-cash-received').value);
            if (!Number.isFinite(received) || received < 0) {
                this.showError('Please enter a valid cash amount.');
                return;
            }
            if (received < this.amountDue) {
                this.showError('Cash received is less than the total due.');
                return;
            }
        }

        // Prevent double clicks while the sale is being processed.
        btn.disabled = true;
        btn.innerText = 'Processing...';

        try {
            if (typeof this.onConfirm === 'function') {
                await this.onConfirm(method);
            }
        } catch (err) {
            console.error('Payment confirm error:', err);
            this.showError(err.message || 'Payment could not be processed. Please try again.');
            btn.disabled = false;
            btn.innerText = 'Confirm Payment';
        }
    },

    showError: function(msg) {
        const el = document.getElementById('pay-error');
        el.textContent = msg;
        el.classList.remove('hidden');
    },

    hideError: function() {
        const el = document.getElementById('pay-error');
        el.classList.add('hidden');
        el.textContent = '';
    }
};

document.addEventListener('DOMContentLoaded', () => {
    window.Payment.init();
});
