import { database, ref, query, orderByKey, startAt, endAt, get, onChildAdded } from './firebase-config.js';
import { getTariff, isSolarMode } from './common.js';

let rules = JSON.parse(localStorage.getItem('watchdog_rules')) || [];
let tariff = getTariff();

const memory = {
    today: { load1: 0, load2: 0, load3: 0, total: 0 },
    month: { load1: 0, load2: 0, load3: 0, total: 0 },
    yesterday: { load1: 0, load2: 0, load3: 0, total: 0 }
};
window.watchdogMemory = memory;

let latestProcessedKey = "0";
const currentBaselines = {
    startOfMonth: 0,
    startOfToday: 0,
    startOfYesterday: 0
};

let equivalencyArray = [
    "🌱 Calculating your environmental impact...",
    "🌱 Analyzing your carbon footprint...",
    "🌱 Getting equivalencies ready..."
];
let currentEqIndex = 0;

document.addEventListener('DOMContentLoaded', () => {
    setupUI();
    initWatchdog();
});

function setupUI() {
    const btnMoreSettings = document.getElementById('btn-more-settings');
    const modal = document.getElementById('alert-settings-modal');
    const closeBtn = document.getElementById('close-modal-btn');
    const form = document.getElementById('add-rule-form');

    // Equivalency Text Rotation removed for Dashboard (migrated to carbon-details page)

    // Handle deep linking / cross-page navigation
    if (window.location.hash === '#alerts' && modal) {
        modal.classList.add('active');
        renderRules();
        // Clean up hash to prevent re-triggering purely on refresh
        history.replaceState(null, null, window.location.pathname + window.location.search);
    }

    // Handle same-page click from the newly added sidebar Option
    const sidebarAlertsLink = document.getElementById('nav-energy-alerts');
    if (sidebarAlertsLink && modal) {
        sidebarAlertsLink.addEventListener('click', (e) => {
            e.preventDefault();
            modal.classList.add('active');
            renderRules();
        });
    }

    if (btnMoreSettings && modal) {
        btnMoreSettings.addEventListener('click', () => {
            modal.classList.add('active');
            renderRules();
        });
    }

    if (closeBtn && modal) {
        closeBtn.addEventListener('click', () => {
            modal.classList.remove('active');
        });
    }

    if (form) {
        form.addEventListener('submit', (e) => {
            e.preventDefault();
            const target = document.getElementById('rule-target').value;
            const period = document.getElementById('rule-period').value;
            const metric = document.getElementById('rule-metric').value;
            const limit = parseFloat(document.getElementById('rule-limit').value);

            let editId = null;
            if (form.dataset.editingId) {
                editId = parseInt(form.dataset.editingId);
            }

            // Check for duplicates
            const existingRuleIndex = rules.findIndex(r => r.target === target && r.period === period && r.metric === metric && r.id !== editId);

            if (existingRuleIndex !== -1) {
                // Duplicate found!
                const activeRuleList = document.getElementById('active-rule-list');
                const ruleItem = activeRuleList.children[existingRuleIndex];
                if (ruleItem) {
                    const editBtn = ruleItem.querySelector('.btn-edit');
                    if (editBtn) {
                        editBtn.classList.add('highlight-edit');
                        setTimeout(() => editBtn.classList.remove('highlight-edit'), 2000);
                        ruleItem.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    }
                }
                return; // Do not save duplicate
            }

            if (editId) {
                const index = rules.findIndex(r => r.id === editId);
                if (index !== -1) {
                    rules[index] = { ...rules[index], target, period, metric, limit };
                }
                delete form.dataset.editingId;
                const submitBtn = form.querySelector('button[type="submit"]');
                if (submitBtn) submitBtn.textContent = 'Save Rule';
            } else {
                rules.push({
                    id: Date.now(),
                    target,
                    period,
                    metric,
                    limit
                });
            }

            saveRules();
            renderRules();
            evaluateRules();
            form.reset();
        });
    }
}

