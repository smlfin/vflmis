// staff_report.js

// --- Configuration ---
const csvUrl = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQ1OOdGnJhw1k6U15Aybn_2JWex_qTShP6w7CXm0_auXnc8vFnvlabPZjK3lsjqkHgn6NgeKKPyu9qW/pub?gid=1720680457&single=true&output=csv';
const outstandingCsvUrl = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQ1OOdGnJhw1k6U15Aybn_2JWex_qTShP6w7CXm0_auXnc8vFnvlabPZjK3lsjqkHgn6NgeKKPyu9q97/pub?gid=2111036362&single=true&output=csv'; 
const FIXED_COMPANY = "VANCHINAD FINANCE LTD"; // *** HARDCODED COMPANY FILTER ***

// --- Global Data Storage ---
let allData = [];
let headers = [];
let allStaffNames = []; 
let allBranchNames = [];
let allProductNames = []; 
let staffOutstandingMap = new Map();
let myChart = null;
let myCumulativeChart = null;
let currentReportEndDate = null; // Used for dynamic ranking date

// --- Fixed Date Range for Data Validity (April 2025 - Current Month) ---
const dataStartDate = new Date('2025-04-01T00:00:00'); 
const currentDate = new Date(); 
const maxDataEndDate = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0, 23, 59, 59); 

// NEW: Base Date for Outstanding (End of October 2025)
const outstandingBaseDate = new Date(dataStartDate.getFullYear(), 9, 31, 23, 59, 59); 

// --- DOM Elements (ALL FILTERS RESTORED) ---
const monthSelect = document.getElementById('month-select'); 
const startDateInput = document.getElementById('start-date');
const endDateInput = document.getElementById('end-date');
const staffSearchInput = document.getElementById('staff-search-input'); 
const staffNamesDatalist = document.getElementById('staff-names-list'); 
const branchSelect = document.getElementById('branch-select'); 
const productSelect = document.getElementById('product-select'); 

const loadingMessage = document.getElementById('loading-message');
const reportControls = document.getElementById('report-controls');
const mainReportSections = document.getElementById('main-report-sections'); 
const noDataMessage = document.getElementById('no-data-message');

const staffSummaryTableBody = document.querySelector('#staff-summary-table tbody'); 
const companySummaryTableBody = document.querySelector('#company-summary-table tbody'); 
const productSummaryTableBody = document.querySelector('#product-summary-table tbody'); 
const monthlyBreakdownTableBody = document.querySelector('#monthly-breakdown-table tbody'); 

const generateReportBtn = document.getElementById('generate-report-btn'); // NEW BUTTON
const showRankingBtn = document.getElementById('show-ranking-btn'); 

// Detailed Entries Elements (for drill-down)
const detailedEntriesContainer = document.getElementById('detailed-entries-container');
const detailedTitleSpan = document.getElementById('detailed-title');
const detailedTableBody = document.querySelector('#detailed-table tbody');
const showCustomerNameCheckbox = document.getElementById('show-customer-name');
const customerNameColumnHeader = document.querySelector('#detailed-table thead .customer-name-column');
const backToReportBtn = document.getElementById('back-to-report-btn');


// --- Utility Functions (Retained and Updated) ---
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
            if (year < 100) {
                year = (year < 70) ? 2000 + year : 1900 + year;
            }
            const date = new Date(year, month - 1, day);
            if (date.getDate() === day && (date.getMonth() + 1) === month && date.getFullYear() === year) {
                return date;
            }
        }
    }
    return null;
}

