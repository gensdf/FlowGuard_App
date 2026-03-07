// ============ DATA MODEL ============
// Accounts keyed by systemId:
// { systemId, password, owner, primarySms, backupSms, alertNumbers, monthlyLimit, monthlyUsed, devices, auditLog, prefs }
function getAllAccounts() {
    var raw = localStorage.getItem('flowguard_accounts');
    return raw ? JSON.parse(raw) : {};
}

function saveAllAccounts(accounts) {
    localStorage.setItem('flowguard_accounts', JSON.stringify(accounts));
}

function getCurrentSystemId() {
    return localStorage.getItem('flowguard_current');
}

function setCurrentSystemId(systemId) {
    if (systemId) localStorage.setItem('flowguard_current', systemId);
    else localStorage.removeItem('flowguard_current');
}

function getAccount() {
    var current = getCurrentSystemId();
    if (!current) return null;
    var accounts = getAllAccounts();
    return accounts[current] || null;
}

function saveAccount(acc) {
    var current = getCurrentSystemId();
    if (!current || !acc) return;
    var accounts = getAllAccounts();
    accounts[current] = acc;
    saveAllAccounts(accounts);
}

function getDevices() {
    var acc = getAccount();
    return (acc && acc.devices) ? acc.devices : [];
}

function saveDevices(devices) {
    var acc = getAccount();
    if (!acc) return;
    acc.devices = devices;
    saveAccount(acc);
}

function getAuditLog() {
    var acc = getAccount();
    return (acc && acc.auditLog) ? acc.auditLog : [];
}

function addAuditEntry(type, message) {
    var acc = getAccount();
    if (!acc) return;
    if (!acc.auditLog) acc.auditLog = [];
    var entry = {
        id: 'evt_' + Date.now() + '_' + Math.floor(Math.random() * 100000),
        time: new Date().toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }),
        type: type,
        message: message
    };
    if (type === 'alert') entry.acked = false;
    acc.auditLog.unshift({
        id: entry.id,
        time: entry.time,
        type: entry.type,
        message: entry.message,
        acked: entry.acked
    });
    if (acc.auditLog.length > 50) acc.auditLog.pop();
    saveAccount(acc);
}

// ============ COMMANDS & FLOW ============
function sendCommand(deviceId, action) {
    var devices = getDevices();
    var dev = devices.find(function (d) { return d.id === deviceId; });
    if (!dev) return;

    if (action === 'OFF') {
        dev.flowRate = 0;
        addAuditEntry('valve', 'Valve shut off via Remote Command (Device: ' + dev.nickname + ')');
        alert('Meter shut off confirmed. Water flow has been stopped.');
    } else {
        dev.flowRate = 1.2;
        addAuditEntry('valve', 'Water flow restored via Remote Command (Device: ' + dev.nickname + ')');
        alert('Meter restore confirmed. Water flow has been restored.');
    }
    saveDevices(devices);
    renderDeviceCards();
    renderInbox();
    updateNotifDot();
}

