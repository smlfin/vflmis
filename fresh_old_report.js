// fresh_old_report.js

// --- Configuration ---
const csvUrl = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQ1OOdGnJhw1k6U15Aybn_2JWex_qTShP6w7CXm0_auXnc8vFnvlabPZjK3lsjqkHgn6NgeKKPyu9qW/pub?gid=1720680457&single=true&output=csv';
const FRESH_STAFF_NET_THRESHOLD = 25000;

// --- Global Data Storage ---
let allData = [];
let headers = [];
let freshStaffParticipationMap = new Map();
let freshCustomersByStaff = new Map();
let freshCustomerDetailsMap = new Map();

// --- Fixed Date Range for Data Validity (April 2025 - March 2026) ---
const dataStartDate = new Date('2025-04-01T00:00:00');
const dataEndDate = new Date('2026-03-31T23:59:59');

// --- DOM Elements (UPDATED FOR DATE RANGE) ---
const fromMonthSelect = document.getElementById('from-month-select');
const toMonthSelect = document.getElementById('to-month-select');
const companySelect = document.getElementById('company-select');
const branchSelect = document.getElementById('branch-select');
const viewEntriesBtn = document.getElementById('view-entries-btn');

const freshInflowEl = document.getElementById('fresh-inflow');
const oldInflowEl = document.getElementById('old-inflow');
const freshNetEl = document.getElementById('fresh-net');
const oldNetEl = document.getElementById('old-net');
const totalFreshCustomersEl = document.getElementById('total-fresh-customers');
const totalOldCustomersEl = document.getElementById('total-old-customers');
const totalFreshStaffParticipationEl = document.getElementById('total-fresh-staff-participation');

const monthlyInflowTableBody = document.querySelector('#monthly-inflow-table tbody');
const monthlyNetTableBody = document.querySelector('#monthly-net-table tbody');
const monthlyFreshCustomerCountTableBody = document.querySelector('#monthly-fresh-customer-count-table tbody');
const monthlyFreshStaffCustomerCountTableBody = document.querySelector('#monthly-fresh-staff-customer-count-table tbody');

const companyFreshOldTableBody = document.querySelector('#company-fresh-old-table tbody');

const detailedEntriesContainer = document.getElementById('detailed-entries-container');
const detailedTableHead = document.querySelector('#detailed-table thead tr');
const detailedTableBody = document.querySelector('#detailed-table tbody');

// --- NEW/UPDATED DOM Elements for Modals ---
const staffPerformanceModal = document.getElementById('staff-performance-modal');
const staffFreshCustomerTableBody = document.querySelector('#staff-fresh-customer-table tbody');
const closeStaffModalButton = document.getElementById('close-staff-modal');

const freshCustomerModal = document.getElementById('fresh-customer-modal');
const freshCustomerStaffTableBody = document.querySelector('#fresh-customer-staff-table tbody');
const closeFreshCustomerModalButton = document.getElementById('close-fresh-customer-modal');


const customerDetailsModal = document.getElementById('customer-details-modal');
const customerDetailsStaffNameEl = document.getElementById('customer-details-staff-name');
const customerDetailsTableBody = document.querySelector('#customer-details-table tbody');
const closeCustomerModalButton = document.getElementById('close-customer-modal');


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

function formatIndianNumber(num) {
    if (isNaN(num) || num === null) {
        return num;
    }
    let parts = Math.round(num).toString().split('.');
    let integerPart = parts[0];
    let decimalPart = parts.length > 1 ? '.' + parts[1] : '';
    let sign = '';
    if (integerPart.startsWith('-')) {
        sign = '-';
        integerPart = integerPart.substring(1);
    }
    if (integerPart.length <= 3) {
        return sign + integerPart + decimalPart;
    }
    let lastThree = integerPart.substring(integerPart.length - 3);
    let otherNumbers = integerPart.substring(0, integerPart.length - 3);
    otherNumbers = otherNumbers.replace(/\B(?=(\d{2})+(?!\d))/g, ',');
    return sign + otherNumbers + ',' + lastThree + decimalPart;
}

