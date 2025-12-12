// staff_report.js

// --- Configuration ---
const csvUrl = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQ1OOdGnJhw1k6U15Aybn_2JWex_qTShP6w7CXm0_auXnc8vFnvlabPZjK3lsjqkHgn6NgeKKPyu9qW/pub?gid=1720680457&single=true&output=csv';

// --- Global Data Storage ---
let allData = [];
let headers = [];
let allStaffNames = [];
let freshCustomerDetailsMap = new Map();
let myChart = null;
let myCumulativeChart = null;

// --- Fixed Date Range for Data Validity ---
const dataStartDate = new Date('2025-04-01T00:00:00');
const currentDate = new Date(); // Current date and time
// Max date is the end of the current day
const maxDataEndDate = new Date(currentDate.getFullYear(), currentDate.getMonth(), currentDate.getDate(), 23, 59, 59);


// --- DOM Elements (Declared globally, assigned in init()) ---
let reportContainer = null; 
let companySelect = null; 
// Removed staffSearchInput
let staffSelect = null; 
let monthSelect = null; 
let startDateInput = null; 
let endDateInput = null; 

let totalInflowEl = null; 
let totalOutflowEl = null; 
let totalNetGrowthEl = null; 
let freshCustomerListEl = null; 

let churnRateEl = null; 
let repeatBusinessListEl = null; 

let monthlyTableBody = null; 
let companyBreakdownTableBody = null; 
let productBreakdownTableBody = null; 
let detailedEntriesContainer = null; 
let backToReportBtn = null; 
let detailedTitleEl = null; 
let detailedTableBody = null; 
let showCustomerNameCheckbox = null; 
let performanceChartCanvas = null; 
let cumulativePerformanceChartCanvas = null;


// --- Utility Functions ---
function parseLine(line) {
    const fields = [];
    let inQuote = false;
    let currentField = '';
    for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char === '"') {
            if (inQuote && i + 1 < line.length && line[i + 1] === '"') {
                currentField += '"';
                i++;
            } else {
                inQuote = !inQuote;
            }
        } else if (char === ',' && !inQuote) {
            fields.push(currentField);
            currentField = '';
        } else {
            currentField += char;
        }
    }
    fields.push(currentField);
    return fields.map(field => field.trim());
}

function parseDate(dateString) {
    if (!dateString) return null;
    const normalizedDateString = dateString.replace(/[-.]/g, '/');
    const parts = normalizedDateString.split('/');
    if (parts.length === 3) {
        let day = parseInt(parts[0], 10);
        let month = parseInt(parts[1], 10);
        let year = parseInt(parts[2], 10);
        if (day >= 1 && day <= 31 && month >= 1 && month <= 12 && year >= 1900 && year <= 2100) {
            const date = new Date(year, month - 1, day);
            if (date.getDate() === day && (date.getMonth() + 1) === month && date.getFullYear() === year) {
                return date;
            }
        }
    }
    return null;
}

