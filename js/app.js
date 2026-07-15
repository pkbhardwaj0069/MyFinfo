/**
 * My Finfo Application Logic
 */

function getCssVar(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

document.addEventListener('DOMContentLoaded', () => {
    // UI Elements
    const authOverlay = document.getElementById('auth-overlay');
    const appShell = document.getElementById('app-shell');
    const loginBtn = document.getElementById('google-login-btn');
    const navItems = document.querySelectorAll('.nav-item');
    const screens = document.querySelectorAll('.screen');
    const screenTitle = document.getElementById('current-screen-title');

    // Theme Elements
    const themeInputs = {
        bg: document.getElementById('theme-bg'),
        accent: document.getElementById('theme-accent'),
        text: document.getElementById('theme-text'),
        fontSize: document.getElementById('theme-font-size'),
        headerHeight: document.getElementById('theme-header-height')
    };

    let mainChart = null;
    let distChart = null;
    let accChart = null;
    let currentEditIndex = -1;
    let activePeriod = 'month';
    let isEditingUpcoming = false;
    let editingUpcomingId = null;
    let isCaptureUpcoming = false;
    let currentDetailsData = [];
    let currentDetailsConfig = {};
    let selectedRuleId = null;
    let isAddingNewRule = false;

    // --- INITIALIZATION ---
    function init() {
        applyTheme(FinData.config.theme);
        applyAppInfo(FinData.config.appInfo);
        checkAuth();
        initGoogleAuth();
        renderMasters();
        updateDashboard();

        // Bind KPI cards for interactive details modal
        const cardNetWorth = document.getElementById('kpi-net-worth-card');
        const cardTotal = document.getElementById('kpi-total-amount-card');
        const cardTake = document.getElementById('kpi-ledger-take-card');
        const cardGive = document.getElementById('kpi-ledger-give-card');

        if (cardNetWorth) cardNetWorth.addEventListener('click', showNetWorthDetails);
        if (cardTotal) cardTotal.addEventListener('click', showTotalDetails);
        if (cardTake) cardTake.addEventListener('click', showLedgerTakeDetails);
        if (cardGive) cardGive.addEventListener('click', showLedgerGiveDetails);

        // Bind Auth Config panel toggle
        const authConfigToggle = document.getElementById('auth-config-toggle');
        const authConfigPanel = document.getElementById('auth-config-panel');
        const authClientIdInput = document.getElementById('auth-client-id-input');
        const authClientIdSaveBtn = document.getElementById('auth-client-id-save-btn');

        if (authClientIdInput) {
            authClientIdInput.value = FinData.config.gmailClientId || '';
        }

        authConfigToggle?.addEventListener('click', () => {
            const isHidden = authConfigPanel.style.display === 'none' || authConfigPanel.classList.contains('hidden');
            if (isHidden) {
                authConfigPanel.style.display = 'flex';
                authConfigPanel.classList.remove('hidden');
            } else {
                authConfigPanel.style.display = 'none';
                authConfigPanel.classList.add('hidden');
            }
        });

        authClientIdSaveBtn?.addEventListener('click', () => {
            const val = authClientIdInput?.value?.trim() || '';
            if (!val) {
                alert('Please enter a valid Google Web Client ID.');
                return;
            }
            FinData.saveConfig({ gmailClientId: val });
            
            // Sync with Integrations input
            const integrationsClientIdInput = document.getElementById('gmail-client-id');
            if (integrationsClientIdInput) {
                integrationsClientIdInput.value = val;
            }
            
            alert('Google Client ID saved successfully! Re-activating page...');
            location.reload();
        });



        // Bind frequency pill items
        document.querySelectorAll('#frequency-pills .pill-item').forEach(pill => {
            pill.addEventListener('click', () => {
                document.querySelectorAll('#frequency-pills .pill-item').forEach(p => p.classList.remove('active'));
                pill.classList.add('active');
                document.getElementById('trans-frequency').value = pill.getAttribute('data-frequency');
                updateUpcomingDatesState();
            });
        });
    }

    function updateUpcomingDatesState() {
        const freq = document.getElementById('trans-frequency').value;
        const billingDateInput = document.getElementById('trans-billing-date');
        const dueDateInput = document.getElementById('trans-due-date');

        if (!billingDateInput || !dueDateInput) return;

        if (freq === 'Daily') {
            const todayDay = new Date().getDate();
            billingDateInput.value = todayDay;
            dueDateInput.value = todayDay;

            billingDateInput.disabled = true;
            dueDateInput.disabled = true;
            billingDateInput.style.opacity = '0.5';
            billingDateInput.style.cursor = 'not-allowed';
            dueDateInput.style.opacity = '0.5';
            dueDateInput.style.cursor = 'not-allowed';
        } else {
            billingDateInput.disabled = false;
            dueDateInput.disabled = false;
            billingDateInput.style.opacity = '1';
            billingDateInput.style.cursor = 'default';
            dueDateInput.style.opacity = '1';
            dueDateInput.style.cursor = 'default';
        }
    }

    // --- AUTH LOGIC (REAL GOOGLE LOGIN) ---
    function initGoogleAuth() {
        // Wait for the Google script to be fully loaded
        if (typeof google === 'undefined' || !google.accounts) {
            console.log('Waiting for Google Identity Services...');
            setTimeout(initGoogleAuth, 500);
            return;
        }

        // Read Client ID from config
        const clientId = FinData.config.gmailClientId || '';

        // Check if a real Client ID is available
        const isPlaceholderOrEmpty = !clientId || clientId.trim() === '' || clientId.includes('YOUR_CLIENT_ID');

        const signinContainer = document.getElementById('g_id_signin');
        const divider = document.querySelector('.auth-divider');

        if (isPlaceholderOrEmpty) {
            console.warn('Google Sign-In: No valid Google Client ID configured.');
            if (signinContainer) signinContainer.style.display = 'none';
            if (divider) divider.style.display = 'none';
            return;
        }

        // If valid, show button container and divider
        if (signinContainer) signinContainer.style.display = 'block';
        if (divider) divider.style.display = 'flex';

        try {
            google.accounts.id.initialize({
                client_id: clientId,
                callback: handleGoogleResponse,
                auto_select: false,
                cancel_on_tap_outside: true
            });

            google.accounts.id.renderButton(
                document.getElementById('g_id_signin'),
                {
                    theme: 'outline',
                    size: 'large',
                    width: '320',
                    text: 'signin_with',
                    shape: 'rectangular'
                }
            );
            console.log('Google Sign-In Initialized successfully with client ID:', clientId);
        } catch (err) {
            console.error('Google Auth Initialization Failed:', err);
        }
    }

    function handleGoogleResponse(response) {
        const userData = parseJwt(response.credential);
        const user = {
            name: userData.name,
            email: userData.email,
            picture: userData.picture
        };
        localStorage.setItem('finos_user', JSON.stringify(user));
        showApp(user);
    }

    function parseJwt(token) {
        try {
            const base64Url = token.split('.')[1];
            const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
            const jsonPayload = decodeURIComponent(atob(base64).split('').map(c => {
                return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
            }).join(''));
            return JSON.parse(jsonPayload);
        } catch (e) {
            console.error('Failed to parse JWT', e);
            return null;
        }
    }

    // --- HELPERS ---
    const constructFullDateFromDay = (dayStr, originalDateStr) => {
        if (!dayStr) return '';
        if (/^\d{4}-\d{2}-\d{2}$/.test(dayStr)) return dayStr;
        
        const day = parseInt(dayStr) || 1;
        let year = new Date().getFullYear();
        let month = new Date().getMonth();
        
        if (originalDateStr) {
            const origDate = new Date(originalDateStr);
            if (!isNaN(origDate.getTime())) {
                year = origDate.getFullYear();
                month = origDate.getMonth();
            }
        }
        
        const date = new Date(year, month, day);
        if (date.getDate() !== day) {
            date.setDate(0);
        }
        const yyyy = date.getFullYear();
        const mm = String(date.getMonth() + 1).padStart(2, '0');
        const dd = String(date.getDate()).padStart(2, '0');
        return `${yyyy}-${mm}-${dd}`;
    };

    function validateForm(form) {
        let isValid = true;
        const requiredInputs = form.querySelectorAll('[required]');

        requiredInputs.forEach(input => {
            // Skip validation for hidden fields
            if (input.offsetParent === null) return;

            if (!input.value || input.value.trim() === '' || (input.tagName === 'SELECT' && input.value === '')) {
                isValid = false;
                input.classList.add('is-invalid');

                // Shake effect on the form group or input
                input.closest('.form-group')?.classList.add('shake');
                setTimeout(() => input.closest('.form-group')?.classList.remove('shake'), 400);

                const clearInvalid = () => {
                    input.classList.remove('is-invalid');
                    input.removeEventListener('input', clearInvalid);
                    input.removeEventListener('change', clearInvalid);
                };
                input.addEventListener('input', clearInvalid);
                input.addEventListener('change', clearInvalid);
            } else {
                input.classList.remove('is-invalid');
            }
        });

        if (!isValid) {
            // Optional: Scroll to first invalid field
            const firstInvalid = Array.from(requiredInputs).find(i => i.classList.contains('is-invalid'));
            firstInvalid?.focus();
        }

        return isValid;
    }

    function checkAuth() {
        const user = localStorage.getItem('finos_user');
        if (user) {
            const userData = JSON.parse(user);
            showApp(userData);
        }
    }

    function showApp(user) {
        authOverlay.classList.remove('active');
        authOverlay.classList.add('hidden');
        appShell.classList.remove('hidden');

        document.getElementById('user-name').innerText = user.name;
        document.getElementById('user-email').innerText = user.email;
        document.getElementById('user-avatar').src = user.picture || `https://ui-avatars.com/api/?name=${user.name}&background=random`;
    }

    loginBtn.addEventListener('click', () => {
        // Fallback Demo Account
        const mockUser = {
            name: 'Demo Architect',
            email: 'demo@antigravity.ai',
            picture: 'https://cdn-icons-png.flaticon.com/512/3135/3135715.png'
        };
        localStorage.setItem('finos_user', JSON.stringify(mockUser));
        showApp(mockUser);
    });

    document.getElementById('logout-btn').addEventListener('click', () => {
        localStorage.removeItem('finos_user');
        location.reload();
    });

    // --- NAVIGATION ---
    navItems.forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            const target = item.getAttribute('data-screen');
            switchScreen(target);

            navItems.forEach(nav => nav.classList.remove('active'));
            item.classList.add('active');
        });
    });

    function switchScreen(screenId) {
        if (screenId === 'upcoming') {
            document.querySelectorAll('#dashboard-toggle button').forEach(b => {
                b.classList.remove('active');
                if (b.getAttribute('data-filter') === 'upcoming') b.classList.add('active');
            });
            screenId = 'dashboard';
        }

        screens.forEach(s => s.classList.remove('active'));
        const targetScreen = document.getElementById(`screen-${screenId}`);
        if (targetScreen) targetScreen.classList.add('active');

        const titles = {
            dashboard: 'Financial Dashboard',
            capture: 'Post Transaction',
            accounts: 'Financial Accounts Master',
            records: 'All Transactions',
            review: 'To Review (From Gmail)',
            masters: 'Master Data Management',
            theme: 'UI Theme Master',
            settings: 'Cloud Integrations',
            'app-info': 'Application Information'
        };
        if (screenId === 'records') {
            screenTitle.innerText = `All Transactions (${FinData.transactions ? FinData.transactions.length : 0})`;
        } else {
            screenTitle.innerText = titles[screenId] || 'My Finfo';
        }

        if (screenId === 'app-info') renderAppInfo();
        if (screenId === 'dashboard') updateDashboard();
        if (screenId === 'accounts') renderAccounts();
        if (screenId === 'records') renderRecords();
        if (screenId === 'review') renderReviewScreen();
        if (screenId === 'masters') renderMasters();
    }

    function calculateAccountBalance(accName) {
        if (!FinData || !FinData.masters || !FinData.masters.banks) return 0;
        const account = FinData.masters.banks.find(b => b.name === accName);
        if (!account) return 0;

        let balance = parseFloat(account.openingBalance || 0);

        if (!FinData.transactions || !Array.isArray(FinData.transactions)) return balance;
        FinData.transactions.forEach(t => {
            if (!t) return;
            const amt = parseFloat(t.amount || 0);
            if (t.type === 'Transfer') {
                if (t.fromBank === accName) balance -= amt;
                if (t.toBank === accName) balance += amt;
            } else if (t.bank === accName) {
                if (t.type === 'Income') balance += amt;
                else if (t.type === 'Expense') balance -= amt;
                else if (t.type === 'Investment') balance -= amt;
                else if (t.type === 'Ledger') {
                    const sub = (t.subCategory || '').toLowerCase();
                    const cat = (t.category || '').toLowerCase();
                    if (sub.includes('given') || cat.includes('lend')) balance -= amt;
                    else if (sub.includes('taken') || cat.includes('borrow') || cat.includes('return')) balance += amt;
                }
            }
        });
        return balance;
    }

    function renderAccounts() {
        const tbody = document.getElementById('accounts-tbody');
        if (!tbody) return;
        tbody.innerHTML = '';
        if (!FinData || !FinData.masters || !FinData.masters.banks) return;

        let totalLiquid = 0;

        // Map accounts with calculated balance
        const sortedBanks = FinData.masters.banks.map(acc => {
            const balance = calculateAccountBalance(acc.name);
            return { acc, balance };
        });

        // Sort by balance: lowest (from negative) to highest (positive)
        sortedBanks.sort((a, b) => a.balance - b.balance);

        sortedBanks.forEach(({ acc, balance }, idx) => {
            if (!acc.authDashboard) totalLiquid += balance;

            const tr = document.createElement('tr');

            let capabilitiesHtml = '';
            if (acc.isIncomeAccount) capabilitiesHtml += '<span class="badge success" style="font-size:8px; margin-right:2px;">INC</span>';
            if (acc.isExpenseAccount) capabilitiesHtml += '<span class="badge danger" style="font-size:8px; margin-right:2px;">EXP</span>';
            if (acc.canTransferSelf) capabilitiesHtml += '<span class="badge" style="font-size:8px; background:rgba(56,189,248,0.1); color:var(--accent); margin-right:2px;">S-TRF</span>';
            if (acc.authDashboard) capabilitiesHtml += '<span class="badge" style="font-size:8px; background:rgba(249,115,22,0.1); color:#f97316;">PRV</span>';

            tr.innerHTML = `
                <td>${idx + 1}</td>
                <td style="font-weight: 700;">${acc.bankName}</td>
                <td style="font-size: 12px;">${acc.name}</td>
                <td>${acc.accountHead}</td>
                <td>${acc.type}</td>
                <td style="font-family: monospace; letter-spacing: 1px;">**** ${acc.number || '0000'}</td>
                <td style="font-family: monospace; letter-spacing: 1px;">**** ${acc.cardNumber || '0000'}</td>
                <td>
                    <span class="badge" style="background: ${acc.status === 'Active' ? 'var(--color-income)' : 'var(--color-expense)'}22; color: ${acc.status === 'Active' ? 'var(--color-income)' : 'var(--color-expense)'}; border: 1px solid ${acc.status === 'Active' ? 'var(--color-income)' : 'var(--color-expense)'}44;">${acc.status}</span>
                </td>
                <td>${capabilitiesHtml}</td>
                <td style="text-align: right; color: var(--text-muted);">${formatCurrency(acc.openingBalance)}</td>
                <td style="text-align: right;">
                    <div style="font-size: 15px; font-weight: 800; color: ${balance >= 0 ? 'var(--accent)' : 'var(--color-expense)'}">${balance >= 0 ? '' : '-'}${formatCurrency(Math.abs(balance))}</div>
                    <div style="font-size: 9px; color: var(--accent); opacity: 0.7; font-style: italic; margin-top: 2px;">${amountToWords(balance)}</div>
                </td>
            `;
            tbody.appendChild(tr);
        });

        document.getElementById('total-liquid-assets').innerText = formatCurrency(totalLiquid);
    }

    // --- THEME MASTER LOGIC ---
    const THEME_PRESETS = {
    'modern-light': {
        '--bg-main': '#f8fafc',
        '--bg-secondary': '#e2e8f0',
        '--bg-tertiary': '#cbd5e1',
        '--text-main': '#0f172a',
        '--text-muted': '#475569',
        '--accent': '#0ea5e9',
        '--accent-hover': '#0284c7',
        '--color-income': '#10b981',
        '--color-expense': '#ef4444',
        '--color-investment': '#8b5cf6',
        '--color-ledger': '#f59e0b',
        '--color-success': '#22c55e',
        '--color-warning': '#eab308',
        '--color-danger': '#ef4444',
        '--color-info': '#06b6d4',
        '--font-size': 16,
        '--header-height': 70,
        '--radius': 12,
        isDark: false
    },
    'classic-dark': {
        '--bg-main': '#0f172a',
        '--bg-secondary': '#1e293b',
        '--bg-tertiary': '#334155',
        '--text-main': '#f8fafc',
        '--text-muted': '#94a3b8',
        '--accent': '#38bdf8',
        '--accent-hover': '#0ea5e9',
        '--color-income': '#10b981',
        '--color-expense': '#f43f5e',
        '--color-investment': '#8b5cf6',
        '--color-ledger': '#f59e0b',
        '--color-success': '#22c55e',
        '--color-warning': '#eab308',
        '--color-danger': '#ef4444',
        '--color-info': '#06b6d4',
        '--font-size': 16,
        '--header-height': 70,
        '--radius': 12,
        isDark: true
    },
    'midnight-blue': {
        '--bg-main': '#0b1120',
        '--bg-secondary': '#172554',
        '--bg-tertiary': '#1e3a8a',
        '--text-main': '#eff6ff',
        '--text-muted': '#93c5fd',
        '--accent': '#60a5fa',
        '--accent-hover': '#3b82f6',
        '--color-income': '#34d399',
        '--color-expense': '#fb7185',
        '--color-investment': '#a78bfa',
        '--color-ledger': '#fbbf24',
        '--color-success': '#4ade80',
        '--color-warning': '#facc15',
        '--color-danger': '#f87171',
        '--color-info': '#22d3ee',
        '--font-size': 15,
        '--header-height': 65,
        '--radius': 8,
        isDark: true
    },
    'corporate-clean': {
        '--bg-main': '#ffffff',
        '--bg-secondary': '#f1f5f9',
        '--bg-tertiary': '#e2e8f0',
        '--text-main': '#1e293b',
        '--text-muted': '#64748b',
        '--accent': '#2563eb',
        '--accent-hover': '#1d4ed8',
        '--color-income': '#059669',
        '--color-expense': '#dc2626',
        '--color-investment': '#7c3aed',
        '--color-ledger': '#d97706',
        '--color-success': '#16a34a',
        '--color-warning': '#ca8a04',
        '--color-danger': '#dc2626',
        '--color-info': '#0891b2',
        '--font-size': 14,
        '--header-height': 60,
        '--radius': 4,
        isDark: false
    }
};

    function hexToRgb(hex) {
    if (!hex) return '0,0,0';
    if (hex.indexOf('#') === 0) hex = hex.slice(1);
    if (hex.length === 3) hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
    if (hex.length !== 6) return '0,0,0';
    const r = parseInt(hex.slice(0, 2), 16),
        g = parseInt(hex.slice(2, 4), 16),
        b = parseInt(hex.slice(4, 6), 16);
    return `${r}, ${g}, ${b}`;
}

function applyTheme(theme) {
    if (!theme || !theme['--bg-main']) {
        theme = THEME_PRESETS['classic-dark'];
    }
    const root = document.documentElement;
    
    // Apply all variables
    for (const [key, value] of Object.entries(theme)) {
        if (key === 'isDark') continue;
        
        // Handle numeric sizes
        if (['--font-size', '--header-height', '--radius'].includes(key)) {
            root.style.setProperty(key, `${value}px`);
        } else {
            root.style.setProperty(key, value);
            // Auto-generate RGB variant for colors
            if (value && value.toString().startsWith('#')) {
                root.style.setProperty(`${key}-rgb`, hexToRgb(value));
            }
        }
    }

    if (theme.isDark === false) {
        document.body.classList.remove('dark-mode');
        root.style.setProperty('--text-inverse', '#ffffff');
    } else {
        document.body.classList.add('dark-mode');
        root.style.setProperty('--text-inverse', '#0f172a');
    }

    // Update UI Inputs
    document.querySelectorAll('#screen-theme input[data-var]').forEach(input => {
        const varName = input.getAttribute('data-var');
        if (theme[varName] !== undefined) {
            input.value = theme[varName];
            
            // Update range span labels
            if (input.type === 'range') {
                const span = document.getElementById(`lbl-${input.id.replace('theme-', '')}`);
                if (span) span.innerText = theme[varName];
            }
        }
    });

    // We must re-render charts so they pick up new colors!
    if (window.renderDashboardCharts) {
        setTimeout(() => {
            if(document.getElementById('screen-dashboard').classList.contains('active')) {
                renderDashboardCharts();
            }
        }, 100);
    }
}

function isColorDark(hex) {
        if (!hex) return true;
        if (hex.indexOf('#') === 0) {
            hex = hex.slice(1);
        }
        if (hex.length === 3) {
            hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
        }
        if (hex.length !== 6) return true;
        const r = parseInt(hex.slice(0, 2), 16),
            g = parseInt(hex.slice(2, 4), 16),
            b = parseInt(hex.slice(4, 6), 16);
        return (r * 299 + g * 587 + b * 114) / 1000 < 128;
    }

    document.querySelectorAll('#screen-theme input[data-var]').forEach(input => {
    input.addEventListener('input', () => {
        // Build current theme object
        const currentTheme = {
            isDark: isColorDark(document.querySelector('input[data-var="--bg-main"]').value)
        };
        
        document.querySelectorAll('#screen-theme input[data-var]').forEach(inp => {
            const varName = inp.getAttribute('data-var');
            currentTheme[varName] = inp.type === 'range' ? parseInt(inp.value) : inp.value;
        });
        
        applyTheme(currentTheme);
    });
});

    document.querySelectorAll('.preset-theme-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const presetKey = e.target.getAttribute('data-preset');
            if (THEME_PRESETS[presetKey]) {
                const newTheme = THEME_PRESETS[presetKey];
                applyTheme(newTheme);
                FinData.saveConfig({ theme: newTheme });

                // Visual feedback for buttons
                document.querySelectorAll('.preset-theme-btn').forEach(b => {
                    b.classList.remove('btn-primary');
                    b.classList.add('btn-outline');
                });
                e.target.classList.remove('btn-outline');
                e.target.classList.add('btn-primary');
            }
        });
    });

    document.getElementById('save-theme-btn')?.addEventListener('click', () => {
    const finalTheme = {
        isDark: isColorDark(document.querySelector('input[data-var="--bg-main"]').value)
    };
    
    document.querySelectorAll('#screen-theme input[data-var]').forEach(inp => {
        const varName = inp.getAttribute('data-var');
        finalTheme[varName] = inp.type === 'range' ? parseInt(inp.value) : inp.value;
    });

    FinData.saveConfig({ theme: finalTheme });
    alert('Global Theme Master Updated Successfully! Changes persist across reloads.');
});

document.getElementById('reset-theme-btn')?.addEventListener('click', () => {
    if(THEME_PRESETS['classic-dark']) {
        applyTheme(THEME_PRESETS['classic-dark']);
        FinData.saveConfig({ theme: THEME_PRESETS['classic-dark'] });
    }
});

    // --- APPLICATION INFO LOGIC ---
    function renderAppInfo() {
        const info = FinData.config.appInfo || {};
        document.getElementById('app-date-format').value = info.dateFormat || 'DD-MMM-YYYY';
        document.getElementById('app-time-format').value = info.timeFormat || '24h';
        document.getElementById('app-currency').value = info.currency || '$';
        document.getElementById('app-logo-url').value = info.logoUrl || '';
        document.getElementById('app-url-link').value = info.appUrl || '';
        document.getElementById('app-description').value = info.description || '';

        if (info.logoUrl) {
            document.getElementById('app-logo-preview').src = info.logoUrl;
        }
    }

    function applyAppInfo(info) {
        if (!info) return;

        // Update Currency Symbols
        if (info.currency) {
            const currencySpans = document.querySelectorAll('#currency-symbol');
            currencySpans.forEach(s => s.innerText = info.currency);
        }

        // Update Brand Logos
        const brandIcons = document.querySelectorAll('.brand-icon, .brand-small i');
        if (info.logoUrl) {
            brandIcons.forEach(icon => {
                icon.style.display = 'none';
            });

            // Add or update logo images
            const containers = document.querySelectorAll('.brand, .brand-small');
            containers.forEach(container => {
                let img = container.querySelector('.custom-logo');
                if (!img) {
                    img = document.createElement('img');
                    img.className = 'custom-logo';
                    img.style.width = container.classList.contains('brand') ? '60px' : '30px';
                    img.style.height = 'auto';
                    img.style.borderRadius = '8px';
                    container.prepend(img);
                }
                img.src = info.logoUrl;
            });
        }
    }

    document.getElementById('save-app-info-btn')?.addEventListener('click', () => {
        const info = {
            dateFormat: document.getElementById('app-date-format').value,
            timeFormat: document.getElementById('app-time-format').value,
            currency: document.getElementById('app-currency').value,
            logoUrl: document.getElementById('app-logo-url').value,
            appUrl: document.getElementById('app-url-link').value,
            description: document.getElementById('app-description').value
        };

        FinData.saveConfig({ appInfo: info });
        applyAppInfo(info);
        alert('Application information saved successfully!');
    });

    document.getElementById('app-logo-url')?.addEventListener('change', (e) => {
        const url = e.target.value;
        if (url) document.getElementById('app-logo-preview').src = url;
    });

    function formatDate(dateStr) {
        if (!dateStr) return 'N/A';
        const date = new Date(dateStr);
        if (isNaN(date.getTime())) return dateStr;

        const day = date.getDate().toString().padStart(2, '0');
        const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
        const month = months[date.getMonth()];
        const year = date.getFullYear();

        // You could make this dynamic based on FinData.config.appInfo.dateFormat
        // but the user explicitly asked for DD-MMM-YYYY everywhere.
        return `${day}-${month}-${year}`;
    }

    function formatCurrency(amount) {
        const symbol = FinData.config.appInfo.currency || '₹';
        return `${symbol}${parseFloat(amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }

    function amountToWords(amount) {
        const a = parseFloat(amount);
        if (isNaN(a) || a === 0) return "";
        
        const isNegative = a < 0;
        const absVal = Math.abs(a);

        const units = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
        const tens = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

        function convertBelowThousand(n) {
            if (n === 0) return "";
            if (n < 20) return units[n];
            if (n < 100) return tens[Math.floor(n / 10)] + (n % 10 !== 0 ? " " + units[n % 10] : "");
            return units[Math.floor(n / 100)] + " Hundred" + (n % 100 !== 0 ? " " + convertBelowThousand(n % 100) : "");
        }

        let [integer, decimal] = absVal.toFixed(2).split('.');
        let num = parseInt(integer);
        let str = "";

        if (num >= 10000000) {
            str += convertBelowThousand(Math.floor(num / 10000000)) + " Crore ";
            num %= 10000000;
        }
        if (num >= 100000) {
            str += convertBelowThousand(Math.floor(num / 100000)) + " Lakh ";
            num %= 100000;
        }
        if (num >= 1000) {
            str += convertBelowThousand(Math.floor(num / 1000)) + " Thousand ";
            num %= 1000;
        }
        if (num > 0) {
            str += convertBelowThousand(num);
        }

        str = str.trim() + " Rupees";

        if (decimal) {
            let dString = decimal.padEnd(2, '0').slice(0, 2);
            let d = parseInt(dString);
            if (d > 0) {
                str += " and " + convertBelowThousand(d) + " Paisa";
            }
        }

        return (isNegative ? "Minus " : "") + str + " Only";
    }

    const handleAmountInput = (inputEl, displayId, isDeposit) => {
        let val = inputEl.value;
        const mode = document.getElementById('trans-mode')?.value;
        if (mode === 'Opening Balance') {
            inputEl.style.color = 'var(--color-income)';
            if (val && parseFloat(val) < 0) {
                val = Math.abs(parseFloat(val)).toString();
                inputEl.value = val;
            }
        } else {
            inputEl.style.color = '';
        }
        if (val.includes('.') && val.split('.')[1].length > 2) {
            inputEl.value = val.substring(0, val.indexOf('.') + 3);
        }
        const words = amountToWords(inputEl.value);
        const display = document.getElementById(displayId);
        if (display) display.innerText = words;
    };

    document.getElementById('trans-withdrawal-amount')?.addEventListener('input', (e) => {
        handleAmountInput(e.target, 'withdrawal-amount-in-words', false);
    });

    document.getElementById('trans-deposit-amount')?.addEventListener('input', (e) => {
        handleAmountInput(e.target, 'deposit-amount-in-words', true);
    });


    document.getElementById('master-bank-balance')?.addEventListener('input', (e) => {
        let val = e.target.value;
        if (val.includes('.') && val.split('.')[1].length > 2) {
            e.target.value = val.substring(0, val.indexOf('.') + 3);
        }
        const words = amountToWords(e.target.value);
        const display = document.getElementById('master-balance-in-words');
        if (display) display.innerText = words;
    });

    document.getElementById('trans-date')?.addEventListener('input', (e) => {
        const val = e.target.value;
        const display = document.getElementById('trans-date-display');
        if (display) display.value = val ? formatDate(val) : '';
    });

    // Transaction Mode Selection
    document.querySelectorAll('#mode-pills .pill-item').forEach(pill => {
        pill.addEventListener('click', () => {
            document.querySelectorAll('#mode-pills .pill-item').forEach(p => p.classList.remove('active'));
            pill.classList.add('active');
            const mode = pill.getAttribute('data-mode');
            document.getElementById('trans-mode').value = mode;

            const withdrawalAmt = document.getElementById('trans-withdrawal-amount');
            const depositAmt = document.getElementById('trans-deposit-amount');
            [withdrawalAmt, depositAmt].forEach(amtInput => {
                if (amtInput) {
                    if (mode === 'Opening Balance') {
                        amtInput.style.color = 'var(--color-income)';
                        if (amtInput.value && parseFloat(amtInput.value) < 0) {
                            amtInput.value = Math.abs(parseFloat(amtInput.value)).toString();
                            amtInput.dispatchEvent(new Event('input'));
                        }
                    } else {
                        amtInput.style.color = '';
                    }
                }
            });
        });
    });

    document.getElementById('date-picker-btn')?.addEventListener('click', () => {
        document.getElementById('trans-date').showPicker();
    });

    document.getElementById('trans-date-display')?.addEventListener('blur', (e) => {
        const val = e.target.value;
        const parsed = parseDateString(val);
        if (parsed) {
            const yyyy = parsed.getFullYear();
            const mm = String(parsed.getMonth() + 1).padStart(2, '0');
            const dd = String(parsed.getDate()).padStart(2, '0');
            document.getElementById('trans-date').value = `${yyyy}-${mm}-${dd}`;
            e.target.value = formatDate(parsed.toISOString());
        } else if (val) {
            // Revert to valid value if junk entered
            e.target.value = formatDate(document.getElementById('trans-date').value);
        }
    });

    function parseDateString(str) {
        if (!str) return null;
        let parts = str.split('-');
        if (parts.length !== 3) {
            parts = str.split('/');
        }
        if (parts.length !== 3) return null;

        const day = parseInt(parts[0]);
        const monthStr = parts[1];
        const year = parseInt(parts[2]);

        const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
        let monthIdx = months.findIndex(m => m.toLowerCase() === monthStr.toLowerCase());
        if (monthIdx === -1) {
            const parsedMonth = parseInt(monthStr);
            if (!isNaN(parsedMonth) && parsedMonth >= 1 && parsedMonth <= 12) {
                monthIdx = parsedMonth - 1;
            }
        }

        if (monthIdx === -1 || isNaN(day) || isNaN(year)) return null;

        // Handle 2-digit year (optional, but good practice)
        let fullYear = year;
        if (year < 100) fullYear = 2000 + year;

        const date = new Date(fullYear, monthIdx, day);
        if (date.getFullYear() !== fullYear || date.getMonth() !== monthIdx || date.getDate() !== day) {
            return null;
        }
        return date;
    }

    function formatTimeForCapture(dateObj) {
        if (!dateObj || isNaN(dateObj.getTime())) return '';
        const hours = String(dateObj.getHours()).padStart(2, '0');
        const minutes = String(dateObj.getMinutes()).padStart(2, '0');
        const seconds = String(dateObj.getSeconds()).padStart(2, '0');
        return `${hours}:${minutes}:${seconds}`;
    }

    document.getElementById('master-bank-balance')?.addEventListener('input', (e) => {
        let val = e.target.value;
        if (val.includes('.') && val.split('.')[1].length > 2) {
            e.target.value = val.substring(0, val.indexOf('.') + 3);
        }
    });

    // --- DASHBOARD & CHARTS ---
    function updateDashboard() {
        const netWorth = FinData.getNetWorth();
        const nwEl = document.getElementById('kpi-net-worth');
        if (nwEl) {
            nwEl.innerText = `${netWorth >= 0 ? '' : '-'}${formatCurrency(Math.abs(netWorth))}`;
            nwEl.style.color = netWorth >= 0 ? '' : 'var(--color-expense)';
        }

        const filter = document.querySelector('#dashboard-toggle button.active')?.getAttribute('data-filter') || 'income';
        const periodToggle = document.getElementById('period-toggle');
        const mainContent = document.getElementById('dashboard-main-content');
        const upcomingContent = document.getElementById('dashboard-upcoming-content');

        if (filter === 'upcoming') {
            if (screenTitle) screenTitle.innerText = 'Upcoming Expenses Dashboard';
            if (periodToggle) periodToggle.classList.add('hidden');
            if (mainContent) mainContent.classList.add('hidden');
            if (upcomingContent) upcomingContent.classList.remove('hidden');
            renderUpcomingExpenses();
        } else {
            if (screenTitle) screenTitle.innerText = 'Financial Dashboard';
            if (periodToggle) {
                periodToggle.classList.remove('hidden');
                if (filter === 'ledger') {
                    activePeriod = 'all';
                    document.querySelectorAll('#period-toggle button').forEach(btn => {
                        const p = btn.getAttribute('data-period');
                        if (p === 'all') {
                            btn.classList.add('active');
                            btn.disabled = false;
                            btn.style.opacity = '1';
                            btn.style.pointerEvents = 'auto';
                        } else {
                            btn.classList.remove('active');
                            btn.disabled = true;
                            btn.style.opacity = '0.5';
                            btn.style.pointerEvents = 'none';
                        }
                    });
                } else {
                    document.querySelectorAll('#period-toggle button').forEach(btn => {
                        btn.disabled = false;
                        btn.style.opacity = '1';
                        btn.style.pointerEvents = 'auto';
                        if (btn.getAttribute('data-period') === activePeriod) {
                            btn.classList.add('active');
                        } else {
                            btn.classList.remove('active');
                        }
                    });
                }
            }
            if (mainContent) mainContent.classList.remove('hidden');
            if (upcomingContent) upcomingContent.classList.add('hidden');
            renderCharts(filter);
        }
    }

    document.querySelectorAll('#dashboard-toggle button').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('#dashboard-toggle button').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            updateDashboard();
        });
    });

    document.querySelectorAll('#period-toggle button').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('#period-toggle button').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            activePeriod = btn.getAttribute('data-period');
            updateDashboard();
        });
    });

    window.renderCharts = renderCharts;
    function renderCharts(filter) {
        const stats = FinData.getTotalsByFilter(filter, activePeriod);

        // Update KPIs
        const nwCard = document.getElementById('kpi-net-worth-card');
        if (filter === 'expense' || filter === 'ledger') {
            nwCard.style.display = 'none';
        } else {
            nwCard.style.display = 'flex';
        }

        const totalLabel = document.getElementById('kpi-total-label');
        const totalAmount = document.getElementById('kpi-total-amount');
        const totalCount = document.getElementById('kpi-total-count');

        const takeCard = document.getElementById('kpi-ledger-take-card');
        const giveCard = document.getElementById('kpi-ledger-give-card');

        if (filter === 'ledger') {
            // Hide total KPI card and show Ledger-specific KPI cards
            document.getElementById('kpi-total-label').closest('.kpi-card').style.display = 'none';
            takeCard.classList.remove('hidden');
            giveCard.classList.remove('hidden');
        } else {
            document.getElementById('kpi-total-label').closest('.kpi-card').style.display = 'flex';
            takeCard.classList.add('hidden');
            giveCard.classList.add('hidden');
        }

        const filterTitle = filter.charAt(0).toUpperCase() + filter.slice(1);
        totalLabel.innerText = `Total ${filterTitle}`;
        totalAmount.innerText = formatCurrency(stats.total);
        totalCount.innerText = `${stats.count} Records Found`;

        // Update Chart Titles
        document.getElementById('chart-trend-title').innerText = `${filterTitle} ${activePeriod === 'year' ? 'Yearly' : 'Monthly'} Trend`;
        document.getElementById('chart-cat-title').innerText = `${filterTitle} Category Wise`;
        document.getElementById('chart-acc-title').innerText = `${filterTitle} Account Wise`;
        const titleEl = document.getElementById('dashboard-list-title-1');
        if (titleEl) titleEl.innerText = `Recent ${filterTitle} Transactions`;

        // Update Dashboard List
        const listCard1 = document.getElementById('dashboard-list-card-1');
        const listCard2 = document.getElementById('dashboard-list-card-2');
        const listThead1 = listCard1.querySelector('.data-table thead');
        const listTbody1 = document.getElementById('dashboard-records-tbody-1');
        const listTbody2 = document.getElementById('dashboard-records-tbody-2');

        if (filter === 'ledger') {
            document.getElementById('dashboard-list-title-1').innerText = 'Amount To Take (Assets)';
            document.getElementById('dashboard-list-title-2').innerText = 'Amount To Give (Liabilities)';
            listCard2.classList.remove('hidden');

            const ledgerHeader = `
                <tr style="text-align: left; font-size: 11px; text-transform: uppercase; color: var(--text-muted); border-bottom: 1px solid var(--glass-border);">
                    <th style="padding: 15px 24px;">SL</th>
                    <th style="padding: 15px 24px;">Name/Account</th>
                    <th style="padding: 15px 24px; text-align: right;">Debited</th>
                    <th style="padding: 15px 24px; text-align: right;">Credited</th>
                    <th style="padding: 15px 24px; text-align: right;">Balance</th>
                    <th style="padding: 15px 24px; text-align: center;">Action</th>
                </tr>
            `;
            listThead1.innerHTML = ledgerHeader;
            listTbody1.innerHTML = '';
            listTbody2.innerHTML = '';

            // Calculate Person-wise summary
            const personMap = {};
            stats.records.forEach(r => {
                const name = r.person || 'Unknown';
                if (!personMap[name]) personMap[name] = { given: 0, taken: 0 };
                const amt = parseFloat(r.amount);
                const wAmt = parseFloat(r.withdrawalAmount || 0);
                const dAmt = parseFloat(r.depositAmount || 0);
                if (wAmt > 0) {
                    personMap[name].given += wAmt;
                } else if (dAmt > 0) {
                    personMap[name].taken += dAmt;
                } else {
                    const sub = (r.subCategory || '').toLowerCase();
                    const cat = (r.category || '').toLowerCase();
                    if (sub.includes('given') || sub.includes('debited') || cat.includes('lend')) {
                        personMap[name].given += amt;
                    } else {
                        // Fallback to credit/taken if no debit keyword matches
                        personMap[name].taken += amt;
                    }
                }
            });

            // Calculate and Sort Summary Data
            const summaryData = Object.keys(personMap).map(name => {
                const data = personMap[name];
                return { name, ...data, bal: data.given - data.taken };
            });

            const takeList = summaryData.filter(p => p.bal > 0).sort((a, b) => b.bal - a.bal);
            const giveList = summaryData.filter(p => p.bal < 0).sort((a, b) => Math.abs(b.bal) - Math.abs(a.bal));

            // Populate total take and give KPIs
            const totalTake = takeList.reduce((sum, p) => sum + p.bal, 0);
            const totalGive = giveList.reduce((sum, p) => sum + Math.abs(p.bal), 0);

            const takeValEl = document.getElementById('kpi-ledger-take-amount');
            const takeWordsEl = document.getElementById('kpi-ledger-take-words');
            const giveValEl = document.getElementById('kpi-ledger-give-amount');
            const giveWordsEl = document.getElementById('kpi-ledger-give-words');

            if (takeValEl) takeValEl.innerText = formatCurrency(totalTake);
            if (takeWordsEl) takeWordsEl.innerText = amountToWords(totalTake) || 'Zero Rupees Only';
            if (giveValEl) giveValEl.innerText = formatCurrency(totalGive);
            if (giveWordsEl) giveWordsEl.innerText = amountToWords(totalGive) || 'Zero Rupees Only';

            takeList.forEach((p, idx) => {
                const tr = document.createElement('tr');
                tr.style.borderBottom = '1px solid var(--glass-border)';
                tr.style.cursor = 'pointer';
                tr.classList.add('hover-highlight');
                tr.onclick = () => filterDashboardByPerson(p.name);

                const balanceText = `${formatCurrency(p.bal)}`;
                tr.innerHTML = `
                    <td style="padding: 12px 24px; font-size: 13px; color: var(--text-muted)">${idx + 1}</td>
                    <td style="padding: 12px 24px; font-size: 13px; font-weight: 600; color: var(--accent); text-decoration: underline; cursor: pointer;" onclick="event.stopPropagation(); drillDownByPerson('${p.name.replace(/'/g, "\\'")}')">${p.name}</td>
                    <td style="padding: 12px 24px; font-size: 13px; text-align: right; color: var(--color-income)">${formatCurrency(p.given)}</td>
                    <td style="padding: 12px 24px; font-size: 13px; text-align: right; color: var(--color-expense)">${formatCurrency(p.taken)}</td>
                    <td style="padding: 12px 24px; font-size: 13px; text-align: right; font-weight: 700; color: var(--color-income)">${balanceText}</td>
                    <td style="padding: 8px 16px; text-align: center;">
                        <button class="btn btn-sm" onclick="event.stopPropagation(); openQuickLedgerModal('${p.name.replace(/'/g, "\\'")}')"
                            style="background: rgba(245,158,11,0.12); border:1px solid rgba(245,158,11,0.35); color:#f59e0b; padding:5px 12px; border-radius:6px; font-size:11px; font-weight:600; display:inline-flex; align-items:center; gap:5px; cursor:pointer; white-space:nowrap;">
                            <i class="ri-add-circle-line"></i> Add Entry
                        </button>
                    </td>
                `;
                listTbody1.appendChild(tr);
            });

            giveList.forEach((p, idx) => {
                const tr = document.createElement('tr');
                tr.style.borderBottom = '1px solid var(--glass-border)';
                tr.style.cursor = 'pointer';
                tr.classList.add('hover-highlight');
                tr.onclick = () => filterDashboardByPerson(p.name);

                const balanceText = `-${formatCurrency(Math.abs(p.bal))}`;
                tr.innerHTML = `
                    <td style="padding: 12px 24px; font-size: 13px; color: var(--text-muted)">${idx + 1}</td>
                    <td style="padding: 12px 24px; font-size: 13px; font-weight: 600; color: var(--accent); text-decoration: underline; cursor: pointer;" onclick="event.stopPropagation(); drillDownByPerson('${p.name.replace(/'/g, "\\'")}')">${p.name}</td>
                    <td style="padding: 12px 24px; font-size: 13px; text-align: right; color: var(--color-income)">${formatCurrency(p.given)}</td>
                    <td style="padding: 12px 24px; font-size: 13px; text-align: right; color: var(--color-expense)">${formatCurrency(p.taken)}</td>
                    <td style="padding: 12px 24px; font-size: 13px; text-align: right; font-weight: 700; color: var(--color-expense)">${balanceText}</td>
                    <td style="padding: 8px 16px; text-align: center;">
                        <button class="btn btn-sm" onclick="event.stopPropagation(); openQuickLedgerModal('${p.name.replace(/'/g, "\\'")}')"
                            style="background: rgba(245,158,11,0.12); border:1px solid rgba(245,158,11,0.35); color:#f59e0b; padding:5px 12px; border-radius:6px; font-size:11px; font-weight:600; display:inline-flex; align-items:center; gap:5px; cursor:pointer; white-space:nowrap;">
                            <i class="ri-add-circle-line"></i> Add Entry
                        </button>
                    </td>
                `;
                listTbody2.appendChild(tr);
            });
        } else {
            document.getElementById('dashboard-list-title-1').innerText = `Recent ${filterTitle} Transactions`;
            listCard2.classList.add('hidden');
            listThead1.innerHTML = `
                <tr style="text-align: left; font-size: 11px; text-transform: uppercase; color: var(--text-muted); border-bottom: 1px solid var(--glass-border);">
                    <th style="padding: 15px 24px;">Date</th>
                    <th style="padding: 15px 24px;">Category</th>
                    <th style="padding: 15px 24px;">Account</th>
                    <th style="padding: 15px 24px; text-align: right;">Amount</th>
                </tr>
            `;
            listTbody1.innerHTML = '';
            stats.records.slice(0, 10).forEach(r => {
                const tr = document.createElement('tr');
                tr.style.borderBottom = '1px solid var(--glass-border)';
                const isOpeningBal = r.mode === 'Opening Balance';
                const isExpense = r.type === 'Expense';
                const isIncome = r.type === 'Income';
                const amtColor = isOpeningBal ? 'var(--color-income)' : (isExpense ? 'var(--color-expense)' : (isIncome ? 'var(--color-income)' : 'var(--accent)'));
                const amtSign = isOpeningBal ? '' : (isExpense ? '-' : (isIncome ? '+' : ''));
                const amtValue = isOpeningBal ? Math.abs(r.amount) : r.amount;
                tr.innerHTML = `
                    <td style="padding: 12px 24px; font-size: 13px;">${formatDate(r.date)}</td>
                    <td style="padding: 12px 24px; font-size: 13px;">
                        <div style="font-weight:600">${r.category}</div>
                        <div style="font-size:10px; color:var(--text-muted)">${r.subCategory || ''}</div>
                    </td>
                    <td style="padding: 12px 24px; font-size: 13px; color: var(--text-muted)">${r.bank || 'N/A'}</td>
                    <td style="padding: 12px 24px; font-size: 13px; font-weight: 700; text-align: right; color: ${amtColor}">${amtSign}${formatCurrency(amtValue)}</td>
                `;
                listTbody1.appendChild(tr);
            });
        }

        function filterDashboardByPerson(name) {
            // Re-render charts but only for this person
            const allLedger = FinData.transactions.filter(t => t.type === 'Ledger' && t.person === name);
            listCard2.classList.add('hidden'); // Hide the second list in drill-down

            // Switch title to show person's name
            document.getElementById('dashboard-list-title-1').innerHTML = `
                <div style="display:flex; align-items:center; gap:10px;">
                    <button class="btn btn-icon-only btn-sm" onclick="renderCharts('ledger')"><i class="ri-arrow-left-line"></i></button>
                    Ledger History: ${name}
                </div>
            `;

            // Change list to history
            listThead1.innerHTML = `
                <tr style="text-align: left; font-size: 11px; text-transform: uppercase; color: var(--text-muted); border-bottom: 1px solid var(--glass-border);">
                    <th style="padding: 15px 24px;">Date</th>
                    <th style="padding: 15px 24px;">Details</th>
                    <th style="padding: 15px 24px; text-align: right;">Amount</th>
                </tr>
            `;
            listTbody1.innerHTML = '';
            allLedger.forEach(t => {
                const tr = document.createElement('tr');
                tr.style.borderBottom = '1px solid var(--glass-border)';
                const wAmt = parseFloat(t.withdrawalAmount || 0);
                const dAmt = parseFloat(t.depositAmount || 0);
                const isGiven = wAmt > 0 ? true : (dAmt > 0 ? false : ((t.subCategory || '').toLowerCase().includes('given') || (t.subCategory || '').toLowerCase().includes('debited') || (t.category || '').toLowerCase().includes('lend')));
                const isOpeningBal = t.mode === 'Opening Balance';
                const amtColor = isOpeningBal ? 'var(--color-income)' : (isGiven ? 'var(--color-income)' : 'var(--color-expense)');
                const amtValue = isOpeningBal ? Math.abs(t.amount) : t.amount;
                tr.innerHTML = `
                    <td style="padding: 12px 24px; font-size: 13px;">${formatDate(t.date)}</td>
                    <td style="padding: 12px 24px; font-size: 13px;">
                        <span class="badge ${isGiven ? 'income' : 'expense'}" style="font-size:9px;">${isGiven ? 'DEBITED' : 'CREDITED'}</span>
                        <div style="font-size:10px; color:var(--text-muted); margin-top:4px;">${t.bank}</div>
                    </td>
                    <td style="padding: 12px 24px; font-size: 13px; font-weight: 700; text-align: right; color: ${amtColor}">${formatCurrency(amtValue)}</td>
                `;
                listTbody1.appendChild(tr);
            });
        }

        const ctxMain = document.getElementById('chart-main-trend').getContext('2d');
        const ctxDist = document.getElementById('chart-distribution').getContext('2d');
        const ctxAcc = document.getElementById('chart-account-wise').getContext('2d');

        if (mainChart) mainChart.destroy();
        if (distChart) distChart.destroy();
        if (accChart) accChart.destroy();

        // --- CHART VISIBILITY MANAGEMENT ---
        const distCard = document.getElementById('chart-distribution').closest('.chart-card');
        const accCard = document.getElementById('chart-account-wise').closest('.chart-card');
        const trendCard = document.getElementById('chart-main-trend').closest('.chart-card');

        if (filter === 'ledger') {
            if (distCard) distCard.classList.add('hidden');
            if (accCard) accCard.classList.add('hidden');
            if (trendCard) trendCard.classList.add('hidden');
        } else {
            if (distCard) distCard.classList.remove('hidden');
            if (accCard) accCard.classList.remove('hidden');
            if (trendCard) trendCard.classList.remove('hidden');
            if (trendCard) trendCard.style.gridColumn = 'span 1';
        }

        if (filter !== 'ledger') {
            // Chart.js Theme Colors
            const accentColor = getComputedStyle(document.documentElement).getPropertyValue('--accent');

            // Calculate Trend Data dynamically
            let trendLabels = [];
            let trendData = [];
            const now = new Date();
            const currentYear = now.getFullYear();

            if (activePeriod === 'year') {
                // Months Jan-Dec
                trendLabels = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
                trendData = Array(12).fill(0);
                stats.records.forEach(r => {
                    const rDate = new Date(r.date);
                    if (!isNaN(rDate.getTime()) && rDate.getFullYear() === currentYear) {
                        const monthIdx = rDate.getMonth();
                        trendData[monthIdx] += parseFloat(r.amount || 0);
                    }
                });
            } else if (activePeriod === 'all') {
                // Group by year
                const years = stats.records.map(r => new Date(r.date).getFullYear()).filter(y => !isNaN(y));
                const minYear = years.length > 0 ? Math.min(...years) : currentYear;
                const maxYear = years.length > 0 ? Math.max(...years) : currentYear;

                trendLabels = [];
                for (let y = minYear; y <= maxYear; y++) {
                    trendLabels.push(String(y));
                }
                trendData = Array(trendLabels.length).fill(0);
                stats.records.forEach(r => {
                    const rDate = new Date(r.date);
                    if (!isNaN(rDate.getTime())) {
                        const yStr = String(rDate.getFullYear());
                        const idx = trendLabels.indexOf(yStr);
                        if (idx !== -1) {
                            trendData[idx] += parseFloat(r.amount || 0);
                        }
                    }
                });
            } else {
                // Days of the current month
                const currentMonth = now.getMonth();
                const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
                for (let i = 1; i <= daysInMonth; i++) {
                    trendLabels.push(String(i));
                }
                trendData = Array(daysInMonth).fill(0);
                stats.records.forEach(r => {
                    const rDate = new Date(r.date);
                    if (!isNaN(rDate.getTime()) && rDate.getFullYear() === currentYear && rDate.getMonth() === currentMonth) {
                        const dayIdx = rDate.getDate() - 1;
                        if (dayIdx >= 0 && dayIdx < daysInMonth) {
                            trendData[dayIdx] += parseFloat(r.amount || 0);
                        }
                    }
                });
            }

            mainChart = new Chart(ctxMain, {
                type: 'line',
                data: {
                    labels: trendLabels,
                    datasets: [{
                        label: filter.toUpperCase(),
                        data: trendData,
                        borderColor: accentColor,
                        backgroundColor: `rgba(${getCssVar("--accent-rgb")}, 0.1)`,
                        fill: true,
                        tension: 0.4
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: { legend: { display: false } },
                    onClick: (event, activeElements, chart) => {
                        if (activeElements.length > 0) {
                            const index = activeElements[0].index;
                            const trendLabel = chart.data.labels[index];
                            if (trendLabel) {
                                drillDownByTrend(trendLabel);
                            }
                        }
                    },
                    onHover: (event, activeElements) => {
                        event.native.target.style.cursor = activeElements.length ? 'pointer' : 'default';
                    },
                    scales: {
                        y: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: getCssVar("--text-muted") } },
                        x: { grid: { display: false }, ticks: { color: getCssVar("--text-muted") } }
                    }
                }
            });

            // Standard Charts
            document.getElementById('chart-cat-title').innerText = `${filterTitle} Category Wise`;
            document.getElementById('chart-acc-title').innerText = `${filterTitle} Account Wise`;

            const catMap = {};
            stats.records.forEach(r => {
                catMap[r.category] = (catMap[r.category] || 0) + parseFloat(r.amount);
            });
            const catLabels = Object.keys(catMap);
            const catValues = Object.values(catMap);

            distChart = new Chart(ctxDist, {
                type: 'doughnut',
                data: {
                    labels: catLabels.length ? catLabels : ['No Data'],
                    datasets: [{
                        data: catValues.length ? catValues : [1],
                        backgroundColor: [
                            `rgba(${getCssVar("--accent-rgb")}, 0.6)`,
                            `rgba(${getCssVar("--color-income-rgb")}, 0.6)`,
                            `rgba(${getCssVar("--color-expense-rgb")}, 0.6)`,
                            'rgba(249, 115, 22, 0.6)',
                            `rgba(${getCssVar("--color-investment-rgb")}, 0.6)`
                        ],
                        borderWidth: 0
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: { position: 'bottom', labels: { color: getCssVar("--text-muted"), boxWidth: 12, font: { size: 10 } } },
                        datalabels: { display: false }
                    },
                    cutout: '70%',
                    onClick: (event, activeElements, chart) => {
                        if (activeElements.length > 0) {
                            const index = activeElements[0].index;
                            const categoryName = chart.data.labels[index];
                            if (categoryName && categoryName !== 'No Data') {
                                drillDownByCategory(categoryName);
                            }
                        }
                    },
                    onHover: (event, activeElements) => {
                        event.native.target.style.cursor = activeElements.length ? 'pointer' : 'default';
                    }
                }
            });

            const accMap = {};
            stats.records.forEach(r => {
                const bankName = r.bank ? r.bank.split(' › ')[0] : 'Other';
                accMap[bankName] = (accMap[bankName] || 0) + parseFloat(r.amount);
            });
            const accLabels = Object.keys(accMap);
            const accValues = Object.values(accMap);

            accChart = new Chart(ctxAcc, {
                type: 'bar',
                data: {
                    labels: accLabels.length ? accLabels : ['No Data'],
                    datasets: [{
                        label: 'Amount',
                        data: accValues.length ? accValues : [0],
                        backgroundColor: `rgba(${getCssVar("--accent-rgb")}, 0.6)`,
                        borderRadius: 4
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: { display: false },
                        datalabels: { display: false }
                    },
                    onClick: (event, activeElements, chart) => {
                        if (activeElements.length > 0) {
                            const index = activeElements[0].index;
                            const accountLabel = chart.data.labels[index];
                            if (accountLabel && accountLabel !== 'No Data') {
                                drillDownByAccount(accountLabel);
                            }
                        }
                    },
                    onHover: (event, activeElements) => {
                        event.native.target.style.cursor = activeElements.length ? 'pointer' : 'default';
                    },
                    scales: {
                        y: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: getCssVar("--text-muted"), font: { size: 10 } } },
                        x: { grid: { display: false }, ticks: { color: getCssVar("--text-muted"), font: { size: 10 } } }
                    }
                }
            });
        }
    }

    // --- TRANSACTION CAPTURE ---
    const heroCards = document.querySelectorAll('.hero-card');
    const captureFormArea = document.getElementById('capture-form-area');
    const heroGrid = document.querySelector('.capture-hero-grid');

    heroCards.forEach(card => {
        card.addEventListener('click', () => {
            const type = card.getAttribute('data-type');
            showCaptureForm(type);
        });
    });

    function showCaptureForm(type) {
        heroGrid.classList.add('hidden');
        captureFormArea.classList.remove('hidden');

        if (type === 'UpcomingExpense') {
            isCaptureUpcoming = true;
            type = 'Expense';
        } else if (type === 'Expense') {
            if (!isEditingUpcoming) {
                isCaptureUpcoming = false;
            }
        } else {
            isCaptureUpcoming = false;
        }

        if (currentEditIndex === -1) {
            if (isCaptureUpcoming) {
                document.getElementById('form-title').innerText = 'Add Upcoming Expenses & EMIs';
                document.querySelector('#transaction-form button[type="submit"]').innerText = 'Save Upcoming Expenses & EMIs';
            } else {
                document.getElementById('form-title').innerText = type === 'Transfer' ? 'Fund Transfer Self' : `Add ${type}`;
                document.querySelector('#transaction-form button[type="submit"]').innerText = 'Save Transaction';
            }
        }

        document.getElementById('trans-type').value = type;

        // Reset Loan Details
        const loanDetails = document.getElementById('loan-emi-details');
        if (loanDetails) loanDetails.classList.add('hidden');

        // Reset and manage fields for normal vs upcoming
        const freqGroup = document.getElementById('upcoming-frequency-group');
        
        if (isCaptureUpcoming) {
            if (freqGroup) freqGroup.classList.remove('hidden');
            document.getElementById('date-time-row')?.classList.add('hidden');

            document.getElementById('details-upi-row')?.classList.add('hidden');
            document.getElementById('billing-date-group')?.classList.remove('hidden');
            document.getElementById('due-date-group')?.classList.remove('hidden');

            const amtDatesContainer = document.getElementById('amount-dates-container');
            if (amtDatesContainer) amtDatesContainer.style.gridTemplateColumns = '1fr';
            
            updateUpcomingDatesState();
        } else {
            if (freqGroup) freqGroup.classList.add('hidden');
            document.getElementById('date-time-row')?.classList.remove('hidden');
            document.getElementById('trans-date-group')?.classList.remove('hidden');
            document.getElementById('trans-time-group')?.classList.remove('hidden');
            const dateLabel = document.getElementById('trans-date-label');
            if (dateLabel) dateLabel.innerText = 'Date (DD-MMM-YYYY) *';

            document.getElementById('details-upi-row')?.classList.remove('hidden');
            document.getElementById('billing-date-group')?.classList.add('hidden');
            document.getElementById('due-date-group')?.classList.add('hidden');

            const amtDatesContainer = document.getElementById('amount-dates-container');
            if (amtDatesContainer) amtDatesContainer.style.gridTemplateColumns = 'repeat(2, 1fr)';
        }

        // Reset visibility
        const catPills = document.getElementById('category-pills');
        const subCatPills = document.getElementById('sub-category-pills');
        const secondSubCatPills = document.getElementById('second-sub-category-pills-container');
        const standardAccountGroup = document.getElementById('standard-account-group');
        const transferGroup = document.getElementById('transfer-group');
        const transferInfo = document.getElementById('transfer-header-info');
        const dateInput = document.getElementById('trans-date');

        if (currentEditIndex === -1) {
            dateInput.valueAsDate = new Date();
            const timeDisplay = document.getElementById('trans-time-display');
            if (timeDisplay) timeDisplay.value = formatTimeForCapture(new Date());

            // Pre-fill upcoming dates to today's day number
            const todayDay = new Date().getDate();
            const billingDateInput = document.getElementById('trans-billing-date');
            const dueDateInput = document.getElementById('trans-due-date');
            if (billingDateInput) billingDateInput.value = todayDay;
            if (dueDateInput) dueDateInput.value = todayDay;
        }
        const dateDisplay = document.getElementById('trans-date-display');
        if (dateDisplay) dateDisplay.value = formatDate(dateInput.value);

        captureFormArea.classList.remove('hidden');
        if (isCaptureUpcoming) {
            standardAccountGroup.classList.add('hidden');
            transferGroup.classList.remove('hidden');
            transferInfo.classList.add('hidden');
        } else {
            standardAccountGroup.classList.remove('hidden');
            transferGroup.classList.add('hidden');
            transferInfo.classList.add('hidden');
        }

        document.getElementById('trans-bank').value = '';
        document.getElementById('trans-from-bank').value = '';
        document.getElementById('trans-to-bank').value = '';
        document.getElementById('trans-mode').value = '';
        const transAmtEl = document.getElementById('trans-amount');
        if (transAmtEl) transAmtEl.style.color = '';

        const withdrawalInput = document.getElementById('trans-withdrawal-amount');
        const depositInput = document.getElementById('trans-deposit-amount');
        if (withdrawalInput) {
            withdrawalInput.value = '';
            withdrawalInput.required = false;
        }
        if (depositInput) {
            depositInput.value = '';
            depositInput.required = false;
        }
        const wWords = document.getElementById('withdrawal-amount-in-words');
        if (wWords) wWords.innerText = '';
        const dWords = document.getElementById('deposit-amount-in-words');
        if (dWords) dWords.innerText = '';

        const withdrawalGroup = document.getElementById('withdrawal-amount-group');
        const depositGroup = document.getElementById('deposit-amount-group');
        if (type === 'Income' || type === 'Opening Balance') {
            withdrawalGroup?.classList.add('hidden');
            depositGroup?.classList.remove('hidden');
            if (depositInput) depositInput.required = true;
        } else if (type === 'Expense' || type === 'Investment' || type === 'Transfer') {
            depositGroup?.classList.add('hidden');
            withdrawalGroup?.classList.remove('hidden');
            if (withdrawalInput) withdrawalInput.required = true;
        } else if (type === 'Ledger') {
            withdrawalGroup?.classList.remove('hidden');
            depositGroup?.classList.remove('hidden');
        }
        document.getElementById('trans-ledger-person').value = '';
        document.getElementById('ledger-details').classList.add('hidden');
        document.getElementById('trans-expense-person').value = '';
        document.getElementById('expense-person-details').classList.add('hidden');
        document.querySelectorAll('#mode-pills .pill-item').forEach(p => p.classList.remove('active'));

        catPills.classList.remove('hidden');

        if (type === 'Transfer') {
            catPills.classList.add('hidden');
            subCatPills.classList.add('hidden');
            document.getElementById('sub-category-pills-container')?.classList.add('hidden');
            document.getElementById('category-divider-1')?.classList.add('hidden');
            if (secondSubCatPills) secondSubCatPills.classList.add('hidden');
            document.getElementById('category-divider-2')?.classList.add('hidden');
            standardAccountGroup.classList.add('hidden');
            transferGroup.classList.remove('hidden');
            transferInfo.classList.remove('hidden');

            const transferCats = FinData.masters.categories.Transfer || [];
            const defaultCat = transferCats.length > 0 ? transferCats[0].name : 'Self Transfer';
            const defaultSub = (transferCats.length > 0 && transferCats[0].subCategories && transferCats[0].subCategories.length > 0)
                ? (typeof transferCats[0].subCategories[0] === 'string' ? transferCats[0].subCategories[0] : transferCats[0].subCategories[0].name)
                : 'Own Accounts';
            document.getElementById('trans-category').value = defaultCat;
            document.getElementById('trans-sub-category').value = defaultSub;
            document.getElementById('trans-second-sub-category').value = '';
            initTransferSelection();
        } else {
            populateCategoryHeadPills(type);
            if (type === 'Expense') {
                document.getElementById('expense-person-details').classList.remove('hidden');
            }
            if (isCaptureUpcoming) {
                initTransferSelection();
            }

            // Populate Standard Account Head Pills
            const headPillsContainer = document.getElementById('account-head-pills');
            headPillsContainer.innerHTML = '';
            const accountsContainer = document.getElementById('account-selection-container');
            accountsContainer.classList.add('hidden');

            const accounts = FinData.masters.banks.filter(b => {
                if (b.status !== 'Active') return false;
                if (b.isActive === false) return false;
                if (isCaptureUpcoming) return true; // Show all active accounts for Upcoming Expenses & EMIs
                if (type === 'Income' && b.isIncomeAccount === false) return false;
                if (type === 'Expense' && b.isExpenseAccount === false) return false;
                if (type === 'Ledger' && b.canTransferOther === false) return false;
                if (type === 'Investment' && b.accountHead !== 'Investment' && b.accountHead !== 'Investments') return false;
                return true;
            });

            const grouped = groupAccountsByHead(accounts);
            Object.keys(grouped).forEach(head => {
                const pill = document.createElement('div');
                pill.className = 'pill-item';
                pill.innerText = head;
                pill.onclick = () => {
                    document.querySelectorAll('#account-head-pills .pill-item').forEach(p => p.classList.remove('active'));
                    pill.classList.add('active');
                    document.getElementById('trans-bank').value = '';
                    showAccountCards(grouped[head], 'account-selection-container', 'account-selection-cards', 'trans-bank', 'account-view-only', 'selected-account-name');
                };
                headPillsContainer.appendChild(pill);
            });
        }

        // Common Resets
        document.getElementById('sub-category-pills').innerHTML = '';
        document.getElementById('sub-category-pills').classList.add('hidden');
        document.getElementById('sub-category-pills-container')?.classList.add('hidden');
        document.getElementById('category-divider-1')?.classList.add('hidden');
        document.getElementById('second-sub-category-pills').innerHTML = '';
        document.getElementById('second-sub-category-pills').classList.add('hidden');
        document.getElementById('second-sub-category-pills-container')?.classList.add('hidden');
        document.getElementById('category-divider-2')?.classList.add('hidden');
        document.getElementById('account-view-only').classList.add('hidden');
        document.getElementById('selected-account-name').value = '';
    }

    function groupAccountsByHead(accounts) {
        const grouped = {};
        accounts.forEach(acc => {
            const head = acc.accountHead || 'Other';
            if (!grouped[head]) grouped[head] = [];
            grouped[head].push(acc);
        });
        return grouped;
    }

    function initTransferSelection() {
        const accounts = FinData.masters.banks.filter(b => b.status === 'Active' && b.isActive !== false && b.canTransferSelf !== false);
        const grouped = groupAccountsByHead(accounts);

        // From Account
        const fromHeadPills = document.getElementById('transfer-from-head-pills');
        fromHeadPills.innerHTML = '';
        document.getElementById('transfer-from-container').classList.add('hidden');
        document.getElementById('transfer-from-view').classList.add('hidden');
        document.getElementById('trans-from-bank').value = '';

        // To Account
        const toHeadPills = document.getElementById('transfer-to-head-pills');
        toHeadPills.innerHTML = '';
        document.getElementById('transfer-to-container').classList.add('hidden');
        document.getElementById('transfer-to-view').classList.add('hidden');
        document.getElementById('trans-to-bank').value = '';

        Object.keys(grouped).forEach(head => {
            // From Pill
            const fPill = document.createElement('div');
            fPill.className = 'pill-item';
            fPill.innerText = head;
            fPill.onclick = () => {
                document.querySelectorAll('#transfer-from-head-pills .pill-item').forEach(p => p.classList.remove('active'));
                fPill.classList.add('active');
                showAccountCards(grouped[head], 'transfer-from-container', 'transfer-from-cards', 'trans-from-bank', 'transfer-from-view', 'selected-from-account');
            };
            fromHeadPills.appendChild(fPill);

            // To Pill
            const tPill = document.createElement('div');
            tPill.className = 'pill-item';
            tPill.innerText = head;
            tPill.onclick = () => {
                document.querySelectorAll('#transfer-to-head-pills .pill-item').forEach(p => p.classList.remove('active'));
                tPill.classList.add('active');
                showAccountCards(grouped[head], 'transfer-to-container', 'transfer-to-cards', 'trans-to-bank', 'transfer-to-view', 'selected-to-account');
            };
            toHeadPills.appendChild(tPill);
        });
    }

    function showAccountCards(accounts, containerId, cardsGridId, inputId, viewId, viewInputId) {
        const container = document.getElementById(containerId);
        const cardsGrid = document.getElementById(cardsGridId);
        cardsGrid.innerHTML = '';
        container.classList.remove('hidden');

        accounts.forEach(acc => {
            const card = document.createElement('div');
            card.className = 'account-mini-card';
            card.innerHTML = `
                <div class="name">${acc.bankName}</div>
                <div class="meta">${acc.type}${acc.number ? ' | A/' + acc.number : ''}${acc.cardNumber ? ' | C/' + acc.cardNumber : ''}</div>
            `;
            card.onclick = () => {
                document.querySelectorAll(`#${cardsGridId} .account-mini-card`).forEach(c => c.classList.remove('active'));
                card.classList.add('active');
                document.getElementById(inputId).value = acc.name;

                const viewArea = document.getElementById(viewId);
                const viewInput = document.getElementById(viewInputId);
                if (viewArea && viewInput) {
                    viewArea.classList.remove('hidden');
                    viewInput.value = acc.name;
                }

                // Auto-populate Loan EMI Details when To Account is a Loan account (Upcoming Expenses form only)
                if (cardsGridId === 'transfer-to-cards') {
                    const loanDetails = document.getElementById('loan-emi-details');
                    const loanMasterInfo = document.getElementById('loan-emi-master-info');
                    const loanBadge = document.getElementById('loan-emi-auto-badge');

                    if (acc.accountHead === 'Loan') {
                        // Build duration string
                        const yrs = acc.loanDurationYears || 0;
                        const mths = acc.loanDurationMonths || 0;
                        const durationStr = [
                            yrs ? `${yrs} Yr${yrs > 1 ? 's' : ''}` : '',
                            mths ? `${mths} Mo${mths > 1 ? 's' : ''}` : ''
                        ].filter(Boolean).join(' ') || '—';

                        // Populate read-only master info fields
                        const setVal = (id, val) => { const el = document.getElementById(id); if (el) el.value = val || ''; };
                        setVal('loan-info-sanctioned-date', acc.loanSanctionedDate);
                        setVal('loan-info-emi-start-date', acc.loanEmiStartDate);
                        setVal('loan-info-duration', durationStr);
                        setVal('loan-info-end-date', acc.loanEndDate);
                        setVal('loan-info-rate', acc.loanRate ? acc.loanRate + ' %' : '');
                        setVal('loan-info-emi-amount', acc.loanEmiAmount ? '₹ ' + parseFloat(acc.loanEmiAmount).toLocaleString('en-IN', { minimumFractionDigits: 2 }) : '');
                        setVal('loan-info-billing-date', acc.loanEmiBillingDate || '');
                        setVal('loan-info-due-date', acc.loanEmiDueDate || '');

                        // Show loan section, master info sub-panel, and badge
                        if (loanDetails) loanDetails.classList.remove('hidden');
                        if (loanMasterInfo) loanMasterInfo.classList.remove('hidden');
                        if (loanBadge) loanBadge.classList.remove('hidden');
                    } else {
                        // Hide and clear loan section when non-Loan account selected
                        if (loanDetails) loanDetails.classList.add('hidden');
                        if (loanMasterInfo) loanMasterInfo.classList.add('hidden');
                        if (loanBadge) loanBadge.classList.add('hidden');

                        const clearVal = (id) => { const el = document.getElementById(id); if (el) el.value = ''; };
                        ['loan-info-sanctioned-date','loan-info-emi-start-date','loan-info-duration',
                         'loan-info-end-date','loan-info-rate','loan-info-emi-amount',
                         'loan-info-billing-date','loan-info-due-date'].forEach(clearVal);
                    }
                }
            };
            cardsGrid.appendChild(card);
        });
    }


    function populateCategoryHeadPills(type) {
        const catPills = document.getElementById('category-pills');
        if (!catPills) return;
        catPills.innerHTML = '';
        
        const cats = FinData.masters.categories[type] || [];
        cats.filter(c => c.status === 'Active').forEach(cat => {
            const pill = document.createElement('div');
            pill.className = 'pill-item';
            pill.innerText = cat.name;
            pill.onclick = () => {
                selectCategoryPill(pill, cat.name, cat.subCategories || []);
            };
            catPills.appendChild(pill);
        });
    }

    function selectCategoryPill(pillEl, catName, subCats) {
        document.querySelectorAll('#category-pills .pill-item').forEach(p => p.classList.remove('active'));
        pillEl.classList.add('active');
        document.getElementById('trans-category').value = catName;

        // Reset and Show Categories (which corresponds to subCategories in DB)
        document.getElementById('trans-sub-category').value = '';
        document.getElementById('trans-second-sub-category').value = '';
        
        const loanDetails = document.getElementById('loan-emi-details');
        if (loanDetails) loanDetails.classList.add('hidden');

        showSubCategoryPills(subCats);

        // Also check keywords on main category selection
        checkLedgerKeywords(catName);
    }

    function showSubCategoryPills(subs) {
        const container = document.getElementById('sub-category-pills');
        container.innerHTML = '';
        const secondContainer = document.getElementById('second-sub-category-pills-container');
        if (secondContainer) {
            const pillsGrid = document.getElementById('second-sub-category-pills');
            if (pillsGrid) pillsGrid.innerHTML = '';
            secondContainer.classList.add('hidden');
        }
        document.getElementById('category-divider-2')?.classList.add('hidden');

        const type = document.getElementById('trans-type').value;
        const subCatContainer = document.getElementById('sub-category-pills-container');

        const hasSubs = subs && subs.length > 0;
        const isExpenseType = type === 'Expense';

        if (hasSubs || isExpenseType) {
            if (subs && subs.length > 0) {
                subs.forEach(s => {
                    const name = typeof s === 'string' ? s : s.name;
                    const sub2 = typeof s === 'object' ? s.subCategories : [];

                    const pill = document.createElement('div');
                    pill.className = 'pill-item';
                    pill.innerText = name;
                    pill.onclick = () => {
                        selectCategoryLevel2(pill, name, sub2 || []);
                    };
                    container.appendChild(pill);
                });
            }

            // Inject Virtual "Loan EMI" category pill under Category selector
            if (isExpenseType) {
                const pill = document.createElement('div');
                pill.className = 'pill-item';
                pill.innerText = 'Loan EMI';
                pill.onclick = () => {
                    selectCategoryLevel2(pill, 'Loan EMI', []);
                };
                container.appendChild(pill);
            }

            container.classList.remove('hidden');

            if (subCatContainer) {
                subCatContainer.classList.remove('hidden');
                document.getElementById('category-divider-1')?.classList.remove('hidden');
            }
        } else {
            container.classList.add('hidden');
            if (subCatContainer) {
                subCatContainer.classList.add('hidden');
                document.getElementById('category-divider-1')?.classList.add('hidden');
            }
        }
    }

    function selectCategoryLevel2(pillEl, catName, sub2) {
        document.querySelectorAll('#sub-category-pills .pill-item').forEach(p => p.classList.remove('active'));
        pillEl.classList.add('active');
        document.getElementById('trans-sub-category').value = catName;

        document.getElementById('trans-second-sub-category').value = '';
        
        // Show/Hide Loan EMI Details panel
        const loanDetails = document.getElementById('loan-emi-details');
        if (catName === 'Loan EMI') {
            if (loanDetails) loanDetails.classList.remove('hidden');
            showSecondSubCategoryPills([]);
        } else {
            if (loanDetails) loanDetails.classList.add('hidden');
            showSecondSubCategoryPills(sub2);
        }

        checkLedgerKeywords(catName);
    }

    function checkLedgerKeywords(text) {
        const type = document.getElementById('trans-type').value;
        if (type !== 'Ledger') return;

        const ledgerDetails = document.getElementById('ledger-details');
        const label = document.getElementById('ledger-person-label');
        const lower = text.toLowerCase();

        if (lower.includes('lend') || lower.includes('given') || lower.includes('debited')) {
            ledgerDetails.classList.remove('hidden');
            label.innerText = 'To *';
            updateLedgerSuggestions();
        } else if (lower.includes('borrow') || lower.includes('taken') || lower.includes('credited') || lower.includes('return')) {
            ledgerDetails.classList.remove('hidden');
            label.innerText = 'From *';
            updateLedgerSuggestions();
        } else {
            ledgerDetails.classList.add('hidden');
            document.getElementById('trans-ledger-person').value = '';
        }
    }

    function updateLedgerSuggestions() {
        const names = [...new Set(FinData.transactions
            .filter(t => t.type === 'Ledger' && t.person)
            .map(t => t.person))];

        const list = document.getElementById('ledger-names-list');
        list.innerHTML = '';
        names.forEach(name => {
            const opt = document.createElement('option');
            opt.value = name;
            list.appendChild(opt);
        });
    }

    function showSecondSubCategoryPills(subs) {
        const container = document.getElementById('second-sub-category-pills-container');
        const pillsGrid = document.getElementById('second-sub-category-pills');
        if (!container || !pillsGrid) return;
        pillsGrid.innerHTML = '';

        if (!subs || subs.length === 0) {
            container.classList.add('hidden');
            pillsGrid.classList.add('hidden');
            document.getElementById('category-divider-2')?.classList.add('hidden');
            return;
        }

        container.classList.remove('hidden');
        pillsGrid.classList.remove('hidden');
        document.getElementById('category-divider-2')?.classList.remove('hidden');
        subs.forEach(s => {
            const pill = document.createElement('div');
            pill.className = 'pill-item';
            pill.innerText = s;
            pill.onclick = () => {
                document.querySelectorAll('#second-sub-category-pills .pill-item').forEach(p => p.classList.remove('active'));
                pill.classList.add('active');
                document.getElementById('trans-second-sub-category').value = s;
                checkLedgerKeywords(s);
            };
            pillsGrid.appendChild(pill);
        });
    }

    document.getElementById('back-to-hero').addEventListener('click', () => {
        captureFormArea.classList.add('hidden');
        heroGrid.classList.remove('hidden');
        isCaptureUpcoming = false;
        isEditingUpcoming = false;
        currentEditIndex = -1;
        document.getElementById('transaction-form').reset();
        document.getElementById('amount-in-words').innerText = '';
    });

    document.getElementById('transaction-form').addEventListener('submit', (e) => {
        e.preventDefault();

        if (!validateForm(e.target)) return;

        const wasUpcoming = isCaptureUpcoming;
        const wasEditingUpcoming = isEditingUpcoming;

        const type = document.getElementById('trans-type').value;
        const category = document.getElementById('trans-category').value;

        if (!category && type !== 'Transfer') {
            const catLabel = document.getElementById('category-label');
            catLabel.style.color = '#ef4444';
            catLabel.innerText = 'Select Category Head * (REQUIRED)';
            document.getElementById('category-pills').classList.add('is-invalid');
            setTimeout(() => {
                catLabel.style.color = 'var(--accent)';
                catLabel.innerText = 'Select Category Head *';
                document.getElementById('category-pills').classList.remove('is-invalid');
            }, 3000);
            return;
        }

        // Validation for Accounts
        if (type === 'Transfer' || wasUpcoming) {
            const from = document.getElementById('trans-from-bank').value;
            const to = document.getElementById('trans-to-bank').value;
            if (!from) {
                alert('Please select From Account (Source).');
                return;
            }
            if (type === 'Transfer' && !to) {
                alert('Please select To Account (Destination).');
                return;
            }
            if (to && from === to) {
                alert('Source and Destination accounts cannot be the same.');
                return;
            }
        } else {
            if (!document.getElementById('trans-bank').value) {
                const accGroup = document.getElementById('standard-account-group');
                accGroup.classList.add('shake');
                accGroup.querySelector('label').style.color = '#ef4444';
                setTimeout(() => {
                    accGroup.classList.remove('shake');
                    accGroup.querySelector('label').style.color = '';
                }, 1000);
                alert('Please select an account.');
                return;
            }
        }

        const mode = document.getElementById('trans-mode').value;
        if (!mode) {
            const modePills = document.getElementById('mode-pills');
            modePills.classList.add('shake');
            modePills.previousElementSibling.style.color = '#ef4444';
            setTimeout(() => {
                modePills.classList.remove('shake');
                modePills.previousElementSibling.style.color = '';
            }, 1000);
            alert('Please select Transaction Mode (UPI/CARD/CASH/BANK/Opening Balance).');
            return;
        }

        const person = type === 'Ledger' ? document.getElementById('trans-ledger-person').value.trim() : (type === 'Expense' ? document.getElementById('trans-expense-person').value.trim() : '');
        if (type === 'Ledger' && !person) {
            const ledgerField = document.getElementById('trans-ledger-person');
            ledgerField.classList.add('is-invalid');
            ledgerField.closest('.form-group').classList.add('shake');
            setTimeout(() => ledgerField.closest('.form-group').classList.remove('shake'), 400);
            alert('Please specify the person (To/From) for this Ledger entry.');
            return;
        }

        const isUpcoming = isCaptureUpcoming;
        const frequency = isUpcoming ? document.getElementById('trans-frequency').value : null;

        if (isUpcoming && frequency !== 'Daily') {
            const bVal = parseInt(document.getElementById('trans-billing-date').value);
            const dVal = parseInt(document.getElementById('trans-due-date').value);
            if (isNaN(bVal) || bVal < 1 || bVal > 31) {
                alert('Billing Date must be a day of the month (1-31).');
                return;
            }
            if (isNaN(dVal) || dVal < 1 || dVal > 31) {
                alert('Due Date must be a day of the month (1-31).');
                return;
            }
        }

        let originalBillingDate = '';
        let originalDueDate = '';
        if (currentEditIndex >= 0 && isEditingUpcoming) {
            const orig = FinData.upcomingExpenses[currentEditIndex];
            originalBillingDate = orig.billingDate;
            originalDueDate = orig.dueDate;
        }

        const withdrawalAmt = parseFloat(document.getElementById('trans-withdrawal-amount')?.value) || 0;
        const depositAmt = parseFloat(document.getElementById('trans-deposit-amount')?.value) || 0;
        
        if (type === 'Ledger') {
            if (!withdrawalAmt && !depositAmt) {
                alert('Please specify either Withdrawal Amount or Deposit Amount.');
                return;
            }
            if (withdrawalAmt && depositAmt) {
                alert('A Ledger transaction cannot have both Withdrawal and Deposit amounts populated. Please specify only one.');
                return;
            }
        }
        
        let finalAmt = 0;
        if (type === 'Income' || type === 'Opening Balance') {
            finalAmt = depositAmt;
        } else if (type === 'Expense' || type === 'Investment' || type === 'Transfer') {
            finalAmt = withdrawalAmt;
        } else if (type === 'Ledger') {
            finalAmt = withdrawalAmt || depositAmt;
        }

        const formData = {
            type: type,
            mode: mode,
            person: person,
            category: category || (type === 'Transfer' ? 'Self Transfer' : 'Other'),
            subCategory: document.getElementById('trans-sub-category').value,
            secondSubCategory: document.getElementById('trans-second-sub-category').value,
            bank: (type === 'Transfer' || isUpcoming) ? (document.getElementById('trans-to-bank').value ? `${document.getElementById('trans-from-bank').value} > ${document.getElementById('trans-to-bank').value}` : document.getElementById('trans-from-bank').value) : document.getElementById('trans-bank').value,
            amount: mode === 'Opening Balance' ? Math.abs(finalAmt) : finalAmt,
            withdrawalAmount: type === 'Transfer' ? (document.getElementById('trans-withdrawal-amount')?.value || '') : (document.getElementById('trans-withdrawal-amount')?.value || ''),
            depositAmount: type === 'Transfer' ? (document.getElementById('trans-withdrawal-amount')?.value || '') : (document.getElementById('trans-deposit-amount')?.value || ''),
            date: document.getElementById('trans-date').value,
            time: isUpcoming ? '' : (document.getElementById('trans-time-display') ? document.getElementById('trans-time-display').value : ''),
            otherDetails: isUpcoming ? '' : (document.getElementById('trans-other-details') ? document.getElementById('trans-other-details').value : ''),
            upiRef: isUpcoming ? '' : (document.getElementById('trans-upi-ref') ? document.getElementById('trans-upi-ref').value : ''),
            billingDate: isUpcoming ? (frequency === 'Daily' ? new Date().toISOString().substring(0, 10) : constructFullDateFromDay(document.getElementById('trans-billing-date').value, originalBillingDate)) : '',
            dueDate: isUpcoming ? (frequency === 'Daily' ? new Date().toISOString().substring(0, 10) : constructFullDateFromDay(document.getElementById('trans-due-date').value, originalDueDate)) : '',
            note: document.getElementById('trans-note').value,
            mode,
            person: (type === 'Ledger' || type === 'Expense') ? person : null,
            fromBank: (type === 'Transfer' || isUpcoming) ? document.getElementById('trans-from-bank').value : null,
            toBank: (type === 'Transfer' || isUpcoming) ? document.getElementById('trans-to-bank').value : null,
            frequency: frequency
        };

        if (currentEditIndex >= 0) {
            if (isEditingUpcoming) {
                formData.id = FinData.upcomingExpenses[currentEditIndex].id;
                formData.timestamp = new Date().toISOString();
                FinData.upcomingExpenses[currentEditIndex] = formData;
                FinData.saveUpcomingExpenses();
                isEditingUpcoming = false;
                currentEditIndex = -1;
                alert('Upcoming Expense Updated Successfully!');
            } else {
                formData.id = FinData.transactions[currentEditIndex].id;
                formData.timestamp = new Date().toISOString();
                formData.recordEnteredAs = FinData.transactions[currentEditIndex].recordEnteredAs || 'Single Entry';
                FinData.transactions[currentEditIndex] = formData;
                FinData.saveTransactions();
                currentEditIndex = -1;
                alert('Transaction Updated Successfully!');
            }
        } else {
            if (isUpcoming) {
                formData.id = 'UPC-' + Date.now();
                formData.timestamp = new Date().toISOString();
                FinData.addUpcomingExpense(formData);
                alert('Upcoming Expense Saved Successfully!');
            } else {
                formData.id = Date.now().toString();
                formData.timestamp = new Date().toISOString();
                formData.recordEnteredAs = 'Single Entry';
                FinData.addTransaction(formData);
                alert('Transaction Saved Successfully!');
            }
        }
        e.target.reset();
        document.getElementById('amount-in-words').innerText = '';
        
        document.getElementById('back-to-hero').click();

        if (wasUpcoming || wasEditingUpcoming) {
            switchScreen('upcoming');
            navItems.forEach(nav => {
                nav.classList.remove('active');
                if (nav.getAttribute('data-screen') === 'dashboard') nav.classList.add('active');
            });
        } else {
            renderRecords();
            updateDashboard();
        }
    });



    let tableSortCol = 'date';
    let tableSortDir = 'desc';
    let tableFilters = {};

    window.toggleFilter = (col, event) => {
        event.stopPropagation();
        const th = event.target.closest('th');
        const input = th.querySelector('.column-filter');
        const icon = th.querySelector('.filter-icon');
        
        if (input.classList.contains('hidden')) {
            input.classList.remove('hidden');
            icon.classList.add('active');
            input.focus();
        } else {
            input.classList.add('hidden');
            icon.classList.remove('active');
            input.value = '';
            tableFilters[col] = '';
            renderRecords();
        }
    };

    window.handleSort = (col) => {
        if (tableSortCol === col) {
            tableSortDir = tableSortDir === 'asc' ? 'desc' : 'asc';
        } else {
            tableSortCol = col;
            tableSortDir = 'asc';
        }
        
        document.querySelectorAll('.sortable-header').forEach(th => {
            th.classList.remove('asc', 'desc');
            if (th.getAttribute('data-sort') === col) {
                th.classList.add(tableSortDir);
            }
        });
        renderRecords();
    };

    document.addEventListener('input', (e) => {
        if (e.target.classList.contains('column-filter')) {
            const col = e.target.getAttribute('data-col');
            tableFilters[col] = e.target.value.trim().toLowerCase();
            renderRecords();
        }
        if (e.target.id === 'record-search') {
            renderRecords();
        }
    });

    function renderRecords() {
        const tbody = document.getElementById('records-tbody');
        if (!tbody) return;
        tbody.innerHTML = '';

        let filteredTransactions = [...FinData.transactions].map((t, index) => ({ ...t, originalIndex: index }));

        // Apply Global Search
        const globalSearch = document.getElementById('record-search')?.value.toLowerCase() || '';
        if (globalSearch) {
            filteredTransactions = filteredTransactions.filter(t => {
                return Object.values(t).some(val => val && String(val).toLowerCase().includes(globalSearch));
            });
        }

        // Apply Column Filters
        Object.keys(tableFilters).forEach(col => {
            const filterValue = tableFilters[col];
            if (filterValue) {
                filteredTransactions = filteredTransactions.filter(t => {
                    let val = '';
                    if (col === 'withdrawalAmount') {
                        if (t.withdrawalAmount !== undefined && t.withdrawalAmount !== null && t.withdrawalAmount !== '') {
                            val = String(t.withdrawalAmount).toLowerCase();
                        } else {
                            const isOutflow = t.type === 'Expense' || t.type === 'Investment' || t.type === 'Transfer' || (t.type === 'Ledger' && (t.subCategory || '').toLowerCase().includes('given'));
                            val = isOutflow ? String(t.amount).toLowerCase() : '';
                        }
                    } else if (col === 'depositAmount') {
                        if (t.depositAmount !== undefined && t.depositAmount !== null && t.depositAmount !== '') {
                            val = String(t.depositAmount).toLowerCase();
                        } else {
                            const isInflow = t.type === 'Income' || t.mode === 'Opening Balance' || (t.type === 'Ledger' && ((t.subCategory || '').toLowerCase().includes('taken') || (t.category || '').toLowerCase().includes('return')));
                            val = isInflow ? String(t.amount).toLowerCase() : '';
                        }
                    } else {
                        val = t[col] ? String(t[col]).toLowerCase() : '';
                    }
                    return val.includes(filterValue);
                });
            }
        });

        // Apply Sort
        filteredTransactions.sort((a, b) => {
            let valA = a[tableSortCol];
            let valB = b[tableSortCol];
            
            if (tableSortCol === 'date' || tableSortCol === 'timestamp') {
                valA = valA ? new Date(valA).getTime() : 0;
                valB = valB ? new Date(valB).getTime() : 0;
            } else if (tableSortCol === 'amount' || tableSortCol === 'withdrawalAmount' || tableSortCol === 'depositAmount') {
                let amtA = a[tableSortCol];
                let amtB = b[tableSortCol];
                if (amtA === undefined || amtA === null || amtA === '') {
                    if (tableSortCol === 'withdrawalAmount') {
                        const isOutflow = a.type === 'Expense' || a.type === 'Investment' || a.type === 'Transfer' || (a.type === 'Ledger' && (a.subCategory || '').toLowerCase().includes('given'));
                        amtA = isOutflow ? a.amount : 0;
                    } else {
                        const isInflow = a.type === 'Income' || a.mode === 'Opening Balance' || (a.type === 'Ledger' && ((a.subCategory || '').toLowerCase().includes('taken') || (a.category || '').toLowerCase().includes('return')));
                        amtA = isInflow ? a.amount : 0;
                    }
                }
                if (amtB === undefined || amtB === null || amtB === '') {
                    if (tableSortCol === 'withdrawalAmount') {
                        const isOutflow = b.type === 'Expense' || b.type === 'Investment' || b.type === 'Transfer' || (b.type === 'Ledger' && (b.subCategory || '').toLowerCase().includes('given'));
                        amtB = isOutflow ? b.amount : 0;
                    } else {
                        const isInflow = b.type === 'Income' || b.mode === 'Opening Balance' || (b.type === 'Ledger' && ((b.subCategory || '').toLowerCase().includes('taken') || (b.category || '').toLowerCase().includes('return')));
                        amtB = isInflow ? b.amount : 0;
                    }
                }
                valA = parseFloat(amtA) || 0;
                valB = parseFloat(amtB) || 0;
            } else if (tableSortCol === 'recordEnteredAs') {
                valA = String(a.recordEnteredAs || 'Single Entry').toLowerCase();
                valB = String(b.recordEnteredAs || 'Single Entry').toLowerCase();
            } else {
                valA = String(valA || '').toLowerCase();
                valB = String(valB || '').toLowerCase();
            }

            if (valA < valB) return tableSortDir === 'asc' ? -1 : 1;
            if (valA > valB) return tableSortDir === 'asc' ? 1 : -1;
            return 0;
        });

        // Update screen title with transaction count
        if (screenTitle) {
            const totalCount = FinData.transactions.length;
            const filteredCount = filteredTransactions.length;
            if (filteredCount === totalCount) {
                screenTitle.innerText = `All Transactions (${totalCount})`;
            } else {
                screenTitle.innerText = `All Transactions (${filteredCount} of ${totalCount})`;
            }
        }

        filteredTransactions.forEach((t) => {
            if (!t) return;
            const tr = document.createElement('tr');
            
            // Build rich styled badge for the record entry origin
            const source = t.recordEnteredAs || 'Single Entry';
            let enterBadgeStyle = 'background: rgba(14, 165, 233, 0.08); color: var(--accent);';
            if (source === 'Upcoming Expenses') {
                enterBadgeStyle = 'background: rgba(16, 185, 129, 0.08); color: var(--color-income);';
            } else if (source === 'Bulk Upload') {
                enterBadgeStyle = 'background: rgba(236, 72, 153, 0.08); color: #ec4899;';
            } else if (source === 'Gmail Sync' || source === 'Gmail Sandbox') {
                enterBadgeStyle = 'background: rgba(234, 179, 8, 0.08); color: #eab308;';
            } else if (source === 'Ledger Dashboard') {
                enterBadgeStyle = 'background: rgba(245, 158, 11, 0.12); color: #f59e0b; border: 1px solid rgba(245,158,11,0.3);';
            }

            const isVerified = t.status === 'Verified';
            const verifiedHtml = isVerified ? '<i class="ri-checkbox-circle-fill" style="color: #10b981; font-size: 14px; margin-left: 4px; vertical-align: middle;" title="Verified from Gmail"></i>' : '';

            let withdrawalVal = '';
            let depositVal = '';
            
            const amt = parseFloat(t.amount || 0);
            if (t.withdrawalAmount !== undefined && t.withdrawalAmount !== null && t.withdrawalAmount !== '') {
                withdrawalVal = parseFloat(t.withdrawalAmount) ? formatCurrency(t.withdrawalAmount) : '';
            } else {
                const isOutflow = t.type === 'Expense' || t.type === 'Investment' || t.type === 'Transfer' || (t.type === 'Ledger' && (t.subCategory || '').toLowerCase().includes('given'));
                withdrawalVal = isOutflow && amt ? formatCurrency(amt) : '';
            }
            
            if (t.depositAmount !== undefined && t.depositAmount !== null && t.depositAmount !== '') {
                depositVal = parseFloat(t.depositAmount) ? formatCurrency(t.depositAmount) : '';
            } else {
                const isInflow = t.type === 'Income' || t.mode === 'Opening Balance' || (t.type === 'Ledger' && ((t.subCategory || '').toLowerCase().includes('taken') || (t.category || '').toLowerCase().includes('return')));
                depositVal = isInflow && amt ? formatCurrency(amt) : '';
            }

            tr.innerHTML = `
                <td>${formatDate(t.date)}</td>
                <td>${t.time || ''}</td>
                <td><span class="badge ${(t.type || '').toLowerCase()}">${t.type === 'Transfer' ? 'Self Transfer' : (t.type || '')}</span></td>
                <td>${t.category || ''}</td>
                <td>${t.subCategory || ''}</td>
                <td>${t.secondSubCategory || ''}</td>
                <td>${t.bank || ''}</td>
                <td>${t.person || ''}</td>
                <td>${t.mode || ''}</td>
                <td style="font-weight:700; color: var(--color-expense); text-align: right;">${withdrawalVal ? '-' + withdrawalVal : ''}</td>
                <td style="font-weight:700; color: var(--color-income); text-align: right;">${depositVal ? '+' + depositVal : ''}</td>
                <td>${t.upiRef || ''}</td>
                <td>${t.note || t.notes || ''}</td>
                <td style="font-size: 11px; color: var(--text-muted);">${formatTimestamp(t.timestamp)}</td>
                <td>
                    <div style="display: inline-flex; align-items: center;">
                        <span class="badge" style="${enterBadgeStyle} font-weight:600; font-size:11px; padding:4px 8px; border-radius:4px;">${source}</span>
                        ${verifiedHtml}
                    </div>
                </td>
                <td>
                    <button class="btn btn-icon-only" onclick="editTransaction(${t.originalIndex})"><i class="ri-edit-line"></i></button>
                    <button class="btn btn-icon-only text-danger" onclick="deleteTransaction(${t.originalIndex})"><i class="ri-delete-bin-line"></i></button>
                </td>
            `;
            tbody.appendChild(tr);
        });
    }

    window.deleteTransaction = (index) => {
        if (!confirm('Are you sure you want to delete this transaction?')) return;
        FinData.deleteTransaction(index);
        renderRecords();
        updateDashboard();
    };

    window.editTransaction = (index) => {
        isEditingUpcoming = false;
        currentEditIndex = index;
        const t = FinData.transactions[index];

        // Switch to capture screen first
        switchScreen('capture');

        // Update nav active state
        navItems.forEach(nav => {
            nav.classList.remove('active');
            if (nav.getAttribute('data-screen') === 'capture') nav.classList.add('active');
        });

        // Show the form
        showCaptureForm(t.type);

        // Change title and button text
        document.getElementById('form-title').innerText = `Edit ${t.type}`;
        document.querySelector('#transaction-form button[type="submit"]').innerText = 'Update Transaction';

        // Pre-fill fields
        const wInput = document.getElementById('trans-withdrawal-amount');
        const dInput = document.getElementById('trans-deposit-amount');
        
        if (t.withdrawalAmount !== undefined && t.withdrawalAmount !== null && t.withdrawalAmount !== '') {
            if (wInput) {
                wInput.value = t.withdrawalAmount;
                wInput.dispatchEvent(new Event('input'));
            }
        } else {
            const isOutflow = t.type === 'Expense' || t.type === 'Investment' || t.type === 'Transfer' || (t.type === 'Ledger' && (t.subCategory || '').toLowerCase().includes('given'));
            if (isOutflow && wInput) {
                wInput.value = t.amount || '';
                wInput.dispatchEvent(new Event('input'));
            }
        }

        if (t.depositAmount !== undefined && t.depositAmount !== null && t.depositAmount !== '') {
            if (dInput) {
                dInput.value = t.depositAmount;
                dInput.dispatchEvent(new Event('input'));
            }
        } else {
            const isInflow = t.type === 'Income' || t.mode === 'Opening Balance' || (t.type === 'Ledger' && ((t.subCategory || '').toLowerCase().includes('taken') || (t.category || '').toLowerCase().includes('return')));
            if (isInflow && dInput) {
                dInput.value = t.amount || '';
                dInput.dispatchEvent(new Event('input'));
            }
        }
        document.getElementById('trans-note').value = t.note || '';
        if (document.getElementById('trans-other-details')) document.getElementById('trans-other-details').value = t.otherDetails || '';
        if (document.getElementById('trans-upi-ref')) document.getElementById('trans-upi-ref').value = t.upiRef || '';
        document.getElementById('trans-date').value = t.date;

        const timeDisplay = document.getElementById('trans-time-display');
        if (timeDisplay) timeDisplay.value = t.time || formatTimeForCapture(new Date(t.timestamp || new Date()));

        const dateDisplay = document.getElementById('trans-date-display');
        if (dateDisplay) dateDisplay.value = formatDate(t.date);

        if (t.type === 'Transfer') {
            document.getElementById('trans-from-bank').value = t.fromBank || '';
            document.getElementById('trans-to-bank').value = t.toBank || '';
            document.getElementById('trans-category').value = t.category || 'Self Transfer';
            document.getElementById('trans-sub-category').value = t.subCategory || 'Own Accounts';
            document.getElementById('trans-second-sub-category').value = t.secondSubCategory || '';
        } else {
            document.getElementById('trans-category').value = t.category;
            document.getElementById('trans-sub-category').value = t.subCategory || '';
            document.getElementById('trans-second-sub-category').value = t.secondSubCategory || '';
            document.getElementById('trans-bank').value = t.bank;
            document.getElementById('trans-mode').value = t.mode || '';

            if (t.subCategory === 'Loan EMI') {
                document.getElementById('loan-emi-details').classList.remove('hidden');
            } else {
                document.getElementById('loan-emi-details').classList.add('hidden');
            }

            // Handle Ledger details
            if (t.type === 'Ledger' && t.person) {
                document.getElementById('trans-ledger-person').value = t.person;
                checkLedgerKeywords(t.subCategory || t.category);
            }

            // Handle Expense details
            if (t.type === 'Expense' && t.person) {
                document.getElementById('trans-expense-person').value = t.person;
            }

            // Highlight pills
            setTimeout(() => {
                const findAndClick = (containerId, text) => {
                    const pills = document.querySelectorAll(`#${containerId} .pill-item`);
                    pills.forEach(p => {
                        if (p.innerText === text) p.click();
                    });
                };

                findAndClick('category-pills', t.category);
                if (t.subCategory) findAndClick('sub-category-pills', t.subCategory);
                if (t.secondSubCategory) findAndClick('second-sub-category-pills', t.secondSubCategory);

                // Account Head and Account Card
                const account = FinData.masters.banks.find(b => b.name === t.bank);
                if (account) {
                    findAndClick('account-head-pills', account.head);
                    setTimeout(() => findAndClick('account-selection-cards', t.bank), 100);
                }

                // Mode Pills
                const modePills = document.querySelectorAll('#mode-pills .pill-item');
                modePills.forEach(p => {
                    const pMode = p.getAttribute('data-mode') || p.innerText;
                    if (pMode.trim().toLowerCase() === (t.mode || '').trim().toLowerCase()) {
                        p.click();
                    }
                });
            }, 100);
        }
    };

    // --- MASTERS MANAGEMENT (BOARD VIEW) ---
    function renderMasters() {
        const boards = {
            bank: { el: document.getElementById('bank-list'), countEl: document.getElementById('count-bank'), type: 'bank', cat: 'banks' },
            income: { el: document.getElementById('income-list'), countEl: document.getElementById('count-income'), type: 'category', cat: 'Income' },
            expense: { el: document.getElementById('expense-list'), countEl: document.getElementById('count-expense'), type: 'category', cat: 'Expense' },
            investment: { el: document.getElementById('investment-list'), countEl: document.getElementById('count-investment'), type: 'category', cat: 'Investment' },
            ledger: { el: document.getElementById('ledger-list'), countEl: document.getElementById('count-ledger'), type: 'category', cat: 'Ledger' },
            transfer: { el: document.getElementById('transfer-list'), countEl: document.getElementById('count-transfer'), type: 'category', cat: 'Transfer' }
        };

        Object.keys(boards).forEach(key => {
            const board = boards[key];
            if (!board.el) return;

            const items = board.type === 'bank' ? FinData.masters.banks : FinData.masters.categories[board.cat];
            board.el.innerHTML = '';
            if (!items || !Array.isArray(items)) {
                board.countEl.innerText = 0;
                return;
            }
            board.countEl.innerText = items.length;

            items.forEach((item, index) => {
                if (!item) return;
                const li = document.createElement('li');
                li.className = 'board-item';

                let subText = '';
                if (board.type === 'bank') {
                    const statusBadges = [];
                    if (item.isActive === false) statusBadges.push('<span style="color:#f43f5e">Inactive</span>');
                    if (item.authDashboard === true) statusBadges.push('<span style="color:#f59e0b">Auth Restricted</span>');
                    if (item.canTransferSelf === false) statusBadges.push('<span style="color:#94a3b8">Self-TX Disabled</span>');
                    if (item.canTransferOther === false) statusBadges.push('<span style="color:#94a3b8">Ledger Disabled</span>');
                    const badgesText = statusBadges.length > 0 ? ` | ${statusBadges.join(', ')}` : '';
                    subText = `<div style="font-size:10px; color:#64748b">${item.bankName} | ${item.type}${badgesText}</div>`;
                } else if (item.subCategories && item.subCategories.length > 0) {
                    const subList = item.subCategories.map(s => {
                        const name = typeof s === 'string' ? s : s.name;
                        const sub2Items = (typeof s === 'object' && s.subCategories) ? s.subCategories : [];
                        const sub2Text = sub2Items.length > 0 ? ` <span style="opacity:0.6; font-style:italic;">› ${sub2Items.join(', ')}</span>` : '';
                        return `<div style="margin-top:2px;">• ${name}${sub2Text}</div>`;
                    }).join('');
                    subText = `<div style="font-size:10px; color:#64748b; margin-top:4px; max-height: 60px; overflow-y: auto;">${subList}</div>`;
                }

                li.innerHTML = `
                    <div class="item-info">
                        <span style="display:block; font-weight:600">${item.name}</span>
                        ${subText}
                    </div>
                    <div class="board-item-actions">
                        <button onclick="openMasterModal('${board.type}', '${board.cat}', ${index})" title="Edit"><i class="ri-edit-line"></i></button>
                        <button class="delete-btn" onclick="deleteMaster('${board.type}', '${board.cat}', ${index})" title="Delete"><i class="ri-delete-bin-line"></i></button>
                    </div>
                `;
                board.el.appendChild(li);
            });
        });
    }

    window.quickAddMaster = (masterKey) => {
        const input = document.getElementById(`input-${masterKey}`);
        const name = input.value.trim();

        const boardConfig = {
            bank: { type: 'bank', cat: 'banks' },
            income: { type: 'category', cat: 'Income' },
            expense: { type: 'category', cat: 'Expense' },
            investment: { type: 'category', cat: 'Investment' },
            ledger: { type: 'category', cat: 'Ledger' },
            transfer: { type: 'category', cat: 'Transfer' }
        }[masterKey];

        // Instead of quick adding, open the full modal to capture all details
        window.openMasterModal(boardConfig.type, boardConfig.cat, -1);

        // Pre-fill the name if the user had typed something
        if (name) {
            document.getElementById('master-name').value = name;
        }

        input.value = ''; // Clear the board input
    };

    const updateShortName = () => {
        const input = document.getElementById('master-bank-holder');
        if (!input) return;

        // Prevent cursor jumping while auto-capitalizing
        const start = input.selectionStart;
        const end = input.selectionEnd;
        const upperValue = input.value.toUpperCase();
        if (input.value !== upperValue) {
            input.value = upperValue;
            input.setSelectionRange(start, end);
        }

        const holder = input.value.trim();
        const shortField = document.getElementById('master-bank-short-name');
        if (!shortField) return;

        if (!holder) {
            shortField.value = '';
            updateAccountName();
            return;
        }

        const initials = holder.split(/\s+/).filter(w => w).map(word => word[0]).join('').toUpperCase();
        shortField.value = initials;

        // Refresh full account name since initials changed
        updateAccountName();
    };

    window.updateShortName = updateShortName;

    const updateAccountName = () => {
        const typeEl = document.getElementById('master-target-type');
        if (!typeEl || typeEl.value !== 'bank') return;

        const bankInput = document.getElementById('master-bank-name');
        if (!bankInput) return;

        // Prevent cursor jumping while auto-capitalizing
        const bStart = bankInput.selectionStart;
        const bEnd = bankInput.selectionEnd;
        const bUpperValue = bankInput.value.toUpperCase();
        if (bankInput.value !== bUpperValue) {
            bankInput.value = bUpperValue;
            bankInput.setSelectionRange(bStart, bEnd);
        }

        const bank = bankInput.value.trim();
        const headEl = document.getElementById('master-bank-head');
        const head = headEl ? headEl.value : '';
        const accTypeEl = document.getElementById('master-bank-type');
        const accType = accTypeEl ? accTypeEl.value : '';

        const numberEl = document.getElementById('master-bank-number');
        const number = numberEl ? numberEl.value.trim() : '';

        const cardNumberEl = document.getElementById('master-bank-card-number');
        const cardNumber = cardNumberEl ? cardNumberEl.value.trim() : '';

        const shortNameEl = document.getElementById('master-bank-short-name');
        const shortName = shortNameEl ? shortNameEl.value : '';

        const formattedAcc = number ? 'A' + number : '';
        const formattedCard = cardNumber ? 'C' + cardNumber : '';

        // Removed 'head' from the display name as per user request
        const fullName = [shortName, bank, accType, formattedAcc, formattedCard].filter(v => v).join(' - ');

        const masterNameEl = document.getElementById('master-name');
        if (masterNameEl) masterNameEl.value = fullName;

        const displayField = document.getElementById('master-bank-display-name');
        if (displayField) displayField.value = fullName;
    };

    const populateAccountHeads = (selectedValue = 'Saving Account') => {
        const select = document.getElementById('master-bank-head');
        if (!select) return;

        select.innerHTML = '';
        FinData.masters.accountHeads.forEach(head => {
            const opt = document.createElement('option');
            opt.value = head;
            opt.innerText = head;
            if (head === selectedValue) opt.selected = true;
            select.appendChild(opt);
        });
    };

    window.updateAccountName = updateAccountName;

    const populateAccountTypes = (selectedValue = 'Saving') => {
        const select = document.getElementById('master-bank-type');
        if (!select) return;

        select.innerHTML = '';
        FinData.masters.accountTypes.forEach(type => {
            // Remove SA, CA, and CC as per user request
            if (['SA', 'CA', 'CC'].includes(type)) return;

            const opt = document.createElement('option');
            opt.value = type;
            opt.innerText = type;
            if (type === selectedValue) opt.selected = true;
            select.appendChild(opt);
        });
    };

    const checkMasterBankHead = () => {
        const headEl = document.getElementById('master-bank-head');
        if (!headEl) return;
        const loanDetails = document.getElementById('master-bank-loan-details');
        if (!loanDetails) return;

        const loanFieldIds = [
            'master-bank-loan-sanctioned-date', 'master-bank-loan-emi-start-date',
            'master-bank-loan-duration-years', 'master-bank-loan-duration-months',
            'master-bank-loan-end-date', 'master-bank-loan-rate',
            'master-bank-loan-emi-amount', 'master-bank-loan-emi-billing-date',
            'master-bank-loan-emi-due-date'
        ];
        // Fields that are optional even for Loan (not required)
        const loanOptionalIds = [
            'master-bank-loan-sanctioned-date', 'master-bank-loan-emi-billing-date',
            'master-bank-loan-emi-due-date', 'master-bank-loan-rate',
            'master-bank-loan-emi-amount'
        ];

        if (headEl.value === 'Loan') {
            loanDetails.classList.remove('hidden');
            // Set required only on mandatory loan fields
            loanFieldIds.forEach(id => {
                const el = document.getElementById(id);
                if (el) el.required = !loanOptionalIds.includes(id);
            });
        } else {
            loanDetails.classList.add('hidden');
            // Remove required from ALL loan fields when hidden
            loanFieldIds.forEach(id => {
                const el = document.getElementById(id);
                if (el) el.required = false;
            });
        }
    };
    window.checkMasterBankHead = checkMasterBankHead;

    const calculateLoanEndDate = () => {
        const startVal = document.getElementById('master-bank-loan-emi-start-date').value;
        const years = parseInt(document.getElementById('master-bank-loan-duration-years').value) || 0;
        const months = parseInt(document.getElementById('master-bank-loan-duration-months').value) || 0;
        
        if (!startVal) {
            document.getElementById('master-bank-loan-end-date').value = '';
            return;
        }
        
        // Use split to parse the local date exactly, preventing timezone shift issues
        const parts = startVal.split('-');
        const date = new Date(parts[0], parts[1] - 1, parts[2]);
        if (isNaN(date.getTime())) {
            document.getElementById('master-bank-loan-end-date').value = '';
            return;
        }
        
        const targetDay = date.getDate();
        const totalMonths = (years * 12) + months;
        date.setMonth(date.getMonth() + totalMonths);
        
        // If the date day changed (e.g. 31st overflowed to 3rd of next month in February), 
        // set the date to the last day of the previous month (using 0 day)
        if (date.getDate() !== targetDay) {
            date.setDate(0);
        }
        
        const yyyy = date.getFullYear();
        const mm = String(date.getMonth() + 1).padStart(2, '0');
        const dd = String(date.getDate()).padStart(2, '0');
        document.getElementById('master-bank-loan-end-date').value = `${yyyy}-${mm}-${dd}`;
    };
    window.calculateLoanEndDate = calculateLoanEndDate;

    window.openMasterModal = (type, category, index = -1) => {
        const modal = document.getElementById('master-modal');
        const form = document.getElementById('master-form');
        form.reset();

        document.getElementById('master-target-type').value = type;
        document.getElementById('master-target-cat').value = category;
        document.getElementById('master-edit-index').value = index;

        const bankFields = document.getElementById('bank-fields');
        const categoryFields = document.getElementById('category-fields');
        const nameGroup = document.getElementById('master-name-group');
        const subCatList = document.getElementById('sub-category-list');
        subCatList.innerHTML = '';

        const bankInputs = bankFields.querySelectorAll('input, select');
        const commonInputs = nameGroup.querySelectorAll('input');

        if (type === 'bank') {
            bankFields.classList.remove('hidden');
            categoryFields.classList.add('hidden');
            nameGroup.classList.add('hidden');

            // Manage required attributes - exclude notes, display names, balance, checkboxes, and loan detail fields
            // Loan fields are managed separately by checkMasterBankHead()
            const loanFieldIds = [
                'master-bank-loan-sanctioned-date', 'master-bank-loan-emi-start-date',
                'master-bank-loan-duration-years', 'master-bank-loan-duration-months',
                'master-bank-loan-end-date', 'master-bank-loan-rate',
                'master-bank-loan-emi-amount', 'master-bank-loan-emi-billing-date',
                'master-bank-loan-emi-due-date'
            ];
            bankInputs.forEach(i => {
                const isExcluded = [
                    'master-bank-notes', 'master-bank-display-name',
                    'master-bank-short-name', 'master-bank-balance'
                ].includes(i.id) || i.type === 'checkbox' || loanFieldIds.includes(i.id);
                if (!isExcluded) i.required = true;
            });
            commonInputs.forEach(i => i.required = false);
            // Loan section required state is set by checkMasterBankHead() below

            // Populate dynamic account types and heads
            let currentType = 'Saving';
            let currentHead = 'Saving Account';
            if (index > -1) {
                const item = FinData.masters.banks[index];
                currentType = item.type;
                currentHead = item.accountHead;
            }
            populateAccountTypes(currentType);
            populateAccountHeads(currentHead);
        } else {
            bankFields.classList.add('hidden');
            nameGroup.classList.remove('hidden');

            // Manage required attributes
            bankInputs.forEach(i => i.required = false);
            commonInputs.forEach(i => i.required = true);

            // Show sub-categories only for relevant types
            if (['Income', 'Expense', 'Investment', 'Ledger', 'Transfer'].includes(category)) {
                categoryFields.classList.remove('hidden');
            } else {
                categoryFields.classList.add('hidden');
            }
        }

        if (index > -1) {
            const items = type === 'bank' ? FinData.masters.banks : FinData.masters.categories[category];
            const item = items[index];
            document.getElementById('master-modal-title').innerText = type === 'bank' ? 'Modify Account' : 'Modify Category Head';
            document.getElementById('master-name').value = item.name;

            if (type === 'bank') {
                document.getElementById('master-bank-holder').value = item.holderName || '';
                document.getElementById('master-bank-short-name').value = item.shortName || '';
                document.getElementById('master-bank-name').value = item.bankName || '';
                document.getElementById('master-bank-number').value = item.number || '';
                document.getElementById('master-bank-card-number').value = item.cardNumber || '';
                document.getElementById('master-bank-balance').value = item.openingBalance || '';
                document.getElementById('master-bank-balance').dispatchEvent(new Event('input'));
                document.getElementById('master-bank-notes').value = item.notes || '';
                document.getElementById('master-bank-display-name').value = item.name || '';
                
                if (item.accountHead === 'Loan') {
                    document.getElementById('master-bank-loan-sanctioned-date').value = item.loanSanctionedDate || '';
                    document.getElementById('master-bank-loan-emi-start-date').value = item.loanEmiStartDate || '';
                    document.getElementById('master-bank-loan-duration-years').value = item.loanDurationYears || '';
                    document.getElementById('master-bank-loan-duration-months').value = item.loanDurationMonths || '';
                    document.getElementById('master-bank-loan-end-date').value = item.loanEndDate || '';
                    document.getElementById('master-bank-loan-rate').value = item.loanRate || '';
                    document.getElementById('master-bank-loan-emi-amount').value = item.loanEmiAmount || '';
                    document.getElementById('master-bank-loan-emi-billing-date').value = item.loanEmiBillingDate || '';
                    document.getElementById('master-bank-loan-emi-due-date').value = item.loanEmiDueDate || '';
                } else {
                    document.getElementById('master-bank-loan-sanctioned-date').value = '';
                    document.getElementById('master-bank-loan-emi-start-date').value = '';
                    document.getElementById('master-bank-loan-duration-years').value = '';
                    document.getElementById('master-bank-loan-duration-months').value = '';
                    document.getElementById('master-bank-loan-end-date').value = '';
                    document.getElementById('master-bank-loan-rate').value = '';
                    document.getElementById('master-bank-loan-emi-amount').value = '';
                    document.getElementById('master-bank-loan-emi-billing-date').value = '';
                    document.getElementById('master-bank-loan-emi-due-date').value = '';
                }

                // Populate checkboxes
                document.getElementById('master-bank-is-active').checked = item.isActive !== false;
                document.getElementById('master-bank-is-income').checked = item.isIncomeAccount !== false;
                document.getElementById('master-bank-is-expense').checked = item.isExpenseAccount !== false;
                document.getElementById('master-bank-auth-dashboard').checked = item.authDashboard === true;
                document.getElementById('master-bank-can-transfer-self').checked = item.canTransferSelf !== false;
                document.getElementById('master-bank-can-transfer-other').checked = item.canTransferOther !== false;
            } else if (item.subCategories) {
                item.subCategories.forEach(sub => addSubCategoryField(sub));
            }
        } else {
            document.getElementById('master-modal-title').innerText = type === 'bank' ? 'Add New Account' : 'Add New Category Head';
            if (type === 'category') {
                addSubCategoryField(); // Start with one empty field
            } else if (type === 'bank') {
                // Default checkbox states for new accounts
                document.getElementById('master-bank-is-active').checked = true;
                document.getElementById('master-bank-is-income').checked = true;
                document.getElementById('master-bank-is-expense').checked = true;
                document.getElementById('master-bank-auth-dashboard').checked = false;
                document.getElementById('master-bank-can-transfer-self').checked = true;
                document.getElementById('master-bank-can-transfer-other').checked = true;
                document.getElementById('master-bank-balance').value = '';
                document.getElementById('master-bank-balance').dispatchEvent(new Event('input'));

                // Clear loan fields for new accounts
                document.getElementById('master-bank-loan-sanctioned-date').value = '';
                document.getElementById('master-bank-loan-emi-start-date').value = '';
                document.getElementById('master-bank-loan-duration-years').value = '';
                document.getElementById('master-bank-loan-duration-months').value = '';
                document.getElementById('master-bank-loan-end-date').value = '';
                document.getElementById('master-bank-loan-rate').value = '';
                document.getElementById('master-bank-loan-emi-billing-date').value = '';
                document.getElementById('master-bank-loan-emi-due-date').value = '';
            }
        }

        checkMasterBankHead();
        modal.style.display = 'flex';
    };

    window.addAccountHeadOption = () => {
        const newHead = prompt('Enter new Account Type Head (e.g. Wallet, Mutual Fund, Cash):');
        if (newHead) {
            FinData.addAccountHead(newHead);
            populateAccountHeads(newHead);
            updateAccountName();
        }
    };

    window.addBankTypeOption = () => {
        const newType = prompt('Enter new Account Type (e.g. Credit Card, Mutual Fund, Loan):');
        if (newType) {
            FinData.addAccountType(newType);
            populateAccountTypes(newType);
            updateAccountName();
        }
    };

    window.addSubCategoryField = (data = { name: '', subCategories: [] }) => {
        const list = document.getElementById('sub-category-list');
        const itemDiv = document.createElement('div');
        itemDiv.className = 'sub-cat-item-container';

        // Handle both string and object data
        const name = typeof data === 'string' ? data : (data.name || '');
        const sub2 = (typeof data === 'object' && data.subCategories) ? data.subCategories : [];

        itemDiv.innerHTML = `
            <div class="sub-cat-row" style="display: flex; gap: 8px; align-items: center; margin-bottom: 8px;">
                <i class="ri-corner-down-right-line" style="color: var(--accent); opacity: 0.5;"></i>
                <input type="text" class="sub-cat-input" value="${name}" placeholder="Category Name" style="flex: 1;">
                <button type="button" class="btn btn-icon-only" onclick="addSecondLevelSubField(this)" title="Add SubCategory"><i class="ri-add-line"></i></button>
                <button type="button" class="btn btn-icon-only" onclick="bulkAddSecondLevel(this)" title="Bulk Add SubCategory" style="color: var(--accent);"><i class="ri-list-check-2"></i></button>
                <button type="button" class="btn btn-icon-only text-danger" onclick="this.closest('.sub-cat-item-container').remove()"><i class="ri-delete-bin-line"></i></button>
            </div>
            <div class="sub-cat-level-2-list" style="margin-left: 30px; display: flex; flex-direction: column; gap: 6px; margin-bottom: 12px;">
                <!-- 2nd level items -->
            </div>
        `;

        const level2List = itemDiv.querySelector('.sub-cat-level-2-list');
        sub2.forEach(s => addSecondLevelSubField(level2List, s));

        list.appendChild(itemDiv);
    };

    window.addSecondLevelSubField = (target, value = '') => {
        let list;
        if (target instanceof HTMLElement && target.classList.contains('sub-cat-level-2-list')) {
            list = target;
        } else {
            // Called from button
            list = target.closest('.sub-cat-item-container').querySelector('.sub-cat-level-2-list');
        }

        const div = document.createElement('div');
        div.style.display = 'flex';
        div.style.gap = '8px';
        div.style.alignItems = 'center';
        div.innerHTML = `
            <i class="ri-subtract-line" style="opacity: 0.3;"></i>
            <input type="text" class="sub-cat-level-2-input" value="${value}" placeholder="SubCategory" style="flex: 1; font-size: 13px; padding: 6px 10px; height: 32px;">
            <button type="button" class="btn btn-icon-only text-danger" onclick="this.parentElement.remove()" style="width: 28px; height: 28px;"><i class="ri-close-line"></i></button>
        `;
        list.appendChild(div);
    };

    window.bulkAddSecondLevel = (btn) => {
        const input = prompt('Enter SubCategories (separated by commas):');
        if (input) {
            const list = btn.closest('.sub-cat-item-container').querySelector('.sub-cat-level-2-list');
            const items = input.split(',').map(s => s.trim()).filter(v => v);
            items.forEach(item => addSecondLevelSubField(list, item));
        }
    };

    window.closeMasterModal = () => {
        document.getElementById('master-modal').style.display = 'none';
        document.getElementById('master-form').reset();
        const display = document.getElementById('master-balance-in-words');
        if (display) display.innerText = '';
    };

    document.getElementById('master-form').onsubmit = (e) => {
        e.preventDefault();

        if (!validateForm(e.target)) return;

        const type = document.getElementById('master-target-type').value;
        const category = document.getElementById('master-target-cat').value;
        const index = parseInt(document.getElementById('master-edit-index').value);

        const items = type === 'bank' ? FinData.masters.banks : FinData.masters.categories[category];

        const data = {
            name: document.getElementById('master-name').value,
            status: index > -1 ? items[index].status : 'Active',
            synced: false
        };

        if (type === 'bank') {
            data.holderName = document.getElementById('master-bank-holder').value;
            data.shortName = document.getElementById('master-bank-short-name').value;
            data.bankName = document.getElementById('master-bank-name').value;
            data.accountHead = document.getElementById('master-bank-head').value;
            data.type = document.getElementById('master-bank-type').value;
            data.number = document.getElementById('master-bank-number').value;
            data.cardNumber = document.getElementById('master-bank-card-number').value;
            data.notes = document.getElementById('master-bank-notes').value;

            // Save checkbox states
            data.isActive = document.getElementById('master-bank-is-active').checked;
            data.isIncomeAccount = document.getElementById('master-bank-is-income').checked;
            data.isExpenseAccount = document.getElementById('master-bank-is-expense').checked;
            data.authDashboard = document.getElementById('master-bank-auth-dashboard').checked;
            data.canTransferSelf = document.getElementById('master-bank-can-transfer-self').checked;
            data.canTransferOther = document.getElementById('master-bank-can-transfer-other').checked;
            data.openingBalance = Math.abs(parseFloat(document.getElementById('master-bank-balance').value) || 0);

            if (data.accountHead === 'Loan') {
                data.loanSanctionedDate = document.getElementById('master-bank-loan-sanctioned-date').value;
                data.loanEmiStartDate = document.getElementById('master-bank-loan-emi-start-date').value;
                data.loanDurationYears = parseInt(document.getElementById('master-bank-loan-duration-years').value) || 0;
                data.loanDurationMonths = parseInt(document.getElementById('master-bank-loan-duration-months').value) || 0;
                data.loanEndDate = document.getElementById('master-bank-loan-end-date').value;
                data.loanRate = parseFloat(document.getElementById('master-bank-loan-rate').value) || 0;
                data.loanEmiAmount = parseFloat(document.getElementById('master-bank-loan-emi-amount').value) || 0;
                data.loanEmiBillingDate = document.getElementById('master-bank-loan-emi-billing-date').value;
                data.loanEmiDueDate = document.getElementById('master-bank-loan-emi-due-date').value;
            } else {
                delete data.loanSanctionedDate;
                delete data.loanEmiStartDate;
                delete data.loanDurationYears;
                delete data.loanDurationMonths;
                delete data.loanEndDate;
                delete data.loanRate;
                delete data.loanEmiAmount;
                delete data.loanEmiBillingDate;
                delete data.loanEmiDueDate;
            }
        } else {
            const subItemContainers = document.querySelectorAll('.sub-cat-item-container');
            data.subCategories = Array.from(subItemContainers).map(container => {
                const name = container.querySelector('.sub-cat-input').value.trim();
                const level2Inputs = container.querySelectorAll('.sub-cat-level-2-input');
                const level2 = Array.from(level2Inputs).map(i => i.value.trim()).filter(v => v);

                if (level2.length > 0) {
                    return { name, subCategories: level2 };
                }
                return name;
            }).filter(s => (typeof s === 'string' ? s : s.name));
        }

        if (index > -1) {
            items[index] = data;
        } else {
            items.push(data);
        }

        FinData.updateMaster(type, category, items);
        renderMasters();
        window.closeMasterModal();
    };

    window.toggleMasterStatus = (type, category, index) => {
        const items = type === 'bank' ? FinData.masters.banks : FinData.masters.categories[category];
        items[index].status = items[index].status === 'Active' ? 'Discontinued' : 'Active';
        items[index].synced = false;
        FinData.updateMaster(type, category, items);
        renderMasters();
    };

    window.syncMaster = (type, category, index) => {
        const items = type === 'bank' ? FinData.masters.banks : FinData.masters.categories[category];
        const item = items[index];

        // Visual feedback
        const btn = event.currentTarget;
        btn.innerHTML = '<i class="ri-loader-4-line ri-spin"></i>';

        setTimeout(() => {
            item.synced = true;
            FinData.updateMaster(type, category, items);
            renderMasters();
            console.log(`Synced ${item.name} to Database`);
        }, 1000);
    };

    window.deleteMaster = (type, category, index) => {
        const items = type === 'bank' ? FinData.masters.banks : FinData.masters.categories[category];
        const item = items[index];

        // Check if master is tagged to any transaction
        const isTagged = FinData.transactions.some(t => {
            if (type === 'bank') return t.bank === item.name;
            return t.category === item.name;
        });

        if (isTagged) {
            alert(`CRITICAL ALERT: Deletion blocked! The master record "${item.name}" is tagged to existing transactions. Please discontinue the record instead if it's no longer required.`);
            return;
        }

        if (!confirm(`Are you sure you want to permanently delete "${item.name}"? This action cannot be undone.`)) return;

        items.splice(index, 1);
        FinData.updateMaster(type, category, items);
        renderMasters();
    };

    function formatTimestamp(isoStr) {
        if (!isoStr) return 'N/A';
        const date = new Date(isoStr);
        if (isNaN(date.getTime())) return 'N/A';

        const day = String(date.getDate()).padStart(2, '0');
        const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
        const month = months[date.getMonth()];
        const year = date.getFullYear();

        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');
        const seconds = String(date.getSeconds()).padStart(2, '0');
        const strTime = hours + ':' + minutes + ':' + seconds;

        return `${day}-${month}-${year} ${strTime}`;
    }

    // --- BULK IMPORT LOGIC ---
    let pendingBulkRecords = [];

    document.getElementById('bulk-import-btn')?.addEventListener('click', () => {
        document.getElementById('bulk-file-input')?.click();
    });

    document.getElementById('bulk-file-input')?.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (ev) => {
            try {
                if (typeof XLSX === 'undefined') {
                    alert('SheetJS library (XLSX) is not loaded. Please verify you have an active internet connection to download the required dependency.');
                    return;
                }
                const data = new Uint8Array(ev.target.result);
                const workbook = XLSX.read(data, { type: 'array' });
                const firstSheet = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[firstSheet];
                
                const rows = XLSX.utils.sheet_to_json(worksheet, { raw: false, defval: '' });
                if (rows.length === 0) {
                    alert('The uploaded Excel sheet contains no data.');
                    return;
                }

                processBulkData(rows);
            } catch (err) {
                console.error("Error reading Excel file:", err);
                alert("Failed to parse the Excel file. Please ensure it is a valid format.");
            }
        };
        reader.readAsArrayBuffer(file);
        e.target.value = ''; // Reset input
    });

    document.getElementById('download-template-btn')?.addEventListener('click', () => {
        // Create an Excel template
        const headers = ['Date (DD-MMM-YYYY)', 'Time (HH:MM:SS)', 'Type', 'Category Head', 'Category', 'SubCategory', 'Account', 'LedgerPerson', 'Mode', 'Withdrawal Amount(INR)', 'Deposit Amount(INR)', 'UPI Ref No.', 'Note'];

        let sampleIncomeCat = 'Salary', sampleIncomeSub = 'Monthly Base';
        const activeIncome = (FinData.masters.categories.Income || []).filter(c => c.status !== 'Discontinued');
        if (activeIncome.length > 0) {
            sampleIncomeCat = activeIncome[0].name;
            if (activeIncome[0].subCategories && activeIncome[0].subCategories.length > 0) {
                sampleIncomeSub = typeof activeIncome[0].subCategories[0] === 'string' ? activeIncome[0].subCategories[0] : (activeIncome[0].subCategories[0].name || '');
            } else {
                sampleIncomeSub = '';
            }
        }

        let sampleLedgerCat = 'Friends & Family', sampleLedgerSub = 'Loans Debited';
        const activeLedger = (FinData.masters.categories.Ledger || []).filter(c => c.status !== 'Discontinued');
        if (activeLedger.length > 0) {
            sampleLedgerCat = activeLedger[0].name;
            if (activeLedger[0].subCategories && activeLedger[0].subCategories.length > 0) {
                sampleLedgerSub = typeof activeLedger[0].subCategories[0] === 'string' ? activeLedger[0].subCategories[0] : (activeLedger[0].subCategories[0].name || '');
            } else {
                sampleLedgerSub = '';
            }
        }

        let sampleBank1 = 'Primary Checking', sampleBank2 = 'Emergency Savings';
        const activeBanks = FinData.masters.banks.filter(b => b.status !== 'Discontinued');
        if (activeBanks.length > 0) {
            sampleBank1 = activeBanks[0].name;
            sampleBank2 = activeBanks.length > 1 ? activeBanks[1].name : activeBanks[0].name;
        }

        const sampleRow1 = ['15-May-2026', '09:00:00', 'Income', sampleIncomeCat, sampleIncomeSub, '', sampleBank1, '', 'Bank Transfer', '', '5000', 'REF123', 'Sample Income'];
        const sampleRow2 = ['16-May-2026', '14:30:00', 'Self Transfer', '', '', '', `${sampleBank1} > ${sampleBank2}`, '', 'UPI', '1000', '1000', 'REF456', 'Sample Transfer'];
        const sampleRow3 = ['17-May-2026', '18:15:00', 'Ledger', sampleLedgerCat, sampleLedgerSub, '', sampleBank1, 'John Doe', 'Bank Transfer', '500', '', '', 'Sample Ledger'];

        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.aoa_to_sheet([headers, sampleRow1, sampleRow2, sampleRow3]);

        // Auto-size columns slightly
        ws['!cols'] = headers.map(h => ({ wch: Math.max(h.length, 15) }));

        XLSX.utils.book_append_sheet(wb, ws, "Template");

        // --- ADD DYNAMIC MASTER DATA SHEET ---
        const masterHeaders = ['Master Type', 'Primary Value', 'Secondary Value', 'Tertiary Value'];
        const masterRows = [];

        // Add Valid Modes dynamically from DOM
        const validModes = Array.from(document.querySelectorAll('#mode-pills .pill-item')).map(p => p.getAttribute('data-mode'));
        (validModes.length ? validModes : ['UPI', 'CARD', 'CASH', 'Bank Transfer', 'Opening Balance', 'Auto Deduction']).forEach(m => masterRows.push(['Mode', m, '', '']));

        // Add Active Bank Accounts
        FinData.masters.banks.forEach(b => {
            if (b.status !== 'Discontinued') {
                masterRows.push(['Account', b.name, b.type || '', b.number || '']);
            }
        });

        // Helper to add Categories
        const addCatMaster = (typeKey, typeLabel) => {
            const cats = FinData.masters.categories[typeKey] || [];
            cats.forEach(c => {
                if (c.status === 'Discontinued') return;

                if (!c.subCategories || c.subCategories.length === 0) {
                    masterRows.push([typeLabel, c.name, '', '']);
                } else {
                    c.subCategories.forEach(sub => {
                        const subName = typeof sub === 'string' ? sub : (sub.name || '');
                        const sub2 = (typeof sub === 'object' && sub.subCategories) ? sub.subCategories : [];

                        if (sub2.length === 0) {
                            masterRows.push([typeLabel, c.name, subName, '']);
                        } else {
                            sub2.forEach(s2 => {
                                masterRows.push([typeLabel, c.name, subName, s2]);
                            });
                        }
                    });
                }
            });
        };

        addCatMaster('Income', 'Income Category');
        addCatMaster('Expense', 'Expense Category');
        addCatMaster('Investment', 'Investment Category');
        addCatMaster('Ledger', 'Ledger Category');
        addCatMaster('Transfer', 'Self Transfer Category');

        // Prepend headers and create sheet
        const wsMasters = XLSX.utils.aoa_to_sheet([masterHeaders, ...masterRows]);
        wsMasters['!cols'] = [{ wch: 18 }, { wch: 25 }, { wch: 25 }, { wch: 25 }]; // Column widths
        XLSX.utils.book_append_sheet(wb, wsMasters, "Reference Masters");

        XLSX.writeFile(wb, "MyFinfo_Transactions_Template.xlsx");
    });

    // Sort errors to top when clicking on "Errors" badge
    document.getElementById('invalid-count')?.addEventListener('click', () => {
        pendingBulkRecords.sort((a, b) => {
            if (a.isValid === b.isValid) return 0;
            return a.isValid ? 1 : -1; // false (invalid) comes first
        });
        window.renderBulkPreview();
    });

    // Sort valid to top when clicking on "Valid" badge
    document.getElementById('valid-count')?.addEventListener('click', () => {
        pendingBulkRecords.sort((a, b) => {
            if (a.isValid === b.isValid) return 0;
            return a.isValid ? -1 : 1; // true (valid) comes first
        });
        window.renderBulkPreview();
    });

    function parseAnyDate(str) {
        if (!str) return null;
        const custom = parseDateString(str);
        if (custom) return custom;
        const d = new Date(str);
        if (!isNaN(d.getTime())) return d;
        return null;
    }

    function validateBulkRecord(r) {
        let isValid = true;
        let errors = [];
        let invalidFields = [];

        const rec = {
            date: '', time: '', type: '', category: '', subCategory: '', secondSubCategory: '',
            bank: '', fromBank: '', toBank: '', person: '', mode: '', amount: 0, note: '', otherDetails: '', upiRef: '',
            withdrawalAmount: '', depositAmount: ''
        };

        if (r['Type']) {
            const rawType = String(r['Type']).trim();
            if (rawType.toLowerCase() === 'self transfer' || rawType.toLowerCase() === 'transfer') {
                rec.type = 'Transfer';
            } else {
                rec.type = rawType;
            }
        }

        // Auto-detect Transfer type if Account column contains a '>' or ' to '
        const rawAccountVal = r['Account'] ? String(r['Account']).trim() : '';
        if (rawAccountVal.includes('>') || rawAccountVal.includes(' to ')) {
            rec.type = 'Transfer';
        }

        if (r['Date (DD-MMM-YYYY)']) {
            rec.date = String(r['Date (DD-MMM-YYYY)']).trim();
        } else if (r['Date']) {
            rec.date = String(r['Date']).trim();
        }

        if (r['Time (HH:MM:SS)']) {
            rec.time = String(r['Time (HH:MM:SS)']).trim();
        } else if (r['Time']) {
            rec.time = String(r['Time']).trim();
        }

        // Support both new nomenclature & backward compatibility mapping
        const catHeadKey = r['Category Head'] || r['Category'];
        const catKey = r['Category Head'] ? r['Category'] : r['SubCategory'];
        const subCatKey = r['Category Head'] ? r['SubCategory'] : r['2ndSubCategory'];

        if (catHeadKey) rec.category = String(catHeadKey).trim();
        if (catKey) rec.subCategory = String(catKey).trim();
        if (subCatKey) rec.secondSubCategory = String(subCatKey).trim();
        
        if (r['Account']) {
            rec.bank = String(r['Account']).trim();
        } else if (r['Account/Bank']) {
            rec.bank = String(r['Account/Bank']).trim();
        }

        if (r['TransferFrom']) rec.fromBank = String(r['TransferFrom']).trim();
        if (r['TransferTo']) rec.toBank = String(r['TransferTo']).trim();

        if (rec.type === 'Transfer' && !rec.fromBank && !rec.toBank) {
            const accVal = rec.bank || '';
            if (accVal.includes('>')) {
                const parts = accVal.split('>');
                rec.fromBank = parts[0] ? parts[0].trim() : '';
                rec.toBank = parts[1] ? parts[1].trim() : '';
            } else if (accVal.includes(' to ')) {
                const parts = accVal.split(' to ');
                rec.fromBank = parts[0] ? parts[0].trim() : '';
                rec.toBank = parts[1] ? parts[1].trim() : '';
            } else {
                rec.fromBank = accVal;
                rec.toBank = '';
            }
        }

        if (r['LedgerPerson']) {
            rec.person = String(r['LedgerPerson']).trim();
        } else if (r['Ledger Person']) {
            rec.person = String(r['Ledger Person']).trim();
        }
        if (r['Mode']) rec.mode = String(r['Mode']).trim();

        if (r['Withdrawal Amount(INR)']) rec.withdrawalAmount = String(r['Withdrawal Amount(INR)']).trim();
        if (r['Deposit Amount(INR)']) rec.depositAmount = String(r['Deposit Amount(INR)']).trim();
        
        // Backward compatibility fallback to Amount
        if (r['Amount'] && !rec.withdrawalAmount && !rec.depositAmount) {
            const fallbackAmt = String(r['Amount']).trim();
            const tType = String(r['Type'] || '').trim().toLowerCase();
            if (tType === 'income' || tType === 'opening balance') {
                rec.depositAmount = fallbackAmt;
            } else if (tType === 'expense' || tType === 'investment') {
                rec.withdrawalAmount = fallbackAmt;
            } else if (tType === 'transfer') {
                rec.withdrawalAmount = fallbackAmt;
                rec.depositAmount = fallbackAmt;
            } else if (tType === 'ledger') {
                const sub = String(r['Category'] || r['SubCategory'] || '').toLowerCase();
                const cat = String(r['Category Head'] || r['Category'] || '').toLowerCase();
                if (sub.includes('given') || sub.includes('debited') || cat.includes('lend')) {
                    rec.withdrawalAmount = fallbackAmt;
                } else {
                    rec.depositAmount = fallbackAmt;
                }
            }
        }

        const cleanNumber = (val) => {
            if (!val) return 0;
            return parseFloat(String(val).replace(/[^0-9.-]+/g, ""));
        };

        const wAmt = cleanNumber(rec.withdrawalAmount);
        const dAmt = cleanNumber(rec.depositAmount);
        
        rec.withdrawalAmount = wAmt ? wAmt.toString() : '';
        rec.depositAmount = dAmt ? dAmt.toString() : '';
        rec.amount = wAmt || dAmt;

        if (r['UPI Ref No.']) {
            rec.upiRef = String(r['UPI Ref No.']).trim();
        } else if (r['UPI Ref']) {
            rec.upiRef = String(r['UPI Ref']).trim();
        }
        if (r['Note']) rec.note = String(r['Note']).trim();

        const parsedD = parseAnyDate(rec.date);
        if (!parsedD) { isValid = false; errors.push('Invalid Date'); invalidFields.push('date'); }
        else {
            rec.date = `${parsedD.getFullYear()}-${String(parsedD.getMonth() + 1).padStart(2, '0')}-${String(parsedD.getDate()).padStart(2, '0')}`;
        }

        if (rec.time) {
            // Auto-correct single digit hours (e.g. "9:33:55" -> "09:33:55")
            const timeParts = rec.time.split(':');
            if (timeParts.length > 0 && timeParts[0].length === 1 && !isNaN(timeParts[0])) {
                timeParts[0] = '0' + timeParts[0];
                rec.time = timeParts.join(':');
            }

            const tRegex = /^([01]\d|2[0-3]):([0-5]\d):([0-5]\d)$/;
            if (!tRegex.test(rec.time)) {
                isValid = false; errors.push('Invalid Time'); invalidFields.push('time');
            }
        } else {
            rec.time = formatTimeForCapture(new Date());
        }

        const validTypes = ['Income', 'Expense', 'Investment', 'Ledger', 'Transfer'];
        const matchedType = validTypes.find(t => t.toLowerCase() === rec.type.toLowerCase());
        if (!matchedType) { isValid = false; errors.push(`Invalid Type`); invalidFields.push('type'); }
        else { rec.type = matchedType; }

        // Amount Validation
        const typeL = (rec.type || '').toLowerCase();
        if (typeL === 'income' || typeL === 'opening balance') {
            if (wAmt) {
                isValid = false;
                errors.push('Income/Opening Balance cannot have Withdrawal Amount populated');
                invalidFields.push('withdrawalAmount');
            }
            if (!dAmt || dAmt <= 0) {
                isValid = false;
                errors.push('Income/Opening Balance must have a valid positive Deposit Amount');
                invalidFields.push('depositAmount');
            }
        } else if (typeL === 'expense' || typeL === 'investment') {
            if (dAmt) {
                isValid = false;
                errors.push('Expense/Investment cannot have Deposit Amount populated');
                invalidFields.push('depositAmount');
            }
            if (!wAmt || wAmt <= 0) {
                isValid = false;
                errors.push('Expense/Investment must have a valid positive Withdrawal Amount');
                invalidFields.push('withdrawalAmount');
            }
        } else if (typeL === 'transfer') {
            if (!wAmt || wAmt <= 0) {
                isValid = false;
                errors.push('Transfer must have a valid positive Withdrawal/Transfer Amount');
                invalidFields.push('withdrawalAmount');
            } else {
                if (!dAmt) {
                    rec.depositAmount = rec.withdrawalAmount;
                }
            }
        } else if (typeL === 'ledger') {
            if (!wAmt && !dAmt) {
                isValid = false;
                errors.push('Ledger entry must specify either Withdrawal or Deposit Amount');
                invalidFields.push('withdrawalAmount');
                invalidFields.push('depositAmount');
            }
            if (wAmt && dAmt) {
                isValid = false;
                errors.push('Ledger entry cannot specify both Withdrawal and Deposit Amount');
                invalidFields.push('withdrawalAmount');
                invalidFields.push('depositAmount');
            }
            if (wAmt < 0 || dAmt < 0) {
                isValid = false;
                errors.push('Amounts must be positive values');
                invalidFields.push('withdrawalAmount');
                invalidFields.push('depositAmount');
            }
        }

        const bankNamesMap = FinData.masters.banks.reduce((acc, b) => { acc[b.name.toLowerCase()] = b.name; return acc; }, {});

        if (rec.type === 'Transfer') {
            if (!rec.fromBank || !bankNamesMap[rec.fromBank.toLowerCase()]) { isValid = false; errors.push('Invalid TransferFrom Account (format: FromAccount > ToAccount)'); invalidFields.push('bank'); }
            else { rec.fromBank = bankNamesMap[rec.fromBank.toLowerCase()]; }

            if (!rec.toBank || !bankNamesMap[rec.toBank.toLowerCase()]) { isValid = false; errors.push('Invalid TransferTo Account (format: FromAccount > ToAccount)'); invalidFields.push('bank'); }
            else { rec.toBank = bankNamesMap[rec.toBank.toLowerCase()]; }

            if (rec.fromBank && rec.toBank) {
                rec.bank = `${rec.fromBank} > ${rec.toBank}`;
            }
        } else {
            if (!rec.bank || !bankNamesMap[rec.bank.toLowerCase()]) { isValid = false; errors.push('Invalid Account'); invalidFields.push('bank'); }
            else { rec.bank = bankNamesMap[rec.bank.toLowerCase()]; }
        }

        // Category validation for non-Ledger types
        if (rec.type !== 'Ledger' && rec.type) {
            const catMaster = FinData.masters.categories[rec.type] || [];
            if (rec.type === 'Transfer' && !rec.category) {
                rec.category = catMaster.length > 0 ? catMaster[0].name : 'Self Transfer';
                rec.subCategory = (catMaster.length > 0 && catMaster[0].subCategories && catMaster[0].subCategories.length > 0)
                    ? (typeof catMaster[0].subCategories[0] === 'string' ? catMaster[0].subCategories[0] : catMaster[0].subCategories[0].name)
                    : 'Own Accounts';
            } else {
                const catObj = catMaster.find(c => c.name.toLowerCase() === rec.category.toLowerCase());
                if (!catObj) { 
                    isValid = false; 
                    errors.push(`Category not found in ${rec.type === 'Transfer' ? 'Self Transfer' : rec.type}`); 
                    invalidFields.push('category'); 
                } else { 
                    rec.category = catObj.name; 
                }
            }
        }

        if (rec.type === 'Ledger') {
            if (!rec.person) { isValid = false; errors.push('Ledger Person missing'); invalidFields.push('person'); }
            if (!rec.category) { isValid = false; errors.push('Category missing'); invalidFields.push('category'); }
        }

        const validModes = Array.from(document.querySelectorAll('#mode-pills .pill-item')).map(p => p.getAttribute('data-mode'));
        const fallbackModes = ['UPI', 'CARD', 'CASH', 'Bank Transfer', 'Opening Balance', 'Auto Deduction'];
        const activeModes = validModes.length > 0 ? validModes : fallbackModes;

        const matchedMode = activeModes.find(m => m.toLowerCase() === rec.mode.toLowerCase());
        if (!matchedMode) {
            isValid = false; errors.push('Invalid Mode'); invalidFields.push('mode');
        } else {
            rec.mode = matchedMode;
        }

        // Duplicate Check against existing database
        const isDuplicate = FinData.transactions.some(t => 
            t.date === rec.date &&
            t.time === rec.time &&
            parseFloat(t.amount) === parseFloat(rec.amount) &&
            t.type === rec.type &&
            (t.bank === rec.bank || (!t.bank && !rec.bank)) &&
            (t.fromBank === rec.fromBank || (!t.fromBank && !rec.fromBank)) &&
            (t.toBank === rec.toBank || (!t.toBank && !rec.toBank)) &&
            (t.person === rec.person || (!t.person && !rec.person)) &&
            (t.category === rec.category || (!t.category && !rec.category))
        );

        if (isDuplicate) {
            isValid = false;
            errors.push('Duplicate Record');
            // Adding a special flag for duplicates
            invalidFields.push('duplicate_row');
        }

        return { record: rec, isValid, errors, invalidFields };
    }

    function processBulkData(rows) {
        pendingBulkRecords = rows.map(r => validateBulkRecord(r));
        window.renderBulkPreview();
        document.getElementById('import-preview-modal').style.display = 'flex';
    }

    window.closeImportModal = () => {
        document.getElementById('import-preview-modal').style.display = 'none';
        pendingBulkRecords = [];
    };

    document.querySelectorAll('.modal-cancel, .btn-close').forEach(btn => {
        if (btn.closest('#import-preview-modal')) {
            btn.addEventListener('click', window.closeImportModal);
        }
    });

    window.renderBulkPreview = () => {
        const tbody = document.getElementById('preview-tbody');
        if (!tbody) return;
        tbody.innerHTML = '';

        let validCount = 0;
        let invalidCount = 0;

        pendingBulkRecords.forEach((item, index) => {
            if (item.isValid) validCount++;
            else invalidCount++;

            const r = item.record;
            const tr = document.createElement('tr');
            if (!item.isValid) tr.style.backgroundColor = `rgba(${getCssVar("--color-expense-rgb")}, 0.05)`;
            if (item.invalidFields && item.invalidFields.includes('duplicate_row')) {
                tr.style.backgroundColor = 'rgba(234, 179, 8, 0.1)'; // Yellow tint for duplicate
            }

            const getStyle = (field) => {
                return item.invalidFields && item.invalidFields.includes(field) 
                    ? 'border: 1px solid #ef4444; background-color: #fee2e2;' 
                    : '';
            };

            const catHeadHTML = `<input type="text" class="bulk-edit-input" data-index="${index}" data-field="category" value="${r.category || ''}" style="width:120px; padding:4px; font-size:11px; ${getStyle('category')}" placeholder="Category Head">`;
            const categoryHTML = `<input type="text" class="bulk-edit-input" data-index="${index}" data-field="subCategory" value="${r.subCategory || ''}" style="width:120px; padding:4px; font-size:11px; ${getStyle('subCategory')}" placeholder="Category">`;
            const subCategoryHTML = `<input type="text" class="bulk-edit-input" data-index="${index}" data-field="secondSubCategory" value="${r.secondSubCategory || ''}" style="width:120px; padding:4px; font-size:11px; ${getStyle('secondSubCategory')}" placeholder="SubCategory">`;
            const bankHTML = `<input type="text" class="bulk-edit-input" data-index="${index}" data-field="bank" value="${r.bank || ''}" style="width:120px; padding:4px; font-size:11px; ${getStyle('bank')}" placeholder="Account">`;
            const personHTML = r.type !== 'Ledger' ? '-' : `<input type="text" class="bulk-edit-input" data-index="${index}" data-field="person" value="${r.person || ''}" style="width:100px; padding:4px; font-size:11px; ${getStyle('person')}" placeholder="Person">`;
            const modeHTML = `<input type="text" class="bulk-edit-input" data-index="${index}" data-field="mode" value="${r.mode || ''}" style="width:100px; padding:4px; font-size:11px; ${getStyle('mode')}" placeholder="Mode">`;
            const withdrawalHTML = r.type === 'Income' ? '-' : `<input type="number" class="bulk-edit-input" data-index="${index}" data-field="withdrawalAmount" value="${r.withdrawalAmount || ''}" style="width:80px; padding:4px; font-size:11px; ${getStyle('withdrawalAmount')}" placeholder="0.00">`;
            const depositHTML = (r.type === 'Expense' || r.type === 'Investment') ? '-' : `<input type="number" class="bulk-edit-input" data-index="${index}" data-field="depositAmount" value="${r.depositAmount || ''}" style="width:80px; padding:4px; font-size:11px; ${getStyle('depositAmount')}" placeholder="0.00">`;
            const upiRefHTML = `<input type="text" class="bulk-edit-input" data-index="${index}" data-field="upiRef" value="${r.upiRef || ''}" style="width:120px; padding:4px; font-size:11px; ${getStyle('upiRef')}" placeholder="UPI Ref No">`;
            const noteHTML = `<input type="text" class="bulk-edit-input" data-index="${index}" data-field="note" value="${r.note || ''}" style="width:150px; padding:4px; font-size:11px; ${getStyle('note')}" placeholder="Note">`;

            const errorHTML = item.isValid ? '<span class="badge success">Valid</span>' : `<span class="badge danger" style="white-space:normal; font-size:9px;">${item.errors.join(', ')}</span>`;

            tr.innerHTML = `
                <td><input type="date" class="bulk-edit-input" data-index="${index}" data-field="date" value="${r.date || ''}" style="width:110px; padding:4px; font-size:11px; ${getStyle('date')}"></td>
                <td><input type="text" class="bulk-edit-input" data-index="${index}" data-field="time" value="${r.time || ''}" placeholder="HH:MM:SS" style="width:70px; padding:4px; font-size:11px; ${getStyle('time')}"></td>
                <td>
                    <select class="bulk-edit-input" data-index="${index}" data-field="type" style="width:90px; padding:4px; font-size:11px; ${getStyle('type')}">
                        <option value="Income" ${r.type === 'Income' ? 'selected' : ''}>Income</option>
                        <option value="Expense" ${r.type === 'Expense' ? 'selected' : ''}>Expense</option>
                        <option value="Investment" ${r.type === 'Investment' ? 'selected' : ''}>Investment</option>
                        <option value="Ledger" ${r.type === 'Ledger' ? 'selected' : ''}>Ledger</option>
                        <option value="Transfer" ${r.type === 'Transfer' ? 'selected' : ''}>Self Transfer</option>
                    </select>
                </td>
                <td>${catHeadHTML}</td>
                <td>${categoryHTML}</td>
                <td>${subCategoryHTML}</td>
                <td>${bankHTML}</td>
                <td>${personHTML}</td>
                <td>${modeHTML}</td>
                <td>${withdrawalHTML}</td>
                <td>${depositHTML}</td>
                <td>${upiRefHTML}</td>
                <td>${noteHTML}</td>
                <td>${errorHTML}</td>
                <td>
                    <button class="btn btn-icon-only text-danger btn-sm" onclick="removeBulkRecord(${index})" style="width: 28px; height: 28px;"><i class="ri-delete-bin-line"></i></button>
                </td>
            `;
            tbody.appendChild(tr);
        });

        document.getElementById('valid-count').innerText = `${validCount} Valid`;
        document.getElementById('invalid-count').innerText = `${invalidCount} Errors`;

        const confirmBtn = document.getElementById('confirm-import-btn');
        confirmBtn.disabled = validCount === 0;
        confirmBtn.innerText = `Push Valid Records (${validCount})`;
    };

    document.getElementById('preview-tbody')?.addEventListener('change', (e) => {
        if (e.target.classList.contains('bulk-edit-input')) {
            const index = e.target.getAttribute('data-index');
            const field = e.target.getAttribute('data-field');
            const val = e.target.value;

            if (pendingBulkRecords[index]) {
                const rec = pendingBulkRecords[index].record;
                rec[field] = val;

                const rawObj = {
                    'Type': rec.type,
                    'Date (DD-MMM-YYYY)': rec.date,
                    'Time (HH:MM:SS)': rec.time,
                    'Category Head': rec.category,
                    'Category': rec.subCategory,
                    'SubCategory': rec.secondSubCategory,
                    'Account': rec.bank,
                    'Amount': rec.amount,
                    'Withdrawal Amount(INR)': rec.withdrawalAmount,
                    'Deposit Amount(INR)': rec.depositAmount,
                    'LedgerPerson': rec.person,
                    'Mode': rec.mode || 'Bank Transfer',
                    'UPI Ref No.': rec.upiRef,
                    'Note': rec.note
                };

                pendingBulkRecords[index] = validateBulkRecord(rawObj);
                renderBulkPreview();
            }
        }
    });

    window.removeBulkRecord = (index) => {
        pendingBulkRecords.splice(index, 1);
        renderBulkPreview();
    };

    document.getElementById('confirm-import-btn')?.addEventListener('click', () => {
        const validItems = pendingBulkRecords.filter(r => r.isValid);
        if (validItems.length === 0) {
            alert('No valid records to push. Please resolve errors first.');
            return;
        }

        let count = 0;
        validItems.forEach(item => {
            item.record.recordEnteredAs = 'Bulk Upload';
            FinData.addTransaction(item.record);
            count++;
        });

        // Retain only invalid records in the pending queue
        pendingBulkRecords = pendingBulkRecords.filter(r => !r.isValid);

        alert(`Successfully pushed ${count} valid records!`);

        if (pendingBulkRecords.length === 0) {
            window.closeImportModal();
        } else {
            renderBulkPreview(); // Re-render table with remaining invalid rows
        }
        renderRecords();
        updateDashboard();
    });

    // --- DATABASE BACKUP & RESTORE UTILITIES ---
    // 1. Export Excel (.xlsx) Backup
    document.getElementById('btn-export-excel')?.addEventListener('click', () => {
        const wb = XLSX.utils.book_new();

        // transactions sheet
        const txHeaders = ['ID', 'Date', 'Time', 'Type', 'Category Head', 'Category', 'SubCategory', 'Account/Bank', 'From Account', 'To Account', 'Ledger Person', 'Mode', 'Amount', 'Withdrawal Amount(INR)', 'Deposit Amount(INR)', 'UPI Ref', 'Note', 'Timestamp', 'Record Entered As', 'Loan Start Date', 'Loan End Date', 'Loan Amount'];
        const txRows = FinData.transactions.map(t => [
            t.id || '',
            t.date || '',
            t.time || '',
            t.type === 'Transfer' ? 'Self Transfer' : (t.type || ''),
            t.category || '',
            t.subCategory || '',
            t.secondSubCategory || '',
            t.bank || '',
            t.fromBank || '',
            t.toBank || '',
            t.person || '',
            t.mode || '',
            t.amount || 0,
            t.withdrawalAmount !== undefined && t.withdrawalAmount !== null && t.withdrawalAmount !== '' ? t.withdrawalAmount : (t.type === 'Expense' || t.type === 'Investment' || t.type === 'Transfer' || (t.type === 'Ledger' && (t.subCategory || '').toLowerCase().includes('given')) ? t.amount : ''),
            t.depositAmount !== undefined && t.depositAmount !== null && t.depositAmount !== '' ? t.depositAmount : (t.type === 'Income' || t.mode === 'Opening Balance' || (t.type === 'Ledger' && ((t.subCategory || '').toLowerCase().includes('taken') || (t.category || '').toLowerCase().includes('return'))) ? t.amount : ''),
            t.upiRef || '',
            t.note || '',
            t.timestamp || '',
            t.recordEnteredAs || 'Single Entry',
            t.loanStartDate || '',
            t.loanEndDate || '',
            t.loanAmount || ''
        ]);
        const wsTx = XLSX.utils.aoa_to_sheet([txHeaders, ...txRows]);
        wsTx['!cols'] = txHeaders.map(h => ({ wch: Math.max(h.length, 12) }));
        XLSX.utils.book_append_sheet(wb, wsTx, "Transactions");

        // accounts sheet
        const bankHeaders = ['Bank Name', 'Account Name', 'Account Head', 'Account Type', 'Opening Balance', 'Status', 'Is Active', 'Is Income Account', 'Is Expense Account', 'Auth Dashboard', 'Can Transfer Self', 'Can Transfer Other', 'Notes'];
        const bankRows = (FinData.masters.banks || []).map(b => [
            b.bankName || '',
            b.name || '',
            b.accountHead || '',
            b.type || '',
            b.openingBalance || 0,
            b.status || 'Active',
            b.isActive !== false ? 'Yes' : 'No',
            b.isIncomeAccount !== false ? 'Yes' : 'No',
            b.isExpenseAccount !== false ? 'Yes' : 'No',
            b.authDashboard === true ? 'Yes' : 'No',
            b.canTransferSelf !== false ? 'Yes' : 'No',
            b.canTransferOther !== false ? 'Yes' : 'No',
            b.notes || ''
        ]);
        const wsBanks = XLSX.utils.aoa_to_sheet([bankHeaders, ...bankRows]);
        wsBanks['!cols'] = bankHeaders.map(h => ({ wch: Math.max(h.length, 12) }));
        XLSX.utils.book_append_sheet(wb, wsBanks, "Accounts");

        // categories sheet
        const catHeaders = ['Type', 'Category Head', 'Categories & SubCategories', 'Status'];
        const catRows = [];
        ['Income', 'Expense', 'Investment', 'Ledger', 'Transfer'].forEach(type => {
            const list = FinData.masters.categories[type] || [];
            list.forEach(c => {
                const subs = (c.subCategories || []).map(s => {
                    if (typeof s === 'string') return s;
                    const level2 = s.subCategories && s.subCategories.length > 0 ? ` [${s.subCategories.join(', ')}]` : '';
                    return s.name + level2;
                }).join(', ');
                catRows.push([type === 'Transfer' ? 'Self Transfer' : type, c.name, subs, c.status || 'Active']);
            });
        });
        const wsCats = XLSX.utils.aoa_to_sheet([catHeaders, ...catRows]);
        wsCats['!cols'] = catHeaders.map(h => ({ wch: Math.max(h.length, 15) }));
        XLSX.utils.book_append_sheet(wb, wsCats, "Categories");

        const filename = `FinOS_Database_Export_${new Date().toISOString().slice(0, 10)}.xlsx`;
        XLSX.writeFile(wb, filename);
    });

    // 2. Download JSON Backup
    document.getElementById('btn-export-json')?.addEventListener('click', () => {
        const backupData = {
            version: "1.0",
            timestamp: new Date().toISOString(),
            transactions: FinData.transactions,
            masters: FinData.masters,
            config: FinData.config
        };

        const jsonStr = JSON.stringify(backupData, null, 4);
        const blob = new Blob([jsonStr], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = url;
        a.download = `FinOS_DB_Backup_${new Date().toISOString().slice(0, 10)}.json`;
        document.body.appendChild(a);
        a.click();
        
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    });

    // 3. Trigger Restore File Upload
    document.getElementById('btn-import-backup')?.addEventListener('click', () => {
        document.getElementById('backup-file-input').click();
    });

    // Clear All Transactions
    document.getElementById('btn-clear-transactions')?.addEventListener('click', () => {
        if (confirm('WARNING: This will permanently delete all transaction records from the database. Master settings (Accounts, Categories, configurations) will not be affected. Do you want to proceed?')) {
            FinData.transactions = [];
            FinData.saveTransactions();

            FinData.upcomingExpenses = [];
            FinData.saveUpcomingExpenses();

            FinData.stagingTransactions = [];
            FinData.saveStagingTransactions();

            renderRecords();
            updateDashboard();
            alert('All transactional data has been successfully cleared!');
            window.location.reload();
        }
    });

    // 4. Handle Restore File Parsing
    document.getElementById('backup-file-input')?.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (ev) => {
            try {
                const data = JSON.parse(ev.target.result);
                if (data.transactions && data.masters) {
                    if (confirm('WARNING: Restoring this backup will permanently overwrite all current transactions and configurations in your browser. Do you want to proceed?')) {
                        FinData.transactions = data.transactions;
                        FinData.masters = data.masters;
                        if (data.config) FinData.config = data.config;

                        FinData.storage.save('transactions', FinData.transactions);
                        FinData.storage.save('masters', FinData.masters);
                        if (data.config) FinData.storage.save('config', FinData.config);

                        alert('Database successfully restored! Reloading application...');
                        window.location.reload();
                    }
                } else {
                    alert('Invalid backup file. Must contain transactions and master data.');
                }
            } catch (err) {
                console.error("Error restoring backup:", err);
                alert("Failed to parse the JSON backup file.");
            }
        };
        reader.readAsText(file);
        e.target.value = ''; // Reset input
    });

    // --- UPCOMING EXPENSES DASHBOARD ---
    function checkAndAdvanceUpcomingExpenses() {
        const today = new Date();
        const todayStr = today.toISOString().substring(0, 10);
        const currentYear = today.getFullYear();
        const currentMonth = today.getMonth(); // 0-indexed
        
        let changed = false;

        FinData.upcomingExpenses.forEach(item => {
            if (!item.billingDate || !item.dueDate) return;

            const freq = item.frequency || 'Daily';
            const bDate = new Date(item.billingDate);
            const dDate = new Date(item.dueDate);

            if (isNaN(bDate.getTime()) || isNaN(dDate.getTime())) return;

            if (freq === 'Daily') {
                if (item.billingDate < todayStr) {
                    item.billingDate = todayStr;
                    const gap = dDate.getTime() - bDate.getTime();
                    const newDueDate = new Date(today.getTime() + gap);
                    item.dueDate = newDueDate.toISOString().substring(0, 10);
                    changed = true;
                }
            } else if (freq === 'Monthly') {
                const bYear = bDate.getFullYear();
                const bMonth = bDate.getMonth();
                if (bYear < currentYear || (bYear === currentYear && bMonth < currentMonth)) {
                    const targetBilling = new Date(currentYear, currentMonth, bDate.getDate());
                    if (targetBilling.getMonth() !== currentMonth) {
                        targetBilling.setDate(0);
                    }
                    item.billingDate = targetBilling.toISOString().substring(0, 10);

                    const targetDue = new Date(currentYear, currentMonth, dDate.getDate());
                    if (targetDue.getMonth() !== currentMonth) {
                        targetDue.setDate(0);
                    }
                    item.dueDate = targetDue.toISOString().substring(0, 10);
                    changed = true;
                }
            } else if (freq === 'Yearly') {
                const bYear = bDate.getFullYear();
                if (bYear < currentYear) {
                    const targetBilling = new Date(currentYear, bDate.getMonth(), bDate.getDate());
                    item.billingDate = targetBilling.toISOString().substring(0, 10);

                    const targetDue = new Date(currentYear, dDate.getMonth(), dDate.getDate());
                    item.dueDate = targetDue.toISOString().substring(0, 10);
                    changed = true;
                }
            }
        });

        if (changed) {
            FinData.saveUpcomingExpenses();
        }
    }

    // --- UPCOMING EXPENSES DASHBOARD ---
    function renderUpcomingExpenses() {
        const toPayTbody = document.getElementById('upcoming-to-be-paid-tbody');
        const paidTbody = document.getElementById('upcoming-paid-tbody');
        if (!toPayTbody || !paidTbody) return;

        // Auto-advance dates for new period starts
        checkAndAdvanceUpcomingExpenses();

        toPayTbody.innerHTML = '';
        paidTbody.innerHTML = '';

        let totalToBePaidAmount = 0;
        let toBePaidCount = 0;

        const today = new Date();
        const todayStr = today.toISOString().substring(0, 10);
        const currentYear = today.getFullYear();
        const currentMonth = today.getMonth();

        FinData.upcomingExpenses.forEach((item) => {
            const freq = item.frequency || 'Daily';
            const bDate = new Date(item.billingDate);
            const bYear = bDate.getFullYear();
            const bMonth = bDate.getMonth();

            let isPaid = false;
            if (freq === 'Daily') {
                isPaid = item.billingDate > todayStr;
            } else if (freq === 'Yearly') {
                isPaid = bYear > currentYear;
            } else {
                // Monthly or default
                isPaid = bYear > currentYear || (bYear === currentYear && bMonth > currentMonth);
            }

            const tr = document.createElement('tr');
            tr.setAttribute('data-id', item.id);
            tr.style.borderBottom = '1px solid var(--glass-border)';

            if (editingUpcomingId === item.id) {
                // Category Select
                const catSelect = `<select class="edit-category" style="width: 120px; padding: 4px; font-size:12px; background: rgba(0,0,0,0.5); color: #fff; border: 1px solid var(--glass-border);">
                    ${FinData.masters.categories.Expense.map(c => `<option value="${c.name}" ${c.name === item.category ? 'selected' : ''}>${c.name}</option>`).join('')}
                </select>`;

                // Bank Select (From/To)
                const fromBankSelect = `<select class="edit-fromBank" style="width: 120px; padding: 4px; font-size:12px; background: rgba(0,0,0,0.5); color: #fff; border: 1px solid var(--glass-border);">
                    ${FinData.masters.banks.filter(b => b.status === 'Active' && b.isActive !== false).map(b => `<option value="${b.name}" ${b.name === item.fromBank ? 'selected' : ''}>${b.name}</option>`).join('')}
                </select>`;
                const toBankSelect = `<select class="edit-toBank" style="width: 120px; padding: 4px; font-size:12px; background: rgba(0,0,0,0.5); color: #fff; border: 1px solid var(--glass-border);">
                    ${FinData.masters.banks.filter(b => b.status === 'Active' && b.isActive !== false).map(b => `<option value="${b.name}" ${b.name === item.toBank ? 'selected' : ''}>${b.name}</option>`).join('')}
                </select>`;

                // Frequency Select
                const freqSelect = `<select class="edit-frequency" style="width: 90px; padding: 4px; font-size:12px; background: rgba(0,0,0,0.5); color: #fff; border: 1px solid var(--glass-border);">
                    <option value="Daily" ${item.frequency === 'Daily' ? 'selected' : ''}>Daily</option>
                    <option value="Monthly" ${item.frequency === 'Monthly' ? 'selected' : ''}>Monthly</option>
                    <option value="Yearly" ${item.frequency === 'Yearly' ? 'selected' : ''}>Yearly</option>
                </select>`;

                // Mode Select
                const modeSelect = `<select class="edit-mode" style="width: 90px; padding: 4px; font-size:12px; background: rgba(0,0,0,0.5); color: #fff; border: 1px solid var(--glass-border);">
                    <option value="UPI" ${item.mode === 'UPI' ? 'selected' : ''}>UPI</option>
                    <option value="CARD" ${item.mode === 'CARD' ? 'selected' : ''}>CARD</option>
                    <option value="CASH" ${item.mode === 'CASH' ? 'selected' : ''}>CASH</option>
                    <option value="Bank Transfer" ${item.mode === 'Bank Transfer' ? 'selected' : ''}>Bank Transfer</option>
                </select>`;

                tr.innerHTML = `
                    <td style="padding: 12px 16px;"><input type="number" min="1" max="31" class="edit-billingDate" value="${item.billingDate ? new Date(item.billingDate).getDate() : ''}" placeholder="DD" style="width: 60px; padding: 4px; font-size:12px; background: rgba(0,0,0,0.5); color: #fff; border: 1px solid var(--glass-border);"></td>
                    <td style="padding: 12px 16px;"><input type="number" min="1" max="31" class="edit-dueDate" value="${item.dueDate ? new Date(item.dueDate).getDate() : ''}" placeholder="DD" style="width: 60px; padding: 4px; font-size:12px; background: rgba(0,0,0,0.5); color: #fff; border: 1px solid var(--glass-border);"></td>
                    <td style="padding: 12px 16px;">${freqSelect}</td>
                    <td style="padding: 12px 16px;">${catSelect}</td>
                    <td style="padding: 12px 16px;"><input type="text" class="edit-subCategory" value="${item.subCategory || ''}" style="width: 90px; padding: 4px; font-size:12px; background: rgba(0,0,0,0.5); color: #fff; border: 1px solid var(--glass-border);"></td>
                    <td style="padding: 12px 16px;"><input type="text" class="edit-secondSubCategory" value="${item.secondSubCategory || ''}" style="width: 90px; padding: 4px; font-size:12px; background: rgba(0,0,0,0.5); color: #fff; border: 1px solid var(--glass-border);"></td>
                    <td style="padding: 12px 16px;"><input type="text" class="edit-person" value="${item.person || ''}" style="width: 90px; padding: 4px; font-size:12px; background: rgba(0,0,0,0.5); color: #fff; border: 1px solid var(--glass-border);"></td>
                    <td style="padding: 12px 16px;">
                        <div style="display:flex; flex-direction:column; gap:4px; align-items:center;">
                            ${fromBankSelect}
                            <span style="font-size:10px; color:var(--text-muted);">to</span>
                            ${toBankSelect}
                        </div>
                    </td>
                    <td style="padding: 12px 16px;">${modeSelect}</td>
                    <td style="padding: 12px 16px; text-align: right;"><input type="number" step="0.01" class="edit-amount" value="${item.amount}" style="width: 80px; padding: 4px; font-size:12px; text-align: right; background: rgba(0,0,0,0.5); color: #fff; border: 1px solid var(--glass-border);"></td>
                    <td style="padding: 12px 16px;"><input type="date" class="edit-date" value="${item.date || ''}" style="width: 120px; padding: 4px; font-size:12px; background: rgba(0,0,0,0.5); color: #fff; border: 1px solid var(--glass-border);"></td>
                    <td style="padding: 12px 16px;"><input type="text" class="edit-note" value="${item.note || ''}" style="width: 120px; padding: 4px; font-size:12px; background: rgba(0,0,0,0.5); color: #fff; border: 1px solid var(--glass-border);"></td>
                    <td style="padding: 12px 16px; text-align: center;">
                        <button class="btn btn-primary btn-sm" onclick="saveInlineEditUpcoming('${item.id}')" style="background: var(--color-income); color: white; padding: 4px 8px; border-radius: 4px; font-size: 11px;"><i class="ri-checkbox-circle-line"></i> Save</button>
                        <button class="btn btn-outline btn-sm" onclick="cancelInlineEditUpcoming()" style="padding: 4px 8px; border-radius: 4px; font-size: 11px; margin-left: 5px;"><i class="ri-close-circle-line"></i> Cancel</button>
                    </td>
                `;
            } else {
                const isOpeningBal = item.mode === 'Opening Balance';
                const amtColor = isOpeningBal ? 'var(--color-income)' : 'var(--color-expense)';
                const amtSign = isOpeningBal ? '' : '-';
                const amtValue = isOpeningBal ? Math.abs(item.amount) : item.amount;

                let actionButtonHtml = '';
                if (isPaid) {
                    actionButtonHtml = `<span class="badge" style="background: rgba(16, 185, 129, 0.1); color: var(--color-income); font-weight: bold; font-size: 11px; padding: 4px 8px; border-radius: 4px; display: inline-flex; align-items: center; gap: 4px;"><i class="ri-checkbox-circle-fill"></i> Paid</span>`;
                } else {
                    actionButtonHtml = `<button class="btn btn-primary btn-sm" onclick="payUpcomingExpense('${item.id}')" style="background: var(--color-income); color: white; padding: 4px 8px; border-radius: 4px; font-size: 11px; font-weight: bold;"><i class="ri-check-double-line"></i> Paid</button>`;
                }

                const dateColHtml = isPaid 
                    ? `<td style="padding: 12px 16px; font-size: 12px; color: var(--text-muted);">${item.date ? formatDate(item.date) : 'N/A'}</td>`
                    : `<td style="padding: 12px 16px;"><input type="date" class="txn-date" value="${todayStr}" style="padding: 4px; font-size: 12px; background: rgba(0,0,0,0.5); color: #fff; border: 1px solid var(--glass-border); border-radius: 4px; outline: none; width: 130px;"></td>`;

                tr.innerHTML = `
                    <td style="padding: 12px 16px;">${formatDate(item.billingDate)}</td>
                    <td style="padding: 12px 16px;">${formatDate(item.dueDate)}</td>
                    <td style="padding: 12px 16px;"><span class="badge" style="background: rgba(56, 189, 248, 0.1); color: var(--accent); font-size: 10px; font-weight: bold;">${item.frequency || 'Daily'}</span></td>
                    <td style="padding: 12px 16px; font-weight: 600;">${item.category}</td>
                    <td style="padding: 12px 16px;">${item.subCategory || ''}</td>
                    <td style="padding: 12px 16px;">${item.secondSubCategory || ''}</td>
                    <td style="padding: 12px 16px; font-size: 12px; color: var(--text-muted);">${item.person || ''}</td>
                    <td style="padding: 12px 16px; font-size: 12px; color: var(--text-muted);">${item.bank}</td>
                    <td style="padding: 12px 16px;"><span class="badge" style="background: rgba(255, 255, 255, 0.05); font-size: 10px;">${item.mode || ''}</span></td>
                    <td style="padding: 12px 16px; font-weight: 800; text-align: right; color: ${amtColor};">${amtSign}${formatCurrency(amtValue)}</td>
                    ${dateColHtml}
                    <td style="padding: 12px 16px; font-size: 12px; color: var(--text-muted);">${item.note || ''}</td>
                    <td style="padding: 12px 16px; text-align: center; white-space: nowrap;">
                        ${actionButtonHtml}
                        <button class="btn btn-outline btn-sm" onclick="startInlineEditUpcoming('${item.id}')" style="padding: 4px 8px; border-radius: 4px; font-size: 11px; margin-left: 5px;"><i class="ri-edit-line"></i> Quick Edit</button>
                        <button class="btn btn-outline btn-sm" onclick="editUpcomingExpense('${item.id}')" style="padding: 4px 8px; border-radius: 4px; font-size: 11px; margin-left: 5px; border-color: var(--accent); color: var(--accent);"><i class="ri-settings-4-line"></i> Form Edit</button>
                        <button class="btn btn-outline btn-sm text-danger" onclick="deleteUpcomingExpense('${item.id}')" style="padding: 4px 8px; border-radius: 4px; font-size: 11px; margin-left: 5px; color: var(--color-expense); border-color: rgba(244,63,94,0.2);"><i class="ri-delete-bin-line"></i></button>
                    </td>
                `;
            }

            if (isPaid) {
                paidTbody.appendChild(tr);
            } else {
                toPayTbody.appendChild(tr);
                totalToBePaidAmount += parseFloat(item.amount || 0);
                toBePaidCount++;
            }
        });

        document.getElementById('upcoming-total-amount').innerText = formatCurrency(totalToBePaidAmount);
        document.getElementById('upcoming-total-count').innerText = toBePaidCount;
    }

    window.renderUpcomingExpenses = renderUpcomingExpenses;

    window.startInlineEditUpcoming = (id) => {
        editingUpcomingId = id;
        renderUpcomingExpenses();
    };

    window.cancelInlineEditUpcoming = () => {
        editingUpcomingId = null;
        renderUpcomingExpenses();
    };

    window.saveInlineEditUpcoming = (id) => {
        const row = document.querySelector(`tr[data-id="${id}"]`);
        if (!row) return;

        const billingDayVal = row.querySelector('.edit-billingDate').value;
        const dueDayVal = row.querySelector('.edit-dueDate').value;
        const frequency = row.querySelector('.edit-frequency').value;
        const category = row.querySelector('.edit-category').value;
        const subCategory = row.querySelector('.edit-subCategory').value;
        const secondSubCategory = row.querySelector('.edit-secondSubCategory').value;
        const person = row.querySelector('.edit-person').value.trim();
        const fromBank = row.querySelector('.edit-fromBank') ? row.querySelector('.edit-fromBank').value : null;
        const toBank = row.querySelector('.edit-toBank') ? row.querySelector('.edit-toBank').value : null;
        const bank = (fromBank && toBank) ? `${fromBank} › ${toBank}` : (row.querySelector('.edit-bank') ? row.querySelector('.edit-bank').value : '');
        const mode = row.querySelector('.edit-mode').value;
        const amount = parseFloat(row.querySelector('.edit-amount').value);
        const date = row.querySelector('.edit-date').value;
        const note = row.querySelector('.edit-note').value;

        const bDay = parseInt(billingDayVal);
        const dDay = parseInt(dueDayVal);

        if (isNaN(bDay) || bDay < 1 || bDay > 31) {
            alert('Billing Date must be a day of month (1-31)!');
            return;
        }
        if (isNaN(dDay) || dDay < 1 || dDay > 31) {
            alert('Due Date must be a day of month (1-31)!');
            return;
        }
        if (isNaN(amount) || amount <= 0) {
            alert('Please enter a valid amount!');
            return;
        }

        const index = FinData.upcomingExpenses.findIndex(u => u.id === id);
        if (index > -1) {
            const orig = FinData.upcomingExpenses[index];
            // Convert DD to full ISO date, preserving month/year from existing stored dates
            const billingDate = frequency === 'Daily'
                ? new Date().toISOString().substring(0, 10)
                : constructFullDateFromDay(billingDayVal, orig.billingDate);
            const dueDate = frequency === 'Daily'
                ? new Date().toISOString().substring(0, 10)
                : constructFullDateFromDay(dueDayVal, orig.dueDate);

            FinData.upcomingExpenses[index] = {
                ...orig,
                billingDate,
                dueDate,
                frequency,
                category,
                subCategory,
                secondSubCategory,
                person,
                bank,
                fromBank,
                toBank,
                mode,
                amount,
                date,
                note
            };
            FinData.saveUpcomingExpenses();
            editingUpcomingId = null;
            renderUpcomingExpenses();
            alert('Upcoming Expense updated successfully!');
        }
    };

    window.deleteUpcomingExpense = (id) => {
        if (!confirm('Are you sure you want to delete this upcoming expense?')) return;
        FinData.deleteUpcomingExpense(id);
        renderUpcomingExpenses();
    };

    window.payUpcomingExpense = (id) => {
        const expense = FinData.upcomingExpenses.find(u => u.id === id);
        if (!expense) return;

        const row = document.querySelector(`tr[data-id="${id}"]`);
        let txnDate = new Date().toISOString().substring(0, 10);
        if (row) {
            const dateInput = row.querySelector('.txn-date');
            if (dateInput && dateInput.value) {
                txnDate = dateInput.value;
            }
        }

        const txnData = {
            type: 'Expense',
            mode: expense.mode,
            person: expense.person || null,
            category: expense.category,
            subCategory: expense.subCategory || '',
            secondSubCategory: expense.secondSubCategory || '',
            bank: expense.bank,
            amount: parseFloat(expense.amount),
            date: txnDate,
            time: formatTimeForCapture(new Date()),
            otherDetails: '',
            upiRef: '',
            note: expense.note || '',
            fromBank: expense.fromBank || null,
            toBank: expense.toBank || null,
            recordEnteredAs: 'Upcoming Expenses'
        };

        if (expense.subCategory === 'Loan EMI') {
            txnData.loanStartDate = expense.loanStartDate;
            txnData.loanEndDate = expense.loanEndDate;
            txnData.loanAmount = expense.loanAmount;
        }

        FinData.addTransaction(txnData);

        // Date advancing helper for recurring schedules
        const advanceDate = (dateStr, frequency) => {
            if (!dateStr) return '';
            const date = new Date(dateStr);
            if (isNaN(date.getTime())) return dateStr;
            if (frequency === 'Daily') {
                date.setDate(date.getDate() + 1);
            } else if (frequency === 'Yearly') {
                date.setFullYear(date.getFullYear() + 1);
            } else {
                // Default to Monthly: advances by exactly 1 month keeping the same day!
                date.setMonth(date.getMonth() + 1);
            }
            const yyyy = date.getFullYear();
            const mm = String(date.getMonth() + 1).padStart(2, '0');
            const dd = String(date.getDate()).padStart(2, '0');
            return `${yyyy}-${mm}-${dd}`;
        };

        let freqMsg = "next recurring billing cycle (same day of next month)";
        if (expense.frequency === 'Daily') {
            freqMsg = "next calendar date (tomorrow)";
        } else if (expense.frequency === 'Yearly') {
            freqMsg = "next year (same day)";
        }

        // Save the payment date to the upcoming expense
        expense.date = txnDate;

        // Advance billingDate and dueDate to the next cycle and save
        expense.billingDate = advanceDate(expense.billingDate, expense.frequency);
        expense.dueDate = advanceDate(expense.dueDate, expense.frequency);
        FinData.saveUpcomingExpenses();

        renderUpcomingExpenses();
        updateDashboard();
        alert(`Upcoming Expense marked as PAID!\n\nStandard ledger record has been generated and saved under main Records. The upcoming expense has been automatically advanced to the ${freqMsg} on the Upcoming Expenses board.`);

        // Navigate to All Records screen
        switchScreen('records');
        navItems.forEach(nav => {
            nav.classList.remove('active');
            if (nav.getAttribute('data-screen') === 'records') nav.classList.add('active');
        });
    };

    window.editUpcomingExpense = (id) => {
        isEditingUpcoming = true;
        const index = FinData.upcomingExpenses.findIndex(u => u.id === id);
        if (index === -1) return;
        currentEditIndex = index;
        const u = FinData.upcomingExpenses[index];

        switchScreen('capture');

        navItems.forEach(nav => {
            nav.classList.remove('active');
            if (nav.getAttribute('data-screen') === 'capture') nav.classList.add('active');
        });

        isCaptureUpcoming = true;
        showCaptureForm('UpcomingExpense');

        document.getElementById('form-title').innerText = 'Edit Upcoming Expenses & EMIs';
        document.querySelector('#transaction-form button[type="submit"]').innerText = 'Update Upcoming Expenses & EMIs';

        // Pre-fill fields
        const wInput = document.getElementById('trans-withdrawal-amount');
        if (wInput) {
            wInput.value = u.withdrawalAmount || u.amount || '';
            wInput.dispatchEvent(new Event('input'));
        }
        document.getElementById('trans-note').value = u.note || '';
        // Extract day-of-month (DD) from stored ISO date for numeric inputs
        document.getElementById('trans-billing-date').value = u.billingDate ? new Date(u.billingDate).getDate() : '';
        document.getElementById('trans-due-date').value = u.dueDate ? new Date(u.dueDate).getDate() : '';

        if (u.subCategory === 'Loan EMI') {
            document.getElementById('loan-emi-details').classList.remove('hidden');
        } else {
            document.getElementById('loan-emi-details').classList.add('hidden');
        }

        const timeDisplay = document.getElementById('trans-time-display');
        if (timeDisplay) timeDisplay.value = u.time || formatTimeForCapture(new Date(u.timestamp || new Date()));

        const dateDisplay = document.getElementById('trans-date-display');
        if (dateDisplay) {
            dateDisplay.value = formatDate(u.date || u.billingDate);
            document.getElementById('trans-date').value = u.date || u.billingDate || '';
        }

        document.getElementById('trans-category').value = u.category;
        document.getElementById('trans-sub-category').value = u.subCategory || '';
        document.getElementById('trans-second-sub-category').value = u.secondSubCategory || '';
        document.getElementById('trans-expense-person').value = u.person || '';
        document.getElementById('trans-bank').value = u.bank || '';
        document.getElementById('trans-from-bank').value = u.fromBank || '';
        document.getElementById('trans-to-bank').value = u.toBank || '';
        document.getElementById('trans-mode').value = u.mode || '';

        // Set frequency value
        document.getElementById('trans-frequency').value = u.frequency || 'Daily';
        
        // Highlight frequency pill
        document.querySelectorAll('#frequency-pills .pill-item').forEach(p => {
            p.classList.remove('active');
            if (p.getAttribute('data-frequency') === u.frequency) p.classList.add('active');
        });

        // Disable/enable billing and due dates based on frequency
        updateUpcomingDatesState();

        // Highlight pills
        setTimeout(() => {
            const findAndClick = (containerId, text) => {
                const pills = document.querySelectorAll(`#${containerId} .pill-item`);
                pills.forEach(p => {
                    if (p.innerText === text) p.click();
                });
            };

            findAndClick('category-pills', u.category);
            if (u.subCategory) findAndClick('sub-category-pills', u.subCategory);
            if (u.secondSubCategory) findAndClick('second-sub-category-pills', u.secondSubCategory);

            // Highlight From and To accounts
            if (u.fromBank) {
                const fromAccount = FinData.masters.banks.find(b => b.name === u.fromBank);
                if (fromAccount) {
                    findAndClick('transfer-from-head-pills', fromAccount.accountHead || 'Other');
                    setTimeout(() => findAndClick('transfer-from-cards', u.fromBank), 100);
                }
            }
            if (u.toBank) {
                const toAccount = FinData.masters.banks.find(b => b.name === u.toBank);
                if (toAccount) {
                    findAndClick('transfer-to-head-pills', toAccount.accountHead || 'Other');
                    setTimeout(() => findAndClick('transfer-to-cards', u.toBank), 100);
                }
            }

            // Mode Pills
            const modePills = document.querySelectorAll('#mode-pills .pill-item');
            modePills.forEach(p => {
                const pMode = p.getAttribute('data-mode') || p.innerText;
                if (pMode.trim().toLowerCase() === (u.mode || '').trim().toLowerCase()) {
                    p.click();
                }
            });
        }, 100);
    };

    // ==========================================
    // --- DETAILS MODAL ENGINE & DRILL-DOWN ---
    // ==========================================

    function openDetailsModal(config) {
        currentDetailsConfig = config;
        currentDetailsData = [...config.data];

        document.getElementById('details-modal-title').innerText = config.title;
        document.getElementById('details-modal-summary').innerHTML = config.summaryHtml || '';

        // Render table headers
        const thead = document.getElementById('details-thead');
        let headerRowHtml = '<tr style="text-align: left; font-size: 11px; text-transform: uppercase; color: var(--text-muted); border-bottom: 1px solid var(--glass-border);">';
        config.headers.forEach((h, idx) => {
            const alignStyle = idx === config.headers.length - 1 ? 'text-align: right;' : '';
            headerRowHtml += `<th style="padding: 15px 24px; ${alignStyle}">${h}</th>`;
        });
        headerRowHtml += '</tr>';
        thead.innerHTML = headerRowHtml;

        // Clear search text
        document.getElementById('details-search').value = '';

        // Render table body
        renderDetailsTable(currentDetailsData);

        // Show modal
        document.getElementById('details-modal').style.display = 'flex';
    }

    function closeDetailsModal() {
        document.getElementById('details-modal').style.display = 'none';
        currentDetailsData = [];
        currentDetailsConfig = {};
    }

    function renderDetailsTable(data) {
        const tbody = document.getElementById('details-tbody');
        tbody.innerHTML = '';

        if (data.length === 0) {
            const colSpan = currentDetailsConfig.headers ? currentDetailsConfig.headers.length : 1;
            tbody.innerHTML = `
                <tr>
                    <td colspan="${colSpan}" style="padding: 30px 24px; text-align: center; color: var(--text-muted); font-style: italic;">
                        No matching records found.
                    </td>
                </tr>
            `;
            return;
        }

        data.forEach((item, index) => {
            const trHtml = currentDetailsConfig.rowRenderer(item, index);
            tbody.insertAdjacentHTML('beforeend', trHtml);
        });
    }

    // Dynamic fuzzy searching across columns
    document.getElementById('details-search').addEventListener('input', (e) => {
        const query = e.target.value.toLowerCase().trim();
        if (!query) {
            renderDetailsTable(currentDetailsConfig.data);
            currentDetailsData = [...currentDetailsConfig.data];
            return;
        }

        const filtered = currentDetailsConfig.data.filter(item => {
            return Object.values(item).some(val => {
                if (val === null || val === undefined) return false;
                return String(val).toLowerCase().includes(query);
            });
        });

        currentDetailsData = filtered;
        renderDetailsTable(filtered);
    });

    // XLSX Spreadsheet exporting using SheetJS
    document.getElementById('details-export-btn').addEventListener('click', () => {
        if (!currentDetailsData || currentDetailsData.length === 0) {
            alert("No data available to export.");
            return;
        }
        
        try {
            const exportedData = currentDetailsData.map(currentDetailsConfig.exportDataTransformer);
            const ws = XLSX.utils.json_to_sheet(exportedData);
            const wb = XLSX.utils.book_new();
            
            // Set auto column width
            const maxLenMap = {};
            exportedData.forEach(row => {
                Object.keys(row).forEach(key => {
                    const cellVal = String(row[key] || '');
                    maxLenMap[key] = Math.max(maxLenMap[key] || 10, cellVal.length);
                });
            });
            ws['!cols'] = Object.keys(maxLenMap).map(key => ({ wch: maxLenMap[key] + 3 }));
            
            XLSX.utils.book_append_sheet(wb, ws, "Financial Report");
            const filename = currentDetailsConfig.xlsxFilename || "financial_details.xlsx";
            XLSX.writeFile(wb, filename);
        } catch (error) {
            console.error("Export to Excel failed:", error);
            alert("Export to Excel failed. See console for details.");
        }
    });

    // Close buttons handlers
    document.getElementById('details-modal-close-btn').addEventListener('click', closeDetailsModal);
    document.getElementById('details-modal-close-footer-btn').addEventListener('click', closeDetailsModal);
    document.getElementById('details-modal').addEventListener('click', (e) => {
        if (e.target === document.getElementById('details-modal')) {
            closeDetailsModal();
        }
    });

    // --- KPI Card Click Handlers ---
    
    function showNetWorthDetails() {
        const banks = FinData.masters.banks.filter(b => b.status === 'Active');
        let totalLiquid = 0;
        banks.forEach(b => {
            if (!b.authDashboard) totalLiquid += calculateAccountBalance(b.name);
        });

        const config = {
            title: "Net Worth Accounts Breakdown",
            summaryHtml: `
                <div class="card glass-panel" style="padding: 15px;">
                    <div style="font-size: 11px; color: var(--text-muted);">Current Net Worth</div>
                    <div style="font-size: 20px; font-weight: 700; color: ${totalLiquid >= 0 ? 'var(--accent)' : 'var(--color-expense)'}; margin-top: 5px;">${totalLiquid >= 0 ? '' : '-'}${formatCurrency(Math.abs(totalLiquid))}</div>
                </div>
                <div class="card glass-panel" style="padding: 15px;">
                    <div style="font-size: 11px; color: var(--text-muted);">Active Accounts</div>
                    <div style="font-size: 20px; font-weight: 700; color: var(--text-main); margin-top: 5px;">${banks.length}</div>
                </div>
            `,
            headers: ['SL', 'Account Name', 'Type', 'Account Head', 'Account Number', 'Current Balance'],
            data: banks,
            rowRenderer: (b, index) => {
                const bal = calculateAccountBalance(b.name);
                return `
                    <tr style="border-bottom: 1px solid var(--glass-border); cursor: pointer;" class="hover-highlight" onclick="drillDownByAccount('${b.name.replace(/'/g, "\\'")}')">
                        <td style="padding: 12px 24px; font-size: 13px; color: var(--text-muted)">${index + 1}</td>
                        <td style="padding: 12px 24px; font-size: 13px; font-weight: 600;">
                            ${b.bankName}
                            ${b.authDashboard ? '<span class="badge" style="font-size: 8px; background: rgba(249,115,22,0.1); color:#f97316; margin-left:5px;">PRV</span>' : ''}
                        </td>
                        <td style="padding: 12px 24px; font-size: 13px; color: var(--text-muted);">${b.type}</td>
                        <td style="padding: 12px 24px; font-size: 13px;">${b.accountHead}</td>
                        <td style="padding: 12px 24px; font-size: 13px; font-family: monospace;">**** ${b.number || '0000'}</td>
                        <td style="padding: 12px 24px; font-size: 13px; font-weight: 700; text-align: right; color: ${bal >= 0 ? 'var(--color-income)' : 'var(--color-expense)'};">${bal >= 0 ? '' : '-'}${formatCurrency(Math.abs(bal))}</td>
                    </tr>
                `;
            },
            xlsxFilename: `net_worth_accounts_${new Date().toISOString().slice(0,10)}.xlsx`,
            exportDataTransformer: (b) => ({
                'Account Name': b.bankName,
                'System Name': b.name,
                'Type': b.type,
                'Account Head': b.accountHead,
                'Account Number': b.number ? `**** ${b.number}` : 'N/A',
                'Status': b.status,
                'Current Balance': calculateAccountBalance(b.name)
            })
        };
        openDetailsModal(config);
    }

    function showTotalDetails() {
        const filter = document.querySelector('#dashboard-toggle button.active')?.getAttribute('data-filter') || 'income';
        if (filter === 'ledger') return;

        const stats = FinData.getTotalsByFilter(filter, activePeriod);
        const filterTitle = filter.charAt(0).toUpperCase() + filter.slice(1);

        const sortedRecords = [...stats.records].sort((a, b) => new Date(b.date) - new Date(a.date));

        const config = {
            title: `Total ${filterTitle} Audit Trail`,
            summaryHtml: `
                <div class="card glass-panel" style="padding: 15px;">
                    <div style="font-size: 11px; color: var(--text-muted);">Total ${filterTitle}</div>
                    <div style="font-size: 20px; font-weight: 700; color: var(--accent); margin-top: 5px;">${formatCurrency(stats.total)}</div>
                </div>
                <div class="card glass-panel" style="padding: 15px;">
                    <div style="font-size: 11px; color: var(--text-muted);">Record Count</div>
                    <div style="font-size: 20px; font-weight: 700; color: var(--text-main); margin-top: 5px;">${stats.count}</div>
                </div>
                <div class="card glass-panel" style="padding: 15px;">
                    <div style="font-size: 11px; color: var(--text-muted);">Active Period</div>
                    <div style="font-size: 20px; font-weight: 700; color: var(--text-main); margin-top: 5px; text-transform: capitalize;">${activePeriod}</div>
                </div>
            `,
            headers: ['Date', 'Category', 'Sub-Category', 'Account/Bank', 'Notes/Details', 'Amount'],
            data: sortedRecords,
            rowRenderer: (r, index) => `
                <tr style="border-bottom: 1px solid var(--glass-border);" class="hover-highlight">
                    <td style="padding: 12px 24px; font-size: 13px;">${formatDate(r.date)}</td>
                    <td style="padding: 12px 24px; font-size: 13px; font-weight: 600;">${r.category}</td>
                    <td style="padding: 12px 24px; font-size: 13px; color: var(--text-muted);">${r.subCategory || ''}</td>
                    <td style="padding: 12px 24px; font-size: 13px; color: var(--text-muted);">${r.bank || 'N/A'}</td>
                    <td style="padding: 12px 24px; font-size: 13px; color: var(--text-muted); max-width: 250px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${r.notes || ''}</td>
                    <td style="padding: 12px 24px; font-size: 13px; font-weight: 700; text-align: right; color: var(--accent);">${formatCurrency(r.amount)}</td>
                </tr>
            `,
            xlsxFilename: `${filter}_report_${activePeriod}_${new Date().toISOString().slice(0,10)}.xlsx`,
            exportDataTransformer: (r) => ({
                'Date': r.date,
                'Category': r.category,
                'Sub-Category': r.subCategory || '',
                'Account': r.bank || '',
                'Notes': r.notes || '',
                'Amount': parseFloat(r.amount)
            })
        };
        openDetailsModal(config);
    }

    function showLedgerTakeDetails() {
        const stats = FinData.getTotalsByFilter('ledger', activePeriod);
        
        const personMap = {};
        stats.records.forEach(r => {
            const name = r.person || 'Unknown';
            if (!personMap[name]) personMap[name] = { given: 0, taken: 0 };
            const amt = parseFloat(r.amount);
            const wAmt = parseFloat(r.withdrawalAmount || 0);
            const dAmt = parseFloat(r.depositAmount || 0);
            if (wAmt > 0) {
                personMap[name].given += wAmt;
            } else if (dAmt > 0) {
                personMap[name].taken += dAmt;
            } else {
                const sub = (r.subCategory || '').toLowerCase();
                const cat = (r.category || '').toLowerCase();
                if (sub.includes('given') || sub.includes('debited') || cat.includes('lend')) {
                    personMap[name].given += amt;
                } else if (sub.includes('taken') || sub.includes('credited') || cat.includes('borrow') || cat.includes('return')) {
                    personMap[name].taken += amt;
                }
            }
        });

        const summaryData = Object.keys(personMap).map(name => {
            const data = personMap[name];
            return { name, ...data, bal: data.given - data.taken };
        });

        const debtors = summaryData.filter(p => p.bal > 0).sort((a, b) => b.bal - a.bal);
        const totalTake = debtors.reduce((sum, d) => sum + d.bal, 0);

        const config = {
            title: "Ledger Asset Balances (To Take)",
            summaryHtml: `
                <div class="card glass-panel" style="padding: 15px;">
                    <div style="font-size: 11px; color: var(--text-muted);">Total To Take</div>
                    <div style="font-size: 20px; font-weight: 700; color: var(--color-income); margin-top: 5px;">${formatCurrency(totalTake)}</div>
                </div>
                <div class="card glass-panel" style="padding: 15px;">
                    <div style="font-size: 11px; color: var(--text-muted);">Debtors Count</div>
                    <div style="font-size: 20px; font-weight: 700; color: var(--text-main); margin-top: 5px;">${debtors.length}</div>
                </div>
            `,
            headers: ['SL', 'Debtor Name', 'Total Debited', 'Total Credited', 'Net Balance'],
            data: debtors,
            rowRenderer: (p, index) => `
                <tr style="border-bottom: 1px solid var(--glass-border); cursor: pointer;" class="hover-highlight" onclick="drillDownByPerson('${p.name.replace(/'/g, "\\'")}')">
                    <td style="padding: 12px 24px; font-size: 13px; color: var(--text-muted)">${index + 1}</td>
                    <td style="padding: 12px 24px; font-size: 13px; font-weight: 600;">${p.name}</td>
                    <td style="padding: 12px 24px; font-size: 13px; color: var(--color-income);">${formatCurrency(p.given)}</td>
                    <td style="padding: 12px 24px; font-size: 13px; color: var(--color-expense);">${formatCurrency(p.taken)}</td>
                    <td style="padding: 12px 24px; font-size: 13px; font-weight: 700; text-align: right; color: var(--color-income);">${formatCurrency(p.bal)}</td>
                </tr>
            `,
            xlsxFilename: `ledger_take_debtors_${new Date().toISOString().slice(0,10)}.xlsx`,
            exportDataTransformer: (p) => ({
                'Name': p.name,
                'Total Debited': p.given,
                'Total Credited': p.taken,
                'Net Balance (To Take)': p.bal
            })
        };
        openDetailsModal(config);
    }

    function showLedgerGiveDetails() {
        const stats = FinData.getTotalsByFilter('ledger', activePeriod);
        
        const personMap = {};
        stats.records.forEach(r => {
            const name = r.person || 'Unknown';
            if (!personMap[name]) personMap[name] = { given: 0, taken: 0 };
            const amt = parseFloat(r.amount);
            const wAmt = parseFloat(r.withdrawalAmount || 0);
            const dAmt = parseFloat(r.depositAmount || 0);
            if (wAmt > 0) {
                personMap[name].given += wAmt;
            } else if (dAmt > 0) {
                personMap[name].taken += dAmt;
            } else {
                const sub = (r.subCategory || '').toLowerCase();
                const cat = (r.category || '').toLowerCase();
                if (sub.includes('given') || sub.includes('debited') || cat.includes('lend')) {
                    personMap[name].given += amt;
                } else if (sub.includes('taken') || sub.includes('credited') || cat.includes('borrow') || cat.includes('return')) {
                    personMap[name].taken += amt;
                }
            }
        });

        const summaryData = Object.keys(personMap).map(name => {
            const data = personMap[name];
            return { name, ...data, bal: data.given - data.taken };
        });

        const creditors = summaryData.filter(p => p.bal < 0).sort((a, b) => a.bal - b.bal);
        const totalGive = creditors.reduce((sum, d) => sum + Math.abs(d.bal), 0);

        const config = {
            title: "Ledger Liability Balances (To Give)",
            summaryHtml: `
                <div class="card glass-panel" style="padding: 15px;">
                    <div style="font-size: 11px; color: var(--text-muted);">Total To Give</div>
                    <div style="font-size: 20px; font-weight: 700; color: var(--color-expense); margin-top: 5px;">${formatCurrency(totalGive)}</div>
                </div>
                <div class="card glass-panel" style="padding: 15px;">
                    <div style="font-size: 11px; color: var(--text-muted);">Creditors Count</div>
                    <div style="font-size: 20px; font-weight: 700; color: var(--text-main); margin-top: 5px;">${creditors.length}</div>
                </div>
            `,
            headers: ['SL', 'Creditor Name', 'Total Debited', 'Total Credited', 'Net Balance'],
            data: creditors,
            rowRenderer: (p, index) => `
                <tr style="border-bottom: 1px solid var(--glass-border); cursor: pointer;" class="hover-highlight" onclick="drillDownByPerson('${p.name.replace(/'/g, "\\'")}')">
                    <td style="padding: 12px 24px; font-size: 13px; color: var(--text-muted)">${index + 1}</td>
                    <td style="padding: 12px 24px; font-size: 13px; font-weight: 600;">${p.name}</td>
                    <td style="padding: 12px 24px; font-size: 13px; color: var(--color-income);">${formatCurrency(p.given)}</td>
                    <td style="padding: 12px 24px; font-size: 13px; color: var(--color-expense);">${formatCurrency(p.taken)}</td>
                    <td style="padding: 12px 24px; font-size: 13px; font-weight: 700; text-align: right; color: var(--color-expense);">-${formatCurrency(Math.abs(p.bal))}</td>
                </tr>
            `,
            xlsxFilename: `ledger_give_creditors_${new Date().toISOString().slice(0,10)}.xlsx`,
            exportDataTransformer: (p) => ({
                'Name': p.name,
                'Total Debited': p.given,
                'Total Credited': p.taken,
                'Net Balance (To Give)': Math.abs(p.bal)
            })
        };
        openDetailsModal(config);
    }

    // --- Dynamic Drill-down Helper Functions ---

    function drillDownByAccount(accountName) {
        let matchedBank = FinData.masters.banks.find(b => b.name === accountName || b.bankName === accountName);
        let targetAccountName = matchedBank ? matchedBank.name : accountName;
        
        const matchingTrans = FinData.transactions.filter(t => {
            if (t.type === 'Transfer') {
                return t.fromBank === targetAccountName || t.toBank === targetAccountName || 
                       (t.fromBank && t.fromBank.startsWith(targetAccountName)) || 
                       (t.toBank && t.toBank.startsWith(targetAccountName));
            }
            return t.bank === targetAccountName || (t.bank && t.bank.startsWith(targetAccountName));
        });

        matchingTrans.sort((a, b) => new Date(b.date) - new Date(a.date));
        const displayBankName = matchedBank ? matchedBank.bankName : accountName;

        const config = {
            title: `Account Ledgers: ${displayBankName}`,
            summaryHtml: `
                <div class="card glass-panel" style="padding: 15px;">
                    <div style="font-size: 11px; color: var(--text-muted);">Current Balance</div>
                    <div style="font-size: 20px; font-weight: 700; color: ${calculateAccountBalance(targetAccountName) >= 0 ? 'var(--accent)' : 'var(--color-expense)'}; margin-top: 5px;">${calculateAccountBalance(targetAccountName) >= 0 ? '' : '-'}${formatCurrency(Math.abs(calculateAccountBalance(targetAccountName)))}</div>
                </div>
                <div class="card glass-panel" style="padding: 15px;">
                    <div style="font-size: 11px; color: var(--text-muted);">Total Transactions</div>
                    <div style="font-size: 20px; font-weight: 700; color: var(--text-main); margin-top: 5px;">${matchingTrans.length}</div>
                </div>
                <div class="card glass-panel" style="padding: 15px;">
                    <div style="font-size: 11px; color: var(--text-muted);">Account Head</div>
                    <div style="font-size: 16px; font-weight: 700; color: var(--text-main); margin-top: 8px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                        ${(matchedBank?.accountHead || 'N/A')}
                    </div>
                </div>
            `,
            headers: ['Date', 'Type', 'Category', 'Details/Note', 'Amount'],
            data: matchingTrans,
            rowRenderer: (t, index) => {
                const isDebit = t.type === 'Expense' || t.type === 'Investment' || (t.type === 'Transfer' && t.fromBank === targetAccountName) || (t.type === 'Ledger' && ((t.subCategory || '').toLowerCase().includes('given') || (t.subCategory || '').toLowerCase().includes('debited') || (t.category || '').toLowerCase().includes('lend')));
                const isCredit = t.type === 'Income' || (t.type === 'Transfer' && t.toBank === targetAccountName) || (t.type === 'Ledger' && ((t.subCategory || '').toLowerCase().includes('taken') || (t.subCategory || '').toLowerCase().includes('credited') || (t.category || '').toLowerCase().includes('borrow') || (t.category || '').toLowerCase().includes('return')));
                
                let typeBadge = '';
                let amtColor = 'var(--text-main)';
                let amtSign = '';
                let amtValue = t.amount;
                
                if (t.type === 'Transfer') {
                    typeBadge = `<span class="badge" style="background: rgba(56,189,248,0.1); color: var(--accent); font-size: 9px;">TRF</span>`;
                    if (t.fromBank === targetAccountName) {
                        amtColor = 'var(--color-expense)';
                        amtSign = '-';
                    } else {
                        amtColor = 'var(--color-income)';
                        amtSign = '+';
                    }
                } else {
                    typeBadge = `<span class="badge ${(t.type || '').toLowerCase() === 'income' ? 'income' : 'expense'}" style="font-size: 9px;">${(t.type || '').toUpperCase()}</span>`;
                    if (isDebit) {
                        amtColor = 'var(--color-expense)';
                        amtSign = '-';
                    } else if (isCredit) {
                        amtColor = 'var(--color-income)';
                        amtSign = '+';
                    }
                }

                if (t.mode === 'Opening Balance') {
                    amtColor = 'var(--color-income)';
                    amtSign = '';
                    amtValue = Math.abs(t.amount);
                }
                
                let detailsText = t.notes || '';
                if (t.type === 'Transfer') {
                    detailsText = `Transfer to/from: ${t.fromBank === targetAccountName ? t.toBank : t.fromBank} ${t.notes ? `(${t.notes})` : ''}`;
                } else if (t.type === 'Ledger') {
                    detailsText = `${t.person ? `Person: ${t.person} ` : ''}${t.notes ? `(${t.notes})` : ''}`;
                }

                return `
                    <tr style="border-bottom: 1px solid var(--glass-border);" class="hover-highlight">
                        <td style="padding: 12px 24px; font-size: 13px;">${formatDate(t.date)}</td>
                        <td style="padding: 12px 24px; font-size: 13px;">${typeBadge}</td>
                        <td style="padding: 12px 24px; font-size: 13px; font-weight: 600;">${t.category} <span style="font-size: 10px; color: var(--text-muted); display: block;">${t.subCategory || ''}</span></td>
                        <td style="padding: 12px 24px; font-size: 13px; color: var(--text-muted); max-width: 250px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${detailsText}</td>
                        <td style="padding: 12px 24px; font-size: 13px; font-weight: 700; text-align: right; color: ${amtColor};">${amtSign}${formatCurrency(amtValue)}</td>
                    </tr>
                `;
            },
            xlsxFilename: `${displayBankName.replace(/\s+/g, '_')}_ledger_${new Date().toISOString().slice(0,10)}.xlsx`,
            exportDataTransformer: (t) => {
                const isDebit = t.type === 'Expense' || t.type === 'Investment' || (t.type === 'Transfer' && t.fromBank === targetAccountName) || (t.type === 'Ledger' && ((t.subCategory || '').toLowerCase().includes('given') || (t.subCategory || '').toLowerCase().includes('debited') || (t.category || '').toLowerCase().includes('lend')));
                const amtSign = isDebit ? -1 : 1;
                
                return {
                    'Date': t.date,
                    'Type': t.type,
                    'Category': t.category,
                    'Sub-Category': t.subCategory || '',
                    'Details/Notes': t.type === 'Transfer' ? `Transfer to/from: ${t.fromBank === targetAccountName ? t.toBank : t.fromBank} ${t.notes || ''}` : (t.notes || ''),
                    'Account': targetAccountName,
                    'Signed Amount': amtSign * parseFloat(t.amount),
                    'Base Amount': parseFloat(t.amount)
                };
            }
        };

        openDetailsModal(config);
    }

    function drillDownByPerson(personName) {
        const matchingTrans = FinData.transactions.filter(t => t.type === 'Ledger' && t.person === personName);
        matchingTrans.sort((a, b) => new Date(b.date) - new Date(a.date));

        let totalGiven = 0;
        let totalTaken = 0;
        matchingTrans.forEach(t => {
            const amt = parseFloat(t.amount || 0);
            const wAmt = parseFloat(t.withdrawalAmount || 0);
            const dAmt = parseFloat(t.depositAmount || 0);
            if (wAmt > 0) {
                totalGiven += wAmt;
            } else if (dAmt > 0) {
                totalTaken += dAmt;
            } else {
                const sub = (t.subCategory || '').toLowerCase();
                const cat = (t.category || '').toLowerCase();
                if (sub.includes('given') || sub.includes('debited') || cat.includes('lend')) {
                    totalGiven += amt;
                } else if (sub.includes('taken') || sub.includes('credited') || cat.includes('borrow') || cat.includes('return')) {
                    totalTaken += amt;
                }
            }
        });
        const netBal = totalGiven - totalTaken;

        const config = {
            title: `Ledger Timeline: ${personName}`,
            summaryHtml: `
                <div class="card glass-panel" style="padding: 15px;">
                    <div style="font-size: 11px; color: var(--text-muted);">Net Balance</div>
                    <div style="font-size: 20px; font-weight: 700; color: ${netBal >= 0 ? 'var(--color-income)' : 'var(--color-expense)'}; margin-top: 5px;">
                        ${netBal >= 0 ? '' : '-'}${formatCurrency(Math.abs(netBal))}
                    </div>
                </div>
                <div class="card glass-panel" style="padding: 15px;">
                    <div style="font-size: 11px; color: var(--text-muted);">Total Debited</div>
                    <div style="font-size: 20px; font-weight: 700; color: var(--color-income); margin-top: 5px;">${formatCurrency(totalGiven)}</div>
                </div>
                <div class="card glass-panel" style="padding: 15px;">
                    <div style="font-size: 11px; color: var(--text-muted);">Total Credited</div>
                    <div style="font-size: 20px; font-weight: 700; color: var(--color-expense); margin-top: 5px;">${formatCurrency(totalTaken)}</div>
                </div>
            `,
            headers: ['Date', 'Action', 'Account', 'Notes', 'Amount'],
            data: matchingTrans,
            rowRenderer: (t, index) => {
                const isGiven = (t.subCategory || '').toLowerCase().includes('given') || (t.subCategory || '').toLowerCase().includes('debited') || (t.category || '').toLowerCase().includes('lend');
                const isOpeningBal = t.mode === 'Opening Balance';
                const amtColor = isOpeningBal ? 'var(--color-income)' : (isGiven ? 'var(--color-income)' : 'var(--color-expense)');
                const amtValue = isOpeningBal ? Math.abs(t.amount) : t.amount;
                
                return `
                    <tr style="border-bottom: 1px solid var(--glass-border);" class="hover-highlight">
                        <td style="padding: 12px 24px; font-size: 13px;">${formatDate(t.date)}</td>
                        <td style="padding: 12px 24px; font-size: 13px;">
                            <span class="badge ${isGiven ? 'income' : 'expense'}" style="font-size: 9px;">${isGiven ? 'DEBITED' : 'CREDITED'}</span>
                        </td>
                        <td style="padding: 12px 24px; font-size: 13px; color: var(--text-muted);">${t.bank}</td>
                        <td style="padding: 12px 24px; font-size: 13px; color: var(--text-muted); max-width: 250px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${t.notes || ''}</td>
                        <td style="padding: 12px 24px; font-size: 13px; font-weight: 700; text-align: right; color: ${amtColor};">${formatCurrency(amtValue)}</td>
                    </tr>
                `;
            },
            xlsxFilename: `${personName.replace(/\s+/g, '_')}_ledger_statement_${new Date().toISOString().slice(0,10)}.xlsx`,
            exportDataTransformer: (t) => {
                const wAmt = parseFloat(t.withdrawalAmount || 0);
                const dAmt = parseFloat(t.depositAmount || 0);
                const isGiven = wAmt > 0 ? true : (dAmt > 0 ? false : ((t.subCategory || '').toLowerCase().includes('given') || (t.subCategory || '').toLowerCase().includes('debited') || (t.category || '').toLowerCase().includes('lend')));
                return {
                    'Date': t.date,
                    'Person': personName,
                    'Action': isGiven ? 'Debited' : 'Credited',
                    'Account': t.bank,
                    'Notes': t.notes || '',
                    'Signed Balance Impact': isGiven ? parseFloat(t.amount) : -parseFloat(t.amount),
                    'Amount': parseFloat(t.amount)
                };
            }
        };

        openDetailsModal(config);
    }

    function drillDownByCategory(categoryName) {
        const filter = document.querySelector('#dashboard-toggle button.active')?.getAttribute('data-filter') || 'income';
        const stats = FinData.getTotalsByFilter(filter, activePeriod);
        
        const matchingTrans = stats.records.filter(t => t.category === categoryName);
        matchingTrans.sort((a, b) => new Date(b.date) - new Date(a.date));
        
        const totalAmt = matchingTrans.reduce((sum, t) => sum + parseFloat(t.amount || 0), 0);
        
        const config = {
            title: `Category Details: ${categoryName}`,
            summaryHtml: `
                <div class="card glass-panel" style="padding: 15px;">
                    <div style="font-size: 11px; color: var(--text-muted);">Total Amount</div>
                    <div style="font-size: 20px; font-weight: 700; color: var(--accent); margin-top: 5px;">${formatCurrency(totalAmt)}</div>
                </div>
                <div class="card glass-panel" style="padding: 15px;">
                    <div style="font-size: 11px; color: var(--text-muted);">Transaction Count</div>
                    <div style="font-size: 20px; font-weight: 700; color: var(--text-main); margin-top: 5px;">${matchingTrans.length}</div>
                </div>
                <div class="card glass-panel" style="padding: 15px;">
                    <div style="font-size: 11px; color: var(--text-muted);">Active Period</div>
                    <div style="font-size: 20px; font-weight: 700; color: var(--text-main); margin-top: 5px; text-transform: capitalize;">${activePeriod}</div>
                </div>
            `,
            headers: ['Date', 'Sub-Category', 'Account/Bank', 'Notes/Details', 'Amount'],
            data: matchingTrans,
            rowRenderer: (r, index) => {
                const isOpeningBal = r.mode === 'Opening Balance';
                const isExpense = r.type === 'Expense';
                const isIncome = r.type === 'Income';
                const amtColor = isOpeningBal ? 'var(--color-income)' : (isExpense ? 'var(--color-expense)' : (isIncome ? 'var(--color-income)' : 'var(--accent)'));
                const amtSign = isOpeningBal ? '' : (isExpense ? '-' : (isIncome ? '+' : ''));
                const amtValue = isOpeningBal ? Math.abs(r.amount) : r.amount;
                return `
                    <tr style="border-bottom: 1px solid var(--glass-border);" class="hover-highlight">
                        <td style="padding: 12px 24px; font-size: 13px;">${formatDate(r.date)}</td>
                        <td style="padding: 12px 24px; font-size: 13px;">${r.subCategory || ''}</td>
                        <td style="padding: 12px 24px; font-size: 13px; color: var(--text-muted);">${r.bank || 'N/A'}</td>
                        <td style="padding: 12px 24px; font-size: 13px; color: var(--text-muted); max-width: 250px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${r.notes || ''}</td>
                        <td style="padding: 12px 24px; font-size: 13px; font-weight: 700; text-align: right; color: ${amtColor};">${amtSign}${formatCurrency(amtValue)}</td>
                    </tr>
                `;
            },
            xlsxFilename: `category_${categoryName.replace(/\s+/g, '_')}_report_${new Date().toISOString().slice(0,10)}.xlsx`,
            exportDataTransformer: (r) => ({
                'Date': r.date,
                'Category': categoryName,
                'Sub-Category': r.subCategory || '',
                'Account': r.bank || '',
                'Notes': r.notes || '',
                'Amount': parseFloat(r.amount)
            })
        };
        openDetailsModal(config);
    }

    function drillDownByTrend(trendLabel) {
        const filter = document.querySelector('#dashboard-toggle button.active')?.getAttribute('data-filter') || 'income';
        const stats = FinData.getTotalsByFilter(filter, activePeriod);
        const now = new Date();
        const currentYear = now.getFullYear();
        const currentMonth = now.getMonth();

        let matchingTrans = [];
        let dateTitle = '';

        if (activePeriod === 'year') {
            const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
            const monthIdx = months.indexOf(trendLabel);
            if (monthIdx !== -1) {
                matchingTrans = stats.records.filter(r => {
                    const rDate = new Date(r.date);
                    return !isNaN(rDate.getTime()) && rDate.getFullYear() === currentYear && rDate.getMonth() === monthIdx;
                });
                dateTitle = `${trendLabel} ${currentYear}`;
            }
        } else if (activePeriod === 'all') {
            const yearNum = parseInt(trendLabel, 10);
            matchingTrans = stats.records.filter(r => {
                const rDate = new Date(r.date);
                return !isNaN(rDate.getTime()) && rDate.getFullYear() === yearNum;
            });
            dateTitle = `Year ${yearNum}`;
        } else {
            const dayNum = parseInt(trendLabel, 10);
            matchingTrans = stats.records.filter(r => {
                const rDate = new Date(r.date);
                return !isNaN(rDate.getTime()) && 
                       rDate.getFullYear() === currentYear && 
                       rDate.getMonth() === currentMonth && 
                       rDate.getDate() === dayNum;
            });
            const monthName = now.toLocaleString('default', { month: 'long' });
            dateTitle = `${monthName} ${dayNum}, ${currentYear}`;
        }

        matchingTrans.sort((a, b) => new Date(b.date) - new Date(a.date));
        const totalAmt = matchingTrans.reduce((sum, t) => sum + parseFloat(t.amount || 0), 0);
        const filterTitle = filter.charAt(0).toUpperCase() + filter.slice(1);

        const config = {
            title: `Trend Details: ${dateTitle} (${filterTitle})`,
            summaryHtml: `
                <div class="card glass-panel" style="padding: 15px;">
                    <div style="font-size: 11px; color: var(--text-muted);">Total Amount</div>
                    <div style="font-size: 20px; font-weight: 700; color: var(--accent); margin-top: 5px;">${formatCurrency(totalAmt)}</div>
                </div>
                <div class="card glass-panel" style="padding: 15px;">
                    <div style="font-size: 11px; color: var(--text-muted);">Transaction Count</div>
                    <div style="font-size: 20px; font-weight: 700; color: var(--text-main); margin-top: 5px;">${matchingTrans.length}</div>
                </div>
            `,
            headers: ['Date', 'Category', 'Account/Bank', 'Notes/Details', 'Amount'],
            data: matchingTrans,
            rowRenderer: (r, index) => {
                const isOpeningBal = r.mode === 'Opening Balance';
                const isExpense = r.type === 'Expense';
                const isIncome = r.type === 'Income';
                const amtColor = isOpeningBal ? 'var(--color-income)' : (isExpense ? 'var(--color-expense)' : (isIncome ? 'var(--color-income)' : 'var(--accent)'));
                const amtSign = isOpeningBal ? '' : (isExpense ? '-' : (isIncome ? '+' : ''));
                const amtValue = isOpeningBal ? Math.abs(r.amount) : r.amount;
                return `
                    <tr style="border-bottom: 1px solid var(--glass-border);" class="hover-highlight">
                        <td style="padding: 12px 24px; font-size: 13px;">${formatDate(r.date)}</td>
                        <td style="padding: 12px 24px; font-size: 13px; font-weight: 600;">${r.category} <span style="font-size: 10px; color: var(--text-muted); display: block;">${r.subCategory || ''}</span></td>
                        <td style="padding: 12px 24px; font-size: 13px; color: var(--text-muted);">${r.bank || 'N/A'}</td>
                        <td style="padding: 12px 24px; font-size: 13px; color: var(--text-muted); max-width: 250px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${r.notes || ''}</td>
                        <td style="padding: 12px 24px; font-size: 13px; font-weight: 700; text-align: right; color: ${amtColor};">${amtSign}${formatCurrency(amtValue)}</td>
                    </tr>
                `;
            },
            xlsxFilename: `trend_${trendLabel}_${filter}_${new Date().toISOString().slice(0,10)}.xlsx`,
            exportDataTransformer: (r) => ({
                'Date': r.date,
                'Category': r.category,
                'Sub-Category': r.subCategory || '',
                'Account': r.bank || '',
                'Notes': r.notes || '',
                'Amount': parseFloat(r.amount)
            })
        };
        openDetailsModal(config);
    }

    // --- GMAIL SMART SYNC & PAYTM EXTRACTION SYSTEM ---
    
    function updateGmailSyncUI(connected) {
        const statusVal = document.getElementById('gmail-status');
        const connectBtn = document.getElementById('connect-gmail-btn');
        const controls = document.getElementById('gmail-controls');

        if (!statusVal || !connectBtn) return;

        if (connected) {
            statusVal.innerText = 'Connected';
            statusVal.className = 'status-value connected';
            connectBtn.innerText = 'Disconnect';
            connectBtn.className = 'btn btn-outline btn-sm';
            if (controls) controls.classList.remove('hidden');
        } else {
            statusVal.innerText = 'Not Connected';
            statusVal.className = 'status-value disconnected';
            connectBtn.innerText = 'Connect Account';
            connectBtn.className = 'btn btn-outline btn-sm';
            if (controls) controls.classList.add('hidden');
        }
    }

    function ensurePaytmMasters() {
        let modified = false;
        
        // Ensure "Paytm Wallet" exists in Bank masters
        let walletBank = FinData.masters.banks.find(b => b.name === 'Paytm Wallet');
        if (!walletBank) {
            FinData.masters.banks.push({
                bankName: 'Paytm Wallet',
                name: 'Paytm Wallet',
                type: 'Saving',
                openingBalance: 0,
                status: 'Active',
                synced: false
            });
            modified = true;
        }

        // Ensure "Paytm UPI" exists in Bank masters
        let upiBank = FinData.masters.banks.find(b => b.name === 'Paytm UPI');
        if (!upiBank) {
            FinData.masters.banks.push({
                bankName: 'Paytm UPI',
                name: 'Paytm UPI',
                type: 'Saving',
                openingBalance: 0,
                status: 'Active',
                synced: false
            });
            modified = true;
        }

        if (modified) {
            FinData.storage.save('masters', FinData.masters);
            renderMasters();
        }
    }

    function getMessageBody(payload) {
        if (!payload) return "";
        let body = "";
        
        if (payload.body && payload.body.data) {
            body += atob(payload.body.data.replace(/-/g, '+').replace(/_/g, '/'));
        }
        
        if (payload.parts) {
            payload.parts.forEach(part => {
                body += getMessageBody(part);
            });
        }
        
        return body;
    }

    function compileTemplateToRegex(templateText) {
        if (!templateText) return null;

        const mappedRegex = /\(([^<]+)<([^>=]+)>(?:=<([^>]+)>)?\)/g;
        let match;
        const text = templateText;
        
        while ((match = mappedRegex.exec(text)) !== null) {
            placeholders.push({
                full: match[0],
                fieldName: match[1].trim(),
                value: match[2].trim(),
                mappedValue: match[3] ? match[3].trim() : null,
                index: match.index
            });
        }
        
        const unmappedRegex = /<([^>]+)>/g;
        while ((match = unmappedRegex.exec(text)) !== null) {
            const isInsideMapped = placeholders.some(p => match.index >= p.index && match.index < p.index + p.full.length);
            if (!isInsideMapped) {
                placeholders.push({
                    full: match[0],
                    fieldName: 'unmapped',
                    value: match[1].trim(),
                    index: match.index
                });
            }
        }

        placeholders.sort((a, b) => a.index - b.index);

        let escapedTemplate = templateText;
        const escapeRegExp = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        
        placeholders.forEach((ph, idx) => {
            escapedTemplate = escapedTemplate.replace(ph.full, `__PLACEHOLDER_${idx}__`);
        });

        escapedTemplate = escapeRegExp(escapedTemplate);

        placeholders.forEach((ph, idx) => {
            let groupPattern = '(.+?)';
            const fieldNameLower = ph.fieldName.toLowerCase();
            if (fieldNameLower === 'amount') {
                groupPattern = '([\\d,]+(?:\\.\\d{2})?)';
            } else if (fieldNameLower === 'date') {
                groupPattern = '([A-Za-z0-9,\\s\\/\\-]+)';
            }
            escapedTemplate = escapedTemplate.replace(`__PLACEHOLDER_${idx}__`, groupPattern);
        });

        escapedTemplate = escapedTemplate.replace(/\\s+/g, '\\s+').replace(/\\ /g, '\\s+').replace(/\s+/g, '\\s+');

        try {
            return {
                regex: new RegExp(escapedTemplate, 'i'),
                placeholders: placeholders
            };
        } catch (e) {
            console.error("Failed to compile template text to regex:", templateText, e);
            return null;
        }
    }

    function interpolateNotesTemplate(template, data) {
        if (!template) return `Gmail Sync: ${data.payee || ''}`;
        let res = template
            .replace(/{payee}/gi, data.payee || '')
            .replace(/{amount}/gi, (data.amount !== undefined && data.amount > 0) ? data.amount.toString() : '')
            .replace(/{bank}/gi, data.bank || '')
            .replace(/{category}/gi, data.category || '')
            .replace(/{subcategory}/gi, data.subcategory || '')
            .replace(/{date}/gi, data.date || '')
            .replace(/{from}/gi, data.from || '')
            .replace(/{subject}/gi, data.subject || '')
            .replace(/{body}/gi, data.body || '')
            .replace(/{snippet}/gi, data.snippet || '');

        // Dynamically replace any custom placeholders passed in data
        Object.keys(data).forEach(key => {
            const cleanKey = key.toLowerCase();
            if (!['payee', 'amount', 'bank', 'category', 'subcategory', 'date', 'from', 'subject', 'body', 'snippet'].includes(cleanKey)) {
                const reg = new RegExp(`{${cleanKey}}`, 'gi');
                res = res.replace(reg, data[key] || '');
            }
        });
        return res;
    }

    function parsePaytmEmail(msgData) {
        const snippet = msgData.snippet || "";
        const bodyText = getMessageBody(msgData.payload) || snippet;
        
        // Combine and clean up whitespace for regex execution
        const combinedText = (snippet + "\n" + bodyText).replace(/\s+/g, ' ');
        
        // Determine transaction date from Gmail header internalDate
        let transDate = new Date().toISOString().slice(0, 10);
        if (msgData.internalDate) {
            const parsedDate = new Date(parseInt(msgData.internalDate, 10));
            if (!isNaN(parsedDate.getTime())) {
                transDate = parsedDate.toISOString().slice(0, 10);
            }
        }
        
        // Extract headers for rule matching
        const headers = msgData.payload?.headers || [];
        const fromHeader = (headers.find(h => h.name.toLowerCase() === 'from')?.value || '').toLowerCase();
        const subjectHeader = (headers.find(h => h.name.toLowerCase() === 'subject')?.value || '').toLowerCase();

        // 1. Try Custom Sync Rules Matching
        const rules = FinData.config.gmailSyncRules || [];
        for (const rule of rules) {
            let fromMatch = true;
            let subjectMatch = true;
            
            if (rule.from) {
                const senders = rule.from.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
                fromMatch = senders.length === 0 || senders.some(sender => fromHeader.includes(sender));
            }
            if (rule.subject) {
                const subjects = rule.subject.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
                subjectMatch = subjects.length === 0 || subjects.some(subj => subjectHeader.includes(subj));
            }
            
            if (fromMatch && subjectMatch) {
                try {
                    let amount = 0;
                    let person = '';
                    let bank = rule.defaultBank || 'Paytm UPI';
                    let category = rule.defaultCategory || 'Other';
                    let subCategory = rule.defaultSubCategory;
                    let secondSubCategory = '';
                    let targetDate = transDate;
                    let time = '';
                    let mode = 'UPI';
                    let loanStart = '';
                    let loanEnd = '';
                    let loanAmount = 0;
                    let frequency = 'Daily';
                    let fromBank = '';
                    let toBank = '';
                    let finalNotes = '';
                    const placeholderValues = {};
                    const type = rule.type || 'Expense';

                    if (rule.easyMode && rule.templateText) {
                        const compiled = compileTemplateToRegex(rule.templateText);
                        if (!compiled) continue;

                        const match = combinedText.match(compiled.regex);
                        if (!match) continue;

                        let customNotes = '';

                        compiled.placeholders.forEach((ph, idx) => {
                            let matchVal = (match[idx + 1] || '').trim();
                            if (ph.mappedValue && matchVal.toLowerCase().trim() === ph.value.toLowerCase().trim()) {
                                matchVal = ph.mappedValue;
                            }
                            const fieldNameLower = ph.fieldName.toLowerCase();
                            
                            if (ph.fieldName && ph.fieldName !== 'unmapped') {
                                placeholderValues[ph.fieldName.toLowerCase().replace(/\s+/g, '_')] = matchVal;
                            }

                            if (fieldNameLower === 'amount') {
                                amount = parseFloat(matchVal.replace(/,/g, ''));
                            } else if (['payee', 'receiver', 'person'].includes(fieldNameLower)) {
                                person = matchVal;
                            } else if (fieldNameLower === 'bank') {
                                const foundBank = FinData.masters.banks.find(b => b.name.toLowerCase() === matchVal.toLowerCase());
                                bank = foundBank ? foundBank.name : matchVal;
                            } else if (fieldNameLower === 'frombank') {
                                const foundBank = FinData.masters.banks.find(b => b.name.toLowerCase() === matchVal.toLowerCase());
                                fromBank = foundBank ? foundBank.name : matchVal;
                            } else if (fieldNameLower === 'tobank') {
                                const foundBank = FinData.masters.banks.find(b => b.name.toLowerCase() === matchVal.toLowerCase());
                                toBank = foundBank ? foundBank.name : matchVal;
                            } else if (fieldNameLower === 'category') {
                                const typeCats = FinData.masters.categories[type] || [];
                                const foundCat = typeCats.find(c => c.name.toLowerCase() === matchVal.toLowerCase());
                                category = foundCat ? foundCat.name : matchVal;
                            } else if (fieldNameLower === 'subcategory') {
                                subCategory = matchVal;
                            } else if (fieldNameLower === 'secondsubcategory') {
                                secondSubCategory = matchVal;
                            } else if (fieldNameLower === 'date') {
                                targetDate = matchVal;
                            } else if (fieldNameLower === 'time') {
                                time = matchVal;
                            } else if (fieldNameLower === 'mode') {
                                mode = matchVal;
                            } else if (fieldNameLower === 'notes') {
                                customNotes = matchVal;
                            } else if (fieldNameLower === 'loanstart') {
                                loanStart = matchVal;
                            } else if (fieldNameLower === 'loanend') {
                                loanEnd = matchVal;
                            } else if (fieldNameLower === 'loanamount') {
                                loanAmount = parseFloat(matchVal.replace(/,/g, ''));
                            } else if (fieldNameLower === 'frequency') {
                                frequency = matchVal;
                            }
                        });

                        if (isNaN(amount) || amount <= 0) {
                            continue;
                        }

                        if (!subCategory) {
                            const cats = FinData.masters.categories[type] || [];
                            const matchedCat = cats.find(c => c.name === category);
                            subCategory = matchedCat && matchedCat.subCategories && matchedCat.subCategories.length > 0
                                ? matchedCat.subCategories[0]
                                : 'Other';
                        }

                        const notesText = interpolateNotesTemplate(rule.notesTemplate, {
                            payee: person,
                            amount: amount,
                            bank: type === 'Transfer' ? `${fromBank || bank} > ${toBank || ''}` : bank,
                            category: category || (type === 'Transfer' ? 'Self Transfer' : 'Other'),
                            subcategory: subCategory || (type === 'Transfer' ? 'Own Accounts' : 'Other'),
                            date: targetDate,
                            from: fromHeader,
                            subject: subjectHeader,
                            body: combinedText,
                            snippet: snippet,
                            ...placeholderValues
                        });

                        finalNotes = customNotes || notesText;

                    } else {
                        if (rule.amountRegex) {
                            const amtReg = new RegExp(rule.amountRegex, 'i');
                            const amtMatch = combinedText.match(amtReg);
                            if (amtMatch && amtMatch[1]) {
                                amount = parseFloat(amtMatch[1].replace(/,/g, ''));
                            }
                        }
                        
                        if (rule.notesRegex) {
                            const notesReg = new RegExp(rule.notesRegex, 'i');
                            const notesMatch = combinedText.match(notesReg);
                            if (notesMatch && notesMatch[1]) {
                                person = notesMatch[1].trim();
                            }
                        }
                        
                        let customPerson = '';
                        let customAmount = null;
                        let customBank = '';
                        let customCategory = '';
                        let customSubCategory = '';
                        let customDate = '';
                        let customNotes = '';

                        if (rule.placeholders && Array.isArray(rule.placeholders)) {
                            rule.placeholders.forEach(ph => {
                                if (ph.name && ph.regex) {
                                    try {
                                        const phReg = new RegExp(ph.regex, 'i');
                                        const phMatch = combinedText.match(phReg);
                                        if (phMatch && phMatch[1]) {
                                            const val = phMatch[1].trim();
                                            placeholderValues[ph.name.toLowerCase()] = val;
                                            
                                            if (ph.mappedField === 'person') {
                                                customPerson = val;
                                            } else if (ph.mappedField === 'amount') {
                                                const num = parseFloat(val.replace(/,/g, ''));
                                                if (!isNaN(num)) {
                                                    customAmount = num;
                                                }
                                            } else if (ph.mappedField === 'bank') {
                                                customBank = val;
                                            } else if (ph.mappedField === 'category') {
                                                customCategory = val;
                                            } else if (ph.mappedField === 'subCategory') {
                                                customSubCategory = val;
                                            } else if (ph.mappedField === 'date') {
                                                customDate = val;
                                            } else if (ph.mappedField === 'notes') {
                                                customNotes = val;
                                            }
                                        }
                                    } catch (e) {
                                        console.error(`Error parsing custom placeholder ${ph.name}:`, e);
                                    }
                                }
                            });
                        }

                        if (customAmount !== null) {
                            amount = customAmount;
                        }
                        
                        if (isNaN(amount) || amount <= 0) {
                            continue;
                        }
                        
                        if (customPerson) {
                            person = customPerson;
                        }
                        
                        bank = rule.defaultBank || 'Paytm UPI';
                        if (customBank) {
                            const foundBank = FinData.masters.banks.find(b => b.name.toLowerCase() === customBank.toLowerCase());
                            bank = foundBank ? foundBank.name : customBank;
                        }
                        
                        category = rule.defaultCategory || 'Other';
                        if (customCategory) {
                            const typeCats = FinData.masters.categories[type] || [];
                            const foundCat = typeCats.find(c => c.name.toLowerCase() === customCategory.toLowerCase());
                            category = foundCat ? foundCat.name : customCategory;
                        }
                        
                        subCategory = customSubCategory || rule.defaultSubCategory;
                        if (!subCategory) {
                            const cats = FinData.masters.categories[type] || [];
                            const matchedCat = cats.find(c => c.name === category);
                            subCategory = matchedCat && matchedCat.subCategories && matchedCat.subCategories.length > 0
                                ? matchedCat.subCategories[0]
                                : 'Other';
                        }
                        
                        targetDate = customDate || transDate;
                        
                        const notesText = interpolateNotesTemplate(rule.notesTemplate, {
                            payee: person,
                            amount: amount,
                            bank: type === 'Transfer' ? `${fromBank || bank} > ${toBank || ''}` : bank,
                            category: category || (type === 'Transfer' ? 'Self Transfer' : 'Other'),
                            subcategory: subCategory || (type === 'Transfer' ? 'Own Accounts' : 'Other'),
                            date: targetDate,
                            from: fromHeader,
                            subject: subjectHeader,
                            body: combinedText,
                            snippet: snippet,
                            ...placeholderValues
                        });
                        
                        finalNotes = customNotes || notesText;
                    }
                    
                    return {
                        id: 'TXN-' + Date.now() + Math.random().toString(36).substr(2, 5).toUpperCase(),
                        date: targetDate,
                        time: time || undefined,
                        type: type,
                        category: category || (type === 'Transfer' ? 'Self Transfer' : 'Other'),
                        subCategory: subCategory || (type === 'Transfer' ? 'Own Accounts' : 'Other'),
                        secondSubCategory: secondSubCategory || undefined,
                        bank: type === 'Transfer' ? `${fromBank || bank} > ${toBank || ''}` : bank,
                        fromBank: type === 'Transfer' ? (fromBank || bank) : undefined,
                        toBank: type === 'Transfer' ? toBank : undefined,
                        amount: amount,
                        mode: mode || undefined,
                        person: person || undefined,
                        notes: finalNotes,
                        loanStart: loanStart || undefined,
                        loanEnd: loanEnd || undefined,
                        loanAmount: loanAmount || undefined,
                        frequency: frequency || undefined,
                        synced: false
                    };
                } catch (err) {
                    console.error(`Error parsing rule ${rule.name}:`, err);
                }
            }
        }

        // 2. Fallback to default hardcoded Paytm decoders if no rule matched
        let amount = 0;
        let type = 'Expense';
        let notes = '';
        let person = '';
        let category = 'Other';
        let subCategory = 'Other Spends';
        let bank = 'Paytm UPI';

        // Notification Regex patterns
        const paidRegex = /(?:Paid|Sent|Debited|Transferred)\s+(?:Rs\.?|INR)\s*([\d,]+(?:\.\d{2})?)\s+(?:to|at)\s+([^.\n]+)/i;
        const receivedRegex = /(?:Received|Added|Credited)\s+(?:Rs\.?|INR)\s*([\d,]+(?:\.\d{2})?)\s+(?:from|by)\s+([^.\n]+)/i;
        const addedWalletRegex = /(?:Added|Loaded)\s+(?:Rs\.?|INR)\s*([\d,]+(?:\.\d{2})?)\s+to\s+(?:Paytm\s+)?Wallet/i;
        const cashbackRegex = /Cashback\s+(?:of|received)\s+(?:Rs\.?|INR)\s*([\d,]+(?:\.\d{2})?)/i;

        let match;
        if ((match = combinedText.match(paidRegex))) {
            amount = parseFloat(match[1].replace(/,/g, ''));
            type = 'Expense';
            person = match[2].trim();
            notes = `Gmail Sync: Paid Rs. ${amount} to ${person}`;
            bank = 'Paytm UPI';
            
            // Smart classification
            const lowerPerson = person.toLowerCase();
            if (lowerPerson.includes('uber') || lowerPerson.includes('ola') || lowerPerson.includes('metro') || lowerPerson.includes('irctc')) {
                category = 'Transport';
                subCategory = 'Uber/Lyft';
            } else if (lowerPerson.includes('starbucks') || lowerPerson.includes('zomato') || lowerPerson.includes('swiggy') || lowerPerson.includes('rest') || lowerPerson.includes('food')) {
                category = 'Food';
                subCategory = 'Dining Out';
            } else if (lowerPerson.includes('amazon') || lowerPerson.includes('flipkart') || lowerPerson.includes('grocer') || lowerPerson.includes('mart')) {
                category = 'Food';
                subCategory = 'Groceries';
            } else {
                category = 'Expense';
                subCategory = 'Shopping';
            }
        } 
        else if ((match = combinedText.match(receivedRegex))) {
            amount = parseFloat(match[1].replace(/,/g, ''));
            type = 'Income';
            person = match[2].trim();
            notes = `Gmail Sync: Received Rs. ${amount} from ${person}`;
            category = 'Freelance';
            subCategory = 'Consulting';
            bank = 'Paytm UPI';
        }
        else if ((match = combinedText.match(addedWalletRegex))) {
            amount = parseFloat(match[1].replace(/,/g, ''));
            type = 'Income';
            notes = `Gmail Sync: Loaded Rs. ${amount} into Paytm Wallet`;
            category = 'Salary';
            subCategory = 'Monthly Base';
            bank = 'Paytm Wallet';
        }
        else if ((match = combinedText.match(cashbackRegex))) {
            amount = parseFloat(match[1].replace(/,/g, ''));
            type = 'Income';
            notes = `Gmail Sync: Cashback Rs. ${amount} received`;
            category = 'Income';
            subCategory = 'Freelance';
            bank = 'Paytm Wallet';
        }
        else {
            // General currency amount extractor backup (INR & USD)
            const generalAmtRegex = /(?:Rs\.?|INR|\$|USD)\s*([\d,]+(?:\.\d{2})?)/i;
            const amtMatch = combinedText.match(generalAmtRegex);
            if (amtMatch) {
                amount = parseFloat(amtMatch[1].replace(/,/g, ''));
                type = combinedText.toLowerCase().includes('received') ? 'Income' : 'Expense';
                notes = `Gmail Sync Alert: ${snippet.slice(0, 80)}...`;
                category = type === 'Income' ? 'Freelance' : 'Expense';
                subCategory = 'Other';
                bank = FinData.masters.banks[0]?.name || 'Primary Checking';
            } else {
                return null; // Could not parse, skip
            }
        }

        if (isNaN(amount) || amount <= 0) return null;

        return {
            id: 'TXN-' + Date.now() + Math.random().toString(36).substr(2, 5).toUpperCase(),
            date: transDate,
            type: type,
            category: category,
            subCategory: subCategory,
            bank: bank,
            amount: amount,
            person: person || undefined,
            notes: notes,
            synced: false
        };
    }

    async function executeGmailScan(accessToken) {
        const scanBtn = document.getElementById('scan-inbox-btn');
        if (!scanBtn) return;

        const originalHtml = scanBtn.innerHTML;
        scanBtn.disabled = true;
        scanBtn.innerHTML = '<i class="ri-loader-4-line ri-spin"></i> Scanning Inbox...';

        try {
            // Build dynamic query matching any active rule, or fall back to default paytm
            const rules = FinData.config.gmailSyncRules || [];
            const ruleQueries = rules.map(r => {
                let q = '';
                if (r.from) q += `from:${r.from}`;
                if (r.subject) q += ` subject:${r.subject}`;
                return q ? `(${q.trim()})` : '';
            }).filter(Boolean).join(' OR ');

            let queryPart = ruleQueries || 'from:alerts@paytm.com OR from:no-reply@paytm.com OR subject:Paytm';
            
            // Read target folder filter
            const folder = document.getElementById('gmail-folder')?.value?.trim() || FinData.config.gmailFolder || '';
            const folderAll = document.getElementById('gmail-folder-all')?.checked || FinData.config.gmailFolderAll || false;
            if (folder) {
                if (folderAll) {
                    queryPart = `label:${folder}`;
                } else {
                    queryPart = `label:${folder} (${queryPart})`;
                }
            }

            const query = encodeURIComponent(queryPart);
            const listUrl = `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${query}&maxResults=20`;

            const listResponse = await fetch(listUrl, {
                headers: { 'Authorization': `Bearer ${accessToken}` }
            });

            if (!listResponse.ok) {
                throw new Error(`Gmail API request failed with status ${listResponse.status}`);
            }

            const listData = await listResponse.json();
            const messages = listData.messages || [];

            if (messages.length === 0) {
                alert('Gmail Sync Complete: No recent Paytm transaction notification emails found.');
                return;
            }

            let newCount = 0;
            let duplicateCount = 0;
            const importedEmailIds = FinData.config.importedEmailIds || [];

            // Core database check
            ensurePaytmMasters();

            for (const msg of messages) {
                if (importedEmailIds.includes(msg.id)) {
                    duplicateCount++;
                    continue;
                }

                const msgUrl = `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}`;
                const msgResponse = await fetch(msgUrl, {
                    headers: { 'Authorization': `Bearer ${accessToken}` }
                });

                if (!msgResponse.ok) continue;
                const msgData = await msgResponse.json();

                const transaction = parsePaytmEmail(msgData);
                if (transaction) {
                    transaction.gmailMsgId = msg.id;
                    transaction.status = 'Unverified';
                    FinData.stagingTransactions.unshift(transaction); // Prepend to staging transactions
                    importedEmailIds.push(msg.id);
                    newCount++;
                } else {
                    // Safe skip if unparseable
                    importedEmailIds.push(msg.id);
                    duplicateCount++;
                }
            }

            if (newCount > 0) {
                FinData.saveConfig({ importedEmailIds });
                FinData.saveStagingTransactions();
                updateReviewBadge();
                
                alert(`Gmail Sync Complete!\n\nSuccessfully Staged: ${newCount} Paytm transactions for review\nSkipped / Duplicate: ${duplicateCount}`);
                
                // Switch focus to the To Review screen
                switchScreen('review');
                const reviewNavItem = Array.from(document.querySelectorAll('.nav-item')).find(item => item.getAttribute('data-screen') === 'review');
                if (reviewNavItem) {
                    document.querySelectorAll('.nav-item').forEach(nav => nav.classList.remove('active'));
                    reviewNavItem.classList.add('active');
                }
            } else {
                FinData.saveConfig({ importedEmailIds });
                alert(`Gmail Sync Complete: No new Paytm transactions found. (Skipped/Duplicates: ${duplicateCount})`);
            }

        } catch (error) {
            console.error('Gmail Sync Scanning Failed:', error);
            alert(`Gmail Sync Scanning Failed: ${error.message}`);
        } finally {
            scanBtn.disabled = false;
            scanBtn.innerHTML = originalHtml;
        }
    }

    async function scanGmailInbox() {
        const token = localStorage.getItem('gmail_access_token');
        const expiry = localStorage.getItem('gmail_token_expiry');
        const clientId = FinData.config.gmailClientId || document.getElementById('gmail-client-id')?.value;

        if (!token || !expiry || Date.now() > parseInt(expiry, 10)) {
            if (!clientId) {
                alert('Please enter your Google Web Client ID first.');
                return;
            }

            if (typeof google === 'undefined' || !google.accounts || !google.accounts.oauth2) {
                alert('Google Identity Services script is not loaded yet. Please wait a moment and try again.');
                return;
            }

            const tokenClient = google.accounts.oauth2.initTokenClient({
                client_id: clientId,
                scope: 'https://www.googleapis.com/auth/gmail.readonly',
                callback: async (tokenResponse) => {
                    if (tokenResponse && tokenResponse.access_token) {
                        localStorage.setItem('gmail_access_token', tokenResponse.access_token);
                        localStorage.setItem('gmail_token_expiry', Date.now() + tokenResponse.expires_in * 1000);
                        updateGmailSyncUI(true);
                        await executeGmailScan(tokenResponse.access_token);
                    } else {
                        alert('Gmail Authentication Cancelled or Failed.');
                    }
                }
            });
            tokenClient.requestAccessToken({ prompt: 'consent' });
            return;
        }

        await executeGmailScan(token);
    }

    function initGmailSync() {
        const connectBtn = document.getElementById('connect-gmail-btn');
        const scanBtn = document.getElementById('scan-inbox-btn');
        const clientIdInput = document.getElementById('gmail-client-id');
        const folderInput = document.getElementById('gmail-folder');
        const saveSettingsBtn = document.getElementById('save-settings-btn');
        const sheetUrlInput = document.getElementById('sheet-url');
        const driveFolderInput = document.getElementById('drive-folder');

        const folderAllInput = document.getElementById('gmail-folder-all');

        // Load persisted integration values
        if (clientIdInput) clientIdInput.value = FinData.config.gmailClientId || '';
        if (folderInput) folderInput.value = FinData.config.gmailFolder || '';
        if (folderAllInput) folderAllInput.checked = !!FinData.config.gmailFolderAll;
        if (sheetUrlInput) sheetUrlInput.value = FinData.config.sheetUrl || '';
        if (driveFolderInput) driveFolderInput.value = FinData.config.driveFolder || '';

        // Check token validity on load
        const token = localStorage.getItem('gmail_access_token');
        const expiry = localStorage.getItem('gmail_token_expiry');
        const isConnected = token && expiry && Date.now() < parseInt(expiry, 10);
        updateGmailSyncUI(isConnected);

        // Bind Integrations Save Button
        saveSettingsBtn?.addEventListener('click', () => {
            const sheetUrl = sheetUrlInput?.value || '';
            const driveFolder = driveFolderInput?.value || '';
            const gmailClientId = clientIdInput?.value || '';
            const gmailFolder = folderInput?.value || '';
            const gmailFolderAll = folderAllInput ? folderAllInput.checked : false;

            FinData.saveConfig({ sheetUrl, driveFolder, gmailClientId, gmailFolder, gmailFolderAll });

            // Sync with login screen Client ID input
            const loginClientIdInput = document.getElementById('auth-client-id-input');
            if (loginClientIdInput) {
                loginClientIdInput.value = gmailClientId;
            }

            // Re-initialize dynamic GIS Auth setup
            initGoogleAuth();

            alert('Cloud mapping and integration settings saved successfully!');
        });

        // Collapsible rules accordion toggle
        const toggleAccordion = document.getElementById('toggle-rules-accordion');
        const accordionContent = document.getElementById('rules-accordion-content');
        const accordionArrow = document.querySelector('.accordion-arrow');

        toggleAccordion?.addEventListener('click', () => {
            const isHidden = accordionContent.style.display === 'none' || accordionContent.classList.contains('hidden');
            if (isHidden) {
                accordionContent.style.display = 'flex';
                accordionContent.classList.remove('hidden');
                if (accordionArrow) accordionArrow.style.transform = 'rotate(180deg)';
                renderSyncRules();
            } else {
                accordionContent.style.display = 'none';
                accordionContent.classList.add('hidden');
                if (accordionArrow) accordionArrow.style.transform = 'rotate(0deg)';
            }
        });

        // Add custom parsing rule click binder
        const addRuleBtn = document.getElementById('add-sync-rule-btn');
        addRuleBtn?.addEventListener('click', () => {
            isAddingNewRule = true;
            selectedRuleId = null;
            renderSyncRules();
        });

        // Visually Browse and Import templates directory binder
        const toggleTemplatesBtn = document.getElementById('toggle-templates-btn');
        const templatesContainer = document.getElementById('templates-picker-container');
        toggleTemplatesBtn?.addEventListener('click', () => {
            const isHidden = templatesContainer.style.display === 'none';
            if (isHidden) {
                templatesContainer.style.display = 'block';
                toggleTemplatesBtn.innerHTML = '<i class="ri-mail-close-line"></i> Close Directory';
                renderTemplatesDirectory();
            } else {
                templatesContainer.style.display = 'none';
                toggleTemplatesBtn.innerHTML = '<i class="ri-mail-open-line"></i> Templates Directory';
            }
        });

        // Sandbox Run dry run tester binder
        const sandboxRunBtn = document.getElementById('sandbox-run-btn');
        sandboxRunBtn?.addEventListener('click', () => {
            runRuleSandboxTest();
        });

        // Live re-run when rule selector changes
        const sandboxRuleSelectorEl = document.getElementById('sandbox-rule-selector');
        sandboxRuleSelectorEl?.addEventListener('change', () => {
            runRuleSandboxTest();
        });

        // Live re-run as user types in the email text box
        const sandboxEmailTextEl = document.getElementById('sandbox-email-text');
        sandboxEmailTextEl?.addEventListener('input', () => {
            runRuleSandboxTest();
        });

        // Google Web Client ID Guides Toggle Binding
        const authGuideToggle = document.getElementById('auth-toggle-guide-btn');
        const authGuideContent = document.getElementById('auth-guide-content');
        authGuideToggle?.addEventListener('click', () => {
            const isHidden = authGuideContent.style.display === 'none' || authGuideContent.classList.contains('hidden');
            if (isHidden) {
                authGuideContent.style.display = 'block';
                authGuideContent.classList.remove('hidden');
            } else {
                authGuideContent.style.display = 'none';
                authGuideContent.classList.add('hidden');
            }
        });

        const guideToggle = document.getElementById('toggle-guide-btn');
        const guideContent = document.getElementById('guide-content');
        guideToggle?.addEventListener('click', () => {
            const isHidden = guideContent.style.display === 'none' || guideContent.classList.contains('hidden');
            if (isHidden) {
                guideContent.style.display = 'block';
                guideContent.classList.remove('hidden');
            } else {
                guideContent.style.display = 'none';
                guideContent.classList.add('hidden');
            }
        });

        // Bind Connect Account click
        connectBtn?.addEventListener('click', () => {
            const token = localStorage.getItem('gmail_access_token');
            const expiry = localStorage.getItem('gmail_token_expiry');
            const activeConnection = token && expiry && Date.now() < parseInt(expiry, 10);

            if (activeConnection) {
                localStorage.removeItem('gmail_access_token');
                localStorage.removeItem('gmail_token_expiry');
                updateGmailSyncUI(false);
                alert('Gmail account disconnected successfully.');
            } else {
                const clientId = clientIdInput?.value || FinData.config.gmailClientId;
                if (!clientId) {
                    alert('Please enter your Google Web Client ID first.');
                    return;
                }

                if (typeof google === 'undefined' || !google.accounts || !google.accounts.oauth2) {
                    alert('Google Identity Services script is not loaded yet. Please wait a moment and try again.');
                    return;
                }

                const tokenClient = google.accounts.oauth2.initTokenClient({
                    client_id: clientId,
                    scope: 'https://www.googleapis.com/auth/gmail.readonly',
                    callback: (tokenResponse) => {
                        if (tokenResponse && tokenResponse.access_token) {
                            localStorage.setItem('gmail_access_token', tokenResponse.access_token);
                            localStorage.setItem('gmail_token_expiry', Date.now() + tokenResponse.expires_in * 1000);
                            updateGmailSyncUI(true);
                            alert('Gmail account connected successfully!');
                        } else {
                            alert('Gmail Authentication Failed.');
                        }
                    }
                });
                tokenClient.requestAccessToken({ prompt: 'consent' });
            }
        });

        // Bind Scan Inbox click
        // Bind Scan Inbox click
        scanBtn?.addEventListener('click', () => {
            scanGmailInbox();
        });
        // Initialize staging badge count on load
        updateReviewBadge();

        // Initialize staging batch button click handlers
        initStagingReviewControls();
    }

    function getLiveRuleFromForm(detailCard) {
        const ruleNameInput = detailCard.querySelector('#rule-detail-name');
        const ruleFromInput = detailCard.querySelector('#rule-detail-from');
        const ruleSubjectInput = detailCard.querySelector('#rule-detail-subject');
        const ruleTypeSelect = detailCard.querySelector('#rule-detail-type');
        const ruleBankSelect = detailCard.querySelector('#rule-detail-bank');
        const ruleCategorySelect = detailCard.querySelector('#rule-detail-category');
        const ruleSubCategorySelect = detailCard.querySelector('#rule-detail-subcategory');
        const easyModeBtn = detailCard.querySelector('#rule-detail-mode-easy');
        
        const isEasy = easyModeBtn?.classList.contains('btn-primary');
        
        const liveRule = {
            id: selectedRuleId || 'RULE-DRAFT',
            name: ruleNameInput?.value.trim() || 'Testing Rule',
            from: ruleFromInput?.value.trim() || '',
            subject: ruleSubjectInput?.value.trim() || '',
            type: ruleTypeSelect?.value || 'Expense',
            defaultBank: ruleBankSelect?.value || '',
            defaultCategory: ruleCategorySelect?.value || '',
            defaultSubCategory: ruleSubCategorySelect?.value || '',
            easyMode: isEasy,
            placeholders: []
        };
        
        if (isEasy) {
            liveRule.templateText = detailCard.querySelector('#rule-detail-templateText')?.value || '';
        } else {
            liveRule.amountRegex = detailCard.querySelector('#rule-detail-amountRegex')?.value.trim() || '';
            liveRule.notesRegex = detailCard.querySelector('#rule-detail-notesRegex')?.value.trim() || '';
        }
        return liveRule;
    }

    function updateSandboxRuleSelector() {
        const selector = document.getElementById('sandbox-rule-selector');
        if (!selector) return;

        const rules = FinData.config.gmailSyncRules || [];
        const currentVal = selector.value || 'auto';

        let optionsHtml = '<option value="auto">⚡ Auto-Detect (Scan All Rules)</option>';
        
        if (isAddingNewRule) {
            optionsHtml += '<option value="draft">Draft: New Custom Rule (Active)</option>';
        }

        rules.forEach(rule => {
            optionsHtml += `<option value="${rule.id}">Rule: ${rule.name}</option>`;
        });

        selector.innerHTML = optionsHtml;

        // Restore selection
        if (isAddingNewRule) {
            selector.value = 'draft';
        } else if (selectedRuleId && rules.some(r => r.id === selectedRuleId)) {
            selector.value = selectedRuleId;
        } else {
            if (rules.some(r => r.id === currentVal) || currentVal === 'auto') {
                selector.value = currentVal;
            } else {
                selector.value = 'auto';
            }
        }
    }

    function renderSyncRules() {
        const container = document.getElementById('sync-rules-container');
        if (!container) return;

        updateSandboxRuleSelector();

        const rules = FinData.config.gmailSyncRules || [];
        
        // Update rule count label in index.html
        const rulesCount = document.getElementById('sync-rules-count');
        if (rulesCount) {
            rulesCount.innerText = `${rules.length} Rule${rules.length === 1 ? '' : 's'} Active`;
        }

        // Set default selection if none exists and we aren't adding a new rule
        if (!selectedRuleId && rules.length > 0 && !isAddingNewRule) {
            selectedRuleId = rules[0].id;
        }

        // 1. Clear container and create grid
        container.innerHTML = '';
        const grid = document.createElement('div');
        grid.className = 'rules-list-detail-grid';

        // 2. Render Sidebar list
        const sidebar = document.createElement('div');
        sidebar.className = 'rules-sidebar-list';
        
        let sidebarItemsHtml = `<div class="rules-sidebar-title"><i class="ri-list-check"></i> Active Rules</div>`;
        if (rules.length === 0) {
            sidebarItemsHtml += `<div style="text-align: center; font-size: 11px; padding: 15px; color: var(--text-muted); font-style: italic;">No rules active</div>`;
        } else {
            rules.forEach(rule => {
                const isActive = rule.id === selectedRuleId && !isAddingNewRule;
                sidebarItemsHtml += `
                    <div class="rules-sidebar-item ${isActive ? 'active' : ''}" data-rule-id="${rule.id}">
                        <div class="rules-sidebar-item-header">
                            <span class="rules-sidebar-item-name" title="${rule.name}">${rule.name}</span>
                            <span class="badge-${rule.type.toLowerCase()}" style="font-size: 8px; padding: 1px 4px; border-radius: 4px; font-weight: bold; text-transform: uppercase;">${rule.type}</span>
                        </div>
                        <div class="rules-sidebar-item-sub">
                            <span>Bank: ${rule.defaultBank || 'Any'}</span>
                        </div>
                    </div>
                `;
            });
        }
        
        sidebarItemsHtml += `
            <button type="button" class="btn btn-outline btn-sm rules-sidebar-add-btn" id="sidebar-add-rule-btn" style="width: 100%; margin-top: 10px;">
                <i class="ri-add-line"></i> Add Custom Rule
            </button>
        `;
        sidebar.innerHTML = sidebarItemsHtml;
        grid.appendChild(sidebar);

        // 3. Render Detail Form Card
        const detailCard = document.createElement('div');
        detailCard.className = 'rules-detail-view-card';

        let activeRule = null;
        if (isAddingNewRule) {
            // Render draft blank rule
            activeRule = {
                id: 'RULE-' + Date.now(),
                name: 'New Custom Rule',
                from: '',
                subject: '',
                type: 'Expense',
                amountRegex: '(?:Paid|Debited|Sent|spent)\\s+(?:Rs\\.?|INR|\\$)\\s*([\\d,]+(?:\\.\\d{2})?)',
                notesRegex: 'to\\s+([^.\\n]+)',
                defaultBank: FinData.masters.banks[0]?.name || '',
                defaultCategory: FinData.masters.categories.Expense[0]?.name || 'Food',
                defaultSubCategory: FinData.masters.categories.Expense[0]?.subCategories[0] || 'Groceries',
                notesTemplate: 'Gmail Sync: {payee}',
                placeholders: [],
                easyMode: true,
                templateText: ''
            };
        } else if (selectedRuleId) {
            activeRule = rules.find(r => r.id === selectedRuleId);
        }

        if (!activeRule) {
            detailCard.innerHTML = `
                <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; color: var(--text-muted); text-align: center; padding: 40px;">
                    <i class="ri-equalizer-line" style="font-size: 36px; color: var(--text-muted); margin-bottom: 12px;"></i>
                    <h4 style="margin-bottom: 6px; color: var(--text-main);">No Rule Selected</h4>
                    <p style="font-size: 12px; max-width: 250px;">Select an existing rule from the sidebar, or click "Add Custom Rule" to build a new one.</p>
                </div>
            `;
            grid.appendChild(detailCard);
            container.appendChild(grid);
            
            // Wire Sidebar click handlers
            wireSidebarListeners(container, sidebar);
            return;
        }

        // Prepare forms and options
        const bankOptions = FinData.masters.banks.map(b => 
            `<option value="${b.name}" ${b.name === activeRule.defaultBank ? 'selected' : ''}>${b.name}</option>`
        ).join('');

        let typeCategories = FinData.masters.categories[activeRule.type] || [];
        const categoryOptions = typeCategories.map(c => 
            `<option value="${c.name}" ${c.name === activeRule.defaultCategory ? 'selected' : ''}>${c.name}</option>`
        ).join('');

        const activeCat = typeCategories.find(c => c.name === activeRule.defaultCategory) || typeCategories[0];
        const subCategories = activeCat ? (activeCat.subCategories || []) : [];
        const subCategoryOptions = subCategories.map(sc => 
            `<option value="${sc}" ${sc === activeRule.defaultSubCategory ? 'selected' : ''}>${sc}</option>`
        ).join('');

        detailCard.innerHTML = `
            <!-- Header Section -->
            <div class="rule-header-facelift" style="padding-bottom: 10px; margin-bottom: 10px;">
                <div class="rule-title-wrapper">
                    <i class="ri-settings-5-line" style="color: var(--accent); font-size: 16px;"></i>
                    <input type="text" id="rule-detail-name" class="rule-title-input" value="${activeRule.name || ''}" placeholder="Rule Name" style="width: 80%;">
                </div>
                <div style="display: flex; align-items: center; gap: 6px;">
                    <button type="button" class="btn btn-sm rule-mode-btn easy-mode-toggle ${activeRule.easyMode !== false ? 'btn-primary' : 'btn-outline'}" id="rule-detail-mode-easy" style="padding: 2px 8px; font-size: 10px; font-weight: 600; border-radius: 4px; height: auto;">
                        <i class="ri-magic-line"></i> Easy Mode
                    </button>
                    <button type="button" class="btn btn-sm rule-mode-btn regex-mode-toggle ${activeRule.easyMode === false ? 'btn-primary' : 'btn-outline'}" id="rule-detail-mode-regex" style="padding: 2px 8px; font-size: 10px; font-weight: 600; border-radius: 4px; height: auto;">
                        <i class="ri-braces-line"></i> Regex Mode
                    </button>
                </div>
            </div>

            <!-- Form Grid -->
            <div class="rule-grid-facelift" style="grid-template-columns: 1fr 1fr; gap: 16px; margin-top: 5px;">
                
                <!-- Column 1: Trigger & Target Mappings -->
                <div class="rule-column-facelift" style="gap: 10px;">
                    <div class="rule-column-title" style="margin-bottom: 4px;">
                        <i class="ri-filter-2-line"></i> Trigger Criteria
                    </div>
                    <div class="form-group" style="margin-bottom: 8px;">
                        <label>From (Senders, comma-separated)</label>
                        <input type="text" id="rule-detail-from" value="${activeRule.from || ''}" placeholder="e.g. alerts@paytm.com, upi@paytm.com">
                    </div>
                    <div class="form-group" style="margin-bottom: 8px;">
                        <label>Subject (Keywords, comma-separated)</label>
                        <input type="text" id="rule-detail-subject" value="${activeRule.subject || ''}" placeholder="e.g. Paytm, transaction, alert">
                    </div>

                    <div class="rule-column-title" style="margin-top: 10px; margin-bottom: 4px;">
                        <i class="ri-database-line"></i> Target Mappings
                    </div>
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 8px;">
                        <div class="form-group" style="margin-bottom: 0;">
                            <label>Txn Type</label>
                            <select id="rule-detail-type" style="padding: 5px 8px; font-size: 12px;">
                                <option value="Expense" ${activeRule.type === 'Expense' ? 'selected' : ''}>Expense</option>
                                <option value="Income" ${activeRule.type === 'Income' ? 'selected' : ''}>Income</option>
                                <option value="Investment" ${activeRule.type === 'Investment' ? 'selected' : ''}>Investment</option>
                                <option value="Ledger" ${activeRule.type === 'Ledger' ? 'selected' : ''}>Ledger</option>
                                <option value="Transfer" ${activeRule.type === 'Transfer' ? 'selected' : ''}>Fund Transfer Self</option>
                            </select>
                        </div>
                        <div class="form-group" style="margin-bottom: 0;">
                            <label>Default Bank</label>
                            <select id="rule-detail-bank" style="padding: 5px 8px; font-size: 12px;">
                                ${bankOptions}
                            </select>
                        </div>
                    </div>
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 0;">
                        <div class="form-group" style="margin-bottom: 0;">
                            <label>Category</label>
                            <select id="rule-detail-category" style="padding: 5px 8px; font-size: 12px;">
                                ${categoryOptions}
                            </select>
                        </div>
                        <div class="form-group" style="margin-bottom: 0;">
                            <label>Sub-category</label>
                            <select id="rule-detail-subcategory" style="padding: 5px 8px; font-size: 12px;">
                                ${subCategoryOptions}
                            </select>
                        </div>
                    </div>
                </div>

                <!-- Column 2: Easy Mapping or Regex Pattern -->
                <div class="rule-column-facelift" style="gap: 10px;">
                    <!-- A. Easy Mode Template Editor -->
                    <div class="easy-template-panel" style="display: ${activeRule.easyMode !== false ? 'flex' : 'none'}; flex-direction: column; gap: 8px;">
                        <div class="rule-column-title">
                            <i class="ri-magic-line"></i> Easy Mapping Template
                        </div>
                        <div class="form-group" style="margin-bottom: 0;">
                            <label style="font-size: 10px; margin-bottom: 3px; display: block; color: var(--text-muted);">
                                <span>Paste Sample Email & wrap values in &lt;&gt;</span>
                            </label>
                            <textarea id="rule-detail-templateText" rows="3" style="background: rgba(0,0,0,0.25); border: 1px solid var(--glass-border); border-radius: 6px; padding: 6px 10px; color: var(--text-main); font-size: 12px; font-family: monospace; width: 100%; resize: vertical;" placeholder="e.g.: You made a payment of Rs. <1,000.00> to <Receiver>...">${activeRule.templateText || ''}</textarea>
                        </div>
                        <!-- Placeholders list -->
                        <div class="template-placeholders-list" id="rule-detail-placeholders-list" style="display: flex; flex-direction: column; gap: 6px; margin-top: 4px; max-height: 180px; overflow-y: auto;">
                            <!-- Placeholders will be rendered dynamically here -->
                        </div>
                    </div>

                    <!-- B. Advanced Regex Editor -->
                    <div class="regex-template-panel" style="display: ${activeRule.easyMode === false ? 'flex' : 'none'}; flex-direction: column; gap: 8px;">
                        <div class="rule-column-title">
                            <i class="ri-braces-line"></i> Regex Extraction
                        </div>
                        <div class="form-group" style="margin-bottom: 0;">
                            <label>Amount Pattern</label>
                            <input type="text" id="rule-detail-amountRegex" value="${activeRule.amountRegex || ''}" style="font-family: monospace; font-size: 11px;" placeholder="Amount regex pattern">
                        </div>
                        <div class="form-group" style="margin-bottom: 0;">
                            <label>Notes / Payee Pattern</label>
                            <input type="text" id="rule-detail-notesRegex" value="${activeRule.notesRegex || ''}" style="font-family: monospace; font-size: 11px;" placeholder="Notes regex pattern">
                        </div>
                    </div>
                </div>

            </div>

            <!-- Action Buttons Footer -->
            <div style="display: flex; justify-content: flex-end; gap: 10px; margin-top: 15px; border-top: 1px solid var(--glass-border); padding-top: 12px;">
                ${isAddingNewRule ? `
                    <button type="button" class="btn btn-success" id="rule-detail-save-btn" style="min-width: 120px;">
                        <i class="ri-save-line"></i> Save Rule
                    </button>
                    <button type="button" class="btn btn-outline" id="rule-detail-cancel-btn">
                        Cancel
                    </button>
                ` : `
                    <button type="button" class="btn btn-primary" id="rule-detail-modify-btn" style="min-width: 120px;">
                        <i class="ri-checkbox-circle-line"></i> Modify Rule
                    </button>
                `}
            </div>
        `;

        grid.appendChild(detailCard);
        container.appendChild(grid);

        // 4. Wire detailed form listeners and placeholder mapping renderers!
        wireDetailViewListeners(activeRule, rules);

        // 5. Wire Sidebar click handlers
        wireSidebarListeners(container, sidebar);
    }

    function wireSidebarListeners(container, sidebar) {
        // Handle Sidebar Rule click
        sidebar.querySelectorAll('.rules-sidebar-item').forEach(item => {
            item.addEventListener('click', (e) => {
                const ruleId = item.getAttribute('data-rule-id');
                selectedRuleId = ruleId;
                isAddingNewRule = false;
                renderSyncRules();
                // Select rule in sandbox
                runRuleSandboxTest();
            });
        });

        // Handle Sidebar Add Rule click
        const sidebarAddBtn = container.querySelector('#sidebar-add-rule-btn');
        sidebarAddBtn?.addEventListener('click', () => {
            isAddingNewRule = true;
            selectedRuleId = null;
            renderSyncRules();
        });
    }

    function wireDetailViewListeners(activeRule, rules) {
        const detailCard = document.querySelector('.rules-detail-view-card');
        if (!detailCard) return;

        // Mode toggles
        const easyModeBtn = detailCard.querySelector('#rule-detail-mode-easy');
        const regexModeBtn = detailCard.querySelector('#rule-detail-mode-regex');
        const easyTemplatePanel = detailCard.querySelector('.easy-template-panel');
        const regexTemplatePanel = detailCard.querySelector('.regex-template-panel');

        const toggleMode = (enableEasy) => {
            activeRule.easyMode = enableEasy;
            if (enableEasy) {
                easyModeBtn.classList.remove('btn-outline');
                easyModeBtn.classList.add('btn-primary');
                regexModeBtn.classList.remove('btn-primary');
                regexModeBtn.classList.add('btn-outline');
                easyTemplatePanel.style.display = 'flex';
                regexTemplatePanel.style.display = 'none';
                renderTemplatePlaceholdersInDetail();
            } else {
                easyModeBtn.classList.remove('btn-primary');
                easyModeBtn.classList.add('btn-outline');
                regexModeBtn.classList.remove('btn-outline');
                regexModeBtn.classList.add('btn-primary');
                easyTemplatePanel.style.display = 'none';
                regexTemplatePanel.style.display = 'flex';
            }
        };

        easyModeBtn?.addEventListener('click', () => toggleMode(true));
        regexModeBtn?.addEventListener('click', () => toggleMode(false));

        // Category options changer (dynamic Sub-category dropdown based on Category selected)
        const typeSelect = detailCard.querySelector('#rule-detail-type');
        const bankSelect = detailCard.querySelector('#rule-detail-bank');
        const categorySelect = detailCard.querySelector('#rule-detail-category');
        const subCategorySelect = detailCard.querySelector('#rule-detail-subcategory');

        typeSelect?.addEventListener('change', () => {
            const currentType = typeSelect.value;
            let typeCats = FinData.masters.categories[currentType] || [];
            categorySelect.innerHTML = typeCats.map(c => `<option value="${c.name}">${c.name}</option>`).join('');
            
            // Trigger sub-category reload
            categorySelect.dispatchEvent(new Event('change'));
        });

        categorySelect?.addEventListener('change', () => {
            const currentType = typeSelect.value;
            let typeCats = FinData.masters.categories[currentType] || [];
            const activeCatName = categorySelect.value;
            const activeCat = typeCats.find(c => c.name === activeCatName) || typeCats[0];
            const subCategories = activeCat ? (activeCat.subCategories || []) : [];
            subCategorySelect.innerHTML = subCategories.map(sc => `<option value="${sc}">${sc}</option>`).join('');
        });

        // Template placeholders renderer for Easy Mode
        const templateTextInput = detailCard.querySelector('#rule-detail-templateText');
        const placeholdersList = detailCard.querySelector('#rule-detail-placeholders-list');

        const renderTemplatePlaceholdersInDetail = () => {
            if (!placeholdersList) return;
            const text = templateTextInput.value || "";
            
            const placeholders = [];
            const mappedRegex = /\(([^<]+)<([^>=]+)>(?:=<([^>]+)>)?\)/g;
            let match;
            
            const mappedPositions = [];
            while ((match = mappedRegex.exec(text)) !== null) {
                placeholders.push({
                    type: 'mapped',
                    full: match[0],
                    fieldName: match[1].trim(),
                    value: match[2].trim(),
                    mappedValue: match[3] ? match[3].trim() : null,
                    index: match.index
                });
                mappedPositions.push({ start: match.index, end: match.index + match[0].length });
            }
            
            const unmappedRegex = /<([^>]+)>/g;
            while ((match = unmappedRegex.exec(text)) !== null) {
                const isInsideMapped = mappedPositions.some(pos => match.index >= pos.start && match.index < pos.end);
                if (!isInsideMapped) {
                    placeholders.push({
                        type: 'unmapped',
                        full: match[0],
                        fieldName: '',
                        value: match[1].trim(),
                        index: match.index
                    });
                }
            }
            
            placeholders.sort((a, b) => a.index - b.index);

            if (placeholders.length === 0) {
                placeholdersList.innerHTML = `
                    <div style="text-align: center; padding: 10px; color: var(--text-muted); font-size: 11px; background: rgba(255, 255, 255, 0.005); border: 1px dashed rgba(255, 255, 255, 0.03); border-radius: 6px;">
                        No placeholders found. Wrap any text to extract inside angle brackets, e.g. <strong>&lt;value&gt;</strong>.
                    </div>
                `;
                return;
            }

            placeholdersList.innerHTML = '';
            placeholders.forEach((ph) => {
                const row = document.createElement('div');
                row.className = 'template-mapping-row';
                row.style.cssText = 'display: grid; grid-template-columns: 1fr 1.2fr auto; gap: 8px; align-items: center; background: rgba(0, 0, 0, 0.15); padding: 6px 10px; border-radius: 6px; border: 1px solid rgba(255,255,255,0.03); margin-top: 4px;';
                
                const isAmount = ph.fieldName.toLowerCase() === 'amount';
                const isPerson = ['payee', 'receiver', 'person'].includes(ph.fieldName.toLowerCase());
                const isBank = ph.fieldName.toLowerCase() === 'bank';
                const isFromBank = ph.fieldName.toLowerCase() === 'frombank';
                const isToBank = ph.fieldName.toLowerCase() === 'tobank';
                const isCategory = ph.fieldName.toLowerCase() === 'category';
                const isSubCategory = ph.fieldName.toLowerCase() === 'subcategory';
                const isSecondSubCategory = ph.fieldName.toLowerCase() === 'secondsubcategory';
                const isDate = ph.fieldName.toLowerCase() === 'date';
                const isTime = ph.fieldName.toLowerCase() === 'time';
                const isMode = ph.fieldName.toLowerCase() === 'mode';
                const isNotes = ph.fieldName.toLowerCase() === 'notes';
                const isLoanStart = ph.fieldName.toLowerCase() === 'loanstart';
                const isLoanEnd = ph.fieldName.toLowerCase() === 'loanend';
                const isLoanAmount = ph.fieldName.toLowerCase() === 'loanamount';
                const isFrequency = ph.fieldName.toLowerCase() === 'frequency';

                const knownFields = [
                    'amount', 'payee', 'receiver', 'person', 'bank', 'frombank', 'tobank',
                    'category', 'subcategory', 'secondsubcategory', 'date', 'time', 'mode', 'notes',
                    'loanstart', 'loanend', 'loanamount', 'frequency'
                ];
                const isCustom = ph.type === 'mapped' && !knownFields.includes(ph.fieldName.toLowerCase());

                row.innerHTML = `
                    <div style="min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                        <span style="font-size: 10px; color: var(--text-muted); text-transform: uppercase;">Value</span>
                        <div style="color: var(--accent); font-family: monospace; font-size: 12px; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${ph.value}">"${ph.value}"</div>
                    </div>
                    <div>
                        <select class="mapping-field-select" style="font-size: 11px; padding: 4px 6px; background: rgba(0,0,0,0.3); border: 1px solid var(--glass-border); border-radius: 4px; color: var(--text-main); width: 100%; height: auto;">
                            <option value="" ${ph.type === 'unmapped' ? 'selected' : ''}>❌ Unmapped (Select Field)</option>
                            <option value="amount" ${isAmount ? 'selected' : ''}>Map: Amount</option>
                            <option value="person" ${isPerson ? 'selected' : ''}>Map: Payee / Receiver</option>
                            <option value="bank" ${isBank ? 'selected' : ''}>Map: Source/Target Account (Bank)</option>
                            <option value="fromBank" ${isFromBank ? 'selected' : ''}>Map: From Account (Transfer Source)</option>
                            <option value="toBank" ${isToBank ? 'selected' : ''}>Map: To Account (Transfer Destination)</option>
                            <option value="category" ${isCategory ? 'selected' : ''}>Map: Category Head</option>
                            <option value="subCategory" ${isSubCategory ? 'selected' : ''}>Map: Category</option>
                            <option value="secondSubCategory" ${isSecondSubCategory ? 'selected' : ''}>Map: Sub-category</option>
                            <option value="date" ${isDate ? 'selected' : ''}>Map: Date</option>
                            <option value="time" ${isTime ? 'selected' : ''}>Map: Time</option>
                            <option value="mode" ${isMode ? 'selected' : ''}>Map: Transaction Mode</option>
                            <option value="notes" ${isNotes ? 'selected' : ''}>Map: Description/Notes</option>
                            <option value="loanStart" ${isLoanStart ? 'selected' : ''}>Map: Loan Start Date</option>
                            <option value="loanEnd" ${isLoanEnd ? 'selected' : ''}>Map: Loan End Date</option>
                            <option value="loanAmount" ${isLoanAmount ? 'selected' : ''}>Map: Loan Amount</option>
                            <option value="frequency" ${isFrequency ? 'selected' : ''}>Map: Frequency</option>
                            <option value="custom" ${isCustom ? 'selected' : ''}>Map: Custom Placeholder...</option>
                        </select>
                        <input type="text" class="custom-field-name-input" value="${isCustom ? ph.fieldName : ''}" placeholder="Enter variable name" style="display: ${isCustom ? 'block' : 'none'}; font-size: 10px; padding: 3px 6px; background: rgba(0,0,0,0.25); border: 1px solid var(--glass-border); border-radius: 4px; color: var(--text-main); margin-top: 4px; width: 100%;">
                    </div>
                    <div>
                        <button type="button" class="btn btn-outline btn-sm remove-mapping-brackets-btn" style="border: none; color: var(--text-muted); background: rgba(255,255,255,0.02); padding: 4px 6px; font-size: 10px; height: auto;" title="Remove extraction brackets">
                            Revert
                        </button>
                    </div>
                `;

                const select = row.querySelector('.mapping-field-select');
                const customInput = row.querySelector('.custom-field-name-input');
                const revertBtn = row.querySelector('.remove-mapping-brackets-btn');

                select.addEventListener('change', (e) => {
                    const val = e.target.value;
                    let newPhText = "";
                    
                    if (val === "custom") {
                        customInput.style.display = 'block';
                        customInput.focus();
                        return;
                    } else {
                        customInput.style.display = 'none';
                    }
                    
                    const suffix = ph.mappedValue ? `=<${ph.mappedValue}>` : '';
                    if (val === "") {
                        newPhText = `<${ph.value}>`;
                    } else {
                        newPhText = `(${val}<${ph.value}>${suffix})`;
                    }
                    
                    const currentText = templateTextInput.value;
                    const before = currentText.slice(0, ph.index);
                    const after = currentText.slice(ph.index + ph.full.length);
                    templateTextInput.value = before + newPhText + after;
                    
                    renderTemplatePlaceholdersInDetail();
                    runRuleSandboxTest();
                });

                customInput.addEventListener('blur', () => {
                    const fieldNameText = customInput.value.trim();
                    if (!fieldNameText) return;
                    
                    const suffix = ph.mappedValue ? `=<${ph.mappedValue}>` : '';
                    const newPhText = `(${fieldNameText}<${ph.value}>${suffix})`;
                    
                    const currentText = templateTextInput.value;
                    const before = currentText.slice(0, ph.index);
                    const after = currentText.slice(ph.index + ph.full.length);
                    templateTextInput.value = before + newPhText + after;
                    
                    renderTemplatePlaceholdersInDetail();
                    runRuleSandboxTest();
                });

                customInput.addEventListener('keypress', (e) => {
                    if (e.key === 'Enter') {
                        customInput.blur();
                    }
                });

                revertBtn.addEventListener('click', () => {
                    const currentText = templateTextInput.value;
                    const before = currentText.slice(0, ph.index);
                    const after = currentText.slice(ph.index + ph.full.length);
                    templateTextInput.value = before + ph.value + after;
                    
                    renderTemplatePlaceholdersInDetail();
                    runRuleSandboxTest();
                });

                placeholdersList.appendChild(row);
            });
        };

        // Render placeholders on load
        if (activeRule.easyMode !== false) {
            renderTemplatePlaceholdersInDetail();
        }

        // Wire template text input
        templateTextInput?.addEventListener('input', () => {
            renderTemplatePlaceholdersInDetail();
            runRuleSandboxTest();
        });

        // Save Rule Click Handler (For New Rule Draft)
        const saveBtn = detailCard.querySelector('#rule-detail-save-btn');
        saveBtn?.addEventListener('click', () => {
            const ruleNameInput = detailCard.querySelector('#rule-detail-name');
            const ruleFromInput = detailCard.querySelector('#rule-detail-from');
            const ruleSubjectInput = detailCard.querySelector('#rule-detail-subject');
            const ruleTypeSelect = detailCard.querySelector('#rule-detail-type');
            const ruleBankSelect = detailCard.querySelector('#rule-detail-bank');
            const ruleCategorySelect = detailCard.querySelector('#rule-detail-category');
            const ruleSubCategorySelect = detailCard.querySelector('#rule-detail-subcategory');
            
            const name = ruleNameInput?.value.trim() || 'New Custom Rule';
            const from = ruleFromInput?.value.trim() || '';
            const subject = ruleSubjectInput?.value.trim() || '';
            const type = ruleTypeSelect?.value || 'Expense';
            const defaultBank = ruleBankSelect?.value || '';
            const defaultCategory = ruleCategorySelect?.value || '';
            const defaultSubCategory = ruleSubCategorySelect?.value || '';
            
            const isEasy = activeRule.easyMode !== false;
            
            let finalRule = {
                id: activeRule.id,
                name: name,
                from: from,
                subject: subject,
                type: type,
                defaultBank: defaultBank,
                defaultCategory: defaultCategory,
                defaultSubCategory: defaultSubCategory,
                easyMode: isEasy
            };
            
            if (isEasy) {
                const templateText = detailCard.querySelector('#rule-detail-templateText')?.value.trim() || '';
                finalRule.templateText = templateText;
                finalRule.amountRegex = '(?:Paid|Debited|Sent|spent)\\s+(?:Rs\\.?|INR|\\$)\\s*([\\d,]+(?:\\.\\d{2})?)';
                finalRule.notesRegex = 'to\\s+([^.\\n]+)';
                finalRule.notesTemplate = 'Gmail Sync: {payee}';
                finalRule.placeholders = [];
            } else {
                const amountRegex = detailCard.querySelector('#rule-detail-amountRegex')?.value.trim() || '';
                const notesRegex = detailCard.querySelector('#rule-detail-notesRegex')?.value.trim() || '';
                
                finalRule.amountRegex = amountRegex;
                finalRule.notesRegex = notesRegex;
                finalRule.notesTemplate = 'Gmail Sync: {payee}';
                finalRule.placeholders = [];
            }
            
            FinData.config.gmailSyncRules = FinData.config.gmailSyncRules || [];
            FinData.config.gmailSyncRules.push(finalRule);
            FinData.saveConfig({ gmailSyncRules: FinData.config.gmailSyncRules });
            
            isAddingNewRule = false;
            selectedRuleId = finalRule.id; // select the newly saved rule
            renderSyncRules();
            runRuleSandboxTest();
            alert(`Rule "${name}" successfully saved!`);
        });

        // Modify Rule Click Handler (For Existing Rule)
        const modifyBtn = detailCard.querySelector('#rule-detail-modify-btn');
        modifyBtn?.addEventListener('click', () => {
            const ruleNameInput = detailCard.querySelector('#rule-detail-name');
            const ruleFromInput = detailCard.querySelector('#rule-detail-from');
            const ruleSubjectInput = detailCard.querySelector('#rule-detail-subject');
            const ruleTypeSelect = detailCard.querySelector('#rule-detail-type');
            const ruleBankSelect = detailCard.querySelector('#rule-detail-bank');
            const ruleCategorySelect = detailCard.querySelector('#rule-detail-category');
            const ruleSubCategorySelect = detailCard.querySelector('#rule-detail-subcategory');
            
            const name = ruleNameInput?.value.trim() || 'Custom Rule';
            const from = ruleFromInput?.value.trim() || '';
            const subject = ruleSubjectInput?.value.trim() || '';
            const type = ruleTypeSelect?.value || 'Expense';
            const defaultBank = ruleBankSelect?.value || '';
            const defaultCategory = ruleCategorySelect?.value || '';
            const defaultSubCategory = ruleSubCategorySelect?.value || '';
            
            const isEasy = activeRule.easyMode !== false;
            
            const rulesList = FinData.config.gmailSyncRules || [];
            const ruleIndex = rulesList.findIndex(r => r.id === activeRule.id);
            if (ruleIndex === -1) {
                alert("Error: Rule not found!");
                return;
            }
            
            const updatedRule = {
                id: activeRule.id,
                name: name,
                from: from,
                subject: subject,
                type: type,
                defaultBank: defaultBank,
                defaultCategory: defaultCategory,
                defaultSubCategory: defaultSubCategory,
                easyMode: isEasy
            };
            
            if (isEasy) {
                const templateText = detailCard.querySelector('#rule-detail-templateText')?.value.trim() || '';
                updatedRule.templateText = templateText;
                updatedRule.amountRegex = '(?:Paid|Debited|Sent|spent)\\s+(?:Rs\\.?|INR|\\$)\\s*([\\d,]+(?:\\.\\d{2})?)';
                updatedRule.notesRegex = 'to\\s+([^.\\n]+)';
                updatedRule.notesTemplate = 'Gmail Sync: {payee}';
                updatedRule.placeholders = [];
            } else {
                const amountRegex = detailCard.querySelector('#rule-detail-amountRegex')?.value.trim() || '';
                const notesRegex = detailCard.querySelector('#rule-detail-notesRegex')?.value.trim() || '';
                
                updatedRule.amountRegex = amountRegex;
                updatedRule.notesRegex = notesRegex;
                updatedRule.notesTemplate = 'Gmail Sync: {payee}';
                updatedRule.placeholders = [];
            }
            
            FinData.config.gmailSyncRules[ruleIndex] = updatedRule;
            FinData.saveConfig({ gmailSyncRules: FinData.config.gmailSyncRules });
            
            renderSyncRules();
            runRuleSandboxTest();
            alert(`Rule "${name}" successfully modified!`);
        });

        // Cancel Click Handler
        const cancelBtn = detailCard.querySelector('#rule-detail-cancel-btn');
        cancelBtn?.addEventListener('click', () => {
            isAddingNewRule = false;
            const rulesList = FinData.config.gmailSyncRules || [];
            if (rulesList.length > 0) {
                selectedRuleId = rulesList[0].id;
            } else {
                selectedRuleId = null;
            }
            renderSyncRules();
            runRuleSandboxTest();
        });
    }

    function renderTemplatesDirectory() {
        const grid = document.getElementById('template-picker-grid');
        if (!grid) return;
        
        const PRESET_TEMPLATES = [
            {
                id: 'RULE-PAYTM-EXPENSE',
                name: 'Paytm Expense UPI',
                icon: 'ri-wallet-3-line',
                iconColor: getCssVar("--color-expense"),
                desc: 'Debits & Spends (INR)',
                from: 'alerts@paytm.com',
                subject: 'Paytm',
                type: 'Expense',
                amountRegex: '(?:Paid|Sent|Debited|Transferred)\\s+(?:Rs\\.?|INR)\\s*([\\d,]+(?:\\.\\d{2})?)',
                notesRegex: '(?:to|at)\\s+([^.\\n]+)',
                defaultBank: 'Paytm UPI',
                defaultCategory: 'Food',
                defaultSubCategory: 'Groceries'
            },
            {
                id: 'RULE-PAYTM-INCOME',
                name: 'Paytm Income Credit',
                icon: 'ri-add-circle-line',
                iconColor: getCssVar("--color-income"),
                desc: 'Credits & Cashbacks (INR)',
                from: 'alerts@paytm.com',
                subject: 'Paytm',
                type: 'Income',
                amountRegex: '(?:Received|Added|Credited)\\s+(?:Rs\\.?|INR)\\s*([\\d,]+(?:\\.\\d{2})?)',
                notesRegex: '(?:from|by)\\s+([^.\\n]+)',
                defaultBank: 'Paytm UPI',
                defaultCategory: 'Freelance',
                defaultSubCategory: 'Consulting'
            },
            {
                id: 'RULE-CHASE-EXPENSE',
                name: 'Chase Bank Spends',
                icon: 'ri-bank-line',
                iconColor: '#0ea5e9',
                desc: 'Credit/Debit Card (USD)',
                from: 'no-reply@chase.com',
                subject: 'transaction',
                type: 'Expense',
                amountRegex: '(?:charged|spent|transaction of|debit of|debit card purchase of)\\s+(?:\\$|USD)\\s*([\\d,]+(?:\\.\\d{2})?)',
                notesRegex: 'at\\s+([^.\\n\\r]+)',
                defaultBank: 'Primary Checking',
                defaultCategory: 'Housing',
                defaultSubCategory: 'Rent'
            },
            {
                id: 'RULE-BOFA-EXPENSE',
                name: 'Bank of America',
                icon: 'ri-bank-line',
                iconColor: '#ef4444',
                desc: 'BofA Card spends (USD)',
                from: 'ealerts.bankofamerica.com',
                subject: 'transaction',
                type: 'Expense',
                amountRegex: '(?:amount of|charge of|withdrew|debit of)\\s+(?:\\$|USD)\\s*([\\d,]+(?:\\.\\d{2})?)',
                notesRegex: 'at\\s+([^.\\n\\r]+)',
                defaultBank: 'Emergency Savings',
                defaultCategory: 'Food',
                defaultSubCategory: 'Dining Out'
            },
            {
                id: 'RULE-WELLSFARGO-EXPENSE',
                name: 'Wells Fargo Alerts',
                icon: 'ri-bank-line',
                iconColor: getCssVar("--color-ledger"),
                desc: 'Wells Fargo Spends (USD)',
                from: 'alerts@wellsfargo.com',
                subject: 'alert',
                type: 'Expense',
                amountRegex: '(?:purchase of|withdrawal of|amount of)\\s+(?:\\$|USD)\\s*([\\d,]+(?:\\.\\d{2})?)',
                notesRegex: 'at\\s+([^.\\n\\r]+)',
                defaultBank: 'Primary Checking',
                defaultCategory: 'Transport',
                defaultSubCategory: 'Uber/Lyft'
            },
            {
                id: 'RULE-AMEX-EXPENSE',
                name: 'Amex Spends',
                icon: 'ri-vip-diamond-line',
                iconColor: '#a855f7',
                desc: 'American Express (USD)',
                from: 'amex@aexp.com',
                subject: 'large purchase',
                type: 'Expense',
                amountRegex: '(?:amounted to|amount of|spend of|charge of)\\s+(?:\\$|USD)\\s*([\\d,]+(?:\\.\\d{2})?)',
                notesRegex: 'at\\s+([^.\\n\\r]+)',
                defaultBank: 'Primary Checking',
                defaultCategory: 'Food',
                defaultSubCategory: 'Dining Out'
            }
        ];

        grid.innerHTML = PRESET_TEMPLATES.map(tmpl => `
            <div class="template-card" data-id="${tmpl.id}">
                <div class="template-card-icon" style="color: ${tmpl.iconColor};">
                    <i class="${tmpl.icon}"></i>
                </div>
                <div class="template-card-info">
                    <div class="template-card-title">${tmpl.name}</div>
                    <div class="template-card-desc">${tmpl.desc}</div>
                </div>
                <button class="btn btn-outline btn-icon-only btn-sm template-add-btn" style="width:24px; height:24px; padding:0; border-radius:4px; border:none; background:rgba(255,255,255,0.05); color:var(--accent);">
                    <i class="ri-add-line"></i>
                </button>
            </div>
        `).join('');

        // Wire up click on each card to import it
        grid.querySelectorAll('.template-card').forEach(card => {
            card.addEventListener('click', (e) => {
                e.stopPropagation();
                const tmplId = card.getAttribute('data-id');
                const selectedTmpl = PRESET_TEMPLATES.find(t => t.id === tmplId);
                if (!selectedTmpl) return;

                FinData.config.gmailSyncRules = FinData.config.gmailSyncRules || [];
                if (FinData.config.gmailSyncRules.some(r => r.id === tmplId)) {
                    alert(`Template rule "${selectedTmpl.name}" is already loaded.`);
                    return;
                }

                // Map default bank correctly if active bank names do not include it
                const bankNames = FinData.masters.banks.map(b => b.name);
                let targetBank = selectedTmpl.defaultBank;
                if (!bankNames.includes(targetBank) && bankNames.length > 0) {
                    targetBank = bankNames[0];
                }

                const ruleToImport = {
                    ...selectedTmpl,
                    defaultBank: targetBank
                };
                delete ruleToImport.icon;
                delete ruleToImport.iconColor;
                delete ruleToImport.desc;

                FinData.config.gmailSyncRules.push(ruleToImport);
                FinData.saveConfig({ gmailSyncRules: FinData.config.gmailSyncRules });
                renderSyncRules();
                alert(`Successfully imported template: "${selectedTmpl.name}"!`);
            });
        });
    }

    function runRuleSandboxTest() {
        const textInput = document.getElementById('sandbox-email-text');
        const resultsDiv = document.getElementById('sandbox-results-content');
        if (!textInput || !resultsDiv) return;

        const rawText = textInput.value.trim();
        if (!rawText) {
            resultsDiv.innerHTML = `
                <div class="sandbox-empty-results" style="color: var(--color-expense);">
                    <i class="ri-error-warning-line" style="font-size: 24px; display: block; margin-bottom: 8px;"></i>
                    Please paste some sample email content first.
                </div>
            `;
            return;
        }

        // Parse headers from text if copy-pasted (e.g. "From: no-reply@chase.com" or "Subject: Spend alert")
        let fromHeader = "";
        let subjectHeader = "";
        
        const fromMatch = rawText.match(/From:\s*([^\n\r]+)/i);
        const subjectMatch = rawText.match(/Subject:\s*([^\n\r]+)/i);
        
        if (fromMatch) fromHeader = fromMatch[1].trim().toLowerCase();
        if (subjectMatch) subjectHeader = subjectMatch[1].trim().toLowerCase();

        // Clean text for regex (remove header lines starting with standard headers, and collapse spaces)
        let bodyOnlyText = rawText;
        bodyOnlyText = bodyOnlyText.split('\n')
            .filter(line => !/^(From|Subject|To|Date):\s*/i.test(line))
            .join('\n');
        
        const combinedText = bodyOnlyText.replace(/\s+/g, ' ');

        // Read sandbox rule selector FIRST to determine which rule(s) to test
        const sandboxRuleSelector = document.getElementById('sandbox-rule-selector');
        const sandboxSelectorVal = sandboxRuleSelector ? sandboxRuleSelector.value : 'auto';

        let rulesToTest = [];

        if (sandboxSelectorVal === 'auto') {
            // Auto mode: test all saved rules, but replace the sidebar-active rule with live form data
            rulesToTest = [...(FinData.config.gmailSyncRules || [])];
            const detailCard = document.querySelector('.rules-detail-view-card');
            if (detailCard && selectedRuleId) {
                const easyModeBtn = detailCard.querySelector('#rule-detail-mode-easy');
                const isEasy = easyModeBtn?.classList.contains('btn-primary');
                const liveRule = {
                    id: selectedRuleId,
                    name: detailCard.querySelector('#rule-detail-name')?.value.trim() || 'Testing Rule',
                    from: detailCard.querySelector('#rule-detail-from')?.value.trim() || '',
                    subject: detailCard.querySelector('#rule-detail-subject')?.value.trim() || '',
                    type: detailCard.querySelector('#rule-detail-type')?.value || 'Expense',
                    defaultBank: detailCard.querySelector('#rule-detail-bank')?.value || '',
                    defaultCategory: detailCard.querySelector('#rule-detail-category')?.value || '',
                    defaultSubCategory: detailCard.querySelector('#rule-detail-subcategory')?.value || '',
                    easyMode: isEasy,
                    placeholders: [],
                    templateText: isEasy ? (detailCard.querySelector('#rule-detail-templateText')?.value || '') : undefined,
                    amountRegex: !isEasy ? (detailCard.querySelector('#rule-detail-amountRegex')?.value.trim() || '') : undefined,
                    notesRegex: !isEasy ? (detailCard.querySelector('#rule-detail-notesRegex')?.value.trim() || '') : undefined,
                };
                const idx = rulesToTest.findIndex(r => r.id === selectedRuleId);
                if (idx > -1) { rulesToTest.splice(idx, 1, liveRule); } else { rulesToTest.unshift(liveRule); }
            }

        } else if (sandboxSelectorVal === 'draft') {
            // Draft mode: test only the new-rule form being filled in
            const detailCard = document.querySelector('.rules-detail-view-card');
            if (detailCard && isAddingNewRule) {
                const easyModeBtn = detailCard.querySelector('#rule-detail-mode-easy');
                const isEasy = easyModeBtn?.classList.contains('btn-primary');
                rulesToTest = [{
                    id: 'RULE-DRAFT',
                    name: detailCard.querySelector('#rule-detail-name')?.value.trim() || 'New Rule Draft',
                    from: detailCard.querySelector('#rule-detail-from')?.value.trim() || '',
                    subject: detailCard.querySelector('#rule-detail-subject')?.value.trim() || '',
                    type: detailCard.querySelector('#rule-detail-type')?.value || 'Expense',
                    defaultBank: detailCard.querySelector('#rule-detail-bank')?.value || '',
                    defaultCategory: detailCard.querySelector('#rule-detail-category')?.value || '',
                    defaultSubCategory: detailCard.querySelector('#rule-detail-subcategory')?.value || '',
                    easyMode: isEasy,
                    placeholders: [],
                    templateText: isEasy ? (detailCard.querySelector('#rule-detail-templateText')?.value || '') : undefined,
                    amountRegex: !isEasy ? (detailCard.querySelector('#rule-detail-amountRegex')?.value.trim() || '') : undefined,
                    notesRegex: !isEasy ? (detailCard.querySelector('#rule-detail-notesRegex')?.value.trim() || '') : undefined,
                }];
            }

        } else {
            // Specific rule selected: use SAVED config directly — no form injection
            const savedRule = (FinData.config.gmailSyncRules || []).find(r => r.id === sandboxSelectorVal);
            if (savedRule) {
                rulesToTest = [savedRule];
            }
        }

        if (rulesToTest.length === 0) {
            resultsDiv.innerHTML = `
                <div class="sandbox-empty-results" style="color: var(--text-muted);">
                    <i class="ri-flask-line" style="font-size: 24px; display: block; margin-bottom: 8px; color: var(--text-muted);"></i>
                    No active rules configured. Select or create a rule to execute dry run.
                </div>
            `;
            return;
        }

        let matchedRule = null;
        let parsedTxn = null;

        for (const rule of rulesToTest) {
            // In auto mode: respect From/Subject header criteria to pick the right rule.
            // In specific-rule mode: bypass header check — user explicitly picked this rule to test.
            let matchesSender = true;
            let matchesSubject = true;

            if (sandboxSelectorVal === 'auto') {
                if (fromHeader && rule.from) {
                    const senders = rule.from.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
                    matchesSender = senders.length === 0 || senders.some(sender => fromHeader.includes(sender));
                }
                if (subjectHeader && rule.subject) {
                    const subjects = rule.subject.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
                    matchesSubject = subjects.length === 0 || subjects.some(subj => subjectHeader.includes(subj));
                }
            }

            // Header check: in auto mode, skip rules that don't match sender/subject.
            // If no headers were pasted at all, bypass to allow direct text testing.
            const headerCheckPassed = sandboxSelectorVal !== 'auto'
                ? true
                : ((fromHeader || subjectHeader) ? (matchesSender && matchesSubject) : true);

            if (headerCheckPassed) {
                try {
                    let amount = 0;
                    let person = "";
                    let bank = rule.defaultBank || 'Primary Checking';
                    let category = rule.defaultCategory || 'Other';
                    let subCategory = rule.defaultSubCategory;
                    let secondSubCategory = '';
                    let targetDate = new Date().toISOString().slice(0, 10);
                    let time = '';
                    let mode = 'UPI';
                    let loanStart = '';
                    let loanEnd = '';
                    let loanAmount = 0;
                    let frequency = 'Daily';
                    let fromBank = '';
                    let toBank = '';
                    let finalNotes = "";
                    const placeholderValues = {};
                    const type = rule.type || 'Expense';

                    if (rule.easyMode && rule.templateText) {
                        const compiled = compileTemplateToRegex(rule.templateText);
                        if (compiled) {
                            const match = combinedText.match(compiled.regex);
                            if (match) {
                                let customNotes = '';

                                compiled.placeholders.forEach((ph, idx) => {
                                    let matchVal = (match[idx + 1] || '').trim();
                                    if (ph.mappedValue && matchVal.toLowerCase().trim() === ph.value.toLowerCase().trim()) {
                                        matchVal = ph.mappedValue;
                                    }
                                    const fieldNameLower = ph.fieldName.toLowerCase();
                                    
                                    if (ph.fieldName && ph.fieldName !== 'unmapped') {
                                        placeholderValues[ph.fieldName.toLowerCase().replace(/\s+/g, '_')] = matchVal;
                                    }

                                    if (fieldNameLower === 'amount') {
                                        amount = parseFloat(matchVal.replace(/,/g, ''));
                                    } else if (['payee', 'receiver', 'person'].includes(fieldNameLower)) {
                                        person = matchVal;
                                    } else if (fieldNameLower === 'bank') {
                                        const foundBank = FinData.masters.banks.find(b => b.name.toLowerCase() === matchVal.toLowerCase());
                                        bank = foundBank ? foundBank.name : matchVal;
                                    } else if (fieldNameLower === 'frombank') {
                                        const foundBank = FinData.masters.banks.find(b => b.name.toLowerCase() === matchVal.toLowerCase());
                                        fromBank = foundBank ? foundBank.name : matchVal;
                                    } else if (fieldNameLower === 'tobank') {
                                        const foundBank = FinData.masters.banks.find(b => b.name.toLowerCase() === matchVal.toLowerCase());
                                        toBank = foundBank ? foundBank.name : matchVal;
                                    } else if (fieldNameLower === 'category') {
                                        const typeCats = FinData.masters.categories[type] || [];
                                        const foundCat = typeCats.find(c => c.name.toLowerCase() === matchVal.toLowerCase());
                                        category = foundCat ? foundCat.name : matchVal;
                                    } else if (fieldNameLower === 'subcategory') {
                                        subCategory = matchVal;
                                    } else if (fieldNameLower === 'secondsubcategory') {
                                        secondSubCategory = matchVal;
                                    } else if (fieldNameLower === 'date') {
                                        targetDate = matchVal;
                                    } else if (fieldNameLower === 'time') {
                                        time = matchVal;
                                    } else if (fieldNameLower === 'mode') {
                                        mode = matchVal;
                                    } else if (fieldNameLower === 'notes') {
                                        customNotes = matchVal;
                                    } else if (fieldNameLower === 'loanstart') {
                                        loanStart = matchVal;
                                    } else if (fieldNameLower === 'loanend') {
                                        loanEnd = matchVal;
                                    } else if (fieldNameLower === 'loanamount') {
                                        loanAmount = parseFloat(matchVal.replace(/,/g, ''));
                                    } else if (fieldNameLower === 'frequency') {
                                        frequency = matchVal;
                                    }
                                });

                                if (isNaN(amount) || amount <= 0) continue;

                                if (!subCategory) {
                                    const cats = FinData.masters.categories[type] || [];
                                    const matchedCat = cats.find(c => c.name === category);
                                    subCategory = matchedCat && matchedCat.subCategories && matchedCat.subCategories.length > 0
                                        ? matchedCat.subCategories[0]
                                        : 'Other';
                                }

                                const notesText = interpolateNotesTemplate(rule.notesTemplate, {
                                    payee: person,
                                    amount: amount,
                                    bank: type === 'Transfer' ? `${fromBank || bank} > ${toBank}` : bank,
                                    category: category || (type === 'Transfer' ? 'Self Transfer' : 'Other'),
                                    subcategory: subCategory || (type === 'Transfer' ? 'Own Accounts' : 'Other'),
                                    secondsubcategory: secondSubCategory || undefined,
                                    date: targetDate,
                                    time: time || undefined,
                                    mode: mode || undefined,
                                    loanStart: loanStart || undefined,
                                    loanEnd: loanEnd || undefined,
                                    loanAmount: loanAmount || undefined,
                                    frequency: frequency || undefined,
                                    fromBank: fromBank || undefined,
                                    toBank: toBank || undefined,
                                    from: fromHeader,
                                    subject: subjectHeader,
                                    body: combinedText,
                                    snippet: rawText.slice(0, 100),
                                    ...placeholderValues
                                });

                                finalNotes = customNotes || notesText;

                                matchedRule = rule;
                                parsedTxn = {
                                    date: targetDate,
                                    time: time || undefined,
                                    type: type,
                                    category: category || (type === 'Transfer' ? 'Self Transfer' : 'Other'),
                                    subCategory: subCategory || (type === 'Transfer' ? 'Own Accounts' : 'Other'),
                                    secondSubCategory: secondSubCategory || undefined,
                                    bank: type === 'Transfer' ? `${fromBank || bank} > ${toBank || ''}` : bank,
                                    fromBank: type === 'Transfer' ? (fromBank || bank) : undefined,
                                    toBank: type === 'Transfer' ? toBank : undefined,
                                    amount: amount,
                                    mode: mode || undefined,
                                    person: person || undefined,
                                    notes: finalNotes,
                                    loanStart: loanStart || undefined,
                                    loanEnd: loanEnd || undefined,
                                    loanAmount: loanAmount || undefined,
                                    frequency: frequency || undefined
                                };
                            }
                        }
                        if (!parsedTxn) continue;
                    } else {
                        if (rule.amountRegex) {
                            const amtReg = new RegExp(rule.amountRegex, 'i');
                            const amtMatch = combinedText.match(amtReg);
                            if (amtMatch && amtMatch[1]) {
                                amount = parseFloat(amtMatch[1].replace(/,/g, ''));
                            }
                        }

                        if (rule.notesRegex) {
                            const notesReg = new RegExp(rule.notesRegex, 'i');
                            const notesMatch = combinedText.match(notesReg);
                            if (notesMatch && notesMatch[1]) {
                                person = notesMatch[1].trim();
                            }
                        }

                        let customPerson = '';
                        let customAmount = null;
                        let customBank = '';
                        let customCategory = '';
                        let customSubCategory = '';
                        let customDate = '';
                        let customNotes = '';

                        if (rule.placeholders && Array.isArray(rule.placeholders)) {
                            rule.placeholders.forEach(ph => {
                                if (ph.name && ph.regex) {
                                    try {
                                        const phReg = new RegExp(ph.regex, 'i');
                                        const phMatch = combinedText.match(phReg);
                                        if (phMatch && phMatch[1]) {
                                            const val = phMatch[1].trim();
                                            placeholderValues[ph.name.toLowerCase()] = val;
                                            
                                            if (ph.mappedField === 'person') customPerson = val;
                                            else if (ph.mappedField === 'amount') {
                                                const num = parseFloat(val.replace(/,/g, ''));
                                                if (!isNaN(num)) customAmount = num;
                                            }
                                            else if (ph.mappedField === 'bank') customBank = val;
                                            else if (ph.mappedField === 'category') customCategory = val;
                                            else if (ph.mappedField === 'subCategory') customSubCategory = val;
                                            else if (ph.mappedField === 'date') customDate = val;
                                            else if (ph.mappedField === 'notes') customNotes = val;
                                        }
                                    } catch (e) {
                                        console.error(`Sandbox placeholder parse error for ${ph.name}:`, e);
                                    }
                                }
                            });
                        }

                        if (customAmount !== null) {
                            amount = customAmount;
                        }

                        if (isNaN(amount) || amount <= 0) continue;

                        if (customPerson) {
                            person = customPerson;
                        }
                        
                        bank = rule.defaultBank || 'Primary Checking';
                        if (customBank) {
                            const foundBank = FinData.masters.banks.find(b => b.name.toLowerCase() === customBank.toLowerCase());
                            bank = foundBank ? foundBank.name : customBank;
                        }
                        
                        category = rule.defaultCategory || 'Other';
                        if (customCategory) {
                            const typeCats = FinData.masters.categories[type] || [];
                            const foundCat = typeCats.find(c => c.name.toLowerCase() === customCategory.toLowerCase());
                            category = foundCat ? foundCat.name : customCategory;
                        }
                        
                        subCategory = customSubCategory || rule.defaultSubCategory;
                        if (!subCategory) {
                            const cats = FinData.masters.categories[type] || [];
                            const matchedCat = cats.find(c => c.name === category);
                            subCategory = matchedCat && matchedCat.subCategories && matchedCat.subCategories.length > 0
                                ? matchedCat.subCategories[0]
                                : 'Other';
                        }
                        
                        targetDate = customDate || new Date().toISOString().slice(0, 10);

                        const notesText = interpolateNotesTemplate(rule.notesTemplate, {
                            payee: person,
                            amount: amount,
                            bank: bank,
                            category: category,
                            subcategory: subCategory,
                            date: targetDate,
                            from: fromHeader,
                            subject: subjectHeader,
                            body: combinedText,
                            snippet: rawText.slice(0, 100),
                            ...placeholderValues
                        });

                        finalNotes = customNotes || notesText;

                        matchedRule = rule;
                        parsedTxn = {
                            date: targetDate,
                            time: time || undefined,
                            type: type,
                            category: category || (type === 'Transfer' ? 'Self Transfer' : 'Other'),
                            subCategory: subCategory || (type === 'Transfer' ? 'Own Accounts' : 'Other'),
                            secondSubCategory: secondSubCategory || undefined,
                            bank: type === 'Transfer' ? `${fromBank || bank} > ${toBank || ''}` : bank,
                            fromBank: type === 'Transfer' ? (fromBank || bank) : undefined,
                            toBank: type === 'Transfer' ? toBank : undefined,
                            amount: amount,
                            mode: mode || undefined,
                            person: person || undefined,
                            notes: finalNotes,
                            loanStart: loanStart || undefined,
                            loanEnd: loanEnd || undefined,
                            loanAmount: loanAmount || undefined,
                            frequency: frequency || undefined
                        };
                    }
                } catch (err) {
                    console.error("Sandbox parsing error:", err);
                }
            }
            if (parsedTxn) {
                break;
            }
        }

        // If no custom rule matched, try default fallbacks — ONLY in Auto-Detect mode
        let fallbackMatchedName = "";
        if (!parsedTxn && sandboxSelectorVal === 'auto') {
            const paidRegex = /(?:Paid|Sent|Debited|Transferred)\s+(?:Rs\.?|INR)\s*([\d,]+(?:\.\d{2})?)\s+(?:to|at)\s+([^.\n]+)/i;
            const receivedRegex = /(?:Received|Added|Credited)\s+(?:Rs\.?|INR)\s*([\d,]+(?:\.\d{2})?)\s+(?:from|by)\s+([^.\n]+)/i;
            const addedWalletRegex = /(?:Added|Loaded)\s+(?:Rs\.?|INR)\s*([\d,]+(?:\.\d{2})?)\s+to\s+(?:Paytm\s+)?Wallet/i;
            const cashbackRegex = /Cashback\s+(?:of|received)\s+(?:Rs\.?|INR)\s*([\d,]+(?:\.\d{2})?)/i;

            let amount = 0;
            let type = 'Expense';
            let notes = '';
            let person = '';
            let category = 'Other';
            let subCategory = 'Other Spends';
            let bank = 'Paytm UPI';
            let match;

            if ((match = combinedText.match(paidRegex))) {
                amount = parseFloat(match[1].replace(/,/g, ''));
                type = 'Expense';
                person = match[2].trim();
                notes = `Gmail Sync: Paid Rs. ${amount} to ${person}`;
                bank = 'Paytm UPI';
                
                // Smart classification
                const lowerPerson = person.toLowerCase();
                if (lowerPerson.includes('uber') || lowerPerson.includes('ola') || lowerPerson.includes('metro') || lowerPerson.includes('irctc')) {
                    category = 'Transport';
                    subCategory = 'Uber/Lyft';
                } else if (lowerPerson.includes('starbucks') || lowerPerson.includes('zomato') || lowerPerson.includes('swiggy') || lowerPerson.includes('rest') || lowerPerson.includes('food')) {
                    category = 'Food';
                    subCategory = 'Dining Out';
                } else if (lowerPerson.includes('amazon') || lowerPerson.includes('flipkart') || lowerPerson.includes('grocer') || lowerPerson.includes('mart')) {
                    category = 'Food';
                    subCategory = 'Groceries';
                } else {
                    category = 'Expense';
                    subCategory = 'Shopping';
                }
                fallbackMatchedName = "Default Paytm Expense Parser";
            } 
            else if ((match = combinedText.match(receivedRegex))) {
                amount = parseFloat(match[1].replace(/,/g, ''));
                type = 'Income';
                person = match[2].trim();
                notes = `Gmail Sync: Received Rs. ${amount} from ${person}`;
                category = 'Freelance';
                subCategory = 'Consulting';
                bank = 'Paytm UPI';
                fallbackMatchedName = "Default Paytm Income Parser";
            }
            else if ((match = combinedText.match(addedWalletRegex))) {
                amount = parseFloat(match[1].replace(/,/g, ''));
                type = 'Income';
                notes = `Gmail Sync: Loaded Rs. ${amount} into Paytm Wallet`;
                category = 'Salary';
                subCategory = 'Monthly Base';
                bank = 'Paytm Wallet';
                fallbackMatchedName = "Default Paytm Added Wallet Parser";
            }
            else if ((match = combinedText.match(cashbackRegex))) {
                amount = parseFloat(match[1].replace(/,/g, ''));
                type = 'Income';
                notes = `Gmail Sync: Cashback Rs. ${amount} received`;
                category = 'Income';
                subCategory = 'Freelance';
                bank = 'Paytm Wallet';
                fallbackMatchedName = "Default Paytm Cashback Parser";
            }
            else {
                // General currency amount extractor backup (INR & USD)
                const generalAmtRegex = /(?:Rs\.?|INR|\$|USD)\s*([\d,]+(?:\.\d{2})?)/i;
                const amtMatch = combinedText.match(generalAmtRegex);
                if (amtMatch) {
                    amount = parseFloat(amtMatch[1].replace(/,/g, ''));
                    type = combinedText.toLowerCase().includes('received') ? 'Income' : 'Expense';
                    notes = `Gmail Sync Alert: ${rawText.slice(0, 80)}...`;
                    category = type === 'Income' ? 'Freelance' : 'Expense';
                    subCategory = 'Other';
                    bank = FinData.masters.banks[0]?.name || 'Primary Checking';
                    fallbackMatchedName = "Default General Currency Parser";
                }
            }

            if (amount > 0) {
                parsedTxn = {
                    date: new Date().toISOString().slice(0, 10),
                    type: type,
                    category: category,
                    subCategory: subCategory,
                    bank: bank,
                    amount: amount,
                    person: person || undefined,
                    notes: notes
                };
            }
        }

        if (parsedTxn) {
            const isCustom = !!matchedRule;
            const matchName = isCustom ? matchedRule.name : fallbackMatchedName;
            const typeLower = parsedTxn.type.toLowerCase();
            
            // Build the dynamic list of parsed fields, showing all mandatory ones first
            const isTransfer = parsedTxn.type === 'Transfer';
            const isLedger = parsedTxn.type === 'Ledger';

            // Define mandatory fields based on transaction type
            const fieldsConfig = [
                { key: 'date', label: 'Date', mandatory: true },
                { key: 'type', label: 'Txn Type', mandatory: true },
                { key: 'amount', label: 'Amount', mandatory: true, format: (val) => `₹${parseFloat(val || 0).toFixed(2)}` },
                { key: 'notes', label: 'Description', mandatory: true },
            ];

            if (isTransfer) {
                fieldsConfig.push(
                    { key: 'fromBank', label: 'From Account', mandatory: true },
                    { key: 'toBank', label: 'To Account', mandatory: true }
                );
            } else {
                fieldsConfig.push(
                    { key: 'bank', label: 'Account / Bank', mandatory: true },
                    { key: 'category', label: 'Category Head', mandatory: true },
                    { key: 'subCategory', label: 'Category', mandatory: true }
                );
            }

            if (isLedger) {
                fieldsConfig.push({ key: 'person', label: 'Payee / Creditor', mandatory: true });
            } else {
                fieldsConfig.push({ key: 'person', label: 'Payee / Receiver', mandatory: false });
            }

            // Optional fields to show only if they have values
            const optionalFields = [
                { key: 'secondSubCategory', label: 'Sub-category' },
                { key: 'time', label: 'Time' },
                { key: 'mode', label: 'Txn Mode' },
                { key: 'loanStart', label: 'Loan Start Date' },
                { key: 'loanEnd', label: 'Loan End Date' },
                { key: 'loanAmount', label: 'Loan Amount', format: (val) => val ? `₹${parseFloat(val).toFixed(2)}` : '' },
                { key: 'frequency', label: 'Frequency' }
            ];

            let fieldsHtml = '';

            fieldsConfig.forEach(f => {
                const val = parsedTxn[f.key];
                const displayVal = val ? (f.format ? f.format(val) : val) : `<span style="color: var(--color-expense); font-style: italic;">Missing Value</span>`;
                fieldsHtml += `
                    <div style="background: rgba(255,255,255,0.015); border: 1px solid rgba(255,255,255,0.04); padding: 6px 10px; border-radius: 6px; display: flex; flex-direction: column; gap: 2px;">
                        <span style="font-size: 9px; color: var(--text-muted); text-transform: uppercase; font-weight: 600; display: flex; align-items: center; justify-content: space-between;">
                            ${f.label}
                            ${f.mandatory ? '<span style="color: #ef4444; font-size: 10px; font-weight: bold;" title="Mandatory Field">*</span>' : ''}
                        </span>
                        <span style="font-size: 12px; font-weight: 700; color: ${val ? 'var(--text-main)' : 'var(--color-expense)'}; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${val || ''}">${displayVal}</span>
                    </div>
                `;
            });

            optionalFields.forEach(f => {
                const val = parsedTxn[f.key];
                if (val !== undefined && val !== null && val !== '') {
                    const displayVal = f.format ? f.format(val) : val;
                    fieldsHtml += `
                        <div style="background: rgba(255,255,255,0.01); border: 1px dashed rgba(255,255,255,0.03); padding: 6px 10px; border-radius: 6px; display: flex; flex-direction: column; gap: 2px;">
                            <span style="font-size: 9px; color: var(--text-muted); text-transform: uppercase; font-weight: 500;">${f.label}</span>
                            <span style="font-size: 11px; font-weight: 600; color: var(--text-main); opacity: 0.85; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${val}">${displayVal}</span>
                        </div>
                    `;
                }
            });

            resultsDiv.innerHTML = `
                <div class="sandbox-success-card">
                    <div class="sandbox-success-header">
                        <i class="ri-checkbox-circle-fill" style="font-size: 18px;"></i>
                        <span>Parse Dry Run Succeeded!</span>
                        <span class="sandbox-match-badge">${isCustom ? 'Custom Rule' : 'System Fallback'}</span>
                    </div>
                    
                    <div style="font-size: 11px; color: var(--text-muted); margin-bottom: 2px;">
                        Matched: <strong>${matchName}</strong>
                        ${(fromHeader || subjectHeader) ? '<br><span style="color:#10b981;">✔ Header criteria matched successfully.</span>' : '<br><span style="color:var(--text-muted); font-style:italic;">Note: Header checks bypassed (Direct Text Match).</span>'}
                    </div>

                    <div class="sandbox-preview-card">
                        <div class="sandbox-preview-main">
                            <div class="sandbox-preview-notes">${parsedTxn.notes}</div>
                            <div class="sandbox-preview-meta">
                                <span><i class="ri-bank-card-line"></i> ${parsedTxn.bank}</span>
                                <span><i class="ri-calendar-line"></i> ${parsedTxn.date}</span>
                            </div>
                            <div class="sandbox-preview-pills">
                                <span class="sandbox-preview-pill">${parsedTxn.type}</span>
                                <span class="sandbox-preview-pill">${parsedTxn.category}</span>
                                <span class="sandbox-preview-pill">${parsedTxn.subCategory}</span>
                            </div>
                        </div>
                        <div class="sandbox-preview-amount ${typeLower}">
                            ₹${parsedTxn.amount.toFixed(2)}
                        </div>
                    </div>

                    <!-- Structured Mapped Fields Panel -->
                    <div style="margin-top: 10px; margin-bottom: 8px; border-top: 1px dashed var(--glass-border); padding-top: 10px;">
                        <div style="font-size: 11px; font-weight: 700; color: var(--accent); margin-bottom: 6px; text-transform: uppercase; letter-spacing: 0.5px; display: flex; align-items: center; gap: 4px;">
                            <i class="ri-survey-line"></i> Parsed Field Mappings
                        </div>
                        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 8px;">
                            ${fieldsHtml}
                        </div>
                    </div>

                    <div class="sandbox-success-actions" style="display: flex; justify-content: flex-end; margin-top: 8px;">
                        <button type="button" class="btn btn-primary btn-sm" id="sandbox-push-db-btn" style="display: inline-flex; align-items: center; gap: 6px; padding: 6px 12px; font-size: 12px; border-radius: 6px; font-weight: 600;">
                            <i class="ri-database-2-line"></i> Push to Database
                        </button>
                    </div>
                </div>
            `;

            // Bind click event for Push to Database button
            const pushDbBtn = document.getElementById('sandbox-push-db-btn');
            if (pushDbBtn) {
                pushDbBtn.addEventListener('click', () => {
                    const txnToSave = {
                        ...parsedTxn,
                        note: parsedTxn.notes || parsedTxn.note || '',
                        recordEnteredAs: 'Gmail Sandbox',
                        status: 'Verified'
                    };
                    
                    // Add it directly using FinData API
                    FinData.addTransaction(txnToSave);
                    
                    alert("Parsed transaction committed directly to the database successfully!");
                    
                    // Reset sandbox state to empty
                    textInput.value = '';
                    resultsDiv.innerHTML = `
                        <div class="sandbox-empty-results" style="color: var(--color-income);">
                            <i class="ri-checkbox-circle-fill" style="font-size: 24px; display: block; margin-bottom: 8px; color: var(--color-income);"></i>
                            Transaction successfully pushed to DB! Enter a new snippet to test.
                        </div>
                    `;
                    
                    // Trigger global layout/dashboard & records sync updates
                    updateDashboard();
                    renderRecords();
                });
            }
        } else {
            // Build a context-aware failure message
            let failTitle = 'No Rules Matched';
            let failDetail = 'None of your configured custom sync rules matched the pasted snippet, and it did not match any system fallback patterns. Check your amount regex and search patterns!';

            if (sandboxSelectorVal && sandboxSelectorVal !== 'auto') {
                const selectedRuleName = (() => {
                    if (sandboxSelectorVal === 'draft') return 'New Draft Rule';
                    const r = (FinData.config.gmailSyncRules || []).find(r => r.id === sandboxSelectorVal);
                    return r ? r.name : 'Selected Rule';
                })();
                const selectedRuleObj = sandboxSelectorVal !== 'draft'
                    ? (FinData.config.gmailSyncRules || []).find(r => r.id === sandboxSelectorVal)
                    : null;
                const hasTemplate = selectedRuleObj && selectedRuleObj.easyMode !== false && selectedRuleObj.templateText;
                const hasRegex = selectedRuleObj && selectedRuleObj.easyMode === false && selectedRuleObj.amountRegex;

                failTitle = `Rule Did Not Match`;
                if (!hasTemplate && !hasRegex) {
                    failDetail = `<strong>"${selectedRuleName}"</strong> has no template or regex pattern configured yet. Go to the rule's Easy Mapping Template and paste your sample email, then wrap values in angle brackets.`;
                } else if (hasTemplate) {
                    failDetail = `<strong>"${selectedRuleName}"</strong> has a template configured, but it did not match the pasted email text. Make sure your sample email matches the template pattern, and all required fields are wrapped correctly.`;
                } else {
                    failDetail = `<strong>"${selectedRuleName}"</strong> regex pattern did not match the pasted text. Check the Amount and Notes/Payee regex patterns in the rule settings.`;
                }
            }

            resultsDiv.innerHTML = `
                <div class="sandbox-empty-results" style="color: var(--color-expense); padding: 20px 10px;">
                    <i class="ri-close-circle-fill" style="font-size: 32px; display: block; margin-bottom: 8px; color: var(--color-expense);"></i>
                    <strong>${failTitle}</strong>
                    <div style="font-size: 11px; color: var(--text-muted); margin-top: 6px; line-height: 1.6; text-align: left; background: rgba(0,0,0,0.15); border-radius: 6px; padding: 8px 12px; border: 1px dashed rgba(239,68,68,0.2);">
                        ${failDetail}
                    </div>
                </div>
            `;
        }
    }

    // --- GMAIL REVIEW STAGING SCREEN ENGINE ---

    function updateReviewBadge() {
        const badge = document.getElementById('review-badge');
        if (!badge) return;
        
        const staging = FinData.stagingTransactions || [];
        const count = staging.length;
        
        if (count > 0) {
            badge.classList.remove('hidden');
            badge.style.display = 'block';
        } else {
            badge.classList.add('hidden');
            badge.style.display = 'none';
        }
        
        // Also update pending counts inside review screen
        const pendingCountText = document.getElementById('review-pending-count');
        const stagingTotalText = document.getElementById('review-staging-total');
        if (pendingCountText) pendingCountText.innerText = count;
        if (stagingTotalText) {
            const total = staging.reduce((sum, t) => sum + parseFloat(t.amount || 0), 0);
            stagingTotalText.innerText = `₹${total.toFixed(2)}`;
        }
    }

    function initStagingReviewControls() {
        const pushBtn = document.getElementById('review-push-btn');
        const discardBtn = document.getElementById('review-discard-btn');

        pushBtn?.addEventListener('click', () => {
            const checkedCheckboxes = document.querySelectorAll('.review-row-checkbox:checked');
            const ids = Array.from(checkedCheckboxes).map(cb => cb.getAttribute('data-id'));
            pushStagingToLedger(ids);
        });

        discardBtn?.addEventListener('click', () => {
            const checkedCheckboxes = document.querySelectorAll('.review-row-checkbox:checked');
            const ids = Array.from(checkedCheckboxes).map(cb => cb.getAttribute('data-id'));
            discardStagingTransactions(ids);
        });
    }

    function renderReviewScreen() {
        const tbody = document.getElementById('review-tbody');
        const emptyState = document.getElementById('review-empty-state');
        const selectAllCheckbox = document.getElementById('review-select-all');
        const selectionStatus = document.getElementById('review-selection-status');
        
        if (!tbody) return;

        // Reset Select All
        if (selectAllCheckbox) selectAllCheckbox.checked = false;
        if (selectionStatus) selectionStatus.innerText = 'No items selected';

        const staging = FinData.stagingTransactions || [];

        if (staging.length === 0) {
            tbody.innerHTML = '';
            if (emptyState) emptyState.style.display = 'block';
            tbody.closest('table').style.display = 'none';
            updateReviewBadge();
            return;
        }

        if (emptyState) emptyState.style.display = 'none';
        tbody.closest('table').style.display = 'table';

        tbody.innerHTML = staging.map((t) => {
            // Build Bank options
            const bankOptions = FinData.masters.banks.map(b => 
                `<option value="${b.name}" ${b.name === t.bank ? 'selected' : ''}>${b.name}</option>`
            ).join('');

            let bankCellHtml = '';
            if (t.type === 'Transfer') {
                const fromBankOptions = FinData.masters.banks.map(b => 
                    `<option value="${b.name}" ${b.name === t.fromBank ? 'selected' : ''}>${b.name}</option>`
                ).join('');
                const toBankOptions = FinData.masters.banks.map(b => 
                    `<option value="${b.name}" ${b.name === t.toBank ? 'selected' : ''}>${b.name}</option>`
                ).join('');
                
                bankCellHtml = `
                    <div style="display: flex; flex-direction: column; gap: 4px;">
                        <select class="review-input review-from-bank" data-id="${t.id}" style="background: rgba(255,255,255,0.03); border: 1px solid var(--glass-border); border-radius: 6px; color: var(--text-main); padding: 3px 6px; font-family: inherit; font-size: 11px; width: 130px;">
                            <option value="">-- From Account --</option>
                            ${fromBankOptions}
                        </select>
                        <select class="review-input review-to-bank" data-id="${t.id}" style="background: rgba(255,255,255,0.03); border: 1px solid var(--glass-border); border-radius: 6px; color: var(--text-main); padding: 3px 6px; font-family: inherit; font-size: 11px; width: 130px;">
                            <option value="">-- To Account --</option>
                            ${toBankOptions}
                        </select>
                    </div>
                `;
            } else {
                bankCellHtml = `
                    <select class="review-input review-bank" data-id="${t.id}" style="background: rgba(255,255,255,0.03); border: 1px solid var(--glass-border); border-radius: 6px; color: var(--text-main); padding: 4px 6px; font-family: inherit; font-size: 13px; width: 130px;">
                        ${bankOptions}
                    </select>
                `;
            }

            // Build Category options based on Type
            let typeCategories = FinData.masters.categories[t.type] || [];
            const categoryOptions = typeCategories.map(c => 
                `<option value="${c.name}" ${c.name === t.category ? 'selected' : ''}>${c.name}</option>`
            ).join('');

            // Build Sub-Category options
            const activeCategory = typeCategories.find(c => c.name === t.category);
            const subCategories = activeCategory ? activeCategory.subCategories : [];
            const subCategoryOptions = subCategories.map(sc => 
                `<option value="${sc}" ${sc === t.subCategory ? 'selected' : ''}>${sc}</option>`
            ).join('');

            return `
                <tr id="review-row-${t.id}" style="border-bottom: 1px solid var(--glass-border); vertical-align: middle;">
                    <td style="padding: 10px 8px;">
                        <input type="checkbox" class="review-row-checkbox" data-id="${t.id}" style="transform: scale(1.1); cursor: pointer;">
                    </td>
                    <td style="padding: 10px 8px;">
                        <input type="date" class="review-input review-date" data-id="${t.id}" value="${t.date}" style="background: rgba(255,255,255,0.03); border: 1px solid var(--glass-border); border-radius: 6px; color: var(--text-main); padding: 4px 6px; font-family: inherit; font-size: 13px; width: 120px;">
                    </td>
                    <td style="padding: 10px 8px;">
                        <select class="review-input review-type" data-id="${t.id}" style="background: rgba(255,255,255,0.03); border: 1px solid var(--glass-border); border-radius: 6px; color: var(--text-main); padding: 4px 6px; font-family: inherit; font-size: 13px; width: 95px;">
                            <option value="Expense" ${t.type === 'Expense' ? 'selected' : ''}>Expense</option>
                            <option value="Income" ${t.type === 'Income' ? 'selected' : ''}>Income</option>
                            <option value="Investment" ${t.type === 'Investment' ? 'selected' : ''}>Investment</option>
                            <option value="Ledger" ${t.type === 'Ledger' ? 'selected' : ''}>Ledger</option>
                            <option value="Transfer" ${t.type === 'Transfer' ? 'selected' : ''}>Self Transfer</option>
                        </select>
                    </td>
                    <td style="padding: 10px 8px;">
                        ${bankCellHtml}
                    </td>
                    <td style="padding: 10px 8px;">
                        <select class="review-input review-category" data-id="${t.id}" style="background: rgba(255,255,255,0.03); border: 1px solid var(--glass-border); border-radius: 6px; color: var(--text-main); padding: 4px 6px; font-family: inherit; font-size: 13px; width: 120px;">
                            ${categoryOptions}
                        </select>
                    </td>
                    <td style="padding: 10px 8px;">
                        <select class="review-input review-sub-category" data-id="${t.id}" style="background: rgba(255,255,255,0.03); border: 1px solid var(--glass-border); border-radius: 6px; color: var(--text-main); padding: 4px 6px; font-family: inherit; font-size: 13px; width: 120px;">
                            ${subCategoryOptions}
                        </select>
                    </td>
                    <td style="padding: 10px 8px;">
                        <input type="text" class="review-input review-notes" data-id="${t.id}" value="${t.notes || ''}" style="background: rgba(255,255,255,0.03); border: 1px solid var(--glass-border); border-radius: 6px; color: var(--text-main); padding: 4px 6px; font-family: inherit; font-size: 13px; width: 100%; min-width: 150px;">
                    </td>
                    <td style="padding: 10px 8px; text-align: right;">
                        <div style="display: flex; align-items: center; justify-content: flex-end; gap: 4px;">
                            <span style="color: var(--text-muted); font-size: 13px;">₹</span>
                            <input type="number" step="0.01" class="review-input review-amount" data-id="${t.id}" value="${t.amount}" style="background: rgba(255,255,255,0.03); border: 1px solid var(--glass-border); border-radius: 6px; color: var(--text-main); padding: 4px 6px; font-family: inherit; font-size: 13px; width: 90px; text-align: right; -moz-appearance: textfield;">
                        </div>
                    </td>
                    <td style="padding: 10px 8px; text-align: center;">
                        <div style="display: flex; align-items: center; justify-content: center; gap: 8px;">
                            <button class="review-row-push btn btn-primary btn-icon btn-sm" data-id="${t.id}" title="Push to Ledger" style="padding: 6px 8px; border-radius: 6px; background: rgba(14, 165, 233, 0.2); border: 1px solid rgba(14, 165, 233, 0.4); color: #0ea5e9;">
                                <i class="ri-check-line"></i>
                            </button>
                            <button class="review-row-delete btn btn-outline btn-icon btn-sm" data-id="${t.id}" title="Discard" style="padding: 6px 8px; border-radius: 6px; background: rgba(239, 68, 68, 0.1); border: 1px solid rgba(239, 68, 68, 0.3); color: #f87171;">
                                <i class="ri-delete-bin-line"></i>
                            </button>
                        </div>
                    </td>
                </tr>
            `;
        }).join('');

        // Update counts/badges
        updateReviewBadge();

        // Wire up change listeners to capture inline modifications instantly and save them to stagingTransactions
        tbody.querySelectorAll('.review-input').forEach(input => {
            input.addEventListener('change', (e) => {
                const id = e.target.getAttribute('data-id');
                const trans = FinData.stagingTransactions.find(x => x.id === id);
                if (!trans) return;

                if (e.target.classList.contains('review-date')) {
                    trans.date = e.target.value;
                } else if (e.target.classList.contains('review-type')) {
                    const oldType = trans.type;
                    trans.type = e.target.value;
                    // If type changed, reset Category & Subcategory to first available for new Type
                    if (oldType !== trans.type) {
                        if (trans.type === 'Transfer') {
                            const transferCats = FinData.masters.categories.Transfer || [];
                            trans.category = transferCats.length > 0 ? transferCats[0].name : 'Self Transfer';
                            const subCats = transferCats.length > 0 ? transferCats[0].subCategories : [];
                            trans.subCategory = subCats.length > 0 ? (typeof subCats[0] === 'string' ? subCats[0] : subCats[0].name) : 'Own Accounts';
                            trans.fromBank = trans.bank || '';
                            trans.toBank = '';
                            trans.bank = `${trans.fromBank} > `;
                        } else {
                            const typeCats = FinData.masters.categories[trans.type] || [];
                            trans.category = typeCats.length > 0 ? typeCats[0].name : 'Other';
                            const subCats = typeCats.length > 0 ? typeCats[0].subCategories : [];
                            trans.subCategory = subCats.length > 0 ? subCats[0] : 'Other';
                            if (oldType === 'Transfer') {
                                trans.bank = trans.fromBank || trans.bank || '';
                                delete trans.fromBank;
                                delete trans.toBank;
                            }
                        }
                        // Re-render row dynamically to update the dropdowns!
                        renderReviewScreen();
                        return;
                    }
                } else if (e.target.classList.contains('review-bank')) {
                    trans.bank = e.target.value;
                } else if (e.target.classList.contains('review-from-bank')) {
                    trans.fromBank = e.target.value;
                    trans.bank = `${trans.fromBank || ''} > ${trans.toBank || ''}`;
                } else if (e.target.classList.contains('review-to-bank')) {
                    trans.toBank = e.target.value;
                    trans.bank = `${trans.fromBank || ''} > ${trans.toBank || ''}`;
                } else if (e.target.classList.contains('review-category')) {
                    const oldCat = trans.category;
                    trans.category = e.target.value;
                    if (oldCat !== trans.category) {
                        const typeCats = FinData.masters.categories[trans.type] || [];
                        const activeCat = typeCats.find(c => c.name === trans.category);
                        const subCats = activeCat ? activeCat.subCategories : [];
                        trans.subCategory = subCats.length > 0 ? subCats[0] : 'Other';
                        renderReviewScreen();
                        return;
                    }
                } else if (e.target.classList.contains('review-sub-category')) {
                    trans.subCategory = e.target.value;
                } else if (e.target.classList.contains('review-notes')) {
                    trans.notes = e.target.value;
                } else if (e.target.classList.contains('review-amount')) {
                    trans.amount = parseFloat(e.target.value) || 0;
                    updateReviewBadge(); // Refresh computed totals since amount changed!
                }

                FinData.saveStagingTransactions();
            });
        });

        // Wire up individual Row Checkboxes
        const checkboxes = tbody.querySelectorAll('.review-row-checkbox');
        const updateSelectionStatus = () => {
            const checkedBoxes = Array.from(checkboxes).filter(cb => cb.checked);
            const count = checkedBoxes.length;
            if (count === 0) {
                selectionStatus.innerText = 'No items selected';
                if (selectAllCheckbox) selectAllCheckbox.checked = false;
            } else {
                let sum = 0;
                checkedBoxes.forEach(cb => {
                    const id = cb.getAttribute('data-id');
                    const trans = FinData.stagingTransactions.find(x => x.id === id);
                    if (trans) sum += parseFloat(trans.amount || 0);
                });
                selectionStatus.innerText = `${count} item(s) selected (Total: ₹${sum.toFixed(2)})`;
                if (selectAllCheckbox && count === checkboxes.length) {
                    selectAllCheckbox.checked = true;
                } else if (selectAllCheckbox) {
                    selectAllCheckbox.checked = false;
                }
            }
        };

        checkboxes.forEach(cb => {
            cb.addEventListener('change', updateSelectionStatus);
        });

        // Wire up Select All checkbox
        if (selectAllCheckbox) {
            selectAllCheckbox.addEventListener('change', (e) => {
                checkboxes.forEach(cb => {
                    cb.checked = e.target.checked;
                });
                updateSelectionStatus();
            });
        }

        // Wire up individual Push Button
        tbody.querySelectorAll('.review-row-push').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const btnEl = e.currentTarget;
                const id = btnEl.getAttribute('data-id');
                pushStagingToLedger([id]);
            });
        });

        // Wire up individual Delete Button
        tbody.querySelectorAll('.review-row-delete').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const btnEl = e.currentTarget;
                const id = btnEl.getAttribute('data-id');
                discardStagingTransactions([id]);
            });
        });
    }

    function pushStagingToLedger(ids) {
        if (!ids || ids.length === 0) {
            alert('Please select at least one transaction to push.');
            return;
        }

        let promotedCount = 0;
        
        ids.forEach(id => {
            const index = FinData.stagingTransactions.findIndex(x => x.id === id);
            if (index > -1) {
                const trans = FinData.stagingTransactions[index];
                
                // Map notes to note for main DB compatibility, and stamp as verified
                trans.note = trans.notes || trans.note || '';
                trans.status = 'Verified';
                trans.recordEnteredAs = 'Gmail Sync';
                
                // Ensure unique transaction ID
                if (!trans.id || !trans.id.startsWith('TXN-')) {
                    trans.id = 'TXN-' + Date.now() + Math.random().toString(36).substr(2, 5).toUpperCase();
                }
                
                // Add to main transactions ledger
                FinData.transactions.unshift(trans);
                
                // Remove from staging
                FinData.stagingTransactions.splice(index, 1);
                promotedCount++;
            }
        });

        if (promotedCount > 0) {
            FinData.storage.save('transactions', FinData.transactions);
            FinData.saveStagingTransactions();
            
            updateReviewBadge();
            updateDashboard();
            renderReviewScreen();
            
            alert(`Successfully promoted ${promotedCount} transaction(s) to the main database with 'Verified' status!`);
        }
    }

    function discardStagingTransactions(ids) {
        if (!ids || ids.length === 0) {
            alert('Please select at least one transaction to discard.');
            return;
        }

        if (!confirm(`Are you sure you want to discard ${ids.length} selected transaction(s)? They will be removed permanently.`)) {
            return;
        }

        let discardedCount = 0;
        ids.forEach(id => {
            const index = FinData.stagingTransactions.findIndex(x => x.id === id);
            if (index > -1) {
                FinData.stagingTransactions.splice(index, 1);
                discardedCount++;
            }
        });

        if (discardedCount > 0) {
            FinData.saveStagingTransactions();
            updateReviewBadge();
            renderReviewScreen();
            alert(`Discarded ${discardedCount} transaction(s) successfully.`);
        }
    }

    // --- QUICK LEDGER ENTRY MODAL ---

    window.openQuickLedgerModal = (personName) => {
        const modal = document.getElementById('quick-ledger-modal');
        if (!modal) return;

        // Reset form
        document.getElementById('ql-person').value = personName;
        document.getElementById('ql-person-display').textContent = personName;
        document.getElementById('ql-entry-type').value = '';
        document.getElementById('ql-amount').value = '';
        document.getElementById('ql-amount-words').textContent = '';
        document.getElementById('ql-note').value = '';
        document.getElementById('ql-error').style.display = 'none';

        // Reset type buttons
        const btnGiven = document.getElementById('ql-btn-given');
        const btnTaken = document.getElementById('ql-btn-taken');
        btnGiven.style.opacity = '1';
        btnTaken.style.opacity = '1';
        btnGiven.style.borderWidth = '2px';
        btnTaken.style.borderWidth = '2px';

        // Set today's date
        const today = new Date();
        const yyyy = today.getFullYear();
        const mm = String(today.getMonth() + 1).padStart(2, '0');
        const dd = String(today.getDate()).padStart(2, '0');
        document.getElementById('ql-date').value = `${yyyy}-${mm}-${dd}`;

        // Populate currency symbol
        const currency = FinData.config.appInfo?.currency || '₹';
        const currEl = document.getElementById('ql-currency');
        if (currEl) currEl.textContent = currency;

        // Populate accounts dropdown
        const accountSel = document.getElementById('ql-account');
        accountSel.innerHTML = '<option value="">— Select Account —</option>';
        FinData.masters.banks
            .filter(b => b.status === 'Active' && b.isActive !== false && b.canTransferOther !== false)
            .forEach(b => {
                const opt = document.createElement('option');
                opt.value = b.name;
                opt.textContent = b.name;
                accountSel.appendChild(opt);
            });

        // Populate ledger categories
        const catSel = document.getElementById('ql-category');
        catSel.innerHTML = '<option value="">— Select Category —</option>';
        const ledgerCats = FinData.masters.categories['Ledger'] || [];
        ledgerCats.filter(c => c.status !== 'Discontinued').forEach(cat => {
            const subs = cat.subCategories || [];
            if (subs.length === 0) {
                const opt = document.createElement('option');
                opt.value = cat.name;
                opt.textContent = cat.name;
                catSel.appendChild(opt);
            } else {
                subs.forEach(s => {
                    const subName = typeof s === 'string' ? s : s.name;
                    const opt = document.createElement('option');
                    opt.value = `${cat.name}||${subName}`;
                    opt.textContent = `${cat.name} › ${subName}`;
                    catSel.appendChild(opt);
                });
            }
        });

        // Populate modes from mode-pills
        const modeSel = document.getElementById('ql-mode');
        const existingModes = Array.from(document.querySelectorAll('#mode-pills .pill-item')).map(p => p.getAttribute('data-mode')).filter(Boolean);
        if (existingModes.length > 0) {
            modeSel.innerHTML = '<option value="">— Select Mode —</option>';
            existingModes.forEach(m => {
                const opt = document.createElement('option');
                opt.value = m;
                opt.textContent = m;
                modeSel.appendChild(opt);
            });
        }

        modal.style.display = 'flex';
    };

    window.selectQLType = (type) => {
        document.getElementById('ql-entry-type').value = type;
        const btnGiven = document.getElementById('ql-btn-given');
        const btnTaken = document.getElementById('ql-btn-taken');

        if (type === 'given') {
            btnGiven.style.borderWidth = '3px';
            btnGiven.style.background = 'rgba(16,185,129,0.15)';
            btnGiven.style.opacity = '1';
            btnTaken.style.borderWidth = '2px';
            btnTaken.style.background = 'rgba(244,63,94,0.05)';
            btnTaken.style.opacity = '0.6';
        } else {
            btnTaken.style.borderWidth = '3px';
            btnTaken.style.background = 'rgba(244,63,94,0.15)';
            btnTaken.style.opacity = '1';
            btnGiven.style.borderWidth = '2px';
            btnGiven.style.background = 'rgba(16,185,129,0.05)';
            btnGiven.style.opacity = '0.6';
        }
    };

    window.updateQLAmountWords = (val) => {
        const words = amountToWords(val);
        const el = document.getElementById('ql-amount-words');
        if (el) el.textContent = words || '';
    };

    window.closeQuickLedgerModal = () => {
        const modal = document.getElementById('quick-ledger-modal');
        if (modal) modal.style.display = 'none';
    };

    window.saveQuickLedgerEntry = () => {
        const errorEl = document.getElementById('ql-error');
        errorEl.style.display = 'none';

        const person = document.getElementById('ql-person').value.trim();
        const entryType = document.getElementById('ql-entry-type').value;
        const amount = parseFloat(document.getElementById('ql-amount').value);
        const dateVal = document.getElementById('ql-date').value;
        const account = document.getElementById('ql-account').value;
        const mode = document.getElementById('ql-mode').value;
        const catVal = document.getElementById('ql-category').value;
        const note = document.getElementById('ql-note').value.trim();

        // Validate
        const errors = [];
        if (!entryType) errors.push('Please select Entry Type (Debited or Credited).');
        if (!amount || isNaN(amount) || amount <= 0) errors.push('Please enter a valid positive amount.');
        if (!dateVal) errors.push('Please select a date.');
        if (!account) errors.push('Please select an account.');
        if (!mode) errors.push('Please select a transaction mode.');
        if (!catVal) errors.push('Please select a ledger category.');

        if (errors.length > 0) {
            errorEl.innerHTML = errors.map(e => `<div>• ${e}</div>`).join('');
            errorEl.style.display = 'block';
            return;
        }

        // Parse category / subCategory from combined value
        let category = catVal;
        let subCategory = '';
        if (catVal.includes('||')) {
            const parts = catVal.split('||');
            category = parts[0];
            subCategory = parts[1];
        }

        // Determine the subCategory keyword for debited/credited logic
        // If subcategory already has keywords, use them; otherwise synthesize
        const subLower = subCategory.toLowerCase();
        const catLower = category.toLowerCase();
        const hasKeyword = subLower.includes('given') || subLower.includes('taken') ||
                           subLower.includes('debited') || subLower.includes('credited') ||
                           catLower.includes('lend') || catLower.includes('borrow') ||
                           catLower.includes('return');

        if (!hasKeyword) {
            // Append direction hint if no keyword present
            if (entryType === 'given') {
                subCategory = subCategory ? `${subCategory} (Debited)` : 'Loans Debited';
            } else {
                subCategory = subCategory ? `${subCategory} (Credited)` : 'Loans Credited';
            }
        }

        // Build transaction record
        const now = new Date();
        const timeStr = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}:${String(now.getSeconds()).padStart(2,'0')}`;

        const txn = {
            type: 'Ledger',
            category: category,
            subCategory: subCategory,
            secondSubCategory: '',
            bank: account,
            fromBank: null,
            toBank: null,
            person: person,
            mode: mode,
            amount: amount,
            withdrawalAmount: entryType === 'given' ? amount : '',
            depositAmount: entryType === 'taken' ? amount : '',
            date: dateVal,
            time: timeStr,
            note: note || `Quick Ledger Entry: ${entryType === 'given' ? 'Debited to' : 'Credited from'} ${person}`,
            otherDetails: '',
            upiRef: '',
            recordEnteredAs: 'Ledger Dashboard',
            timestamp: now.toISOString()
        };

        // Save transaction
        FinData.addTransaction(txn);

        // Close modal
        closeQuickLedgerModal();

        // Refresh dashboard (real-time balance update) and records
        renderCharts('ledger');
        renderRecords();
        updateDashboard();

        // Brief success toast
        const toast = document.createElement('div');
        toast.textContent = `✓ Entry saved — ${entryType === 'given' ? 'Debited' : 'Credited'} ${formatCurrency(amount)} ${entryType === 'given' ? 'to' : 'from'} ${person}`;
        toast.style.cssText = 'position:fixed; bottom:30px; right:30px; background:rgba(16,185,129,0.95); color:#fff; padding:12px 20px; border-radius:10px; font-weight:600; font-size:13px; z-index:9999; box-shadow:0 4px 20px rgba(16,185,129,0.4); animation: fadeInUp 0.3s ease;';
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 3000);
    };

    // Initialize the app
    init();

    initGmailSync();
});


