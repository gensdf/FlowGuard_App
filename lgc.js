/* =====================================================
   FLOWGUARD FRONTEND
   Browser-based demonstration only.
   No Firebase or physical ESP32 connection yet.
===================================================== */

/* ==================== STORAGE ==================== */

function getAllAccounts() {
    try {
        return JSON.parse(localStorage.getItem('flowguard_accounts')) || {};
    } catch (error) {
        return {};
    }
}

function saveAllAccounts(accounts) {
    localStorage.setItem('flowguard_accounts', JSON.stringify(accounts));
}

function getCurrentSystemId() {
    return localStorage.getItem('flowguard_current');
}

function setCurrentSystemId(id) {
    if (id) localStorage.setItem('flowguard_current', id);
    else localStorage.removeItem('flowguard_current');
}

function getAccount() {
    var id = getCurrentSystemId();
    return id ? getAllAccounts()[id] || null : null;
}

function saveAccount(account) {
    if (!account || !account.systemId) return;

    var accounts = getAllAccounts();
    accounts[account.systemId] = account;
    saveAllAccounts(accounts);
}

function getDevices() {
    var account = getAccount();
    return account && Array.isArray(account.devices) ? account.devices : [];
}

function saveDevices(devices) {
    var account = getAccount();
    if (!account) return;

    account.devices = devices;
    saveAccount(account);
}

function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (char) {
        return {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#039;'
        }[char];
    });
}

function formatNumber(value) {
    return Math.round(Number(value) || 0).toLocaleString('en-PH');
}

function formatPeso(value) {
    return '₱' + (Number(value) || 0).toLocaleString('en-PH', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });
}

function localDateKey(date) {
    return date.getFullYear() + '-' +
        String(date.getMonth() + 1).padStart(2, '0') + '-' +
        String(date.getDate()).padStart(2, '0');
}

function getInitials(name) {
    var parts = String(name || 'Admin').trim().split(/\s+/);
    return (
        (parts[0] ? parts[0][0] : 'A') +
        (parts.length > 1 ? parts[parts.length - 1][0] : '')
    ).toUpperCase();
}

/* ==================== ACCOUNT DEFAULTS ==================== */

function normalizeAccount(account) {
    if (!account.devices) account.devices = [];
    if (!account.auditLog) account.auditLog = [];
    if (!account.alertNumbers) account.alertNumbers = [];

    if (!account.prefs) {
        account.prefs = {
            sms: true,
            app: true,
            email: false
        };
    }

    if (!account.usageHistory) account.usageHistory = [];

    if (!account.flowThresholdMinutes) {
        account.flowThresholdMinutes = 60;
    }

    if (typeof account.autoShutoffEnabled !== 'boolean') {
        account.autoShutoffEnabled = true;
    }

    if (typeof account.waterRatePerCubicMeter !== 'number') {
        account.waterRatePerCubicMeter = 0;
    }

    if (!account.monthlyLimit) account.monthlyLimit = 5000;
    if (typeof account.monthlyUsed !== 'number') account.monthlyUsed = 0;

    account.devices.forEach(function (device) {
        if (typeof device.flowRate !== 'number') device.flowRate = 0;
        if (!device.demoValveState) device.demoValveState = 'UNKNOWN';
        if (!device.status) device.status = 'offline';
    });

    return account;
}

/* ==================== AUDIT LOG ==================== */

function addAuditEntry(type, message, extra) {
    var account = getAccount();
    if (!account) return;

    if (!account.auditLog) account.auditLog = [];

    var entry = {
        id: 'evt_' + Date.now() + '_' + Math.floor(Math.random() * 100000),
        time: new Date().toLocaleString('en-PH', {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        }),
        timestamp: Date.now(),
        type: type,
        message: message
    };

    if (type === 'alert') {
        entry.acked = false;
    }

    if (extra) {
        Object.assign(entry, extra);
    }

    account.auditLog.unshift(entry);
    account.auditLog = account.auditLog.slice(0, 100);

    saveAccount(account);
    updateNotifDot();
}

/* ==================== SAMPLE USAGE DATA ==================== */

/*
   This generates illustrative sample records for the prototype.
   These values are NOT actual sensor readings.
*/

function ensureUsageHistory(account) {
    if (!account.usageHistory) account.usageHistory = [];
    if (account.usageHistory.length > 0) return;

    var now = new Date();

    var monthlySamples = [3420, 3180, 3650, 3010, 3890, 1280];

    for (var offset = 5; offset >= 0; offset--) {
        var monthDate = new Date(
            now.getFullYear(),
            now.getMonth() - offset,
            1
        );

        var monthTotal = monthlySamples[5 - offset];

        var daysInMonth = offset === 0
            ? now.getDate()
            : new Date(
                monthDate.getFullYear(),
                monthDate.getMonth() + 1,
                0
            ).getDate();

        var weights = [];
        var weightTotal = 0;

        for (var day = 1; day <= daysInMonth; day++) {
            var weight = 0.7 + (((day * 17 + offset * 11) % 60) / 100);
            weights.push(weight);
            weightTotal += weight;
        }

        var assigned = 0;

        for (var index = 0; index < daysInMonth; index++) {
            var date = new Date(
                monthDate.getFullYear(),
                monthDate.getMonth(),
                index + 1
            );

            var liters = Math.round(
                monthTotal * weights[index] / weightTotal
            );

            if (index === daysInMonth - 1) {
                liters += monthTotal - assigned;
            }

            assigned += liters;

            account.usageHistory.push({
                date: localDateKey(date),
                liters: Math.max(0, liters)
            });
        }
    }

    account.monthlyUsed = getMonthlyUsage(
        account.usageHistory,
        now.getFullYear(),
        now.getMonth()
    );

    saveAccount(account);
}

function getMonthlyUsage(history, year, month) {
    var prefix = year + '-' + String(month + 1).padStart(2, '0');

    return (history || [])
        .filter(function (record) {
            return record.date.slice(0, 7) === prefix;
        })
        .reduce(function (total, record) {
            return total + Number(record.liters || 0);
        }, 0);
}