async function initWatchdog() {
    const now = new Date();
    currentBaselines.startOfMonth = Math.floor(new Date(now.getFullYear(), now.getMonth(), 1).getTime() / 1000);
    currentBaselines.startOfToday = Math.floor(new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime() / 1000);
    currentBaselines.startOfYesterday = Math.floor(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1).getTime() / 1000);

    const historyRef = ref(database, 'energyMonitoring/history');
    const initQuery = query(historyRef, orderByKey(), startAt(currentBaselines.startOfMonth.toString()), endAt(Math.floor(now.getTime() / 1000).toString()));

    const snapshot = await get(initQuery);

    if (snapshot.exists()) {
        snapshot.forEach(child => {
            processDataPoint(child.key, child.val());
            latestProcessedKey = child.key;
        });
    }

    evaluateRules();

    // Live Listener
    const liveQuery = query(historyRef, orderByKey(), startAt(latestProcessedKey));
    onChildAdded(liveQuery, (child) => {
        if (child.key > latestProcessedKey) {
            processDataPoint(child.key, child.val());
            latestProcessedKey = child.key;
            evaluateRules();
        }
    });
}

function processDataPoint(key, data) {
    const ts = parseInt(key);

    const dataDate = new Date(ts * 1000);
    const dataMonthStart = Math.floor(new Date(dataDate.getFullYear(), dataDate.getMonth(), 1).getTime() / 1000);
    const dataTodayStart = Math.floor(new Date(dataDate.getFullYear(), dataDate.getMonth(), dataDate.getDate()).getTime() / 1000);

    // Handle day/month rollovers dynamically
    if (dataMonthStart > currentBaselines.startOfMonth) {
        currentBaselines.startOfMonth = dataMonthStart;
        memory.month = { load1: 0, load2: 0, load3: 0, total: 0 };
    }
    if (dataTodayStart > currentBaselines.startOfToday) {
        // Rollover: today becomes yesterday
        memory.yesterday = { ...memory.today };
        currentBaselines.startOfYesterday = currentBaselines.startOfToday;
        currentBaselines.startOfToday = dataTodayStart;
        memory.today = { load1: 0, load2: 0, load3: 0, total: 0 };
    }

    const e1 = data.load1 ? (parseFloat(data.load1.energy) || 0) : 0;
    const e2 = data.load2 ? (parseFloat(data.load2.energy) || 0) : 0;
    const e3 = data.load3 ? (parseFloat(data.load3.energy) || 0) : 0;
    const tE = e1 + e2 + e3;

    if (ts >= currentBaselines.startOfMonth) {
        memory.month.load1 += e1;
        memory.month.load2 += e2;
        memory.month.load3 += e3;
        memory.month.total += tE;
    }

    if (ts >= currentBaselines.startOfToday) {
        memory.today.load1 += e1;
        memory.today.load2 += e2;
        memory.today.load3 += e3;
        memory.today.total += tE;
    } else if (ts >= currentBaselines.startOfYesterday && ts < currentBaselines.startOfToday) {
        memory.yesterday.load1 += e1;
        memory.yesterday.load2 += e2;
        memory.yesterday.load3 += e3;
        memory.yesterday.total += tE;
    }
}

function evaluateRules() {
    let triggered = [];
    tariff = getTariff(); // Ensure we have the latest tariff

    // Evaluate Gamification (Carbon Math)
    const gamificationAlert = evaluateGamification();
    if (gamificationAlert) {
        triggered.push(gamificationAlert);
    }

    console.log("Evaluating rules. Current Tariff:", tariff);
    console.log("Memory State:", JSON.stringify(memory));
    console.log("Rules List:", rules);

    rules.forEach(rule => {
        if (isSolarMode && rule.metric === 'cost') return;

        const periodMem = memory[rule.period];
        const wh = periodMem[rule.target];
        const kwh = wh / 1000;

        const actualValue = rule.metric === 'energy' ? kwh : kwh * tariff.rate;
        console.log(`Evaluating Rule [${rule.target} | ${rule.period} | ${rule.metric}]: Actual = ${actualValue} (Limit=${rule.limit})`);

        if (actualValue > rule.limit) {
            triggered.push({
                ...rule,
                actual: actualValue
            });
        }
    });

    handleActiveAlerts(triggered);
    updateProgressBars();

    localStorage.setItem('watchdogMemory_latest', JSON.stringify(memory));
}

