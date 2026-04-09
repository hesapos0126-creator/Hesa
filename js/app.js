// Global State
let cart = [];
let currentView = 'dashboard';
let currentUser = null;
let currentOrderType = 'instore'; // 'instore' or 'online'
let appliedReturnCredit = 0;
let appliedReturnNo = '';
let currentBarcodeProductId = null;
let pendingCartsPollInterval = null;
let floorCart = []; // Independent cart for Sales Mode

// RBAC Global Flags (initialized false, set by applyRBAC())
window.defaultModule = 'dashboard';
window.hideInventoryActions = false;
window.hideReportsActions = false;
window.hideCustomerActions = false;
window.hidePOSActions = false;

// --- ROLE-BASED ACCESS CONTROL (RBAC) PERMISSIONS MATRIX ---
const rolePermissions = {
    admin: {
        modules: ['dashboard', 'pos', 'inventory', 'returns', 'floor-sales', 'customers', 'reports', 'logs'],
        viewOnly: []
    },
    gm: {
        modules: ['dashboard', 'pos', 'inventory', 'returns', 'floor-sales', 'customers', 'reports'],
        viewOnly: []
    },
    cashier: {
        modules: ['dashboard', 'pos', 'returns', 'inventory', 'customers', 'reports'],
        viewOnly: ['inventory', 'reports']
    },
    staff: {
        modules: ['dashboard', 'inventory', 'floor-sales', 'customers', 'reports'],
        viewOnly: []
    },
    salesperson: {
        modules: ['dashboard', 'floor-sales', 'inventory'],
        viewOnly: ['inventory']
    },
    'inventory manager': {
        modules: ['inventory'],
        viewOnly: []
    }
};

/**
 * Apply Role-Based Access Control to the UI
 * @param {string} userRole - The user's role (case-insensitive)
 */
function applyRBAC(userRole) {
    // Normalize role to lowercase
    const normalizedRole = userRole.toLowerCase().trim();
    const permissions = rolePermissions[normalizedRole];

    if (!permissions) {
        console.warn(`Unknown role: ${userRole}. Denying all access.`);
        document.querySelectorAll('.nav-item').forEach(el => el.style.display = 'none');
        return;
    }

    // Step 1: Hide/Show navigation menu items based on allowed modules
    const navItems = {
        'dashboard': 'nav-dashboard',
        'pos': 'nav-pos',
        'inventory': 'nav-inventory',
        'returns': 'nav-returns',
        'floor-sales': 'nav-floor-sales',
        'customers': 'nav-customers',
        'reports': 'nav-reports',
        'logs': 'nav-logs'
    };

    // Hide all nav items first
    Object.values(navItems).forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = 'none';
    });

    // Show only permitted nav items
    permissions.modules.forEach(module => {
        const navId = navItems[module];
        if (navId) {
            const el = document.getElementById(navId);
            if (el) el.style.display = '';
        }
    });

    // Step 2: Apply View-Only restrictions (hide action buttons)
    applyViewOnlyRestrictions(permissions.viewOnly);

    // Step 3: Set default route if Dashboard is not accessible
    const defaultModule = permissions.modules.includes('dashboard') 
        ? 'dashboard' 
        : permissions.modules[0];

    // Store default module for use after login
    window.defaultModule = defaultModule;
}

/**
 * Hide action buttons for modules with view-only access
 * @param {Array<string>} viewOnlyModules - List of modules that are view-only
 */
function applyViewOnlyRestrictions(viewOnlyModules) {
    // Hide action buttons for Inventory (if view-only)
    if (viewOnlyModules.includes('inventory')) {
        // Hide Add Product button
        const addProductBtn = document.querySelector('button[onclick="openProductModal()"]');
        if (addProductBtn) {
            addProductBtn.style.display = 'none';
        }

        // Hide edit/delete buttons in inventory table (will be applied after table renders)
        window.hideInventoryActions = true;
    } else {
        window.hideInventoryActions = false;
    }

    // Hide action buttons for Reports (if view-only)
    if (viewOnlyModules.includes('reports')) {
        // Hide Clear Reports button (admin-only anyway, but double-check)
        const clearBtn = document.getElementById('btn-clear-reports');
        if (clearBtn) clearBtn.style.display = 'none';

        window.hideReportsActions = true;
    } else {
        window.hideReportsActions = false;
    }

    // Hide action buttons for Customers (if view-only)
    if (viewOnlyModules.includes('customers')) {
        const addCustomerBtn = document.querySelector('button[onclick="openCustomerModal()"]');
        if (addCustomerBtn) {
            addCustomerBtn.style.display = 'none';
        }
        window.hideCustomerActions = true;
    } else {
        window.hideCustomerActions = false;
    }

    // Hide action buttons for POS (if view-only)
    if (viewOnlyModules.includes('pos')) {
        const checkoutBtn = document.querySelector('button[onclick="openCheckoutModal()"]');
        if (checkoutBtn) checkoutBtn.style.display = 'none';
        window.hidePOSActions = true;
    } else {
        window.hidePOSActions = false;
    }
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    checkAuth();

    // Set Date in Sidebar
    const today = new Date();
    document.getElementById('current-date').textContent = today.toLocaleDateString();

    // Initial Load
    // Initial Load
    // router('dashboard'); // Handled by checkAuth


    // Global Search Listener
    document.getElementById('global-search').addEventListener('input', (e) => {
        if (currentView === 'pos') {
            filterPosSearch(e.target.value);
        } else if (currentView === 'inventory') {
            filterInventorySearch(e.target.value);
        }
    });

    // Refresh Dashboard every time we switch to it
    document.getElementById('nav-dashboard').addEventListener('click', loadDashboard);
});

// --- ROUTER ---
function router(view) {
    if (!currentUser) {
        return;
    }

    // === RBAC CHECK: Verify user has access to this module ===
    const userRole = currentUser.role.toLowerCase().trim();
    const permissions = rolePermissions[userRole];
    
    if (!permissions || !permissions.modules.includes(view)) {
        console.warn(`Access denied to module: ${view}`);
        // Redirect to default accessible module
        const defaultView = window.defaultModule || 'dashboard';
        if (view !== defaultView) {
            router(defaultView);
        }
        return;
    }

    currentView = view;
    // Hide all views
    document.querySelectorAll('section[id^="view-"]').forEach(el => {
        el.classList.add('hidden');
    });
    // Show selected
    document.getElementById(`view-${view}`).classList.remove('hidden');

    // Update Sidebar
    document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('text-white', 'bg-white/10'));
    document.getElementById(`nav-${view}`).classList.add('text-white', 'bg-white/10');

    // Update Header
    const titles = {
        'dashboard': 'Dashboard',
        'pos': 'Point of Sale',
        'inventory': 'Inventory',
        'customers': 'Customer Management',
        'customers': 'Customer Management',
        'reports': 'Reports',
        'logs': 'Security',
        'floor-sales': 'Floor Scan Mode'
    };
    document.getElementById('page-title').textContent = titles[view] || 'Hesa POS';

    // Show/hide admin-only Clear Reports button
    const clearBtn = document.getElementById('btn-clear-reports');
    if (clearBtn) {
        if (currentUser.role === 'admin') {
            clearBtn.classList.remove('hidden');
        } else {
            clearBtn.classList.add('hidden');
        }
    }

    // Show/hide admin-only Manage Ranges button
    const rangesBtn = document.getElementById('btn-manage-ranges');
    if (rangesBtn) {
        if (currentUser.role === 'admin') {
            rangesBtn.classList.remove('hidden');
        } else {
            rangesBtn.classList.add('hidden');
        }
    }

    // Load data based on view
    if (view === 'dashboard') loadDashboard();
    if (view === 'inventory') loadInventory();
    if (view === 'customers') loadCustomers();
    if (view === 'pos') {
        loadPosProducts('All');
        checkPendingExchangeCredit();
    }
    if (view === 'returns') {
        document.getElementById('return-search-input').value = '';
        document.getElementById('return-result-area').innerHTML = '';
        document.getElementById('return-result-area').classList.add('hidden');
    }
    if (view === 'logs') {
        loadLogs();
        loadUsers();
    }
    if (view === 'floor-sales') {
        document.getElementById('floor-sender-name').textContent = currentUser.username;
        updateFloorCategories(); // Dynamic categories
        loadFloorProducts('All');
    }
}

function checkPendingExchangeCredit() {
    // Exchange credit feature disabled for security - no persistent sessions
}

// --- AUTHENTICATION & LOGGING ---

async function checkAuth() {
    // No session persistence - user must login on every page load for strict security
    document.getElementById('login-screen').classList.remove('hidden');
}

async function handleLogin(e) {
    e.preventDefault();
    const userIn = document.getElementById('login-username').value;
    const passIn = document.getElementById('login-password').value;
    const errorEl = document.getElementById('login-error');

    try {
        // Use dedicated login endpoint for explicit plain text password verification
        const response = await fetch('/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: userIn, password: passIn })
        });

        if (response.ok) {
            const user = await response.json();
            // Success
            currentUser = { id: user.id, username: user.username, role: user.role };
            document.getElementById('current-user-name').textContent = user.username;
            document.getElementById('login-screen').classList.add('hidden');
            
            // === APPLY RBAC IMMEDIATELY AFTER LOGIN ===
            applyRBAC(currentUser.role);
            
            // Route to default module (dashboard or first accessible module)
            const defaultView = window.defaultModule || 'dashboard';
            router(defaultView);
            
            startPendingCartsPoll();
            logAction('LOGIN', `User ${user.username} logged in.`);
        } else {
            // Fail
            errorEl.textContent = "Invalid username or password";
            errorEl.classList.remove('hidden');
            await logAction('LOGIN_FAILED', `Failed login attempt for ${userIn}`);
        }
    } catch (err) {
        console.error('Login error:', err);
        errorEl.textContent = "Login failed. Please try again.";
        errorEl.classList.remove('hidden');
    }
}

function handleLogout() {
    if (confirm('Are you sure you want to logout?')) {
        logAction('LOGOUT', `User ${currentUser.username} logged out`);
        currentUser = null;
        document.getElementById('login-username').value = '';
        document.getElementById('login-password').value = '';
        document.getElementById('login-error').classList.add('hidden');
        document.getElementById('login-screen').classList.remove('hidden');
        stopPendingCartsPoll();
    }
}

async function logAction(action, details) {
    await db.logs.add({
        timestamp: new Date().toISOString(),
        action: action,
        user: currentUser ? currentUser.username : 'System',
        details: details
    });
}

// --- LOGS VIEW ---
async function loadLogs() {
    const logs = await db.logs.orderBy('timestamp').reverse().limit(50).toArray();
    const tbody = document.getElementById('logs-table');
    tbody.innerHTML = '';

    if (logs.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" class="text-center py-8 text-gray-400">No logs found</td></tr>';
        return;
    }

    logs.forEach(log => {
        const tr = document.createElement('tr');
        tr.className = 'border-b border-gray-50 hover:bg-gray-50';
        tr.innerHTML = `
            <td class="p-3 text-gray-500 text-xs">${new Date(log.timestamp).toLocaleString()}</td>
            <td class="p-3 font-medium text-gray-800">${log.user}</td>
            <td class="p-3"><span class="px-2 py-1 rounded text-xs font-bold ${getLogColor(log.action)}">${log.action}</span></td>
            <td class="p-3 text-gray-600 text-sm">${log.details}</td>
        `;
        tbody.appendChild(tr);
    });
}

function getLogColor(action) {
    if (action === 'LOGIN') return 'bg-green-100 text-green-700';
    if (action === 'LOGOUT') return 'bg-orange-100 text-orange-700';
    if (action === 'LOGIN_FAILED') return 'bg-red-100 text-red-700';
    if (action === 'USER_ADDED') return 'bg-purple-100 text-purple-700';
    if (action === 'PASSWORD_CHANGED') return 'bg-blue-100 text-blue-700';
    if (action === 'USER_DELETED') return 'bg-red-100 text-red-700';
    return 'bg-blue-100 text-blue-700';
}

// --- USER MANAGEMENT ---
async function loadUsers() {
    const users = await db.users.toArray();
    const tbody = document.getElementById('users-table');
    tbody.innerHTML = '';

    users.forEach(u => {
        const tr = document.createElement('tr');
        tr.className = 'border-b border-gray-50';
        tr.innerHTML = `
            <td class="p-3 font-bold text-gray-800">${u.username}</td>
            <td class="p-3"><span class="px-2 py-1 rounded text-xs bg-gray-100 text-gray-600">${u.role}</span></td>
            <td class="p-3 text-right">
                <button onclick="openChangePasswordModal('${u.id}', '${u.username}')" 
                    class="text-blue-600 hover:bg-blue-50 px-3 py-1 rounded text-xs font-medium mr-2">
                    Change Password
                </button>
                ${u.username !== 'admin' && u.id !== currentUser.id ?
                `<button onclick="deleteUser('${u.id}', '${u.username}')" class="text-red-500 hover:bg-red-50 p-2 rounded"><i class="fa-solid fa-trash"></i></button>`
                : ''
            }
            </td>
        `;
        tbody.appendChild(tr);
    });
}

function openAddUserModal() {
    document.getElementById('modal-add-user').classList.remove('hidden');
    document.getElementById('new-username').value = '';
    document.getElementById('new-password').value = '';
}

function closeAddUserModal() {
    document.getElementById('modal-add-user').classList.add('hidden');
}

async function handleAddUserSubmit(e) {
    e.preventDefault();
    const username = document.getElementById('new-username').value.trim();
    const password = document.getElementById('new-password').value;
    const role = document.getElementById('new-role').value;

    if (!username || !password) return;

    // Check existing
    const existing = await db.users.where('username').equals(username).count();
    if (existing > 0) {
        alert('Username already exists!');
        return;
    }

    await db.users.add({ username, password, role });
    await logAction('USER_ADDED', `Created user: ${username} (${role})`);

    closeAddUserModal();
    loadUsers();
    loadLogs();
}

function openChangePasswordModal(id, username) {
    document.getElementById('modal-change-password').classList.remove('hidden');
    document.getElementById('cp-username').textContent = `For user: ${username}`;
    document.getElementById('cp-user-id').value = id;
    document.getElementById('cp-new-password').value = '';
}

function closeChangePasswordModal() {
    document.getElementById('modal-change-password').classList.add('hidden');
}

async function handleChangePasswordSubmit(e) {
    e.preventDefault();
    const id = document.getElementById('cp-user-id').value;
    const newPass = document.getElementById('cp-new-password').value;

    if (!newPass) return;

    await db.users.update(id, { password: newPass });

    // Log it
    const user = await db.users.get(id);
    await logAction('PASSWORD_CHANGED', `Changed password for ${user.username}`);

    closeChangePasswordModal();
    loadUsers(); // Optional, but keeps UI fresh
    loadLogs();
    alert('Password updated successfully');
}

async function deleteUser(id, username) {
    if (confirm(`Are you sure you want to delete user '${username}'?`)) {
        await db.users.delete(id);
        await logAction('USER_DELETED', `Deleted user: ${username}`);
        loadUsers();
        loadLogs();
    }
}


// --- DASHBOARD ---
async function loadDashboard() {
    const todayStr = new Date().toLocaleDateString(); // Simple check, ideally check timestamp ranges

    // Fetch all sales
    const allSales = await db.sales.toArray();

    // Filter for today
    // Note: Storing simpler timestamps would be better for querying, but filtering in memory for small app is fine.
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const todaySales = allSales.filter(s => new Date(s.timestamp) >= startOfDay);

    // Calc Totals
    const totalRevenue = todaySales.reduce((sum, sale) => sum + sale.total, 0);
    const totalOrders = todaySales.length;
    const totalDiscounts = todaySales.reduce((sum, sale) => {
        let itemsDisc = sale.items.reduce((isum, item) => isum + ((item.discount || 0) * item.qty), 0);
        return sum + itemsDisc + (sale.specialDiscount || 0);
    }, 0);

    // Returns
    const allReturns = await db.returns.toArray();
    const todayReturns = allReturns.filter(r => new Date(r.returnDate) >= startOfDay);

    // Low Stock
    const lowStockCount = await db.products.where('stock').below(5).count();

    // Update UI
    document.getElementById('dash-total-sales').textContent = `Rs ${totalRevenue.toLocaleString()}.00`;
    document.getElementById('dash-total-orders').textContent = totalOrders;

    // Check if dash-discounts element exists, if not maybe reuse an existing card or expect HTML update
    if (document.getElementById('dash-discounts')) {
        document.getElementById('dash-discounts').textContent = `Rs ${totalDiscounts.toLocaleString()}.00`;
    }

    document.getElementById('dash-returns').textContent = todayReturns.length;
    document.getElementById('dash-low-stock').textContent = lowStockCount;

    // Recent Table
    const tbody = document.getElementById('dash-recent-table');
    tbody.innerHTML = '';
    const recent = allSales.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)).slice(0, 5);

    if (recent.length === 0) {
        document.getElementById('dash-no-data').classList.remove('hidden');
    } else {
        document.getElementById('dash-no-data').classList.add('hidden');
        recent.forEach(sale => {
            const tr = document.createElement('tr');
            tr.className = 'border-b border-gray-50';
            tr.innerHTML = `
                <td class="py-3 font-medium text-brand-dark">${sale.invoicePrefix}${sale.invoiceNumber}</td>
                <td class="py-3 text-gray-500">${sale.customerMobile || 'Guest'}</td>
                <td class="py-3 text-gray-500">${sale.items.length} items</td>
                <td class="py-3 font-bold">Rs ${sale.total.toLocaleString()}</td>
                <td class="py-3 text-xs text-gray-400">${new Date(sale.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</td>
            `;
            tbody.appendChild(tr);
        });
    }
}


// --- CODE RANGES LOGIC ---
async function loadCodeRanges() {
    const ranges = await db.codeRanges.toArray();
    ranges.sort((a,b) => a.minCode - b.minCode);
    return ranges;
}

function openCodeRangesModal() {
    document.getElementById('modal-code-ranges').classList.remove('hidden');
    renderCodeRangesTable();
}

function closeCodeRangesModal() {
    document.getElementById('modal-code-ranges').classList.add('hidden');
    if (currentView === 'inventory') loadInventory();
    if (currentView === 'pos') {
        const activeNav = document.getElementById('pos-categories').querySelector('.bg-brand-dark');
        const activeCat = activeNav ? activeNav.textContent : 'All Items';
        loadPosProducts(activeCat === 'All Items' ? 'All' : activeCat);
    }
}