function formatDateToInput(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function formatIndianNumber(num) {
    if (isNaN(num) || num === null) return '0';
    const isNegative = num < 0;
    num = Math.abs(num);

    let parts = num.toFixed(0).split('.');
    let integerPart = parts[0];
    let decimalPart = parts.length > 1 ? '.' + parts[1] : '';

    if (integerPart.length <= 3) {
        return (isNegative ? '-' : '') + integerPart + decimalPart;
    }

    let lastThree = integerPart.substring(integerPart.length - 3);
    let otherNumbers = integerPart.substring(0, integerPart.length - 3);

    otherNumbers = otherNumbers.replace(/\B(?=(\d{2})+(?!\d))/g, ',');

    return (isNegative ? '-' : '') + otherNumbers + ',' + lastThree + decimalPart;
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

/**
 * Calculates the cumulative outstanding amount for a given staff member
 * as of a specific end date, based on the October 31st base and subsequent net growth.
 * @param {string} staffName
 * @param {Date} endDate
 * @returns {number} The final calculated outstanding amount.
 */
function calculateStaffOutstanding(staffName, endDate) { // Complex Outstanding Logic
    const baseOutstanding = staffOutstandingMap.get(staffName) || 0;
    let cumulativeNetGrowthAdjustment = 0;
    const staffColIndex = headers.indexOf('STAFF NAME');
    const inflowColIndex = headers.indexOf('INF Total');
    const outflowColIndex = headers.indexOf('OUT Total');
    const dateColIndex = headers.indexOf('DATE');

    allData.forEach(row => {
        const rowStaff = row[staffColIndex];
        const rowDate = row[dateColIndex];
        
        // Calculate Net from the row data
        const inflow = parseNumericalValue(row[inflowColIndex]);
        const outflow = parseNumericalValue(row[outflowColIndex]);
        const net = inflow - outflow;

        if (rowStaff === staffName && rowDate) {
            if (endDate >= outstandingBaseDate) {
                // Forward calculation: Sum Net Growth for transactions between Nov 1st and endDate (inclusive)
                if (rowDate > outstandingBaseDate && rowDate <= endDate) {
                    cumulativeNetGrowthAdjustment += net;
                }
            } else {
                // Backward calculation: Sum Net Growth for transactions between endDate (exclusive) and Oct 31st (inclusive)
                if (rowDate > endDate && rowDate <= outstandingBaseDate) {
                    cumulativeNetGrowthAdjustment += net;
                }
            }
        }
    });

    if (endDate >= outstandingBaseDate) {
        // OS(D_end) = OS(Oct 31st) + Sum(Net Growth from Nov 1st to D_end)
        return baseOutstanding + cumulativeNetGrowthAdjustment;
    } else {
        // OS(D_end) = OS(Oct 31st) - Sum(Net Growth from D_end + 1 to Oct 31st)
        return baseOutstanding - cumulativeNetGrowthAdjustment;
    }
}


// --- Main Data Fetching and Initialization ---

async function fetchData(url) {
    try {
        const response = await fetch(url);
        const csvText = await response.text();
        const rows = csvText.trim().split('\n');

        if (rows.length === 0) {
            console.error('No data found in CSV.');
            return { headers: [], data: [] };
        }

        const headers = parseLine(rows[0]).map(header => header.trim());
        
        const data = rows.slice(1).map(row => {
            const parsedRow = parseLine(row);
            while (parsedRow.length < headers.length) {
                parsedRow.push(null);
            }
            return parsedRow;
        });
        
        return { headers, data };
    } catch (error) {
        console.error('Error fetching or parsing CSV:', error);
        return { headers: [], data: [] };
    }
}

async function init() {
    loadingMessage.style.display = 'block';
    
    // 1. Fetch Main Report Data
    const mainReport = await fetchData(csvUrl);
    headers = mainReport.headers;
    let rawData = mainReport.data;

    const dateColIndex = headers.indexOf('DATE');
    const companyColIndex = headers.indexOf('COMPANY NAME');
    const staffColIndex = headers.indexOf('STAFF NAME');
    const branchColIndex = headers.indexOf('BRANCH');
    const productColIndex = headers.indexOf('PRODUCT'); 
    const inflowColIndex = headers.indexOf('INF Total');
    const outflowColIndex = headers.indexOf('OUT Total');

    // 2. Pre-process and filter data for the fixed company and date range
    allData = rawData.map(row => {
        if (dateColIndex === -1 || !row[dateColIndex]) return null;
        
        const dateObj = parseDate(row[dateColIndex]);
        if (!dateObj || dateObj < dataStartDate || dateObj > maxDataEndDate) return null;
        
        row[dateColIndex] = dateObj; 
        
        return row;
    })
    .filter(row => row !== null)
    .filter(row => {
        // Enforce VANCHINAD FINANCE LTD filter
        return companyColIndex !== -1 && row[companyColIndex] === FIXED_COMPANY;
    });
    
    if (allData.length === 0) {
        loadingMessage.textContent = `No data found for ${FIXED_COMPANY} in the current period.`;
        return;
    }
    
    // 3. Populate unique names for filters
    const staffNames = new Set();
    const branchNames = new Set();
    const productNames = new Set(); 
    
    allData.forEach(row => {
        const staffName = staffColIndex !== -1 ? row[staffColIndex] : 'Unknown Staff';
        const branchName = branchColIndex !== -1 ? row[branchColIndex] : 'Unknown Branch';
        const productName = productColIndex !== -1 ? row[productColIndex] : 'Unknown Product'; 

        if (staffName) staffNames.add(staffName);
        if (branchName) branchNames.add(branchName);
        if (productName) productNames.add(productName); 
    });
    
    allStaffNames = Array.from(staffNames).sort(); 
    allBranchNames = Array.from(branchNames).sort();
    allProductNames = Array.from(productNames).sort(); 
    
    // 4. Fetch Outstanding Data
    await fetchOutstandingData();

    // 5. Populate Filters and set up UI
    populateFilters();
    setupEventListeners();
    
    loadingMessage.style.display = 'none';
    reportControls.style.display = 'flex'; 

    // 6. Generate initial report (will render blank tables/charts by default)
    renderEmptyReport();
}

async function fetchOutstandingData() {
    // The outstanding data structure is assumed to have Staff Name (B) and Outstanding (E)
    const outstandingReport = await fetchData(outstandingCsvUrl);
    const outstandingHeaders = outstandingReport.headers;
    const data = outstandingReport.data;
    
    const staffColIndex = outstandingHeaders.indexOf('Staff Name');
    const outstandingColIndex = outstandingHeaders.indexOf('Total Outstanding');

    if (staffColIndex === -1 || outstandingColIndex === -1) {
        console.warn("Outstanding CSV missing required columns. Outstanding feature relying only on transaction data.");
        staffOutstandingMap.clear();
        return;
    }

    staffOutstandingMap.clear();
    data.forEach(row => {
        const staffName = row[staffColIndex];
        const outstandingAmount = parseNumericalValue(row[outstandingColIndex]);
        if (staffName) {
            staffOutstandingMap.set(staffName, outstandingAmount);
        }
    });
}

function populateFilters() { 
    // Populate Month Filter
    monthSelect.innerHTML = '<option value="">All Months</option>';
    const startYear = dataStartDate.getFullYear();
    const startMonth = dataStartDate.getMonth();
    const endYear = maxDataEndDate.getFullYear();
    const endMonth = maxDataEndDate.getMonth();

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
    
    // Set Date Range limits and default
    const minDate = formatDateToInput(dataStartDate);
    const maxDate = formatDateToInput(new Date(currentDate.getFullYear(), currentDate.getMonth(), currentDate.getDate()));
    startDateInput.min = minDate;
    startDateInput.max = maxDate;
    endDateInput.min = minDate;
    endDateInput.max = maxDate;
    endDateInput.value = maxDate;
    
    // Populate Staff Datalist 
    staffNamesDatalist.innerHTML = allStaffNames.map(name => `<option value="${name}">`).join('');
    staffSearchInput.value = ''; // Ensure the search box is empty by default

    // Populate Branch, and Product Filters
    branchSelect.innerHTML = '<option value="">All Branches</option>' + allBranchNames.map(name => `<option value="${name}">${name}</option>`).join('');
    productSelect.innerHTML = '<option value="">All Products</option>' + allProductNames.map(name => `<option value="${name}">${name}</option>`).join(''); 
}

function setupEventListeners() { 
    // Report generation is triggered by the new button click
    generateReportBtn.addEventListener('click', generateReport);

    // Filter changes (date/month/branch/product) do NOT automatically trigger the report, 
    // they just prepare the filters for the next button click.
    const filterElements = [monthSelect, startDateInput, endDateInput, branchSelect, productSelect]; 
    filterElements.forEach(element => {
        element.addEventListener('change', () => {
             // Optional: Provide visual feedback that a filter has changed and requires a re-run
             generateReportBtn.classList.add('pending-update'); 
        });
    });

    // Ranking button event listener
    showRankingBtn.addEventListener('click', showOutstandingRanking);
    
    // Click handlers for drill-down (Monthly)
    monthlyBreakdownTableBody.addEventListener('click', handleMonthlyBreakdownClick);

    // Detailed View controls
    backToReportBtn.addEventListener('click', hideDetailedEntries);
    showCustomerNameCheckbox.addEventListener('change', toggleCustomerNameColumn);
}

// --- Filtering Logic (Base filter by date/month/branch/product - NOT staff) ---

function getFilteredData() { 
    const selectedMonth = monthSelect.value;
    const startDateVal = startDateInput.value;
    const endDateVal = endDateInput.value;
    const selectedBranch = branchSelect.value;
    const selectedProduct = productSelect.value; 

    const dateColIndex = headers.indexOf('DATE');
    const branchColIndex = headers.indexOf('BRANCH');
    const productColIndex = headers.indexOf('PRODUCT'); 

    let filterStartDate = startDateVal ? parseDate(startDateVal) : null;
    let filterEndDate = endDateVal ? parseDate(endDateVal) : null;
    if (filterEndDate) {
        filterEndDate.setHours(23, 59, 59, 999);
    }
    
    if (filterStartDate && filterEndDate && filterStartDate > filterEndDate) {
        return [];
    }

    // Get all data filtered by current date/month/branch/product selections
    return allData.filter(row => {
        const rowDate = row[dateColIndex]; 
        const rowBranch = branchColIndex !== -1 ? row[branchColIndex] : '';
        const rowProduct = productColIndex !== -1 ? row[productColIndex] : ''; 

        // 1. Month Filter
        if (selectedMonth) {
            const rowMonth = `${rowDate.getFullYear()}-${String(rowDate.getMonth() + 1).padStart(2, '0')}`;
            if (rowMonth !== selectedMonth) return false;
        }

        // 2. Date Range Filter
        if (filterStartDate && rowDate < filterStartDate) return false;
        if (filterEndDate && rowDate > filterEndDate) return false;
        
        // 3. Branch Filter
        if (selectedBranch && rowBranch !== selectedBranch) return false;
        
        // 4. Product Filter
        if (selectedProduct && rowProduct !== selectedProduct) return false; 
        
        return true;
    });
}

// --- Report Generation and Rendering ---

function renderEmptyReport() { 
    staffSummaryTableBody.innerHTML = '';
    companySummaryTableBody.innerHTML = ''; 
    productSummaryTableBody.innerHTML = ''; 
    monthlyBreakdownTableBody.innerHTML = '';
    
    // Hide all sections by default (Step 1)
    if(mainReportSections) mainReportSections.style.display = 'none'; 
    if(noDataMessage) noDataMessage.classList.add('hidden');
    
    // Destroy existing charts
    if (myChart) myChart.destroy();
    if (myCumulativeChart) myCumulativeChart.destroy();
    
    // Render placeholder charts
    const emptyChartData = { labels: ['Select a Staff Member and Click Generate Report'], net: [0] };
    renderHistoricalChart(emptyChartData, 'Historical Performance Trends (Filtered View)');
    renderCumulativeChart(prepareChartData(allData).cumulative, 'Company-wide Cumulative Net Growth Trend');

    currentReportEndDate = null;
    if (generateReportBtn) generateReportBtn.classList.remove('pending-update');
}

function generateReport() {
    const selectedStaffName = staffSearchInput.value.trim();
    const staffColIndex = headers.indexOf('STAFF NAME');
    const dateColIndex = headers.indexOf('DATE');
    
    // 1. Check if a valid staff is selected (Step 2: Only show results when staff is selected)
    if (!selectedStaffName || !allStaffNames.includes(selectedStaffName)) {
        alert('Please select a valid staff member from the list to generate the report.');
        renderEmptyReport();
        return;
    }
    
    // 2. Get data filtered by all controls (including date/month/branch/product)
    const baseFilteredData = getFilteredData(); 
    
    // 3. Filter the data down to only the selected staff member
    const staffOnlyData = baseFilteredData.filter(row => 
        staffColIndex !== -1 && row[staffColIndex] === selectedStaffName
    );

    // Remove pending update class on successful report generation
    if (generateReportBtn) generateReportBtn.classList.remove('pending-update');

    if (staffOnlyData.length === 0) {
        // If data is empty for this staff/filter combination, render empty state but show "No data" message
        staffSummaryTableBody.innerHTML = '';
        companySummaryTableBody.innerHTML = '';
        productSummaryTableBody.innerHTML = '';
        monthlyBreakdownTableBody.innerHTML = '';
        if (myChart) myChart.destroy();
        
        if(mainReportSections) mainReportSections.style.display = 'block'; // Keep sections visible to show the message
        if(noDataMessage) noDataMessage.classList.remove('hidden');
        currentReportEndDate = getReportEndDate(baseFilteredData); // Still calculate end date for ranking
        return;
    }
    
    // 4. Determine Report End Date ($D_{end}$) for Outstanding Calculation
    // Find the latest date from the currently filtered data
    let reportEndDate = baseFilteredData.length > 0
        ? baseFilteredData.reduce((maxDate, row) => row[dateColIndex] > maxDate ? row[dateColIndex] : maxDate, baseFilteredData[0][dateColIndex])
        : maxDataEndDate;
    // Set global date for the ranking function
    currentReportEndDate = reportEndDate;

    // 5. Display Report Sections
    if(noDataMessage) noDataMessage.classList.add('hidden');
    if(mainReportSections) mainReportSections.style.display = 'block';

    // 6. Generate all reports
    
    // Staff Summary (Outstanding depends on the new logic)
    const staffSummary = calculateStaffSummary(staffOnlyData, selectedStaffName, currentReportEndDate); 
    renderStaffSummaryTable(staffSummary);

    // Company Breakdown (uses staffOnlyData - will only show one company, the fixed one)
    const companySummary = calculateCompanySummary(staffOnlyData); 
    renderCompanySummaryTable(companySummary); 

    // Product Breakdown
    const productSummary = calculateProductSummary(staffOnlyData); 
    renderProductSummaryTable(productSummary); 

    // Monthly Breakdown
    const monthlyBreakdown = calculateMonthlyBreakdown(staffOnlyData);
    renderMonthlyBreakdownTable(monthlyBreakdown); 

    // Charts
    const historicalChartData = prepareChartData(staffOnlyData).historical;
    renderHistoricalChart(historicalChartData, `Monthly Net Performance for ${selectedStaffName}`);
    
    const cumulativeData = prepareChartData(allData).cumulative; 
    renderCumulativeChart(cumulativeData, 'Company-wide Cumulative Net Growth Trend');
}

function getReportEndDate(data) { 
    if (data.length === 0) return null;
    const dateColIndex = headers.indexOf('DATE');
    return data.reduce((maxDate, row) => {
        const rowDate = row[dateColIndex];
        return rowDate > maxDate ? rowDate : maxDate;
    }, data[0][dateColIndex]);
}


// --- Summary Calculations ---

function calculateStaffSummary(data, selectedStaffName, reportEndDate) { 
    const staffSummary = {};
    const staffColIndex = headers.indexOf('STAFF NAME');
    const branchColIndex = headers.indexOf('BRANCH');
    const inflowColIndex = headers.indexOf('INF Total');
    const outflowColIndex = headers.indexOf('OUT Total');
    
    if (data.length === 0) return {};
    
    // Use the complex, date-aware outstanding calculation
    const totalOutstanding = calculateStaffOutstanding(selectedStaffName, reportEndDate); 

    data.forEach(row => {
        const staffName = selectedStaffName;
        const branchName = branchColIndex !== -1 && row[branchColIndex] ? row[branchColIndex] : 'Unassigned Branch';
        const key = `${staffName}|${branchName}`;
        const inflow = parseNumericalValue(row[inflowColIndex]);
        const outflow = parseNumericalValue(row[outflowColIndex]);
        const net = inflow - outflow;

        if (!staffSummary[key]) {
            staffSummary[key] = { staffName, branchName, inflow: 0, outflow: 0, net: 0, outstanding: totalOutstanding };
        }
        staffSummary[key].inflow += inflow;
        staffSummary[key].outflow += outflow;
        staffSummary[key].net += net;
        // Outstanding is the same for all branches since it's aggregated by staff
        staffSummary[key].outstanding = totalOutstanding; 
    });

    return staffSummary;
}

function renderStaffSummaryTable(summary) { 
    staffSummaryTableBody.innerHTML = '';
    
    const staffKeys = Object.keys(summary).sort((a, b) => summary[b].net - summary[a].net);
    
    let totalInflow = 0;
    let totalOutflow = 0;
    let totalNet = 0;
    
    if (staffKeys.length === 0) {
        return;
    }
    
    const firstStaffData = summary[staffKeys[0]]; 
    const totalOutstanding = firstStaffData.outstanding;


    staffKeys.forEach(key => {
        const staffData = summary[key];
        
        const tr = document.createElement('tr');
        // The HTML table has 6 columns: Staff Name, Branch, Inflow, Outflow, Net, Outstanding. 
        tr.innerHTML = `
            <td>${staffData.staffName}</td>
            <td>${staffData.branchName}</td>
            <td>${formatIndianNumber(staffData.inflow)}</td>
            <td>${formatIndianNumber(staffData.outflow)}</td>
            <td class="${staffData.net >= 0 ? 'positive' : 'negative'}">${formatIndianNumber(staffData.net)}</td>
            <td class="${staffData.outstanding > 0 ? 'negative' : 'positive'}">${formatIndianNumber(staffData.outstanding)}</td>
        `;
        staffSummaryTableBody.appendChild(tr);

        totalInflow += staffData.inflow;
        totalOutflow += staffData.outflow;
        totalNet += staffData.net;
    });
    
    const totalsRow = document.createElement('tr');
    totalsRow.classList.add('totals-row');
    totalsRow.innerHTML = `
        <td>Summary</td>
        <td>-</td>
        <td>${formatIndianNumber(totalInflow)}</td>
        <td>${formatIndianNumber(totalOutflow)}</td>
        <td class="${totalNet >= 0 ? 'positive' : 'negative'}">${formatIndianNumber(totalNet)}</td>
        <td class="${totalOutstanding > 0 ? 'negative' : 'positive'}">${formatIndianNumber(totalOutstanding)}</td>
    `;
    staffSummaryTableBody.appendChild(totalsRow);
}

// Company Breakdown Calculations and Renderer
function calculateCompanySummary(data) { 
    const companySummary = {};
    const companyColIndex = headers.indexOf('COMPANY NAME');
    const inflowColIndex = headers.indexOf('INF Total');
    const outflowColIndex = headers.indexOf('OUT Total');

    data.forEach(row => {
        // Since the data is already filtered by FIXED_COMPANY, this will only show one company.
        const companyName = companyColIndex !== -1 && row[companyColIndex] ? row[companyColIndex] : 'Unknown Company';
        const inflow = parseNumericalValue(row[inflowColIndex]);
        const outflow = parseNumericalValue(row[outflowColIndex]);
        const net = inflow - outflow;

        if (!companySummary[companyName]) {
            companySummary[companyName] = { inflow: 0, outflow: 0, net: 0 };
        }
        companySummary[companyName].inflow += inflow;
        companySummary[companyName].outflow += outflow;
        companySummary[companyName].net += net;
    });

    return companySummary;
}

function renderCompanySummaryTable(summary) { 
    companySummaryTableBody.innerHTML = '';
    
    const companyNames = Object.keys(summary).sort((a, b) => summary[b].net - summary[a].net);
    
    let totalInflow = 0;
    let totalOutflow = 0;
    let totalNet = 0;

    companyNames.forEach(companyName => {
        const companyData = summary[companyName];
        
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${companyName}</td>
            <td>${formatIndianNumber(companyData.inflow)}</td>
            <td>${formatIndianNumber(companyData.outflow)}</td>
            <td class="${companyData.net >= 0 ? 'positive' : 'negative'}">${formatIndianNumber(companyData.net)}</td>
        `;
        companySummaryTableBody.appendChild(tr);

        totalInflow += companyData.inflow;
        totalOutflow += companyData.outflow;
        totalNet += companyData.net;
    });

    const totalsRow = document.createElement('tr');
    totalsRow.classList.add('totals-row');
    totalsRow.innerHTML = `
        <td>Total</td>
        <td>${formatIndianNumber(totalInflow)}</td>
        <td>${formatIndianNumber(totalOutflow)}</td>
        <td class="${totalNet >= 0 ? 'positive' : 'negative'}">${formatIndianNumber(totalNet)}</td>
    `;
    companySummaryTableBody.appendChild(totalsRow);
}

function calculateProductSummary(data) { 
    const productSummary = {};
    const productColIndex = headers.indexOf('PRODUCT'); 
    const inflowColIndex = headers.indexOf('INF Total');
    const outflowColIndex = headers.indexOf('OUT Total');

    if (productColIndex === -1) {
        console.warn("PRODUCT column not found in data headers.");
        return {}; 
    }

    data.forEach(row => {
        const productName = productColIndex !== -1 && row[productColIndex] ? row[productColIndex] : 'Unknown Product';
        const inflow = parseNumericalValue(row[inflowColIndex]);
        const outflow = parseNumericalValue(row[outflowColIndex]);
        const net = inflow - outflow;

        if (!productSummary[productName]) {
            productSummary[productName] = { inflow: 0, outflow: 0, net: 0 };
        }
        productSummary[productName].inflow += inflow;
        productSummary[productName].outflow += outflow;
        productSummary[productName].net += net;
    });

    return productSummary;
}

function renderProductSummaryTable(summary) { 
    productSummaryTableBody.innerHTML = '';
    
    const productNames = Object.keys(summary).sort((a, b) => summary[b].net - summary[a].net);
    
    let totalInflow = 0;
    let totalOutflow = 0;
    let totalNet = 0;

    productNames.forEach(productName => {
        const productData = summary[productName];
        
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${productName}</td>
            <td>${formatIndianNumber(productData.inflow)}</td>
            <td>${formatIndianNumber(productData.outflow)}</td>
            <td class="${productData.net >= 0 ? 'positive' : 'negative'}">${formatIndianNumber(productData.net)}</td>
        `;
        productSummaryTableBody.appendChild(tr);

        totalInflow += productData.inflow;
        totalOutflow += productData.outflow;
        totalNet += productData.net;
    });

    const totalsRow = document.createElement('tr');
    totalsRow.classList.add('totals-row');
    totalsRow.innerHTML = `
        <td>Total</td>
        <td>${formatIndianNumber(totalInflow)}</td>
        <td>${formatIndianNumber(totalOutflow)}</td>
        <td class="${totalNet >= 0 ? 'positive' : 'negative'}">${formatIndianNumber(totalNet)}</td>
    `;
    productSummaryTableBody.appendChild(totalsRow);
}

function calculateMonthlyBreakdown(data) { 
    const monthlySummary = {};
    const dateColIndex = headers.indexOf('DATE');
    const inflowColIndex = headers.indexOf('INF Total');
    const outflowColIndex = headers.indexOf('OUT Total');

    data.forEach(row => {
        const date = row[dateColIndex];
        const monthYearKey = date.toLocaleDateString('en-US', { year: 'numeric', month: 'long' });
        const monthSortKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        
        const inflow = parseNumericalValue(row[inflowColIndex]);
        const outflow = parseNumericalValue(row[outflowColIndex]);
        const net = inflow - outflow;

        if (!monthlySummary[monthSortKey]) {
            monthlySummary[monthSortKey] = { monthName: monthYearKey, monthSortKey: monthSortKey, inflow: 0, outflow: 0, net: 0 }; 
        }
        monthlySummary[monthSortKey].inflow += inflow;
        monthlySummary[monthSortKey].outflow += outflow;
        monthlySummary[monthSortKey].net += net;
    });

    return monthlySummary;
}

function renderMonthlyBreakdownTable(summary) { 
    monthlyBreakdownTableBody.innerHTML = '';
    
    const monthKeys = Object.keys(summary).sort(); // Sort chronologically
    
    let totalInflow = 0;
    let totalOutflow = 0;
    let totalNet = 0;

    monthKeys.forEach(key => {
        const monthlyData = summary[key];
        
        const tr = document.createElement('tr');
        // Now has 5 columns: Month, Inflow, Outflow, Net Growth, Action (Details link)
        tr.innerHTML = `
            <td>${monthlyData.monthName}</td>
            <td>${formatIndianNumber(monthlyData.inflow)}</td>
            <td>${formatIndianNumber(monthlyData.outflow)}</td>
            <td class="${monthlyData.net >= 0 ? 'positive' : 'negative'}">${formatIndianNumber(monthlyData.net)}</td>
            <td><a href="#" class="details-link clickable" data-monthkey="${monthlyData.monthSortKey}">Details</a></td>
        `;
        monthlyBreakdownTableBody.appendChild(tr);

        totalInflow += monthlyData.inflow;
        totalOutflow += monthlyData.outflow;
        totalNet += monthlyData.net;
    });

    const totalsRow = document.createElement('tr');
    totalsRow.classList.add('totals-row');
    // Ensure Totals row has 5 columns
    totalsRow.innerHTML = `
        <td>Total</td>
        <td>${formatIndianNumber(totalInflow)}</td>
        <td>${formatIndianNumber(totalOutflow)}</td>
        <td class="${totalNet >= 0 ? 'positive' : 'negative'}">${formatIndianNumber(totalNet)}</td>
        <td>-</td> 
    `;
    monthlyBreakdownTableBody.appendChild(totalsRow);
}


// --- Detailed Entries (Drill-down) Logic ---

function handleMonthlyBreakdownClick(event) { 
    // Prevent default anchor behavior
    if (event.target.classList.contains('details-link')) {
        event.preventDefault(); 
    }
    
    // Look for the new link element
    const target = event.target.closest('.details-link'); 
    
    if (target) {
        const monthKey = target.dataset.monthkey; // Format YYYY-MM
        // Get the month name from the first cell of the parent row
        const monthName = target.closest('tr').querySelector('td:first-child').textContent;
        
        if (monthKey) {
            const selectedStaffName = staffSearchInput.value.trim();
            const staffColIndex = headers.indexOf('STAFF NAME');
            
            showDetailedEntries('Month', `${monthName} for ${selectedStaffName}`, row => {
                const dateColIndex = headers.indexOf('DATE');
                const rowDate = row[dateColIndex];
                const rowMonthKey = `${rowDate.getFullYear()}-${String(rowDate.getMonth() + 1).padStart(2, '0')}`;
                
                // Ensure the drill-down data is also filtered by the currently selected staff member
                const rowStaff = staffColIndex !== -1 ? row[staffColIndex] : '';
                
                return rowMonthKey === monthKey && rowStaff === selectedStaffName;
            });
        }
    }
}


function showDetailedEntries(filterType, filterValue, customFilterFn) { 
    // Start with the data filtered by the main control panel (Date Range, Month, Branch, Product)
    const baseFilteredData = getFilteredData();
    
    // Apply the specific drill-down filter
    const detailedData = baseFilteredData.filter(customFilterFn);

    const customerColIndex = headers.indexOf('CUSTOMER NAME');
    const inflowColIndex = headers.indexOf('INF Total');
    const outflowColIndex = headers.indexOf('OUT Total');
    const dateColIndex = headers.indexOf('DATE');
    
    detailedTitleSpan.textContent = `${filterValue} (${filterType})`;
    detailedTableBody.innerHTML = '';
    
    detailedData.forEach(row => {
        const tr = document.createElement('tr');
        const inflow = parseNumericalValue(row[inflowColIndex]);
        const outflow = parseNumericalValue(row[outflowColIndex]);
        const net = inflow - outflow;
        const customerName = customerColIndex !== -1 ? row[customerColIndex] : '';
        const netClass = net >= 0 ? 'positive' : 'negative';

        tr.innerHTML = `
            <td>${row[dateColIndex].toLocaleDateString('en-IN')}</td>
            <td>${formatIndianNumber(inflow)}</td>
            <td>${formatIndianNumber(outflow)}</td>
            <td class="${netClass}">${formatIndianNumber(net)}</td>
            <td class="customer-name-column hidden">${customerName}</td>
        `;
        detailedTableBody.appendChild(tr);
    });
    
    document.body.classList.add('modal-open');
    if(detailedEntriesContainer) detailedEntriesContainer.classList.remove('hidden');
    if(mainReportSections) mainReportSections.style.display = 'none'; // Hide main sections
    if(reportControls) reportControls.style.display = 'none'; // Hide controls
}

function hideDetailedEntries() { 
    document.body.classList.remove('modal-open');
    if(detailedEntriesContainer) detailedEntriesContainer.classList.add('hidden');
    if(mainReportSections) mainReportSections.style.display = 'block'; // Show main sections again
    if(reportControls) reportControls.style.display = 'flex'; // Show controls again
    // Reset checkbox and column visibility
    showCustomerNameCheckbox.checked = false;
    toggleCustomerNameColumn(); 
}

function toggleCustomerNameColumn() { 
    const isChecked = showCustomerNameCheckbox.checked;
    const customerColumns = document.querySelectorAll('.customer-name-column');
    customerColumns.forEach(col => {
        if (isChecked) {
            col.classList.remove('hidden');
        } else {
            col.classList.add('hidden');
        }
    });
    // Toggle header visibility too
    if (customerNameColumnHeader) {
        if (isChecked) {
            customerNameColumnHeader.classList.remove('hidden');
        } else {
            customerNameColumnHeader.classList.add('hidden');
        }
    }
}


// --- Chart Logic ---

function prepareChartData(data) { 
    const dateColIndex = headers.indexOf('DATE');
    const inflowColIndex = headers.indexOf('INF Total');
    const outflowColIndex = headers.indexOf('OUT Total');

    const historical = {}; 
    const cumulative = {};

    // Calculate monthly data for historical (filtered) chart
    data.forEach(row => {
        const date = row[dateColIndex];
        const yearMonth = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        const inflow = parseNumericalValue(row[inflowColIndex]);
        const outflow = parseNumericalValue(row[outflowColIndex]);
        const net = inflow - outflow;
        
        if (!historical[yearMonth]) {
            historical[yearMonth] = { inflow: 0, outflow: 0, net: 0 };
        }
        historical[yearMonth].inflow += inflow;
        historical[yearMonth].outflow += outflow;
        historical[yearMonth].net += net;
    });

    // Calculate monthly data for cumulative (company-wide) chart using allData
    allData.forEach(row => {
        const date = row[dateColIndex];
        const yearMonth = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        const inflow = parseNumericalValue(row[inflowColIndex]);
        const outflow = parseNumericalValue(row[outflowColIndex]);
        const net = inflow - outflow;
        
        if (!cumulative[yearMonth]) {
            cumulative[yearMonth] = { inflow: 0, outflow: 0, net: 0 };
        }
        cumulative[yearMonth].inflow += inflow;
        cumulative[yearMonth].outflow += outflow;
        cumulative[yearMonth].net += net;
    });
    
    // Sort and structure historical data
    const sortedHistoricalKeys = Object.keys(historical).sort();
    const historicalChartData = {
        labels: sortedHistoricalKeys.map(key => new Date(key).toLocaleString('en-US', { year: 'numeric', month: 'short' })),
        net: sortedHistoricalKeys.map(key => historical[key].net)
    };
    
    // Sort and structure cumulative data
    const sortedCumulativeKeys = Object.keys(cumulative).sort();
    const cumulativeChartData = {
        labels: sortedCumulativeKeys.map(key => new Date(key).toLocaleString('en-US', { year: 'numeric', month: 'short' })),
        net: sortedCumulativeKeys.map(key => cumulative[key].net)
    };

    return { historical: historicalChartData, cumulative: cumulativeChartData };
}

function renderHistoricalChart(data, titleText) { 
    const ctx = document.getElementById('performance-chart').getContext('2d');
    
    if (myChart) {
        myChart.destroy();
    }
    
    const labels = data.labels.length > 0 ? data.labels : ['No Data'];
    const netData = data.net.length > 0 ? data.net : [0];
    
    myChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'Net Growth',
                    data: netData,
                    backgroundColor: netData.map(n => n >= 0 ? 'rgba(5, 150, 105, 0.8)' : 'rgba(220, 38, 38, 0.8)'),
                    yAxisID: 'y'
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: { duration: 0 },
            hover: { animationDuration: 0 },
            plugins: {
                legend: { position: 'top' },
                title: { display: true, text: titleText }
            },
            scales: {
                y: {
                    type: 'linear',
                    display: true,
                    position: 'left',
                    title: { display: true, text: 'Amount (₹)' },
                    ticks: {
                        callback: function(value) { return formatIndianNumber(value); }
                    }
                },
                x: {
                    title: { display: true, text: 'Month' }
                }
            }
        }
    });
}