function handleActiveAlerts(triggered) {
    const alertHeader = document.getElementById('sticky-alert');
    const alertMsg = document.getElementById('sticky-alert-msg');
    const latestAlertDisplay = document.getElementById('latest-alert-display');

    if (!alertHeader || !alertMsg || !latestAlertDisplay) return;

    if (triggered.length === 0) {
        alertHeader.classList.remove('active');
        latestAlertDisplay.textContent = 'Safe - All limits within bound';
        latestAlertDisplay.className = 'alert-status no-alert';
        return;
    }

    // Priority Handle: Sort
    triggered.sort((a, b) => {
        // Evaluate Gamification explicit priority
        if (a.priorityScore) return b.priorityScore ? b.priorityScore - a.priorityScore : -1;
        if (b.priorityScore) return 1;

        const scoreA = (a.target === 'total' ? 10 : 0) + (a.period === 'month' ? 5 : 0);
        const scoreB = (b.target === 'total' ? 10 : 0) + (b.period === 'month' ? 5 : 0);
        return scoreB - scoreA;
    });

    const topAlert = triggered[0];

    // Handle Custom Message from Gamification Gamification 
    if (topAlert.customMsg) {
        alertMsg.textContent = topAlert.customMsg;
        alertHeader.classList.add('active');
        latestAlertDisplay.textContent = topAlert.customMsg;
        latestAlertDisplay.className = 'alert-status has-alert';
        return;
    }
    const targetName = { total: 'Total System', load1: 'Iron', load2: 'Hair Dryer', load3: 'Bulb' }[topAlert.target];
    const periodName = topAlert.period === 'month' ? 'Monthly' : 'Daily';
    const metricStr = topAlert.metric === 'energy' ? 'Energy Usage' : 'Cost Limit';

    // Convert limit dynamically for display
    const labelUnit = topAlert.metric === 'energy' ? 'kWh' : '₹';
    const valLimit = topAlert.limit;
    const valActual = topAlert.metric === 'energy' ? topAlert.actual.toFixed(3) : topAlert.actual.toFixed(2);

    const msg = `WARNING! ${targetName} ${periodName} ${metricStr} breached! (Limit: ${labelUnit}${valLimit} | Current: ${labelUnit}${valActual})`;

    alertMsg.textContent = msg;
    alertHeader.classList.add('active');

    latestAlertDisplay.textContent = msg;
    latestAlertDisplay.className = 'alert-status has-alert';
}

