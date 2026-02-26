import { database, ref, query, orderByKey, startAt, endAt, get } from './firebase-config.js';
import { getTariff, isSolarMode } from './common.js';

document.addEventListener('DOMContentLoaded', async () => {
    const startUnix = parseInt(localStorage.getItem('calc_start_time'));
    const endUnix = parseInt(localStorage.getItem('calc_end_time'));

    const timeRangeDisplay = document.getElementById('display-time-range');

    if (isNaN(startUnix) || isNaN(endUnix)) {
        timeRangeDisplay.textContent = "No valid time range selected. Please return to dashboard.";
        hideLoaders();
        return;
    }

    // Original logic: display the range
    const formatOptions = { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' };
    const strStart = new Date(startUnix).toLocaleString('en-US', formatOptions);
    const strEnd = new Date(endUnix).toLocaleString('en-US', formatOptions);
    timeRangeDisplay.textContent = `${strStart} — ${strEnd}`;

    // Helper to format date for datetime-local (with seconds)
    const formatDateTimeLocal = (date) => {
        const pad = (n) => n.toString().padStart(2, '0');
        return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
    };

    // Pre-fill inputs if available
    const startTimeInput = document.getElementById('start-time');
    const endTimeInput = document.getElementById('end-time');

    if (startTimeInput && endTimeInput) {
        startTimeInput.value = formatDateTimeLocal(new Date(startUnix));
        endTimeInput.value = formatDateTimeLocal(new Date(endUnix));

        // Handle Calculate Button Click inside Cost page
        const btnCalculate = document.getElementById('btn-calculate');
        if (btnCalculate) {
            btnCalculate.addEventListener('click', () => {
                const sObj = new Date(startTimeInput.value);
                const eObj = new Date(endTimeInput.value);

                const sUnix = Math.floor(sObj.getTime());
                const eUnix = Math.floor(eObj.getTime());

                if (isNaN(sUnix) || isNaN(eUnix) || sUnix >= eUnix) {
                    alert("Please select a valid time range.");
                    return;
                }

                localStorage.setItem('calc_start_time', sUnix);
                localStorage.setItem('calc_end_time', eUnix);
                // Reload page to fetch new precise data
                window.location.reload();
            });
        }

        // Handle Quick Buttons inside Cost page
        const quickBtns = document.querySelectorAll('.quick-btn');
        quickBtns.forEach(btn => {
            btn.addEventListener('click', (e) => {
                const rangeType = e.target.dataset.range;
                const now = new Date();
                let start = new Date(now);
                let end = new Date(now);

                quickBtns.forEach(b => b.classList.remove('active'));

                switch (rangeType) {
                    case '5min':
                        start.setMinutes(start.getMinutes() - 5);
                        break;
                    case '1hour':
                        start.setHours(start.getHours() - 1);
                        break;
                    case '24hours':
                        start.setHours(start.getHours() - 24);
                        break;
                    case 'today':
                        start.setHours(0, 0, 0, 0);
                        break;
                    case 'yesterday':
                        start.setDate(start.getDate() - 1);
                        start.setHours(0, 0, 0, 0);
                        end = new Date(start);
                        end.setHours(23, 59, 59, 999);
                        break;
                    case '7days':
                        start.setDate(start.getDate() - 7);
                        break;
                    case 'thisMonth':
                        start.setDate(1);
                        start.setHours(0, 0, 0, 0);
                        break;
                    case 'lastMonth':
                        start.setMonth(start.getMonth() - 1);
                        start.setDate(1);
                        start.setHours(0, 0, 0, 0);
                        end = new Date(start);
                        end.setMonth(end.getMonth() + 1);
                        end.setDate(0);
                        end.setHours(23, 59, 59, 999);
                        break;
                    case 'thisYear':
                        start.setMonth(0, 1);
                        start.setHours(0, 0, 0, 0);
                        break;
                }

                e.target.classList.add('active');
                startTimeInput.value = formatDateTimeLocal(start);
                endTimeInput.value = formatDateTimeLocal(end);
            });
        });
    }

    try {
        const startSeconds = Math.floor(startUnix / 1000).toString();
        const endSeconds = Math.floor(endUnix / 1000).toString();

        // FIX 1: Query the root history node, not specific load folders
        const historyRef = ref(database, 'energyMonitoring/history');
        const rangeQuery = query(historyRef, orderByKey(), startAt(startSeconds), endAt(endSeconds));
        const snapshot = await get(rangeQuery);

        let totalE1 = 0, totalE2 = 0, totalE3 = 0;

        if (snapshot.exists()) {
            snapshot.forEach((childSnap) => {
                const data = childSnap.val();
                // FIX 3: Strictly parse float to prevent Load 3 string bug
                if (data.load1 && data.load1.energy != null) totalE1 += parseFloat(data.load1.energy) || 0;
                if (data.load2 && data.load2.energy != null) totalE2 += parseFloat(data.load2.energy) || 0;
                if (data.load3 && data.load3.energy != null) totalE3 += parseFloat(data.load3.energy) || 0;
            });
        }

        const tariff = getTariff();

        // FIX 2: Convert Wh to kWh before applying tariff
        const kwh1 = totalE1 / 1000;
        const kwh2 = totalE2 / 1000;
        const kwh3 = totalE3 / 1000;
        const kwhTotal = kwh1 + kwh2 + kwh3;

        let cost1 = 0, cost2 = 0, cost3 = 0, costTotal = 0;

        if (!isSolarMode) {
            cost1 = kwh1 * tariff.rate;
            cost2 = kwh2 * tariff.rate;
            cost3 = kwh3 * tariff.rate;
            // FIX 4: Exact sum for Total Cost to prevent 1-cent mismatch
            costTotal = cost1 + cost2 + cost3;
        }

        const updateCard = (key, unitVal, costVal) => {
            document.getElementById(`units-${key}`).textContent = unitVal.toFixed(3);
            document.getElementById(`cost-${key}`).textContent = isSolarMode ? "0.00" : costVal.toFixed(2);
            document.getElementById(`loading-${key}`).style.display = 'none';
        };

        updateCard('l1', kwh1, cost1);
        updateCard('l2', kwh2, cost2);
        updateCard('l3', kwh3, cost3);
        updateCard('total', kwhTotal, costTotal);

    } catch (e) {
        console.error(e);
        showError("Error fetching data from database.");
    }
});

function hideLoaders() {
    document.querySelectorAll('.loading-overlay').forEach(el => el.style.display = 'none');
}

function showError(msg) {
    hideLoaders();
    const els = ['total', 'l1', 'l2', 'l3'];
    els.forEach(key => {
        document.getElementById(`units-${key}`).textContent = "0.00";
        document.getElementById(`cost-${key}`).textContent = "0.00";
    });
    alert(msg);
}