function getValueFromRow(row, headers, columnName) {
    const colIndex = headers.indexOf(columnName);
    if (colIndex !== -1 && row[colIndex] !== undefined && row[colIndex] !== null) {
        const parsedValue = parseFloat(String(row[colIndex]).replace(/,/g, '') || 0);
        return isNaN(parsedValue) ? 0 : Math.round(parsedValue);
    }
    return 0;
}

// Helper function to determine if a customer is "fresh"
function isFreshCustomer(customerType) {
    const freshTypes = ['FRESH CUSTOMER', 'FRESH CUSTOMER/STAFF', 'FRESH STAFF'];
    return freshTypes.includes(customerType.trim().toUpperCase());
}

// --- Main Data Fetching and Initialization ---
async function init() {
    try {
        const response = await fetch(csvUrl);
        const csvText = await response.text();
        const rows = csvText.trim().split('\n');

        if (rows.length === 0) {
            console.error('No data found in CSV.');
            return;
        }

        headers = parseLine(rows[0]);
        const dateColIndex = headers.indexOf('DATE');

        allData = rows.slice(1).map(row => {
            const parsedRow = parseLine(row);
            if (dateColIndex !== -1 && parsedRow[dateColIndex]) {
                const dateObj = parseDate(parsedRow[dateColIndex]);
                if (dateObj && dateObj >= dataStartDate && dateObj <= dataEndDate) {
                    parsedRow[dateColIndex] = dateObj;
                    return parsedRow;
                }
            }
            return null;
        }).filter(row => row !== null);

        populateFilters();
        generateReport();
    } catch (error) {
        console.error('Error initializing report:', error);
        document.querySelector('.report-controls').innerHTML = '<p>Error loading data. Please try again later.</p>';
    }
}

// --- Filter Population (UPDATED FOR DATE RANGE) ---
function populateFilters() {
    const companies = new Set();
    const branches = new Set();

    const companyColIndex = headers.indexOf('COMPANY NAME');
    const branchColIndex = headers.indexOf('BRANCH');

    allData.forEach(row => {
        if (companyColIndex !== -1) companies.add(row[companyColIndex]);
        if (branchColIndex !== -1) branches.add(row[branchColIndex]);
    });

    // NEW Logic for From/To Month Select
    fromMonthSelect.innerHTML = '';
    toMonthSelect.innerHTML = '';
    const monthOptions = [];

    // Loop through the data range (April 2025 - March 2026)
    let currentDateIterator = new Date(dataStartDate);
    const today = new Date();

    while (currentDateIterator <= today && currentDateIterator <= dataEndDate) {
        const year = currentDateIterator.getFullYear();
        const month = (currentDateIterator.getMonth() + 1).toString().padStart(2, '0');
        const optionValue = `${year}-${month}`;
        const optionText = currentDateIterator.toLocaleString('en-IN', {
            year: 'numeric',
            month: 'long'
        });
        
        monthOptions.push({ value: optionValue, text: optionText });
        
        // Move to the next month
        currentDateIterator.setMonth(currentDateIterator.getMonth() + 1);
    }
    
    // Populate both select elements
    monthOptions.forEach((optionData, index) => {
        const fromOption = document.createElement('option');
        fromOption.value = optionData.value;
        fromOption.textContent = optionData.text;
        fromMonthSelect.appendChild(fromOption);
        
        const toOption = document.createElement('option');
        toOption.value = optionData.value;
        toOption.textContent = optionData.text;
        toMonthSelect.appendChild(toOption);

        // Set default selection: From = first month, To = last month available
        if (index === 0) {
            fromMonthSelect.value = optionData.value;
        }
        if (index === monthOptions.length - 1) {
            toMonthSelect.value = optionData.value;
        }
    });

    // Existing logic for Company and Branch remains the same
    companySelect.innerHTML = '<option value="">All Companies</option>';
    Array.from(companies).sort().forEach(company => {
        const option = document.createElement('option');
        option.value = company;
        option.textContent = company;
        companySelect.appendChild(option);
    });

    branchSelect.innerHTML = '<option value="">All Branches</option>';
    Array.from(branches).sort().forEach(branch => {
        const option = document.createElement('option');
        option.value = branch;
        option.textContent = branch;
        branchSelect.appendChild(option);
    });
}