function renderCumulativeChart(data, titleText) { 
    const ctx = document.getElementById('cumulative-performance-chart').getContext('2d');
    
    if (myCumulativeChart) {
        myCumulativeChart.destroy();
    }
    
    const labels = data.labels.length > 0 ? data.labels : ['No Data'];
    const netData = data.net.length > 0 ? data.net : [0];

    let cumulativeNet = [];
    let currentCumulative = 0;
    netData.forEach(net => {
        currentCumulative += net;
        cumulativeNet.push(currentCumulative);
    });

    myCumulativeChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'Cumulative Net Growth (Company-wide)',
                data: cumulativeNet,
                borderColor: 'rgba(0, 128, 128, 1)',
                backgroundColor: 'rgba(0, 128, 128, 0.1)',
                fill: true,
                tension: 0.3
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: { duration: 0 },
            hover: { animationDuration: 0 },
            plugins: {
                legend: { position: 'top' },
                title: { display: true, text: titleText }
            },
            scales: {
                y: {
                    beginAtZero: false,
                    title: { display: true, text: 'Cumulative Amount (₹)' },
                    ticks: {
                        callback: function(value) { return formatIndianNumber(value); }
                    }
                },
                x: {
                    title: { display: true, text: 'Month' }
                }
            }
        }
    });
}