function getDailyUsage(history, dateKey) {
    return (history || [])
        .filter(function (record) {
            return record.date === dateKey;
        })
        .reduce(function (total, record) {
            return total + Number(record.liters || 0);
        }, 0);
}

/* ==================== NAVIGATION ==================== */

function setActiveView(viewName) {
    var views = {
        dashboard: 'view-dashboard',
        usage: 'view-usage',
        inbox: 'view-inbox',
        account: 'view-account'
    };

    Object.keys(views).forEach(function (key) {
        var element = document.getElementById(views[key]);

        if (element) {
            element.classList.toggle('active', key === viewName);
        }
    });

    document.querySelectorAll('.nav-item').forEach(function (button) {
        button.classList.toggle(
            'active',
            button.dataset.view === viewName
        );
    });

    closeFabSheet();

    if (viewName === 'dashboard') renderDashboard();
    if (viewName === 'usage') renderConsumptionAnalytics();
    if (viewName === 'inbox') renderInbox();
    if (viewName === 'account') renderAccountView();
}

function showDashboard() {
    document.getElementById('login-section').classList.add('hidden');
    document.getElementById('create-account-section').classList.add('hidden');
    document.getElementById('dashboard-container').classList.add('visible');

    var account = getAccount();
    if (account) {
        normalizeAccount(account);
        ensureUsageHistory(account);
        saveAccount(account);
    }

    setActiveView('dashboard');
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
}

/* ==================== DRAWER ==================== */

function openDrawer() {
    document.getElementById('drawer').classList.add('open');
    document.getElementById('drawer-backdrop').classList.remove('hidden');
    updateDrawerHeader();
}

function closeDrawer() {
    document.getElementById('drawer').classList.remove('open');
    document.getElementById('drawer-backdrop').classList.add('hidden');
}

function updateDrawerHeader() {
    var account = getAccount();
    if (!account) return;

    document.getElementById('drawer-owner').textContent = account.owner || 'Admin';
    document.getElementById('drawer-system').textContent =
        'System: ' + (account.systemId || '—');

    var initials = getInitials(account.owner);
    var avatar = document.querySelector('.avatar');
    var drawerAvatar = document.querySelector('.drawer-avatar');

    [avatar, drawerAvatar].forEach(function (element) {
        if (!element) return;

        if (account.profilePicDataUrl) {
            element.textContent = '';
            element.style.backgroundImage =
                'url("' + account.profilePicDataUrl + '")';
            element.style.backgroundSize = 'cover';
            element.style.backgroundPosition = 'center';
        } else {
            element.textContent = initials;
            element.style.backgroundImage = '';
        }
    });
}

/* ==================== NOTIFICATIONS ==================== */

function hasUnackedAlerts() {
    var account = getAccount();
    if (!account) return false;

    return account.auditLog.some(function (entry) {
        return entry.type === 'alert' && !entry.acked;
    });
}

function updateNotifDot() {
    var account = getAccount();
    var show = !!(
        account &&
        account.prefs &&
        account.prefs.app !== false &&
        hasUnackedAlerts()
    );

    var topDot = document.getElementById('notif-dot');
    var navDot = document.getElementById('nav-alert-dot');

    if (topDot) topDot.classList.toggle('hidden', !show);
    if (navDot) navDot.classList.toggle('hidden', !show);
}

/* ==================== DEVICE CARDS ==================== */

function renderDeviceCards() {
    var container = document.getElementById('device-cards');
    if (!container) return;

    var devices = getDevices();

    if (devices.length === 0) {
        container.innerHTML =
            '<p class="empty-state">No devices linked. Add a device in Settings.</p>';
        return;
    }

    container.innerHTML = devices.map(function (device) {
        var flow = Number(device.flowRate || 0);
        var valveState = device.demoValveState || 'UNKNOWN';

        return `
            <article class="device-card">
                <div class="device-card-header">
                    <span class="device-nickname">${escapeHtml(device.nickname)}</span>
                    <span class="status-text">
                        <i class="status-dot ${device.status === 'online' ? 'online' : ''}"></i>
                        ${escapeHtml(device.status || 'offline')}
                    </span>
                </div>

                <div class="device-flow-display">${flow.toFixed(1)} L/min</div>

                <p class="device-state-note">
                    Demo valve state: ${escapeHtml(valveState)}
                </p>

                <div class="device-controls">
                    <button class="btn-off valve-btn"
                        data-device-id="${escapeHtml(device.id)}"
                        data-action="OFF">
                        Shut Off Valve
                    </button>

                    <button class="btn-on valve-btn"
                        data-device-id="${escapeHtml(device.id)}"
                        data-action="ON">
                        Restore Flow
                    </button>
                </div>
            </article>
        `;
    }).join('');

    container.querySelectorAll('.valve-btn').forEach(function (button) {
        button.addEventListener('click', function () {
            sendCommand(
                button.dataset.deviceId,
                button.dataset.action
            );
        });
    });
}

function sendCommand(deviceId, action) {
    var devices = getDevices();
    var device = devices.find(function (item) {
        return item.id === deviceId;
    });

    if (!device) return;

    if (action === 'OFF') {
        device.flowRate = 0;
        device.demoValveState = 'CLOSED';

        addAuditEntry(
            'valve',
            'Demo valve close command requested for ' + device.nickname +
            '. No physical valve was controlled.'
        );

        alert('Demo only: the valve state was changed locally. No physical valve was controlled.');
    } else {
        device.flowRate = 1.2;
        device.demoValveState = 'OPEN';

        addAuditEntry(
            'valve',
            'Demo valve open command requested for ' + device.nickname +
            '. No physical valve was controlled.'
        );

        alert('Demo only: the valve state was changed locally. No physical valve was controlled.');
    }

    saveDevices(devices);
    renderDashboard();
}

/* ==================== HOME DASHBOARD ==================== */

function getSustainabilityBadge(account) {
    var limit = Number(account.monthlyLimit) || 5000;
    var used = Number(account.monthlyUsed) || 0;
    var percentage = limit > 0 ? used / limit * 100 : 0;

    if (percentage <= 50) return 'Water Saver Tier 1';
    if (percentage <= 80) return 'Water Saver Tier 2';
    if (percentage <= 100) return 'Conscious User';
    return 'Over Budget';
}

