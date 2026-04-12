const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const app = express();

// CORS Configuration
const allowedOrigins = [
    process.env.CLIENT_URL || 'http://localhost:3000',
    process.env.ALLOWED_ORIGINS || 'http://localhost:3000'
];
app.use(cors({
    origin: allowedOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json({ limit: '50mb' }));

// Serve static files (HTML, CSS, JS, images) from the root directory
app.use(express.static(__dirname));

// MongoDB Connection
const mongoURI = process.env.MONGO_URI;
if (!mongoURI) {
    console.error('[ERROR] MONGO_URI environment variable is not set');
    process.exit(1);
}
mongoose.connect(mongoURI, {
    serverSelectionTimeoutMS: 60000,
    socketTimeoutMS: 60000,
    maxPoolSize: 10,
    minPoolSize: 2,
    retryWrites: true,
    w: 'majority',
    connectTimeoutMS: 60000,
    heartbeatFrequencyMS: 10000
})
.then(() => console.log('[OK] MongoDB Connected'))
.catch(err => {
    console.error('[ERROR] MongoDB Connection Failed:', err.message);
    process.exit(1);
});

// Monitor connection events
mongoose.connection.on('connected', () => console.log('[OK] Mongoose connected to MongoDB'));
mongoose.connection.on('disconnected', () => console.log('[WARNING] Mongoose disconnected from MongoDB'));
mongoose.connection.on('error', (err) => console.error('[ERROR] MongoDB error:', err.message));

// --- SCHEMAS & MODELS ---
const productSchema = new mongoose.Schema({
    name: { type: String, required: true },
    barcode: { type: String, required: true, unique: true },
    code: { type: String },
    category: { type: String },
    color: { type: String },
    price: { type: Number, required: true },
    discount: { type: Number, default: 0 },
    stock: { type: Number, default: 0 },
    internalDesc: { type: String },
    image: { type: String },
    sizeStock: { type: Map, of: Number, default: {} }
}, { timestamps: true });
const Product = mongoose.model('Product', productSchema);

const saleSchema = new mongoose.Schema({
    invoicePrefix: { type: String },
    invoiceNumber: { type: String, required: true },
    customerMobile: { type: String },
    items: { type: Array },
    total: { type: Number, required: true },
    timestamp: { type: Date, default: Date.now },
    orderType: { type: String },
    deliveryAddress: { type: String },
    courierCharges: { type: Number, default: 0 },
    extraCharges: { type: Number, default: 0 },
    extraChargesLabel: { type: String },
    paymentMethod: { type: String },
    grandTotal: { type: Number },
    specialDiscount: { type: Number, default: 0 },
    returnCredit: { type: Number, default: 0 },
    returnBillNo: { type: String },
    cashReceived: { type: Number, default: 0 },
    balance: { type: Number, default: 0 },
    customerName: { type: String }
}, { timestamps: true });
const Sale = mongoose.model('Sale', saleSchema);

const returnSchema = new mongoose.Schema({
    returnNumber: { type: String, required: true },
    originalInvoiceNumber: { type: String, required: true },
    originalSaleId: { type: String },
    barcode: { type: String, required: true },
    itemName: { type: String },
    returnDate: { type: Date, default: Date.now },
    qty: { type: Number, default: 1 },
    refundAmount: { type: Number, required: true },
    reason: { type: String },
    returnType: { type: String },
    customerName: { type: String },
    isUsed: { type: Boolean, default: false },
    exchangeInvoiceNumber: { type: String }
}, { timestamps: true });
const Return = mongoose.model('Return', returnSchema);

const customerSchema = new mongoose.Schema({
    name: { type: String, required: true },
    mobile: { type: String, required: true, unique: true }
}, { timestamps: true });
const Customer = mongoose.model('Customer', customerSchema);

const userSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    role: { type: String, required: true },
    isOnline: { type: Boolean, default: false },
    lastLogin: { type: Date, default: null }
}, { timestamps: true });
const User = mongoose.model('User', userSchema);

const logSchema = new mongoose.Schema({
    timestamp: { type: Date, default: Date.now },
    action: { type: String, required: true },
    user: { type: String, required: true },
    details: { type: mongoose.Schema.Types.Mixed }
}, { timestamps: true });
const Log = mongoose.model('Log', logSchema);

const codeRangeSchema = new mongoose.Schema({
    minCode: { type: Number, required: true },
    maxCode: { type: Number, required: true },
    name: { type: String, required: true }
}, { timestamps: true });
const CodeRange = mongoose.model('CodeRange', codeRangeSchema);

