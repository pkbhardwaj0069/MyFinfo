/**
 * My Finfo Data Management & State
 */

const FinData = {
    // Initial Configuration
    defaults: {
        theme: {
            bg: '#f8fafc',
            accent: '#0ea5e9',
            text: '#0f172a',
            textMuted: '#64748b',
            fontSize: 16,
            headerHeight: 70,
            isDark: false
        },
        banks: [
            { bankName: 'Chase', name: 'Primary Checking', type: 'Saving', openingBalance: 5000, status: 'Active', synced: true },
            { bankName: 'BofA', name: 'Emergency Savings', type: 'Saving', openingBalance: 12000, status: 'Active', synced: true },
            { bankName: 'Wise', name: 'Global Wallet', type: 'Checking', openingBalance: 850, status: 'Active', synced: true }
        ],
        categories: {
            Income: [
                { name: 'Salary', subCategories: ['Monthly Base', 'Performance Bonus'], status: 'Active', synced: true },
                { name: 'Freelance', subCategories: ['Web Design', 'Consulting'], status: 'Active', synced: true }
            ],
            Expense: [
                { name: 'Housing', subCategories: ['Rent', 'Maintenance', 'Insurance'], status: 'Active', synced: true },
                { name: 'Transport', subCategories: ['Fuel', 'Public Transit', 'Uber/Lyft'], status: 'Active', synced: true },
                { name: 'Food', subCategories: ['Groceries', 'Dining Out'], status: 'Active', synced: true }
            ],
            Investment: [
                { name: 'Equity', subCategories: ['Stocks', 'ETFs'], status: 'Active', synced: true },
                { name: 'Crypto', subCategories: ['BTC', 'ETH', 'Altcoins'], status: 'Active', synced: true }
            ],
            Ledger: [
                { name: 'Friends & Family', subCategories: ['Loans Debited', 'Loans Credited'], status: 'Active', synced: true },
                { name: 'Returned', subCategories: [], status: 'Active', synced: true }
            ],
            Transfer: [
                { name: 'Self Transfer', subCategories: ['Own Accounts', 'Other'], status: 'Active', synced: true }
            ]
        },
        accountTypes: ['Saving', 'Current', 'Credit Card', 'Investment'],
        accountHeads: ['Saving Account', 'Cash Wallet', 'Credit Card', 'Investment', 'Loan', 'Insurance']
    },

    // State Persistence
    storage: {
        save: (key, data) => localStorage.setItem(`finos_${key}`, JSON.stringify(data)),
        load: (key) => {
            const data = localStorage.getItem(`finos_${key}`);
            return data ? JSON.parse(data) : null;
        }
    },

    // Initialize State
    init() {
        // One-time clear of transactional data
        if (!localStorage.getItem('finos_db_cleared_v3')) {
            localStorage.removeItem('finos_transactions');
            localStorage.removeItem('finos_upcoming_expenses');
            localStorage.removeItem('finos_staging_transactions');
            localStorage.setItem('finos_db_cleared_v3', 'true');
        }

        this.config = this.storage.load('config') || {
            sheetUrl: '',
            driveFolder: '',
            theme: { ...this.defaults.theme },
            appInfo: {
                dateFormat: 'DD-MMM-YYYY',
                timeFormat: '24h',
                currency: '₹',
                logoUrl: 'https://cdn-icons-png.flaticon.com/512/2845/2845873.png',
                appUrl: '',
                description: ''
            }
        };

        // Migration for appInfo
        if (!this.config.appInfo) {
            this.config.appInfo = {
                dateFormat: 'DD-MMM-YYYY',
                timeFormat: '24h',
                currency: '₹',
                logoUrl: 'https://cdn-icons-png.flaticon.com/512/2845/2845873.png',
                appUrl: '',
                description: ''
            };
        }

        // Initialize default Gmail custom sync rules (Paytm + US Banks defaults)
        if (!this.config.gmailSyncRules) {
            this.config.gmailSyncRules = [
                {
                    id: 'RULE-PAYTM-EXPENSE',
                    name: 'Paytm Expense Notifications',
                    from: 'alerts@paytm.com',
                    subject: 'Paytm',
                    type: 'Expense',
                    amountRegex: '(?:Paid|Sent|Debited|Transferred)\\s+(?:Rs\\.?|INR)\\s*([\\d,]+(?:\\.\\d{2})?)',
                    notesRegex: '(?:to|at)\\s+([^.\\n]+)',
                    defaultBank: 'Paytm UPI',
                    defaultCategory: 'Food',
                    defaultSubCategory: 'Groceries',
                    notesTemplate: 'Paytm UPI Debit: {payee} (Amt: {amount})'
                },
                {
                    id: 'RULE-PAYTM-INCOME',
                    name: 'Paytm Income Notifications',
                    from: 'alerts@paytm.com',
                    subject: 'Paytm',
                    type: 'Income',
                    amountRegex: '(?:Received|Added|Credited)\\s+(?:Rs\\.?|INR)\\s*([\\d,]+(?:\\.\\d{2})?)',
                    notesRegex: '(?:from|by)\\s+([^.\\n]+)',
                    defaultBank: 'Paytm UPI',
                    defaultCategory: 'Freelance',
                    defaultSubCategory: 'Consulting',
                    notesTemplate: 'Paytm Wallet Received: {payee} (Amt: {amount})'
                },
                {
                    id: 'RULE-CHASE-EXPENSE',
                    name: 'Chase Bank Expense Alerts',
                    from: 'no-reply@chase.com',
                    subject: 'transaction',
                    type: 'Expense',
                    amountRegex: '(?:charged|spent|transaction of|debit of|debit card purchase of)\\s+(?:\\$|USD)\\s*([\\d,]+(?:\\.\\d{2})?)',
                    notesRegex: 'at\\s+([^.\\n\\r]+)',
                    defaultBank: 'Primary Checking',
                    defaultCategory: 'Housing',
                    defaultSubCategory: 'Rent',
                    notesTemplate: 'Chase Spend: {payee} ({amount})'
                },
                {
                    id: 'RULE-BOFA-EXPENSE',
                    name: 'Bank of America Expense Alerts',
                    from: 'ealerts.bankofamerica.com',
                    subject: 'transaction',
                    type: 'Expense',
                    amountRegex: '(?:amount of|charge of|withdrew|debit of)\\s+(?:\\$|USD)\\s*([\\d,]+(?:\\.\\d{2})?)',
                    notesRegex: 'at\\s+([^.\\n\\r]+)',
                    defaultBank: 'Emergency Savings',
                    defaultCategory: 'Food',
                    defaultSubCategory: 'Dining Out',
                    notesTemplate: 'BofA Spend at {payee} ({amount})'
                },
                {
                    id: 'RULE-WELLSFARGO-EXPENSE',
                    name: 'Wells Fargo Expense Alerts',
                    from: 'alerts@wellsfargo.com',
                    subject: 'alert',
                    type: 'Expense',
                    amountRegex: '(?:purchase of|withdrawal of|amount of)\\s+(?:\\$|USD)\\s*([\\d,]+(?:\\.\\d{2})?)',
                    notesRegex: 'at\\s+([^.\\n\\r]+)',
                    defaultBank: 'Primary Checking',
                    defaultCategory: 'Transport',
                    defaultSubCategory: 'Uber/Lyft',
                    notesTemplate: 'Wells Fargo Spends at {payee} ({amount})'
                }
            ];
        }

        // Migrate existing rules to include defaultSubCategory & notesTemplate
        if (this.config.gmailSyncRules && Array.isArray(this.config.gmailSyncRules)) {
            let migrated = false;
            this.config.gmailSyncRules.forEach(rule => {
                if (!rule.defaultSubCategory) {
                    if (rule.id === 'RULE-PAYTM-EXPENSE') {
                        rule.defaultCategory = 'Food';
                        rule.defaultSubCategory = 'Groceries';
                    } else if (rule.id === 'RULE-PAYTM-INCOME') {
                        rule.defaultCategory = 'Freelance';
                        rule.defaultSubCategory = 'Consulting';
                    } else if (rule.id === 'RULE-CHASE-EXPENSE') {
                        rule.defaultCategory = 'Housing';
                        rule.defaultSubCategory = 'Rent';
                    } else if (rule.id === 'RULE-BOFA-EXPENSE') {
                        rule.defaultCategory = 'Food';
                        rule.defaultSubCategory = 'Dining Out';
                    } else if (rule.id === 'RULE-WELLSFARGO-EXPENSE') {
                        rule.defaultCategory = 'Transport';
                        rule.defaultSubCategory = 'Uber/Lyft';
                    } else {
                        // General fallback mapping
                        const typeCats = this.masters?.categories?.[rule.type] || this.defaults.categories[rule.type] || [];
                        const activeCat = typeCats.find(c => c.name === rule.defaultCategory) || typeCats[0];
                        if (activeCat) {
                            rule.defaultCategory = activeCat.name;
                            rule.defaultSubCategory = activeCat.subCategories?.[0] || 'Other';
                        } else {
                            rule.defaultCategory = 'Other';
                            rule.defaultSubCategory = 'Other';
                        }
                    }
                    migrated = true;
                }
                if (!rule.notesTemplate) {
                    if (rule.id === 'RULE-PAYTM-EXPENSE') {
                        rule.notesTemplate = 'Paytm UPI Debit: {payee} (Amt: {amount})';
                    } else if (rule.id === 'RULE-PAYTM-INCOME') {
                        rule.notesTemplate = 'Paytm Wallet Received: {payee} (Amt: {amount})';
                    } else if (rule.id === 'RULE-CHASE-EXPENSE') {
                        rule.notesTemplate = 'Chase Spend: {payee} ({amount})';
                    } else if (rule.id === 'RULE-BOFA-EXPENSE') {
                        rule.notesTemplate = 'BofA Spend at {payee} ({amount})';
                    } else if (rule.id === 'RULE-WELLSFARGO-EXPENSE') {
                        rule.notesTemplate = 'Wells Fargo Spends at {payee} ({amount})';
                    } else {
                        rule.notesTemplate = 'Gmail Sync: {payee}';
                    }
                    migrated = true;
                }
                if (!rule.placeholders) {
                    rule.placeholders = [];
                    migrated = true;
                }
                if (rule.easyMode === undefined) {
                    rule.easyMode = false;
                    rule.templateText = "";
                    migrated = true;
                }
            });
            if (migrated) {
                this.saveConfig({ gmailSyncRules: this.config.gmailSyncRules });
            }
        }

        if (this.config.gmailFolder === undefined) {
            this.config.gmailFolder = '';
        }

        if (this.config.gmailFolderAll === undefined) {
            this.config.gmailFolderAll = false;
        }

        this.masters = this.storage.load('masters') || {
            banks: [...this.defaults.banks],
            categories: { ...this.defaults.categories },
            accountTypes: [...this.defaults.accountTypes],
            accountHeads: [...this.defaults.accountHeads]
        };

        // Migration for existing users
        if (!this.masters.accountTypes) {
            this.masters.accountTypes = [...this.defaults.accountTypes];
        }
        if (!this.masters.accountHeads) {
            this.masters.accountHeads = [...this.defaults.accountHeads];
        }

        // Migration for Ledger categories (rename 'Return' to 'Returned')
        if (this.masters && this.masters.categories && this.masters.categories.Ledger) {
            let hasReturned = this.masters.categories.Ledger.some(c => c.name === 'Returned');
            let returnIndex = this.masters.categories.Ledger.findIndex(c => c.name === 'Return');
            if (returnIndex > -1) {
                if (!hasReturned) {
                    this.masters.categories.Ledger[returnIndex].name = 'Returned';
                } else {
                    this.masters.categories.Ledger.splice(returnIndex, 1);
                }
                this.storage.save('masters', this.masters);
            } else if (!hasReturned) {
                this.masters.categories.Ledger.push({ name: 'Returned', subCategories: [], status: 'Active', synced: true });
                this.storage.save('masters', this.masters);
            }
        }

        if (this.masters && this.masters.categories && !this.masters.categories.Transfer) {
            this.masters.categories.Transfer = [...this.defaults.categories.Transfer];
            this.storage.save('masters', this.masters);
        }

        this.transactions = this.storage.load('transactions') || [];

        // Migration for existing transactions category "Return" -> "Returned"
        if (this.transactions && Array.isArray(this.transactions)) {
            let txsMigrated = false;
            this.transactions.forEach(t => {
                if (t.type === 'Ledger' && t.category === 'Return') {
                    t.category = 'Returned';
                    txsMigrated = true;
                }
            });
            if (txsMigrated) {
                this.saveTransactions();
            }
        }

        this.upcomingExpenses = this.storage.load('upcoming_expenses') || [];
        this.stagingTransactions = this.storage.load('staging_transactions') || [];
    },

    saveStagingTransactions() {
        this.storage.save('staging_transactions', this.stagingTransactions);
    },

    // CRUD Operations
    addAccountType(type) {
        if (!this.masters.accountTypes.includes(type)) {
            this.masters.accountTypes.push(type);
            this.storage.save('masters', this.masters);
        }
    },

    addAccountHead(head) {
        if (!this.masters.accountHeads.includes(head)) {
            this.masters.accountHeads.push(head);
            this.storage.save('masters', this.masters);
        }
    },

    // CRUD Operations
    addTransaction(data) {
        const transaction = {
            id: 'TXN-' + Date.now(),
            timestamp: new Date().toISOString(),
            status: 'Verified',
            ...data
        };
        this.transactions.unshift(transaction);
        this.storage.save('transactions', this.transactions);
        return transaction;
    },

    deleteTransaction(index) {
        this.transactions.splice(index, 1);
        this.saveTransactions();
    },

    saveTransactions() {
        this.storage.save('transactions', this.transactions);
    },

    addUpcomingExpense(data) {
        const upcoming = {
            id: 'UPC-' + Date.now(),
            timestamp: new Date().toISOString(),
            ...data
        };
        this.upcomingExpenses.unshift(upcoming);
        this.saveUpcomingExpenses();
        return upcoming;
    },

    deleteUpcomingExpense(id) {
        const index = this.upcomingExpenses.findIndex(u => u.id === id);
        if (index > -1) {
            this.upcomingExpenses.splice(index, 1);
            this.saveUpcomingExpenses();
        }
    },

    saveUpcomingExpenses() {
        this.storage.save('upcoming_expenses', this.upcomingExpenses);
    },

    updateMaster(type, category, items) {
        if (type === 'bank') {
            this.masters.banks = items;
        } else {
            this.masters.categories[category] = items;
        }
        this.storage.save('masters', this.masters);
    },

    saveConfig(newConfig) {
        this.config = { ...this.config, ...newConfig };
        this.storage.save('config', this.config);
    },

    // Calculation Helpers
    getTotalsByFilter(filter, period = 'month') {
        const now = new Date();
        const currentYear = now.getFullYear();
        const currentMonth = now.getMonth();

        if (!this.transactions || !Array.isArray(this.transactions)) return { total: 0, count: 0, records: [] };
        const filtered = this.transactions.filter(t => {
            if (!t) return false;
            // Check if account has dashboard auth required
            const account = this.masters.banks.find(b => b.name === t.bank);
            if (account && account.authDashboard) return false;

            // Filter by Period
            if (filter !== 'ledger' && t.date) {
                const tDate = new Date(t.date);
                if (!isNaN(tDate.getTime())) {
                    if (period === 'month') {
                        if (tDate.getFullYear() !== currentYear || tDate.getMonth() !== currentMonth) {
                            return false;
                        }
                    } else if (period === 'year') {
                        if (tDate.getFullYear() !== currentYear) {
                            return false;
                        }
                    }
                }
            }

            if (filter === 'income') return t.type === 'Income';
            if (filter === 'expense') return t.type === 'Expense';
            if (filter === 'upcoming') return new Date(t.date) > now;
            if (filter === 'investment') return t.type === 'Investment';
            if (filter === 'ledger') return t.type === 'Ledger';
            return true;
        });

        return {
            total: filtered.reduce((sum, t) => sum + parseFloat(t.amount || 0), 0),
            count: filtered.length,
            records: filtered
        };
    },

    getNetWorth() {
        let netWorth = 0;
        this.masters.banks.forEach(acc => {
            if (acc.isActive !== false && !acc.authDashboard) {
                let balance = parseFloat(acc.openingBalance || 0);
                if (!this.transactions || !Array.isArray(this.transactions)) return;
                this.transactions.forEach(t => {
                    if (!t) return;
                    const amt = parseFloat(t.amount || 0);
                    if (t.type === 'Transfer') {
                        if (t.fromBank === acc.name) balance -= amt;
                        if (t.toBank === acc.name) balance += amt;
                    } else if (t.bank === acc.name) {
                        if (t.type === 'Income') balance += amt;
                        else if (t.type === 'Expense') balance -= amt;
                        else if (t.type === 'Investment') balance -= amt;
                        else if (t.type === 'Ledger') {
                            const wAmt = parseFloat(t.withdrawalAmount || 0);
                            const dAmt = parseFloat(t.depositAmount || 0);
                            if (wAmt > 0) balance -= wAmt;
                            else if (dAmt > 0) balance += dAmt;
                            else {
                                const sub = (t.subCategory || '').toLowerCase();
                                const cat = (t.category || '').toLowerCase();
                                if (sub.includes('given') || sub.includes('debited') || cat.includes('lend')) balance -= amt;
                                else if (sub.includes('taken') || sub.includes('credited') || cat.includes('borrow') || cat.includes('return')) balance += amt;
                            }
                        }
                    }
                });
                netWorth += balance;
            }
        });
        return netWorth;
    }
};

// Initialize on Load
FinData.init();