function renderWaterBudget() {
    var account = getAccount();
    if (!account) return;

    var limit = Number(account.monthlyLimit) || 5000;

    var now = new Date();
    var used = getMonthlyUsage(
        account.usageHistory,
        now.getFullYear(),
        now.getMonth()
    );

    account.monthlyUsed = used;
    saveAccount(account);

    var percentage = Math.min(100, used / limit * 100);

    document.getElementById('budget-used').textContent = formatNumber(used);
    document.getElementById('budget-limit').textContent = formatNumber(limit);
    document.getElementById('budget-progress').style.width = percentage + '%';

    document.getElementById('budget-caption').textContent =
        percentage > 100
            ? 'You have exceeded your monthly water limit.'
            : Math.round(percentage) + '% of your monthly water limit used.';
}

function renderHomeOverview() {
    var account = getAccount();
    if (!account) return;

    ensureUsageHistory(account);

    var devices = account.devices || [];

    var totalFlow = devices.reduce(function (sum, device) {
        return sum + Number(device.flowRate || 0);
    }, 0);

    var valveStates = devices.map(function (device) {
        return device.demoValveState || 'UNKNOWN';
    });

    var valveStatus = 'Unknown';

    if (valveStates.length && valveStates.every(function (state) {
        return state === 'CLOSED';
    })) {
        valveStatus = 'Closed';
    } else if (valveStates.length && valveStates.every(function (state) {
        return state === 'OPEN';
    })) {
        valveStatus = 'Open';
    } else if (valveStates.some(function (state) {
        return state === 'OPEN';
    })) {
        valveStatus = 'Mixed';
    }

    var today = localDateKey(new Date());
    var todayUsage = getDailyUsage(account.usageHistory, today);

    var now = new Date();
    var monthUsage = getMonthlyUsage(
        account.usageHistory,
        now.getFullYear(),
        now.getMonth()
    );

    document.getElementById('home-flow-rate').textContent = totalFlow.toFixed(1);
    document.getElementById('home-today-usage').textContent = formatNumber(todayUsage);
    document.getElementById('home-valve-status').textContent = valveStatus;
    document.getElementById('home-valve-description').textContent =
        'Demo valve state';

    document.getElementById('home-month-usage').textContent =
        formatNumber(monthUsage);

    var threshold = Number(account.flowThresholdMinutes) || 60;

    document.getElementById('home-protection-status').textContent =
        'Continuous-flow alert threshold: ' + threshold +
        ' minutes. Automatic shutoff is ' +
        (account.autoShutoffEnabled ? 'enabled' : 'disabled') +
        ' in demo settings.';
}

function renderDashboard() {
    var account = getAccount();
    if (!account) return;

    normalizeAccount(account);
    ensureUsageHistory(account);

    document.getElementById('account-owner').textContent =
        account.owner || 'Admin';

    document.getElementById('sustainability-badge').textContent =
        getSustainabilityBadge(account);

    renderWaterBudget();
    renderHomeOverview();
    renderDeviceCards();
    updateDrawerHeader();
    updateNotifDot();
}

/* ==================== CHART DRAWING ==================== */

function drawChart(canvas, labels, values, type) {
    if (!canvas) return;

    var width = Math.max(260, canvas.clientWidth || 300);
    var height = 230;
    var ratio = window.devicePixelRatio || 1;

    canvas.width = width * ratio;
    canvas.height = height * ratio;
    canvas.style.height = height + 'px';

    var ctx = canvas.getContext('2d');
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, width, height);

    var padding = {
        left: 42,
        right: 12,
        top: 12,
        bottom: 34
    };

    var plotWidth = width - padding.left - padding.right;
    var plotHeight = height - padding.top - padding.bottom;

    var maxValue = Math.max(1, ...values);
    var maxAxis = Math.ceil(maxValue / 500) * 500;
    if (maxAxis === 0) maxAxis = 500;

    ctx.font = '10px Inter, Arial';
    ctx.textAlign = 'right';
    ctx.fillStyle = '#8994a2';

    for (var tick = 0; tick <= 4; tick++) {
        var y = padding.top + plotHeight - plotHeight * tick / 4;

        ctx.strokeStyle = '#edf1f5';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(padding.left, y);
        ctx.lineTo(width - padding.right, y);
        ctx.stroke();

        ctx.fillText(
            formatNumber(maxAxis * tick / 4),
            padding.left - 7,
            y + 3
        );
    }

    if (!values.length) return;

    if (type === 'bar') {
        var slot = plotWidth / values.length;
        var barWidth = Math.min(28, slot * .58);

        values.forEach(function (value, index) {
            var barHeight = Math.max(0, value / maxAxis * plotHeight);
            var x = padding.left + index * slot + (slot - barWidth) / 2;
            var y = padding.top + plotHeight - barHeight;

            ctx.fillStyle = '#1684d8';
            ctx.beginPath();
            ctx.roundRect(x, y, barWidth, barHeight, 5);
            ctx.fill();

            ctx.fillStyle = '#748398';
            ctx.textAlign = 'center';
            ctx.fillText(
                labels[index],
                x + barWidth / 2,
                height - 12
            );
        });
    } else {
        var step = plotWidth / Math.max(1, values.length - 1);

        ctx.beginPath();
        ctx.strokeStyle = '#1684d8';
        ctx.lineWidth = 2.5;

        values.forEach(function (value, index) {
            var x = padding.left + index * step;
            var y = padding.top + plotHeight - value / maxAxis * plotHeight;

            if (index === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        });

        ctx.stroke();

        values.forEach(function (value, index) {
            var x = padding.left + index * step;
            var y = padding.top + plotHeight - value / maxAxis * plotHeight;

            ctx.beginPath();
            ctx.fillStyle = '#1684d8';
            ctx.arc(x, y, 3, 0, Math.PI * 2);
            ctx.fill();

            var interval = Math.max(1, Math.ceil(values.length / 8));

            if (index % interval === 0 || index === values.length - 1) {
                ctx.fillStyle = '#748398';
                ctx.textAlign = 'center';
                ctx.fillText(labels[index], x, height - 12);
            }
        });
    }
}

