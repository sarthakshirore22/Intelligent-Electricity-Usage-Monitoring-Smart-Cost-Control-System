import { getTariff, isSolarMode } from './common.js';

document.addEventListener('DOMContentLoaded', () => {
    // Only run on the carbon-details page
    const detailCo2Today = document.getElementById('detail-co2-today');
    const detailCo2Month = document.getElementById('detail-co2-month');
    if (!detailCo2Today || !detailCo2Month) return;

    let tariff = getTariff();

    // Display Nodes
    const eqCar = document.getElementById('eq-car');
    const eqTree = document.getElementById('eq-tree');
    const eqPhone = document.getElementById('eq-phone');
    const valCar = document.getElementById('val-car');
    const valTree = document.getElementById('val-tree');
    const valPhone = document.getElementById('val-phone');

    const solarEqMessage = document.getElementById('solar-eq-message');
    const triviaContainer = document.getElementById('trivia-container');

    function loadMemoryAndRender() {
        try {
            const storedString = localStorage.getItem('watchdogMemory_latest');
            if (storedString) {
                const memory = JSON.parse(storedString);
                calculateAndRenderCarbon(memory, tariff);
            } else {
                detailCo2Today.textContent = "--";
                detailCo2Month.textContent = "--";
            }
        } catch (e) {
            console.error("Failed to parse memory from storage:", e);
        }
    }

    // Initial Load
    loadMemoryAndRender();

    // Listen for cross-tab updates (if user has dashboard open and it updates)
    window.addEventListener('storage', (e) => {
        if (e.key === 'watchdogMemory_latest') {
            loadMemoryAndRender();
        }
    });

    function calculateAndRenderCarbon(memory, tariff) {
        if (!memory || !memory.month) return;

        const solarPercentage = tariff.solar || 0;
        const monthlyTotalKwh = memory.month.total / 1000;
        const todayTotalKwh = memory.today ? (memory.today.total / 1000) : 0;

        const solarRatio = solarPercentage / 100;
        const gridRatio = 1 - solarRatio;

        const gridMonthlyKwh = monthlyTotalKwh * gridRatio;
        const gridTodayKwh = todayTotalKwh * gridRatio;

        const GRID_EMISSION_FACTOR = 0.710;

        let carbonMonthKg = gridMonthlyKwh * GRID_EMISSION_FACTOR;
        let carbonTodayKg = gridTodayKwh * GRID_EMISSION_FACTOR;

        if (isSolarMode) {
            carbonMonthKg = 0;
            carbonTodayKg = 0;
        }

        // Render Top Values
        detailCo2Today.textContent = carbonTodayKg.toFixed(2);
        detailCo2Month.textContent = carbonMonthKg.toFixed(2);

        // Equivalency Engine Math
        const CAR_EMISSION_PER_KM = 0.2;
        const TREE_ABSORPTION_PER_MONTH = 2;
        const PHONE_CHARGE_EMISSION = 0.008;

        const kmDriven = carbonMonthKg / CAR_EMISSION_PER_KM;
        const treesNeeded = Math.ceil(carbonMonthKg / TREE_ABSORPTION_PER_MONTH);
        const phonesCharged = Math.round(carbonMonthKg / PHONE_CHARGE_EMISSION);

        if (isSolarMode) {
            // Hide standard equivalency cards
            eqCar.style.display = 'none';
            eqTree.style.display = 'none';
            eqPhone.style.display = 'none';
            // Show Solar Message
            solarEqMessage.style.display = 'block';

            // Render Solar Trivia
            triviaContainer.innerHTML = `
                <div class="trivia-box" style="border-left-color: var(--success);">
                    <h4>☀️ The Power of Solar</h4>
                    <p>1 Unit of electricity generated from a rooftop solar panel or renewable green grid produces <strong>0.0 kg of CO₂</strong>, completely eliminating that segment of your carbon footprint.</p>
                </div>
            `;
        } else {
            // Show Equivalencies
            eqCar.style.display = 'block';
            eqTree.style.display = 'block';
            eqPhone.style.display = 'block';
            solarEqMessage.style.display = 'none';

            valCar.textContent = kmDriven.toFixed(1);
            valTree.textContent = treesNeeded;
            valPhone.textContent = phonesCharged.toLocaleString();

            // Render Standard Trivia
            triviaContainer.innerHTML = `
                <div class="trivia-box">
                    <h4>🔌 Grid Reality</h4>
                    <p>Consuming 1 Unit (1 kWh) of electricity from the standard Indian power grid generates approximately <strong>0.71 kg</strong> of CO₂ emissions.</p>
                </div>
                <div class="trivia-box">
                    <h4>🚗 Driving Equivalent</h4>
                    <p>Using 1 Unit of electricity creates the exact same carbon footprint as driving a standard petrol car for about <strong>3.5 kilometers</strong>.</p>
                </div>
                <div class="trivia-box">
                    <h4>🌳 Nature's Filter</h4>
                    <p>It takes one mature tree approximately <strong>11 days</strong> to absorb the 0.71 kg of CO₂ produced by consuming just a single unit of electricity.</p>
                </div>
            `;
        }
    }
});