function evaluateGamification() {
    const displayCo2 = document.getElementById('display-co2');
    const displayCo2Today = document.getElementById('display-co2-today');
    const displayGradeLetter = document.getElementById('display-grade-letter');
    const displayGradeStatus = document.getElementById('display-grade-status');

    if (!displayCo2 || !displayGradeLetter || !displayGradeStatus || !displayCo2Today) return null;

    const solarPercentage = tariff.solar || 0;
    const monthlyTotalKwh = memory.month.total / 1000;
    const todayTotalKwh = memory.today.total / 1000;

    const solarRatio = solarPercentage / 100;
    const gridRatio = 1 - solarRatio;

    const solarKwh = monthlyTotalKwh * solarRatio;
    const gridKwh = monthlyTotalKwh * gridRatio;
    const solarTodayKwh = todayTotalKwh * solarRatio;
    const gridTodayKwh = todayTotalKwh * gridRatio;

    const GRID_EMISSION_FACTOR = 0.710;

    let carbonEmissionsKg = (gridKwh * GRID_EMISSION_FACTOR);
    let carbonEmissionsTodayKg = (gridTodayKwh * GRID_EMISSION_FACTOR);

    if (isSolarMode) {
        carbonEmissionsKg = 0;
        carbonEmissionsTodayKg = 0;
    }

    displayCo2.textContent = carbonEmissionsKg.toFixed(2);
    displayCo2Today.textContent = carbonEmissionsTodayKg.toFixed(2);

    // Equivalency Engine Math removed for Dashboard (migrated to details page)

    let grade = "C";
    let statusText = "High Emission / Warning";
    let colorClass = "grade-c";
    let triggerAlert = true;

    if (isSolarMode) {
        grade = "A+";
        statusText = "Solar Powered - Zero Emissions";
        colorClass = "grade-a-plus";
        triggerAlert = false;
    } else if (carbonEmissionsTodayKg <= 2.36) { // A+ Daily Limit
        grade = "A+";
        statusText = "Eco-Champion / Very Safe";
        colorClass = "grade-a-plus";
        triggerAlert = false;
    } else if (carbonEmissionsTodayKg <= 4.7) { // A Daily Limit
        grade = "A";
        statusText = "Good / Safe";
        colorClass = "grade-a";
        triggerAlert = false;
    } else if (carbonEmissionsTodayKg <= 7.1) { // B Daily Limit
        grade = "B";
        statusText = "Average";
        colorClass = "grade-b";
        triggerAlert = false;
    } else if (carbonEmissionsTodayKg <= 11.8) { // C Daily Limit
        grade = "C";
        statusText = "High Emission / Warning";
        colorClass = "grade-c";
        triggerAlert = true; // Kept custom alert logic
    } else { // D Daily Limit
        grade = "D";
        statusText = "Critical / Extreme Usage";
        colorClass = "grade-d";
        triggerAlert = true;
    }

    // Save grades to memory for the details page
    memory.gradeToday = { grade, colorClass };

    // Evaluate Monthly specifically for details page to use
    let monthGrade = "C";
    let monthColorClass = "grade-c";
    if (isSolarMode) { monthGrade = "A+"; monthColorClass = "grade-a-plus"; }
    else if (carbonEmissionsKg <= 71) { monthGrade = "A+"; monthColorClass = "grade-a-plus"; }
    else if (carbonEmissionsKg <= 142) { monthGrade = "A"; monthColorClass = "grade-a"; }
    else if (carbonEmissionsKg <= 213) { monthGrade = "B"; monthColorClass = "grade-b"; }
    else if (carbonEmissionsKg <= 355) { monthGrade = "C"; monthColorClass = "grade-c"; }
    else { monthGrade = "D"; monthColorClass = "grade-d"; }

    memory.gradeMonth = { grade: monthGrade, colorClass: monthColorClass };

    displayGradeLetter.textContent = grade;
    displayGradeLetter.className = `value-display ${colorClass}`;

    const gradeCircle = document.getElementById('grade-circle-container');
    if (gradeCircle) {
        // Reset old classes
        gradeCircle.className = `grade-circle grade-circle-${colorClass.replace('grade-', '')}`;
    }

    displayGradeStatus.textContent = statusText;

    evaluateEcoStreak(); // Core engine streak check

    if (triggerAlert) {
        return {
            target: 'total',
            period: 'month',
            metric: 'eco',
            actual: carbonEmissionsKg,
            priorityScore: 8, // Fixed medium-high priority
            customMsg: `⚠️ Eco-Warning: Monthly Carbon Footprint High (Grade C). Optimize usage.`
        };
    }
    return null;
}

