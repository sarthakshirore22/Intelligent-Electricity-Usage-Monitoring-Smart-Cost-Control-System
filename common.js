import { database, ref, onValue } from './firebase-config.js';

// Online/Offline Status Indicator
const initConnectionStatus = () => {
    const statusBadge = document.getElementById('connection-status');
    if (!statusBadge) return;

    const statusText = statusBadge.querySelector('.status-text');
    const connectedRef = ref(database, '.info/connected');

    onValue(connectedRef, (snap) => {
        if (snap.val() === true) {
            statusBadge.classList.add('online');
            statusText.textContent = 'Online';
        } else {
            statusBadge.classList.remove('online');
            statusText.textContent = 'Offline';
        }
    });
};

// Tariff Management
const DEFAULT_TARIFF = {
    rate: 5.33,
    fixed: 135
};

const getTariff = () => {
    const stored = localStorage.getItem('smart_energy_tariff');
    if (stored) {
        try {
            return JSON.parse(stored);
        } catch (e) {
            console.error('Error parsing tariff', e);
        }
    }
    return DEFAULT_TARIFF;
};

const saveTariff = (rate, fixed) => {
    localStorage.setItem('smart_energy_tariff', JSON.stringify({ rate, fixed }));
};

const displayTariffOnDashboard = () => {
    const rateEl = document.getElementById('display-rate');
    const fixedEl = document.getElementById('display-fixed');

    if (rateEl && fixedEl) {
        const tariff = getTariff();
        rateEl.textContent = parseFloat(tariff.rate).toFixed(2);
        fixedEl.textContent = parseFloat(tariff.fixed).toFixed(2);
    }
};

// Authentication & User Profile Management
const handleAuthentication = () => {
    const isLoginPage = window.location.pathname.endsWith('login.html');
    const storedUser = sessionStorage.getItem('smart_energy_user');

    if (!storedUser && !isLoginPage) {
        window.location.href = 'login.html';
        return;
    }

    if (isLoginPage && storedUser) {
        window.location.href = 'index.html';
        return;
    }

    if (!isLoginPage && storedUser) {
        const usernameDisplay = document.getElementById('display-username');
        if (usernameDisplay) {
            usernameDisplay.textContent = storedUser;
        }

        const profileBtn = document.getElementById('user-profile-btn');
        if (profileBtn) {
            profileBtn.addEventListener('click', () => {
                alert(`Logged in as: ${storedUser}`);
            });
        }
    }
};

// Solar Mode Global State & UI
export let isSolarMode = localStorage.getItem('solarMode') === 'true';

const applySolarModeUI = () => {
    if (isSolarMode) {
        document.querySelectorAll('.cost-metric, .cost-element, #tariff-section, #tariff-overview-card, #budget-input-group, #cost-chart-container, .cost-display').forEach(el => {
            if (el) el.classList.add('solar-hidden');
        });

        document.querySelectorAll('.calc-title').forEach(el => el.innerHTML = '⏱️ Energy Calculation');
        document.querySelectorAll('.calc-btn-text').forEach(el => el.textContent = el.textContent.replace('Cost', 'Energy'));
        document.querySelectorAll('.calc-total-title').forEach(el => el.innerHTML = '⚡ Total Energy');
        document.querySelectorAll('.calc-l1-title').forEach(el => el.innerHTML = '🔌 Iron Energy');
        document.querySelectorAll('.calc-l2-title').forEach(el => el.innerHTML = '🔌 Hair Dryer Energy');
        document.querySelectorAll('.calc-l3-title').forEach(el => el.innerHTML = '🔌 Bulb Energy');

        document.querySelectorAll('a[href="cost-result.html"]').forEach(el => el.innerHTML = '⚡ Energy Calculator');

        document.body.classList.add('solar-mode-active');
    }
};

const initSolarModeToggle = () => {
    const toggle = document.getElementById('solar-mode-toggle');
    if (toggle) {
        toggle.checked = isSolarMode;
        toggle.addEventListener('change', (e) => {
            isSolarMode = e.target.checked;
            localStorage.setItem('solarMode', isSolarMode);
            location.reload();
        });
    }
    applySolarModeUI();
};

// Initialize common functionality when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    handleAuthentication();
    initConnectionStatus();
    displayTariffOnDashboard();
    initSolarModeToggle();
});

export { getTariff, saveTariff };