// Helper to format a Date object into YYYY-MM-DD string for input[type=date]
function formatDateToInput(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function formatIndianNumber(num) {
    if (isNaN(num) || num === null) return num;
    let parts = num.toFixed(0).toString().split('.');
    let integerPart = parts[0];
    let decimalPart = parts.length > 1 ? '.' + parts[1] : '';
    let sign = '';
    if (integerPart.startsWith('-')) {
        sign = '-';
        integerPart = integerPart.substring(1);
    }
    if (integerPart.length <= 3) return sign + integerPart + decimalPart;
    let lastThree = integerPart.substring(integerPart.length - 3);
    let otherNumbers = integerPart.substring(0, integerPart.length - 3);
    otherNumbers = otherNumbers.replace(/\B(?=(\d{2})+(?!\d))/g, ',');
    return sign + otherNumbers + ',' + lastThree + decimalPart;
}

function parseNumericalValue(valueString) {
    if (valueString === null || valueString === undefined || valueString === '') {
        return 0;
    }
    const cleanedValue = String(valueString).replace(/,/g, '');
    const parsedValue = parseFloat(cleanedValue);
    return isNaN(parsedValue) ? 0 : parsedValue;
}

function getValueFromRow(row, headers, columnName) {
    const colIndex = headers.indexOf(columnName);
    if (colIndex !== -1 && row[colIndex] !== undefined && row[colIndex] !== null) {
        return parseNumericalValue(row[colIndex]);
    }
    return 0;
}

function isFreshCustomer(customerType) {
    const freshTypes = ['FRESH CUSTOMER', 'FRESH CUSTOMER/STAFF', 'FRESH STAFF'];
    return freshTypes.includes(String(customerType).trim().toUpperCase());
}

// Corrected Utility function to parse Company/Product from the special header names
function parseCompanyAndProductFromHeader(header) {
    const parts = header.trim().split(/\s+/); // Split by space
    let company = null;
    let product = null;
    let type = null; // INF or OUT

    if (parts.length >= 3) {
        // Example: SML NCD INF, VFL GB OUT
        company = parts[0];
        product = parts.slice(1, parts.length - 1).join(' '); // Join all middle parts for product
        type = parts[parts.length - 1]; // Last part is INF/OUT
        
    } else if (parts.length === 2 && (parts[1] === 'INF' || parts[1] === 'OUT')) {
        // Handles simple two-word headers like LLP INF or LLP OUT
        company = parts[0];
        product = parts[0]; 
        type = parts[1];
        
    } else if (parts.length === 2 && parts[1] === 'PURCHASE') {
        // Example: SML PURCHASE
        company = parts[0];
        product = parts[1]; // Product is 'PURCHASE'
        type = 'OUT';
        
    } else {
        // Handle other headers that don't fit the pattern (e.g., 'DATE', 'INF Total', etc.)
        return { company: null, product: null, type: null };
    }

    return { company, product, type };
}

// Utility function to get all relevant Inflow/Outflow column headers
function getInflowOutflowHeaders() {
    const infOutHeaders = [];
    headers.forEach(header => {
        const { company, type } = parseCompanyAndProductFromHeader(header);
        // Only include headers that successfully parse into a Company and an INF/OUT type
        if (company && (type === 'INF' || type === 'OUT')) {
            infOutHeaders.push(header);
        }
    });
    return infOutHeaders;
}

/**
 * Maps the short product code (e.g., 'BD', 'FD') to its full display name.
 * @param {string} productCode - The short product code.
 * @returns {string} The full product display name.
 */
function mapProductToDisplayName(productCode) {
    if (!productCode) return 'No Product Specified';

    const code = productCode.toUpperCase();
    
    switch (code) {
        case 'BD':
        case 'SD':
            return 'Subdebt';
        case 'FD':
            return 'Fixed Deposit';
        case 'GB':
            return 'Golden Bond';
        case 'LLP':
            return 'LLP';
        case 'NCD':
            return 'NCD';
        case 'PURCHASE':
            return 'Purchase'; // Assuming 'PURCHASE' is an outflow type, keep it separate
        default:
            return productCode; // Return original if not in the map
    }
}


// --- New Collapse Function ---
/**
 * Toggles the collapsed state of the content next to the header element.
 * @param {HTMLElement} headerElement - The clickable header element (e.g., h3).
 */ 
function toggleCollapse(headerElement) {
    const content = headerElement.nextElementSibling; // collapsible-content is the next sibling
    headerElement.classList.toggle('collapsed');
    content.classList.toggle('collapsed');
}

// --- Main Data Fetching and Initialization ---
async function init() {
    try {
        // NEW: DOM Element Assignments
        reportContainer = document.getElementById('report-container');
        companySelect = document.getElementById('company-select');
        // Removed staffSearchInput assignment
        staffSelect = document.getElementById('staff-select');
        monthSelect = document.getElementById('month-select');
        startDateInput = document.getElementById('start-date');
        endDateInput = document.getElementById('end-date');
        totalInflowEl = document.getElementById('total-inflow');
        totalOutflowEl = document.getElementById('total-outflow');
        totalNetGrowthEl = document.getElementById('total-net-growth');
        freshCustomerListEl = document.getElementById('fresh-customer-list');
        churnRateEl = document.getElementById('churn-rate');
        repeatBusinessListEl = document.getElementById('repeat-business-list');
        monthlyTableBody = document.querySelector('#monthly-table tbody');
        companyBreakdownTableBody = document.querySelector('#company-breakdown-table tbody');
        productBreakdownTableBody = document.querySelector('#product-breakdown-table tbody');
        detailedEntriesContainer = document.getElementById('detailed-entries-container');
        backToReportBtn = document.getElementById('back-to-report-btn');
        detailedTitleEl = document.getElementById('detailed-title');
        detailedTableBody = document.querySelector('#detailed-table tbody');
        showCustomerNameCheckbox = document.getElementById('show-customer-name');
        performanceChartCanvas = document.getElementById('performance-chart');
        cumulativePerformanceChartCanvas = document.getElementById('cumulative-performance-chart');
        
        // Add collapse functionality to all initial headers
        document.querySelectorAll('.collapsible-header').forEach(header => {
            // Initial collapse state can be applied here if needed
        });


        const response = await fetch(csvUrl);
        const csvText = await response.text();
        const rows = csvText.trim().split('\n');

        if (rows.length === 0) {
            console.error('No data found in CSV.');
            return;
        }

        headers = parseLine(rows[0]);
        const dateColIndex = headers.indexOf('DATE');
        const staffColIndex = headers.indexOf('STAFF NAME');


        allData = rows.slice(1).map(row => {
            const parsedRow = parseLine(row);
            if (dateColIndex !== -1 && parsedRow[dateColIndex]) {
                const dateObj = parseDate(parsedRow[dateColIndex]);
                // Use maxDataEndDate to filter rows newer than today
                if (dateObj && dateObj >= dataStartDate && dateObj <= maxDataEndDate) {
                    parsedRow[dateColIndex] = dateObj;
                    return parsedRow;
                }
            }
            return null;
        }).filter(row => row !== null);

        populateFilters();
        
        // Add event listeners after DOM is loaded and elements are assigned
        companySelect.addEventListener('change', generateReport);
        staffSelect.addEventListener('change', generateReport);
        monthSelect.addEventListener('change', generateReport);
        // Removed: staffSearchInput.addEventListener('input', filterStaffSelect);
        startDateInput.addEventListener('change', handleDateRangeChange);
        endDateInput.addEventListener('change', handleDateRangeChange);
        backToReportBtn.addEventListener('click', showMainReport);
        showCustomerNameCheckbox.addEventListener('change', toggleCustomerNameColumn);

        // Add event listeners for table row drilldown, needs to be attached to the table body
        // and delegate the event, as rows are dynamic.
        monthlyTableBody.addEventListener('click', (e) => handleDrilldown(e, 'month'));
        companyBreakdownTableBody.addEventListener('click', (e) => handleDrilldown(e, 'company'));
        productBreakdownTableBody.addEventListener('click', (e) => handleDrilldown(e, 'product'));
        
        // Initial report generation might be blocked if staff/company is not selected.
        // Since company is now fixed, we just need to ensure a staff is selected for the first run.
        if (staffSelect.value) {
            generateReport();
        } else {
            document.querySelector('#report-container').innerHTML = '<p class="info-message">Please select a staff member to view the performance report.</p>';
        }

    } catch (error) {
        console.error('Error initializing report:', error);
        document.querySelector('.report-controls').innerHTML = '<p>Error loading data. Please try again later.</p>';
    }
}

// --- Filter Population ---
function populateFilters() {
    const companies = new Set();
    const staffNames = new Set();
    const companyColIndex = headers.indexOf('COMPANY NAME');
    const staffColIndex = headers.indexOf('STAFF NAME');

    allData.forEach(row => {
        if (companyColIndex !== -1 && row[companyColIndex]) companies.add(row[companyColIndex]);
        if (staffColIndex !== -1 && row[staffColIndex]) staffNames.add(row[staffColIndex]);
    });

    // --- START: Locking Company Selection to VANCHINAD FINANCE LTD ---
    const fixedCompany = 'VANCHINAD FINANCE LTD';

    // Populate Company Select
    companySelect.innerHTML = '';
    // Add the mandatory company as the only option derived from data or just hardcode it
    if (Array.from(companies).includes(fixedCompany)) {
        const mandatoryOption = document.createElement('option');
        mandatoryOption.value = fixedCompany;
        mandatoryOption.textContent = fixedCompany;
        companySelect.appendChild(mandatoryOption);
    } else {
         // Fallback/Safety: If the company isn't in the data, add it anyway.
        const mandatoryOption = document.createElement('option');
        mandatoryOption.value = fixedCompany;
        mandatoryOption.textContent = fixedCompany;
        companySelect.appendChild(mandatoryOption);
    }

    // Set the default/mandatory value
    companySelect.value = fixedCompany;

    // Disable the filter to prevent user changes
    companySelect.disabled = true;
    // --- END: Locking Company Selection to VANCHINAD FINANCE LTD ---


    // Populate Staff Select
    allStaffNames = Array.from(staffNames).sort();
    staffSelect.innerHTML = '';
    staffSelect.innerHTML = '<option value="">Select Staff Member</option>';
    allStaffNames.forEach(name => {
        const option = document.createElement('option');
        option.value = name;
        option.textContent = name;
        staffSelect.appendChild(option);
    });
    
    // Auto-select the first staff member for initial view if required, otherwise leave blank
    // FIX: Re-enable auto-selection of the first staff member to ensure report loads immediately
    if (allStaffNames.length > 0) {
        staffSelect.value = allStaffNames[0];
    }


    // Populate Month Select
    monthSelect.innerHTML = '<option value="">All Months</option>';
    const months = new Set();
    allData.forEach(row => {
        const date = row[headers.indexOf('DATE')];
        if (date) {
            // Format: YYYY-MM
            const yearMonth = `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}`;
            months.add(yearMonth);
        }
    });

    // Sort months (chronologically) and add to select
    Array.from(months).sort().forEach(yearMonth => {
        const [year, month] = yearMonth.split('-');
        const monthName = new Date(year, month - 1, 1).toLocaleString('en-IN', { year: 'numeric', month: 'long' });
        const option = document.createElement('option');
        option.value = yearMonth;
        option.textContent = monthName;
        monthSelect.appendChild(option);
    });

    // Set default date range inputs (min/max/default value)
    startDateInput.min = formatDateToInput(dataStartDate);
    startDateInput.max = formatDateToInput(maxDataEndDate);
    endDateInput.min = formatDateToInput(dataStartDate);
    endDateInput.max = formatDateToInput(maxDataEndDate);
}

// Removed the filterStaffSelect function completely.

function handleDateRangeChange() {
    // If a date range is entered, clear the month selection
    if (startDateInput.value || endDateInput.value) {
        monthSelect.value = '';
    }
    generateReport();
}

function getFilteredData() {
    const selectedCompany = companySelect.value;
    const selectedStaff = staffSelect.value;
    const selectedMonth = monthSelect.value;
    const startDateVal = startDateInput.value;
    const endDateVal = endDateInput.value;

    // Validation for Date Range
    if (startDateVal && endDateVal) {
        if (new Date(startDateVal) > new Date(endDateVal)) {
            alert('Start date cannot be after end date. Please correct the date range.');
            // Reset dates and return to prevent invalid report generation
            startDateInput.value = '';
            endDateInput.value = '';
            monthSelect.value = '';
            return []; // Return empty data set
        }
    }

    const staffColIndex = headers.indexOf('STAFF NAME');
    const companyColIndex = headers.indexOf('COMPANY NAME');
    const dateColIndex = headers.indexOf('DATE');
    
    let filterStartDate = null;
    let filterEndDate = null;
    let isDateRangeActive = false;

    // Only consider Date Range if no month is selected AND at least one date is present.
    if (!selectedMonth && (startDateVal || endDateVal)) {
        isDateRangeActive = true;
        if (startDateVal) {
            const parts = startDateVal.split('-'); // YYYY-MM-DD
            // Set time to start of day (00:00:00)
            filterStartDate = new Date(parts[0], parts[1] - 1, parts[2], 0, 0, 0);
        }
        if (endDateVal) {
            const parts = endDateVal.split('-'); // YYYY-MM-DD
            // Set time to end of day (23:59:59)
            filterEndDate = new Date(parts[0], parts[1] - 1, parts[2], 23, 59, 59);
        }
    }
    
    return allData.filter(row => {
        let matchStaff = true;
        let matchCompany = true;
        let matchMonth = true;

        if (selectedStaff && staffColIndex !== -1) {
            matchStaff = (row[staffColIndex] === selectedStaff);
        }

        if (selectedCompany && companyColIndex !== -1) {
            matchCompany = (row[companyColIndex] === selectedCompany);
        }

        const rowDate = row[dateColIndex]; // This is already a Date object from init()

        if (selectedMonth && rowDate) {
            const yearMonth = `${rowDate.getFullYear()}-${(rowDate.getMonth() + 1).toString().padStart(2, '0')}`;
            matchMonth = (yearMonth === selectedMonth);
        } else if (isDateRangeActive && rowDate) {
            // Check if rowDate is within the custom range
            matchMonth = (!filterStartDate || rowDate >= filterStartDate) && 
                         (!filterEndDate || rowDate <= filterEndDate);
        }

        return matchStaff && matchCompany && matchMonth;
    });
}

function generateReport() {
    const selectedStaff = staffSelect.value;
    if (!selectedStaff) {
        document.querySelector('#report-container').innerHTML = '<p class="info-message">Please select a staff member to view the performance report.</p>';
        detailedEntriesContainer.classList.add('hidden');
        return;
    }

    // Show the main report container
    reportContainer.classList.remove('hidden');
    detailedEntriesContainer.classList.add('hidden');

    const data = getFilteredData();
    freshCustomerDetailsMap.clear();

    if (data.length === 0) {
        document.querySelector('#report-container').innerHTML = `<p class="info-message">No data found for staff member: ${selectedStaff} with the current filters.</p>`;
        // Reset summary and tables
        totalInflowEl.textContent = '0';
        totalOutflowEl.textContent = '0';
        totalNetGrowthEl.textContent = '0';
        freshCustomerListEl.innerHTML = '<li>No fresh customers found.</li>';
        churnRateEl.textContent = '0%';
        repeatBusinessListEl.innerHTML = '<li>No repeat business data.</li>';
        monthlyTableBody.innerHTML = '<tr><td colspan="4">No data.</td></tr>';
        companyBreakdownTableBody.innerHTML = '<tr><td colspan="4">No data.</td></tr>';
        productBreakdownTableBody.innerHTML = '<tr><td colspan="4">No data.</td></tr>';
        if (myChart) myChart.destroy();
        if (myCumulativeChart) myCumulativeChart.destroy();
        return;
    }

    let totalInflow = 0;
    let totalOutflow = 0;
    let totalNetGrowth = 0;
    const freshOldColIndex = headers.indexOf('FRESH/OLD');
    const customerNameColIndex = headers.indexOf('CUSTOMER NAME');
    const customerData = new Map(); // Stores {net, transactions} for all customers

    data.forEach(row => {
        const inflow = getValueFromRow(row, headers, 'INF Total');
        const outflow = getValueFromRow(row, headers, 'OUT Total');
        const net = getValueFromRow(row, headers, 'Net');
        const customerName = row[customerNameColIndex];

        totalInflow += inflow;
        totalOutflow += outflow;
        totalNetGrowth += net;

        if (customerName) {
            if (!customerData.has(customerName)) {
                customerData.set(customerName, { net: 0, transactions: 0 });
            }
            customerData.get(customerName).net += net;
            customerData.get(customerName).transactions++;
        }

        if (isFreshCustomer(row[freshOldColIndex]) && customerName) {
            freshCustomerDetailsMap.set(customerName, (freshCustomerDetailsMap.get(customerName) || 0) + inflow);
        }
    });

    // --- Render Overall Summary ---
    totalInflowEl.textContent = formatIndianNumber(totalInflow);
    totalOutflowEl.textContent = formatIndianNumber(totalOutflow);
    totalNetGrowthEl.textContent = formatIndianNumber(totalNetGrowth);
    totalNetGrowthEl.closest('.card').classList.toggle('positive', totalNetGrowth >= 0);
    totalNetGrowthEl.closest('.card').classList.toggle('negative', totalNetGrowth < 0);

    // --- Render Fresh Customers List ---
    freshCustomerListEl.innerHTML = '';
    const sortedFreshCustomers = Array.from(freshCustomerDetailsMap.keys()).sort();
    if (sortedFreshCustomers.length > 0) {
        sortedFreshCustomers.forEach(customerName => {
            const li = document.createElement('li');
            li.textContent = `${customerName} (₹${formatIndianNumber(freshCustomerDetailsMap.get(customerName))})`;
            freshCustomerListEl.appendChild(li);
        });
    } else {
        freshCustomerListEl.innerHTML = '<li>No fresh customers found.</li>';
    }
    
    // --- Render Repeat Business/Churn Rate ---
    const totalCustomers = customerData.size;
    const freshCustomerCount = freshCustomerDetailsMap.size;
    const repeatCustomers = Array.from(customerData.keys()).filter(name => !freshCustomerDetailsMap.has(name));
    const repeatCustomerCount = repeatCustomers.length;

    const churnRate = totalCustomers > 0 ? ((totalCustomers - repeatCustomerCount) / totalCustomers) * 100 : 0;
    churnRateEl.textContent = `${churnRate.toFixed(2)}%`;

    repeatBusinessListEl.innerHTML = '';
    if (repeatCustomers.length > 0) {
        repeatCustomers.sort().forEach(customerName => {
            const li = document.createElement('li');
            const data = customerData.get(customerName);
            const netClass = data.net >= 0 ? 'positive' : 'negative';
            li.innerHTML = `${customerName} (Net: <span class="${netClass}">₹${formatIndianNumber(data.net)}</span>, Txns: ${data.transactions})`;
            repeatBusinessListEl.appendChild(li);
        });
    } else {
        repeatBusinessListEl.innerHTML = '<li>No repeat business data.</li>';
    }


    // --- Render Breakdown Tables ---
    renderMonthlySummary(data);
    renderCompanyBreakdown(data);
    renderProductBreakdown(data);
    renderCharts(data);
}

function renderMonthlySummary(data) {
    const monthlyData = {};
    const dateColIndex = headers.indexOf('DATE');

    data.forEach(row => {
        const date = row[dateColIndex];
        if (!date) return;
        const monthKey = `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}`;

        const inflow = getValueFromRow(row, headers, 'INF Total');
        const outflow = getValueFromRow(row, headers, 'OUT Total');
        const net = getValueFromRow(row, headers, 'Net');

        if (!monthlyData[monthKey]) {
            monthlyData[monthKey] = { inflow: 0, outflow: 0, net: 0, entries: [] };
        }
        monthlyData[monthKey].inflow += inflow;
        monthlyData[monthKey].outflow += outflow;
        monthlyData[monthKey].net += net;
        monthlyData[monthKey].entries.push(row);
    });

    monthlyTableBody.innerHTML = '';
    const labels = [];
    const netData = [];
    let cumulativeNet = 0;
    const cumulativeNetData = [];

    const sortedMonths = Object.keys(monthlyData).sort();
    if (sortedMonths.length === 0) {
        monthlyTableBody.innerHTML = '<tr><td colspan="4">No monthly data.</td></tr>';
    } else {
        sortedMonths.forEach(monthKey => {
            const data = monthlyData[monthKey];
            const monthName = new Date(monthKey + '-01').toLocaleString('en-IN', { year: 'numeric', month: 'short' });
            
            const netClass = data.net >= 0 ? 'positive' : 'negative';
            const tr = monthlyTableBody.insertRow();
            tr.dataset.filterType = 'month';
            tr.dataset.filterValue = monthKey;

            tr.innerHTML = `
                <td>${monthName}</td>
                <td>${formatIndianNumber(data.inflow)}</td>
                <td>${formatIndianNumber(data.outflow)}</td>
                <td class="${netClass}">${formatIndianNumber(data.net)}</td>
            `;

            labels.push(monthName);
            netData.push(data.net);
            cumulativeNet += data.net;
            cumulativeNetData.push(cumulativeNet);
        });
    }
}

function renderCompanyBreakdown(data) {
    const companyData = {};
    const infOutHeaders = getInflowOutflowHeaders();
    data.forEach(row => {
        infOutHeaders.forEach(header => {
            const { company, type } = parseCompanyAndProductFromHeader(header);
            const value = getValueFromRow(row, headers, header);
            if (company && value !== 0) {
                if (!companyData[company]) {
                    companyData[company] = { inflow: 0, outflow: 0, net: 0, entries: [] };
                }
                if (type === 'INF') {
                    companyData[company].inflow += value;
                } else if (type === 'OUT') {
                    companyData[company].outflow += value;
                }
                companyData[company].entries.push(row);
            }
        });
    });

    companyBreakdownTableBody.innerHTML = '';
    const sortedCompanies = Object.keys(companyData).sort();
    if (sortedCompanies.length === 0) {
        companyBreakdownTableBody.innerHTML = '<tr><td colspan="4">No company breakdown data.</td></tr>';
    } else {
        sortedCompanies.forEach(companyName => {
            const data = companyData[companyName];
            data.net = data.inflow - data.outflow; // Calculate Net Growth
            const netClass = data.net >= 0 ? 'positive' : 'negative';
            const tr = companyBreakdownTableBody.insertRow();
            tr.dataset.filterType = 'company';
            tr.dataset.filterValue = companyName;

            tr.innerHTML = `
                <td>${companyName}</td>
                <td>${formatIndianNumber(data.inflow)}</td>
                <td>${formatIndianNumber(data.outflow)}</td>
                <td class="${netClass}">${formatIndianNumber(data.net)}</td>
            `;
        });
    }
}

function renderProductBreakdown(data) {
    const productData = {};
    const infOutHeaders = getInflowOutflowHeaders();
    data.forEach(row => {
        infOutHeaders.forEach(header => {
            const { company, product, type } = parseCompanyAndProductFromHeader(header);
            const value = getValueFromRow(row, headers, header);
            if (product && value !== 0) {
                const displayProduct = mapProductToDisplayName(product);
                if (!productData[displayProduct]) {
                    productData[displayProduct] = { inflow: 0, outflow: 0, net: 0, entries: [] };
                }
                if (type === 'INF') {
                    productData[displayProduct].inflow += value;
                } else if (type === 'OUT') {
                    productData[displayProduct].outflow += value;
                }
                productData[displayProduct].entries.push(row);
            }
        });
    });

    productBreakdownTableBody.innerHTML = '';
    const sortedProducts = Object.keys(productData).sort();
    if (sortedProducts.length === 0) {
        productBreakdownTableBody.innerHTML = '<tr><td colspan="4">No product breakdown data.</td></tr>';
    } else {
        sortedProducts.forEach(productName => {
            const data = productData[productName];
            data.net = data.inflow - data.outflow;
            const netClass = data.net >= 0 ? 'positive' : 'negative';
            const tr = productBreakdownTableBody.insertRow();
            tr.dataset.filterType = 'product';
            tr.dataset.filterValue = productName; // Use the display name

            tr.innerHTML = `
                <td>${productName}</td>
                <td>${formatIndianNumber(data.inflow)}</td>
                <td>${formatIndianNumber(data.outflow)}</td>
                <td class="${netClass}">${formatIndianNumber(data.net)}</td>
            `;
        });
    }
}

function renderCharts(data) {
    // Collect data for charts (identical to renderMonthlySummary's collection)
    const monthlyData = {};
    const dateColIndex = headers.indexOf('DATE');

    data.forEach(row => {
        const date = row[dateColIndex];
        if (!date) return;
        const monthKey = `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}`;

        const net = getValueFromRow(row, headers, 'Net');

        if (!monthlyData[monthKey]) {
            monthlyData[monthKey] = { net: 0 };
        }
        monthlyData[monthKey].net += net;
    });

    const labels = [];
    const netData = [];
    let cumulativeNet = 0;
    const cumulativeNetData = [];

    const sortedMonths = Object.keys(monthlyData).sort();
    sortedMonths.forEach(monthKey => {
        const monthName = new Date(monthKey + '-01').toLocaleString('en-IN', { year: 'numeric', month: 'short' });
        const net = monthlyData[monthKey].net;
        
        labels.push(monthName);
        netData.push(net);
        cumulativeNet += net;
        cumulativeNetData.push(cumulativeNet);
    });

    // Destroy existing charts if they exist
    if (myChart) myChart.destroy();
    if (myCumulativeChart) myCumulativeChart.destroy();

    // Historical Performance Trends (Bar Chart)
    myChart = new Chart(performanceChartCanvas, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'Net Growth',
                    data: netData,
                    backgroundColor: netData.map(net => net >= 0 ? '#28a745' : '#dc3545'),
                    yAxisID: 'y'
                }
            ]
        },
        options: {
            responsive: true,
            scales: {
                y: {
                    beginAtZero: true,
                    title: {
                        display: true,
                        text: 'Net Growth (in ₹)'
                    },
                    ticks: {
                        callback: function(value) {
                            return formatIndianNumber(value);
                        }
                    }
                }
            },
            plugins: {
                legend: {
                    display: false
                }
            }
        }
    });

    // Cumulative Performance Trends (Line Chart)
    myCumulativeChart = new Chart(cumulativePerformanceChartCanvas, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'Cumulative Net Growth',
                    data: cumulativeNetData,
                    borderColor: '#0056b3',
                    backgroundColor: 'rgba(0, 86, 179, 0.1)',
                    tension: 0.3, // Makes the line curved
                    fill: true
                }
            ]
        },
        options: {
            responsive: true,
            scales: {
                y: {
                    beginAtZero: false,
                    title: {
                        display: true,
                        text: 'Cumulative Net Growth (in ₹)'
                    },
                    ticks: {
                        callback: function(value) {
                            return formatIndianNumber(value);
                        }
                    }
                }
            },
            plugins: {
                legend: {
                    display: true,
                    position: 'top'
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            let label = context.dataset.label || '';
                            if (label) {
                                label += ': ';
                            }
                            if (context.parsed.y !== null) {
                                label += `₹${formatIndianNumber(context.parsed.y)}`;
                            }
                            return label;
                        }
                    }
                }
            }
        }
    });
}

