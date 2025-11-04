// Wait for the DOM to be fully loaded before running the app
document.addEventListener('DOMContentLoaded', () => {

    // --- 1. GLOBAL APP STATE & CONSTANTS ---
    let appData = {}; // Will be filled with data from data.json
    let quoteItems = []; // This is the "state" of our quote. It's the source of truth.
    const QUOTE_STORAGE_KEY = 'conservatoireQuote';

    // --- 2. CACHE DOM ELEMENTS ---
    // Get all elements we need to interact with once.
    const venuePage = document.getElementById('venuePage');
    const staffPage = document.getElementById('staffPage');
    const galleryContainer = document.getElementById('galleryContainer');
    const venueTab = document.getElementById('venueTab');
    const staffTab = document.getElementById('staffTab');

    const startTimeSelect = document.getElementById('startTime');
    const endTimeSelect = document.getElementById('endTime');
    const dayCheckboxes = document.querySelectorAll('.day');
    const venueSelect = document.getElementById('venue');
    const hireTypeSelect = document.getElementById('hireType');
    const formErrorEl = document.getElementById('form-error');

    const addBtn = document.getElementById('addBtn');
    const emailBtn = document.getElementById('emailBtn');
    const downloadBtn = document.getElementById('downloadBtn');

    const orderTableBody = document.getElementById('orderTable').querySelector('tbody');
    const grandTotalEl = document.getElementById('grandTotal');

    const venueGallery = document.getElementById('venueGallery');
    const modal = document.getElementById('venueModal');
    const modalImageContainer = document.getElementById('modalImageContainer');
    const modalDesc = document.getElementById('modalDesc');
    const modalClose = modal.querySelector('.modal-close');
    const modalPrev = modal.querySelector('.modal-prev');
    const modalNext = modal.querySelector('.modal-next');

    // This object will hold all the equipment input elements
    const equipInputs = {};

    // --- 3. MAIN INITIALIZATION ---
    // We use an async function to fetch data first
    async function init() {
        try {
            // Fetch data from our new JSON file
            const response = await fetch('data.json');
            if (!response.ok) throw new Error('Failed to load pricing data.');
            appData = await response.json();

            // Once data is loaded, we can build the app
            initializeApp();
        } catch (error) {
            console.error('Error initializing app:', error);
            document.body.innerHTML = `<div style="text-align: center; padding: 50px; font-family: sans-serif;">
                <h1>Error</h1>
                <p>Could not load application data. Please refresh the page.</p>
                <p><em>${error.message}</em></p>
            </div>`;
        }
    }

    // This function runs after all data is successfully fetched
    function initializeApp() {
        // Dynamically get equipment inputs based on the fetched data
        Object.keys(appData.equipmentRates).forEach(key => {
            equipInputs[key] = document.getElementById(`${key}_qty`);
        });

        // Add all our event listeners
        attachEventListeners();

        // Populate the time dropdowns
        populateTimes();

        // Load any saved quote from localStorage
        loadQuoteFromStorage();

        // Render the quote table (it will be empty or show the loaded quote)
        renderQuoteTable();
    }

    // --- 4. EVENT LISTENERS ---
    function attachEventListeners() {
        // Form & Quote Buttons
        addBtn.addEventListener('click', addQuoteLine);
        emailBtn.addEventListener('click', handleEmailQuote);
        downloadBtn.addEventListener('click', handleDownloadQuote);

        // Table Remove Button (Event Delegation)
        // We listen on the whole table body for clicks
        orderTableBody.addEventListener('click', handleTableClick);

        // Gallery & Modal
        venueGallery.addEventListener('click', handleGalleryClick);
        modalClose.addEventListener('click', closeModal);
        modalPrev.addEventListener('click', handleModalNav);
        modalNext.addEventListener('click', handleModalNav);
        modal.addEventListener('click', (e) => {
            if (e.target === modal) closeModal(); // Close if clicking background
        });

        // Tab Navigation
        venueTab.addEventListener('click', () => switchTab('venue'));
        staffTab.addEventListener('click', () => switchTab('staff'));
    }

    // --- 5. CORE LOGIC (STATE & RENDERING) ---

    /**
     * Creates a new quote item object, adds it to the `quoteItems` state array,
     * and then calls `renderQuoteTable` to update the view.
     */
    function addQuoteLine() {
        // 1. Get all form values
        const venueKey = venueSelect.value;
        const venueName = venueSelect.options[venueSelect.selectedIndex].text;
        const hireTypeKey = hireTypeSelect.value;
        const hireTypeName = hireTypeSelect.options[hireTypeSelect.selectedIndex].text;
        const startTimeStr = startTimeSelect.value;
        const endTimeStr = endTimeSelect.value;
        const selectedDays = Array.from(dayCheckboxes)
            .filter(cb => cb.checked)
            .map(cb => cb.value);

        // 2. Validation
        const startTime = parseTime(startTimeStr);
        const endTime = parseTime(endTimeStr);

        if (!venueKey) {
            return showError("Please select a venue.");
        }
        if (selectedDays.length === 0) {
            return showError("Please select at least one event day.");
        }
        if (endTime <= startTime) {
            return showError("Booking End Time must be after Start Time.");
        }
        
        // If validation passes, clear any old errors
        clearError();

        // 3. Calculations
        const hoursPerDay = endTime - startTime;
        const chargeableHoursPerDay = Math.max(appData.minBookingHours, hoursPerDay);
        const baseRate = appData.venueRates[venueKey][hireTypeKey];

        // 4. Create item objects and add to state
        selectedDays.forEach((day, index) => {
            const isFirstDay = (index === 0);
            const baseCost = baseRate * chargeableHoursPerDay;

            // Calculate equipment cost
            let totalEquipCost = 0;
            Object.keys(appData.equipmentRates).forEach(key => {
                const qty = parseInt(equipInputs[key].value, 10) || 0;
                if (qty > 0) {
                    const item = appData.equipmentRates[key];
                    if (item.perDay) {
                        totalEquipCost += (item.rate * qty);
                    } else if (isFirstDay) {
                        // 'Per booking' items only charged on the first day
                        totalEquipCost += (item.rate * qty);
                    }
                }
            });

            const totalSurcharge = calculateAfterHoursSurcharge([day], startTime, endTime);
            const subtotal = baseCost + totalEquipCost;
            const chargeableTotal = subtotal + totalSurcharge;
            const vat = chargeableTotal * appData.vatRate;
            const total = chargeableTotal + vat;

            // Create the item object
            const quoteItem = {
                id: Date.now() + index, // Unique ID for removal
                venueName: `${venueName} (${day})`,
                hireTypeName: hireTypeName,
                hours: chargeableHoursPerDay.toFixed(1),
                baseCost: baseCost,
                equipCost: totalEquipCost,
                subtotal: subtotal,
                vat: vat,
                total: total,
                surcharge: totalSurcharge
            };

            // Add the object to our state array
            quoteItems.push(quoteItem);
        });

        // 5. Re-render the table
        renderQuoteTable();

        // 6. Reset equipment
        Object.keys(equipInputs).forEach(key => {
            equipInputs[key].value = 0;
        });
    }

    /**
     * Re-renders the entire quote table based on the `quoteItems` state array.
     * This is the *only* function that should write to the order table.
     */
    function renderQuoteTable() {
        // 1. Clear the table
        orderTableBody.innerHTML = '';

        // 2. Loop through the state array and build rows
        quoteItems.forEach(item => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${item.venueName}</td>
                <td>${item.hireTypeName}</td>
                <td>${item.hours}</td>
                <td>£${item.baseCost.toFixed(2)}</td>
                <td>£${item.equipCost.toFixed(2)}</td>
                <td>£${item.subtotal.toFixed(2)}</td>
                <td>£${item.vat.toFixed(2)}</td>
                <td><strong>£${item.total.toFixed(2)}</strong></td>
                <td>£${item.surcharge.toFixed(2)}</td>
                <td><button class="removeBtn" data-id="${item.id}" style="color:red;border:none;background:none;cursor:pointer;font-size:18px;">✖</button></td>
            `;
            orderTableBody.appendChild(tr);
        });

        // 3. Update the grand total
        updateGrandTotal();
        
        // 4. Save the new state to localStorage
        saveQuoteToStorage();
    }

    /**
     * Handles clicks on the remove '✖' buttons using event delegation.
     */
    function handleTableClick(e) {
        if (e.target.classList.contains('removeBtn')) {
            // Get the unique ID from the button's data-id attribute
            const idToRemove = parseInt(e.target.dataset.id, 10);
            
            // Update the state by filtering out the removed item
            quoteItems = quoteItems.filter(item => item.id !== idToRemove);
            
            // Re-render the table with the updated state
            renderQuoteTable();
        }
    }

    /**
     * Calculates the grand total from the `quoteItems` state array.
     */
    function updateGrandTotal() {
        const total = quoteItems.reduce((acc, item) => acc + item.total, 0);
        grandTotalEl.textContent = `Grand Total: £${total.toFixed(2)}`;
    }

    /**
     * Saves the current `quoteItems` state to localStorage.
     */
    function saveQuoteToStorage() {
        localStorage.setItem(QUOTE_STORAGE_KEY, JSON.stringify(quoteItems));
    }

    /**
     * Loads the quote from localStorage into the `quoteItems` state.
     */
    function loadQuoteFromStorage() {
        const savedQuote = localStorage.getItem(QUOTE_STORAGE_KEY);
        if (savedQuote) {
            quoteItems = JSON.parse(savedQuote);
        }
    }

    // --- 6. FORM VALIDATION & UI ---

    function showError(message) {
        formErrorEl.textContent = message;
        formErrorEl.classList.add('visible');
    }

    function clearError() {
        formErrorEl.textContent = '';
        formErrorEl.classList.remove('visible');
    }

    function switchTab(tabName) {
        if (tabName === 'venue') {
            venuePage.style.display = 'block';
            galleryContainer.style.display = 'block';
            staffPage.style.display = 'none';
            venueTab.classList.add('active');
            staffTab.classList.remove('active');
        } else if (tabName === 'staff') {
            venuePage.style.display = 'none';
            galleryContainer.style.display = 'none';
            staffPage.style.display = 'block';
            venueTab.classList.remove('active');
            staffTab.classList.add('active');
        }
    }

    // --- 7. MODAL & GALLERY ---

    function handleGalleryClick(e) {
        const panel = e.target.closest('.panel');
        if (panel) {
            const venueKey = panel.dataset.venue;
            
            // UX Improvement: Sync gallery click to the dropdown
            venueSelect.value = venueKey;
            
            openModal(venueKey);
        }
    }

    function showModalImage(venueKey, index) {
        const details = appData.venueDetails[venueKey];
        if (!details || !details.images || !details.images[index]) return;

        const image = details.images[index];
        const altText = details.alt || venueKey;
        
        modalImageContainer.innerHTML = `<img src="${image}" alt="${altText}" onerror="this.src='https://placehold.co/600x400/002e5b/white?text=${altText}'">`;
        modal.dataset.currentImageIndex = index;
        modal.dataset.currentVenue = venueKey;
        modalDesc.textContent = details.desc;

        modalPrev.style.display = (index === 0) ? 'none' : 'block';
        modalNext.style.display = (index === details.images.length - 1) ? 'none' : 'block';
    }

    function openModal(venueKey) {
        const details = appData.venueDetails[venueKey];
        if (!details) return;
        showModalImage(venueKey, 0);
        modal.style.display = 'flex';
    }

    function closeModal() {
        modal.style.display = 'none';
    }

    function handleModalNav(e) {
        const direction = e.target.classList.contains('modal-next') ? 1 : -1;
        const venueKey = modal.dataset.currentVenue;
        const details = appData.venueDetails[venueKey];
        const currentIndex = parseInt(modal.dataset.currentImageIndex, 10);
        const newIndex = currentIndex + direction;

        if (newIndex >= 0 && newIndex < details.images.length) {
            showModalImage(venueKey, newIndex);
        }
    }

    // --- 8. QUOTE EXPORT FUNCTIONS ---

    function handleEmailQuote() {
        if (quoteItems.length === 0) {
            return showError("Please add at least one item to the quote before emailing.");
        }
        clearError();
        const subject = "Royal Birmingham Conservatoire - Quote Enquiry";
        const body = generateEmailBody();
        window.location.href = `mailto:conservatoireevents@bcu.ac.uk?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    }

    function handleDownloadQuote() {
        if (quoteItems.length === 0) {
            return showError("Please add at least one item to the quote before downloading.");
        }
        clearError();
        const htmlContent = generateQuoteHTML();
        const blob = new Blob([htmlContent], { type: 'text/html' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'conservatoire-quote.html';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(a.href);
    }

    /**
     * Generates a plain-text summary from the `quoteItems` state array.
     */
    function generateEmailBody() {
        let body = "Here is my quote summary:\n\n";
        
        quoteItems.forEach((item, index) => {
            body += `--- Item ${index + 1} ---\n`;
            body += `Venue: ${item.venueName}\n`;
            body += `Hire Type: ${item.hireTypeName}\n`;
            body += `Total Hours: ${item.hours}\n`;
            body += `Base Cost: £${item.baseCost.toFixed(2)}\n`;
            body += `Equipment: £${item.equipCost.toFixed(2)}\n`;
            body += `After-Hours: £${item.surcharge.toFixed(2)}\n`;
            body += `Subtotal (ex. VAT): £${(item.subtotal + item.surcharge).toFixed(2)}\n`;
            body += `Total (inc. VAT): £${item.total.toFixed(2)}\n\n`;
        });
        
        body += `--------------------\n`;
        body += `${grandTotalEl.textContent}\n\n`;
        body += `Disclaimer: Quote is for reference purposes only. All costs are subject to review.\n`;
        return body;
    }

    /**
     * Generates an HTML summary from the `quoteItems` state array.
     */
    function generateQuoteHTML() {
        const tableHeader = `
            <thead>
                <tr>
                    <th>Venue</th><th>Hire Type</th><th>Hours</th><th>Base (£)</th>
                    <th>Equipment (£)</th><th>Subtotal (£)</th><th>VAT (£)</th>
                    <th>Total (£)</th><th>After-Hours (£)</th>
                </tr>
            </thead>
        `;
        
        // Generate table rows by mapping the state array to HTML strings
        const tableBody = `
            <tbody>
                ${quoteItems.map(item => `
                    <tr>
                        <td>${item.venueName}</td>
                        <td>${item.hireTypeName}</td>
                        <td>${item.hours}</td>
                        <td>£${item.baseCost.toFixed(2)}</td>
                        <td>£${item.equipCost.toFixed(2)}</td>
                        <td>£${item.subtotal.toFixed(2)}</td>
                        <td>£${item.vat.toFixed(2)}</td>
                        <td><strong>£${item.total.toFixed(2)}</strong></td>
                        <td>£${item.surcharge.toFixed(2)}</td>
                    </tr>
                `).join('')}
            </tbody>
        `;

        const totalHTML = grandTotalEl.outerHTML;
        const disclaimer = `<div style="font-family:Arial,sans-serif;color:#6b6b6b;font-size:13px;margin-top:8px;">
            <strong>Disclaimer:</strong> Quote is for reference purposes only. All costs are subject to review.
        </div>`;
        const css = `<style>
            body{font-family:Arial,Helvetica,sans-serif;color:#222;margin:20px;}
            table{width:100%;border-collapse:collapse;margin-top:10px;}
            th, td{border:1px solid #ddd;padding:8px;text-align:center;}
            th{background:#002e5b;color:white;}
            td:first-child, th:first-child { text-align: left; }
            #grandTotal{font-weight:700;font-size:18px;color:#002e5b;text-align:right;margin-top:10px;}
        </style>`;

        return `<!DOCTYPE html><html><head><title>Conservatoire Quote</title>${css}</head><body>
            <h1>Royal Birmingham Conservatoire — Quote Summary</h1>
            <table>${tableHeader}${tableBody}</table>
            ${totalHTML}
            ${disclaimer}
        </body></html>`;
    }

    // --- 9. UTILITY HELPERS ---

    function populateTimes() {
        const fragment = document.createDocumentFragment();
        for (let h = 0; h < 24; h++) {
            for (let m = 0; m < 60; m += 30) {
                if (h === 23 && m === 30) break; // Don't add 23:30
                const time = `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
                const option = new Option(time, time);
                fragment.appendChild(option);
            }
        }
        startTimeSelect.appendChild(fragment.cloneNode(true));
        endTimeSelect.appendChild(fragment);

        startTimeSelect.value = "09:00";
        endTimeSelect.value = "17:00";
    }

    function parseTime(timeStr) {
        const [hours, minutes] = timeStr.split(':').map(Number);
        return hours + (minutes / 60);
    }

    function calculateAfterHoursSurcharge(selectedDays, startTime, endTime) {
        let totalAfterHours = 0;
        selectedDays.forEach(day => {
            const isWeekend = (day === 'Sat' || day === 'Sun');
            const regStart = 8.0;
            const regEnd = isWeekend ? 19.0 : 23.0;

            const earlyHours = Math.max(0, regStart - startTime);
            const lateHours = Math.max(0, endTime - regEnd);

            totalAfterHours += (earlyHours + lateHours);
        });
        return totalAfterHours * appData.afterHoursRate;
    }

    // --- 10. RUN THE APP ---
    init();
});
