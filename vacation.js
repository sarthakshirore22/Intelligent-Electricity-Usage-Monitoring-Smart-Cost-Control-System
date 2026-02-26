import { database, ref, query, orderByKey, limitToLast, get } from './firebase-config.js';

let isArmed = false;
let whitelistedLoads = [];
let sentryInterval = null;

document.addEventListener('DOMContentLoaded', () => {
    const toggle = document.getElementById('vacation-toggle');
    const statusDisplay = document.getElementById('vacation-status-display');
    const modal = document.getElementById('vacation-modal');
    const closeBtn = document.getElementById('close-vacation-modal-btn');
    const form = document.getElementById('whitelist-form');
    const btnDisarm = document.getElementById('btn-disarm');
    const panicOverlay = document.getElementById('panic-overlay');
    const panicMessage = document.getElementById('panic-message');

    // Handle Toggle Switch
    toggle.addEventListener('change', (e) => {
        if (e.target.checked) {
            // Turning ON
            modal.classList.add('active');
            // Uncheck everything by default just in case
            document.querySelectorAll('.whitelist-chk').forEach(c => c.checked = false);
        } else {
            // Turning OFF
            disarmSystem();
        }
    });

    // Handle Modal Close (Cancels arming)
    closeBtn.addEventListener('click', () => {
        modal.classList.remove('active');
        toggle.checked = false; // Revert toggle
    });

    // Handle Arm System
    form.addEventListener('submit', (e) => {
        e.preventDefault();

        // Collect whitelisted loads
        whitelistedLoads = Array.from(document.querySelectorAll('.whitelist-chk:checked')).map(chk => chk.value);

        isArmed = true;
        modal.classList.remove('active');

        const deviceNames = { 'load1': 'Iron', 'load2': 'Hair Dryer', 'load3': 'Bulb' };
        const allowedNames = whitelistedLoads.map(l => deviceNames[l] || l).join(', ');
        const allowedMessage = allowedNames ? `— Allowed: ${allowedNames}` : `— No devices allowed`;

        statusDisplay.innerHTML = `<span style="color: var(--danger);">🛡️ System Armed <span style="color: var(--text-muted); font-weight: 500;">${allowedMessage}</span></span>`;
        statusDisplay.style.background = 'rgba(239, 68, 68, 0.1)';

        startSentry();
    });

    // Handle Panic Disarm button
    btnDisarm.addEventListener('click', () => {
        disarmSystem();
        // Remove effects
        document.body.classList.remove('panic-mode');
        panicOverlay.classList.remove('active');
        toggle.checked = false;
    });

    function disarmSystem() {
        isArmed = false;
        whitelistedLoads = [];
        if (sentryInterval) clearInterval(sentryInterval);
        sentryInterval = null;

        if (statusDisplay) {
            statusDisplay.innerHTML = `System Disarmed`;
            statusDisplay.style.background = 'var(--bg-dark)';
            statusDisplay.style.color = 'var(--text-muted)';
        }
    }

    function startSentry() {
        if (sentryInterval) clearInterval(sentryInterval);

        // Check every 5 seconds
        sentryInterval = setInterval(checkSentry, 5000);
    }

    async function checkSentry() {
        if (!isArmed) return;

        try {
            const historyRef = ref(database, 'energyMonitoring/history');
            const q = query(historyRef, orderByKey(), limitToLast(1));
            const snapshot = await get(q);

            if (snapshot.exists()) {
                let latestData = null;
                snapshot.forEach(child => {
                    latestData = child.val();
                });

                if (latestData) {
                    // Check non-whitelisted loads
                    const allLoads = ['load1', 'load2', 'load3'];
                    const bannedLoads = allLoads.filter(l => !whitelistedLoads.includes(l));

                    for (const load of bannedLoads) {
                        if (latestData[load]) {
                            // Check 'power' if available, otherwise 'energy'. Usually hardware noise gated < 0.4A so > 0 is breach.
                            // In JSON data usually energy is a cumulative value but let's check if power exists, or if current/power > 0

                            // Trying to extract power or current to see if it's currently active.
                            // Often 'power' or 'current' or 'energy' are the keys. If only 'energy' is there and it's increasing, it's a breach.
                            // Since we only get a snapshot, it's safest to look for `power` > 0 or `current` > 0.
                            const power = parseFloat(latestData[load].power) || 0;
                            const current = parseFloat(latestData[load].current) || 0;

                            // Let's assume > 0 on power/current means it's on.
                            if (power > 0 || current > 0) {
                                triggerPanic(load, power || (current * 230)); // Approximate power if only current is available
                                break; // Trigger only once
                            }
                        }
                    }
                }
            }
        } catch (error) {
            console.error("Sentry Algorithm Error:", error);
        }
    }

    function triggerPanic(loadId, powerDraw) {
        if (!isArmed) return;

        const loadNames = {
            'load1': 'IRON',
            'load2': 'HAIR DRYER',
            'load3': 'BULB'
        };

        const loadName = loadNames[loadId] || loadId;

        if (panicMessage) {
            panicMessage.textContent = `UNAUTHORIZED ACTIVITY DETECTED ON ${loadName} | Power Draw: ${powerDraw.toFixed(2)} Watts`;
        }

        document.body.classList.add('panic-mode');
        if (panicOverlay) panicOverlay.classList.add('active');

        // Stop sentry while panicked to prevent over-triggering
        if (sentryInterval) clearInterval(sentryInterval);
    }
});