// --- Filter Data based on selections (UPDATED FOR DATE RANGE) ---
function getFilteredData(ignoreMonthFilter = false) {
    const selectedFromMonth = fromMonthSelect.value;
    const selectedToMonth = toMonthSelect.value;
    const selectedCompany = companySelect.value;
    const selectedBranch = branchSelect.value;

    const dateColIndex = headers.indexOf('DATE');
    const companyColIndex = headers.indexOf('COMPANY NAME');
    const branchColIndex = headers.indexOf('BRANCH');

    // Convert 'YYYY-MM' strings to Date objects for comparison.
    // Use the 1st day of the 'From' month and the last moment of the 'To' month.
    let filterStartDate = null;
    let filterEndDate = null;

    if (selectedFromMonth) {
        // 'YYYY-MM-01' at 00:00:00
        filterStartDate = new Date(selectedFromMonth + '-01T00:00:00');
    }
    if (selectedToMonth) {
        // Get the first day of the *next* month, then subtract 1 millisecond (to get the last moment of the selected month).
        const [year, month] = selectedToMonth.split('-').map(Number);
        const nextMonth = new Date(year, month, 1);
        filterEndDate = new Date(nextMonth.getTime() - 1);
    }

    return allData.filter(row => {
        let matchMonth = true;
        let matchCompany = true;
        let matchBranch = true;

        const rowDate = row[dateColIndex]; // This is already a Date object from init()

        if (!ignoreMonthFilter && rowDate) {
            // Check if rowDate is >= filterStartDate AND <= filterEndDate
            matchMonth = (!filterStartDate || rowDate >= filterStartDate) && 
                         (!filterEndDate || rowDate <= filterEndDate);
        }

        if (selectedCompany && companyColIndex !== -1) {
            matchCompany = (row[companyColIndex] === selectedCompany);
        }
        if (selectedBranch && branchColIndex !== -1) {
            matchBranch = (row[branchColIndex] === selectedBranch);
        }

        return matchMonth && matchCompany && matchBranch;
    });
}