function evaluateEcoStreak() {
    const DAILY_A_PLUS_LIMIT = 2.36; // kg CO2

    let currentStreak = parseInt(localStorage.getItem('eco_streak_count')) || 0;
    let lastDate = localStorage.getItem('last_evaluated_date') || "";

    let today = new Date().toLocaleDateString();

    if (today !== lastDate) {
        // The midnight evaluation trigger
        const Yesterday_Wh = memory.yesterday.total || 0;
        let Yesterday_CO2 = (Yesterday_Wh / 1000) * 0.710;

        if (isSolarMode) {
            Yesterday_CO2 = 0;
        }

        if (Yesterday_CO2 <= DAILY_A_PLUS_LIMIT) {
            currentStreak += 1;
        } else {
            currentStreak = 0;
        }

        localStorage.setItem('eco_streak_count', currentStreak);
        localStorage.setItem('last_evaluated_date', today);
    }

    // Output Rendering
    const streakDisplay = document.getElementById('streak-badge');
    if (!streakDisplay) return;

    if (currentStreak > 0) {
        streakDisplay.style.display = 'block';
        streakDisplay.className = 'streak-active';
        if (currentStreak >= 7) {
            streakDisplay.innerHTML = "🏆 " + currentStreak + "-Day A+ Streak!";
        } else {
            streakDisplay.innerHTML = "🔥 " + currentStreak + "-Day A+ Streak!";
        }
    } else {
        streakDisplay.style.display = 'block';
        streakDisplay.className = 'streak-broken';
        streakDisplay.innerHTML = "🎯 Keep daily emissions under 2.3kg to start a streak!";
    }
}

function renderRules() {
    const activeRuleList = document.getElementById('active-rule-list');
    if (!activeRuleList) return;

    activeRuleList.innerHTML = '';
    rules.forEach(rule => {
        const li = document.createElement('li');
        li.className = 'rule-item';
        li.dataset.ruleId = rule.id;

        const targetName = { total: 'Total System', load1: 'Iron', load2: 'Hair Dryer', load3: 'Bulb' }[rule.target];
        const periodName = rule.period === 'month' ? 'Monthly' : 'Daily';
        const metricName = rule.metric === 'energy' ? 'Energy limit' : 'Cost limit';
        const unit = rule.metric === 'energy' ? 'kWh' : '₹';

        const info = document.createElement('div');
        info.className = 'rule-info';
        info.style.flex = "1";

        info.innerHTML = `
            <div class="rule-title">${targetName} • ${periodName}</div>
            <div class="rule-detail">${metricName}: ${unit}${rule.limit}</div>
            <div class="rule-progress" style="margin-top: 8px; width: 100%; height: 6px; background: #eee; border-radius: 3px; overflow: hidden;">
                <div class="progress-fill" style="width: 0%; height: 100%; background-color: green; transition: width 0.3s ease, background-color 0.3s ease;"></div>
            </div>
            <div class="progress-text" style="font-size: 0.75rem; color: var(--text-muted); text-align: right; margin-top: 2px;">
                0.00 / ${rule.limit} (0.0%)
            </div>
        `;

        const actions = document.createElement('div');
        actions.style.display = "flex";
        actions.style.gap = "0.5rem";
        actions.style.marginLeft = "1rem";

        const editBtn = document.createElement('button');
        editBtn.className = 'btn btn-secondary btn-edit';
        editBtn.textContent = 'Edit';
        editBtn.style.padding = "0.5rem";
        editBtn.onclick = () => {
            document.getElementById('rule-target').value = rule.target;
            document.getElementById('rule-period').value = rule.period;
            document.getElementById('rule-metric').value = rule.metric;
            document.getElementById('rule-limit').value = rule.limit;

            const form = document.getElementById('add-rule-form');
            form.dataset.editingId = rule.id;
            const submitBtn = form.querySelector('button[type="submit"]');
            if (submitBtn) submitBtn.textContent = 'Update Rule';
        };

        const delBtn = document.createElement('button');
        delBtn.className = 'btn btn-danger';
        delBtn.textContent = 'Delete';
        delBtn.style.padding = "0.5rem";
        delBtn.onclick = () => {
            rules = rules.filter(r => r.id !== rule.id);
            saveRules();
            renderRules();
            evaluateRules();
        };

        actions.appendChild(editBtn);
        actions.appendChild(delBtn);

        li.appendChild(info);
        li.appendChild(actions);
        activeRuleList.appendChild(li);
    });

    updateProgressBars();
}