/* ==================== USAGE ANALYTICS ==================== */

function renderConsumptionAnalytics() {
    var account = getAccount();
    if (!account) return;

    ensureUsageHistory(account);

    var history = account.usageHistory || [];
    var now = new Date();

    var thisMonth = getMonthlyUsage(
        history,
        now.getFullYear(),
        now.getMonth()
    );

    var previousDate = new Date(
        now.getFullYear(),
        now.getMonth() - 1,
        1
    );

    var previousMonth = getMonthlyUsage(
        history,
        previousDate.getFullYear(),
        previousDate.getMonth()
    );

    var rate = Number(account.waterRatePerCubicMeter) || 0;
    var bill = thisMonth / 1000 * rate;

    document.getElementById('usage-current-month').textContent =
        formatNumber(thisMonth) + ' L';

    document.getElementById('usage-previous-month').textContent =
        formatNumber(previousMonth) + ' L';

    document.getElementById('usage-highlight-bill').textContent =
        formatPeso(bill);

    document.getElementById('usage-highlight-value').textContent =
        formatNumber(thisMonth) + ' L';

    var comparisonText = 'No previous-month data available.';

    if (previousMonth > 0) {
        var difference = (thisMonth - previousMonth) / previousMonth * 100;

        comparisonText =
            (difference > 0 ? '+' : '') +
            difference.toFixed(1) +
            '% compared with previous month';
    }

    document.getElementById('usage-highlight-comparison').textContent =
        comparisonText;

    var largest = Math.max(thisMonth, previousMonth, 1);

    document.getElementById('usage-comparison-bar').style.width =
        (thisMonth / largest * 100) + '%';

    var description = 'No previous-month comparison is available.';

    if (previousMonth > 0 && thisMonth > previousMonth) {
        description = 'Your household used more water than the previous month.';
    } else if (previousMonth > 0 && thisMonth < previousMonth) {
        description = 'Your household used less water than the previous month.';
    } else if (previousMonth > 0) {
        description = 'Your household usage is equal to the previous month.';
    }

    document.getElementById('usage-comparison-description').textContent =
        description;

    // Last six months.
    var monthLabels = [];
    var monthValues = [];

    for (var offset = 5; offset >= 0; offset--) {
        var date = new Date(
            now.getFullYear(),
            now.getMonth() - offset,
            1
        );

        monthLabels.push(
            date.toLocaleString('en-US', { month: 'short' })
        );

        monthValues.push(
            getMonthlyUsage(
                history,
                date.getFullYear(),
                date.getMonth()
            )
        );
    }

    drawChart(
        document.getElementById('monthly-consumption-chart'),
        monthLabels,
        monthValues,
        'bar'
    );

    // Current month daily usage.
    var monthKey = localDateKey(now).slice(0, 7);

    var dailyRecords = history
        .filter(function (record) {
            return record.date.slice(0, 7) === monthKey;
        })
        .sort(function (a, b) {
            return a.date.localeCompare(b.date);
        });

    drawChart(
        document.getElementById('daily-consumption-chart'),
        dailyRecords.map(function (record) {
            return String(Number(record.date.slice(8, 10)));
        }),
        dailyRecords.map(function (record) {
            return Number(record.liters || 0);
        }),
        'line'
    );

    renderFilteredConsumptionHistory();
}

function setUsagePeriod(period) {
    var monthlyCanvas = document.getElementById('monthly-consumption-chart');
    var dailyCanvas = document.getElementById('daily-consumption-chart');

    document.querySelectorAll('.period-btn').forEach(function (button) {
        button.classList.toggle(
            'active',
            button.dataset.period === period
        );
    });

    var account = getAccount();
    if (!account) return;

    var now = new Date();

    if (period === 'day') {
        monthlyCanvas.classList.add('hidden');
        dailyCanvas.classList.remove('hidden');

        document.getElementById('usage-chart-title').textContent =
            'Daily Consumption';

        document.getElementById('usage-chart-subtitle').textContent =
            'Daily water usage throughout the current month';

        document.getElementById('usage-highlight-label').textContent =
            "Today's Consumption";

        var todayUsage = getDailyUsage(
            account.usageHistory,
            localDateKey(now)
        );

        document.getElementById('usage-highlight-value').textContent =
            formatNumber(todayUsage) + ' L';

        document.getElementById('usage-highlight-comparison').textContent =
            'Recorded water consumption today';
    } else {
        monthlyCanvas.classList.remove('hidden');
        dailyCanvas.classList.add('hidden');

        document.getElementById('usage-chart-title').textContent =
            'Monthly Consumption';

        document.getElementById('usage-chart-subtitle').textContent =
            'Water consumption over the last 6 months';

        document.getElementById('usage-highlight-label').textContent =
            "This Month's Consumption";

        var monthUsage = getMonthlyUsage(
            account.usageHistory,
            now.getFullYear(),
            now.getMonth()
        );

        var previousDate = new Date(
            now.getFullYear(),
            now.getMonth() - 1,
            1
        );

        var previousUsage = getMonthlyUsage(
            account.usageHistory,
            previousDate.getFullYear(),
            previousDate.getMonth()
        );

        document.getElementById('usage-highlight-value').textContent =
            formatNumber(monthUsage) + ' L';

        var text = 'No previous-month data available.';

        if (previousUsage > 0) {
            var difference =
                (monthUsage - previousUsage) / previousUsage * 100;

            text = (difference > 0 ? '+' : '') +
                difference.toFixed(1) +
                '% compared with previous month';
        }

        document.getElementById('usage-highlight-comparison').textContent = text;
    }
}