// --- Report Generation ---
function generateReport() {
    const filteredDataForOverallAndCompany = getFilteredData(false);
    const filteredDataForMonthlyTrends = getFilteredData(true); // Always use all months for monthly trends, regardless of filter

    freshCustomerDetailsMap = new Map();
    freshStaffParticipationMap = new Map();
    freshCustomersByStaff = new Map();

    detailedEntriesContainer.style.display = 'none';
    staffPerformanceModal.style.display = 'none';
    customerDetailsModal.style.display = 'none';
    freshCustomerModal.style.display = 'none';

    const freshOldColIndex = headers.indexOf('FRESH/OLD');
    const customerNameColIndex = headers.indexOf('CUSTOMER NAME');
    const companyNameColIndex = headers.indexOf('COMPANY NAME');
    const staffNameColIndex = headers.indexOf('STAFF NAME');
    const infTotalColIndex = headers.indexOf('INF Total');
    const netColIndex = headers.indexOf('Net');

    if (freshOldColIndex === -1 || customerNameColIndex === -1 || companyNameColIndex === -1 || staffNameColIndex === -1 || infTotalColIndex === -1 || netColIndex === -1) {
        console.error('One or more required columns are missing from the CSV: FRESH/OLD, CUSTOMER NAME, COMPANY NAME, STAFF NAME, INF Total, Net.');
        document.getElementById('overall-contribution-section').innerHTML = '<p>Error: Missing critical data columns. Please ensure "FRESH/OLD", "CUSTOMER NAME", "COMPANY NAME", "STAFF NAME", "INF Total", and "Net" columns exist in the data source.</p>';
        document.getElementById('monthly-trends-section').innerHTML = '';
        document.getElementById('company-contribution-section').innerHTML = '';
        return;
    }

    // --- 1. Overall Contribution & New Fresh Staff Participation Logic ---
    let freshInflow = 0;
    let oldInflow = 0;
    let freshNet = 0;
    let oldNet = 0;
    const freshCustomers = new Set();
    const oldCustomers = new Set();

    filteredDataForOverallAndCompany.forEach(row => {
        const rawCustomerType = String(row[freshOldColIndex]);
        const customerName = row[customerNameColIndex];
        const staffName = row[staffNameColIndex];
        const companyName = row[companyNameColIndex];

        const currentInflow = getValueFromRow(row, headers, 'INF Total');
        const currentNet = getValueFromRow(row, headers, 'Net');

        if (isFreshCustomer(rawCustomerType)) {
            freshInflow += currentInflow;
            freshNet += currentNet;
            if (customerName) freshCustomers.add(customerName);

            if (staffName) {
                if (!freshCustomerDetailsMap.has(staffName)) {
                    freshCustomerDetailsMap.set(staffName, []);
                }
                freshCustomerDetailsMap.get(staffName).push({
                    customerName: customerName,
                    inflow: currentInflow
                });
            }

            if (staffName && customerName) {
                if (!freshCustomersByStaff.has(staffName)) {
                    freshCustomersByStaff.set(staffName, {
                        customers: new Set(),
                        totalNet: 0
                    });
                }
                freshCustomersByStaff.get(staffName).customers.add(customerName);
                freshCustomersByStaff.get(staffName).totalNet += currentNet;
            }

            if ((rawCustomerType.trim().toUpperCase() === 'FRESH CUSTOMER/STAFF' || rawCustomerType.trim().toUpperCase() === 'FRESH STAFF') && currentNet >= FRESH_STAFF_NET_THRESHOLD) {
                if (staffName) {
                    if (!freshStaffParticipationMap.has(staffName)) {
                        freshStaffParticipationMap.set(staffName, []);
                    }
                    freshStaffParticipationMap.get(staffName).push({
                        companyName: companyName,
                        customerName: customerName,
                        net: currentNet
                    });
                }
            }
        } else {
            oldInflow += currentInflow;
            oldNet += currentNet;
            if (customerName) oldCustomers.add(customerName);
        }
    });

    freshInflowEl.textContent = formatIndianNumber(freshInflow);
    oldInflowEl.textContent = formatIndianNumber(oldInflow);
    freshNetEl.textContent = formatIndianNumber(freshNet);
    oldNetEl.textContent = formatIndianNumber(oldNet);
    totalFreshCustomersEl.textContent = freshCustomers.size;
    totalOldCustomersEl.textContent = oldCustomers.size;
    totalFreshStaffParticipationEl.textContent = freshStaffParticipationMap.size;

    // --- Populate the NEW Staff Participation Drilldown Table ---
    staffFreshCustomerTableBody.innerHTML = '';
    const qualifiedStaffEntries = [];
    freshStaffParticipationMap.forEach((details, staffName) => {
        details.forEach(entry => {
            qualifiedStaffEntries.push({
                staffName: staffName,
                companyName: entry.companyName,
                customerName: entry.customerName,
                net: entry.net
            });
        });
    });

    if (qualifiedStaffEntries.length === 0) {
        staffFreshCustomerTableBody.innerHTML = '<tr><td colspan="4">No fresh staff participation found that meets the criteria (> ₹25,000 Net).</td></tr>';
    } else {
        qualifiedStaffEntries.sort((a, b) => b.net - a.net);
        qualifiedStaffEntries.forEach(entry => {
            const row = staffFreshCustomerTableBody.insertRow();
            row.insertCell().textContent = entry.staffName;
            row.insertCell().textContent = entry.companyName;
            row.insertCell().textContent = entry.customerName;
            row.insertCell().textContent = formatIndianNumber(entry.net);
        });
    }

    // --- 2. Monthly Trends ---
    const monthlyData = {};

    filteredDataForMonthlyTrends.forEach(row => {
        const date = row[headers.indexOf('DATE')];
        if (!date) return;
        const yearMonth = `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}`;
        const rawCustomerType = String(row[freshOldColIndex]);
        const customerName = row[customerNameColIndex];

        const currentInflow = getValueFromRow(row, headers, 'INF Total');
        const currentNet = getValueFromRow(row, headers, 'Net');

        if (!monthlyData[yearMonth]) {
            monthlyData[yearMonth] = {
                Fresh: {
                    inflow: 0,
                    net: 0,
                    customers: new Set(),
                    staffCustomers: new Set()
                },
                Old: {
                    inflow: 0,
                    net: 0
                }
            };
        }
        if (isFreshCustomer(rawCustomerType)) {
            monthlyData[yearMonth].Fresh.inflow += currentInflow;
            monthlyData[yearMonth].Fresh.net += currentNet;
            if (customerName) monthlyData[yearMonth].Fresh.customers.add(customerName);
            if (rawCustomerType.trim().toUpperCase() === 'FRESH CUSTOMER/STAFF' || rawCustomerType.trim().toUpperCase() === 'FRESH STAFF') {
                if (customerName) monthlyData[yearMonth].Fresh.staffCustomers.add(customerName);
            }
        } else {
            monthlyData[yearMonth].Old.inflow += currentInflow;
            monthlyData[yearMonth].Old.net += currentNet;
        }
    });

    monthlyInflowTableBody.innerHTML = '';
    monthlyNetTableBody.innerHTML = '';
    monthlyFreshCustomerCountTableBody.innerHTML = '';
    monthlyFreshStaffCustomerCountTableBody.innerHTML = '';

    const sortedMonths = Object.keys(monthlyData).sort();
    if (sortedMonths.length === 0) {
        monthlyInflowTableBody.innerHTML = '<tr><td colspan="4">No monthly inflow data.</td></tr>';
        monthlyNetTableBody.innerHTML = '<tr><td colspan="4">No monthly net data.</td></tr>';
        monthlyFreshCustomerCountTableBody.innerHTML = '<tr><td colspan="2">No monthly fresh customer count data.</td></tr>';
        monthlyFreshStaffCustomerCountTableBody.innerHTML = '<tr><td colspan="2">No monthly fresh staff customer count data.</td></tr>';
    } else {
        sortedMonths.forEach(monthKey => {
            const data = monthlyData[monthKey];
            const monthName = new Date(monthKey + '-01').toLocaleString('en-IN', {
                year: 'numeric',
                month: 'long'
            });

            let inflowRow = monthlyInflowTableBody.insertRow();
            inflowRow.insertCell().textContent = monthName;
            inflowRow.insertCell().textContent = formatIndianNumber(data.Fresh.inflow);
            inflowRow.insertCell().textContent = formatIndianNumber(data.Old.inflow);
            inflowRow.insertCell().textContent = formatIndianNumber(data.Fresh.inflow + data.Old.inflow);

            let netRow = monthlyNetTableBody.insertRow();
            netRow.insertCell().textContent = monthName;
            netRow.insertCell().textContent = formatIndianNumber(data.Fresh.net);
            netRow.insertCell().textContent = formatIndianNumber(data.Old.net);
            netRow.insertCell().textContent = formatIndianNumber(data.Fresh.net + data.Old.net);

            let freshCustCountRow = monthlyFreshCustomerCountTableBody.insertRow();
            freshCustCountRow.insertCell().textContent = monthName;
            freshCustCountRow.insertCell().textContent = data.Fresh.customers.size;

            let freshStaffCustCountRow = monthlyFreshStaffCustomerCountTableBody.insertRow();
            freshStaffCustCountRow.insertCell().textContent = monthName;
            freshStaffCustCountRow.insertCell().textContent = data.Fresh.staffCustomers.size;
        });
    }

    // --- 3. Company-wise Contribution by Customer Type ---
    const companyData = {};
    filteredDataForOverallAndCompany.forEach(row => {
        const companyName = row[companyNameColIndex];
        if (!companyName) return;

        const rawCustomerType = String(row[freshOldColIndex]);
        const currentInflow = getValueFromRow(row, headers, 'INF Total');
        const currentNet = getValueFromRow(row, headers, 'Net');

        if (isFreshCustomer(rawCustomerType)) {
            if (!companyData[companyName]) {
                companyData[companyName] = { Fresh: { inflow: 0, net: 0 }, Old: { inflow: 0, net: 0 } };
            }
            companyData[companyName].Fresh.inflow += currentInflow;
            companyData[companyName].Fresh.net += currentNet;
        } else {
            if (!companyData[companyName]) {
                companyData[companyName] = { Fresh: { inflow: 0, net: 0 }, Old: { inflow: 0, net: 0 } };
            }
            companyData[companyName].Old.inflow += currentInflow;
            companyData[companyName].Old.net += currentNet;
        }
    });

    companyFreshOldTableBody.innerHTML = '';
    const sortedCompanies = Object.keys(companyData).sort();
    if (sortedCompanies.length === 0) {
        companyFreshOldTableBody.innerHTML = '<tr><td colspan="7">No company data available for these filters.</td></tr>';
    } else {
        sortedCompanies.forEach(companyName => {
            const data = companyData[companyName];
            const row = companyFreshOldTableBody.insertRow();
            row.insertCell().textContent = companyName;
            row.insertCell().textContent = formatIndianNumber(data.Fresh.inflow);
            row.insertCell().textContent = formatIndianNumber(data.Fresh.net);
            row.insertCell().textContent = formatIndianNumber(data.Old.inflow);
            row.insertCell().textContent = formatIndianNumber(data.Old.net);
            row.insertCell().textContent = formatIndianNumber(data.Fresh.inflow + data.Old.inflow);
            row.insertCell().textContent = formatIndianNumber(data.Fresh.net + data.Old.net);
        });
    }
}

