import { getTariff, isSolarMode } from './common.js';

document.addEventListener('DOMContentLoaded', () => {
    const startTimeInput = document.getElementById('start-time');
    const endTimeInput = document.getElementById('end-time');
    const btnCalculate = document.getElementById('btn-calculate');
    const quickBtns = document.querySelectorAll('.quick-btn');

    // Helper to format date for datetime-local (now with seconds)
    const formatDateTimeLocal = (date) => {
        const pad = (n) => n.toString().padStart(2, '0');
        return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
    };

    // Set default times on load (Today)
    const setQuickRange = (rangeType) => {
        const now = new Date();
        let start = new Date(now);
        let end = new Date(now);

        // Remove active class from all
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

        const activeBtn = document.querySelector(`[data-range="${rangeType}"]`);
        if (activeBtn) activeBtn.classList.add('active');

        startTimeInput.value = formatDateTimeLocal(start);
        endTimeInput.value = formatDateTimeLocal(end);
    };

    // Initialize with Today
    setQuickRange('today');

    // Quick button events
    quickBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            setQuickRange(e.target.dataset.range);
        });
    });

    // Calculate Button Navigation
    btnCalculate.addEventListener('click', () => {
        const startObj = new Date(startTimeInput.value);
        const endObj = new Date(endTimeInput.value);

        // Convert to Unix timestamp based on requirements
        const startUnix = Math.floor(startObj.getTime());
        const endUnix = Math.floor(endObj.getTime());

        if (isNaN(startUnix) || isNaN(endUnix) || startUnix >= endUnix) {
            alert("Please select a valid time range.");
            return;
        }

        // Save range to localStorage or pass via URL. We will use localStorage for this session info
        localStorage.setItem('calc_start_time', startUnix);
        localStorage.setItem('calc_end_time', endUnix);

        // Navigate to cost-result.html
        window.location.href = 'cost-result.html';
    });

    // --- Actionable Insights Engine ---
    let insightInitialRun = false;

    function generateInsights() {
        const memory = window.watchdogMemory;
        if (!memory || !memory.month || memory.month.total === 0) return; // Wait until data is loaded

        const tariff = getTariff();
        const insights = [];

        const totalKwh = memory.month.total / 1000;
        const todayKwh = memory.today.total / 1000;

        const now = new Date();
        const currentDayOfMonth = now.getDate() || 1; // avoid division by zero
        const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();

        const projectedMonthlyKwh = (totalKwh / currentDayOfMonth) * daysInMonth;

        // 1. The "Heavy Lifter"
        const maxLoad = Math.max(memory.month.load1, memory.month.load2, memory.month.load3);
        if (maxLoad > 0) {
            const percentage = (maxLoad / memory.month.total) * 100;
            if (percentage > 35) {
                let loadName = "Appliance";
                if (maxLoad === memory.month.load1) loadName = "Iron";
                else if (maxLoad === memory.month.load2) loadName = "Hair Dryer";
                else if (maxLoad === memory.month.load3) loadName = "Bulb";

                insights.push(`🔥 The <strong>${loadName}</strong> is your heavy lifter, drawing <strong>${percentage.toFixed(1)}%</strong> of your total energy this month.`);
            }
        }

        // 2. The "Time/Money Saver" - Dynamic based on max load
        if (maxLoad > 0) {
            let loadName = "Appliance";
            if (maxLoad === memory.month.load1) loadName = "Iron";
            else if (maxLoad === memory.month.load2) loadName = "Hair Dryer";
            else if (maxLoad === memory.month.load3) loadName = "Bulb";

            // Suggesting 15% reduction in their heaviest load
            const potentialSavingsKwh = maxLoad * 0.15;
            if (potentialSavingsKwh > 0.1) {
                if (isSolarMode) {
                    insights.push(`💡 Lowering your <strong>${loadName}</strong> usage by <strong>15%</strong> this month will conserve <strong>${potentialSavingsKwh.toFixed(1)} kWh</strong> of stored battery power.`);
                } else {
                    const financialSavings = (potentialSavingsKwh * tariff.rate);
                    insights.push(`💡 Reducing your <strong>${loadName}</strong> usage by <strong>15%</strong> this month can realistically save you <strong>₹${financialSavings.toFixed(1)}</strong>.`);
                }
            }
        }

        // 3. The "Slab Jumper" (Assuming slabs at 100 and 300)
        if (totalKwh > 85 && totalKwh < 100) {
            const distance = 100 - totalKwh;
            insights.push(`⚠️ Careful! You are only <strong>${distance.toFixed(1)} units</strong> away from entering a higher billing tier (over 100 units).`);
        } else if (totalKwh > 280 && totalKwh < 300) {
            const distance = 300 - totalKwh;
            insights.push(`⚠️ Alert! You are only <strong>${distance.toFixed(1)} units</strong> away from the most expensive billing tier (over 300 units).`);
        }

        // 4. The "Vampire Drain" (Overnight Usage)
        const projectedDailyKwh = totalKwh / currentDayOfMonth;
        if (now.getHours() < 9 && todayKwh > 0 && todayKwh > (projectedDailyKwh * 0.25)) {
            insights.push(`🧛 Your <strong>overnight background energy</strong> seems exceptionally high today. Consider turning off devices left on standby.`);
        }

        // 5. Grid/Solar Ratio
        if (tariff.solar > 0) {
            const solarSavedKwh = totalKwh * (tariff.solar / 100);
            if (isSolarMode) {
                insights.push(`☀️ Outstanding! Your system is running predominantly on green energy, massively minimizing reliance on the utility grid.`);
            } else {
                const solarFinancialSavings = solarSavedKwh * tariff.rate;
                insights.push(`☀️ Great job! Your solar contribution has effectively saved you <strong>₹${solarFinancialSavings.toFixed(0)}</strong> off your grid bill this month.`);
            }
        }

        // 6. End-of-Month Projection
        if (currentDayOfMonth >= 5) {
            if (isSolarMode) {
                insights.push(`📅 Based on your current habits, your estimated energy usage for this month will land around <strong>${projectedMonthlyKwh.toFixed(1)} kWh</strong>.`);
            } else {
                const projectedTotalBill = (projectedMonthlyKwh * tariff.rate) + parseFloat(tariff.fixed);
                insights.push(`📅 At your current usage rate, your estimated bill for this month will be <strong>₹${projectedTotalBill.toFixed(0)}</strong>.`);
            }
        } else {
            insights.push(`📈 Building your usage profile... Keep utilizing the system over the next few days to unlock an accurate monthly bill projection.`);
        }

        // 8. Low Use Congratulatory
        if (todayKwh > 0 && todayKwh < (projectedDailyKwh * 0.5) && now.getHours() > 14) {
            insights.push(`🌱 Incredible! You are operating at <strong>less than 50%</strong> of your daily average energy footprint today.`);
        }

        // 7. The "Efficiency Win"
        const storedYesterdayKwh = parseFloat(localStorage.getItem('yesterday_total_kwh') || '0');
        if (now.getHours() >= 20 && storedYesterdayKwh > 0 && todayKwh < (storedYesterdayKwh * 0.9)) {
            const diffPercent = ((storedYesterdayKwh - todayKwh) / storedYesterdayKwh) * 100;
            insights.push(`🎉 <strong>Excellent!</strong> You have consumed <strong>${diffPercent.toFixed(0)}% less</strong> energy today compared to yesterday.`);
        }

        // Store today's kwh at midnight for use tomorrow
        if (now.getHours() === 23 && now.getMinutes() >= 55) {
            localStorage.setItem('yesterday_total_kwh', todayKwh.toString());
        }

        // --- Render Top 3 Insights ---
        if (insights.length > 0) {
            // Shuffle array
            for (let i = insights.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [insights[i], insights[j]] = [insights[j], insights[i]];
            }

            // Get top 3 (or 2 to 3)
            const countToDisplay = Math.min(insights.length, 3);
            const topInsights = insights.slice(0, countToDisplay);

            const listEl = document.getElementById('insights-list');
            if (listEl) {
                listEl.innerHTML = '';
                topInsights.forEach(insightStr => {
                    const li = document.createElement('li');
                    li.className = 'insight-item';
                    li.innerHTML = `<span>${insightStr}</span>`;
                    listEl.appendChild(li);
                });
            }
        }
    }

    // Try starting engine after small delay to let watchdog memory initialize
    setTimeout(() => {
        generateInsights();
        // Run every 60 seconds
        setInterval(generateInsights, 60000);
    }, 2000);

});