// ============ RENDER ============
function renderDeviceCards() {
    var container = document.getElementById('device-cards');
    if (!container) return;

    var devices = getDevices();
    if (devices.length === 0) {
        container.innerHTML = '<p class="empty-state">No devices linked. Add one in Settings.</p>';
        return;
    }

    container.innerHTML = devices.map(function (d) {
        var statusClass = d.status === 'online' ? 'online' : 'offline';
        var flowVal = (d.flowRate || 0).toFixed(1);
        var flowColor = d.flowRate > 0 ? '#007bff' : '#6c757d';
        var safeId = escapeHtml(d.id);
        return '<div class="device-card" data-id="' + safeId + '">' +
            '<div class="device-card-header">' +
            '<span class="device-nickname">' + escapeHtml(d.nickname) + '</span>' +
            '<span class="status-text"><span class="status-dot ' + statusClass + '"></span>' + (d.status || 'online') + '</span>' +
            '</div>' +
            '<div class="device-card-detail">' +
            '<div class="device-flow-display" style="color:' + flowColor + '">' + flowVal + ' L/min</div>' +
            '<div class="device-controls" onclick="event.stopPropagation()">' +
            '<button type="button" class="btn-off valve-btn" data-device-id="' + safeId + '" data-action="OFF">Shut Off Valve</button>' +
            '<button type="button" class="btn-on valve-btn" data-device-id="' + safeId + '" data-action="ON">Restore Flow</button>' +
            '</div></div></div>';
    }).join('');

    container.querySelectorAll('.device-card').forEach(function (el) {
        el.addEventListener('click', function (e) {
            if (e.target.closest('.device-controls')) return;
            var card = this;
            var wasExpanded = card.classList.contains('expanded');
            container.querySelectorAll('.device-card').forEach(function (c) { c.classList.remove('expanded'); });
            if (!wasExpanded) card.classList.add('expanded');
        });
    });

    container.querySelectorAll('.valve-btn').forEach(function (btn) {
        btn.addEventListener('click', function (e) {
            e.preventDefault();
            e.stopPropagation();
            var deviceId = btn.getAttribute('data-device-id');
            var action = btn.getAttribute('data-action');
            if (deviceId && action) sendCommand(deviceId, action);
        });
    });
}

function escapeHtml(s) {
    var div = document.createElement('div');
    div.textContent = s;
    return div.innerHTML;
}

function getInitials(name) {
    var n = (name || '').trim();
    if (!n) return 'A';
    var parts = n.split(/\s+/).filter(Boolean);
    var a = parts[0] ? parts[0][0] : 'A';
    var b = parts.length > 1 ? parts[parts.length - 1][0] : '';
    return (a + b).toUpperCase();
}

function updateTopbarProfile() {
    var acc = getAccount();
    var initials = getInitials(acc ? acc.owner : 'Admin');
    var avatar = document.querySelector('.avatar');
    if (avatar) {
        if (acc && acc.profilePicDataUrl) {
            avatar.textContent = '';
            avatar.style.backgroundImage = 'url(' + acc.profilePicDataUrl + ')';
            avatar.style.backgroundSize = 'cover';
            avatar.style.backgroundPosition = 'center';
        } else {
            avatar.textContent = initials;
            avatar.style.backgroundImage = '';
        }
    }
    var drawerAvatar = document.querySelector('.drawer-avatar');
    if (drawerAvatar) {
        if (acc && acc.profilePicDataUrl) {
            drawerAvatar.textContent = '';
            drawerAvatar.style.backgroundImage = 'url(' + acc.profilePicDataUrl + ')';
            drawerAvatar.style.backgroundSize = 'cover';
            drawerAvatar.style.backgroundPosition = 'center';
        } else {
            drawerAvatar.textContent = initials;
            drawerAvatar.style.backgroundImage = '';
        }
    }
}

function updateDrawerHeader() {
    var acc = getAccount();
    if (!acc) return;
    var ownerEl = document.getElementById('drawer-owner');
    var sysEl = document.getElementById('drawer-system');
    if (ownerEl) ownerEl.textContent = acc.owner || 'Admin';
    if (sysEl) sysEl.textContent = 'System: ' + (acc.systemId || '—');
    updateTopbarProfile();
}

function hasUnackedAlerts() {
    var acc = getAccount();
    if (!acc || !acc.auditLog) return false;
    return acc.auditLog.some(function (e) { return e.type === 'alert' && e.acked === false; });
}

function updateNotifDot() {
    var dot = document.getElementById('notif-dot');
    if (!dot) return;
    var acc = getAccount();
    var prefs = (acc && acc.prefs) ? acc.prefs : { app: true };
    if (prefs.app === false) {
        dot.classList.add('hidden');
        return;
    }
    if (hasUnackedAlerts()) dot.classList.remove('hidden');
    else dot.classList.add('hidden');
}