// --- Detailed Entries View ---
function viewDetailedEntries() {
    const filteredData = getFilteredData(false);
    detailedEntriesContainer.style.display = 'block';
    staffPerformanceModal.style.display = 'none';
    customerDetailsModal.style.display = 'none';
    freshCustomerModal.style.display = 'none';

    detailedTableHead.innerHTML = '';
    headers.forEach(header => {
        const th = document.createElement('th');
        th.textContent = header;
        detailedTableHead.appendChild(th);
    });

    detailedTableBody.innerHTML = '';
    if (filteredData.length === 0) {
        detailedTableBody.innerHTML = '<tr><td colspan="' + headers.length + '">No entries found for the selected filters.</td></tr>';
        return;
    }

    filteredData.forEach(rowData => {
        const tr = detailedTableBody.insertRow();
        rowData.forEach((cellData, index) => {
            const td = tr.insertCell();
            let content = cellData;

            if (headers[index] === 'DATE' && cellData instanceof Date) {
                content = cellData.toLocaleDateString('en-IN');
            } else {
                const numericalHeaders = [
                    'INF Total', 'OUT Total', 'Net'
                ];
                if (numericalHeaders.includes(headers[index].trim())) {
                    const numValue = parseFloat(String(content).replace(/,/g, ''));
                    if (!isNaN(numValue)) {
                        content = formatIndianNumber(numValue);
                    }
                }
            }
            td.textContent = content;
        });
    });
}