const pendingCartSchema = new mongoose.Schema({
    senderName: { type: String, required: true },
    items: { type: Array },
    total: { type: Number, required: true },
    timestamp: { type: Date, default: Date.now },
    status: { type: String, required: true },
    specialDiscount: { type: Number, default: 0 }
}, { timestamps: true });
const PendingCart = mongoose.model('PendingCart', pendingCartSchema);

// Approval Request Schema
const approvalRequestSchema = new mongoose.Schema({
    action: { type: String, required: true }, // 'DELETE_PRODUCT', 'DELETE_RETURN', 'EDIT_REPORTS', etc.
    details: { type: Object, default: {} },
    requesterUsername: { type: String, required: true },
    requesterRole: { type: String, required: true },
    assignedRole: { type: String, required: true }, // 'GM' or 'Admin'
    assignedUsername: { type: String, default: null },
    status: { type: String, enum: ['PENDING', 'APPROVED', 'REJECTED'], default: 'PENDING' },
    createdAt: { type: Date, default: Date.now },
    respondedAt: { type: Date, default: null },
    expireAt: { type: Date, default: () => new Date(Date.now() + 3600000) } // Expires in 1 hour
});
approvalRequestSchema.index({ expireAt: 1 }, { expireAfterSeconds: 0 }); // TTL index
const ApprovalRequest = mongoose.model('ApprovalRequest', approvalRequestSchema);

// Audit Log Schema
const auditLogSchema = new mongoose.Schema({
    timestamp: { type: Date, default: Date.now },
    action: { type: String, required: true },
    requesterUsername: { type: String, required: true },
    requesterRole: { type: String, required: true },
    approverUsername: { type: String, default: 'System' },
    approverRole: { type: String, default: 'System' },
    details: { type: Object, default: {} },
    status: { type: String, enum: ['EXECUTED', 'REJECTED', 'FAILED'], default: 'EXECUTED' }
});
const AuditLog = mongoose.model('AuditLog', auditLogSchema);

// --- GENERIC API ROUTES TO MIMIC DEXIE API ---

const models = {
    products: Product,
    sales: Sale,
    returns: Return,
    customers: Customer,
    users: User,
    logs: Log,
    codeRanges: CodeRange,
    pending_carts: PendingCart,
    approval_requests: ApprovalRequest,
    audit_logs: AuditLog
};

// Serve main HTML file
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'HESA_POS.html'));
});

// Health check endpoint
app.get('/health', (req, res) => {
    const status = {
        status: 'ok',
        mongodb: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
        timestamp: new Date().toISOString()
    };
    const statusCode = status.mongodb === 'connected' ? 200 : 503;
    res.status(statusCode).json(status);
});

// Login endpoint with plain text password verification
app.post('/api/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        if (!username || !password) {
            return res.status(400).json({ error: 'Username and password required' });
        }

        // Find user by username
        const user = await User.findOne({ username });
        if (!user) {
            return res.status(401).json({ error: 'Invalid username or password' });
        }

        // Plain text password comparison (development/testing only)
        if (user.password === password) {
            // Success - set user online and record last login
            await User.updateOne(
                { _id: user._id },
                { 
                    isOnline: true,
                    lastLogin: new Date()
                }
            );

            // Return user without exposing sensitive data
            return res.json({
                id: user._id.toString(),
                username: user.username,
                role: user.role
            });
        } else {
            return res.status(401).json({ error: 'Invalid username or password' });
        }
    } catch (err) {
        console.error('[ERROR] Login error:', err);
        res.status(500).json({ error: 'Login failed', details: err.message });
    }
});

