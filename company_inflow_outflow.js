// company_inflow_outflow.js

// --- Configuration ---
const csvUrl = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQ1OOdGnJhw1k6U15Aybn_2JWex_qTShP6w7CXm0_auXnc8vFnvlabPZjK3lsjqkHgn6NgeKKPyu9qW/pub?gid=1720680457&single=true&output=csv';
const FIXED_COMPANY = "VANCHINAD FINANCE LTD"; // *** HARDCODED COMPANY FILTER ***

// --- Global Data Storage ---
let allData = []; // Stores all parsed CSV rows
let headers = []; // Stores CSV headers
// let allCompanyNames = []; // REMOVED

// --- Fixed Date Range for Data Validity (April 2025 to Current Month) ---
const dataStartDate = new Date('2025-04-01T00:00:00'); // April 1, 2025, 00:00:00 local time
const currentDate = new Date(); // Current date and time
const dataEndDate = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0, 23, 59, 59); // End of the current month

// --- DOM Elements ---
const monthSelect = document.getElementById('month-select');
// const companySearchInput = document.getElementById('company-search'); // REMOVED
// const companySelect = document.getElementById('company-select'); // REMOVED
const fixedCompanyNameP = document.getElementById('fixed-company-name');

const summaryCompanyTd = document.getElementById('summary-company');
const summaryInflowTd = document.getElementById('summary-inflow');
const summaryOutflowTd = document.getElementById('summary-outflow');
const summaryNetTd = document.getElementById('summary-net');
const noSummaryDataMessage = document.getElementById('no-summary-data-message');

const monthlyTableBody = document.querySelector('#monthly-table tbody');
const noMonthlyDataMessage = document.getElementById('no-monthly-data-message');


// --- Utility Functions ---

// Function to parse a single CSV line, handling quoted fields and escaped quotes
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

// Robust Date Parsing Function
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