// --- Ranking Function (Complex Ranking Logic) ---

function showOutstandingRanking() { 
    
    let reportDate = currentReportEndDate;

    if (!reportDate) {
        // Fallback to max available date if no report has been generated yet
        if (allStaffNames.length === 0) {
            alert('Data not yet loaded. Please wait and try again.');
            return;
        }
        // Default to the latest available date for ranking when no staff or date filter is set
        reportDate = maxDataEndDate;
    }

    const rankingData = allStaffNames.map(staffName => {
        // Use the complex, date-aware calculation
        const outstanding = calculateStaffOutstanding(staffName, reportDate);
        return { staffName, outstanding };
    });

    // Rank: Highest Outstanding first (most liability at the top)
    const rankedStaff = rankingData
        .filter(staff => staff.outstanding !== 0) // Only show staff with non-zero outstanding
        .sort((a, b) => b.outstanding - a.outstanding);

    if (rankedStaff.length === 0) {
        alert("No staff members currently have a non-zero outstanding balance.");
        return;
    }
    
    const endDateString = reportDate.toLocaleDateString('en-IN', { year: 'numeric', month: 'long', day: 'numeric' });

    let tableRows = '';
    rankedStaff.forEach((staff, index) => {
        const rank = index + 1;
        // Outstanding: positive is liability (red), zero/negative is favourable (green)
        const netClass = staff.outstanding > 0 ? 'negative' : (staff.outstanding < 0 ? 'positive' : ''); 
        
        tableRows += `
            <tr>
                <td>${rank}</td>
                <td>${staff.staffName}</td>
                <td class="${netClass}">${formatIndianNumber(staff.outstanding)}</td>
            </tr>
        `;
    });

    const htmlContent = `
        <!DOCTYPE html>
        <html>
        <head>
            <title>Staff Outstanding Ranking - ${endDateString}</title>
            <style>
                :root {
                    --teal-primary: #008080; 
                    --olive-accent: #808000;
                    --negative-color: #dc2626;
                    --positive-color: #059669;
                }
                body { 
                    font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; 
                    padding: 20px; 
                    background-color: #f7f9fb;
                }
                h1 { 
                    color: var(--teal-primary); 
                    border-bottom: 2px solid var(--olive-accent);
                    padding-bottom: 10px;
                    text-align: center;
                }
                h2 { 
                    color: #555; 
                    font-size: 1.1em; 
                    margin-top: 10px; 
                    text-align: center;
                }
                .ranking-table { 
                    width: 90%;
                    max-width: 800px; 
                    margin: 20px auto; 
                    border-collapse: collapse; 
                    box-shadow: 0 4px 10px rgba(0,0,0,0.1); 
                    border-radius: 8px;
                    overflow: hidden;
                    background-color: white;
                }
                .ranking-table th, .ranking-table td { 
                    padding: 12px 15px; 
                    text-align: left;
                    border: 1px solid #e5e7eb;
                }
                .ranking-table th { 
                    background-color: var(--teal-primary); 
                    color: white; 
                    text-transform: uppercase; 
                    font-size: 0.9em;
                }
                .ranking-table tr:nth-child(even) { background-color: #f0fafa; }
                .ranking-table tr:hover { background-color: #e0fafa; }
                .positive { color: var(--positive-color); font-weight: bold; }
                .negative { color: var(--negative-color); font-weight: bold; }
                td:nth-child(3) { text-align: right; font-weight: 700;}
                td:nth-child(1) { text-align: center; font-weight: bold; }
            </style>
        </head>
        <body>
            <h1>Staff Outstanding Ranking</h1>
            <h2>As of: ${endDateString}</h2>
            <table class="ranking-table">
                <thead>
                    <tr>
                        <th>Rank</th>
                        <th>Staff Name</th>
                        <th>Outstanding Amount (₹)</th>
                    </tr>
                </thead>
                <tbody>
                    ${tableRows}
                </tbody>
            </table>
        </body>
        </html>
    `;

    const newWindow = window.open('', '_blank');
    newWindow.document.write(htmlContent);
    newWindow.document.close();
}


// --- Initialize the report when the page loads ---
document.addEventListener('DOMContentLoaded', init);