function renderFilteredConsumptionHistory() {
    var account = getAccount();
    if (!account) return;

    var filter = document.getElementById('history-month-filter');
    var list = document.getElementById('consumption-history-list');
    var totalElement = document.getElementById('history-filter-total');
    var emptyMessage = document.getElementById('history-empty-message');

    if (!list) return;

    var selectedMonth = filter ? filter.value : '';

    var records = (account.usageHistory || [])
        .filter(function (record) {
            return !selectedMonth ||
                record.date.slice(0, 7) === selectedMonth;
        })
        .sort(function (a, b) {
            return b.date.localeCompare(a.date);
        });

    var total = records.reduce(function (sum, record) {
        return sum + Number(record.liters || 0);
    }, 0);

    totalElement.textContent = formatNumber(total) + ' L';

    if (!records.length) {
        list.innerHTML = '';
        emptyMessage.classList.remove('hidden');
        return;
    }

    emptyMessage.classList.add('hidden');

    list.innerHTML = records.map(function (record) {
        var date = new Date(record.date + 'T00:00:00');

        return `
            <div class="history-row">
                <span>
                    ${escapeHtml(date.toLocaleDateString('en-PH', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric'
                    }))}
                </span>
                <span>${formatNumber(record.liters)} L</span>
            </div>
        `;
    }).join('');
}

/* ==================== INBOX ==================== */

function renderInbox() {
    var thread = document.getElementById('chat-thread');
    if (!thread) return;

    var account = getAccount();
    if (!account) return;

    var log = account.auditLog || [];

    if (!log.length) {
        thread.innerHTML =
            '<p class="empty-state">No messages yet. System alerts will appear here.</p>';
        return;
    }

    thread.innerHTML = log.map(function (entry) {
        var bubbleClass = entry.type === 'user' ? 'user' : 'system';
        var actions = '';

        if (entry.type === 'alert') {
            var remaining = entry.ackDeadline
                ? Math.max(0, entry.ackDeadline - Date.now())
                : 0;

            var countdown = '';

            if (entry.demo && !entry.acked && entry.ackDeadline) {
                var minutes = Math.floor(remaining / 60000);
                var seconds = Math.floor((remaining % 60000) / 1000);

                countdown = `
                    <div class="alert-countdown" data-countdown="${escapeHtml(entry.id)}">
                        ${remaining > 0
                            ? 'Automatic shutoff in ' +
                                String(minutes).padStart(2, '0') + ':' +
                                String(seconds).padStart(2, '0')
                            : 'Acknowledgment period ended'}
                    </div>
                `;
            }

            actions = countdown + `
                <div class="bubble-actions">
                    <button class="btn-ack"
                        data-ack-id="${escapeHtml(entry.id)}"
                        ${entry.acked ? 'disabled' : ''}>
                        ${entry.acked ? 'Acknowledged' : 'Acknowledge'}
                    </button>
                </div>
            `;
        }

        return `
            <div class="bubble ${bubbleClass}">
                <div>${escapeHtml(entry.message)}</div>
                ${actions}
                <div class="bubble-meta">${escapeHtml(entry.time || '')}</div>
            </div>
        `;
    }).join('');

    thread.querySelectorAll('[data-ack-id]').forEach(function (button) {
        button.addEventListener('click', function () {
            acknowledgeAlert(button.dataset.ackId);
        });
    });

    thread.scrollTop = 0;
    updateNotifDot();
}

function acknowledgeAlert(alertId) {
    var account = getAccount();
    if (!account) return;

    var entry = account.auditLog.find(function (item) {
        return item.id === alertId;
    });

    if (!entry || entry.acked) return;

    entry.acked = true;
    entry.acknowledgedAt = Date.now();

    saveAccount(account);

    addAuditEntry(
        'info',
        'Continuous-flow alert acknowledged. Pending automatic shutoff cancelled.'
    );

    renderInbox();
    updateNotifDot();
}

function sendInboxReply(message) {
    var account = getAccount();
    if (!account) return;

    account.auditLog.unshift({
        id: 'msg_' + Date.now(),
        type: 'user',
        message: message,
        time: new Date().toLocaleString('en-PH', {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        })
    });

    saveAccount(account);
    renderInbox();
}

/* ==================== CONTINUOUS-FLOW ALERT ==================== */

function simulateContinuousFlowAlert() {
    var account = getAccount();
    if (!account) return;

    var threshold = Number(account.flowThresholdMinutes) || 60;
    var alertId = 'alert_' + Date.now();

    addAuditEntry(
        'alert',
        'Continuous Water Flow Detected. Water has been flowing continuously for ' +
        threshold +
        ' minutes. Please check your faucets and plumbing system. This alert does not confirm a leak.',
        {
            id: alertId,
            demo: true,
            ackDeadline: Date.now() + 5 * 60 * 1000,
            shutoffProcessed: false
        }
    );

    renderInbox();

    alert(
        'Demo alert created. You have five minutes to acknowledge it before the simulated automatic shutoff.'
    );
}

function processAlertDeadlines() {
    var account = getAccount();
    if (!account) return;

    var changed = false;

    account.auditLog.forEach(function (entry) {
        if (
            entry.type !== 'alert' ||
            !entry.demo ||
            entry.acked ||
            entry.shutoffProcessed ||
            !entry.ackDeadline ||
            Date.now() < entry.ackDeadline
        ) {
            return;
        }

        entry.shutoffProcessed = true;
        changed = true;

        if (!account.autoShutoffEnabled) {
            account.auditLog.unshift({
                id: 'evt_' + Date.now(),
                type: 'info',
                time: new Date().toLocaleString('en-PH'),
                message:
                    'The five-minute acknowledgment period ended. Automatic shutoff is disabled. No valve action was simulated.'
            });

            return;
        }

        var device = (account.devices || [])[0];

        if (device) {
            device.flowRate = 0;
            device.demoValveState = 'CLOSED';
        }

        account.auditLog.unshift({
            id: 'evt_' + Date.now(),
            type: 'info',
            time: new Date().toLocaleString('en-PH'),
            message:
                'Demo automatic shutoff activated after no acknowledgment. The frontend valve state was changed to CLOSED. No physical valve was controlled.'
        });
    });

    if (changed) {
        account.auditLog = account.auditLog.slice(0, 100);
        saveAccount(account);

        renderInbox();
        renderDashboard();
    }

    updateCountdownDisplays();
}