app.post('/api/dexie/:collection/:action', async (req, res) => {
    try {
        const { collection, action } = req.params;
        const Model = models[collection];
        if (!Model) return res.status(404).json({ error: 'Collection not found' });

        const payload = req.body;

        switch (action) {
            case 'toArray':
                // Handles filter, sort, limit if needed
                let query = Model.find({});
                if (payload.where) {
                    const { field, op, value } = payload.where;
                    if (op === 'equals') query = query.where(field).equals(value);
                    if (op === 'below') query = query.where(field).lt(value);
                    if (op === 'between') {
                        const [lower, upper] = value;
                        query = query.where(field).gte(lower).lte(upper);
                    }
                }
                if (payload.orderBy) {
                    query = query.sort({ [payload.orderBy]: payload.reverse ? -1 : 1 });
                }
                if (payload.limit) {
                    query = query.limit(payload.limit);
                }
                const results = await query.lean();
                // Map _id to id for dexie compatibility
                const mapped = results.map(r => ({ ...r, id: r._id.toString() }));
                return res.json(mapped);

            case 'first':
                let firstQuery = Model.findOne({});
                if (payload.where) {
                    const { field, op, value } = payload.where;
                    if (op === 'equals') firstQuery = firstQuery.where(field).equals(value);
                    if (op === 'below') firstQuery = firstQuery.where(field).lt(value);
                }
                const firstRes = await firstQuery.lean();
                if (!firstRes) return res.json(null);
                return res.json({ ...firstRes, id: firstRes._id.toString() });

            case 'count':
                let countQuery = Model.find({});
                if (payload.where) {
                    const { field, op, value } = payload.where;
                    if (op === 'equals') countQuery = countQuery.where(field).equals(value);
                    if (op === 'below') countQuery = countQuery.where(field).lt(value);
                }
                const count = await countQuery.countDocuments();
                return res.json({ count });

            case 'add':
                const newDoc = new Model(payload.data);
                await newDoc.save();
                return res.json({ id: newDoc._id.toString() });

            case 'bulkAdd':
                const result = await Model.insertMany(payload.data);
                return res.json({ count: result.length });

            case 'update':
                await Model.findByIdAndUpdate(payload.id, payload.data);
                return res.json({ success: true });

            case 'delete':
                await Model.findByIdAndDelete(payload.id);
                return res.json({ success: true });

            case 'get':
                const getRes = await Model.findById(payload.id).lean();
                if (!getRes) return res.json(null);
                return res.json({ ...getRes, id: getRes._id.toString() });

            default:
                return res.status(400).json({ error: 'Action not supported' });
        }
    } catch (err) {
        console.error('API Error:', err);
        res.status(500).json({ error: err.message });
    }
});

// --- LOGOUT ENDPOINT ---
app.post('/api/logout', async (req, res) => {
    try {
        const { username } = req.body;
        if (!username) {
            return res.status(400).json({ error: 'Username required' });
        }

        // Set user offline
        await User.updateOne(
            { username },
            { isOnline: false }
        );

        return res.json({ success: true });
    } catch (err) {
        console.error('[ERROR] Logout error:', err);
        res.status(500).json({ error: 'Logout failed', details: err.message });
    }
});

// --- GET ONLINE USERS ENDPOINT ---
app.get('/api/users/online', async (req, res) => {
    try {
        // Get all users where isOnline is true
        const onlineUsers = await User.find(
            { isOnline: true },
            { username: 1, role: 1, lastLogin: 1 }
        ).lean();

        // Format the response
        const formattedUsers = onlineUsers.map(user => ({
            id: user._id.toString(),
            username: user.username,
            role: user.role,
            lastLogin: user.lastLogin ? new Date(user.lastLogin).toLocaleString() : 'Unknown'
        }));

        return res.json(formattedUsers);
    } catch (err) {
        console.error('[ERROR] Get online users error:', err);
        res.status(500).json({ error: 'Failed to fetch online users', details: err.message });
    }
});

// --- APPROVAL REQUEST ENDPOINTS ---

// Create approval request
app.post('/api/approvals/request', async (req, res) => {
    try {
        const { action, details, requesterUsername, requesterRole, assignedUsername } = req.body;
        
        if (!action || !requesterUsername || !requesterRole) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        let assignedRole = null;
        let finalAssignedUsername = assignedUsername || null;
        
        // If a specific user was selected, find their role
        if (finalAssignedUsername) {
            const targetUser = await User.findOne({ username: finalAssignedUsername });
            if (targetUser) {
                assignedRole = targetUser.role;
            }
        }

        // Fallback: Dynamically determine assignedRole if no specific user selected
        if (!assignedRole) {
            // Priority: 1) Online GM, 2) Online Admin
            try {
                const gmOnline = await User.findOne({ role: 'gm', isOnline: true });
                if (gmOnline) {
                    assignedRole = 'gm';
                } else {
                    const adminOnline = await User.findOne({ role: 'admin', isOnline: true });
                    if (adminOnline) {
                        assignedRole = 'admin';
                    }
                }
            } catch (err) {
                console.warn('[WARN] Error checking online users:', err);
            }
        }
        
        // Final fallback
        if (!assignedRole) {
            assignedRole = 'gm';
        }

        const approvalRequest = new ApprovalRequest({
            action,
            details: details || {},
            requesterUsername,
            requesterRole,
            assignedRole,
            assignedUsername: finalAssignedUsername
        });

        await approvalRequest.save();
        console.log(`[OK] Approval request created: ${approvalRequest._id} (Assigned to ${finalAssignedUsername || assignedRole})`);
        return res.json({ success: true, requestId: approvalRequest._id, assignedRole, assignedUsername: finalAssignedUsername });
    } catch (err) {
        console.error('[ERROR] Create approval request error:', err);
        res.status(500).json({ error: 'Failed to create approval request', details: err.message });
    }
});