async function renderCodeRangesTable() {
    const ranges = await loadCodeRanges();
    const tbody = document.getElementById('code-ranges-table');
    tbody.innerHTML = '';
    
    if(ranges.length === 0) {
        tbody.innerHTML = '<tr><td colspan="3" class="text-center py-6 text-gray-400">No ranges added yet.</td></tr>';
        return;
    }
    
    ranges.forEach(r => {
        const tr = document.createElement('tr');
        tr.className = "border-b border-gray-50 hover:bg-gray-50 transition-colors";
        tr.innerHTML = `
            <td class="p-3 font-medium text-brand-dark">${r.minCode} - ${r.maxCode}</td>
            <td class="p-3 font-bold text-gray-800">${r.name}</td>
            <td class="p-3 text-right">
                <button onclick="deleteCodeRange(${r.id})" class="text-red-500 hover:bg-red-50 p-2 rounded"><i class="fa-solid fa-trash"></i></button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

async function handleAddCodeRange(e) {
    e.preventDefault();
    const minCode = parseInt(document.getElementById('cr-min').value);
    const maxCode = parseInt(document.getElementById('cr-max').value);
    const name = document.getElementById('cr-name').value.trim();
    
    if(minCode > maxCode) {
        alert("Min Code must be less than or equal to Max Code");
        return;
    }
    
    await db.codeRanges.add({ minCode, maxCode, name });
    document.getElementById('cr-form').reset();
    renderCodeRangesTable();
}

async function deleteCodeRange(id) {
    if(confirm('Delete this code range?')) {
        await db.codeRanges.delete(id);
        renderCodeRangesTable();
    }
}

function getProductRangeName(code, ranges) {
    if(!code) return "Uncategorized";
    // Extract numbers ignoring letters like HC
    const c = parseInt(code.toString().replace(/\D/g, ''));
    if(isNaN(c)) return "Uncategorized";
    for(let r of ranges) {
        if(c >= r.minCode && c <= r.maxCode) return r.name;
    }
    return "Other Codes";
}

// --- INVENTORY ---
async function loadInventory() {
    const products = await db.products.toArray();
    const ranges = await loadCodeRanges();
    renderInventoryTable(products, ranges);
}

function renderInventoryTable(products, ranges) {
    const tbody = document.getElementById('inventory-table');
    tbody.innerHTML = '';

    const totalStock = products.reduce((sum, p) => sum + (p.stock || 0), 0);
    const totalValue = products.reduce((sum, p) => sum + ((p.price || 0) * (p.stock || 0)), 0);
    
    const badge = document.getElementById('inventory-total-badge');
    if (badge) {
        badge.textContent = `Total Stock: ${totalStock}`;
    }

    const valueBadge = document.getElementById('inventory-value-badge');
    if (valueBadge) {
        valueBadge.textContent = `Total Value: Rs ${totalValue.toLocaleString()}`;
    }

    if (products.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" class="text-center py-8 text-gray-400">No products found. Add one!</td></tr>';
        return;
    }

    // Grouping
    const grouped = {};
    products.forEach(p => {
        const rangeName = getProductRangeName(p.code, ranges);
        if(!grouped[rangeName]) grouped[rangeName] = [];
        grouped[rangeName].push(p);
    });

    const sortedGroupNames = Object.keys(grouped).sort((a,b) => {
        if(a === "Uncategorized" || a === "Other Codes") return 1;
        if(b === "Uncategorized" || b === "Other Codes") return -1;
        const rangeA = ranges.find(r => r.name === a);
        const rangeB = ranges.find(r => r.name === b);
        if (rangeA && rangeB) {
            return rangeA.minCode - rangeB.minCode;
        }
        return a.localeCompare(b);
    });

    sortedGroupNames.forEach(groupName => {
        // Group Header
        const headerRow = document.createElement('tr');
        headerRow.className = "bg-gray-100 border-b border-gray-200";
        headerRow.innerHTML = `<td colspan="8" class="p-3 font-bold text-gray-700 text-sm"><i class="fa-solid fa-layer-group text-brand-gold mr-2"></i> ${groupName} <span class="text-xs font-normal text-gray-500 ml-2">(${grouped[groupName].length} items)</span></td>`;
        tbody.appendChild(headerRow);

        let groupProducts = grouped[groupName];
        groupProducts.sort((a, b) => {
            const codeA = a.code ? parseInt(a.code.toString().replace(/\D/g, '')) : 0;
            const codeB = b.code ? parseInt(b.code.toString().replace(/\D/g, '')) : 0;
            const finalA = isNaN(codeA) ? 0 : codeA;
            const finalB = isNaN(codeB) ? 0 : codeB;
            return finalA - finalB;
        });

        groupProducts.forEach(p => {
            const tr = document.createElement('tr');
            tr.className = 'border-b border-gray-50 hover:bg-gray-50 transition-colors';
            
            // Build action buttons based on view-only status
            let actionButtons = `
                <button onclick="openManageStockModal(${p.id})" class="text-green-600 hover:bg-green-50 p-2 rounded" title="Manage Stock (Arrivals)"><i class="fa-solid fa-boxes-packing"></i></button>
                <button onclick="editProduct(${p.id})" class="text-blue-500 hover:bg-blue-50 p-2 rounded" title="Edit Product"><i class="fa-solid fa-pen"></i></button>
                <button onclick="openBarcodeModal(${p.id})" class="text-orange-500 hover:bg-orange-50 p-2 rounded" title="Print Barcode"><i class="fa-solid fa-barcode"></i></button>
                <button onclick="deleteProduct(${p.id})" class="text-red-500 hover:bg-red-50 p-2 rounded" title="Delete Product"><i class="fa-solid fa-trash"></i></button>
            `;
            
            // If view-only, hide edit/delete/manage stock but keep barcode view
            if (window.hideInventoryActions) {
                actionButtons = `
                    <button onclick="openBarcodeModal(${p.id})" class="text-orange-500 hover:bg-orange-50 p-2 rounded" title="Print Barcode"><i class="fa-solid fa-barcode"></i></button>
                    <span class="text-[10px] text-gray-400 italic ml-2">View-only</span>
                `;
            }
            
            tr.innerHTML = `
                <td class="p-3 font-bold text-brand-dark text-xs">${p.code || '-'}</td>
                <td class="p-3 font-medium text-gray-800">${p.name}</td>
                <td class="p-3 text-gray-500"><span class="px-2 py-1 rounded text-xs ${p.category === 'Hesa Elegant' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'}">${p.category}</span></td>
                <td class="p-3 text-gray-500">${p.color}</td>
                <td class="p-3 text-gray-500">Rs ${p.price}</td>
                <td class="p-3 text-gray-500 text-red-400">-${p.discount}</td>
                <td class="p-3">
                    <div class="font-bold ${p.stock < 5 ? 'text-red-500' : 'text-green-600'}">${p.stock}</div>
                    ${p.sizeStock && Object.keys(p.sizeStock).length > 0 ?
                    `<div class="text-[10px] leading-tight text-gray-400 mt-1 space-x-1">
                            ${Object.entries(p.sizeStock).map(([s, q]) => `<span>${s}:<b>${q}</b></span>`).join('')}
                        </div>` : ''}
                </td>
                <td class="p-3 text-right whitespace-nowrap">
                    ${actionButtons}
                </td>
            `;
            tbody.appendChild(tr);
        });
    });
}

async function filterInventorySearch(query) {
    const products = await db.products.filter(p =>
        p.name.toLowerCase().includes(query.toLowerCase()) ||
        p.barcode.includes(query) || (p.code && p.code.toLowerCase().includes(query.toLowerCase()))
    ).toArray();
    const ranges = await loadCodeRanges();
    renderInventoryTable(products, ranges);
}

async function printInventory() {
    const products = await db.products.toArray();
    const now = new Date().toLocaleString('en-LK');

    const rows = products.map((p, idx) => {
        const stockColor = p.stock < 5 ? 'color:#c53030;font-weight:bold;' : 'color:#276749;font-weight:bold;';
        const sizeInfo = p.sizeStock && Object.keys(p.sizeStock).length > 0
            ? Object.entries(p.sizeStock).map(([s, q]) => `${s}:${q}`).join('  ')
            : '';
        return `
            <tr style="border-bottom:2px dashed #ccc;">
                <td style="padding:10px 4px;">
                    <div style="font-size:16px;font-weight:800;">${p.name}</div>
                    ${p.code ? `<div style="font-size:13px;color:#555;">Code: ${p.code}</div>` : ''}
                    ${sizeInfo ? `<div style="font-size:12px;color:#888;margin-top:2px;">${sizeInfo}</div>` : ''}
                </td>
                <td style="padding:10px 4px;text-align:right;font-size:16px;font-weight:800;${stockColor}">${p.stock}</td>
                <td style="padding:10px 4px;text-align:right;font-size:16px;font-weight:800;">Rs ${p.price.toLocaleString()}</td>
            </tr>
        `;
    }).join('');

    const totalProducts = products.length;
    const totalStock = products.reduce((s, p) => s + p.stock, 0);
    const totalValue = products.reduce((sum, p) => sum + ((p.price || 0) * (p.stock || 0)), 0);
    const lowStock = products.filter(p => p.stock < 5).length;

    const printContent = `
        <!DOCTYPE html><html><head>
        <meta charset="UTF-8">
        <title>Hesa - Inventory List</title>
        <style>
            body { font-family: 'Courier New', Courier, monospace; font-size: 14px; font-weight: bold; color: #000;
                   margin: 0; padding: 8px; width: 80mm; box-sizing: border-box; }
            .header { text-align: center; border-bottom: 3px solid #000; padding-bottom: 8px; margin-bottom: 10px; }
            .title { font-size: 20px; font-weight: 900; }
            .subtitle { font-size: 12px; font-weight: normal; color: #555; }
            .summary { display: flex; justify-content: space-between; font-size: 13px;
                       border-bottom: 2px solid #000; padding-bottom: 8px; margin-bottom: 10px; flex-wrap: wrap; }
            .total-val { width: 100%; text-align: center; margin-top: 5px; font-size: 14px; }
            table { width: 100%; border-collapse: collapse; }
            thead th { font-size: 13px; border-bottom: 2px solid #000; padding: 4px; text-align: left; }
            thead th:nth-child(2), thead th:nth-child(3) { text-align: right; }
            .footer { text-align: center; font-size: 12px; border-top: 2px dashed #000;
                      margin-top: 10px; padding-top: 8px; font-weight: normal; }
            @media print { @page { size: 80mm auto; margin: 0; } html, body { margin: 0; padding: 5px; page-break-inside: avoid; break-inside: avoid; } }
        </style>
        </head><body>
        <div class="header">
            <div class="title">HESA COLLECTION</div>
            <div class="subtitle">Inventory List</div>
            <div class="subtitle">${now}</div>
        </div>
        <div class="summary">
            <span>Products: <b>${totalProducts}</b></span>
            <span>Stock: <b>${totalStock}</b></span>
            <span style="color:#c53030;">Low: <b>${lowStock}</b></span>
            <div class="total-val">Total Value: Rs ${totalValue.toLocaleString()}</div>
        </div>
        <table>
            <thead><tr>
                <th>Product</th>
                <th style="text-align:right;">Stock</th>
                <th style="text-align:right;">Price</th>
            </tr></thead>
            <tbody>${rows}</tbody>
        </table>
        <div class="footer">Total ${totalProducts} products &bull; ${now}</div>
        </body></html>
    `;

    const w = window.open('', '_blank', 'width=400,height=700');
    w.document.write(printContent);
    w.document.close();
    w.focus();
    setTimeout(() => { w.print(); }, 500);
}

async function downloadInventoryPDF() {
    const products = await db.products.toArray();
    const now = new Date().toLocaleString('en-LK');

    const rows = products.map((p, idx) => {
        const stockColor = p.stock < 5 ? 'color:#c53030;font-weight:bold;' : 'color:#276749;font-weight:bold;';
        const sizeInfo = p.sizeStock && Object.keys(p.sizeStock).length > 0
            ? Object.entries(p.sizeStock).map(([s, q]) => `${s}:${q}`).join('  ')
            : '';
        return `
            <tr style="border-bottom:1px solid #eee;">
                <td style="padding:10px 4px;">
                    <div style="font-size:14px;font-weight:bold;color:#333;">${p.name}</div>
                    ${p.code ? `<div style="font-size:12px;color:#666;">Code: ${p.code}</div>` : ''}
                    ${sizeInfo ? `<div style="font-size:11px;color:#888;margin-top:2px;">${sizeInfo}</div>` : ''}
                </td>
                <td style="padding:10px 4px;text-align:center;">
                    <span style="font-size:11px;padding:2px 6px;border-radius:4px;background:#f3f4f6;color:#555;">${p.category || '-'}</span>
                </td>
                <td style="padding:10px 4px;text-align:right;font-size:14px;${stockColor}">${p.stock}</td>
                <td style="padding:10px 4px;text-align:right;font-size:14px;color:#333;">Rs ${p.price.toLocaleString()}</td>
            </tr>
        `;
    }).join('');

    const totalProducts = products.length;
    const totalStock = products.reduce((s, p) => s + p.stock, 0);
    const totalValue = products.reduce((sum, p) => sum + ((p.price || 0) * (p.stock || 0)), 0);
    const lowStock = products.filter(p => p.stock < 5).length;

    const printContent = `
        <div style="font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; padding: 20px; color: #333; max-width: 800px; margin: 0 auto;">
            <div style="text-align: center; margin-bottom: 20px;">
                <h1 style="margin:0; font-size:24px; color:#1f2937; letter-spacing:1px;">HESA COLLECTION</h1>
                <h2 style="margin:5px 0; font-size:16px; color:#4b5563; font-weight:normal;">Inventory Report</h2>
                <div style="font-size:12px; color:#6b7280; margin-top:5px;">Generated: ${now}</div>
            </div>
            
            <div style="display:flex; justify-content:space-between; flex-wrap:wrap; margin-bottom:20px; padding:12px 15px; background:#f9fafb; border-radius:8px; border:1px solid #e5e7eb; font-size:14px;">
                <div style="width:50%; margin-bottom:8px;">Total Products: <b>${totalProducts}</b></div>
                <div style="width:50%; margin-bottom:8px; text-align:right;">Total Stock: <b>${totalStock}</b></div>
                <div style="width:50%;">Low Stock Items: <b style="color:#ef4444;">${lowStock}</b></div>
                <div style="width:50%; text-align:right; color:#059669;">Total Value: <b>Rs ${totalValue.toLocaleString()}</b></div>
            </div>

            <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
                <thead>
                    <tr style="background:#f3f4f6; text-align:left; font-size:13px; color:#4b5563;">
                        <th style="padding:10px 4px; border-bottom:2px solid #ddd; width:45%;">Product Details</th>
                        <th style="padding:10px 4px; border-bottom:2px solid #ddd; text-align:center; width:20%;">Category</th>
                        <th style="padding:10px 4px; border-bottom:2px solid #ddd; text-align:right; width:15%;">Stock</th>
                        <th style="padding:10px 4px; border-bottom:2px solid #ddd; text-align:right; width:20%;">Base Price</th>
                    </tr>
                </thead>
                <tbody>
                    ${rows}
                </tbody>
            </table>
            <div style="text-align:center; font-size:11px; color:#9ca3af; margin-top:30px; border-top:1px solid #e5e7eb; padding-top:10px;">
                HESA Collection &bull; System Generated Report
            </div>
        </div>
    `;

    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = printContent;
    document.body.appendChild(tempDiv);
    
    const opt = {
        margin: [0.5, 0.5, 0.5, 0.5],
        filename: 'Hesa_Inventory.pdf',
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true },
        jsPDF: { unit: 'in', format: 'a4', orientation: 'portrait' }
    };
    
    html2pdf().from(tempDiv).set(opt).save().then(() => {
        document.body.removeChild(tempDiv);
    });
}

async function printReport() {
    const element = document.getElementById('report-printable');
    if (!element) {
        alert('Please click Preview to generate the report first.');
        return;
    }

    // Get period text
    const period = document.getElementById('global-report-period')?.value || '';
    const now = new Date().toLocaleString('en-LK');

    const printContent = `
        <!DOCTYPE html><html><head>
        <meta charset="UTF-8">
        <title>Hesa - Sales Report</title>
        <style>
            body { font-family: 'Courier New', Courier, monospace; font-size: 14px; font-weight: bold;
                   color: #000; margin: 0; padding: 8px; width: 80mm; box-sizing: border-box; }
            h1 { font-size: 18px; font-weight: 900; margin: 0 0 2px 0; text-align: center; }
            .sub { text-align: center; font-size: 12px; font-weight: normal; color: #555; margin-bottom: 10px;
                   border-bottom: 2px solid #000; padding-bottom: 8px; }
            .stat-box { display: flex; justify-content: space-between; font-size: 13px;
                        border-bottom: 1px dashed #000; padding: 5px 0; margin-bottom: 8px; }
            .stat-label { font-weight: normal; color: #555; }
            table { width: 100%; border-collapse: collapse; font-size: 13px; }
            th { font-size: 12px; border-bottom: 2px solid #000; padding: 4px 2px; text-align: left; }
            td { padding: 6px 2px; border-bottom: 1px dashed #ccc; vertical-align: top; }
            .amount { text-align: right; font-size: 14px; }
            .footer { text-align: center; font-size: 11px; border-top: 2px dashed #000;
                      margin-top: 10px; padding-top: 6px; font-weight: normal; }
            @media print { @page { size: 80mm auto; margin: 0; } html, body { margin: 0; padding: 5px; page-break-inside: avoid; break-inside: avoid; } }
        </style>
        </head><body>
        <h1>HESA COLLECTION</h1>
        <div class="sub">Sales Report (${period.toUpperCase()})<br>${now}</div>
        ${element.innerHTML
            .replace(/class="[^"]*"/g, '')
            .replace(/style="[^"]*"/g, '')
            .replace(/<button[^>]*>.*?<\/button>/gs, '')
            .replace(/<div[^>]*grid[^>]*>/g, '<div>')
        }
        <div class="footer">HESA Collection &bull; 0760492705</div>
        </body></html>
    `;

    const w = window.open('', '_blank', 'width=400,height=700');
    w.document.write(printContent);
    w.document.close();
    w.focus();
    setTimeout(() => { w.print(); }, 500);
}

let productDraft = null;

// Product Modal Handlers
function openProductModal(id = null) {
    const modal = document.getElementById('modal-product');
    const form = document.getElementById('product-form');

    // Reset Form
    form.reset();
    document.getElementById('prod-id').value = '';
    document.getElementById('modal-product-title').textContent = 'Add Product';
    document.getElementById('size-stock-rows').innerHTML = '';
    document.getElementById('prod-stock').value = 0;

    const hintBadge = document.getElementById('next-prod-code-hint');
    if (hintBadge) hintBadge.classList.add('hidden');

    if (id) {
        document.getElementById('modal-product-title').textContent = 'Edit Product';
        db.products.get(id).then(p => {
            document.getElementById('prod-id').value = p.id;
            document.getElementById('prod-name').value = p.name;
            document.getElementById('prod-code').value = p.code || '';
            document.getElementById('prod-barcode').value = p.barcode;
            document.getElementById('prod-category').value = p.category;
            document.getElementById('prod-color').value = p.color;
            document.getElementById('prod-internal-desc').value = p.internalDesc || '';
            document.getElementById('prod-price').value = p.price;
            document.getElementById('prod-discount').value = p.discount;
            document.getElementById('prod-stock').value = p.stock || 0;

            // Populate Sizes
            if (p.sizeStock) {
                Object.entries(p.sizeStock).forEach(([variant, qty]) => {
                    let c = '';
                    let s = variant;
                    if (variant.includes(' - ')) {
                        const parts = variant.split(' - ');
                        c = parts[0];
                        s = parts.slice(1).join(' - ');
                    }
                    addSizeStockRow(s, qty, c);
                });
            } else if (p.sizes && p.sizes.length > 0) {
                p.sizes.forEach(s => addSizeStockRow(s, 0));
            }
        });
    } else {
        // Restoring draft
        if (productDraft) {
            if (confirm("You have an unsaved product draft. Do you want to resume?")) {
                document.getElementById('prod-name').value = productDraft.name || '';
                document.getElementById('prod-code').value = productDraft.code || '';
                document.getElementById('prod-barcode').value = productDraft.barcode || '';
                if (productDraft.category) document.getElementById('prod-category').value = productDraft.category;
                document.getElementById('prod-color').value = productDraft.color || '';
                document.getElementById('prod-internal-desc').value = productDraft.internalDesc || '';
                document.getElementById('prod-price').value = productDraft.price || '';
                document.getElementById('prod-discount').value = productDraft.discount || '0';

                if (productDraft.sizeStock) {
                    Object.entries(productDraft.sizeStock).forEach(([variant, qty]) => {
                        let c = '';
                        let s = variant;
                        if (variant.includes(' - ')) {
                            const parts = variant.split(' - ');
                            c = parts[0];
                            s = parts.slice(1).join(' - ');
                        }
                        addSizeStockRow(s, qty, c);
                    });
                }
            } else {
                productDraft = null;
            }
        }
    }

    modal.classList.remove('hidden');
}

// Barcode Modal logic
async function openBarcodeModal(id) {
    const product = await db.products.get(id);
    if (!product) return;

    currentBarcodeProductId = id;
    document.getElementById('barcode-item-name').textContent = product.name;
    document.getElementById('barcode-item-code').textContent = `Code: ${product.code || 'N/A'}`;
    document.getElementById('barcode-item-price').textContent = `Rs ${product.price.toLocaleString()}.00`;
    document.getElementById('barcode-qty').value = 1;

    document.getElementById('modal-barcode').classList.remove('hidden');
}

function closeBarcodeModal() {
    document.getElementById('modal-barcode').classList.add('hidden');
    currentBarcodeProductId = null;
}

async function handleBarcodePrint() {
    const qty = parseInt(document.getElementById('barcode-qty').value) || 1;
    if (qty < 1) return;

    const product = await db.products.get(currentBarcodeProductId);
    if (!product) return;

    const printWindow = window.open('', '_blank', 'width=400,height=600');
    
    // Generate barcode as SVG string
    const svg = document.getElementById('barcode-svg-element');
    JsBarcode(svg, product.barcode || product.code, {
        format: "CODE128",
        width: 2,
        height: 40,
        displayValue: true,
        fontSize: 14,
        margin: 10
    });
    
    const svgHtml = svg.outerHTML;
    
    let labelsHtml = '';
    for (let i = 0; i < qty; i++) {
        labelsHtml += `
            <div class="label-container" style="page-break-after: always; width: 38mm; height: 25mm; display: flex; flex-direction: column; align-items: center; justify-content: center; overflow: hidden; font-family: sans-serif; text-align: center; border: 1px dotted #ccc; margin-bottom: 5px;">
                <div style="font-size: 8px; font-weight: bold; margin-bottom: 2px; white-space: nowrap; overflow: hidden; width: 90%;">${product.name}</div>
                <div class="barcode-wrapper" style="transform: scale(0.9);">${svgHtml}</div>
                <div style="font-size: 10px; font-weight: 900; margin-top: 1px;">Rs ${product.price.toLocaleString()}.00</div>
            </div>
        `;
    }

    const fullHtml = `
        <!DOCTYPE html>
        <html>
        <head>
            <title>Labels - ${product.name}</title>
            <style>
                @page { margin: 0; size: 38mm 25mm; }
                body { margin: 0; padding: 0; }
                .label-container { page-break-after: always; }
                svg { max-width: 100%; height: auto; }
            </style>
        </head>
        <body onload="window.print(); window.close();">
            ${labelsHtml}
        </body>
        </html>
    `;

    printWindow.document.write(fullHtml);
    printWindow.document.close();
}

async function suggestNextCode() {
    const codeInput = document.getElementById('prod-code').value.trim();
    const hintBadge = document.getElementById('next-prod-code-hint');
    const nextValEl = document.getElementById('next-code-val');
    
    if (!codeInput) {
        hintBadge.classList.add('hidden');
        return;
    }

    const numMatch = codeInput.match(/\d+/);
    if (!numMatch) {
        hintBadge.classList.add('hidden');
        return;
    }

    const currentNum = parseInt(numMatch[0], 10);
    const ranges = await loadCodeRanges();
    
    // Find matching range
    let targetRange = null;
    for (let r of ranges) {
        if (currentNum >= r.minCode && currentNum <= r.maxCode) {
            targetRange = r;
            break;
        }
    }

    if (!targetRange) {
        hintBadge.classList.add('hidden');
        return;
    }

    // Find highest code in this range
    const allProducts = await db.products.toArray();
    let maxInRange = targetRange.minCode - 1; // start at one below minimum
    
    allProducts.forEach(p => {
        if (p.code) {
             const strCode = p.code.toString();
             const nMatch = strCode.match(/\d+/);
             if (nMatch) {
                 const n = parseInt(nMatch[0], 10);
                 if (!isNaN(n) && n >= targetRange.minCode && n <= targetRange.maxCode) {
                     if (n > maxInRange) {
                         maxInRange = n;
                     }
                 }
             }
        }
    });

    // Determine the next code prefix (e.g. HC-)
    const prefix = codeInput.substring(0, numMatch.index);
    let nextNumStr = (maxInRange + 1).toString();
    
    // Attempt zero padding matching
    if(numMatch[0].startsWith('0')) {
        nextNumStr = nextNumStr.padStart(numMatch[0].length, '0');
    }
    
    nextValEl.textContent = prefix + nextNumStr;
    hintBadge.classList.remove('hidden');
}

function closeProductModal(skipDraft = false) {
    const isAdding = !document.getElementById('prod-id').value;

    if (isAdding && skipDraft !== true) {
        // Save draft
        const sizeStock = {};
        const sizes = [];
        document.querySelectorAll('#size-stock-rows > div').forEach(row => {
            const color = row.querySelector('.size-color-input').value.trim();
            const name = row.querySelector('.size-name-input').value.trim();
            const qty = parseInt(row.querySelector('.size-qty-input').value) || 0;
            if (name) {
                const variantName = color ? `${color} - ${name}` : name;
                sizeStock[variantName] = qty;
                sizes.push(variantName);
            }
        });

        const currentName = document.getElementById('prod-name').value;
        const currentCode = document.getElementById('prod-code').value;
        const currentBarcode = document.getElementById('prod-barcode').value;

        if (currentName || currentCode || currentBarcode || sizes.length > 0) {
            productDraft = {
                name: currentName,
                code: currentCode,
                barcode: currentBarcode,
                category: document.getElementById('prod-category').value,
                color: document.getElementById('prod-color').value,
                internalDesc: document.getElementById('prod-internal-desc').value,
                price: document.getElementById('prod-price').value,
                discount: document.getElementById('prod-discount').value,
                sizeStock: sizeStock
            };
        } else {
            productDraft = null;
        }
    }

    document.getElementById('modal-product').classList.add('hidden');
}

async function handleProductSubmit(e) {
    e.preventDefault();
    const id = document.getElementById('prod-id').value;
    // Collect Size Stock
    const sizeStock = {};
    const sizes = [];
    document.querySelectorAll('#size-stock-rows > div').forEach(row => {
        const color = row.querySelector('.size-color-input').value.trim();
        const name = row.querySelector('.size-name-input').value.trim();
        const qty = parseInt(row.querySelector('.size-qty-input').value) || 0;
        if (name) {
            const variantName = color ? `${color} - ${name}` : name;
            sizeStock[variantName] = qty;
            sizes.push(variantName);
        }
    });

    const data = {
        name: document.getElementById('prod-name').value,
        code: document.getElementById('prod-code').value.trim(),
        barcode: document.getElementById('prod-barcode').value,
        category: document.getElementById('prod-category').value,
        color: document.getElementById('prod-color').value,
        internalDesc: document.getElementById('prod-internal-desc').value.trim(),
        price: parseFloat(document.getElementById('prod-price').value),
        discount: parseFloat(document.getElementById('prod-discount').value),
        stock: parseInt(document.getElementById('prod-stock').value),
        sizes: sizes,
        sizeStock: sizeStock
    };

    if (id) {
        await db.products.update(id, data);
    } else {
        await db.products.add(data);
        productDraft = null; // Clear draft on successful Add
    }

    closeProductModal(true);
    loadInventory();
}

async function editProduct(id) {
    openProductModal(id);
}

async function deleteProduct(id) {
    if (confirm('Are you sure you want to delete this product?')) {
        await db.products.delete(id);
        loadInventory();
    }
}


// --- PRODUCT MODAL HELPERS ---
function addSizeStockRow(size = '', qty = 0, color = '') {
    const container = document.getElementById('size-stock-rows');
    const row = document.createElement('div');
    row.className = 'flex items-center gap-2 animate-[fadeIn_0.2s_ease-out]';
    row.innerHTML = `
        <input type="text" placeholder="Color" value="${color}"
            class="w-20 lg:w-28 p-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-brand-gold font-medium size-color-input">
        <input type="text" placeholder="Size (e.g. S, XL)" value="${size}" required
            class="flex-1 p-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-brand-gold font-medium size-name-input">
        <input type="number" placeholder="Qty" value="${qty}" required min="0" oninput="calculateTotalStock()"
            class="w-20 p-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-brand-gold text-right font-bold size-qty-input">
        <button type="button" onclick="this.parentElement.remove(); calculateTotalStock();" 
            class="w-9 h-9 flex items-center justify-center text-red-400 hover:bg-red-50 rounded-lg transition-colors">
            <i class="fa-solid fa-times"></i>
        </button>
    `;
    container.appendChild(row);
    calculateTotalStock();
}

function calculateTotalStock() {
    const qtyInputs = document.querySelectorAll('.size-qty-input');
    let total = 0;
    qtyInputs.forEach(input => {
        total += parseInt(input.value) || 0;
    });
    document.getElementById('prod-stock').value = total;
}

// --- POS ---
async function loadPosProducts(category) {
    let products;
    if (category === 'All') {
        products = await db.products.toArray();
    } else {
        products = await db.products.where('category').equals(category).toArray();
    }
    const ranges = await loadCodeRanges();
    renderPosGrid(products, ranges);
}

function filterPosCategory(cat) {
    loadPosProducts(cat);
}

async function filterPosSearch(query) {
    const products = await db.products.filter(p => p.name.toLowerCase().includes(query.toLowerCase()) || (p.code && p.code.toLowerCase().includes(query.toLowerCase())))
        .toArray();
    const ranges = await loadCodeRanges();
    renderPosGrid(products, ranges);
}

function renderPosGrid(products, ranges = []) {
    const grid = document.getElementById('pos-product-grid');
    grid.innerHTML = '';

    // Grouping
    const grouped = {};

    // Add Custom Item Card at the very top
    const customHeader = document.createElement('div');
    customHeader.className = `col-span-full font-bold text-gray-700 text-lg flex items-center mt-2 mb-2 border-b border-gray-200 pb-2`;
    customHeader.innerHTML = `<i class="fa-solid fa-bolt text-brand-gold mr-3"></i> Quick Add <span class="text-sm font-normal text-gray-400 ml-3 bg-gray-100 px-2 py-0.5 rounded-full">Custom</span>`;
    grid.appendChild(customHeader);

    const customEl = document.createElement('div');
    customEl.className = `bg-brand-gold/10 border-2 border-brand-gold border-dashed p-4 rounded-xl shadow-sm hover:shadow-md hover:bg-brand-gold/20 transition-all cursor-pointer flex flex-col items-center justify-center text-center min-h-[120px]`;
    customEl.onclick = () => openCustomItemModal();
    customEl.innerHTML = `
        <div class="w-10 h-10 rounded-full bg-brand-gold text-brand-dark flex items-center justify-center text-xl mb-2">
            <i class="fa-solid fa-plus"></i>
        </div>
        <div class="font-bold text-brand-dark">New Custom Item</div>
        <div class="text-xs text-gray-600 mt-1">Add ad-hoc product to bill</div>
    `;
    grid.appendChild(customEl);

    if (products.length === 0) {
        const noProd = document.createElement('div');
        noProd.className = "col-span-full text-center py-10 text-gray-400";
        noProd.innerHTML = "No products found in inventory";
        grid.appendChild(noProd);
        return;
    }
    
    products.forEach(p => {
        const rangeName = getProductRangeName(p.code, ranges);
        if(!grouped[rangeName]) grouped[rangeName] = [];
        grouped[rangeName].push(p);
    });

    const sortedGroupNames = Object.keys(grouped).sort((a,b) => {
        if(a === "Uncategorized" || a === "Other Codes") return 1;
        if(b === "Uncategorized" || b === "Other Codes") return -1;
        const rangeA = ranges.find(r => r.name === a);
        const rangeB = ranges.find(r => r.name === b);
        if (rangeA && rangeB) {
            return rangeA.minCode - rangeB.minCode;
        }
        return a.localeCompare(b);
    });

    sortedGroupNames.forEach((groupName, idx) => {
        // Group Header (spans full width)
        const header = document.createElement('div');
        header.className = `col-span-full font-bold text-gray-700 text-lg flex items-center mt-6 mb-2 border-b border-gray-200 pb-2`;
        header.innerHTML = `<i class="fa-solid fa-layer-group text-brand-gold mr-3"></i> ${groupName} <span class="text-sm font-normal text-gray-400 ml-3 bg-gray-100 px-2 py-0.5 rounded-full">${grouped[groupName].length} items</span>`;
        grid.appendChild(header);

        let groupProducts = grouped[groupName];
        groupProducts.sort((a, b) => {
            const codeA = a.code ? parseInt(a.code.toString().replace(/\D/g, '')) : 0;
            const codeB = b.code ? parseInt(b.code.toString().replace(/\D/g, '')) : 0;
            const finalA = isNaN(codeA) ? 0 : codeA;
            const finalB = isNaN(codeB) ? 0 : codeB;
            return finalA - finalB;
        });

        groupProducts.forEach(p => {
            const el = document.createElement('div');
            el.className = `bg-white p-4 rounded-xl shadow-sm border border-gray-100 hover:shadow-md transition-all cursor-pointer ${p.stock <= 0 ? 'opacity-50 grayscale' : ''}`;
            el.onclick = () => { if (p.stock > 0) addToCart(p); };

            el.innerHTML = `
                <div class="flex justify-between items-start mb-1">
                    <div class="flex-1 min-w-0">
                        ${p.code
                    ? `<div class="text-xl font-black text-brand-dark tracking-wide leading-tight">${p.code}</div>`
                    : `<div class="text-sm font-bold text-gray-400 italic">No Code</div>`
                }
                        <div class="text-xs text-gray-500 mt-0.5 line-clamp-1">${p.name}</div>
                    </div>
                    <span class="text-xs font-bold ml-2 shrink-0 ${p.stock > 0 ? 'text-green-600' : 'text-red-500'}">${p.stock} pcs</span>
                </div>
                <p class="text-xs text-gray-400 mb-2 truncate">${p.color} ${p.internalDesc ? `<span class="bg-yellow-100 text-yellow-800 text-[10px] px-1 ml-1 rounded font-medium" title="Internal Description">${p.internalDesc}</span>` : ''}</p>
                <div class="flex justify-between items-end">
                    <div>
                       ${p.discount > 0 ? `<span class="text-xs text-red-400 line-through block">Rs ${p.price}</span>` : ''}
                       <span class="text-base font-bold text-brand-dark">Rs ${p.price - p.discount}</span>
                    </div>
                    <button class="w-8 h-8 rounded-full bg-brand-gold text-brand-dark flex items-center justify-center hover:bg-yellow-500">
                        <i class="fa-solid fa-plus"></i>
                    </button>
                </div>
            `;
            grid.appendChild(el);
        });
    });
}

function openCustomItemModal() {
    document.getElementById('modal-custom-item').classList.remove('hidden');
    document.getElementById('custom-item-form').reset();
    document.getElementById('ci-name').focus();
}

function closeCustomItemModal() {
    document.getElementById('modal-custom-item').classList.add('hidden');
}

function handleCustomItemAdd(e) {
    e.preventDefault();
    const name = document.getElementById('ci-name').value.trim();
    const size = document.getElementById('ci-size').value.trim();
    const price = parseFloat(document.getElementById('ci-price').value) || 0;
    const qty = parseInt(document.getElementById('ci-qty').value) || 1;

    if (!name || price < 0 || qty < 1) return;

    const customId = `CUSTOM_${Date.now()}`;
    
    cart.push({
        id: customId,
        name: name,
        price: price,
        qty: qty,
        size: size,
        color: '',
        discount: 0,
        cartDiscount: 0,
        stock: 99999,
        isCustom: true,
        barcode: 'CUSTOM'
    });

    closeCustomItemModal();
    updateCartUI();
}


function openItemDiscountModal(product) {
    const modal = document.getElementById('modal-item-discount');
    document.getElementById('item-discount-name').textContent = product.name;
    document.getElementById('item-discount-base').textContent = `Rs ${product.price}`;
    document.getElementById('item-extra-discount').value = product.discount || 0;

    // We need to parse sizeStock into a Color -> [Sizes] mapping
    const colorSelect = document.getElementById('item-color-select');
    const colorError = document.getElementById('color-error');
    const colorContainer = document.getElementById('item-color-container');
    colorSelect.innerHTML = '';
    colorError.classList.add('hidden');

    const sizeSelect = document.getElementById('item-size-select');
    const sizeError = document.getElementById('size-error');
    const sizeContainer = document.getElementById('item-size-container');
    sizeSelect.innerHTML = '';
    sizeError.classList.add('hidden');

    modal._colorSizeMap = {};
    let allColors = new Set();

    if (product.sizeStock && Object.keys(product.sizeStock).length > 0) {
        Object.keys(product.sizeStock).forEach(variant => {
            let c = '';
            let s = variant;
            if (variant.includes(' - ')) {
                const parts = variant.split(' - ');
                c = parts[0];
                s = parts.slice(1).join(' - ');
            }
            if (c) allColors.add(c);
            if (!c) c = 'Default'; // or Empty string handling

            if (!modal._colorSizeMap[c]) modal._colorSizeMap[c] = [];
            modal._colorSizeMap[c].push({ size: s, qty: product.sizeStock[variant] });
        });
    } else if (product.sizes && product.sizes.length > 0) {
        modal._colorSizeMap['Default'] = product.sizes.map(s => ({ size: s, qty: 0 }));
    }

    // Add standalone colors from product.color if they aren't in sizeStock
    if (product.color) {
        product.color.split(',').map(c => c.trim()).filter(Boolean).forEach(c => {
            allColors.add(c);
            if (!modal._colorSizeMap[c] && !modal._colorSizeMap['Default']) {
                modal._colorSizeMap[c] = []; // Has color but no specific size
            }
        });
    }

    const colorKeys = Array.from(allColors);
    const hasRealColors = colorKeys.length > 0 && !(colorKeys.length === 1 && colorKeys[0] === 'Default');

    if (hasRealColors) {
        const defaultOpt = document.createElement('option');
        defaultOpt.value = "";
        defaultOpt.text = "Select Color...";
        defaultOpt.disabled = true;
        defaultOpt.selected = true;
        colorSelect.appendChild(defaultOpt);

        colorKeys.forEach(c => {
            if (c === 'Default') return; // Skip Default if they have other colors, or label it
            const opt = document.createElement('option');
            opt.value = c;
            opt.text = c;
            colorSelect.appendChild(opt);
        });
        colorContainer.classList.remove('hidden');
        modal._requiresColor = true;

        // Hide sizes until color is selected
        sizeContainer.classList.add('hidden');
        modal._requiresSize = false;

    } else {
        colorContainer.classList.add('hidden');
        modal._requiresColor = false;

        // If no colors but we have default sizes
        if (modal._colorSizeMap['Default'] && modal._colorSizeMap['Default'].length > 0) {
            updatePosSizeOptions('Default', product);
        } else {
            sizeContainer.classList.add('hidden');
            modal._requiresSize = false;
        }
    }

    modal.classList.remove('hidden');
    // Store pending product
    modal._pendingProduct = product;

    // Reset Discount Type
    document.getElementById('discount-type-amount').checked = true;
    toggleDiscountType();
    document.getElementById('item-extra-discount').value = product.discount || 0;

    // Focus appropriate input
    if (modal._requiresColor) {
        setTimeout(() => colorSelect.focus(), 100);
    } else if (modal._requiresSize) {
        setTimeout(() => sizeSelect.focus(), 100);
    } else {
        setTimeout(() => document.getElementById('item-extra-discount').focus(), 100);
    }
}

function updatePosSizeOptions(forceColor = null, productContext = null) {
    const modal = document.getElementById('modal-item-discount');
    const colorSelect = document.getElementById('item-color-select');
    const sizeContainer = document.getElementById('item-size-container');
    const sizeSelect = document.getElementById('item-size-select');
    const color = forceColor || colorSelect.value;

    sizeSelect.innerHTML = '';

    // If user changed back to "Select Color..."
    if (!color && !forceColor) {
        sizeContainer.classList.add('hidden');
        modal._requiresSize = false;
        return;
    }

    const sizeData = modal._colorSizeMap[color];

    if (sizeData && sizeData.length > 0) {
        const defaultOpt = document.createElement('option');
        defaultOpt.value = "";
        defaultOpt.text = "Select Size...";
        defaultOpt.disabled = true;
        defaultOpt.selected = true;
        sizeSelect.appendChild(defaultOpt);

        sizeData.forEach(item => {
            const opt = document.createElement('option');
            opt.value = item.size;
            opt.text = `${item.size} (${item.qty} available)`;
            if (item.qty <= 0) opt.disabled = true;
            sizeSelect.appendChild(opt);
        });
        sizeContainer.classList.remove('hidden');
        modal._requiresSize = true;
    } else {
        const opt = document.createElement('option');
        opt.value = "";
        opt.text = "No Size / Default";
        sizeSelect.appendChild(opt);
        sizeContainer.classList.add('hidden');
        modal._requiresSize = false;
    }
}

function toggleDiscountType() {
    const isPercent = document.getElementById('discount-type-percent').checked;
    const symbol = document.getElementById('discount-symbol');
    const input = document.getElementById('item-extra-discount');

    if (isPercent) {
        symbol.textContent = '%';
        input.placeholder = '0-100';
    } else {
        symbol.textContent = 'Rs';
        input.placeholder = '0';
    }
}

function closeItemDiscountModal() {
    document.getElementById('modal-item-discount').classList.add('hidden');
}

function confirmItemDiscount() {
    const modal = document.getElementById('modal-item-discount');
    const product = modal._pendingProduct;
    if (!product) return;

    // Validate Size
    const sizeSelect = document.getElementById('item-size-select');
    const selectedSize = sizeSelect.value;
    const productPrice = product.price;

    if (modal._requiresSize && !selectedSize) {
        document.getElementById('size-error').classList.remove('hidden');
        sizeSelect.classList.add('border-red-500');
        return;
    } else {
        document.getElementById('size-error').classList.add('hidden');
        sizeSelect.classList.remove('border-red-500');
    }

    // Validate Color
    const colorSelect = document.getElementById('item-color-select');
    const selectedColor = colorSelect.value;

    if (modal._requiresColor && !selectedColor) {
        document.getElementById('color-error').classList.remove('hidden');
        colorSelect.classList.add('border-red-500');
        return;
    } else {
        document.getElementById('color-error').classList.add('hidden');
        colorSelect.classList.remove('border-red-500');
    }

    // Calculate Discount
    const discountInput = parseFloat(document.getElementById('item-extra-discount').value) || 0;
    const isPercentage = document.getElementById('discount-type-percent').checked;

    let appliedDiscount = 0;
    if (isPercentage) {
        if (discountInput > 100 || discountInput < 0) {
            alert('Invalid percentage!');
            return;
        }
        appliedDiscount = Math.round((productPrice * discountInput) / 100);
    } else {
        appliedDiscount = discountInput;
    }

    if (appliedDiscount < 0 || appliedDiscount > productPrice) {
        alert('Invalid discount amount (cannot exceed price)!');
        return;
    }

    const activeCart = currentView === 'floor-sales' ? floorCart : cart;

    // Add unique entry based on ID AND Size AND Color
    const existingIndex = activeCart.findIndex(item => item.id === product.id && item.size === selectedSize && item.color === selectedColor);

    let variantKey = selectedColor && selectedSize ? `${selectedColor} - ${selectedSize}` : (selectedSize || selectedColor || '');
    if (!variantKey && product.sizeStock && Object.keys(product.sizeStock).length > 0) {
        // Fallback for tricky scenarios
        variantKey = Object.keys(product.sizeStock)[0];
    }

    const availableStock = product.sizeStock && variantKey && product.sizeStock[variantKey] !== undefined ? product.sizeStock[variantKey] : product.stock;

    if (existingIndex > -1) {
        const existing = activeCart[existingIndex];
        if (existing.qty >= availableStock) {
            alert(`Out of stock! Only ${availableStock} available for variant.`);
            return;
        }
        existing.qty++;
        // Update to new discount if user changed it
        existing.cartDiscount = appliedDiscount;
    } else {
        if (availableStock <= 0) {
            alert('Out of stock for this variant!');
            return;
        }
        activeCart.push({
            ...product,
            qty: 1,
            cartDiscount: appliedDiscount,
            size: selectedSize || '',
            color: selectedColor || product.color || '',
            displayStock: availableStock
        });
    }

    closeItemDiscountModal();
    updateCartUI();
}

// Modify addToCart to check if simple add is possible (no sizes, no discount needed default?)
// But user wants discount option always. So keep opening modal.
// However, the original addToCart logic had a check for existing item.
// Let's remove that check from addToCart and let confirmItemDiscount handle it,
// OR keep addToCart logic only for simple re-clicks on grid?
// User flow: Click grid -> Modal -> Confirm.
// If user clicks ALREADY added item on grid -> Modal again? Yes, maybe they want another size or change discount.
// So addToCart just opens modal always.

function addToCart(product) {
    if (product.stock <= 0) {
        alert("Out of stock!");
        return;
    }
    openItemDiscountModal(product);
}

function removeFromCart(index) {
    if (currentView === 'floor-sales') {
        floorCart.splice(index, 1);
    } else {
        cart.splice(index, 1);
    }
    updateCartUI();
}

function updateCartQty(index, change) {
    const activeCart = currentView === 'floor-sales' ? floorCart : cart;
    const item = activeCart[index];
    if (!item) return;

    const newQty = item.qty + change;
    const availableStock = item.isCustom ? 99999 : (item.sizeStock && item.size ? (item.sizeStock[item.size] || 0) : item.stock);

    if (newQty > availableStock && !item.isCustom) {
        alert(`Max stock reached! Only ${availableStock} available.`);
        return;
    }
    if (newQty <= 0) {
        removeFromCart(index);
        return;
    }

    item.qty = newQty;
    updateCartUI();
}

function updateCartUI() {
    const container = document.getElementById('pos-cart-items');
    container.innerHTML = '';

    let subtotal = 0;
    let itemsDiscountTotal = 0;

    cart.forEach((item, index) => {
        const itemPrice = item.price; // Original price
        const itemDiscount = item.cartDiscount !== undefined ? item.cartDiscount : (item.discount || 0);
        const itemTotal = (itemPrice - itemDiscount) * item.qty;

        subtotal += itemPrice * item.qty;
        itemsDiscountTotal += itemDiscount * item.qty;

        const extraDiscTag = itemDiscount > 0
            ? `<span class="text-green-600 text-xs ml-1">(-Rs ${itemDiscount})</span>`
            : '';

        const sizeTag = item.size ? `<span class="px-1.5 py-0.5 rounded bg-gray-200 text-xs font-bold text-gray-700 ml-1">${item.size}</span>` : '';

        const div = document.createElement('div');
        div.className = 'flex items-center gap-3 bg-gray-50 p-3 rounded-xl border border-gray-100';
        div.innerHTML = `
            <div class="flex-1">
                <h5 class="font-bold text-sm text-gray-800">${item.name} (${item.color})${sizeTag}</h5>
                <p class="text-xs text-gray-500">Rs ${itemPrice - itemDiscount} x ${item.qty}${extraDiscTag}</p>
            </div>
            <div class="font-bold text-sm mr-2">Rs ${itemTotal.toLocaleString()}</div>
            <div class="flex flex-col gap-1">
                <button onclick="updateCartQty(${index}, 1)" class="w-6 h-6 rounded bg-white border border-gray-200 text-xs hover:bg-gray-100">+</button>
                <button onclick="updateCartQty(${index}, -1)" class="w-6 h-6 rounded bg-white border border-gray-200 text-xs hover:bg-gray-100">-</button>
            </div>
        `;
        container.appendChild(div);
    });

    if (cart.length === 0) {
        container.innerHTML = '<div class="text-center text-gray-400 mt-10">Cart is empty</div>';
    }

    const specialDiscountEl = document.getElementById('cart-special-discount');
    const specialDiscount = specialDiscountEl ? (parseFloat(specialDiscountEl.value) || 0) : 0;
    
    const totalDiscount = itemsDiscountTotal + specialDiscount;
    const netTotal = subtotal - totalDiscount - appliedReturnCredit;

    const cartTotalStr = `Rs ${Math.max(0, netTotal).toLocaleString()}.00`;
    if (currentView !== 'floor-sales') {
        document.getElementById('cart-subtotal').textContent = `Rs ${subtotal.toLocaleString()}.00`;
        document.getElementById('cart-discount').textContent = `- Rs ${itemsDiscountTotal.toLocaleString()}.00`;
        document.getElementById('cart-total').textContent = cartTotalStr;
    }

    // Update Floor Sales UI if it exists
    const floorContainer = document.getElementById('floor-cart-items');
    if (floorContainer) {
        floorContainer.innerHTML = '';
        floorCart.forEach((item, index) => {
            const itemPrice = item.price;
            const itemDiscount = item.cartDiscount !== undefined ? item.cartDiscount : (item.discount || 0);
            const itemTotal = (itemPrice - itemDiscount) * item.qty;
            const div = document.createElement('div');
            div.className = 'flex items-center gap-3 bg-white p-3 rounded-xl border border-gray-100 shadow-sm';
            div.innerHTML = `
                <div class="flex-1">
                    <h5 class="font-bold text-sm text-gray-800">${item.name}</h5>
                    <p class="text-xs text-gray-500">Rs ${itemPrice - itemDiscount} x ${item.qty}</p>
                </div>
                <div class="font-bold text-sm mr-2 text-blue-600">Rs ${itemTotal.toLocaleString()}</div>
                <div class="flex flex-col gap-1">
                    <button onclick="updateCartQty(${index}, 1)" class="w-7 h-7 rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-100 transition-colors">
                        <i class="fa-solid fa-plus text-[10px]"></i>
                    </button>
                    <button onclick="updateCartQty(${index}, -1)" class="w-7 h-7 rounded-lg bg-red-50 text-red-500 hover:bg-red-100 transition-colors">
                        <i class="fa-solid fa-minus text-[10px]"></i>
                    </button>
                </div>
            `;
            floorContainer.appendChild(div);
        });
        if (floorCart.length === 0) {
           floorContainer.innerHTML = '<div class="text-center text-gray-400 mt-10 p-6 border-2 border-dashed border-gray-100 rounded-3xl">Scan products to start</div>';
        }
        const floorTotalVal = floorCart.reduce((sum, item) => sum + ((item.price - (item.cartDiscount || item.discount || 0)) * item.qty), 0);
        const floorTotalEl = document.getElementById('floor-total');
        if (floorTotalEl) floorTotalEl.textContent = `Rs ${floorTotalVal.toLocaleString()}.00`;
    }

    // Show/Hide Return Info
    const returnInfo = document.getElementById('applied-return-info');
    const returnInputGroup = document.getElementById('return-apply-input-group');
    if (appliedReturnCredit > 0) {
        returnInfo.classList.remove('hidden');
        returnInputGroup.classList.add('hidden');
        document.getElementById('applied-return-no').textContent = appliedReturnNo;
        document.getElementById('applied-return-amt').textContent = `Rs ${appliedReturnCredit.toLocaleString()}.00`;
    } else {
        returnInfo.classList.add('hidden');
        returnInputGroup.classList.remove('hidden');
        document.getElementById('cart-return-id').value = '';
    }

    // Update Checkout Modal Total
    document.getElementById('checkout-total').textContent = `Rs ${Math.max(0, netTotal).toLocaleString()}.00`;
    document.getElementById('checkout-count').textContent = cart.reduce((a, b) => a + b.qty, 0);

    // Update Balance if cash was entered
    calculateBalance('cart');
}

async function applyReturnCredit() {
    const input = document.getElementById('cart-return-id').value.trim().toUpperCase();
    if (!input) return;

    try {
        const ret = await db.returns.where('returnNumber').equals(input).first();
        if (!ret) {
            alert("Return Bill No not found!");
            return;
        }
        if (ret.isUsed) {
            alert("This Return Bill has already been used for an exchange!");
            return;
        }

        appliedReturnCredit = ret.refundAmount;
        appliedReturnNo = ret.returnNumber;
        updateCartUI();
        alert(`Success! Rs ${appliedReturnCredit.toLocaleString()} credit applied to cart.`);
    } catch (e) {
        console.error(e);
        alert("Error applying credit.");
    }
}

function removeReturnCredit() {
    appliedReturnCredit = 0;
    appliedReturnNo = '';
    updateCartUI();
}

function clearCart() {
    if (cart.length === 0) return;
    if (confirm("Clear all items from cart?")) {
        cart = [];
        const specialDiscEl = document.getElementById('cart-special-discount');
        if(specialDiscEl) specialDiscEl.value = '0';
        updateCartUI();
    }
}

function calculateBalance(source) {
    const totalText = document.getElementById('cart-total').textContent;
    const total = parseFloat(totalText.replace(/[^\d.]/g, '')) || 0;

    const cartCashInput = document.getElementById('cart-cash-received');
    const checkoutCashInput = document.getElementById('checkout-cash-received');
    const cartBalanceEl = document.getElementById('cart-balance');
    const checkoutBalanceEl = document.getElementById('checkout-balance');

    let cashReceived = 0;

    if (source === 'cart') {
        cashReceived = parseFloat(cartCashInput.value) || 0;
        checkoutCashInput.value = cartCashInput.value;
    } else {
        cashReceived = parseFloat(checkoutCashInput.value) || 0;
        cartCashInput.value = checkoutCashInput.value;
    }

    const balance = (cashReceived + appliedReturnCredit) - total;

    const balanceText = `Rs ${Math.max(0, balance).toLocaleString()}.00`;
    cartBalanceEl.textContent = balanceText;
    checkoutBalanceEl.textContent = Math.max(0, balance).toLocaleString() + ".00";

    if (balance < 0 && cashReceived > 0) {
        checkoutBalanceEl.classList.add('text-red-600');
        checkoutBalanceEl.classList.remove('text-brand-dark');
    } else {
        checkoutBalanceEl.classList.remove('text-red-600');
        checkoutBalanceEl.classList.add('text-brand-dark');
    }
}

function openCheckoutModal() {
    if (cart.length === 0) {
        alert("Cart is empty!");
        return;
    }
    document.getElementById('modal-checkout').classList.remove('hidden');
    // Reset fields
    document.getElementById('cust-msg').classList.add('hidden');
    document.getElementById('cust-msg').textContent = '';

    // Reset order type to instore
    setOrderType('instore');

    // Reset online fields
    document.getElementById('online-address').value = '';
    document.getElementById('online-courier').value = '0';
    document.getElementById('online-extra').value = '0';
    document.getElementById('online-extra-label').value = '';
    const paymentSelect = document.getElementById('online-payment-method');
    if (paymentSelect) paymentSelect.value = 'cod';
    updateOnlineTotal();

    // Sync cash received
    const cartCash = document.getElementById('cart-cash-received').value;
    document.getElementById('checkout-cash-received').value = cartCash;
    calculateBalance('checkout');
}

function setOrderType(type) {
    currentOrderType = type;
    const instoreBtn = document.getElementById('btn-order-instore');
    const onlineBtn = document.getElementById('btn-order-online');
    const onlineFields = document.getElementById('online-fields');

    if (type === 'online') {
        instoreBtn.className = 'py-2.5 rounded-xl border-2 border-gray-200 bg-white text-gray-500 font-bold text-sm flex items-center justify-center gap-2 transition-all hover:border-brand-dark';
        onlineBtn.className = 'py-2.5 rounded-xl border-2 border-blue-600 bg-blue-600 text-white font-bold text-sm flex items-center justify-center gap-2 transition-all';
        onlineFields.classList.remove('hidden');
    } else {
        instoreBtn.className = 'py-2.5 rounded-xl border-2 border-brand-dark bg-brand-dark text-white font-bold text-sm flex items-center justify-center gap-2 transition-all';
        onlineBtn.className = 'py-2.5 rounded-xl border-2 border-gray-200 bg-white text-gray-500 font-bold text-sm flex items-center justify-center gap-2 transition-all hover:border-blue-400';
        onlineFields.classList.add('hidden');
    }
    updateOnlineTotal();
}

function updateOnlineTotal() {
    const totalText = document.getElementById('cart-total').textContent;
    const base = parseFloat(totalText.replace(/[^\d.]/g, '')) || 0;
    const courier = parseFloat(document.getElementById('online-courier')?.value) || 0;
    const extra = parseFloat(document.getElementById('online-extra')?.value) || 0;
    const grand = base + courier + extra;
    const el = document.getElementById('online-grand-total');
    if (el) el.textContent = `Rs ${grand.toLocaleString()}.00`;
}

function closeCheckoutModal() {
    document.getElementById('modal-checkout').classList.add('hidden');
}

async function processCheckout(mode) {
    const form = document.getElementById('checkout-form');
    if (!form.checkValidity()) {
        form.reportValidity();
        return;
    }

    const customerName = document.getElementById('cust-name').value;
    const customerMobile = document.getElementById('cust-mobile').value;

    if (mode === 'whatsapp' && (!customerMobile || customerMobile.length < 9)) {
        alert("Valid mobile number required for WhatsApp bill!");
        return;
    }

    // Save Customer (Check if exists first to avoid dupes)
    const existingCust = await db.customers.where('mobile').equals(customerMobile).first();
    if (existingCust) {
        await db.customers.update(existingCust.id, { name: customerName });
    } else {
        await db.customers.add({ name: customerName, mobile: customerMobile });
    }

    // Calculate Prefix
    const isElegant = cart.every(i => i.category === 'Hesa Elegant');
    const isCasual = cart.every(i => i.category === 'Hesa Casual');
    let prefix = 'HES-';
    if (isElegant) prefix = 'HCE-';
    if (isCasual) prefix = 'HCC-';

    // Get Next Invoice Number (Naive: Count + 1000)
    const count = await db.sales.count();
    const invoiceNumber = 1000 + count + 1;

    // Prepare Sale Record
    const specialDiscount = parseFloat(document.getElementById('cart-special-discount')?.value) || 0;
    const netTotal = cart.reduce((sum, item) => {
        const totalDisc = item.cartDiscount !== undefined ? item.cartDiscount : (item.discount || 0);
        return sum + ((item.price - totalDisc) * item.qty);
    }, 0) - specialDiscount;

    const cashReceived = parseFloat(document.getElementById('checkout-cash-received').value) || 0;
    const balance = (cashReceived + appliedReturnCredit) - netTotal;

    // Online-specific fields
    const isOnline = currentOrderType === 'online';
    const deliveryAddress = isOnline ? (document.getElementById('online-address').value.trim() || '') : '';
    const courierCharges = isOnline ? (parseFloat(document.getElementById('online-courier').value) || 0) : 0;
    const extraCharges = isOnline ? (parseFloat(document.getElementById('online-extra').value) || 0) : 0;
    const extraChargesLabel = isOnline ? (document.getElementById('online-extra-label').value.trim() || 'Extra Charges') : '';
    const paymentMethod = isOnline ? (document.getElementById('online-payment-method').value) : 'cod';
    const grandTotal = Math.max(0, netTotal - appliedReturnCredit) + courierCharges + extraCharges;

    const sale = {
        invoicePrefix: prefix,
        invoiceNumber: invoiceNumber,
        customerMobile: customerMobile,
        customerName: customerName,
        orderType: currentOrderType,
        deliveryAddress: deliveryAddress,
        courierCharges: courierCharges,
        extraCharges: extraCharges,
        extraChargesLabel: extraChargesLabel,
        paymentMethod: paymentMethod,
        grandTotal: grandTotal,
        specialDiscount: specialDiscount,
        items: cart.map(i => ({
            id: i.id,
            name: i.name,
            color: i.color,
            barcode: i.barcode, // Important for returns
            qty: i.qty,
            size: i.size || '',
            price: i.price,
            discount: i.cartDiscount !== undefined ? i.cartDiscount : (i.discount || 0),
            isCustom: !!i.isCustom
        })),
        returnCredit: appliedReturnCredit,
        returnBillNo: appliedReturnNo,
        total: Math.max(0, netTotal - appliedReturnCredit),
        cashReceived: cashReceived,
        balance: balance,
        timestamp: new Date().toISOString()
    };

    // Transaction
    await db.transaction('rw', db.products, db.sales, async () => {
        // Add Sale
        const saleId = await db.sales.add(sale);

        // Update Return as used if applicable
        if (appliedReturnNo) {
            const ret = await db.returns.where('returnNumber').equals(appliedReturnNo).first();
            if (ret) {
                await db.returns.update(ret.id, { 
                    isUsed: true, 
                    exchangeInvoiceNumber: `${prefix}${invoiceNumber}` 
                });
            }
        }

        // Update Stock
        for (const item of cart) {
            if (item.isCustom) continue;
            const product = await db.products.get(item.id);
            if (product) {
                const newTotalStock = Math.max(0, product.stock - item.qty);
                const newSizeStock = product.sizeStock ? { ...product.sizeStock } : null;

                if (newSizeStock && item.size && newSizeStock[item.size] !== undefined) {
                    newSizeStock[item.size] = Math.max(0, newSizeStock[item.size] - item.qty);
                }

                await db.products.update(item.id, {
                    stock: newTotalStock,
                    sizeStock: newSizeStock
                });
            }
        }
    });

    // Common Reset
    cart = [];
    appliedReturnCredit = 0;
    appliedReturnNo = '';
    const specialDiscEl = document.getElementById('cart-special-discount');
    if(specialDiscEl) specialDiscEl.value = '0';
    updateCartUI();
    closeCheckoutModal();
    document.getElementById('cust-name').value = '';
    document.getElementById('cust-mobile').value = '';
    document.getElementById('cart-cash-received').value = '';
    document.getElementById('checkout-cash-received').value = '';
    document.getElementById('cart-balance').textContent = 'Rs 0.00';
    document.getElementById('checkout-balance').textContent = '0.00';

    // Refresh Product Grid
    loadPosProducts('All');

    // Store last sale
    lastSaleForDownload = { sale, custName: customerName };
    document.getElementById('btn-pos-download-last').classList.remove('hidden');

    // Check Mode
    if (mode === 'print') {
        generateBillPDF(sale, customerName);
        // Also show whatsapp option? User asked for them to be selective. 
        // "payment eka cart eke thiyeddima penna one" -> implies choice.
    } else if (mode === 'whatsapp') {
        if (customerMobile && customerMobile.trim().length >= 9) {
            showWhatsAppBillOption(sale, customerName, customerMobile);
        }
    }
}

function showWhatsAppBillOption(sale, custName, mobile) {
    // Format bill as text message
    const itemLines = sale.items.map(i =>
        `• ${i.name} (${i.color}) ${i.size ? '[' + i.size + '] ' : ''}x${i.qty} = Rs ${((i.price - i.discount) * i.qty).toLocaleString()}`
    ).join('%0A');

    const invNo = `${sale.invoicePrefix}${sale.invoiceNumber}`;
    const date = new Date(sale.timestamp).toLocaleDateString('en-LK');

    const message =
        `🛍️ *HESA Collection - Invoice*%0A` +
        `━━━━━━━━━━━━━━━━%0A` +
        `📄 Invoice: ${invNo}%0A` +
        `📅 Date: ${date}%0A` +
        `👤 Customer: ${custName}%0A` +
        `━━━━━━━━━━━━━━━━%0A` +
        `${itemLines}%0A` +
        `━━━━━━━━━━━━━━━━%0A` +
        (sale.specialDiscount > 0 ? `🎁 Special Discount: -Rs ${sale.specialDiscount.toLocaleString()}%0A━━━━━━━━━━━━━━━━%0A` : '') +
        (sale.returnCredit > 0 ? `🔄 Return Credit: -Rs ${sale.returnCredit.toLocaleString()}%0A━━━━━━━━━━━━━━━━%0A` : '') +
        `💰 *TOTAL: Rs ${sale.total.toLocaleString()}.00*%0A` +
        `💵 Paid: Rs ${sale.cashReceived?.toLocaleString() || '0.00'}%0A` +
        `🪙 Balance: Rs ${sale.balance?.toLocaleString() || '0.00'}%0A%0A` +
        `✅ Thank you for shopping with Hesa!%0A` +
        `🔄 Returns accepted within 7 days.%0A` +
        `📞 0760492705`;

    // Format phone: remove leading 0, add country code 94 for Sri Lanka
    let phone = mobile.replace(/\s+/g, '');
    if (phone.startsWith('0')) phone = '94' + phone.slice(1);

    const waUrl = `https://wa.me/${phone}?text=${message}`;

    // Show WhatsApp modal
    document.getElementById('wa-phone-display').textContent = mobile;
    document.getElementById('btn-open-whatsapp').onclick = () => window.open(waUrl, '_blank');

    document.getElementById('modal-whatsapp-send').classList.remove('hidden');
}

// Shared Helper to populate template (DRY)
function preparePrintTemplate(sale, custName) {
    const totalDiscount = sale.items.reduce((sum, i) => sum + ((i.discount || 0) * i.qty), 0);

    const itemsHtml = sale.items.map(i => {
        const unitPrice = i.price - (i.discount || 0); // Use stored discount
        const hasDiscount = (i.discount || 0) > 0;
        return `
        <tr style="border-bottom: 1px dashed #ccc;">
            <td style="padding: 5px 0;">${i.name} <span style="font-size: 10px; color: #666;">(${i.color})</span>
            ${i.code ? `<span style="font-size:12px;font-weight:bold;"> [${i.code}]</span>` : ''}
            ${i.size ? `<span style="font-weight:bold;font-size:11px;"> [${i.size}]</span>` : ''}
            ${hasDiscount ? `<br><span style="font-size:12px;color:#888;text-decoration:line-through;">Rs ${i.price.toLocaleString()}</span> <span style="font-size:13px;font-weight:bold;color:#e74c3c;">-Rs ${i.discount}</span> <span style="font-size:13px;font-weight:bold;">= Rs ${unitPrice.toLocaleString()}</span>` : ''}</td>
            <td style="text-align: center; padding: 5px 8px;">${i.qty}</td>
            <td style="text-align: right; padding: 5px 0;">${hasDiscount ? `<span style="font-size:11px;color:#888;text-decoration:line-through;">Rs ${(i.price * i.qty).toLocaleString()}</span><br>` : ''}Rs ${(unitPrice * i.qty).toLocaleString()}</td>
        </tr>
    `}).join('');

    const discountRow = totalDiscount > 0
        ? `<tr><td colspan="2" style="text-align:right;color:#e74c3c;font-size:14px;font-weight:bold;">Total Savings:</td><td style="text-align:right;color:#e74c3c;font-size:14px;font-weight:bold;">-Rs ${totalDiscount.toLocaleString()}</td></tr>`
        : '';

    const isOnline = sale.orderType === 'online';
    const finalTotal = isOnline
        ? (sale.grandTotal || sale.total + (sale.courierCharges || 0) + (sale.extraCharges || 0))
        : sale.total;

    document.getElementById('print-inv-no').textContent = `${sale.invoicePrefix}${sale.invoiceNumber}`;
    document.getElementById('print-date').textContent = new Date(sale.timestamp).toLocaleString();
    document.getElementById('print-cust').textContent = custName;
    document.getElementById('print-mobile').textContent = sale.customerMobile || '-';
    document.getElementById('print-items').innerHTML = itemsHtml + discountRow;
    document.getElementById('print-subtotal').textContent = `Rs ${(sale.total + (sale.specialDiscount || 0)).toLocaleString()}.00`;
    
    const specialDiscountRowEl = document.getElementById('print-special-discount-row');
    const specialDiscountEl = document.getElementById('print-special-discount');
    if (sale.specialDiscount > 0 && specialDiscountRowEl) {
        specialDiscountRowEl.style.display = 'flex';
        specialDiscountEl.textContent = `-Rs ${sale.specialDiscount.toLocaleString()}`;
    } else if (specialDiscountRowEl) {
        specialDiscountRowEl.style.display = 'none';
    }
    
    document.getElementById('print-total').textContent = `Rs ${finalTotal.toLocaleString()}.00`;
    
    // Return Credit
    const returnRow = document.getElementById('print-return-credit-row');
    const returnAmtEl = document.getElementById('print-return-credit');
    if (sale.returnCredit > 0 && returnRow) {
        returnRow.style.display = 'flex';
        returnAmtEl.textContent = `-Rs ${sale.returnCredit.toLocaleString()}`;
    } else if (returnRow) {
        returnRow.style.display = 'none';
    }

    document.getElementById('print-cash').textContent = `Rs ${sale.cashReceived?.toLocaleString() || '0.00'}`;
    document.getElementById('print-balance').textContent = `Rs ${sale.balance?.toLocaleString() || '0.00'}`;

    // Online badge & delivery section
    const badge = document.getElementById('print-online-badge');
    const deliverySection = document.getElementById('print-delivery-section');
    const courierRow = document.getElementById('print-courier-row');
    const extraRow = document.getElementById('print-extra-row');

    if (isOnline) {
        badge.style.display = 'block';
        if (sale.deliveryAddress) {
            deliverySection.style.display = 'block';
            document.getElementById('print-address').textContent = sale.deliveryAddress;
            document.getElementById('print-delivery-phone').textContent = sale.customerMobile || '-';
        } else {
            deliverySection.style.display = 'none';
        }
        if (sale.courierCharges > 0) {
            courierRow.style.display = 'flex';
            document.getElementById('print-courier').textContent = `Rs ${sale.courierCharges.toLocaleString()}`;
        } else {
            courierRow.style.display = 'none';
        }
        if (sale.extraCharges > 0) {
            extraRow.style.display = 'flex';
            document.getElementById('print-extra-label').textContent = sale.extraChargesLabel || 'Extra Charges';
            document.getElementById('print-extra').textContent = `Rs ${sale.extraCharges.toLocaleString()}`;
        } else {
            extraRow.style.display = 'none';
        }
    } else {
        badge.style.display = 'none';
        deliverySection.style.display = 'none';
        courierRow.style.display = 'none';
        extraRow.style.display = 'none';
    }

    if (window.JsBarcode) {
        JsBarcode("#print-barcode", `${sale.invoicePrefix}${sale.invoiceNumber}`, {
            format: "CODE128", width: 1.5, height: 40, displayValue: true
        });
    }
}

let lastSaleForDownload = null;
function downloadLastBill() {
    if (!lastSaleForDownload) return Promise.resolve();
    const { sale, custName } = lastSaleForDownload;

    preparePrintTemplate(sale, custName);

    const element = document.getElementById('print-template');
    element.style.display = 'block';

    const opt = {
        margin: 0,
        filename: `${sale.invoicePrefix}${sale.invoiceNumber}.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true },
        jsPDF: { unit: 'mm', format: [80, 200], orientation: 'portrait' }
    };

    return html2pdf().from(element).set(opt).save().then(() => {
        element.style.display = 'none';
    });
}

function generateBillPDF(sale, custName) {
    const isOnline = sale.orderType === 'online';

    if (isOnline) {
        // --- ONLINE ORDER: Print 2 bills in one window ---
        printOnlineDualBill(sale, custName);
    } else {
        // --- IN-STORE: Single bill as before ---
        preparePrintTemplate(sale, custName);
        const printable = document.getElementById('print-template');
        printable.id = 'printable-area';
        printable.style.display = 'block';
        window.print();
        setTimeout(() => {
            printable.style.display = 'none';
            printable.id = 'print-template';
        }, 1000);
    }
}

function printOnlineDualBill(sale, custName) {
    const invNo = `${sale.invoicePrefix}${sale.invoiceNumber}`;
    const dateStr = new Date(sale.timestamp).toLocaleString('en-LK');
    const grandTotal = sale.grandTotal || (sale.total + (sale.courierCharges || 0) + (sale.extraCharges || 0));

    // Build items rows for customer bill
    const itemsRows = sale.items.map(i => {
        const unitPrice = i.price - (i.discount || 0);
        const hasDiscount = (i.discount || 0) > 0;
        return `<tr>
            <td style="padding:4px 2px;border-bottom:1px dashed #ccc;">
                ${i.name}<span style="font-size:11px;color:#666;"> (${i.color})</span>
                ${i.code ? ` [${i.code}]` : ''}
                ${i.size ? `<b> [${i.size}]</b>` : ''}
                ${hasDiscount ? `<br><span style="font-size:11px;color:#888;text-decoration:line-through;">Rs ${i.price.toLocaleString()}</span> <span style="font-size:11px;color:#e74c3c;">-Rs ${i.discount}</span> <span style="font-size:12px;font-weight:bold;">= Rs ${unitPrice.toLocaleString()}</span>` : ''}
            </td>
            <td style="text-align:center;padding:4px 8px;border-bottom:1px dashed #ccc;">${i.qty}</td>
            <td style="text-align:right;padding:4px 2px;border-bottom:1px dashed #ccc;">${hasDiscount ? `<span style="font-size:10px;color:#888;text-decoration:line-through;">Rs ${(i.price * i.qty).toLocaleString()}</span><br>` : ''}Rs ${(unitPrice * i.qty).toLocaleString()}</td>
        </tr>`;
    }).join('');

    const courierRow = sale.courierCharges > 0
        ? `<div style="display:flex;justify-content:space-between;font-size:12px;color:#1d4ed8;margin-top:2px;"><span>Courier Charges</span><span>Rs ${sale.courierCharges.toLocaleString()}</span></div>`
        : '';
    const extraRow = sale.extraCharges > 0
        ? `<div style="display:flex;justify-content:space-between;font-size:12px;color:#7c3aed;margin-top:2px;"><span>${sale.extraChargesLabel || 'Extra Charges'}</span><span>Rs ${sale.extraCharges.toLocaleString()}</span></div>`
        : '';

    const printContent = `<!DOCTYPE html><html><head>
    <meta charset="UTF-8">
    <title>Hesa - Bills</title>
    <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body {
            font-family: 'Courier New', Courier, monospace;
            font-size: 15px;
            font-weight: 900;
            color: #000;
            background: #fff;
        }
        /* One column, stacked vertically for 80mm printer */
        .bills-wrapper {
            display: flex;
            flex-direction: column;
            gap: 20px;
        }
        .bill {
            width: 80mm;
            min-width: 80mm;
            max-width: 80mm;
            padding: 10px;
        }
        .cut-line {
            border-top: 2px dashed #000;
            text-align: center;
            margin: 10px 0;
            position: relative;
        }
        .cut-line span {
            background: #fff;
            padding: 0 10px;
            font-size: 11px;
            font-weight: normal;
            position: absolute;
            top: -7px;
            left: 50%;
            transform: translateX(-50%);
            color: #555;
        }
        .center { text-align: center; }
        .bold { font-weight: 900; }
        .divider { border-top: 1px dashed #000; margin: 6px 0; }
        .divider-solid { border-top: 2px solid #000; margin: 6px 0; }
        .row { display: flex; justify-content: space-between; margin: 3px 0; font-size: 15px; }
        .total-row { display: flex; justify-content: space-between; font-size: 18px; font-weight: 900; border-top: 3px solid #000; padding-top: 6px; margin-top: 6px; }
        .badge { background:#1d4ed8; color:#fff; text-align:center; padding:6px 10px; border-radius:5px; font-size:14px; letter-spacing:1px; margin-bottom:10px; }
        .courier-badge { background:#f59e0b; color:#000; text-align:center; padding:8px 12px; border-radius:8px; font-size:22px; font-weight:900; letter-spacing:2px; margin-bottom:12px; }
        .addr-box { border:2px solid #000; padding:10px; border-radius:8px; margin:10px 0; font-size:16px; font-weight:900; line-height:1.4; }
        .footer { text-align:center; font-size:13px; margin-top:10px; font-weight:normal; border-top:2px dashed #000; padding-top:8px; }

        @media print {
            @page { size: 80mm auto; margin: 0; }
            html, body { padding: 0; margin: 0; page-break-inside: avoid; }
            .bills-wrapper { page-break-inside: avoid; break-inside: avoid; }
            .bill { page-break-inside: avoid; break-inside: avoid; }
        }
    </style>
    </head><body>
    <div class="bills-wrapper">

        <!-- ===== BILL 1: CUSTOMER COPY ===== -->
        <div class="bill">
            <div class="center" style="margin-bottom:8px;">
                <img src="Hesa_Logo.png" style="width:65mm;height:auto;max-height:30mm;object-fit:contain;" alt="HESA">
                <div style="font-size:11px;font-weight:normal;margin-top:2px;">Effortless style for every occasion</div>
            </div>

            <div class="badge">🚚 ONLINE ORDER — CUSTOMER COPY</div>

            <div class="row"><span>Invoice:</span><span>${invNo}</span></div>
            <div class="row"><span>Date:</span><span>${dateStr}</span></div>
            <div class="row"><span>Customer:</span><span>${custName}</span></div>
            <div class="row"><span>Mobile:</span><span>${sale.customerMobile || '-'}</span></div>
            ${sale.deliveryAddress ? `<div style="margin-top:4px;font-size:12px;font-weight:normal;">Address: <b>${sale.deliveryAddress}</b></div>` : ''}

            <div class="divider-solid"></div>

            <table style="width:100%;border-collapse:collapse;">
                <thead>
                    <tr>
                        <th style="text-align:left;padding:2px 2px;border-bottom:2px solid #000;">Item</th>
                        <th style="text-align:right;padding:2px 2px;border-bottom:2px solid #000;">Qty</th>
                        <th style="text-align:right;padding:2px 2px;border-bottom:2px solid #000;">Price</th>
                    </tr>
                </thead>
                <tbody>${itemsRows}</tbody>
            </table>

            <div class="divider"></div>
            <div class="row"><span>Sub Total</span><span>Rs ${(sale.total + (sale.specialDiscount || 0)).toLocaleString()}.00</span></div>
            ${sale.specialDiscount > 0 ? `<div class="row" style="color:#e74c3c;"><span>Special Discount</span><span>-Rs ${sale.specialDiscount.toLocaleString()}</span></div>` : ''}
            ${courierRow}
            ${extraRow}
            <div class="total-row"><span>GRAND TOTAL</span><span>Rs ${grandTotal.toLocaleString()}.00</span></div>

            <div class="divider"></div>
            ${sale.paymentMethod === 'bank' ? `
            <div style="text-align:center;font-size:16px;font-weight:900;color:#16a34a;padding:10px 0;">PAID VIA BANK TRANSFER</div>
            ` : `
            <div class="row"><span>Cash Received:</span><span>Rs ${(sale.cashReceived || 0).toLocaleString()}.00</span></div>
            <div class="row"><span>Balance:</span><span>Rs ${(sale.balance || 0).toLocaleString()}.00</span></div>
            `}

            <div class="footer">
                <div style="font-size: 16px; font-weight: 900;">Thank you for shopping with Hesa!</div>
                <div style="margin-top: 6px; font-size: 14px; font-weight: normal;">Returns accepted within 7 days. Please inform us within this period.</div>
                <div style="margin-top: 10px; display: flex; justify-content: center; gap: 8px; font-size: 13px; font-weight: bold;">
                    <span><i class="fa-solid fa-phone"></i> 0760492705</span>
                    <span><i class="fa-brands fa-facebook"></i> Hesa Collection</span>
                    <span><i class="fa-brands fa-instagram"></i> hesacollection</span>
                </div>
            </div>
        </div>

        <div class="cut-line"><span>✂️ CUT HERE ✂️</span></div>

        <!-- ===== BILL 2: COURIER COPY ===== -->
        <div class="bill">
            <div class="courier-badge">📦 COURIER SLIP</div>

            <div style="font-size:13px;font-weight:bold;margin-bottom:8px;text-align:center;">HESA COLLECTION &bull; 0760492705</div>

            <div class="divider-solid"></div>

            <div class="row"><span>Invoice No:</span><span>${invNo}</span></div>
            <div class="row"><span>Date:</span><span>${new Date(sale.timestamp).toLocaleDateString('en-LK')}</span></div>

            <div class="divider"></div>

            <div style="font-size:13px;font-weight:900;margin-bottom:5px;text-transform:uppercase;letter-spacing:1px;">📍 DELIVER TO:</div>
            <div class="addr-box">
                <div style="font-size:22px;font-weight:900;text-transform:uppercase;">${custName}</div>
                <div style="margin-top:6px;font-size:18px;font-weight:900;">${sale.customerMobile || '-'}</div>
                ${sale.deliveryAddress ? `<div style="margin-top:8px;font-size:17px;font-weight:900;line-height:1.3;">${sale.deliveryAddress}</div>` : ''}
            </div>

            <div class="divider"></div>

            <div class="row" style="font-size:16px;"><span>Product Value:</span><span>Rs ${sale.total.toLocaleString()}</span></div>
            ${sale.courierCharges > 0 ? `<div class="row" style="font-size:16px;"><span>Courier Fee:</span><span>Rs ${sale.courierCharges.toLocaleString()}</span></div>` : ''}
            ${sale.extraCharges > 0 ? `<div class="row" style="font-size:16px;"><span>${sale.extraChargesLabel || 'Extra'}:</span><span>Rs ${sale.extraCharges.toLocaleString()}</span></div>` : ''}
            
            ${sale.paymentMethod === 'bank' ? `
            <div style="display:flex;justify-content:center;margin-top:20px;margin-bottom:15px;">
                <div style="border:4px solid #16a34a;color:#16a34a;padding:8px 30px;font-size:35px;font-weight:900;text-transform:uppercase;transform:rotate(-5deg);letter-spacing:6px;border-radius:12px;">
                    PAID
                </div>
            </div>
            ` : `
            <div style="display:flex;justify-content:space-between;font-size:22px;font-weight:900;border-top:3px solid #000;padding-top:6px;margin-top:8px;">
                <span>TOTAL COD</span>
                <span>Rs ${grandTotal.toLocaleString()}</span>
            </div>
            `}

            <div class="divider-solid"></div>

            <div style="text-align:center;font-size:13px;font-weight:normal;margin-top:10px;">
                Please handle with care &bull; Fragile<br>
                <div style="font-size:16px;font-weight:900;margin-top:4px;">Sender: HESA Collection</div>
                <div style="font-size:15px;font-weight:900;">0760492705</div>
            </div>
        </div>

    </div>
    </body></html>`;

    const w = window.open('', '_blank', 'width=900,height=700');
    w.document.write(printContent);
    w.document.close();
    w.focus();
    setTimeout(() => { w.print(); }, 600);
}



// --- RETURNS (ADVANCED) ---

async function searchInvoiceForReturn() {
    const input = document.getElementById('return-search-input').value.trim().toUpperCase();
    const resultArea = document.getElementById('return-result-area');
    if (!input) return;

    const parts = input.split('-');
    if (parts.length < 2) {
        resultArea.innerHTML = `<div class="bg-red-50 border border-red-200 rounded-2xl p-6 text-center"><p class="text-red-700 font-bold">Invalid format. Use PREFIX-NUMBER (e.g. HCE-1002)</p></div>`;
        resultArea.classList.remove('hidden');
        return;
    }

    const numPart = parseInt(parts[parts.length - 1]);
    const prefixPart = parts.slice(0, -1).join('-') + '-';

    const sale = await db.sales.where('invoiceNumber').equals(numPart)
        .and(s => s.invoicePrefix === prefixPart).first();

    resultArea.innerHTML = '';

    if (!sale) {
        resultArea.innerHTML = `
            <div class="bg-red-50 border border-red-200 rounded-2xl p-6 text-center">
                <i class="fa-solid fa-circle-exclamation text-red-400 text-3xl mb-3 block"></i>
                <p class="text-red-700 font-bold text-lg">Invoice not found!</p>
                <p class="text-red-500 text-sm">No invoice found for "${input}"</p>
            </div>`;
        resultArea.classList.remove('hidden');
        return;
    }

    const saleDate = new Date(sale.timestamp);
    const diffDays = Math.ceil((new Date() - saleDate) / (1000 * 60 * 60 * 24));
    const isExpired = diffDays > 7;
    const invoiceNum = `${sale.invoicePrefix}${sale.invoiceNumber}`;

    // Get previous returns for this invoice — map itemIdx -> qty returned
    const previousReturns = await db.returns.where('originalInvoiceNumber').equals(invoiceNum).toArray();
    const returnedQtyMap = {};
    previousReturns.forEach(r => {
        const key = r.itemIdx !== undefined ? r.itemIdx : r.barcode;
        returnedQtyMap[key] = (returnedQtyMap[key] || 0) + (r.qty || 1);
    });

    let itemsHtml = '';
    sale.items.forEach((item, idx) => {
        const returnedQty = returnedQtyMap[idx] !== undefined ? returnedQtyMap[idx] : (returnedQtyMap[item.barcode] || 0);
        const totalQty = item.qty || 1;
        const returnableQty = totalQty - returnedQty;
        const isFullyReturned = returnableQty <= 0;
        const itemPrice = item.price - (item.discount || 0);

        let qtyOptions = '';
        for (let q = 1; q <= returnableQty; q++) {
            qtyOptions += `<option value="${q}">${q}</option>`;
        }

        itemsHtml += `
            <tr class="${isFullyReturned ? 'opacity-40 bg-gray-50' : 'hover:bg-gray-50'} transition-colors border-b border-gray-50">
                <td class="p-3">
                    ${(!isFullyReturned && !isExpired) ? `
                    <input type="checkbox" class="return-item-check w-5 h-5 accent-red-500 cursor-pointer rounded"
                        data-idx="${idx}" data-price="${itemPrice}" data-name="${escHtml(item.name)}"
                        data-max-qty="${returnableQty}"
                        onchange="updateReturnSummary()">` : ''}
                </td>
                <td class="p-3">
                    <div class="font-bold text-gray-800 text-sm">${item.name}</div>
                    <div class="text-xs text-gray-400 mt-0.5">
                        ${item.color ? item.color : ''}${item.size ? ' · ' + item.size : ''}${item.isCustom ? ' · Custom' : ''}
                    </div>
                </td>
                <td class="p-3 text-center">
                    <span class="font-bold text-gray-700">${totalQty}</span>
                    ${returnedQty > 0 ? `<span class="text-xs text-orange-500 block">${returnedQty} returned</span>` : ''}
                </td>
                <td class="p-3 text-right font-bold text-gray-700 text-sm">Rs ${itemPrice.toLocaleString()}</td>
                <td class="p-3 text-center">
                    ${(!isFullyReturned && !isExpired) ? `
                    <select class="return-qty-select p-1 border border-gray-200 rounded-lg text-sm w-16 bg-white"
                        data-idx="${idx}" onchange="updateReturnSummary()">
                        ${qtyOptions}
                    </select>` : `
                    <span class="text-xs font-bold px-2 py-1 rounded-full ${isFullyReturned ? 'bg-gray-100 text-gray-500' : 'bg-red-100 text-red-500'}">
                        ${isFullyReturned ? '✓ Returned' : ''}
                    </span>`}
                </td>
            </tr>`;
    });

    const returnOptionsHtml = !isExpired ? `
        <div class="bg-gray-50 rounded-xl p-4 space-y-4 mt-4">
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                    <label class="block text-xs font-bold text-gray-500 mb-2 uppercase tracking-wide">Return Type</label>
                    <div class="flex gap-2">
                        <label class="flex items-center gap-2 bg-white border-2 border-gray-200 rounded-xl px-3 py-2.5 cursor-pointer flex-1 transition-all" id="lbl-cash">
                            <input type="radio" name="return-type" value="cash" checked class="accent-red-500" onchange="updateReturnTypeStyling()">
                            <span class="text-sm font-bold text-gray-700"><i class="fa-solid fa-money-bill-wave text-green-500 mr-1"></i>Cash Refund</span>
                        </label>
                        <label class="flex items-center gap-2 bg-white border-2 border-gray-200 rounded-xl px-3 py-2.5 cursor-pointer flex-1 transition-all" id="lbl-exchange">
                            <input type="radio" name="return-type" value="exchange" class="accent-blue-500" onchange="updateReturnTypeStyling()">
                            <span class="text-sm font-bold text-gray-700"><i class="fa-solid fa-rotate text-blue-500 mr-1"></i>Exchange</span>
                        </label>
                    </div>
                </div>
                <div>
                    <label class="block text-xs font-bold text-gray-500 mb-2 uppercase tracking-wide">Return Reason</label>
                    <select id="return-reason" class="w-full p-2.5 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-red-400 text-sm font-bold bg-white">
                        <option value="Customer Changed Mind">Customer Changed Mind</option>
                        <option value="Wrong Size">Wrong Size</option>
                        <option value="Wrong Color">Wrong Color</option>
                        <option value="Defective / Damaged">Defective / Damaged</option>
                        <option value="Wrong Item Delivered">Wrong Item Delivered</option>
                        <option value="Other">Other</option>
                    </select>
                </div>
            </div>
            <div>
                <label class="block text-xs font-bold text-gray-500 mb-1.5 uppercase tracking-wide">Additional Notes (Optional)</label>
                <input type="text" id="return-notes" placeholder="Any extra details..."
                    class="w-full p-2.5 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-red-400 text-sm bg-white">
            </div>
        </div>

        <!-- Summary / Confirm Bar -->
        <div id="return-summary-bar" class="hidden mt-4 bg-gradient-to-r from-red-50 to-orange-50 border border-red-200 rounded-2xl p-4 flex items-center justify-between gap-4">
            <div>
                <div class="text-xs text-red-500 font-bold uppercase tracking-wide">Return Credit</div>
                <div id="return-credit-display" class="text-2xl font-black text-red-700">Rs 0</div>
                <div id="return-items-count" class="text-xs text-red-400 mt-0.5"></div>
            </div>
            <button onclick="processSelectedReturns(${sale.id})"
                class="px-8 py-3 bg-red-600 text-white font-black rounded-xl hover:bg-red-700 shadow-lg shadow-red-200 transition-all active:scale-95 flex items-center gap-2 shrink-0">
                <i class="fa-solid fa-circle-check"></i> Process Return
            </button>
        </div>` :
        `<div class="bg-red-50 border border-red-100 rounded-xl p-4 text-center text-red-600 font-bold mt-4">
            <i class="fa-solid fa-clock mr-2"></i>Return period expired (${diffDays} days ago). Returns allowed within 7 days only.
        </div>`;

    resultArea.innerHTML = `
        <div class="bg-white rounded-2xl shadow-sm border ${isExpired ? 'border-red-200' : 'border-gray-100'} p-6">
            <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
                <div>
                    <div class="flex items-center gap-3 flex-wrap">
                        <span class="text-2xl font-black text-gray-800">${invoiceNum}</span>
                        <span class="px-3 py-1 rounded-full text-xs font-bold ${isExpired ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}">
                            ${isExpired ? '❌ Expired' : '✅ Eligible for Return'}
                        </span>
                    </div>
                    <div class="flex flex-wrap gap-4 mt-1.5 text-sm text-gray-500">
                        <span><i class="fa-solid fa-user mr-1"></i>${sale.customerName || 'Walk-in'}</span>
                        <span><i class="fa-solid fa-calendar mr-1"></i>${saleDate.toLocaleDateString('en-LK')}</span>
                        <span><i class="fa-solid fa-clock mr-1"></i>${diffDays} day(s) ago</span>
                    </div>
                </div>
                <div class="text-right shrink-0">
                    <div class="text-xs text-gray-400">Original Total</div>
                    <div class="text-2xl font-black text-brand-dark">Rs ${(sale.total || 0).toLocaleString()}</div>
                </div>
            </div>

            <div class="overflow-x-auto rounded-xl border border-gray-100">
                <table class="w-full text-left border-collapse">
                    <thead>
                        <tr class="bg-gray-50 text-gray-500 text-xs uppercase tracking-wide">
                            <th class="p-3 w-10"></th>
                            <th class="p-3">Item</th>
                            <th class="p-3 text-center">Orig. Qty</th>
                            <th class="p-3 text-right">Unit Price</th>
                            <th class="p-3 text-center">Return Qty</th>
                        </tr>
                    </thead>
                    <tbody class="text-sm">${itemsHtml}</tbody>
                </table>
            </div>

            ${returnOptionsHtml}
        </div>`;

    resultArea.classList.remove('hidden');
}

function escHtml(str) {
    return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function updateReturnSummary() {
    const checks = document.querySelectorAll('.return-item-check:checked');
    let total = 0, itemCount = 0;
    checks.forEach(chk => {
        const idx = chk.dataset.idx;
        const price = parseFloat(chk.dataset.price);
        const qtyEl = document.querySelector(`.return-qty-select[data-idx="${idx}"]`);
        const qty = qtyEl ? parseInt(qtyEl.value) : 1;
        total += price * qty;
        itemCount += qty;
    });
    const bar = document.getElementById('return-summary-bar');
    if (bar) {
        if (checks.length > 0) {
            bar.classList.remove('hidden');
            document.getElementById('return-credit-display').textContent = `Rs ${total.toLocaleString()}`;
            document.getElementById('return-items-count').textContent = `${itemCount} item(s) selected`;
        } else {
            bar.classList.add('hidden');
        }
    }
}

function updateReturnTypeStyling() {
    const val = document.querySelector('input[name="return-type"]:checked')?.value;
    const lblCash = document.getElementById('lbl-cash');
    const lblEx = document.getElementById('lbl-exchange');
    if (!lblCash || !lblEx) return;
    lblCash.className = `flex items-center gap-2 bg-white border-2 rounded-xl px-3 py-2.5 cursor-pointer flex-1 transition-all ${val === 'cash' ? 'border-red-500 bg-red-50' : 'border-gray-200'}`;
    lblEx.className = `flex items-center gap-2 bg-white border-2 rounded-xl px-3 py-2.5 cursor-pointer flex-1 transition-all ${val === 'exchange' ? 'border-blue-500 bg-blue-50' : 'border-gray-200'}`;
}

async function processSelectedReturns(saleId) {
    const checks = document.querySelectorAll('.return-item-check:checked');
    if (checks.length === 0) { alert('Please select at least one item to return.'); return; }

    const sale = await db.sales.get(saleId);
    const reason = document.getElementById('return-reason')?.value || 'Customer Return';
    const notes = document.getElementById('return-notes')?.value || '';
    const returnType = document.querySelector('input[name="return-type"]:checked')?.value || 'cash';
    const fullReason = notes ? `${reason} — ${notes}` : reason;

    const itemsToReturn = [];
    let totalCredit = 0;
    checks.forEach(chk => {
        const idx = parseInt(chk.dataset.idx);
        const item = sale.items[idx];
        const qtyEl = document.querySelector(`.return-qty-select[data-idx="${idx}"]`);
        const qty = qtyEl ? parseInt(qtyEl.value) : 1;
        const price = parseFloat(chk.dataset.price);
        itemsToReturn.push({ item, idx, qty, price });
        totalCredit += price * qty;
    });

    const typeLabel = returnType === 'exchange' ? 'Exchange Credit' : 'Cash Refund';
    if (!confirm(`Process return for ${itemsToReturn.length} item(s)?\n\nTotal Credit: Rs ${totalCredit.toLocaleString()}\nType: ${typeLabel}\nReason: ${reason}`)) return;

    const returnNumbers = [];
    await db.transaction('rw', db.products, db.returns, async () => {
        for (const { item, idx, qty, price } of itemsToReturn) {
            const retCount = await db.returns.count();
            const retNum = 1000 + retCount + 1;
            const returnNumber = `RET-${retNum}`;
            returnNumbers.push(returnNumber);
            await db.returns.add({
                returnNumber,
                originalInvoiceNumber: `${sale.invoicePrefix}${sale.invoiceNumber}`,
                originalSaleId: saleId,
                barcode: item.barcode,
                itemIdx: idx,
                itemName: item.name,
                returnDate: new Date().toISOString(),
                qty,
                refundAmount: price * qty,
                reason: fullReason,
                returnType,
                customerName: sale.customerName || 'Walk-in',
                isUsed: false
            });
            if (!item.isCustom) {
                const product = await db.products.get(item.id);
                if (product) {
                    const newTotalStock = product.stock + qty;
                    const newSizeStock = product.sizeStock ? { ...product.sizeStock } : null;
                    if (newSizeStock && item.size && newSizeStock[item.size] !== undefined) {
                        newSizeStock[item.size] += qty;
                    }
                    await db.products.update(item.id, { stock: newTotalStock, sizeStock: newSizeStock });
                }
            }
        }
    });

    printReturnBill(sale, itemsToReturn, returnNumbers, totalCredit, returnType, fullReason);
}

function printReturnBill(sale, itemsToReturn, returnNumbers, totalCredit, returnType, reason) {
    const invoiceNum = `${sale.invoicePrefix}${sale.invoiceNumber}`;
    const itemRows = itemsToReturn.map(({ item, qty, price }) => `
        <tr style="border-bottom:1px dashed #ccc;">
            <td style="padding:5px 2px;font-size:13px;">${item.name}${item.color ? ' ('+item.color+')' : ''}${item.size ? ' – '+item.size : ''}</td>
            <td style="padding:5px 2px;text-align:center;font-size:13px;">${qty}</td>
            <td style="padding:5px 2px;text-align:right;font-size:13px;font-weight:900;">Rs ${(price*qty).toLocaleString()}</td>
        </tr>`).join('');

    const printDiv = document.createElement('div');
    printDiv.id = 'printable-area';
    printDiv.innerHTML = `
        <div style="width:80mm;padding:10px;font-family:'Courier New',Courier,monospace;font-size:15px;color:#000;background:#fff;font-weight:900;">
            <div style="text-align:center;margin-bottom:10px;">
                <img src="Hesa_Logo.png" style="width:60mm;height:auto;max-height:28mm;object-fit:contain;" alt="HESA">
                <div style="background:#1a1a1a;color:#fff;padding:6px;margin-top:6px;font-size:16px;letter-spacing:2px;">
                    ${returnType==='exchange' ? '🔄 EXCHANGE CREDIT' : '💰 RETURN BILL'}
                </div>
                <div style="font-size:12px;margin-top:4px;">Ref: ${returnNumbers.join(', ')}</div>
                <div style="font-size:12px;font-weight:normal;">Original Inv: ${invoiceNum}</div>
                <div style="font-size:12px;font-weight:normal;">Customer: ${sale.customerName||'Walk-in'}</div>
                <div style="font-size:12px;font-weight:normal;">Date: ${new Date().toLocaleDateString('en-LK')}</div>
            </div>
            <div style="border-top:2px dashed #000;border-bottom:2px dashed #000;padding:8px 0;margin-bottom:8px;">
                <table style="width:100%;border-collapse:collapse;">
                    <thead><tr style="font-size:11px;border-bottom:1px solid #000;">
                        <th style="text-align:left;padding:3px 2px;">Item</th>
                        <th style="text-align:center;width:28px;">Qty</th>
                        <th style="text-align:right;">Amount</th>
                    </tr></thead>
                    <tbody>${itemRows}</tbody>
                </table>
            </div>
            <div style="display:flex;justify-content:space-between;align-items:center;margin:8px 0;padding:8px;background:#f5f5f5;">
                <span style="font-size:13px;">CREDIT AMOUNT:</span>
                <span style="font-size:22px;font-weight:900;">Rs ${totalCredit.toLocaleString()}</span>
            </div>
            <div style="font-size:11px;margin:6px 0;padding:6px;border:1px dashed #999;border-radius:4px;">
                <strong>Type:</strong> ${returnType==='exchange'?'Exchange Credit':'Cash Refund'}<br>
                <strong>Reason:</strong> ${reason}
            </div>
            <div style="text-align:center;font-size:12px;margin-top:12px;font-weight:normal;">
                <p style="text-transform:uppercase;font-weight:900;margin:0 0 4px 0;">
                    ${returnType==='exchange'?'Bring this bill for your exchange item':'Thank you for your understanding'}
                </p>
                <div>HESA Collection • 0760492705</div>
            </div>
        </div>`;
    document.body.appendChild(printDiv);
    window.print();
    document.body.removeChild(printDiv);

    if (returnType === 'exchange') {
        if (confirm(`✅ Return complete!\n\nExchange credit must be manually applied to the next bill (security: no persistent sessions).\n\nGo to POS now?`)) {
            // Exchange credit data not persisted - user must re-enter if needed
            router('pos');
        } else {
            document.getElementById('return-search-input').value = '';
            document.getElementById('return-result-area').innerHTML = '';
            document.getElementById('return-result-area').classList.add('hidden');
        }
    } else {
        alert(`✅ Return processed!\nTotal Refund: Rs ${totalCredit.toLocaleString()}`);
        router('dashboard');
    }
}





// --- REPORTS ---
async function generateReport() {
    const period = document.getElementById('global-report-period').value;
    const content = document.getElementById('report-content');

    // Calc Date Range
    const now = new Date();
    let startDate = new Date();
    let endDate = new Date();
    endDate.setHours(23, 59, 59, 999);

    if (period === 'daily') startDate.setHours(0, 0, 0, 0);
    else if (period === 'weekly') startDate.setDate(now.getDate() - 7);
    else if (period === 'monthly') startDate.setMonth(now.getMonth() - 1);
    else if (period === 'yearly') startDate.setFullYear(now.getFullYear() - 1);
    else if (period === 'custom') {
        const fromVal = document.getElementById('global-report-from').value;
        const toVal = document.getElementById('global-report-to').value;
        if (!fromVal || !toVal) {
            alert("Please select both 'From' and 'To' dates.");
            return;
        }
        startDate = new Date(fromVal);
        startDate.setHours(0, 0, 0, 0);
        endDate = new Date(toVal);
        endDate.setHours(23, 59, 59, 999);
    }

    const startTime = startDate.getTime();
    const endTime = endDate.getTime();

    const allSales = await db.sales.toArray();
    const sales = allSales.filter(sale => {
        const saleTime = new Date(sale.timestamp).getTime();
        return saleTime >= startTime && saleTime <= endTime;
    });

    const allReturns = await db.returns.toArray();
    const returns = allReturns.filter(ret => {
        const returnTime = new Date(ret.returnDate).getTime();
        return returnTime >= startTime && returnTime <= endTime;
    });

    const totalSales = sales.reduce((sum, s) => sum + s.total, 0);
    const totalDiscounts = sales.reduce((sum, sale) => {
        let itemsDisc = sale.items.reduce((isum, item) => isum + ((item.discount || 0) * item.qty), 0);
        return sum + itemsDisc + (sale.specialDiscount || 0);
    }, 0);
    const totalReturns = returns.reduce((sum, r) => sum + r.refundAmount, 0);
    const netProfit = totalSales - totalReturns; // Simple Net Revenue
    const onlineCount = allSales.filter(s => s.orderType === 'online').length;

    let html = `
        <div id="report-printable" class="w-full max-w-2xl mx-auto p-8 bg-white">
            <div class="text-center mb-10">
                <h1 class="text-3xl font-bold text-gray-800">HESA SALES REPORT</h1>
                <p class="text-gray-500 uppercase tracking-widest text-sm mt-2">${period} Report</p>
                <p class="text-gray-400 text-xs">${startDate.toLocaleDateString()} to ${endDate.toLocaleDateString()}</p>
            </div>

            <div class="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                <div class="p-4 bg-gray-50 rounded-xl text-center">
                    <p class="text-xs text-gray-500 mb-1">Total Sales</p>
                    <p class="text-xl font-bold text-gray-800">Rs ${totalSales.toLocaleString()}</p>
                </div>
                <div class="p-4 bg-pink-50 rounded-xl text-center">
                    <p class="text-xs text-pink-500 mb-1">Discounts</p>
                    <p class="text-xl font-bold text-pink-600">Rs ${totalDiscounts.toLocaleString()}</p>
                </div>
                <div class="p-4 bg-red-50 rounded-xl text-center">
                    <p class="text-xs text-red-500 mb-1">Returns</p>
                    <p class="text-xl font-bold text-red-600">Rs ${totalReturns.toLocaleString()}</p>
                </div>
                <div class="p-4 bg-green-50 rounded-xl text-center">
                    <p class="text-xs text-green-500 mb-1">Net Revenue</p>
                    <p class="text-xl font-bold text-green-600">Rs ${netProfit.toLocaleString()}</p>
                </div>
            </div>
            <div class="mb-6 p-3 bg-blue-50 rounded-xl text-sm flex items-center gap-2">
                <i class="fa-solid fa-truck text-blue-500"></i>
                <span class="text-blue-700 font-bold">${onlineCount} Online Orders</span>
                <span class="text-blue-500 text-xs">in this period</span>
            </div>

            <h3 class="font-bold border-b border-gray-200 pb-2 mb-4">Transaction History</h3>
            <table class="w-full text-sm text-left">
                <thead class="text-gray-500">
                    <tr>
                        <th class="pb-2">Date</th>
                        <th class="pb-2">Invoice</th>
                        <th class="pb-2">Type</th>
                        <th class="pb-2 text-right">Amount</th>
                        <th class="pb-2 text-center">Action</th>
                    </tr>
                </thead>
                <tbody class="text-gray-700">
    `;

    sales.forEach(s => {
        const typeBadge = s.orderType === 'online'
            ? `<span class="px-1.5 py-0.5 text-xs rounded bg-blue-100 text-blue-700 font-bold"><i class="fa-solid fa-truck"></i> Online</span>`
            : `<span class="px-1.5 py-0.5 text-xs rounded bg-gray-100 text-gray-600"><i class="fa-solid fa-store"></i> Store</span>`;
        html += `
            <tr class="border-b border-gray-50">
                <td class="py-2">${new Date(s.timestamp).toLocaleDateString()}</td>
                <td class="py-2 font-medium">${s.invoicePrefix}${s.invoiceNumber}</td>
                <td class="py-2">${typeBadge}</td>
                <td class="py-2 text-right">Rs ${s.total.toLocaleString()}</td>
                <td class="py-2 text-center">
                    <button onclick="viewOrder(${s.id})" class="text-blue-500 hover:bg-blue-50 px-2 py-1 rounded text-xs transition-colors">
                        <i class="fa-solid fa-eye"></i> View
                    </button>
                </td>
            </tr>
        `;
    });

    html += `
                </tbody>
            </table>
        </div>
    `;

    content.innerHTML = html;
    content.classList.remove('border', 'border-dashed', 'text-gray-400');
}

// --- Online Orders Report ---
async function generateOnlineReport() {
    const period = document.getElementById('global-report-period').value;
    const content = document.getElementById('online-report-content');

    const now = new Date();
    let startDate = new Date();
    let endDate = new Date();
    endDate.setHours(23, 59, 59, 999);

    if (period === 'daily') startDate.setHours(0, 0, 0, 0);
    else if (period === 'weekly') startDate.setDate(now.getDate() - 7);
    else if (period === 'monthly') startDate.setMonth(now.getMonth() - 1);
    else if (period === 'yearly') startDate.setFullYear(now.getFullYear() - 1);
    else if (period === 'custom') {
        const fromVal = document.getElementById('global-report-from').value;
        const toVal = document.getElementById('global-report-to').value;
        if (!fromVal || !toVal) {
            alert("Please select both 'From' and 'To' dates.");
            return;
        }
        startDate = new Date(fromVal);
        startDate.setHours(0, 0, 0, 0);
        endDate = new Date(toVal);
        endDate.setHours(23, 59, 59, 999);
    }

    const startTime = startDate.getTime();
    const endTime = endDate.getTime();

    const allSales = await db.sales.toArray();
    const filteredSales = allSales.filter(sale => {
        const saleTime = new Date(sale.timestamp).getTime();
        return saleTime >= startTime && saleTime <= endTime;
    });
    const onlineSales = filteredSales.filter(s => s.orderType === 'online');

    const totalOnlineSales = onlineSales.reduce((sum, s) => sum + s.total, 0);
    const totalCourier = onlineSales.reduce((sum, s) => sum + (s.courierCharges || 0), 0);
    const totalExtra = onlineSales.reduce((sum, s) => sum + (s.extraCharges || 0), 0);
    const totalGrand = onlineSales.reduce((sum, s) => sum + (s.grandTotal || s.total), 0);

    let html = `
        <div id="online-report-printable" class="w-full max-w-2xl mx-auto p-6 bg-white">
            <div class="flex items-center gap-3 mb-6">
                <div class="w-10 h-10 bg-blue-100 text-blue-600 rounded-xl flex items-center justify-center">
                    <i class="fa-solid fa-truck"></i>
                </div>
                <div>
                    <h2 class="text-xl font-bold text-gray-800">Online Orders Report</h2>
                    <p class="text-xs text-gray-400">${startDate.toLocaleDateString()} — ${endDate.toLocaleDateString()}</p>
                </div>
            </div>

            <div class="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
                <div class="p-3 bg-blue-50 rounded-xl text-center">
                    <p class="text-xs text-blue-500 mb-1">Orders</p>
                    <p class="text-2xl font-bold text-blue-700">${onlineSales.length}</p>
                </div>
                <div class="p-3 bg-gray-50 rounded-xl text-center">
                    <p class="text-xs text-gray-500 mb-1">Products Total</p>
                    <p class="text-xl font-bold text-gray-800">Rs ${totalOnlineSales.toLocaleString()}</p>
                </div>
                <div class="p-3 bg-orange-50 rounded-xl text-center">
                    <p class="text-xs text-orange-500 mb-1">Courier Fees</p>
                    <p class="text-xl font-bold text-orange-600">Rs ${totalCourier.toLocaleString()}</p>
                </div>
                <div class="p-3 bg-green-50 rounded-xl text-center">
                    <p class="text-xs text-green-500 mb-1">Grand Total</p>
                    <p class="text-xl font-bold text-green-700">Rs ${totalGrand.toLocaleString()}</p>
                </div>
            </div>
    `;

    if (onlineSales.length === 0) {
        html += `<div class="text-center py-12 text-gray-400"><i class="fa-solid fa-truck text-5xl mb-3"></i><p>No online orders found for this period.</p></div>`;
    } else {
        html += `
            <div class="space-y-3">
        `;
        onlineSales.forEach(s => {
            const grand = s.grandTotal || (s.total + (s.courierCharges || 0) + (s.extraCharges || 0));
            html += `
                <div class="border border-blue-100 rounded-xl p-4 bg-blue-50/50">
                    <div class="flex justify-between items-start mb-2">
                        <div>
                            <span class="font-bold text-brand-dark">${s.invoicePrefix}${s.invoiceNumber}</span>
                            <span class="text-xs text-gray-400 ml-2">${new Date(s.timestamp).toLocaleString()}</span>
                        </div>
                        <span class="font-bold text-green-700">Rs ${grand.toLocaleString()}</span>
                    </div>
                    <div class="text-sm text-gray-700">
                        <b>${s.customerName || 'N/A'}</b> &bull; ${s.customerMobile || '-'}
                    </div>
                    ${s.deliveryAddress ? `<div class="text-xs text-gray-500 mt-1"><i class="fa-solid fa-location-dot mr-1"></i>${s.deliveryAddress}</div>` : ''}
                    <div class="flex gap-4 mt-2 text-xs">
                        <span class="text-gray-600">Products: <b>Rs ${s.total.toLocaleString()}</b></span>
                        ${s.courierCharges > 0 ? `<span class="text-orange-600">Courier: <b>Rs ${s.courierCharges.toLocaleString()}</b></span>` : ''}
                        ${s.extraCharges > 0 ? `<span class="text-purple-600">${s.extraChargesLabel || 'Extra'}: <b>Rs ${s.extraCharges.toLocaleString()}</b></span>` : ''}
                    </div>
                    <div class="mt-2">
                        <button onclick="viewOrder(${s.id})" class="text-blue-500 hover:bg-blue-100 px-2 py-1 rounded text-xs transition-colors">
                            <i class="fa-solid fa-eye"></i> View Details
                        </button>
                    </div>
                </div>
            `;
        });
        html += `</div>`;
    }

    html += `</div>`;
    content.innerHTML = html;
    content.classList.remove('border', 'border-dashed', 'text-gray-400');
}

async function printOnlineReport() {
    const element = document.getElementById('online-report-printable');
    if (!element) {
        alert('Please click Preview to generate the online orders report first.');
        return;
    }

    const period = document.getElementById('global-report-period')?.value || '';
    const now = new Date().toLocaleString('en-LK');

    const printContent = `
        <!DOCTYPE html><html><head>
        <meta charset="UTF-8">
        <title>Hesa - Online Orders Report</title>
        <style>
            body { font-family: 'Courier New', Courier, monospace; font-size: 13px; font-weight: bold;
                   color: #000; margin: 0; padding: 8px; width: 80mm; box-sizing: border-box; }
            h1 { font-size: 17px; font-weight: 900; margin: 0 0 2px 0; text-align: center; }
            .sub { text-align: center; font-size: 11px; font-weight: normal; color: #555; margin-bottom: 10px;
                   border-bottom: 2px solid #000; padding-bottom: 8px; }
            .stat-row { display: flex; justify-content: space-between; font-size: 12px;
                        border-bottom: 1px dashed #000; padding: 4px 0; }
            .order-block { border-bottom: 2px dashed #000; padding: 6px 0; margin-bottom: 4px; }
            .order-inv { font-size: 14px; font-weight: 900; }
            .order-cust { font-size: 12px; }
            .order-addr { font-size: 11px; color: #555; font-weight: normal; }
            .order-total { text-align: right; font-size: 14px; font-weight: 900; }
            .footer { text-align: center; font-size: 11px; border-top: 2px dashed #000;
                      margin-top: 10px; padding-top: 6px; font-weight: normal; }
            @media print { @page { size: 80mm auto; margin: 0; } body { padding: 5px; } }
        </style>
        </head><body>
        <h1>HESA COLLECTION</h1>
        <div class="sub">Online Orders (${period.toUpperCase()})<br>${now}</div>
        ${element.innerHTML
            .replace(/class="[^"]*"/g, '')
            .replace(/<button[^>]*>.*?<\/button>/gs, '')
            .replace(/<div[^>]*grid[^>]*>/g, '<div>')
        }
        <div class="footer">HESA Collection &bull; 0760492705</div>
        </body></html>
    `;

    const w = window.open('', '_blank', 'width=400,height=700');
    w.document.write(printContent);
    w.document.close();
    w.focus();
    setTimeout(() => { w.print(); }, 500);
}

function switchReportTab(tab) {
    const salesTab = document.getElementById('tab-sales-report');
    const onlineTab = document.getElementById('tab-online-report');
    const itemsTab = document.getElementById('tab-items-report');
    const salesPanel = document.getElementById('panel-sales-report');
    const onlinePanel = document.getElementById('panel-online-report');
    const itemsPanel = document.getElementById('panel-items-report');

    // Reset styles
    [salesTab, onlineTab, itemsTab].forEach(t => {
        if (t) t.className = 'px-5 py-2.5 text-sm font-bold border-b-2 border-transparent text-gray-500 hover:text-gray-800 -mb-px transition-colors';
    });

    [salesPanel, onlinePanel, itemsPanel].forEach(p => {
        if (p) p.classList.add('hidden');
    });

    if (tab === 'sales') {
        salesTab.className = 'px-5 py-2.5 text-sm font-bold border-b-2 border-brand-dark text-brand-dark -mb-px transition-colors';
        salesPanel.classList.remove('hidden');
    } else if (tab === 'online') {
        onlineTab.className = 'px-5 py-2.5 text-sm font-bold border-b-2 border-blue-600 text-blue-700 -mb-px transition-colors';
        onlinePanel.classList.remove('hidden');
    } else if (tab === 'items') {
        if (itemsTab) itemsTab.className = 'px-5 py-2.5 text-sm font-bold border-b-2 border-purple-600 text-purple-700 -mb-px transition-colors';
        if (itemsPanel) itemsPanel.classList.remove('hidden');
    }
}

// --- Sold Items Report ---
async function generateItemsReport() {
    const period = document.getElementById('global-report-period').value;
    const content = document.getElementById('items-report-content');

    const now = new Date();
    let startDate = new Date();
    let endDate = new Date();
    endDate.setHours(23, 59, 59, 999);

    if (period === 'daily') startDate.setHours(0, 0, 0, 0);
    else if (period === 'weekly') startDate.setDate(now.getDate() - 7);
    else if (period === 'monthly') startDate.setMonth(now.getMonth() - 1);
    else if (period === 'yearly') startDate.setFullYear(now.getFullYear() - 1);
    else if (period === 'custom') {
        const fromVal = document.getElementById('global-report-from').value;
        const toVal = document.getElementById('global-report-to').value;
        if (!fromVal || !toVal) {
            alert("Please select both 'From' and 'To' dates.");
            return;
        }
        startDate = new Date(fromVal);
        startDate.setHours(0, 0, 0, 0);
        endDate = new Date(toVal);
        endDate.setHours(23, 59, 59, 999);
    }

    const allSales = await db.sales.where('timestamp').between(startDate.toISOString(), endDate.toISOString(), true, true).toArray();
    
    // Grouping logic
    let itemMap = {};
    allSales.forEach(sale => {
        sale.items.forEach(item => {
            const key = `${item.code || 'NOCODE'}-${item.name}-${item.color || ''}-${item.size || ''}`;
            if (!itemMap[key]) {
                itemMap[key] = {
                    code: item.code || '-',
                    name: item.name,
                    color: item.color || '-',
                    size: item.size || '-',
                    qty: 0,
                    totalValue: 0
                };
            }
            itemMap[key].qty += item.qty;
            itemMap[key].totalValue += (item.price - (item.discount || 0)) * item.qty;
        });
    });

    const groupedItems = Object.values(itemMap).sort((a,b) => b.qty - a.qty);
    const totalItemsCount = groupedItems.reduce((sum, i) => sum + i.qty, 0);
    const totalItemsValue = groupedItems.reduce((sum, i) => sum + i.totalValue, 0);

    let html = `
        <div id="items-report-printable" class="w-full max-w-3xl mx-auto p-6 bg-white">
            <div class="flex items-center gap-3 mb-6">
                <div class="w-10 h-10 bg-purple-100 text-purple-600 rounded-xl flex items-center justify-center">
                    <i class="fa-solid fa-tags"></i>
                </div>
                <div>
                    <h2 class="text-xl font-bold text-gray-800">Sold Items Summary Report</h2>
                    <p class="text-xs text-gray-400">${startDate.toLocaleDateString()} — ${endDate.toLocaleDateString()}</p>
                </div>
            </div>

            <div class="grid grid-cols-2 gap-3 mb-6">
                <div class="p-3 bg-gray-50 rounded-xl text-center border border-gray-100">
                    <p class="text-[10px] text-gray-500 uppercase font-bold mb-1">Total Pieces Sold</p>
                    <p class="text-2xl font-black text-gray-800">${totalItemsCount}</p>
                </div>
                <div class="p-3 bg-purple-50 rounded-xl text-center border border-purple-100">
                    <p class="text-[10px] text-purple-500 uppercase font-bold mb-1">Total Sales Value</p>
                    <p class="text-xl font-black text-purple-700">Rs ${totalItemsValue.toLocaleString()}</p>
                </div>
            </div>
    `;

    if (groupedItems.length === 0) {
        html += `<div class="text-center py-12 text-gray-400"><i class="fa-solid fa-tags text-5xl mb-3"></i><p>No items sold in this period.</p></div>`;
    } else {
        html += `
            <div class="overflow-hidden border border-gray-100 rounded-xl">
            <table class="w-full text-sm text-left">
                <thead class="bg-gray-50 text-gray-500 uppercase text-[10px] font-bold">
                    <tr>
                        <th class="p-3">Item Code</th>
                        <th class="p-3">Product Description</th>
                        <th class="p-3 text-center">Total Qty</th>
                        <th class="p-3 text-right">Total Amount</th>
                    </tr>
                </thead>
                <tbody class="divide-y divide-gray-100">
        `;
        groupedItems.forEach(item => {
            html += `
                <tr class="hover:bg-gray-50 transition-colors">
                    <td class="p-3 font-black text-brand-dark">${item.code}</td>
                    <td class="p-3">
                        <div class="font-bold text-gray-700 leading-tight">${item.name}</div>
                        <div class="text-[10px] text-gray-400 mt-0.5">Color: ${item.color}, Size: ${item.size}</div>
                    </td>
                    <td class="p-3 text-center">
                        <span class="px-2 py-1 bg-gray-100 rounded-full font-black text-gray-800">${item.qty}</span>
                    </td>
                    <td class="p-3 text-right font-bold text-gray-800">Rs ${item.totalValue.toLocaleString()}</td>
                </tr>
            `;
        });
        html += `
                </tbody>
            </table>
            </div>
        `;
    }

    html += `</div>`;
    content.innerHTML = html;
    content.classList.remove('border', 'border-dashed', 'text-gray-400');
}

async function printItemsReport() {
    const period = document.getElementById('global-report-period').value;
    const now = new Date();
    let startDate = new Date();
    let endDate = new Date();
    endDate.setHours(23, 59, 59, 999);

    if (period === 'daily') startDate.setHours(0, 0, 0, 0);
    else if (period === 'weekly') startDate.setDate(now.getDate() - 7);
    else if (period === 'monthly') startDate.setMonth(now.getMonth() - 1);
    else if (period === 'yearly') startDate.setFullYear(now.getFullYear() - 1);
    else if (period === 'custom') {
        const fromVal = document.getElementById('global-report-from').value;
        const toVal = document.getElementById('global-report-to').value;
        if (!fromVal || !toVal) {
            alert("Please select both 'From' and 'To' dates.");
            return;
        }
        startDate = new Date(fromVal);
        startDate.setHours(0, 0, 0, 0);
        endDate = new Date(toVal);
        endDate.setHours(23, 59, 59, 999);
    }

    const allSales = await db.sales.where('timestamp').between(startDate.toISOString(), endDate.toISOString(), true, true).toArray();
    
    // Grouping logic
    let itemMap = {};
    allSales.forEach(sale => {
        sale.items.forEach(item => {
            const key = `${item.code || 'NOCODE'}-${item.name}-${item.color || ''}-${item.size || ''}`;
            if (!itemMap[key]) {
                itemMap[key] = {
                    code: item.code || '-',
                    name: item.name,
                    color: item.color || '-',
                    size: item.size || '-',
                    qty: 0,
                    totalValue: 0
                };
            }
            itemMap[key].qty += item.qty;
            itemMap[key].totalValue += (item.price - (item.discount || 0)) * item.qty;
        });
    });

    const groupedItems = Object.values(itemMap).sort((a,b) => b.qty - a.qty);
    const totalItemsCount = groupedItems.reduce((sum, i) => sum + i.qty, 0);
    const totalItemsValue = groupedItems.reduce((sum, i) => sum + i.totalValue, 0);

    if (groupedItems.length === 0) {
        alert("No items found to print for this period.");
        return;
    }

    let itemsHtml = '';
    groupedItems.forEach(item => {
        itemsHtml += `
            <div style="border-bottom: 1px dashed #000; padding: 6px 0;">
                <div style="display:flex; justify-content:space-between; margin-bottom: 2px;">
                    <span style="font-size:12px; font-weight:bold;">CODE: ${item.code}</span>
                    <span style="font-size:12px;">Qty: ${item.qty}</span>
                </div>
                <div style="font-size:14px; font-weight:900;">${item.name}</div>
                <div style="font-size:11px; color:#555;">${item.color} | ${item.size}</div>
                <div style="text-align:right; font-size:13px; font-weight:bold; margin-top:2px;">
                    Total: Rs ${item.totalValue.toLocaleString()}
                </div>
            </div>
        `;
    });

    const printContent = `
        <!DOCTYPE html><html><head>
        <meta charset="UTF-8">
        <title>Hesa - Sold Items Report</title>
        <style>
            body { font-family: 'Courier New', Courier, monospace; font-size: 13px; font-weight: normal;
                   color: #000; margin: 0; padding: 8px; width: 80mm; box-sizing: border-box; }
            h1 { font-size: 17px; font-weight: 900; margin: 0 0 2px 0; text-align: center; }
            .sub { text-align: center; font-size: 11px; font-weight: normal; color: #555; margin-bottom: 10px;
                   border-bottom: 2px solid #000; padding-bottom: 8px; }
            .footer { text-align: center; font-size: 11px; border-top: 2px dashed #000;
                      margin-top: 10px; padding-top: 6px; font-weight: normal; }
            @media print { @page { size: 80mm auto; margin: 0; } body { padding: 5px; } }
        </style>
        </head><body>
        <div style="text-align: center; margin-bottom: 10px;">
            <img src="Hesa_Logo.png" style="width: 70mm; height: 35mm; object-fit: contain; object-position: center; margin: 0 auto;" alt="HESA">
        </div>
        <div class="sub">SOLD ITEMS SUMMARY (${period.toUpperCase()})<br>${startDate.toLocaleDateString()} - ${endDate.toLocaleDateString()}</div>
        <div style="font-size:13px; margin-bottom:6px; display:flex; justify-content:space-between; font-weight:bold;">
            <span>Sum Qty: ${totalItemsCount}</span>
            <span>Sum Rs: ${totalItemsValue.toLocaleString()}</span>
        </div>
        <div style="border-top: 2px dashed #000; margin-bottom: 6px;"></div>
        
        ${itemsHtml}
        
        <div class="footer">HESA Collection &bull; 0760492705</div>
        </body></html>
    `;

    const w = window.open('', '_blank', 'width=400,height=700');
    w.document.write(printContent);
    w.document.close();
    w.focus();
    setTimeout(() => { w.print(); }, 500);
}

function exportReportPDF() {
    const element = document.getElementById('report-printable');
    if (!element) {
        alert("Please generate a report first.");
        return;
    }
    const opt = {
        margin: 0.5,
        filename: `Hesa_Report_${new Date().toISOString().split('T')[0]}.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2 },
        jsPDF: { unit: 'in', format: 'letter', orientation: 'portrait' }
    };
    html2pdf().from(element).set(opt).save();
}

// --- CUSTOMER MANAGEMENT ---
async function loadCustomers() {
    const customers = await db.customers.toArray();
    renderCustomerTable(customers);
}

function renderCustomerTable(customers) {
    const tbody = document.getElementById('customers-table');
    tbody.innerHTML = '';

    if (customers.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" class="text-center py-8 text-gray-400">No customers found.</td></tr>';
        return;
    }

    customers.forEach(c => {
        const tr = document.createElement('tr');
        tr.className = 'border-b border-gray-50 hover:bg-gray-50 transition-colors';
        
        // Build action buttons based on view-only status
        let actionButtons = `
            <button onclick="openCustomerModal(${c.id})" class="text-blue-500 hover:bg-blue-50 p-2 rounded"><i class="fa-solid fa-pen"></i></button>
            <button onclick="deleteCustomer(${c.id})" class="text-red-500 hover:bg-red-50 p-2 rounded"><i class="fa-solid fa-trash"></i></button>
        `;
        
        if (window.hideCustomerActions) {
            actionButtons = `<span class="text-[10px] text-gray-400 italic">View-only</span>`;
        }
        
        tr.innerHTML = `
            <td class="p-3 text-center"><input type="checkbox" class="customer-checkbox w-4 h-4 accent-brand-gold" value="${c.id}" data-mobile="${c.mobile}" data-name="${c.name}" onchange="updateBroadcastCount()"></td>
            <td class="p-3 font-medium text-gray-800">${c.name}</td>
            <td class="p-3 text-gray-500">${c.mobile}</td>
            <td class="p-3 text-right">
                ${actionButtons}
            </td>
        `;
        tbody.appendChild(tr);
    });
}

function filterCustomerSearch(query) {
    db.customers.filter(c =>
        c.name.toLowerCase().includes(query.toLowerCase()) ||
        c.mobile.includes(query)
    ).toArray().then(renderCustomerTable);
}

function openCustomerModal(id = null) {
    const modal = document.getElementById('modal-customer');
    const form = document.getElementById('customer-form');

    // Reset Form
    form.reset();
    document.getElementById('cust-id').value = '';
    document.getElementById('modal-customer-title').textContent = 'Add Customer';

    if (id) {
        document.getElementById('modal-customer-title').textContent = 'Edit Customer';
        db.customers.get(id).then(c => {
            document.getElementById('cust-id').value = c.id;
            document.getElementById('cust-modal-name').value = c.name;
            document.getElementById('cust-modal-mobile').value = c.mobile;
        });
    }

    modal.classList.remove('hidden');
}

function closeCustomerModal() {
    document.getElementById('modal-customer').classList.add('hidden');
}

async function handleCustomerSubmit(e) {
    e.preventDefault();
    const id = document.getElementById('cust-id').value;
    const name = document.getElementById('cust-modal-name').value;
    const mobile = document.getElementById('cust-modal-mobile').value;

    if (id) {
        await db.customers.update(id, { name, mobile });
    } else {
        await db.customers.add({ name, mobile });
    }

    closeCustomerModal();
    loadCustomers();
}

async function deleteCustomer(id) {
    if (confirm('Are you sure you want to delete this customer?')) {
        await db.customers.delete(id);
        loadCustomers();
    }
}

function toggleAllCustomers(el) {
    const checkboxes = document.querySelectorAll('.customer-checkbox');
    checkboxes.forEach(cb => cb.checked = el.checked);
    updateBroadcastCount();
}

function updateBroadcastCount() {
    // Optionally we can update a counter anywhere, but mainly we use it when building the queue
}

let broadcastQueue = [];
let currentBroadcastIdx = 0;
let broadcastImageBlob = null;

function openBroadcastModal() {
    const checkboxes = document.querySelectorAll('.customer-checkbox:checked');
    if (checkboxes.length === 0) {
        alert("Please select at least one customer to broadcast.");
        return;
    }
    
    // reset state
    document.getElementById('broadcast-msg').value = '';
    document.getElementById('broadcast-img').value = '';
    broadcastImageBlob = null;
    document.getElementById('broadcast-step-1').classList.remove('hidden');
    document.getElementById('broadcast-step-2').classList.add('hidden');
    document.getElementById('broadcast-count').textContent = `Selected Customers: ${checkboxes.length}`;
    
    document.getElementById('modal-broadcast').classList.remove('hidden');
}

function closeBroadcastModal() {
    document.getElementById('modal-broadcast').classList.add('hidden');
    broadcastQueue = [];
    document.getElementById('btn-send-next').innerHTML = '<i class="fa-brands fa-whatsapp mr-2"></i>Send Message & Next';
}

async function startBroadcast() {
    const msg = document.getElementById('broadcast-msg').value.trim();
    if (!msg) {
        alert("Please type a message.");
        return;
    }

    const fileInput = document.getElementById('broadcast-img');
    broadcastImageBlob = null;
    if (fileInput.files && fileInput.files[0]) {
        try {
            broadcastImageBlob = fileInput.files[0];
        } catch(e) {
            console.error(e);
        }
    }

    const checkboxes = document.querySelectorAll('.customer-checkbox:checked');
    broadcastQueue = Array.from(checkboxes).map(cb => ({
        name: cb.getAttribute('data-name'),
        mobile: cb.getAttribute('data-mobile')
    })).filter(c => c.mobile && c.mobile.length >= 9);

    if (broadcastQueue.length === 0) {
        alert("Selected customers do not have valid mobile numbers.");
        return;
    }

    currentBroadcastIdx = 0;
    
    document.getElementById('broadcast-step-1').classList.add('hidden');
    document.getElementById('broadcast-step-2').classList.remove('hidden');
    
    updateBroadcastUI();
}

async function copyImageToClipboard(blob) {
    try {
        if (navigator.clipboard && window.ClipboardItem) {
            // Need to convert to PNG if not already, or just try to pass blob
            // Using standard type or original
            const type = blob.type.startsWith('image/') ? blob.type : 'image/png';
            const item = new ClipboardItem({ [type]: blob });
            await navigator.clipboard.write([item]);
        }
    } catch(err) {
        console.warn("Clipboard copy failed or not supported in this context.", err);
    }
}

async function sendNextBroadcast() {
    if (currentBroadcastIdx >= broadcastQueue.length) {
        closeBroadcastModal();
        return;
    }

    const c = broadcastQueue[currentBroadcastIdx];
    let phone = c.mobile.replace(/[^0-9\+]/g, '');
    if (phone.startsWith('0')) {
        phone = '+94' + phone.substring(1);
    } else if (!phone.startsWith('+')) {
        phone = '+94' + phone;
    }
    
    const msg = document.getElementById('broadcast-msg').value.trim();
    
    if (broadcastImageBlob) {
        try {
            await copyImageToClipboard(broadcastImageBlob);
        } catch(e) {}
    }

    const url = `https://web.whatsapp.com/send?phone=${encodeURIComponent(phone)}&text=${encodeURIComponent(msg)}`;
    window.open(url, '_blank');

    currentBroadcastIdx++;
    if (currentBroadcastIdx >= broadcastQueue.length) {
        document.getElementById('btn-send-next').innerHTML = '<i class="fa-solid fa-check mr-2"></i>Finish';
        document.getElementById('broadcast-current-name').textContent = "All messages queued!";
        document.getElementById('broadcast-current-mobile').textContent = "";
        document.getElementById('broadcast-progress').style.width = '100%';
        document.getElementById('broadcast-current-idx').textContent = broadcastQueue.length;
    } else {
        updateBroadcastUI();
    }
}

function skipBroadcast() {
    currentBroadcastIdx++;
    if (currentBroadcastIdx >= broadcastQueue.length) {
        document.getElementById('btn-send-next').innerHTML = '<i class="fa-solid fa-check mr-2"></i>Finish';
        document.getElementById('broadcast-current-name').textContent = "All messages queued!";
        document.getElementById('broadcast-current-mobile').textContent = "";
        document.getElementById('broadcast-progress').style.width = '100%';
        document.getElementById('broadcast-current-idx').textContent = broadcastQueue.length;
    } else {
        updateBroadcastUI();
    }
}

function updateBroadcastUI() {
    document.getElementById('broadcast-total').textContent = broadcastQueue.length;
    document.getElementById('broadcast-current-idx').textContent = currentBroadcastIdx + 1;
    
    const w = ((currentBroadcastIdx) / broadcastQueue.length) * 100;
    document.getElementById('broadcast-progress').style.width = w + '%';

    const c = broadcastQueue[currentBroadcastIdx];
    document.getElementById('broadcast-current-name').textContent = c.name;
    document.getElementById('broadcast-current-mobile').textContent = c.mobile;
}

// Checkout Auto-Search
async function checkCustomerOnInput(mobile) {
    if (mobile.length < 9) return; // Wait for mostly complete number

    // Check DB
    const customer = await db.customers.where('mobile').equals(mobile).first();
    const nameInput = document.getElementById('cust-name');
    const msgArea = document.getElementById('cust-msg');

    if (customer) {
        nameInput.value = customer.name;
        msgArea.textContent = `Existing Customer (ID: ${customer.id})`;
        msgArea.classList.remove('hidden');
        msgArea.className = 'text-xs text-green-600 mt-1 block';
    } else {
        // New customer
        msgArea.textContent = 'New Customer - will be added automatically';
        msgArea.classList.remove('hidden');
        msgArea.className = 'text-xs text-blue-500 mt-1 block';
    }
}

// --- ORDER VIEW ---
async function viewOrder(id) {
    const sale = await db.sales.get(id);
    if (!sale) { alert('Order not found'); return; }

    document.getElementById('view-order-id').textContent = `${sale.invoicePrefix}${sale.invoiceNumber}`;
    document.getElementById('view-order-date').textContent = new Date(sale.timestamp).toLocaleString();
    document.getElementById('view-order-cust').textContent = sale.customerName || 'Guest';
    document.getElementById('view-order-mobile').textContent = sale.customerMobile || '-';

    // Show online badge in order modal if online
    const orderIdEl = document.getElementById('view-order-id');
    if (sale.orderType === 'online') {
        orderIdEl.innerHTML = `${sale.invoicePrefix}${sale.invoiceNumber} <span class="ml-2 px-2 py-0.5 text-xs rounded-full bg-blue-100 text-blue-700 font-bold"><i class="fa-solid fa-truck"></i> Online</span>`;
    }

    const grandTotal = sale.grandTotal || (sale.total + (sale.courierCharges || 0) + (sale.extraCharges || 0));
    document.getElementById('view-order-total').textContent = `Rs ${grandTotal.toLocaleString()}`;
    document.getElementById('view-order-paid').textContent = `Rs ${sale.cashReceived?.toLocaleString() || '0.00'}`;
    document.getElementById('view-order-balance').textContent = `Rs ${sale.balance?.toLocaleString() || '0.00'}`;

    const itemsContainer = document.getElementById('view-order-items');
    itemsContainer.innerHTML = '';

    sale.items.forEach(item => {
        const unitPrice = item.price - (item.discount || 0);
        const total = unitPrice * item.qty;

        const tr = document.createElement('tr');
        tr.className = 'border-b border-gray-50';
        tr.innerHTML = `
            <td class="p-3">
                <div class="font-medium text-gray-800">${item.name}</div>
                <div class="text-xs text-gray-400">${item.color} ${item.size ? '[' + item.size + ']' : ''}</div>
            </td>
            <td class="p-3 text-center text-gray-600">${item.qty}</td>
            <td class="p-3 text-right font-medium text-gray-800">Rs ${total.toLocaleString()}</td>
        `;
        itemsContainer.appendChild(tr);
    });

    // Add online delivery info below items if applicable
    const onlineInfoContainer = document.getElementById('view-online-info');
    if (onlineInfoContainer) onlineInfoContainer.remove();

    if (sale.orderType === 'online') {
        const deliveryDiv = document.createElement('div');
        deliveryDiv.id = 'view-online-info';
        deliveryDiv.className = 'bg-blue-50 border border-blue-200 rounded-xl p-3 mt-3 text-sm space-y-1';
        deliveryDiv.innerHTML = `
            <div class="font-bold text-blue-700 text-xs uppercase mb-2"><i class="fa-solid fa-truck mr-1"></i>Delivery Information</div>
            ${sale.deliveryAddress ? `<div><span class="text-gray-500">Address:</span> <span class="font-medium">${sale.deliveryAddress}</span></div>` : ''}
            ${sale.courierCharges > 0 ? `<div><span class="text-gray-500">Courier:</span> <span class="font-medium text-orange-600">Rs ${sale.courierCharges.toLocaleString()}</span></div>` : ''}
            ${sale.extraCharges > 0 ? `<div><span class="text-gray-500">${sale.extraChargesLabel || 'Extra Charges'}:</span> <span class="font-medium text-purple-600">Rs ${sale.extraCharges.toLocaleString()}</span></div>` : ''}
        `;
        // Insert before the totals grid
        const totalsGrid = document.querySelector('#modal-order-details .grid.grid-cols-3');
        if (totalsGrid) totalsGrid.parentNode.insertBefore(deliveryDiv, totalsGrid);
    }

    // Show Return Credit in Order Modal
    const returnSection = document.getElementById('view-order-return-section');
    if (sale.returnCredit > 0 && returnSection) {
        returnSection.classList.remove('hidden');
        document.getElementById('view-order-return-amt').textContent = `Rs ${sale.returnCredit.toLocaleString()}.00`;
        document.getElementById('view-order-return-no').textContent = sale.returnBillNo || 'N/A';
    } else if (returnSection) {
        returnSection.classList.add('hidden');
    }

    // Populate buttons action
    document.getElementById('btn-reprint').onclick = () => generateBillPDF(sale, sale.customerName || 'Guest');

    // For WhatsApp resend, we need to pass mobile. If no mobile, maybe prompt or just show modal with empty?
    // showWhatsAppBillOption expects mobile.
    const mobile = sale.customerMobile || '';
    document.getElementById('btn-whatsapp-resend').onclick = () => {
        if (!mobile || mobile.length < 9) {
            alert('No valid mobile number for this order.');
            // Optional: could allow entering one, but for now strict.
            return;
        }
        showWhatsAppBillOption(sale, sale.customerName || 'Guest', mobile);
    };

    document.getElementById('modal-order-details').classList.remove('hidden');
}

function closeOrderModal() {
    document.getElementById('modal-order-details').classList.add('hidden');
}

// --- DATA BACKUP & RESTORE ---

async function exportBackup() {
    try {
        const statusEl = document.getElementById('backup-status');
        statusEl.className = 'mt-4 p-3 rounded-lg text-sm font-medium bg-blue-50 text-blue-700';
        statusEl.textContent = '⏳ Backup generate කරමින්...';
        statusEl.classList.remove('hidden');

        // Collect all data
        const products = await db.products.toArray();
        const sales = await db.sales.toArray();
        const customers = await db.customers.toArray();
        const returns = await db.returns.toArray();
        const users = await db.users.toArray();

        // Remove passwords from users for safety (optional — keep them for full restore)
        const backup = {
            version: 1,
            exportedAt: new Date().toISOString(),
            exportedBy: currentUser?.username || 'unknown',
            data: { products, sales, customers, returns, users }
        };

        const json = JSON.stringify(backup, null, 2);
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);

        const date = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
        const a = document.createElement('a');
        a.href = url;
        a.download = `HesaPOS_Backup_${date}.json`;
        a.click();
        URL.revokeObjectURL(url);

        statusEl.className = 'mt-4 p-3 rounded-lg text-sm font-medium bg-green-50 text-green-700';
        statusEl.textContent = `✅ Backup සාර්ථකව download කරා! (Products: ${products.length}, Sales: ${sales.length}, Customers: ${customers.length})`;

    } catch (err) {
        const statusEl = document.getElementById('backup-status');
        statusEl.className = 'mt-4 p-3 rounded-lg text-sm font-medium bg-red-50 text-red-700';
        statusEl.textContent = '❌ Backup error: ' + err.message;
        statusEl.classList.remove('hidden');
    }
}

async function importBackup(input) {
    const file = input.files[0];
    if (!file) return;

    const statusEl = document.getElementById('backup-status');
    statusEl.className = 'mt-4 p-3 rounded-lg text-sm font-medium bg-yellow-50 text-yellow-700';
    statusEl.textContent = '⏳ Backup file කියවමින්...';
    statusEl.classList.remove('hidden');

    const reader = new FileReader();
    reader.onload = async (e) => {
        try {
            const backup = JSON.parse(e.target.result);

            if (!backup.data || backup.version !== 1) {
                statusEl.className = 'mt-4 p-3 rounded-lg text-sm font-medium bg-red-50 text-red-700';
                statusEl.textContent = '❌ Invalid backup file! Hesa POS backup file එකක් select කරන්න.';
                return;
            }

            const { products, sales, customers, returns, users } = backup.data;

            // Confirm before overwrite
            const confirmed = confirm(
                `⚠️ Import කිරීමෙන් CURRENT DATA OVERWRITE වේ!\n\n` +
                `Import data:\n` +
                `• Products: ${products?.length || 0}\n` +
                `• Sales: ${sales?.length || 0}\n` +
                `• Customers: ${customers?.length || 0}\n` +
                `• Returns: ${returns?.length || 0}\n\n` +
                `Continue කරන්නද?`
            );

            if (!confirmed) {
                statusEl.className = 'mt-4 p-3 rounded-lg text-sm font-medium bg-gray-100 text-gray-600';
                statusEl.textContent = 'Import cancelled.';
                input.value = '';
                return;
            }

            statusEl.textContent = '⏳ Data import කරමින්... please wait...';

            // Clear existing data and re-import
            await db.transaction('rw', db.products, db.sales, db.customers, db.returns, db.users, async () => {
                await db.products.clear();
                await db.sales.clear();
                await db.customers.clear();
                await db.returns.clear();

                if (products?.length) await db.products.bulkAdd(products);
                if (sales?.length) await db.sales.bulkAdd(sales);
                if (customers?.length) await db.customers.bulkAdd(customers);
                if (returns?.length) await db.returns.bulkAdd(returns);

                // Import users only if present (don't clear users if none in backup)
                if (users?.length) {
                    await db.users.clear();
                    await db.users.bulkAdd(users);
                }
            });

            statusEl.className = 'mt-4 p-3 rounded-lg text-sm font-medium bg-green-50 text-green-700';
            statusEl.textContent = `✅ Import සාර්ථකයි! Products: ${products?.length || 0}, Sales: ${sales?.length || 0}, Customers: ${customers?.length || 0}. Page refresh වේ...`;

            // Refresh app after 2 seconds
            setTimeout(() => location.reload(), 2000);

        } catch (err) {
            statusEl.className = 'mt-4 p-3 rounded-lg text-sm font-medium bg-red-50 text-red-700';
            statusEl.textContent = '❌ Import error: ' + err.message;
        }
    };

    reader.readAsText(file);
    input.value = ''; // Reset input
}

// --- CLEAR REPORTS (Admin Only) ---

function openClearReportsModal() {
    // Double-check admin role
    if (!currentUser || currentUser.role !== 'admin') {
        alert('Access denied. Only admin users can clear reports.');
        return;
    }
    // Reset form
    document.getElementById('clear-reports-password').value = '';
    document.getElementById('clear-reports-error').classList.add('hidden');
    document.getElementById('clear-reports-error').textContent = '';

    // Reset checkboxes
    document.getElementById('clear-opt-sales').checked = false;
    document.getElementById('clear-opt-returns').checked = false;
    document.getElementById('clear-opt-customers').checked = false;
    document.getElementById('clear-opt-inventory').checked = false;
    document.getElementById('modal-clear-reports').classList.remove('hidden');
    setTimeout(() => document.getElementById('clear-reports-password').focus(), 200);
}

function closeClearReportsModal() {
    document.getElementById('modal-clear-reports').classList.add('hidden');
    document.getElementById('clear-reports-password').value = '';
    document.getElementById('clear-reports-error').classList.add('hidden');
}

async function confirmClearReports() {
    const enteredPassword = document.getElementById('clear-reports-password').value;
    const errorEl = document.getElementById('clear-reports-error');

    const clearSales = document.getElementById('clear-opt-sales').checked;
    const clearReturns = document.getElementById('clear-opt-returns').checked;
    const clearCustomers = document.getElementById('clear-opt-customers').checked;
    const clearInventory = document.getElementById('clear-opt-inventory').checked;

    if (!clearSales && !clearReturns && !clearCustomers && !clearInventory) {
        errorEl.textContent = 'Please select at least one data type to clear.';
        errorEl.classList.remove('hidden');
        return;
    }

    if (!enteredPassword) {
        errorEl.textContent = 'Please enter your admin password.';
        errorEl.classList.remove('hidden');
        return;
    }

    // Verify password against current admin user in DB
    const adminUser = await db.users.get(currentUser.id);
    if (!adminUser || adminUser.password !== enteredPassword) {
        errorEl.textContent = '❌ Incorrect password. Access denied.';
        errorEl.classList.remove('hidden');
        document.getElementById('clear-reports-password').value = '';
        document.getElementById('clear-reports-password').focus();
        return;
    }

    // All checks passed — clear data
    try {
        const tablesToClear = [];
        const logs = [];

        if (clearSales) {
            tablesToClear.push(db.sales);
            logs.push('Sales');
        }
        if (clearReturns) {
            tablesToClear.push(db.returns);
            logs.push('Returns');
        }
        if (clearCustomers) {
            tablesToClear.push(db.customers);
            logs.push('Customers');
        }
        if (clearInventory) {
            tablesToClear.push(db.products);
            logs.push('Inventory');
        }

        if (tablesToClear.length > 0) {
            await db.transaction('rw', tablesToClear, async () => {
                if (clearSales) await db.sales.clear();
                if (clearReturns) await db.returns.clear();
                if (clearCustomers) await db.customers.clear();
                if (clearInventory) await db.products.clear();
            });
        }

        const clearedItemsStr = logs.join(', ');
        await logAction('CLEAR_REPORTS', `Admin ${currentUser.username} cleared: ${clearedItemsStr}.`);

        closeClearReportsModal();

        // Reset report content area
        const reportContent = document.getElementById('report-content');
        reportContent.innerHTML = 'Select a period and click Preview';
        reportContent.className = 'min-h-[300px] border border-dashed border-gray-200 rounded-xl flex items-center justify-center text-gray-400';

        // Show success
        alert(`✅ Selected data (${clearedItemsStr}) cleared successfully.`);

        // Refresh dashboard
        loadDashboard();
        if (clearInventory || currentView === 'inventory') loadInventory();
        if (clearCustomers || currentView === 'customers') loadCustomers();
        if (clearInventory || currentView === 'pos') loadPosProducts('All');

    } catch (err) {
        errorEl.textContent = '❌ Error clearing data: ' + err.message;
        errorEl.classList.remove('hidden');
    }
}

// --- PENDING CARTS (REMOTE WORKFLOW) ---

function startPendingCartsPoll() {
    if (pendingCartsPollInterval) clearInterval(pendingCartsPollInterval);
    refreshPendingCartsUI(); // Initial load
    pendingCartsPollInterval = setInterval(refreshPendingCartsUI, 3000); // Check every 3s
}

function stopPendingCartsPoll() {
    if (pendingCartsPollInterval) {
        clearInterval(pendingCartsPollInterval);
        pendingCartsPollInterval = null;
    }
}

async function suspendCart() {
    const customerName = document.getElementById('floor-customer-name')?.value || '';
    await performRemoteSend(customerName, 'floor-sales');
}

async function suspendCartFromPos() {
    const customerName = document.getElementById('pos-customer-name')?.value || '';
    await performRemoteSend(customerName, 'pos');
}

async function performRemoteSend(customerName, viewMode) {
    const activeCart = viewMode === 'floor-sales' ? floorCart : cart;
    if (activeCart.length === 0) {
        alert("Cart is empty!");
        return;
    }

    if (!confirm(`Send cart ${customerName ? 'for "' + customerName + '" ' : ''}to the cashier?`)) return;

    const specialDiscount = viewMode === 'floor-sales' ? 0 : (parseFloat(document.getElementById('cart-special-discount')?.value) || 0);
    const total = activeCart.reduce((sum, item) => {
        const disc = item.cartDiscount !== undefined ? item.cartDiscount : (item.discount || 0);
        return sum + ((item.price - disc) * item.qty);
    }, 0) - specialDiscount;

    try {
        await db.pending_carts.add({
            senderName: currentUser.username,
            customerName: customerName,
            items: JSON.parse(JSON.stringify(activeCart)),
            specialDiscount: specialDiscount,
            total: total,
            timestamp: new Date().toISOString(),
            status: 'pending'
        });

        if (viewMode === 'floor-sales') {
            floorCart = [];
            document.getElementById('floor-customer-name').value = '';
        } else {
            cart = [];
            document.getElementById('pos-customer-name').value = '';
        }
        updateCartUI();
        refreshPendingCartsUI();
        alert("✅ Cart sent successfully!");
    } catch (e) {
        console.error(e);
        alert("Error sending cart.");
    }
}

function togglePendingCarts() {
    const dropdown = document.getElementById('dropdown-pending-carts');
    dropdown.classList.toggle('hidden');
    if (!dropdown.classList.contains('hidden')) {
        refreshPendingCartsUI();
    }
}

async function refreshPendingCartsUI() {
    const list = await db.pending_carts.where('status').equals('pending').toArray();
    const container = document.getElementById('pending-carts-list');
    const badge = document.getElementById('pending-carts-badge');
    const posList = document.getElementById('incoming-carts-list-main');
    const posPanel = document.getElementById('incoming-carts-panel');
    const waitingTag = document.getElementById('waiting-count-tag');

    // Update Badge & Tag
    if (list.length > 0) {
        if (badge) {
            badge.textContent = list.length;
            badge.classList.remove('hidden');
        }
        if (waitingTag) waitingTag.textContent = list.length;
    } else {
        if (badge) badge.classList.add('hidden');
    }

    if (!container) return;
    container.innerHTML = '';

    if (posList) posList.innerHTML = '';

    if (list.length === 0) {
        container.innerHTML = '<div class="p-4 text-center text-gray-400 text-xs italic">No pending carts</div>';
        if (posPanel) posPanel.classList.add('hidden');
        return;
    }

    if (posPanel) posPanel.classList.remove('hidden');

    // Sort by most recent
    list.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    list.forEach(p => {
        const time = new Date(p.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const nameLabel = p.customerName ? `${p.customerName} (${p.senderName})` : p.senderName;
        
        // --- 1. Top Dropdown Entry ---
        const div = document.createElement('div');
        div.className = 'p-3 bg-gray-50 rounded-xl hover:bg-gray-100 transition-colors border border-gray-100';
        div.innerHTML = `
            <div class="flex justify-between items-start mb-1">
                <span class="font-bold text-xs text-brand-dark">${nameLabel}</span>
                <span class="text-[10px] text-gray-400">${time}</span>
            </div>
            <div class="text-xs text-gray-500 mb-2">${p.items.length} items • Rs ${p.total.toLocaleString()}</div>
            <div class="flex gap-2">
                <button onclick="acceptPendingCart(${p.id})" class="flex-1 py-1.5 bg-blue-600 text-white text-[10px] font-bold rounded-lg hover:bg-blue-700">Accept</button>
                <button onclick="rejectPendingCart(${p.id})" class="flex-1 py-1.5 bg-white border border-gray-200 text-gray-400 text-[10px] font-bold rounded-lg hover:bg-gray-50">Dismiss</button>
            </div>
        `;
        container.appendChild(div);

        // --- 2. POS Screen Inline Entry ---
        if (posList) {
            const posDiv = document.createElement('button');
            posDiv.onclick = () => acceptPendingCart(p.id);
            posDiv.className = 'flex-shrink-0 flex items-center gap-3 bg-blue-50 border border-blue-100 p-2.5 rounded-xl hover:bg-blue-100 transition-all group relative animate-bounce-subtle';
            posDiv.innerHTML = `
                <div class="w-8 h-8 rounded-lg bg-blue-600 text-white flex items-center justify-center flex-shrink-0 shadow-lg shadow-blue-200">
                    <i class="fa-solid fa-user-tag text-xs"></i>
                </div>
                <div class="text-left pr-2">
                    <p class="text-[10px] font-black text-blue-700 leading-tight truncate w-20">${p.customerName || p.senderName}</p>
                    <p class="text-[10px] font-bold text-blue-500">Rs ${p.total.toLocaleString()}</p>
                </div>
                <div class="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white rounded-full flex items-center justify-center text-[8px] font-bold border-2 border-white">!</div>
            `;
            posList.appendChild(posDiv);
        }
    });
}

async function updateFloorCategories() {
    const select = document.getElementById('floor-cat');
    if (!select) return;

    const products = await db.products.toArray();
    const categories = [...new Set(products.map(p => p.category || 'None'))];
    
    // Save current selection
    const currentVal = select.value;
    
    select.innerHTML = '<option value="All">All Categories</option>';
    categories.sort().forEach(cat => {
        const opt = document.createElement('option');
        opt.value = cat;
        opt.textContent = cat;
        select.appendChild(opt);
    });

    // Restore selection if it still exists
    if (categories.includes(currentVal)) {
        select.value = currentVal;
    }
}

async function loadFloorProducts(category = 'All') {
    const grid = document.getElementById('floor-products-grid');
    if (!grid) return;
    grid.innerHTML = '';

    let products = await db.products.toArray();
    if (category !== 'All') {
        products = products.filter(p => (p.category || 'None') === category);
    }

    products.forEach(p => {
        const div = document.createElement('div');
        div.className = 'bg-gray-50 p-4 rounded-2xl hover:bg-blue-50 transition-all border border-transparent hover:border-blue-200 cursor-pointer text-center flex flex-col items-center group active:scale-95';
        div.onclick = () => addToCart(p); // Reuses the main addToCart
        div.innerHTML = `
            <div class="w-12 h-12 bg-white rounded-xl flex items-center justify-center text-blue-600 mb-3 shadow-sm group-hover:bg-blue-600 group-hover:text-white transition-colors">
                 <i class="fa-solid fa-plus text-lg"></i>
            </div>
            <h4 class="font-black text-sm text-gray-800 line-clamp-1">${p.name}</h4>
            <p class="text-[10px] text-gray-500 font-bold mb-2">${p.code || p.barcode}</p>
            <p class="text-sm font-black text-blue-600">Rs ${p.price.toLocaleString()}</p>
        `;
        grid.appendChild(div);
    });

    // Add search listener for floor if not already added
    const searchIn = document.getElementById('floor-search');
    if (searchIn && !searchIn.dataset.listened) {
        searchIn.dataset.listened = 'true';
        searchIn.addEventListener('input', (e) => {
            filterFloorSearch(e.target.value);
        });
    }
}

async function filterFloorSearch(query) {
    const grid = document.getElementById('floor-products-grid');
    if (!grid) return;
    
    let products = await db.products.toArray();
    const q = query.toLowerCase();

    const filtered = products.filter(p => 
        p.name.toLowerCase().includes(q) || 
        p.barcode.toLowerCase().includes(q) || 
        (p.code && p.code.toLowerCase().includes(q))
    );

    grid.innerHTML = '';
    filtered.forEach(p => {
        const div = document.createElement('div');
        div.className = 'bg-gray-50 p-4 rounded-2xl hover:bg-blue-50 transition-all border border-transparent hover:border-blue-200 cursor-pointer text-center flex flex-col items-center group active:scale-95';
        div.onclick = () => addToCart(p);
        div.innerHTML = `
            <div class="w-12 h-12 bg-white rounded-xl flex items-center justify-center text-blue-600 mb-3 shadow-sm group-hover:bg-blue-600 group-hover:text-white transition-colors">
                 <i class="fa-solid fa-plus text-lg"></i>
            </div>
            <h4 class="font-black text-sm text-gray-800 line-clamp-1">${p.name}</h4>
            <p class="text-[10px] text-gray-500 font-bold mb-2">${p.code || p.barcode}</p>
            <p class="text-sm font-black text-blue-600">Rs ${p.price.toLocaleString()}</p>
        `;
        grid.appendChild(div);
    });
}

async function acceptPendingCart(id) {
    const p = await db.pending_carts.get(id);
    if (!p) return;

    // Merge into main cart
    p.items.forEach(newItem => {
        const existing = cart.find(i => i.id === newItem.id && i.size === newItem.size && i.color === newItem.color);
        if (existing) {
            existing.qty += newItem.qty;
        } else {
            cart.push(newItem);
        }
    });

    if (p.specialDiscount) {
        const specialDiscEl = document.getElementById('cart-special-discount');
        if (specialDiscEl) specialDiscEl.value = (parseFloat(specialDiscEl.value) || 0) + p.specialDiscount;
    }

    updateCartUI();
    
    // Mark as accepted
    await db.pending_carts.update(id, { status: 'accepted' });
    
    // Close dropdown & panel
    const dropdown = document.getElementById('dropdown-pending-carts');
    if (dropdown) dropdown.classList.add('hidden');
    refreshPendingCartsUI();

    // Switch to POS if not already
    if (currentView !== 'pos') router('pos');
    
    alert(`✅ Cart for "${p.customerName || p.senderName}" merged into your active bill.`);
}

async function rejectPendingCart(id) {
    if (!confirm("Remove this pending cart?")) return;
    await db.pending_carts.update(id, { status: 'rejected' });
    refreshPendingCartsUI();
}

// --- MANAGE STOCK BATCHES ---
async function openManageStockModal(id) {
    const product = await db.products.get(id);
    if (!product) return;

    document.getElementById('stock-product-id').value = product.id;
    document.getElementById('stock-product-name').textContent = `${product.name} (${product.code || '-'})`;
    document.getElementById('stock-total-display').textContent = product.stock;
    
    // Clear form
    document.getElementById('new-batch-name').value = '';
    document.getElementById('new-batch-color').value = '';
    document.getElementById('new-batch-size').value = '';
    document.getElementById('new-batch-qty').value = '';

    renderStockBatches(product);
    document.getElementById('modal-manage-stock').classList.remove('hidden');
}

function closeManageStockModal() {
    document.getElementById('modal-manage-stock').classList.add('hidden');
    loadInventory(); // Refresh main table
}

function renderStockBatches(product) {
    const tbody = document.getElementById('stock-batches-table');
    tbody.innerHTML = '';
    
    const batches = product.batches || [];
    
    if (batches.length === 0) {
        document.getElementById('no-batches-msg').classList.remove('hidden');
    } else {
        document.getElementById('no-batches-msg').classList.add('hidden');
        
        // Sort by date desc
        batches.sort((a,b) => new Date(b.date) - new Date(a.date));

        batches.forEach(b => {
            const tr = document.createElement('tr');
            tr.className = 'border-b border-gray-50 hover:bg-gray-50';
            const detail = `${b.name}${b.color ? ` / ${b.color}` : ''}${b.size ? ` / ${b.size}` : ''}`;
            tr.innerHTML = `
                <td class="p-3 text-xs text-gray-500">${new Date(b.date).toLocaleDateString()}</td>
                <td class="p-3 font-medium text-gray-800 text-xs">${detail}</td>
                <td class="p-3 text-center font-bold text-brand-dark">${b.quantity}</td>
                <td class="p-3 text-right">
                    <button onclick="deleteStockBatch(${product.id}, '${b.id}')" class="text-red-500 hover:bg-red-50 p-1.5 rounded transition-colors">
                        <i class="fa-solid fa-trash-can text-xs"></i>
                    </button>
                </td>
            `;
            tbody.appendChild(tr);
        });
    }
}

async function handleAddStockBatch(e) {
    e.preventDefault();
    const productId = document.getElementById('stock-product-id').value;
    const name = document.getElementById('new-batch-name').value.trim();
    const color = document.getElementById('new-batch-color').value.trim();
    const size = document.getElementById('new-batch-size').value.trim();
    const qty = parseInt(document.getElementById('new-batch-qty').value);

    if (!name || isNaN(qty) || qty <= 0) return;

    const product = await db.products.get(productId);
    if (!product) return;

    const newBatch = {
        id: 'batch-' + Date.now(),
        name: name,
        color: color,
        size: size,
        quantity: qty,
        date: new Date().toISOString()
    };

    if (!product.batches) product.batches = [];
    product.batches.push(newBatch);

    // Update total stock
    product.stock = (product.stock || 0) + qty;
    
    // Update sizeStock if color or size is provided
    if (color || size) {
        if (!product.sizeStock) product.sizeStock = {};
        const variantName = color && size ? `${color} - ${size}` : (color || size);
        product.sizeStock[variantName] = (product.sizeStock[variantName] || 0) + qty;
    }

    await db.products.update(productId, { 
        batches: product.batches,
        stock: product.stock,
        sizeStock: product.sizeStock || {}
    });

    await logAction('STOCK_ADDED', `Added arrival: ${qty}x ${name} (${color}/${size}) to ${product.name}`);

    // UI Updates
    document.getElementById('stock-total-display').textContent = product.stock;
    document.getElementById('new-batch-name').value = '';
    document.getElementById('new-batch-color').value = '';
    document.getElementById('new-batch-size').value = '';
    document.getElementById('new-batch-qty').value = '';
    renderStockBatches(product);
}

async function deleteStockBatch(productId, batchId) {
    if (!confirm('Are you sure you want to delete this stock batch? Initial stock will be adjusted.')) return;

    const product = await db.products.get(productId);
    if (!product || !product.batches) return;

    const batchIndex = product.batches.findIndex(b => b.id === batchId);
    if (batchIndex === -1) return;

    const batch = product.batches[batchIndex];
    
    // Adjust total stock
    product.stock = Math.max(0, (product.stock || 0) - batch.quantity);
    
    // Adjust sizeStock if color or size was provided
    if (batch.color || batch.size) {
        if (product.sizeStock) {
            const variantName = batch.color && batch.size ? `${batch.color} - ${batch.size}` : (batch.color || batch.size);
            if (product.sizeStock[variantName]) {
                product.sizeStock[variantName] = Math.max(0, product.sizeStock[variantName] - batch.quantity);
                if (product.sizeStock[variantName] === 0) delete product.sizeStock[variantName];
            }
        }
    }

    // Remove batch
    product.batches.splice(batchIndex, 1);

    await db.products.update(productId, { 
        batches: product.batches,
        stock: product.stock,
        sizeStock: product.sizeStock || {}
    });

    await logAction('STOCK_DELETED', `Removed arrival batch "${batch.name}" from ${product.name}`);

    // UI Updates
    document.getElementById('stock-total-display').textContent = product.stock;
    renderStockBatches(product);
}