function updateCountdownDisplays() {
    document.querySelectorAll('[data-countdown]').forEach(function (element) {
        var account = getAccount();
        if (!account) return;

        var entry = account.auditLog.find(function (item) {
            return item.id === element.dataset.countdown;
        });

        if (!entry || !entry.ackDeadline) return;

        var remaining = Math.max(0, entry.ackDeadline - Date.now());

        var minutes = Math.floor(remaining / 60000);
        var seconds = Math.floor((remaining % 60000) / 1000);

        element.textContent = remaining > 0
            ? 'Automatic shutoff in ' +
                String(minutes).padStart(2, '0') + ':' +
                String(seconds).padStart(2, '0')
            : 'Acknowledgment period ended';
    });
}

/* ==================== SETTINGS ==================== */

function renderAccountView() {
    var account = getAccount();
    if (!account) return;

    document.getElementById('settings-owner').value = account.owner || '';
    document.getElementById('settings-systemId').value = account.systemId || '';
    document.getElementById('settings-primarySms').value = account.primarySms || '';
    document.getElementById('settings-monthlyLimit').value = account.monthlyLimit || 5000;
    document.getElementById('settings-waterRate').value =
        Number(account.waterRatePerCubicMeter) || '';

    document.getElementById('settings-flowThreshold').value =
        account.flowThresholdMinutes || 60;

    document.getElementById('settings-autoShutoff').checked =
        account.autoShutoffEnabled !== false;

    document.getElementById('pref-sms').checked =
        account.prefs.sms !== false;

    document.getElementById('pref-app').checked =
        account.prefs.app !== false;

    document.getElementById('pref-email').checked =
        account.prefs.email === true;

    renderAlertNumbers();
    renderSettingsDevices();
    updateDrawerHeader();
}

function renderAlertNumbers() {
    var account = getAccount();
    var container = document.getElementById('alert-numbers-list');
    if (!account || !container) return;

    container.innerHTML = (account.alertNumbers || []).map(function (number, index) {
        return `
            <div class="alert-number-item">
                <span>${escapeHtml(number)}</span>
                <button class="btn-remove" data-remove-number="${index}">Remove</button>
            </div>
        `;
    }).join('') || '<p class="field-hint">No additional numbers.</p>';

    container.querySelectorAll('[data-remove-number]').forEach(function (button) {
        button.addEventListener('click', function () {
            var index = Number(button.dataset.removeNumber);
            var current = getAccount();
            if (!current) return;

            var removed = current.alertNumbers[index];

            if (removed === current.primarySms) {
                alert('Update the primary number before removing it.');
                return;
            }

            current.alertNumbers.splice(index, 1);
            saveAccount(current);

            addAuditEntry('info', 'An authorized contact was removed.');
            renderAlertNumbers();
        });
    });
}

function renderSettingsDevices() {
    var container = document.getElementById('settings-devices-list');
    if (!container) return;

    var devices = getDevices();

    container.innerHTML = devices.map(function (device) {
        return `
            <div class="settings-device-item" data-id="${escapeHtml(device.id)}">
                <input type="text"
                    value="${escapeHtml(device.nickname)}"
                    data-device-nickname>
                <button class="btn-remove" data-remove-device>Remove</button>
            </div>
        `;
    }).join('') || '<p class="field-hint">No devices linked.</p>';

    container.querySelectorAll('[data-remove-device]').forEach(function (button) {
        button.addEventListener('click', function () {
            var id = button.closest('.settings-device-item').dataset.id;

            if (!confirm('Remove this device from the local demo account?')) return;

            saveDevices(getDevices().filter(function (device) {
                return device.id !== id;
            }));

            addAuditEntry('info', 'Device removed: ' + id);
            renderSettingsDevices();
            renderDashboard();
        });
    });

    container.querySelectorAll('[data-device-nickname]').forEach(function (input) {
        input.addEventListener('change', function () {
            var id = input.closest('.settings-device-item').dataset.id;
            var devices = getDevices();

            var device = devices.find(function (item) {
                return item.id === id;
            });

            if (device) {
                device.nickname = input.value.trim() || device.nickname;
                saveDevices(devices);
                renderDeviceCards();
            }
        });
    });
}

function saveDetectionSettings() {
    var account = getAccount();
    if (!account) return;

    var threshold = Number(
        document.getElementById('settings-flowThreshold').value
    );

    var autoShutoff =
        document.getElementById('settings-autoShutoff').checked;

    if (
        !Number.isInteger(threshold) ||
        threshold < 1 ||
        threshold > 1440
    ) {
        alert('Enter a whole number between 1 and 1440 minutes.');
        return;
    }

    account.flowThresholdMinutes = threshold;
    account.autoShutoffEnabled = autoShutoff;

    saveAccount(account);

    addAuditEntry(
        'info',
        'Detection settings updated. Threshold: ' + threshold +
        ' minutes. Automatic shutoff: ' +
        (autoShutoff ? 'enabled' : 'disabled') + '.'
    );

    renderDashboard();

    alert(
        'Settings saved in this browser demo. They are not yet sent to the ESP32.'
    );
}

function saveBudgetSettings() {
    var account = getAccount();
    if (!account) return;

    var limit = Number(
        document.getElementById('settings-monthlyLimit').value
    );

    var rate = Number(
        document.getElementById('settings-waterRate').value
    );

    if (!Number.isFinite(limit) || limit < 100) {
        alert('Enter a monthly water limit of at least 100 liters.');
        return;
    }

    if (!Number.isFinite(rate) || rate < 0) {
        alert('Enter a valid water rate.');
        return;
    }

    account.monthlyLimit = limit;
    account.waterRatePerCubicMeter = rate;

    saveAccount(account);

    addAuditEntry('info', 'Water budget and billing settings updated.');

    renderDashboard();
    renderConsumptionAnalytics();

    alert('Water budget and rate updated.');
}

/* ==================== PROFILE ==================== */

function saveProfileName() {
    var account = getAccount();
    if (!account) return;

    account.owner =
        document.getElementById('settings-owner').value.trim() || 'Admin';

    saveAccount(account);
    renderDashboard();
    updateDrawerHeader();

    addAuditEntry('info', 'Profile name updated.');
}