// --- First-level drilldown: Fresh Customers by Staff ---
function showFreshCustomersByStaffDrilldown() {
    detailedEntriesContainer.style.display = 'none';
    staffPerformanceModal.style.display = 'none';
    customerDetailsModal.style.display = 'none';
    freshCustomerModal.style.display = 'flex';

    freshCustomerStaffTableBody.innerHTML = '';

    if (freshCustomersByStaff.size === 0) {
        freshCustomerStaffTableBody.innerHTML = '<tr><td colspan="3">No fresh customer data available.</td></tr>';
        return;
    }

    const sortedStaff = Array.from(freshCustomersByStaff.entries()).sort((a, b) => b[1].customers.size - a[1].customers.size);

    sortedStaff.forEach(([staffName, data]) => {
        const row = freshCustomerStaffTableBody.insertRow();
        row.insertCell().textContent = staffName;

        const freshCustomerCountCell = row.insertCell();
        freshCustomerCountCell.textContent = data.customers.size;
        freshCustomerCountCell.classList.add('clickable-total');
        freshCustomerCountCell.addEventListener('click', () => showCustomerDetailsDrilldown(staffName));

        row.insertCell().textContent = formatIndianNumber(data.totalNet);
    });
}

function closeFreshCustomerModal() {
    freshCustomerModal.style.display = 'none';
}