function renderInbox() {
    var thread = document.getElementById('chat-thread');
    if (!thread) return;

    var log = getAuditLog();
    if (!log || log.length === 0) {
        thread.innerHTML = '<p class="empty-state">No alerts yet. Leak and consumption messages will appear here.</p>';
        return;
    }

    thread.innerHTML = log.map(function (e) {
        var isUser = e.type === 'user';
        var bubbleClass = isUser ? 'user' : 'system';
        var ackBtn = '';
        if (e.type === 'alert') {
            var disabled = e.acked ? 'disabled' : '';
            var label = e.acked ? 'Acknowledged' : 'Acknowledge';
            ackBtn = '<div class="bubble-actions"><button type="button" class="btn-ack" data-ack-id="' + escapeHtml(e.id || '') + '" ' + disabled + '>' + label + '</button></div>';
        }
        return '<div class="bubble ' + bubbleClass + '">' +
            '<div>' + escapeHtml(e.message || '') + '</div>' +
            ackBtn +
            '<div class="bubble-meta">' + escapeHtml(e.time || '') + '</div>' +
            '</div>';
    }).join('');

    // Acknowledge handlers
    thread.querySelectorAll('[data-ack-id]').forEach(function (btn) {
        btn.addEventListener('click', function () {
            var id = btn.getAttribute('data-ack-id');
            var acc = getAccount();
            if (!acc || !acc.auditLog) return;
            var evt = acc.auditLog.find(function (x) { return x.id === id; });
            if (evt) evt.acked = true;
            saveAccount(acc);
            addAuditEntry('info', 'Alert acknowledged.');
            renderInbox();
            updateNotifDot();
        });
    });

    // Scroll to top (latest message already first); keep consistent
    thread.scrollTop = 0;
}

function renderWaterBudget() {
    var acc = getAccount();
    if (!acc) return;

    var limit = parseInt(acc.monthlyLimit, 10) || 5000;
    var used = parseInt(acc.monthlyUsed, 10) || 0;
    var pct = Math.min(100, (used / limit) * 100);

    var progressEl = document.getElementById('budget-progress');
    var usedEl = document.getElementById('budget-used');
    var limitEl = document.getElementById('budget-limit');

    if (progressEl) progressEl.style.width = pct + '%';
    if (usedEl) usedEl.textContent = used;
    if (limitEl) limitEl.textContent = limit;
}

function getSustainabilityBadge(acc) {
    var limit = parseInt(acc.monthlyLimit, 10) || 5000;
    var used = parseInt(acc.monthlyUsed, 10) || 0;
    var pct = limit > 0 ? (used / limit) * 100 : 0;

    if (pct <= 50) return 'Water Saver Tier 1';
    if (pct <= 80) return 'Water Saver Tier 2';
    if (pct <= 100) return 'Conscious User';
    return 'Over Budget';
}

function renderDashboard() {
    var acc = getAccount();
    if (!acc) return;

    document.getElementById('account-owner').textContent = acc.owner || 'Admin';
    document.getElementById('sustainability-badge').textContent = getSustainabilityBadge(acc);
    renderWaterBudget();
    renderDeviceCards();
    updateDrawerHeader();
    updateNotifDot();
}

// ============ SHOW / HIDE VIEWS ============
function showDashboard() {
    document.getElementById('login-section').classList.add('hidden');
    document.getElementById('create-account-section').classList.add('hidden');
    document.getElementById('dashboard-container').classList.add('visible');
    setActiveView('dashboard');
    renderDashboard();
    renderInbox();
    renderAccountView();
}

function showLogin() {
    document.getElementById('login-section').classList.remove('hidden');
    document.getElementById('create-account-section').classList.add('hidden');
    document.getElementById('dashboard-container').classList.remove('visible');
    closeDrawer();
    closeFabSheet();
}

function showCreateAccount() {
    document.getElementById('login-section').classList.add('hidden');
    document.getElementById('create-account-section').classList.remove('hidden');
    document.getElementById('dashboard-container').classList.remove('visible');
    closeDrawer();
    closeFabSheet();
}