function updatePrimaryNumber() {
    var account = getAccount();
    if (!account) return;

    var number =
        document.getElementById('settings-primarySms').value.trim();

    if (!number) {
        alert('Enter a valid mobile number.');
        return;
    }

    account.primarySms = number;

    if (!account.alertNumbers.includes(number)) {
        account.alertNumbers.unshift(number);
    }

    saveAccount(account);
    renderAlertNumbers();

    addAuditEntry('info', 'Primary mobile number updated.');
    alert('Primary mobile number updated.');
}

function addAuthorizedNumber() {
    var account = getAccount();
    if (!account) return;

    var input = document.getElementById('new-alert-number');
    var number = input.value.trim();

    if (!number) {
        alert('Enter a mobile number.');
        return;
    }

    if (account.alertNumbers.includes(number)) {
        alert('This number is already registered.');
        return;
    }

    var extraNumbers = account.alertNumbers.filter(function (item) {
        return item !== account.primarySms;
    });

    if (extraNumbers.length >= 4) {
        alert('You can add up to four additional numbers.');
        return;
    }

    account.alertNumbers.push(number);
    saveAccount(account);

    input.value = '';
    renderAlertNumbers();

    addAuditEntry('info', 'An authorized contact was added.');
}

function saveNotificationPreferences() {
    var account = getAccount();
    if (!account) return;

    account.prefs.sms = document.getElementById('pref-sms').checked;
    account.prefs.app = document.getElementById('pref-app').checked;
    account.prefs.email = document.getElementById('pref-email').checked;

    saveAccount(account);
    updateNotifDot();

    addAuditEntry('info', 'Notification preferences updated.');
}

function updatePassword() {
    var account = getAccount();
    if (!account) return;

    var current = document.getElementById('security-current-pass').value;
    var next = document.getElementById('security-new-pass').value;

    if (current !== account.password) {
        alert('Current password is incorrect.');
        return;
    }

    if (!next || next.length < 6) {
        alert('New password must contain at least six characters.');
        return;
    }

    account.password = next;
    saveAccount(account);

    document.getElementById('security-current-pass').value = '';
    document.getElementById('security-new-pass').value = '';

    addAuditEntry('info', 'Password updated.');
    alert('Password updated in this browser demo.');
}

/* ==================== PROFILE PHOTO ==================== */

function uploadProfilePhoto(file) {
    var account = getAccount();
    if (!account || !file) return;

    if (!file.type.startsWith('image/')) {
        alert('Please select an image.');
        return;
    }

    if (file.size > 1.5 * 1024 * 1024) {
        alert('Please choose an image smaller than 1.5 MB.');
        return;
    }

    var reader = new FileReader();

    reader.onload = function () {
        account.profilePicDataUrl = reader.result;
        saveAccount(account);
        updateDrawerHeader();

        addAuditEntry('info', 'Profile photo updated.');
    };

    reader.readAsDataURL(file);
}

function removeProfilePhoto() {
    var account = getAccount();
    if (!account || !account.profilePicDataUrl) {
        alert('No profile photo to remove.');
        return;
    }

    delete account.profilePicDataUrl;
    saveAccount(account);
    updateDrawerHeader();

    addAuditEntry('info', 'Profile photo removed.');
}

/* ==================== DEVICE MANAGEMENT ==================== */

function addDevice() {
    var nickname = prompt('Enter a device nickname:');
    if (!nickname || !nickname.trim()) return;

    var devices = getDevices();

    devices.push({
        id: 'FG-' + Date.now(),
        nickname: nickname.trim(),
        status: 'offline',
        flowRate: 0,
        demoValveState: 'UNKNOWN'
    });

    saveDevices(devices);

    addAuditEntry('info', 'Device added: ' + nickname.trim());

    renderSettingsDevices();
    renderDashboard();
}

/* ==================== QUICK ACTIONS ==================== */

function toggleFabSheet() {
    document.getElementById('fab-sheet').classList.toggle('hidden');
}

function closeFabSheet() {
    document.getElementById('fab-sheet').classList.add('hidden');
}

function runFabValveAction(action) {
    var devices = getDevices();

    if (!devices.length) {
        alert('No device is linked.');
        return;
    }

    sendCommand(devices[0].id, action);
    closeFabSheet();
}

function reportIssue() {
    var message = prompt('Describe the issue you want to report:');
    if (!message || !message.trim()) return;

    addAuditEntry('info', 'User-reported issue: ' + message.trim());
    renderInbox();

    setActiveView('inbox');
    closeFabSheet();
}

/* ==================== INITIALIZATION ==================== */