// --- Drilldown Function for Staff Performance (UPDATED) ---
function showStaffPerformanceDrilldown() {
    detailedEntriesContainer.style.display = 'none';
    customerDetailsModal.style.display = 'none';
    freshCustomerModal.style.display = 'none';

    staffPerformanceModal.style.display = 'flex';
}

function closeStaffPerformanceModal() {
    staffPerformanceModal.style.display = 'none';
}

// --- Second-level drilldown: Customer Details for a Staff Member ---
function showCustomerDetailsDrilldown(staffName) {
    staffPerformanceModal.style.display = 'none';
    detailedEntriesContainer.style.display = 'none';
    freshCustomerModal.style.display = 'none';

    customerDetailsStaffNameEl.textContent = `Customer Details for Staff: ${staffName}`;
    customerDetailsTableBody.innerHTML = '';

    const staffData = freshCustomerDetailsMap.get(staffName);

    if (!staffData || staffData.length === 0) {
        customerDetailsTableBody.innerHTML = '<tr><td colspan="2">No fresh customer details found for this staff member.</td></tr>';
    } else {
        const customerInflowMap = new Map();
        staffData.forEach(entry => {
            const currentInflow = customerInflowMap.get(entry.customerName) || 0;
            customerInflowMap.set(entry.customerName, currentInflow + entry.inflow);
        });

        const sortedCustomers = Array.from(customerInflowMap.entries()).sort((a, b) => a[0].localeCompare(b[0]));

        sortedCustomers.forEach(([customerName, totalInflow]) => {
            const row = customerDetailsTableBody.insertRow();
            row.insertCell().textContent = customerName;
            row.insertCell().textContent = formatIndianNumber(totalInflow);
        });
    }

    customerDetailsModal.style.display = 'flex';
}

function closeCustomerDetailsModal() {
    customerDetailsModal.style.display = 'none';
}

// --- Event Listeners (UPDATED FOR DATE RANGE) ---
fromMonthSelect.addEventListener('change', generateReport);
toMonthSelect.addEventListener('change', generateReport);
companySelect.addEventListener('change', generateReport);
branchSelect.addEventListener('change', generateReport);
viewEntriesBtn.addEventListener('click', viewDetailedEntries);

totalFreshCustomersEl.addEventListener('click', showFreshCustomersByStaffDrilldown);
totalFreshStaffParticipationEl.addEventListener('click', showStaffPerformanceDrilldown);

closeStaffModalButton.addEventListener('click', closeStaffPerformanceModal);
closeFreshCustomerModalButton.addEventListener('click', closeFreshCustomerModal);
closeCustomerModalButton.addEventListener('click', closeCustomerDetailsModal);

window.addEventListener('click', (event) => {
    if (event.target === staffPerformanceModal) {
        closeStaffPerformanceModal();
    }
    if (event.target === freshCustomerModal) {
        closeFreshCustomerModal();
    }
    if (event.target === customerDetailsModal) {
        closeCustomerDetailsModal();
    }
});

// --- Initialize the report when the page loads ---
document.addEventListener('DOMContentLoaded', init);
