import { database, ref, query, orderByKey, endAt, startAt, get } from './firebase-config.js';
import { getTariff, isSolarMode } from './common.js';

let energyChartInstance = null;
let costChartInstance = null;
let rawData = [];

// Helper to format date for datetime-local (with seconds)
const formatDateTimeLocal = (date) => {
    const pad = (n) => n.toString().padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
};

document.addEventListener('DOMContentLoaded', async () => {
    const startUnix = parseInt(localStorage.getItem('calc_start_time'));
    const endUnix = parseInt(localStorage.getItem('calc_end_time'));
    const timeRangeDisplay = document.getElementById('display-time-range');

    if (isNaN(startUnix) || isNaN(endUnix)) {
        timeRangeDisplay.textContent = "No valid time range selected. Please return to dashboard.";
        hideLoaders();
        return;
    }

    const formatOptions = { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' };
    const strStart = new Date(startUnix).toLocaleString('en-US', formatOptions);
    const strEnd = new Date(endUnix).toLocaleString('en-US', formatOptions);
    timeRangeDisplay.textContent = `${strStart} — ${strEnd}`;

    const checkboxes = {
        load1: document.getElementById('chk-l1'),
        load2: document.getElementById('chk-l2'),
        load3: document.getElementById('chk-l3'),
        total: document.getElementById('chk-total')
    };
    Object.values(checkboxes).forEach(cb => cb.addEventListener('change', updateCharts));

    // Pre-fill inputs if available
    const startTimeInput = document.getElementById('start-time');
    const endTimeInput = document.getElementById('end-time');

    if (startTimeInput && endTimeInput) {
        startTimeInput.value = formatDateTimeLocal(new Date(startUnix));
        endTimeInput.value = formatDateTimeLocal(new Date(endUnix));

        // Handle Update Graphs Button Click
        const btnUpdateGraphs = document.getElementById('btn-update-graphs');
        if (btnUpdateGraphs) {
            btnUpdateGraphs.addEventListener('click', () => {
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
                window.location.reload();
            });
        }

        // Handle Quick Buttons
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

    let chartUnit = 'minute';
    let chartFormat = 'HH:mm';

    try {
        const durationMs = endUnix - startUnix;
        let binMs;

        // Dynamic Scale Matrix
        if (durationMs <= 2 * 60 * 60 * 1000) {
            // Mode 1: Micro-View (<= 2 hours)
            binMs = 60 * 1000; // 1 min bin
            chartUnit = 'minute';
            chartFormat = 'HH:mm';
        } else if (durationMs <= 48 * 60 * 60 * 1000) {
            // Mode 2: Daily View (<= 48 hours)
            binMs = 60 * 60 * 1000; // 1 hr bin
            chartUnit = 'hour';
            chartFormat = 'MMM d, HH:mm';
        } else {
            // Mode 3: Macro-View (> 48 hours)
            binMs = 24 * 60 * 60 * 1000; // 1 day bin
            chartUnit = 'day';
            chartFormat = 'MMM d';
        }

        const startSeconds = Math.floor(startUnix / 1000).toString();
        const endSeconds = Math.floor(endUnix / 1000).toString();

        // Query the root history node once
        const historyRef = ref(database, 'energyMonitoring/history');
        const q = query(historyRef, orderByKey(), startAt(startSeconds), endAt(endSeconds));
        const snapshot = await get(q);

        // Prepare Bins
        let boundaries = [];
        for (let t = startUnix; t <= endUnix; t += binMs) {
            boundaries.push(t);
        }
        if (boundaries[boundaries.length - 1] !== endUnix) {
            boundaries.push(endUnix);
        }

        const bins = Array.from({ length: boundaries.length - 1 }, (_, i) => ({
            e1: 0, e2: 0, e3: 0, timestamp: boundaries[i + 1]
        }));

        if (snapshot.exists()) {
            snapshot.forEach((childSnap) => {
                const ts = parseInt(childSnap.key) * 1000;
                const data = childSnap.val();

                let binIndex = boundaries.findIndex((b, i) => ts >= boundaries[i] && ts < boundaries[i + 1]);
                if (binIndex === -1 && ts === endUnix) binIndex = bins.length - 1; // Catch exact end time
                if (binIndex >= 0 && binIndex < bins.length) {
                    // FIX 3: Parse Floats
                    if (data.load1 && data.load1.energy != null) bins[binIndex].e1 += parseFloat(data.load1.energy) || 0;
                    if (data.load2 && data.load2.energy != null) bins[binIndex].e2 += parseFloat(data.load2.energy) || 0;
                    if (data.load3 && data.load3.energy != null) bins[binIndex].e3 += parseFloat(data.load3.energy) || 0;
                }
            });
        }

        const tariff = getTariff();

        bins.forEach(bin => {
            // FIX 2: Convert Wh to kWh
            const kwh1 = bin.e1 / 1000;
            const kwh2 = bin.e2 / 1000;
            const kwh3 = bin.e3 / 1000;
            const kwhTotal = kwh1 + kwh2 + kwh3; // FIX 4: Perfect sum

            const pointCost = {
                load1: kwh1 * tariff.rate,
                load2: kwh2 * tariff.rate,
                load3: kwh3 * tariff.rate,
                total: kwhTotal * tariff.rate
            };

            rawData.push({
                timestamp: bin.timestamp,
                energy: { load1: kwh1, load2: kwh2, load3: kwh3, total: kwhTotal },
                cost: { ...pointCost }
            });
        });

        hideLoaders();
        updateCharts({ chartUnit, chartFormat });

    } catch (e) {
        console.error(e);
        hideLoaders();
        alert("Error fetching data from database.");
    }
});

function hideLoaders() {
    document.querySelectorAll('.loading-overlay').forEach(el => el.style.display = 'none');
}

function updateCharts(optionsConfig) {
    if (rawData.length === 0) return;

    // Use default values if updateCharts gives no params (e.g. checkbox click)
    const unit = optionsConfig?.chartUnit || (window.currentChartUnit || 'minute');
    const format = optionsConfig?.chartFormat || (window.currentChartFormat || 'HH:mm');

    // Store variables globally so checkbox updates keep them
    if (optionsConfig) {
        window.currentChartUnit = unit;
        window.currentChartFormat = format;
    }

    const showL1 = document.getElementById('chk-l1').checked;
    const showL2 = document.getElementById('chk-l2').checked;
    const showL3 = document.getElementById('chk-l3').checked;
    const showTotal = document.getElementById('chk-total').checked;

    const getNestedData = (type, key) => rawData.map(d => ({ x: d.timestamp, y: d[type][key] }));

    const eDatasets = [
        { label: 'Iron', data: getNestedData('energy', 'load1'), backgroundColor: '#ef4444', hidden: !showL1, borderRadius: 4 },
        { label: 'Hair Dryer', data: getNestedData('energy', 'load2'), backgroundColor: '#f59e0b', hidden: !showL2, borderRadius: 4 },
        { label: 'Bulb', data: getNestedData('energy', 'load3'), backgroundColor: '#10b981', hidden: !showL3, borderRadius: 4 },
        { label: 'Total', data: getNestedData('energy', 'total'), backgroundColor: '#3b82f6', hidden: !showTotal, borderRadius: 4 }
    ];

    const cDatasets = [
        { label: 'Iron', data: getNestedData('cost', 'load1'), backgroundColor: '#ef4444', hidden: !showL1, borderRadius: 4 },
        { label: 'Hair Dryer', data: getNestedData('cost', 'load2'), backgroundColor: '#f59e0b', hidden: !showL2, borderRadius: 4 },
        { label: 'Bulb', data: getNestedData('cost', 'load3'), backgroundColor: '#10b981', hidden: !showL3, borderRadius: 4 },
        { label: 'Total', data: getNestedData('cost', 'total'), backgroundColor: '#3b82f6', hidden: !showTotal, borderRadius: 4 }
    ];

    const timeScaleOptions = {
        type: 'time',
        time: {
            unit: unit,
            displayFormats: {
                minute: 'HH:mm',
                hour: 'MMM d, HH:mm',
                day: 'MMM d'
            },
            tooltipFormat: 'MMM d, yyyy HH:mm'
        },
        ticks: {
            color: '#64748b',
            autoSkip: true,
            maxTicksLimit: 12,
            font: { family: "'Inter', sans-serif" }
        },
        grid: {
            color: 'rgba(0,0,0,0.05)'
        }
    };

    // Prevent Bar Overlap: Dynamically stretch inner chart container based on density
    const numPoints = rawData.length;
    // 30px per clustered time point guarantees the bars are wide enough to read
    const dynamicCanvasWidth = Math.max(800, numPoints * 30);

    const energyInner = document.getElementById('energy-chart-inner');
    if (energyInner) energyInner.style.width = `${dynamicCanvasWidth}px`;

    const costInner = document.getElementById('cost-chart-inner');
    if (costInner) costInner.style.width = `${dynamicCanvasWidth}px`;

    const commonTooltip = {
        backgroundColor: 'rgba(15, 23, 42, 0.95)',
        titleColor: '#f8fafc',
        bodyColor: '#cbd5e1',
        borderColor: 'rgba(255,255,255,0.1)',
        borderWidth: 1,
        padding: 12,
        boxPadding: 6,
        usePointStyle: true,
        titleFont: { family: "'Inter', sans-serif", size: 13 },
        bodyFont: { family: "'Inter', sans-serif", size: 12 }
    };

    // Energy Chart (Bar)
    const ctxEnergy = document.getElementById('energyChart').getContext('2d');
    if (energyChartInstance) energyChartInstance.destroy();
    energyChartInstance = new Chart(ctxEnergy, {
        type: 'bar',
        data: { datasets: eDatasets },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: timeScaleOptions,
                y: { ticks: { color: '#64748b', font: { family: "'Inter', sans-serif" } }, grid: { color: 'rgba(0,0,0,0.05)' }, title: { display: true, text: 'Energy (kWh)', color: '#64748b', font: { family: "'Inter', sans-serif", weight: '600' } } }
            },
            plugins: {
                legend: { display: false },
                tooltip: { ...commonTooltip, mode: 'index', intersect: false }
            },
            interaction: { mode: 'index', intersect: false }
        }
    });

    // Cost Chart (Line/Area)
    const ctxCost = document.getElementById('costChart').getContext('2d');
    if (costChartInstance) costChartInstance.destroy();

    const costContainer = document.getElementById('costChart').closest('.chart-container');
    if (isSolarMode) {
        if (costContainer) costContainer.classList.add('solar-hidden');
    } else {
        if (costContainer) costContainer.classList.remove('solar-hidden');
        costChartInstance = new Chart(ctxCost, {
            type: 'bar',
            data: { datasets: cDatasets },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    x: timeScaleOptions,
                    y: { ticks: { color: '#64748b', font: { family: "'Inter', sans-serif" } }, grid: { color: 'rgba(0,0,0,0.05)' }, title: { display: true, text: 'Cost (₹)', color: '#64748b', font: { family: "'Inter', sans-serif", weight: '600' } } }
                },
                plugins: {
                    legend: { display: false },
                    tooltip: { ...commonTooltip, mode: 'index', intersect: false }
                },
                interaction: { mode: 'index', intersect: false }
            }
        });
    }
}