// Get pending approvals for a specific role/user
app.get('/api/approvals/pending', async (req, res) => {
    try {
        const { role, username } = req.query;
        
        if (!role) {
            return res.status(400).json({ error: 'Role required' });
        }

        const normalizedRole = role.toLowerCase();
        
        // Find requests that are:
        // 1. Assigned to this specific username
        // 2. OR Assigned to this role AND no specific username is assigned
        const query = {
            status: 'PENDING',
            $or: [
                { assignedUsername: username },
                { assignedRole: normalizedRole, assignedUsername: { $exists: false } },
                { assignedRole: normalizedRole, assignedUsername: null }
            ]
        };

        const pending = await ApprovalRequest.find(query).lean();
        return res.json(pending);
    } catch (err) {
        console.error('[ERROR] Get pending approvals error:', err);
        res.status(500).json({ error: 'Failed to fetch pending approvals', details: err.message });
    }
});

// Check approval request status
app.get('/api/approvals/status/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const request = await ApprovalRequest.findById(id).lean();
        
        if (!request) {
            return res.status(404).json({ error: 'Request not found' });
        }

        return res.json({ status: request.status });
    } catch (err) {
        console.error('[ERROR] Get approval status error:', err);
        res.status(500).json({ error: 'Failed to fetch approval status', details: err.message });
    }
});

// Approve/Reject approval request
/**
 * ATOMIC EXECUTION: Execute the approved action on the database
 * Returns true if execution successful, false otherwise
 */
async function executeApprovedAction(actionType, details) {
    try {
        console.log(`[EXEC] 🚀 Executing approved action: ${actionType}`, details);
        
        switch(actionType) {
            case 'deleteProduct': {
                const { productId } = details;
                if (!productId) throw new Error('productId missing from details');
                console.log(`[EXEC] 🗑️  Deleting product: ${productId}`);
                const result = await Product.findByIdAndDelete(productId);
                if (!result) throw new Error('Product not found');
                console.log(`[EXEC] ✅ Product deleted successfully: ${productId}`);
                return true;
            }
            
            case 'editProduct': {
                const { productId, changes } = details;
                if (!productId || !changes) throw new Error('productId or changes missing from details');
                console.log(`[EXEC] ✏️  Updating product: ${productId}`, changes);
                const result = await Product.findByIdAndUpdate(productId, changes, { new: true });
                if (!result) throw new Error('Product not found');
                console.log(`[EXEC] ✅ Product updated successfully: ${productId}`);
                return true;
            }
            
            case 'processReturn': {
                const { saleId, itemsToReturn, returnType, fullReason, totalCredit } = details;
                if (!saleId || !itemsToReturn) throw new Error('saleId or itemsToReturn missing from details');
                console.log(`[EXEC] 🔄 Processing return for sale: ${saleId}, items: ${itemsToReturn.length}`);
                
                // Find the sale
                const sale = await Sale.findById(saleId);
                if (!sale) throw new Error('Sale not found');
                
                // Process each return
                const returnNumbers = [];
                for (const returnItem of itemsToReturn) {
                    // Create return record
                    const returnCount = await Return.countDocuments();
                    const returnNumber = `RET-${1000 + returnCount + 1}`;
                    returnNumbers.push(returnNumber);
                    
                    const newReturn = new Return({
                        returnNumber,
                        originalInvoiceNumber: `${sale.invoicePrefix}${sale.invoiceNumber}`,
                        originalSaleId: saleId,
                        barcode: returnItem.barcode,
                        itemName: returnItem.name,
                        returnDate: new Date(),
                        qty: returnItem.qty,
                        refundAmount: returnItem.price * returnItem.qty,
                        reason: fullReason,
                        returnType,
                        customerName: sale.customerName || 'Walk-in',
                        isUsed: false
                    });
                    await newReturn.save();
                    
                    // Update product stock
                    if (!returnItem.isCustom) {
                        const product = await Product.findById(returnItem.productId);
                        if (product) {
                            const newTotalStock = product.stock + returnItem.qty;
                            const newSizeStock = product.sizeStock ? { ...product.sizeStock } : {};
                            if (returnItem.size && newSizeStock[returnItem.size] !== undefined) {
                                newSizeStock[returnItem.size] += returnItem.qty;
                            }
                            await Product.findByIdAndUpdate(returnItem.productId, { 
                                stock: newTotalStock, 
                                sizeStock: newSizeStock 
                            });
                        }
                    }
                }
                console.log(`[EXEC] ✅ Return processed successfully, return numbers: ${returnNumbers.join(', ')}`);
                return true;
            }
            
            default:
                throw new Error(`Unknown action type: ${actionType}`);
        }
    } catch (err) {
        console.error(`[EXEC] ❌ Execution failed for ${actionType}:`, err);
        return false;
    }
}

