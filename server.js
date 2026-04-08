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
    useNewUrlParser: true,
    useUnifiedTopology: true,
    serverSelectionTimeoutMS: 30000
})
.then(() => console.log('[OK] MongoDB Connected'))
.catch(err => console.error('[ERROR] MongoDB Connection Failed:', err));

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
    image: { type: String }
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
    returnCredit: { type: Number, default: 0 },
    returnBillNo: { type: String }
}, { timestamps: true });
const Sale = mongoose.model('Sale', saleSchema);

const returnSchema = new mongoose.Schema({
    returnNumber: { type: String, required: true },
    originalInvoiceNumber: { type: String, required: true },
    barcode: { type: String, required: true },
    returnDate: { type: Date, default: Date.now },
    refundAmount: { type: Number, required: true },
    reason: { type: String },
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
    role: { type: String, required: true }
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

// --- GENERIC API ROUTES TO MIMIC DEXIE API ---

const models = {
    products: Product,
    sales: Sale,
    returns: Return,
    customers: Customer,
    users: User,
    logs: Log,
    codeRanges: CodeRange,
    pending_carts: PendingCart
};

// Serve main HTML file
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'HESA_POS.html'));
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

const PORT = process.env.PORT || 5000;
const HOST = '0.0.0.0';
app.listen(PORT, HOST, () => {
    console.log(`[SERVER] Hesa POS Server running on http://${HOST}:${PORT}`);
});
