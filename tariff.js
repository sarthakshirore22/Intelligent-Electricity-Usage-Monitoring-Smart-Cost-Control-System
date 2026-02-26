import { getTariff, saveTariff } from './common.js';

document.addEventListener('DOMContentLoaded', () => {
    const rateInput = document.getElementById('input-rate');
    const fixedInput = document.getElementById('input-fixed');
    const solarInput = document.getElementById('input-solar');
    const saveBtn = document.getElementById('btn-save');
    const toast = document.getElementById('toast');

    // Load existing values into form
    const currentTariff = getTariff();
    rateInput.value = currentTariff.rate;
    fixedInput.value = currentTariff.fixed;

    const showToast = () => {
        toast.classList.add('show');
        setTimeout(() => {
            toast.classList.remove('show');
        }, 3000);
    };

    saveBtn.addEventListener('click', () => {
        const rateVal = parseFloat(rateInput.value);
        const fixedVal = parseFloat(fixedInput.value);

        if (isNaN(rateVal) || isNaN(fixedVal) || rateVal < 0 || fixedVal < 0) {
            alert("Please enter valid positive numbers for the settings.");
            return;
        }

        saveTariff(rateVal, fixedVal);
        showToast();
    });
});