// Function to format numbers in Indian style (xx,xx,xxx)
function formatIndianNumber(num) {
    if (isNaN(num) || num === null) {
        return num;
    }
    let parts = num.toString().split('.');
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

// Helper function to parse a numerical value from a string, handling empty/null and commas
function parseNumericalValue(valueString) {
    if (valueString === null || valueString === undefined || valueString === '') {
        return 0;
    }
    const cleanedValue = String(valueString).replace(/,/g, '');
    const parsedValue = parseFloat(cleanedValue);
    return isNaN(parsedValue) ? 0 : parsedValue;
}

// --- Main Data Fetching and Initialization ---
async function init() {
    try {
        const response = await fetch(csvUrl);
        const csvText = await response.text();
        const rows = csvText.trim().split('\n');

        if (rows.length === 0) {
            console.error('No data found in CSV.');
            document.querySelector('.report-container').innerHTML = '<p>Error loading data. No data found.</p>';
            return;
        }

        headers = parseLine(rows[0]).map(header => header.trim());
        const dateColIndex = headers.indexOf('DATE');

        allData = rows.slice(1).map(row => {
            const parsedRow = parseLine(row);
            while (parsedRow.length < headers.length) {
                parsedRow.push(null);
            }
            if (dateColIndex === -1 || !parsedRow[dateColIndex]) return null;
            const dateObj = parseDate(parsedRow[dateColIndex]);
            if (!dateObj || dateObj < dataStartDate || dateObj > dataEndDate) return null;
            parsedRow[dateColIndex] = dateObj;
            return parsedRow;
        }).filter(row => row !== null);

        // Set the fixed company name in the HTML
        fixedCompanyNameP.textContent = FIXED_COMPANY;

        populateMonthFilter();
        generateReport();
    } catch (error) {
        console.error('Error initializing report:', error);
        document.querySelector('.report-container').innerHTML = '<p>Error loading data. Please try again later.</p>';
    }
}

// --- Filter Population ---
function populateMonthFilter() {
    monthSelect.innerHTML = '<option value="">All Months (Overall Summary)</option>';
    const startYear = dataStartDate.getFullYear();
    const startMonth = dataStartDate.getMonth();
    const endYear = dataEndDate.getFullYear();
    const endMonth = dataEndDate.getMonth();

    for (let year = startYear; year <= endYear; year++) {
        const currentMonth = (year === startYear) ? startMonth : 0;
        const lastMonth = (year === endYear) ? endMonth : 11;
        for (let month = currentMonth; month <= lastMonth; month++) {
            const date = new Date(year, month, 1);
            const monthName = date.toLocaleString('en-US', { year: 'numeric', month: 'long' });
            const optionValue = `${year}-${String(month + 1).padStart(2, '0')}`;
            const option = document.createElement('option');
            option.value = optionValue;
            option.textContent = monthName;
            monthSelect.appendChild(option);
        }
    }
}

// --- Filter Data ---
function getFilteredData() {
    const selectedMonth = monthSelect.value;
    const companyColIndex = headers.indexOf('COMPANY NAME');
    const dateColIndex = headers.indexOf('DATE');

    return allData.filter(row => {
        const rowCompany = row[companyColIndex];
        const rowDate = row[dateColIndex];

        // 1. Filter by company (Hardcoded)
        if (companyColIndex === -1 || rowCompany !== FIXED_COMPANY) {
            return false;
        }

        // 2. Filter by month, if selected
        if (selectedMonth) {
            const rowMonth = `${rowDate.getFullYear()}-${String(rowDate.getMonth() + 1).padStart(2, '0')}`;
            return rowMonth === selectedMonth;
        }

        // If no month is selected, all company data within the date range passes.
        return true;
    });
}

// --- Generate Report ---
function generateReport() {
    const filteredData = getFilteredData();
    const infTotalColIndex = headers.indexOf('INF Total');
    const outTotalColIndex = headers.indexOf('OUT Total');

    // 1. Check for data validity
    if (filteredData.length === 0 || infTotalColIndex === -1 || outTotalColIndex === -1) {
        // Show no data message for summary and monthly
        document.querySelector('.summary-section').style.display = 'none';
        document.getElementById('monthly-breakup-section').style.display = 'none';
        noSummaryDataMessage.style.display = 'block';
        noMonthlyDataMessage.style.display = 'none'; // Only show one error message

        // Hide the table bodies
        summaryCompanyTd.textContent = '';
        monthlyTableBody.innerHTML = '';
        return;
    } else {
        document.querySelector('.summary-section').style.display = 'block';
        document.getElementById('monthly-breakup-section').style.display = 'block';
        noSummaryDataMessage.style.display = 'none';
    }

    // 2. Calculate Overall Summary (Always calculated over all data, but displayed if 'All Months' selected or specific month)
    const overallSummary = filteredData.reduce((acc, row) => {
        acc.inflow += parseNumericalValue(row[infTotalColIndex]);
        acc.outflow += parseNumericalValue(row[outTotalColIndex]);
        return acc;
    }, { inflow: 0, outflow: 0 });

    const netGrowth = overallSummary.inflow - overallSummary.outflow;

    // Render Overall Summary
    summaryCompanyTd.textContent = FIXED_COMPANY;
    summaryInflowTd.textContent = formatIndianNumber(overallSummary.inflow);
    summaryOutflowTd.textContent = formatIndianNumber(overallSummary.outflow);
    summaryNetTd.textContent = formatIndianNumber(netGrowth);

    // Apply color class to Net Growth
    summaryNetTd.classList.remove('positive', 'negative');
    if (netGrowth > 0) {
        summaryNetTd.classList.add('positive');
    } else if (netGrowth < 0) {
        summaryNetTd.classList.add('negative');
    }

    // 3. Calculate Monthly Breakup
    const selectedMonth = monthSelect.value;
    const monthlyData = {};

    if (!selectedMonth) {
        // Only calculate monthly breakdown if "All Months" is selected (empty string)
        filteredData.forEach(row => {
            const rowDate = row[headers.indexOf('DATE')];
            const monthKey = `${rowDate.getFullYear()}-${String(rowDate.getMonth() + 1).padStart(2, '0')}`;
            const monthName = rowDate.toLocaleString('en-US', { year: 'numeric', month: 'long' });

            if (!monthlyData[monthKey]) {
                monthlyData[monthKey] = {
                    name: monthName,
                    inflow: 0,
                    outflow: 0
                };
            }
            monthlyData[monthKey].inflow += parseNumericalValue(row[infTotalColIndex]);
            monthlyData[monthKey].outflow += parseNumericalValue(row[outTotalColIndex]);
        });
    }


    // Render Monthly Breakup
    renderMonthlyBreakup(Object.values(monthlyData));
}

function renderMonthlyBreakup(monthlyList) {
    monthlyTableBody.innerHTML = '';

    if (monthlyList.length === 0) {
        // If a specific month is selected, this table remains empty/hidden, so we don't show an error here.
        // It's part of the design that this table is only filled for "All Months".
        noMonthlyDataMessage.style.display = 'none';
        return;
    }

    // Sort by month (oldest to newest)
    const sortedList = monthlyList.sort((a, b) => {
        // Extract YYYY-MM from month name (e.g., 'May 2025' -> '2025-05')
        const [monthNameA, yearA] = a.name.split(' ');
        const [monthNameB, yearB] = b.name.split(' ');
        const monthIndexA = new Date(Date.parse(monthNameA + " 1, " + yearA)).getMonth() + 1;
        const monthIndexB = new Date(Date.parse(monthNameB + " 1, " + yearB)).getMonth() + 1;

        const dateA = new Date(yearA, monthIndexA - 1);
        const dateB = new Date(yearB, monthIndexB - 1);

        return dateA - dateB;
    });

    let totalInflow = 0;
    let totalOutflow = 0;

    sortedList.forEach(month => {
        const netGrowth = month.inflow - month.outflow;
        totalInflow += month.inflow;
        totalOutflow += month.outflow;

        const tr = monthlyTableBody.insertRow();
        const netClass = netGrowth > 0 ? 'positive' : (netGrowth < 0 ? 'negative' : '');

        tr.innerHTML = `
            <td>${month.name}</td>
            <td>${formatIndianNumber(month.inflow)}</td>
            <td>${formatIndianNumber(month.outflow)}</td>
            <td class="${netClass}">${formatIndianNumber(netGrowth)}</td>
        `;
    });

    // Add a Totals Row
    const totalNet = totalInflow - totalOutflow;
    const totalNetClass = totalNet > 0 ? 'positive' : (totalNet < 0 ? 'negative' : '');
    const totalsRow = monthlyTableBody.insertRow();
    totalsRow.classList.add('totals-row');
    totalsRow.innerHTML = `
        <td>Total</td>
        <td>${formatIndianNumber(totalInflow)}</td>
        <td>${formatIndianNumber(totalOutflow)}</td>
        <td class="${totalNetClass}">${formatIndianNumber(totalNet)}</td>
    `;
}


// --- Event Listeners ---
monthSelect.addEventListener('change', generateReport);

// --- Initialize the report when the page loads ---
document.addEventListener('DOMContentLoaded', init);