function viewDetailedEntries(title, filteredEntries) {
    reportContainer.classList.add('hidden');
    detailedEntriesContainer.classList.remove('hidden');
    detailedTitleEl.textContent = title;
    detailedTableBody.innerHTML = '';
    
    if (filteredEntries.length === 0) {
        detailedTableBody.innerHTML = '<tr><td colspan="5">No detailed entries found for this filter.</td></tr>';
        return;
    }

    const dateColIndex = headers.indexOf('DATE');
    const customerNameColIndex = headers.indexOf('CUSTOMER NAME');

    filteredEntries.forEach(entry => {
        const tr = document.createElement('tr');
        const netClass = getValueFromRow(entry, headers, 'Net') >= 0 ? 'positive' : 'negative';

        const date = entry[dateColIndex].toLocaleDateString('en-IN');
        const inflow = formatIndianNumber(getValueFromRow(entry, headers, 'INF Total'));
        const outflow = formatIndianNumber(getValueFromRow(entry, headers, 'OUT Total'));
        const net = formatIndianNumber(getValueFromRow(entry, headers, 'Net'));
        const customerName = entry[customerNameColIndex] || '-';

        tr.innerHTML = `
            <td>${date}</td>
            <td>${inflow}</td>
            <td>${outflow}</td>
            <td class="${netClass}">${net}</td>
            <td class="customer-name-column hidden">${customerName}</td>
        `;
        detailedTableBody.appendChild(tr);
    });

    // Apply current visibility state for the customer name column
    toggleCustomerNameColumn();
}