app.post('/api/approvals/respond', async (req, res) => {
    try {
        const { requestId, approverUsername, approverPassword, action } = req.body;
        
        if (!requestId || !approverUsername || !approverPassword || !action) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        // Find the approval request
        const request = await ApprovalRequest.findById(requestId);
        if (!request || request.status !== 'PENDING') {
            return res.status(404).json({ error: 'Request not found or already processed' });
        }

        // Verify approver exists and password is correct
        const approver = await User.findOne({ username: approverUsername });
        if (!approver) {
            return res.status(400).json({ error: 'Approver not found' });
        }

        // Simple password check (in production, use bcrypt comparison)
        if (approver.password !== approverPassword) {
            return res.status(401).json({ error: 'Invalid password' });
        }

        // CRITICAL: If APPROVED, execute the action BEFORE marking as complete
        let executionSuccess = false;
        let auditStatus = 'REJECTED';
        
        if (action === 'approve') {
            console.log(`[APPROVAL] 🔄 Processing approval for request: ${requestId}, action: ${request.action}`);
            executionSuccess = await executeApprovedAction(request.action, request.details);
            
            if (!executionSuccess) {
                console.error(`[APPROVAL] ❌ Execution failed, rejecting approval`);
                return res.status(500).json({ 
                    error: 'Failed to execute approved action', 
                    details: 'The action could not be completed in the database'
                });
            }
            auditStatus = 'EXECUTED';
            console.log(`[APPROVAL] ✅ Action executed successfully`);
        }

        // Update request status
        const newStatus = action === 'approve' ? 'APPROVED' : 'REJECTED';
        request.status = newStatus;
        request.assignedUsername = approverUsername;
        request.respondedAt = new Date();
        await request.save();

        // Create audit log ONLY AFTER successful execution
        const auditLog = new AuditLog({
            action: request.action,
            requesterUsername: request.requesterUsername,
            requesterRole: request.requesterRole,
            approverUsername: approverUsername,
            approverRole: approver.role,
            details: request.details,
            status: auditStatus
        });
        await auditLog.save();

        console.log(`[APPROVAL] ✅ Approval completed: ${newStatus}, audit status: ${auditStatus}`);
        return res.json({ success: true, status: newStatus });
    } catch (err) {
        console.error('[ERROR] Respond to approval error:', err);
        res.status(500).json({ error: 'Failed to respond to approval', details: err.message });
    }
});

// Create audit log entry
app.post('/api/audit-logs', async (req, res) => {
    try {
        const { action, requesterUsername, requesterRole, details, status, approverUsername, approverRole } = req.body;
        
        const logEntry = new AuditLog({
            timestamp: new Date(),
            action: action,
            requesterUsername: requesterUsername,
            requesterRole: requesterRole,
            approverUsername: approverUsername || null,
            approverRole: approverRole || null,
            details: details || {},
            status: status || 'EXECUTED'
        });
        
        await logEntry.save();
        return res.json({ success: true, logId: logEntry._id });
    } catch (err) {
        console.error('[ERROR] Create audit log error:', err);
        res.status(500).json({ error: 'Failed to create audit log', details: err.message });
    }
});

// Get audit logs
app.get('/api/audit-logs', async (req, res) => {
    try {
        const { limit = 100, skip = 0 } = req.query;
        
        const logs = await AuditLog.find()
            .sort({ timestamp: -1 })
            .limit(parseInt(limit))
            .skip(parseInt(skip))
            .lean();

        return res.json(logs);
    } catch (err) {
        console.error('[ERROR] Get audit logs error:', err);
        res.status(500).json({ error: 'Failed to fetch audit logs', details: err.message });
    }
});

const PORT = process.env.PORT || 5000;
const HOST = '0.0.0.0';
app.listen(PORT, HOST, () => {
    console.log(`[SERVER] Hesa POS Server running on http://${HOST}:${PORT}`);
});
