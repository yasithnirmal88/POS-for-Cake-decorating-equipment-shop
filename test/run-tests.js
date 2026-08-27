// CakePOS smoke tests (jsdom + mocked Firebase). Run: node run-tests.js
const { freshWindow, evalModule } = require('./harness');

let passed = 0, failed = 0;
function check(name, cond, extra) {
  if (cond) { passed++; console.log('  PASS ' + name); }
  else { failed++; console.log('  FAIL ' + name + (extra ? ' :: ' + extra : '')); }
}

console.log('# Cart totals');
{
  const win = freshWindow();
  evalModule(win, 'js/core/state.js');
  evalModule(win, 'js/core/permissions.js');
  evalModule(win, 'js/pos/cart.js');
  win.AppState.user = { role: 'admin', branchId: 'all' };
  win.Cart.items = [
    { id: 'p1', name: 'A', price: 10, quantity: 2 },
    { id: 'p2', name: 'B', price: 5, quantity: 1 }
  ];
  const t = win.Cart.getTotals();
  check('subtotal = 25', Math.round(t.subtotal * 100) === 2500, t.subtotal);
  check('tax 10% = 2.50', Math.round(t.tax * 100) === 250, t.tax);
  check('total = 27.50', Math.round(t.total * 100) === 2750, t.total);
  win.Cart.items.push({ id: 'p3', name: 'C', price: 'abc', quantity: 1 });
  const t2 = win.Cart.getTotals();
  check('ignores NaN price', Math.round(t2.total * 100) === 2750, t2.total);
}

console.log('# Cart add/remove/quantity guards');
{
  const win = freshWindow();
  evalModule(win, 'js/core/state.js');
  evalModule(win, 'js/core/permissions.js');
  evalModule(win, 'js/pos/cart.js');
  win.Cart.addItem({ id: 'p1', name: 'A', price: 10 });
  check('add adds one item', win.Cart.items.length === 1);
  win.Cart.addItem({ id: 'p1', name: 'A', price: 10 });
  check('duplicate increments qty', win.Cart.items[0].quantity === 2);
  win.Cart.updateQuantity('p1', 0);
  check('qty floor at 1', win.Cart.items[0].quantity === 1);
  win.Cart.addItem({ id: 'bad', name: 'N', price: -5 });
  check('reject negative price item', win.Cart.items.length === 1);
  win.Cart.removeItem('p1');
  check('remove clears item', win.Cart.items.length === 0);
}

console.log('# Permissions RBAC');
{
  const win = freshWindow();
  evalModule(win, 'js/core/state.js');
  evalModule(win, 'js/pos/cart.js');
  evalModule(win, 'js/core/permissions.js');
  win.AppState.user = { role: 'cashier', branchId: 'branch_01' };
  check('cashier can view_pos', win.Permissions.canAccess('view_pos') === true);
  check('cashier cannot view_reports', win.Permissions.canAccess('view_reports') === false);
  check('cashier cannot manage_users', win.Permissions.canAccess('manage_users') === false);
  win.AppState.user = { role: 'manager', branchId: 'all' };
  check('manager can view_reports', win.Permissions.canAccess('view_reports') === true);
  check('manager cannot manage_users', win.Permissions.canAccess('manage_users') === false);
  win.AppState.user = { role: 'admin', branchId: 'all' };
  check('admin can manage_users', win.Permissions.canAccess('manage_users') === true);
  check('admin can manage_settings', win.Permissions.canAccess('manage_settings') === true);
}

console.log('# Auth: missing profile denies login + Customers validation');
(async () => {
  const win = freshWindow();
  evalModule(win, 'js/core/state.js');
  evalModule(win, 'js/core/permissions.js');
  evalModule(win, 'js/core/auth.js');
  win.AppState.user = { role: 'cashier', branchId: 'branch_01' };
  check('cashier branch-scoped', win.Permissions.isBranchScoped() === true);
  win.Permissions.applyUIPermissions = () => {};
  const empty = async () => ({ empty: true, docs: [], size: 0, forEach: () => {} });
  const chain = { where: () => chain, limit: () => chain, orderBy: () => chain, get: empty, onSnapshot: (cb) => { cb({ empty: true, forEach: () => {} }); return () => {}; } };
  win.firebaseDb.collection = () => ({ doc: () => ({ get: async () => ({ exists: false, data: () => ({}) }) }), where: () => chain, limit: () => chain });
  let denied = false;
  win.Auth.handleLogout = async () => { denied = true; };
  await win.Auth.fetchUserRoleAndLogin({ uid: 'x', email: 'x@y.com' }).catch(() => {});
  check('missing profile denies login', denied === true);

  // Customers module
  const win2 = freshWindow();
  evalModule(win2, 'js/core/state.js');
  evalModule(win2, 'js/core/permissions.js');
  evalModule(win2, 'js/core/auth.js');
  evalModule(win2, 'js/customers/customers.js');
  win2.AppState.user = { role: 'manager', branchId: 'branch_01' };
  win2.document.getElementById('customer-form-name').value = 'Jo';
  win2.document.getElementById('customer-form-phone').value = '!!!bad!!!';
  await win2.Customers.saveCustomer();
  check('rejects invalid phone', (win2.__lastAlert || '').indexOf('valid phone') !== -1);
  const win3 = freshWindow();
  evalModule(win3, 'js/core/state.js');
  evalModule(win3, 'js/core/permissions.js');
  evalModule(win3, 'js/core/auth.js');
  evalModule(win3, 'js/customers/customers.js');
  win3.AppState.user = { role: 'cashier', branchId: 'branch_01' };
  win3.Customers.openFormModal();
  check('cashier blocked from customer form', (win3.__lastAlert || '').indexOf('permission') !== -1);

  // Stock adjustment goes through the adjustStock Cloud Function (never a
  // direct client write to inventory / stock_movements).
  const win4 = freshWindow();
  evalModule(win4, 'js/core/state.js');
  evalModule(win4, 'js/core/permissions.js');
  evalModule(win4, 'js/core/auth.js');
  evalModule(win4, 'js/inventory/movements.js');
  win4.AppState.user = { role: 'manager', branchId: 'branch_01' };
  let calledAdjustStock = false;
  win4.firebase.functions = () => ({
    httpsCallable: (name) => {
      if (name === 'adjustStock') {
        calledAdjustStock = true;
        return async () => ({ data: { ok: true } });
      }
      return async () => ({ data: { ok: false } });
    }
  });
  win4.document.getElementById('adj-product-id').value = 'p1';
  win4.document.getElementById('adj-branch-id').value = 'branch_01';
  win4.document.getElementById('adj-type').value = 'addition';
  win4.document.getElementById('adj-quantity').value = '5';
  win4.document.getElementById('adj-reason').value = 'restock';
  await win4.Movements.saveAdjustment();
  check('adjustment calls adjustStock function', calledAdjustStock === true);

  // Cashier is blocked from opening the adjustment modal (manage_inventory).
  const win5 = freshWindow();
  evalModule(win5, 'js/core/state.js');
  evalModule(win5, 'js/core/permissions.js');
  evalModule(win5, 'js/core/auth.js');
  evalModule(win5, 'js/inventory/movements.js');
  win5.AppState.user = { role: 'cashier', branchId: 'branch_01' };
  win5.Movements.openAdjustmentModal('p1', 'P', 'branch_01', 10);
  check('cashier blocked from stock adjustment', (win5.__lastAlert || '').indexOf('permission') !== -1);

  console.log('\nRESULTS: ' + passed + ' passed, ' + failed + ' failed');
  process.exit(failed ? 1 : 0);
})();