function showMainReport() {
    detailedEntriesContainer.classList.add('hidden');
    reportContainer.classList.remove('hidden');
}

function toggleCustomerNameColumn() {
    const isChecked = showCustomerNameCheckbox.checked;
    
    // Toggle header visibility
    const customerNameColumnHeader = document.querySelector('#detailed-table thead th:last-child');
    customerNameColumnHeader.classList.toggle('hidden', !isChecked);

    // Toggle cell visibility
    document.querySelectorAll('.customer-name-column').forEach(cell => {
        cell.classList.toggle('hidden', !isChecked);
    });
}


function handleDrilldown(event, type) {
    const targetRow = event.target.closest('tr');
    if (!targetRow || targetRow.querySelector('th')) return; // Ignore if clicked on header or nothing

    const filterValue = targetRow.dataset.filterValue;
    const selectedStaff = staffSelect.value;
    if (!selectedStaff || !filterValue) return;

    // We need to re-filter the *original* data for the staff member and the *new* drilldown criteria.
    const allStaffData = getFilteredData().filter(row => row[headers.indexOf('STAFF NAME')] === selectedStaff);

    let drilldownEntries = [];
    let title = '';

    if (type === 'month') {
        const dateColIndex = headers.indexOf('DATE');
        title = `Entries for ${targetRow.cells[0].textContent}`;
        drilldownEntries = allStaffData.filter(row => {
            const date = row[dateColIndex];
            if (!date) return false;
            const monthKey = `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}`;
            return monthKey === filterValue;
        });
    } else if (type === 'company') {
        const companyColIndex = headers.indexOf('COMPANY NAME');
        title = `Entries for Company: ${filterValue}`;
        drilldownEntries = allStaffData.filter(row => row[companyColIndex] === filterValue);
    } else if (type === 'product') {
        // This is the most complex one, as we need to look into all INF/OUT columns
        const infOutHeaders = getInflowOutflowHeaders();
        title = `Entries for Product: ${filterValue}`;
        // Note: The original productData is not available here, relying on getting the product filter value
        // from the row's cells is safer if the data is dynamic.
        // Assuming targetRow.dataset.filterValue holds the display name (e.g., 'Fixed Deposit')
        const productNameFilter = filterValue; 

        drilldownEntries = allStaffData.filter(row => {
            // Check if this row has a non-zero value for any header related to this product
            return infOutHeaders.some(header => {
                const { product } = parseCompanyAndProductFromHeader(header);
                const displayProduct = mapProductToDisplayName(product);
                return displayProduct === productNameFilter && getValueFromRow(row, headers, header) !== 0;
            });
        });
    }

    viewDetailedEntries(title, drilldownEntries);
}

// --- Initialize the report when the page loads ---
document.addEventListener('DOMContentLoaded', init);