// SPA Router
window.Router = {
    init: function() {
        window.addEventListener('hashchange', this.handleRoute.bind(this));
        
        // Handle nav link clicks to update active states immediately
        document.querySelectorAll('.nav-link').forEach(link => {
            link.addEventListener('click', (e) => {
                // Let hash change handle the view, just update UI classes
                document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
                e.currentTarget.classList.add('active');
            });
        });
        
        // Initial route
        this.handleRoute();
    },
    
    handleRoute: function() {
        let hash = window.location.hash.substring(1) || '/pos';
        const targetViewMap = {
            '/pos': 'pos-view',
            '/inventory': 'inventory-view',
            '/products': 'products-view',
            '/sales': 'sales-view',
            '/customers': 'customers-view',
            '/reports': 'reports-view',
            '/users': 'users-view',
            '/settings': 'settings-view'
        };
        
        // Route Guard
        const routePermissions = {
            '/reports': 'view_reports',
            '/users': 'manage_users',
            '/settings': 'manage_settings',
            '/inventory': 'view_inventory', // everyone can view
            '/products': 'view_products',   // cashiers can view, only managers edit
            '/sales': 'view_sales',
            '/customers': 'view_customers'
        };
        
        const reqPerm = routePermissions[hash];
        if (reqPerm && !window.Permissions.canAccess(reqPerm)) {
            console.warn(`Access denied to ${hash}. Required permission: ${reqPerm}`);
            window.location.hash = '/pos';
            return;
        }

        const targetId = targetViewMap[hash];
        if (targetId) {
            this.showView(targetId);
            
            // Sync nav menu if navigated via code
            document.querySelectorAll('.nav-link').forEach(l => {
                l.classList.remove('active');
                if (l.getAttribute('href') === '#' + hash) {
                    l.classList.add('active');
                }
            });
            
            // Update Page Title
            const titles = {
                '/pos': 'Point of Sale',
                '/inventory': 'Inventory',
                '/products': 'Products',
                '/sales': 'Sales & Returns',
                '/customers': 'Customers',
                '/reports': 'Reports',
                '/settings': 'Settings'
            };
            document.getElementById('page-title').textContent = titles[hash] || 'CakePOS';
        }
    },
    
    showView: function(viewId) {
        document.querySelectorAll('.view-section').forEach(view => {
            view.classList.remove('active', 'hidden');
            if (view.id === viewId) {
                view.classList.add('active');
            } else {
                view.classList.add('hidden');
            }
        });
    },
    
    navigate: function(path) {
        window.location.hash = path;
    }
};