document.addEventListener('DOMContentLoaded', function () {

    /* LOGIN / ACCOUNT CREATION */

    var current = getCurrentSystemId();

    if (current && getAccount()) {
        showDashboard();
    } else {
        setCurrentSystemId(null);
        showLogin();
    }

    document.getElementById('loginForm').addEventListener('submit', function (event) {
        event.preventDefault();

        var id = document.getElementById('login-systemID').value.trim();
        var password = document.getElementById('login-password').value;

        var account = getAllAccounts()[id];

        if (!account || account.password !== password) {
            alert('Invalid System ID or password.');
            return;
        }

        setCurrentSystemId(id);
        showDashboard();
    });

    document.getElementById('createAccountForm').addEventListener('submit', function (event) {
        event.preventDefault();

        var id = document.getElementById('create-systemID').value.trim();
        var password = document.getElementById('create-password').value;
        var owner = document.getElementById('create-owner').value.trim() || 'Admin';
        var phone = document.getElementById('create-phone').value.trim();

        if (password.length < 6) {
            alert('Password must contain at least six characters.');
            return;
        }

        var accounts = getAllAccounts();

        if (accounts[id]) {
            alert('This System ID is already registered.');
            return;
        }

        var account = {
            systemId: id,
            password: password,
            owner: owner,
            primarySms: phone,
            alertNumbers: [phone],
            monthlyLimit: 5000,
            monthlyUsed: 0,
            waterRatePerCubicMeter: 0,
            flowThresholdMinutes: 60,
            autoShutoffEnabled: true,
            usageHistory: [],
            devices: [{
                id: id,
                nickname: 'Main Line',
                status: 'offline',
                flowRate: 0,
                demoValveState: 'UNKNOWN'
            }],
            auditLog: [],
            prefs: {
                sms: true,
                app: true,
                email: false
            }
        };

        accounts[id] = account;
        saveAllAccounts(accounts);
        setCurrentSystemId(id);

        normalizeAccount(account);
        ensureUsageHistory(account);
        saveAccount(account);

        addAuditEntry(
            'info',
            'Welcome to FlowGuard. Your account has been created in frontend demo mode.'
        );

        addAuditEntry(
            'info',
            'Continuous-flow detection default threshold is 60 minutes. You can change it in Settings.'
        );

        showDashboard();
    });

    document.getElementById('show-create-account').addEventListener('click', function (event) {
        event.preventDefault();
        showCreateAccount();
    });

    document.getElementById('show-login').addEventListener('click', function (event) {
        event.preventDefault();
        showLogin();
    });

    /* BOTTOM NAVIGATION */

    document.querySelectorAll('.nav-item').forEach(function (button) {
        button.addEventListener('click', function () {
            setActiveView(button.dataset.view);
        });
    });

    document.querySelectorAll('[data-open-usage]').forEach(function (button) {
        button.addEventListener('click', function () {
            setActiveView('usage');
        });
    });

    /* USAGE PAGE */

    document.querySelectorAll('.period-btn').forEach(function (button) {
        button.addEventListener('click', function () {
            setUsagePeriod(button.dataset.period);
        });
    });

    var monthFilter = document.getElementById('history-month-filter');

    if (monthFilter) {
        var now = new Date();

        monthFilter.value =
            now.getFullYear() + '-' +
            String(now.getMonth() + 1).padStart(2, '0');

        monthFilter.addEventListener('change', renderFilteredConsumptionHistory);
    }

    /* DRAWER */

    document.getElementById('profile-btn').addEventListener('click', function () {
        if (getAccount()) openDrawer();
    });

    document.getElementById('drawer-close').addEventListener('click', closeDrawer);
    document.getElementById('drawer-backdrop').addEventListener('click', closeDrawer);

    document.querySelectorAll('.drawer-item[data-go]').forEach(function (button) {
        button.addEventListener('click', function () {
            closeDrawer();
            setActiveView(button.dataset.go);
        });
    });

    document.getElementById('drawer-logout').addEventListener('click', function () {
        if (!confirm('Are you sure you want to log out?')) return;

        setCurrentSystemId(null);
        showLogin();
    });

    /* NOTIFICATION BUTTON */

    document.getElementById('notif-btn').addEventListener('click', function () {
        setActiveView('inbox');
    });

    /* SETTINGS ACCORDIONS */

    document.querySelectorAll('.settings-toggle').forEach(function (button) {
        button.addEventListener('click', function () {
            var panel = document.querySelector(
                '[data-panel="' + button.dataset.acc + '"]'
            );

            if (panel) panel.classList.toggle('open');
        });
    });

    /* PROFILE AND CONTACTS */

    document.getElementById('settings-owner').addEventListener('change', saveProfileName);

    document.getElementById('update-sms-btn').addEventListener('click', updatePrimaryNumber);
    document.getElementById('add-alert-number-btn').addEventListener('click', addAuthorizedNumber);

    /* DETECTION SETTINGS */

    document.getElementById('save-detection-settings').addEventListener(
        'click',
        saveDetectionSettings
    );

    document.getElementById('simulate-flow-alert').addEventListener(
        'click',
        simulateContinuousFlowAlert
    );

    /* BUDGET SETTINGS */

    ['settings-monthlyLimit', 'settings-waterRate'].forEach(function (id) {
        document.getElementById(id).addEventListener('change', saveBudgetSettings);
    });

    /* NOTIFICATION PREFERENCES */

    ['pref-sms', 'pref-app', 'pref-email'].forEach(function (id) {
        document.getElementById(id).addEventListener(
            'change',
            saveNotificationPreferences
        );
    });

    /* DEVICES */

    document.getElementById('add-device-btn').addEventListener('click', addDevice);

    /* PASSWORD */

    document.getElementById('security-save-pass').addEventListener('click', updatePassword);

    /* ACCOUNT DELETION */

    document.getElementById('unlink-account-btn').addEventListener('click', function () {
        var account = getAccount();
        if (!account) return;

        if (!confirm('Permanently delete this local demo account and its browser-stored data?')) {
            return;
        }

        var accounts = getAllAccounts();
        delete accounts[account.systemId];

        saveAllAccounts(accounts);
        setCurrentSystemId(null);
        showLogin();
    });

    /* PROFILE PHOTO */

    document.getElementById('upload-profile-pic-btn').addEventListener('click', function () {
        document.getElementById('profile-pic-input').click();
    });

    document.getElementById('profile-pic-input').addEventListener('change', function (event) {
        var file = event.target.files[0];
        if (file) uploadProfilePhoto(file);
        event.target.value = '';
    });

    document.getElementById('remove-profile-pic-btn').addEventListener(
        'click',
        removeProfilePhoto
    );

    /* INBOX REPLY */

    document.getElementById('chat-reply-form').addEventListener('submit', function (event) {
        event.preventDefault();

        var input = document.getElementById('chat-reply-input');
        var message = input.value.trim();

        if (!message) return;

        sendInboxReply(message);
        input.value = '';
    });

    /* FAB */

    document.getElementById('fab').addEventListener('click', toggleFabSheet);
    document.getElementById('fab-cancel').addEventListener('click', closeFabSheet);

    document.getElementById('fab-shutoff').addEventListener('click', function () {
        runFabValveAction('OFF');
    });

    document.getElementById('fab-restore').addEventListener('click', function () {
        runFabValveAction('ON');
    });

    document.getElementById('fab-report').addEventListener('click', reportIssue);

    /* TIMER AND RESPONSIVE CHARTS */

    window.setInterval(function () {
        processAlertDeadlines();
    }, 1000);

    window.addEventListener('resize', function () {
        var usageView = document.getElementById('view-usage');

        if (usageView && usageView.classList.contains('active')) {
            renderConsumptionAnalytics();
        }
    });

});