// ============ NAV / DRAWER / FAB ============
function setActiveView(viewKey) {
    var map = {
        dashboard: 'view-dashboard',
        inbox: 'view-inbox',
        account: 'view-account'
    };
    Object.keys(map).forEach(function (k) {
        var el = document.getElementById(map[k]);
        if (el) el.classList.toggle('active', k === viewKey);
    });
    document.querySelectorAll('.nav-item').forEach(function (btn) {
        btn.classList.toggle('active', btn.getAttribute('data-view') === viewKey);
    });
}

function openDrawer() {
    var drawer = document.getElementById('drawer');
    var backdrop = document.getElementById('drawer-backdrop');
    if (drawer) drawer.classList.add('open');
    if (backdrop) backdrop.classList.remove('hidden');
    updateDrawerHeader();
}

function closeDrawer() {
    var drawer = document.getElementById('drawer');
    var backdrop = document.getElementById('drawer-backdrop');
    if (drawer) drawer.classList.remove('open');
    if (backdrop) backdrop.classList.add('hidden');
}

function toggleFabSheet() {
    var sheet = document.getElementById('fab-sheet');
    if (!sheet) return;
    sheet.classList.toggle('hidden');
}

function closeFabSheet() {
    var sheet = document.getElementById('fab-sheet');
    if (!sheet) return;
    sheet.classList.add('hidden');
}

function renderAccountView() {
    var acc = getAccount();
    if (!acc) return;

    // populate fields
    var owner = document.getElementById('settings-owner');
    var sys = document.getElementById('settings-systemId');
    var primary = document.getElementById('settings-primarySms');
    var limit = document.getElementById('settings-monthlyLimit');
    var used = document.getElementById('settings-monthlyUsed');

    if (owner) owner.value = acc.owner || '';
    if (sys) sys.value = acc.systemId || '—';
    if (primary) primary.value = acc.primarySms || '';
    if (limit) limit.value = acc.monthlyLimit || 5000;
    if (used) used.value = acc.monthlyUsed || 0;

    if (!acc.alertNumbers) acc.alertNumbers = [];
    if (acc.primarySms && acc.alertNumbers.indexOf(acc.primarySms) === -1) acc.alertNumbers.unshift(acc.primarySms);
    saveAccount(acc);

    // prefs
    if (!acc.prefs) acc.prefs = { sms: true, app: true, email: false };
    var pSms = document.getElementById('pref-sms');
    var pApp = document.getElementById('pref-app');
    var pEmail = document.getElementById('pref-email');
    if (pSms) pSms.checked = acc.prefs.sms !== false;
    if (pApp) pApp.checked = acc.prefs.app !== false;
    if (pEmail) pEmail.checked = acc.prefs.email === true;

    // alert numbers list
    var alertList = document.getElementById('alert-numbers-list');
    if (alertList) {
        alertList.innerHTML = (acc.alertNumbers || []).map(function (num, i) {
            return '<div class="alert-number-item"><span>' + escapeHtml(num) + '</span><button type="button" class="btn-remove" data-index="' + i + '">Remove</button></div>';
        }).join('') || '<p class="empty-hint">No numbers added yet.</p>';

        alertList.querySelectorAll('.btn-remove').forEach(function (btn) {
            btn.addEventListener('click', function () {
                var acc = getAccount();
                if (!acc) return;
                if (!acc.alertNumbers) acc.alertNumbers = [];
                var idx = parseInt(btn.getAttribute('data-index'), 10);
                var removed = acc.alertNumbers[idx];
                if (removed && acc.primarySms && removed === acc.primarySms) {
                    alert('Primary SMS cannot be removed here. Update the Primary Mobile Number instead.');
                    return;
                }
                acc.alertNumbers.splice(idx, 1);
                saveAccount(acc);
                addAuditEntry('info', 'Alert number removed: ' + (removed || ''));
                renderAccountView();
            });
        });
    }

    // linked devices list
    var list = document.getElementById('settings-devices-list');
    if (list) {
        var devices = getDevices();
        list.innerHTML = devices.map(function (d) {
            return '<div class="settings-device-item" data-id="' + escapeHtml(d.id) + '">' +
                '<input type="text" value="' + escapeHtml(d.nickname) + '" placeholder="Device nickname" data-device-nickname>' +
                '<button type="button" class="btn-mini" data-remove-device>Remove</button></div>';
        }).join('') || '<p class="empty-hint">No devices linked.</p>';

        list.querySelectorAll('[data-remove-device]').forEach(function (btn) {
            btn.addEventListener('click', function () {
                var id = btn.closest('.settings-device-item').getAttribute('data-id');
                var devs = getDevices().filter(function (d) { return d.id !== id; });
                saveDevices(devs);
                addAuditEntry('info', 'Device removed: ' + id);
                renderAccountView();
                renderDeviceCards();
            });
        });

        list.querySelectorAll('[data-device-nickname]').forEach(function (inp) {
            inp.addEventListener('blur', function () {
                var id = inp.closest('.settings-device-item').getAttribute('data-id');
                var devs = getDevices();
                var d = devs.find(function (x) { return x.id === id; });
                if (d) {
                    d.nickname = inp.value.trim() || d.nickname;
                    saveDevices(devs);
                    renderDeviceCards();
                }
            });
        });
    }

    updateDrawerHeader();
    updateNotifDot();
}