function updateProgressBars() {
    renderDashboardRules();

    const activeRuleList = document.getElementById('active-rule-list');
    if (!activeRuleList) return;

    rules.forEach(rule => {
        const li = activeRuleList.querySelector(`li[data-rule-id="${rule.id}"]`);
        if (!li) return;

        const periodMem = memory[rule.period] || { load1: 0, load2: 0, load3: 0, total: 0 };
        const wh = periodMem[rule.target] || 0;
        const kwh = wh / 1000;
        const currentTariff = typeof tariff !== 'undefined' ? tariff : { rate: 1 };
        const actualValue = rule.metric === 'energy' ? kwh : kwh * currentTariff.rate;

        let percentage = (actualValue / rule.limit) * 100;
        if (percentage > 100) percentage = 100;
        const validPercentage = Number.isNaN(percentage) ? 0 : percentage;

        const hue = Math.max(0, 120 - (validPercentage * 1.2));
        const color = `hsl(${hue}, 100%, 45%)`;

        const fill = li.querySelector('.progress-fill');
        const text = li.querySelector('.progress-text');

        if (fill) {
            fill.style.width = `${validPercentage}%`;
            fill.style.backgroundColor = color;
        }
        if (text) {
            text.textContent = `${actualValue.toFixed(2)} / ${rule.limit} (${validPercentage.toFixed(1)}%)`;
        }
    });
}

function renderDashboardRules() {
    const dashList = document.getElementById('dashboard-rules-list');
    const moreBtn = document.getElementById('btn-more-settings');
    if (!dashList) return;

    dashList.innerHTML = '';

    if (rules.length === 0) {
        dashList.innerHTML = '<div style="font-size: 0.85rem; color: var(--text-muted);">No alerts set.</div>';
        if (moreBtn) moreBtn.textContent = 'Set Alerts ➔';
        return;
    }

    const maxDash = 3;
    const rulesToShow = rules.slice(0, maxDash);

    rulesToShow.forEach(rule => {
        const periodMem = memory[rule.period] || { load1: 0, load2: 0, load3: 0, total: 0 };
        const wh = periodMem[rule.target] || 0;
        const kwh = wh / 1000;
        const currentTariff = typeof tariff !== 'undefined' ? tariff : { rate: 1 };
        const actualValue = rule.metric === 'energy' ? kwh : kwh * currentTariff.rate;

        let percentage = (actualValue / rule.limit) * 100;
        if (percentage > 100) percentage = 100;
        const validPercentage = Number.isNaN(percentage) ? 0 : percentage;
        const hue = Math.max(0, 120 - (validPercentage * 1.2));
        const color = `hsl(${hue}, 100%, 45%)`;

        const targetName = { total: 'Total System', load1: 'Iron', load2: 'Hair Dryer', load3: 'Bulb' }[rule.target];
        const unit = rule.metric === 'energy' ? 'kWh' : '₹';

        dashList.innerHTML += `
            <div style="margin-bottom: 0.8rem;">
                <div style="display: flex; justify-content: space-between; font-size: 0.8rem; margin-bottom: 4px; color: var(--text-main); font-weight: 500;">
                    <span>${targetName} (${unit})</span>
                    <span>${validPercentage.toFixed(0)}%</span>
                </div>
                <div style="width: 100%; height: 6px; background: #e2e8f0; border-radius: 3px;">
                    <div style="width: ${validPercentage}%; height: 100%; background: ${color}; border-radius: 3px; transition: width 0.3s, background-color 0.3s;"></div>
                </div>
            </div>
        `;
    });

    if (rules.length > 0) {
        if (moreBtn) moreBtn.textContent = 'See All ➔';
    }
}

function saveRules() {
    localStorage.setItem('watchdog_rules', JSON.stringify(rules));
}
