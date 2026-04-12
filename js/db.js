// Dexie Wrapper over Express API
// Preserves EXACT frontend logic by intercepting db calls and forwarding to backend

class DBWrapper {
    constructor(collection) {
        this.collection = collection;
        this._whereConfig = null;
        this._orderByConfig = null;
        this._limitConfig = null;
        this._reverseConfig = false;
    }

    _reset() {
        this._whereConfig = null;
        this._orderByConfig = null;
        this._limitConfig = null;
        this._reverseConfig = false;
    }

    async _fetch(action, data = {}) {
        const payload = {
            where: this._whereConfig,
            orderBy: this._orderByConfig,
            limit: this._limitConfig,
            reverse: this._reverseConfig,
            ...data
        };
        this._reset();
        try {
            const API_URL = '/api';
            const res = await fetch(`${API_URL}/dexie/${this.collection}/${action}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            if (!res.ok) throw new Error(await res.text());
            return await res.json();
        } catch (e) {
            console.error(e);
            throw e;
        }
    }

    // Dexie Chain Methods
    where(field) {
        this._whereConfig = { field };
        return this;
    }
    equals(value) {
        if(this._whereConfig) this._whereConfig.op = 'equals';
        if(this._whereConfig) this._whereConfig.value = value;
        return this;
    }
    below(value) {
        if(this._whereConfig) this._whereConfig.op = 'below';
        if(this._whereConfig) this._whereConfig.value = value;
        return this;
    }
    between(lower, upper, includeLower, includeUpper) {
        if(this._whereConfig) {
            this._whereConfig.op = 'between';
            this._whereConfig.value = [lower, upper];
            this._whereConfig.include = [includeLower, includeUpper];
        }
        return this;
    }
    orderBy(field) {
        this._orderByConfig = field;
        return this;
    }
    reverse() {
        this._reverseConfig = true;
        return this;
    }
    limit(number) {
        this._limitConfig = number;
        return this;
    }

    // Dexie Action Methods
    async toArray() { return this._fetch('toArray'); }
    async first() { return this._fetch('first'); }
    async count() {
        const res = await this._fetch('count');
        return res ? res.count : 0;
    }
    async add(item) {
        const res = await this._fetch('add', { data: item });
        return res ? res.id : null;
    }
    async bulkAdd(items) { return this._fetch('bulkAdd', { data: items }); }
    async update(id, changes) { return this._fetch('update', { id, data: changes }); }
    async delete(id) { return this._fetch('delete', { id }); }
    async get(id) { return this._fetch('get', { id }); }
    filter(predicateFn) {
        // App.js uses db.products.filter(p => ...).toArray()
        // We will fetch ALL products and filter in memory to strictly preserve logic without rewriting queries
        const self = this;
        return {
            async toArray() {
                const all = await self._fetch('toArray');
                return all.filter(predicateFn);
            }
        };
    }
}

const db = {
    products: new DBWrapper('products'),
    sales: new DBWrapper('sales'),
    returns: new DBWrapper('returns'),
    customers: new DBWrapper('customers'),
    users: new DBWrapper('users'),
    logs: new DBWrapper('logs'),
    codeRanges: new DBWrapper('codeRanges'),
    pending_carts: new DBWrapper('pending_carts'),
    
    // Dexie specific setups we can mock
    version(v) {
        return this;
    },
    stores(s) {
        return this;
    },
    on(event, cb) {
        if (event === 'populate' || event === 'ready') {
            // Can be called immediately or simulated
            setTimeout(() => {
                try { cb(); } catch(e){}
            }, 1000);
        }
    },
    open() {
        return Promise.resolve();
    },
    // Mock dexie transaction to find the callback (last argument) and execute it
    async transaction(mode, ...args) {
        const callback = args[args.length - 1];
        if (typeof callback !== 'function') {
            console.error('[DB] Transaction error: No callback function provided.');
            return;
        }
        try {
            return await callback();
        } catch (e) {
            console.error('[DB] Transaction error:', e);
            throw e;
        }
    }
};

window.db = db;