// ============ INIT ============
document.addEventListener('DOMContentLoaded', function () {
    // Migrate old single-account format to new multi-account format (one-time)
    var oldAcc = localStorage.getItem('flowguard_account');
    if (oldAcc && !localStorage.getItem('flowguard_accounts')) {
        try {
            var acc = JSON.parse(oldAcc);
            var accounts = {};
            var nums = [];
            if (acc.primarySms) nums.push(acc.primarySms);
            if (acc.backupSms && nums.indexOf(acc.backupSms) === -1) nums.push(acc.backupSms);
            accounts[acc.systemId || 'FG-001'] = {
                systemId: acc.systemId || 'FG-001',
                password: 'flowguard',
                owner: acc.owner || 'Admin',
                primarySms: acc.primarySms || '',
                backupSms: acc.backupSms || '',
                alertNumbers: nums.length ? nums : [],
                monthlyLimit: acc.monthlyLimit || 5000,
                monthlyUsed: acc.monthlyUsed || 1280,
                devices: JSON.parse(localStorage.getItem('flowguard_devices') || '[]'),
                auditLog: JSON.parse(localStorage.getItem('flowguard_auditLog') || '[]')
            };
            saveAllAccounts(accounts);
            setCurrentSystemId(acc.systemId || 'FG-001');
            localStorage.removeItem('flowguard_account');
            localStorage.removeItem('flowguard_devices');
            localStorage.removeItem('flowguard_auditLog');
        } catch (e) {}
    }

    var current = getCurrentSystemId();
    if (current && getAccount()) {
        showDashboard();
    } else {
        setCurrentSystemId(null);
        showLogin();
    }

    // Login form — only accounts created via "Create account / Link device" can log in
    document.getElementById('loginForm').addEventListener('submit', function (e) {
        e.preventDefault();
        var systemID = document.getElementById('login-systemID').value.trim();
        var password = document.getElementById('login-password').value;
        if (!systemID || !password) return;

        var accounts = getAllAccounts();
        var acc = accounts[systemID];
        if (!acc || acc.password !== password) {
            alert('Invalid credentials.');
            return;
        }
        setCurrentSystemId(systemID);
        showDashboard();
    });

    // Create account / Link device form
    document.getElementById('createAccountForm').addEventListener('submit', function (e) {
        e.preventDefault();
        var systemID = document.getElementById('create-systemID').value.trim();
        var password = document.getElementById('create-password').value;
        var owner = document.getElementById('create-owner').value.trim() || 'Admin';
        var phone = document.getElementById('create-phone').value.trim();
        if (!systemID || !password || !phone) return;

        var accounts = getAllAccounts();
        if (accounts[systemID]) {
            alert('This System ID is already registered. Log in instead.');
            return;
        }

        var account = {
            systemId: systemID,
            password: password,
            owner: owner,
            primarySms: phone,
            backupSms: '',
            alertNumbers: [phone],
            monthlyLimit: 5000,
            monthlyUsed: 1280,
            devices: [{
                id: systemID,
                nickname: 'Main Line',
                status: 'online',
                flowRate: 0
            }],
            auditLog: [],
            prefs: { sms: true, app: true, email: false }
        };
        accounts[systemID] = account;
        saveAllAccounts(accounts);
        setCurrentSystemId(systemID);

        addAuditEntry('info', 'Account created. Device ' + systemID + ' linked. Primary SMS: ' + phone);
        addAuditEntry('alert', '60-Minute Leak Alert sent to ' + phone);
        addAuditEntry('valve', 'Valve shut off via Remote Command (Device: Main Line)');

        showDashboard();
    });

    // Toggle between login and create account
    document.getElementById('show-create-account').addEventListener('click', function (e) { e.preventDefault(); showCreateAccount(); });
    document.getElementById('show-link-device').addEventListener('click', function (e) { e.preventDefault(); showCreateAccount(); });
    document.getElementById('show-login').addEventListener('click', function (e) { e.preventDefault(); showLogin(); });

    // Drawer / profile hub
    var profileBtn = document.getElementById('profile-btn');
    if (profileBtn) profileBtn.addEventListener('click', function () {
        if (!getAccount()) return;
        openDrawer();
    });
    var drawerClose = document.getElementById('drawer-close');
    if (drawerClose) drawerClose.addEventListener('click', closeDrawer);
    var backdrop = document.getElementById('drawer-backdrop');
    if (backdrop) backdrop.addEventListener('click', closeDrawer);

    document.querySelectorAll('.drawer-item[data-go]').forEach(function (btn) {
        btn.addEventListener('click', function () {
            var go = btn.getAttribute('data-go');
            closeDrawer();
            if (go === 'inbox') setActiveView('inbox');
            else if (go === 'account' || go === 'security' || go === 'hardware') setActiveView('account');
        });
    });

    var drawerLogout = document.getElementById('drawer-logout');
    if (drawerLogout) drawerLogout.addEventListener('click', function () {
        if (!confirm('Log out?')) return;
        setCurrentSystemId(null);
        closeDrawer();
        showLogin();
    });

    // Bell opens inbox
    var bell = document.getElementById('notif-btn');
    if (bell) bell.addEventListener('click', function () {
        if (!getAccount()) return;
        setActiveView('inbox');
    });

    // Bottom nav
    document.querySelectorAll('.nav-item').forEach(function (btn) {
        btn.addEventListener('click', function () {
            var v = btn.getAttribute('data-view');
            setActiveView(v);
            if (v === 'inbox') renderInbox();
            if (v === 'account') renderAccountView();
        });
    });

    // Accordion toggles
    document.querySelectorAll('.acc-toggle').forEach(function (btn) {
        btn.addEventListener('click', function () {
            var key = btn.getAttribute('data-acc');
            var panel = document.querySelector('.acc-panel[data-panel="' + key + '"]');
            if (panel) panel.classList.toggle('open');
        });
    });

    // Profile photo upload/remove
    var uploadBtn = document.getElementById('upload-profile-pic-btn');
    var removeBtn = document.getElementById('remove-profile-pic-btn');
    var fileInput = document.getElementById('profile-pic-input');

    function triggerPickPhoto() {
        if (!getAccount()) return;
        if (fileInput) fileInput.click();
    }

    if (uploadBtn) uploadBtn.addEventListener('click', triggerPickPhoto);
    if (profileBtn) profileBtn.addEventListener('dblclick', function () {
        // quick shortcut: double-click avatar to change photo
        triggerPickPhoto();
    });

    if (fileInput) fileInput.addEventListener('change', function () {
        var acc = getAccount();
        if (!acc) return;
        var file = fileInput.files && fileInput.files[0];
        if (!file) return;
        if (!file.type || file.type.indexOf('image/') !== 0) {
            alert('Please choose an image file.');
            fileInput.value = '';
            return;
        }
        var maxBytes = 1024 * 1024 * 1.5; // 1.5MB
        if (file.size > maxBytes) {
            alert('Image is too large. Please use an image under 1.5MB.');
            fileInput.value = '';
            return;
        }
        var reader = new FileReader();
        reader.onload = function () {
            acc.profilePicDataUrl = String(reader.result || '');
            saveAccount(acc);
            fileInput.value = '';
            updateTopbarProfile();
            updateDrawerHeader();
            addAuditEntry('info', 'Profile photo updated.');
        };
        reader.readAsDataURL(file);
    });

    if (removeBtn) removeBtn.addEventListener('click', function () {
        var acc = getAccount();
        if (!acc) return;
        if (!acc.profilePicDataUrl) {
            alert('No profile photo to remove.');
            return;
        }
        if (!confirm('Remove profile photo?')) return;
        delete acc.profilePicDataUrl;
        saveAccount(acc);
        updateTopbarProfile();
        updateDrawerHeader();
        addAuditEntry('info', 'Profile photo removed.');
    });

    // Update primary SMS
    document.getElementById('update-sms-btn').addEventListener('click', function () {
        var acc = getAccount();
        if (!acc) return;
        var newPrimary = document.getElementById('settings-primarySms').value.trim();
        acc.primarySms = newPrimary;
        if (!acc.alertNumbers) acc.alertNumbers = [];
        if (newPrimary && acc.alertNumbers.indexOf(newPrimary) === -1) acc.alertNumbers.unshift(newPrimary);
        saveAccount(acc);
        addAuditEntry('info', 'Primary SMS updated: ' + (newPrimary || '—'));
        alert('Primary SMS updated.');
        renderAccountView();
    });

    // Add alert number
    document.getElementById('add-alert-number-btn').addEventListener('click', function () {
        var acc = getAccount();
        if (!acc) return;
        var inp = document.getElementById('new-alert-number');
        var num = inp.value.trim();
        if (!num) { alert('Enter a mobile number.'); return; }
        if (!acc.alertNumbers) acc.alertNumbers = [];
        if (acc.alertNumbers.indexOf(num) !== -1) { alert('This number is already registered.'); return; }
        var primary = acc.primarySms || '';
        var extras = acc.alertNumbers.filter(function (n) { return n && n !== primary; });
        if (extras.length >= 4) {
            alert('You can only add up to 4 extra authorized numbers.');
            return;
        }
        acc.alertNumbers.push(num);
        saveAccount(acc);
        addAuditEntry('info', 'Alert number added: ' + num);
        inp.value = '';
        renderAccountView();
    });

    // Monthly limit & usage
    function updateBudgetFromSettings() {
        var acc = getAccount();
        if (!acc) return;
        var limit = parseInt(document.getElementById('settings-monthlyLimit').value, 10);
        var used = parseInt(document.getElementById('settings-monthlyUsed').value, 10);
        if (!isNaN(limit) && limit > 0) acc.monthlyLimit = limit;
        if (!isNaN(used) && used >= 0) acc.monthlyUsed = used;
        saveAccount(acc);
        renderWaterBudget();
        updateDrawerHeader();
    }
    document.getElementById('settings-monthlyLimit').addEventListener('blur', updateBudgetFromSettings);
    document.getElementById('settings-monthlyUsed').addEventListener('blur', updateBudgetFromSettings);

    // Owner name save on blur
    var ownerInp = document.getElementById('settings-owner');
    if (ownerInp) ownerInp.addEventListener('blur', function () {
        var acc = getAccount();
        if (!acc) return;
        acc.owner = ownerInp.value.trim() || 'Admin';
        saveAccount(acc);
        addAuditEntry('info', 'Profile updated.');
        renderDashboard();
        renderAccountView();
    });

    // Notification prefs
    function savePrefs() {
        var acc = getAccount();
        if (!acc) return;
        if (!acc.prefs) acc.prefs = { sms: true, app: true, email: false };
        var pSms = document.getElementById('pref-sms');
        var pApp = document.getElementById('pref-app');
        var pEmail = document.getElementById('pref-email');
        acc.prefs.sms = pSms ? pSms.checked : true;
        acc.prefs.app = pApp ? pApp.checked : true;
        acc.prefs.email = pEmail ? pEmail.checked : false;
        saveAccount(acc);
        addAuditEntry('info', 'Notification preferences updated.');
        updateNotifDot();
    }
    ['pref-sms', 'pref-app', 'pref-email'].forEach(function (id) {
        var el = document.getElementById(id);
        if (el) el.addEventListener('change', savePrefs);
    });

    // Add device
    document.getElementById('add-device-btn').addEventListener('click', function () {
        var nickname = prompt('Device nickname (e.g. "Garden Line"):');
        if (!nickname) return;
        var id = 'FG-' + Date.now();
        var devices = getDevices();
        devices.push({ id: id, nickname: nickname.trim(), status: 'online', flowRate: 0 });
        saveDevices(devices);
        addAuditEntry('info', 'Device "' + nickname + '" added.');
        renderDashboard();
        renderAccountView();
    });

    // Unlink account
    document.getElementById('unlink-account-btn').addEventListener('click', function () {
        if (!confirm('Unlink account? This removes saved credentials and devices for this System ID.')) return;
        var current = getCurrentSystemId();
        if (current) {
            var accounts = getAllAccounts();
            delete accounts[current];
            saveAllAccounts(accounts);
        }
        setCurrentSystemId(null);
        closeDrawer();
        showLogin();
    });

    // Security: change password (local demo)
    var savePassBtn = document.getElementById('security-save-pass');
    if (savePassBtn) savePassBtn.addEventListener('click', function () {
        var acc = getAccount();
        if (!acc) return;
        var newPass = document.getElementById('security-new-pass').value;
        if (!newPass) { alert('Enter a new password.'); return; }
        acc.password = newPass;
        saveAccount(acc);
        document.getElementById('security-new-pass').value = '';
        addAuditEntry('info', 'Password updated.');
        alert('Password updated.');
    });

    // Inbox reply (demo)
    var replyForm = document.getElementById('chat-reply-form');
    if (replyForm) replyForm.addEventListener('submit', function (e) {
        e.preventDefault();
        var inp = document.getElementById('chat-reply-input');
        var txt = (inp.value || '').trim();
        if (!txt) return;
        var acc = getAccount();
        if (!acc) return;
        if (!acc.auditLog) acc.auditLog = [];
        acc.auditLog.unshift({
            id: 'msg_' + Date.now(),
            time: new Date().toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }),
            type: 'user',
            message: txt
        });
        saveAccount(acc);
        inp.value = '';
        renderInbox();
    });

    // FAB quick actions
    var fab = document.getElementById('fab');
    if (fab) fab.addEventListener('click', toggleFabSheet);
    var fabCancel = document.getElementById('fab-cancel');
    if (fabCancel) fabCancel.addEventListener('click', closeFabSheet);
    var fabShut = document.getElementById('fab-shutoff');
    if (fabShut) fabShut.addEventListener('click', function () {
        closeFabSheet();
        var devices = getDevices();
        if (devices[0]) sendCommand(devices[0].id, 'OFF');
    });
    var fabRes = document.getElementById('fab-restore');
    if (fabRes) fabRes.addEventListener('click', function () {
        closeFabSheet();
        var devices = getDevices();
        if (devices[0]) sendCommand(devices[0].id, 'ON');
    });
    var fabRep = document.getElementById('fab-report');
    if (fabRep) fabRep.addEventListener('click', function () {
        closeFabSheet();
        var issue = prompt('Report an issue (demo):');
        if (!issue) return;
        addAuditEntry('info', 'Issue reported: ' + issue);
        renderInbox();
        updateNotifDot();
        alert('Issue submitted (demo).');
    });

    // Seed sample audit entries for demo (only if account exists and log is empty)
    var acc = getAccount();
    if (acc && getAuditLog().length === 0) {
        addAuditEntry('valve', 'Valve shut off via Remote Command (Device: Main Line)');
        addAuditEntry('alert', '60-Minute Leak Alert sent to +639171234567');
        addAuditEntry('info', 'Account created. Device linked.');
    }
});
