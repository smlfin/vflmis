// branch_report.js - MODIFIED FOR VANCHINAD FINANCE LTD (FIXES IMPLEMENTED)

// --- Configuration ---
const csvUrl = 'https://docs.google.com/spreadsheets/d/1jYlHO8x40Ygbn05DL3tMZ5wHuoZgPjk2fbtEGoDXzko/export?format=csv&gid=1720680457';
const FIXED_COMPANY = "VANCHINAD FINANCE LTD"; // *** HARDCODED COMPANY FILTER ***

// --- Global Data Storage ---
let allData = []; 
let headers = []; 
let isModalOpen = false; 

// --- Fixed Date Range for Data Validity (April 2025 - Current Month) ---
const dataStartDate = new Date('2025-04-01T00:00:00'); 
const currentDate = new Date(); 
const dataEndDate = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0, 23, 59, 59); 

// --- DOM Elements ---
const monthSelect = document.getElementById('month-select');
const startDateInput = document.getElementById('start-date');
const endDateInput = document.getElementById('end-date');

const detailedEntriesContainer = document.getElementById('detailed-entries-container');
const detailedTableHead = document.querySelector('#detailed-table thead tr');
const detailedTableBody = document.querySelector('#detailed-table tbody');
const noDetailedDataMessage = document.getElementById('no-detailed-data-message');
const branchPerformanceSummarySection = document.getElementById('branch-performance-summary-section');
const branchPerformanceTableBody = document.querySelector('#branch-performance-table tbody');
const noSummaryDataMessage = document.getElementById('no-summary-data-message');

const employeeDetailsModal = document.getElementById('employee-details-modal');
const closeEmployeeModalBtn = document.getElementById('close-employee-modal');
const employeeModalTitle = document.getElementById('employee-modal-title');
const employeeDetailsTableBody = document.querySelector('#employee-details-table tbody');
const employeeDetailsTableHead = document.querySelector('#employee-details-table thead tr');
const noEmployeeDataMessage = document.getElementById('no-employee-data-message');


// --- Utility Functions (Parsing, Formatting, etc.) ---

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

function formatDateToInput(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

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
        const companyColIndex = headers.indexOf('COMPANY NAME');

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

        // *** KEY MODIFICATION: Filter data for the fixed company immediately ***
        allData = allData.filter(row => {
            return companyColIndex !== -1 && row[companyColIndex] === FIXED_COMPANY;
        });

        // Ensure report section is visible once data is ready
        const loadingMessage = document.getElementById('loading-message');
        if (loadingMessage) loadingMessage.style.display = 'none'; 
        branchPerformanceSummarySection.style.display = 'block';
        
        // *** FIX 2: Ensure Detailed Entries are hidden on load ***
        detailedEntriesContainer.style.display = 'none';

        populateFilters();
        
        // Add event listeners for month and date changes
        monthSelect.addEventListener('change', () => {
            startDateInput.value = '';
            endDateInput.value = '';
            generateReport();
        });
        
        startDateInput.addEventListener('change', () => {
            if (startDateInput.value || endDateInput.value) {
                monthSelect.value = '';
            }
            generateReport();
        });
        
        endDateInput.addEventListener('change', () => {
            if (startDateInput.value || endDateInput.value) {
                monthSelect.value = '';
            }
            generateReport();
        });

        branchPerformanceTableBody.addEventListener('click', (event) => {
            const target = event.target.closest('td.branch-name-cell');
            if (target) {
                const branchName = target.dataset.branch;
                const month = target.dataset.month;
                if (branchName) {
                    // renderDetailedEntries(branchName, month); // This renders the second table, but let's just open the modal
                    showEmployeeDetailsModal(branchName, month);
                }
            }
        });
        
        closeEmployeeModalBtn.addEventListener('click', () => {
            employeeDetailsModal.style.display = 'none';
            isModalOpen = false;
            // FIX 1: Remove the class to re-enable background scrolling
            document.body.classList.remove('modal-open');
        });

        window.addEventListener('click', (event) => {
            if (event.target === employeeDetailsModal) {
                employeeDetailsModal.style.display = 'none';
                isModalOpen = false;
                // FIX 1: Remove the class to re-enable background scrolling
                document.body.classList.remove('modal-open');
            }
        });

        generateReport();

    } catch (error) {
        console.error('Error initializing report:', error);
        document.querySelector('.report-container').innerHTML = '<p>Error loading data. Please try again later.</p>';
    }
}

// --- Filter Population (Only handles Month/Date now) ---
function populateFilters() {
    
    monthSelect.innerHTML = '<option value="">All Months</option>';
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
    
    const minDate = formatDateToInput(dataStartDate);
    const maxDate = formatDateToInput(new Date(currentDate.getFullYear(), currentDate.getMonth(), currentDate.getDate()));
    
    startDateInput.min = minDate;
    startDateInput.max = maxDate;
    endDateInput.min = minDate;
    endDateInput.max = maxDate;
    
    endDateInput.value = maxDate;
}

// --- Get Filtered Data (Company filter is gone) ---
function getFilteredData() {
    const selectedMonth = monthSelect.value;
    const startDateVal = startDateInput.value;
    const endDateVal = endDateInput.value;

    const dateColIndex = headers.indexOf('DATE');
    
    let filterStartDate = null;
    if (startDateVal) {
        const parts = startDateVal.split('-'); 
        filterStartDate = new Date(parts[0], parts[1] - 1, parts[2], 0, 0, 0);
    }

    let filterEndDate = null;
    if (endDateVal) {
        const parts = endDateVal.split('-'); 
        filterEndDate = new Date(parts[0], parts[1] - 1, parts[2], 23, 59, 59);
    }
    
    if (filterStartDate && filterEndDate && filterStartDate > filterEndDate) {
        alert('Start date cannot be after end date.');
        return [];
    }

    return allData.filter(row => {
        const rowDate = row[dateColIndex]; 

        if (selectedMonth) {
            const rowMonth = `${rowDate.getFullYear()}-${String(rowDate.getMonth() + 1).padStart(2, '0')}`;
            return rowMonth === selectedMonth;
        }

        if (filterStartDate || filterEndDate) {
            let inRange = true;
            
            if (filterStartDate && rowDate < filterStartDate) {
                inRange = false;
            }
            
            if (filterEndDate && rowDate > filterEndDate) {
                inRange = false;
            }
            
            return inRange;
        }
        
        return true;
    });
}

// --- Generate Report (Includes Fix 2: Hide Detailed Entries) ---
function generateReport() {
    const selectedMonth = monthSelect.value;
    const startDateVal = startDateInput.value;
    const endDateVal = endDateInput.value;

    let periodDisplay = selectedMonth ? selectedMonth : 'All Months';
    if (startDateVal || endDateVal) {
        const start = startDateVal ? startDateVal : formatDateToInput(dataStartDate);
        const end = endDateVal ? endDateVal : formatDateToInput(dataEndDate);
        periodDisplay = `${start} to ${end}`;
    }

    branchPerformanceSummarySection.style.display = 'block';

    const filteredData = getFilteredData();
    const branchColIndex = headers.indexOf('BRANCH');
    const inflowColIndex = headers.indexOf('INF Total');
    const outflowColIndex = headers.indexOf('OUT Total');

    const branchPerformance = {};
    filteredData.forEach(row => {
        const branchName = branchColIndex !== -1 && row[branchColIndex] ? row[branchColIndex] : 'Unassigned Branch';
        const inflow = parseNumericalValue(row[inflowColIndex]);
        const outflow = parseNumericalValue(row[outflowColIndex]);

        if (!branchPerformance[branchName]) {
            branchPerformance[branchName] = { inflow: 0, outflow: 0, net: 0 };
        }
        branchPerformance[branchName].inflow += inflow;
        branchPerformance[branchName].outflow += outflow;
        branchPerformance[branchName].net += (inflow - outflow);
    });

    renderBranchPerformanceTable(branchPerformance, periodDisplay);
    
    // *** FIX 2: Hide Detailed Entries section when generating the main report ***
    detailedEntriesContainer.style.display = 'none';
    noDetailedDataMessage.style.display = 'none';
}


function renderBranchPerformanceTable(data, periodDisplay) {
    branchPerformanceTableBody.innerHTML = '';
    
    if (Object.keys(data).length === 0) {
        noSummaryDataMessage.style.display = 'block';
        return;
    } else {
        noSummaryDataMessage.style.display = 'none';
    }
    
    let totalInflow = 0;
    let totalOutflow = 0;
    let totalNet = 0;

    // *** FIX 3: Arrange branches by Net Growth descending order ***
    const branchNames = Object.keys(data).sort((a, b) => data[b].net - data[a].net);
    
    branchNames.forEach(branchName => {
        const branchData = data[branchName];
        const tr = document.createElement('tr');
        const originalMonthValue = monthSelect.value || ''; 
        
        tr.innerHTML = `
            <td>${periodDisplay}</td>
            <td class="branch-name-cell" data-month="${originalMonthValue}" data-branch="${branchName}">${branchName}</td>
            <td>${formatIndianNumber(branchData.inflow)}</td>
            <td>${formatIndianNumber(branchData.outflow)}</td>
            <td class="${branchData.net >= 0 ? 'positive' : 'negative'}">${formatIndianNumber(branchData.net)}</td>
        `;
        branchPerformanceTableBody.appendChild(tr);

        totalInflow += branchData.inflow;
        totalOutflow += branchData.outflow;
        totalNet += branchData.net;
    });

    const totalsRow = document.createElement('tr');
    totalsRow.classList.add('totals-row');
    totalsRow.innerHTML = `
        <td></td>
        <td>Total</td>
        <td>${formatIndianNumber(totalInflow)}</td>
        <td>${formatIndianNumber(totalOutflow)}</td>
        <td class="${totalNet >= 0 ? 'positive' : 'negative'}">${formatIndianNumber(totalNet)}</td>
    `;
    branchPerformanceTableBody.appendChild(totalsRow);
}

// Function to render the optional Detailed Entries table (currently not used by click)
function renderDetailedEntries(branchName, month) {
    // This function is still present if you decide to use this table later, 
    // but the main branch click now opens the Employee Modal.
    const detailedData = getFilteredData().filter(row => {
        const branchColIndex = headers.indexOf('BRANCH');
        const rowBranchName = branchColIndex !== -1 && row[branchColIndex] ? row[branchColIndex] : 'Unassigned Branch';
        return rowBranchName === branchName;
    });

    detailedEntriesContainer.style.display = 'block';

    if (detailedData.length === 0) {
        noDetailedDataMessage.style.display = 'block';
        detailedTableHead.parentElement.style.display = 'none';
        detailedTableBody.innerHTML = '';
        return;
    } else {
        noDetailedDataMessage.style.display = 'none';
        detailedTableHead.parentElement.style.display = 'table-header-group';
    }

    const statusColIndex = headers.indexOf('STATUS');

    const liveStaff = detailedData.filter(row => row[statusColIndex] !== 'Resigned');
    const resignedStaff = detailedData.filter(row => row[statusColIndex] === 'Resigned');

    detailedTableBody.innerHTML = '';
    
    const relevantHeaders = ['DATE', 'COMPANY NAME', 'BRANCH', 'STAFF NAME', 'INF Total', 'OUT Total', 'STATUS'];
    const headerIndices = relevantHeaders.map(header => headers.indexOf(header));
    
    detailedTableHead.innerHTML = relevantHeaders.map(header => `<th>${header}</th>`).join('');

    liveStaff.forEach(row => {
        const tr = document.createElement('tr');
        const cells = headerIndices.map(index => {
            const value = row[index];
            const cellValue = (headers[index] === 'DATE' && value instanceof Date) ? value.toLocaleDateString() : value;
            return `<td>${cellValue !== null ? cellValue : ''}</td>`;
        }).join('');
        tr.innerHTML = cells;
        detailedTableBody.appendChild(tr);
    });

    if (resignedStaff.length > 0) {
        const resignedHeadingRow = document.createElement('tr');
        resignedHeadingRow.innerHTML = `<td colspan="${relevantHeaders.length}"><h3 class="resigned-heading">Resigned</h3></td>`;
        detailedTableBody.appendChild(resignedHeadingRow);

        resignedStaff.forEach(row => {
            const tr = document.createElement('tr');
            tr.classList.add('resigned-staff');
            const cells = headerIndices.map(index => {
                const value = row[index];
                const cellValue = (headers[index] === 'DATE' && value instanceof Date) ? value.toLocaleDateString() : value;
                return `<td>${cellValue !== null ? cellValue : ''}</td>`;
            }).join('');
            tr.innerHTML = cells;
            detailedTableBody.appendChild(tr);
        });
    }
}

// Function to show the Employee Details modal (used by click)
function showEmployeeDetailsModal(branchName, selectedMonth) {
    // FIX 1: Add the class to prevent background scrolling
    document.body.classList.add('modal-open');
    employeeDetailsModal.style.display = 'flex';
    isModalOpen = true;

    const branchFilteredData = getFilteredData().filter(row => {
        const branchColIndex = headers.indexOf('BRANCH');
        const rowBranchName = branchColIndex !== -1 && row[branchColIndex] ? row[branchColIndex] : 'Unassigned Branch';
        return rowBranchName === branchName;
    });

    const employeeColIndex = headers.indexOf('STAFF NAME');
    const inflowColIndex = headers.indexOf('INF Total');
    const outflowColIndex = headers.indexOf('OUT Total');
    const dateColIndex = headers.indexOf('DATE');

    const selectedMonthVal = monthSelect.value;
    const startDateVal = startDateInput.value;
    const endDateVal = endDateInput.value;
    
    let modalPeriodTitle = 'All Available Period';
    if (selectedMonthVal) {
        const [year, month] = selectedMonthVal.split('-');
        modalPeriodTitle = new Date(year, month - 1, 1).toLocaleString('en-US', { year: 'numeric', month: 'long' });
    } else if (startDateVal || endDateVal) {
        const start = startDateVal ? startDateVal : 'Start of Data';
        const end = endDateVal ? endDateVal : 'End of Data';
        modalPeriodTitle = `${start} to ${end}`;
    }

    if (branchFilteredData.length === 0 || employeeColIndex === -1 || inflowColIndex === -1 || outflowColIndex === -1) {
        noEmployeeDataMessage.style.display = 'block';
        employeeDetailsTableBody.innerHTML = '';
        employeeModalTitle.textContent = `Employees in ${branchName} - No Data`;
        return;
    } else {
        noEmployeeDataMessage.style.display = 'none';
        employeeModalTitle.textContent = `Employees in ${branchName} (${modalPeriodTitle})`;
    }

    const employeeData = {};
    const uniqueMonths = new Set();
    
    branchFilteredData.forEach(row => {
        const employeeName = row[employeeColIndex];
        const monthKey = row[dateColIndex].toLocaleString('en-US', { year: 'numeric', month: 'short' });
        uniqueMonths.add(monthKey);
        
        const inflow = parseNumericalValue(row[inflowColIndex]);
        const outflow = parseNumericalValue(row[outflowColIndex]);
        const net = inflow - outflow;

        if (!employeeData[employeeName]) {
            employeeData[employeeName] = { totalNet: 0, months: {} };
        }

        if (!employeeData[employeeName].months[monthKey]) {
            employeeData[employeeName].months[monthKey] = { net: 0 };
        }
        
        employeeData[employeeName].months[monthKey].net += net;
        employeeData[employeeName].totalNet += net;
    });

    const sortedMonths = Array.from(uniqueMonths).sort((a, b) => new Date(a) - new Date(b));

    let headerContent = '<th>Employee Name</th>';
    sortedMonths.forEach(month => {
        headerContent += `<th>${month} Net</th>`;
    });
    headerContent += '<th>Total Net</th>';
    employeeDetailsTableHead.innerHTML = headerContent;

    employeeDetailsTableBody.innerHTML = '';
    const employeeNames = Object.keys(employeeData).sort((a, b) => employeeData[b].totalNet - employeeData[a].totalNet); // Sort employees by net

    employeeNames.forEach(name => {
        const employeeInfo = employeeData[name];
        const tr = document.createElement('tr');
        
        let rowContent = `<td>${name}</td>`;
        
        sortedMonths.forEach(month => {
            const monthInfo = employeeInfo.months[month];
            const netValue = monthInfo ? formatIndianNumber(monthInfo.net) : '-'; // Show '-' if no data for month
            const netClass = monthInfo && monthInfo.net >= 0 ? 'positive' : 'negative';
            rowContent += `<td class="${netClass}">${netValue}</td>`;
        });

        const totalNetClass = employeeInfo.totalNet >= 0 ? 'positive' : 'negative';
        rowContent += `<td class="${totalNetClass}"><strong>${formatIndianNumber(employeeInfo.totalNet)}</strong></td>`;
        
        tr.innerHTML = rowContent;
        employeeDetailsTableBody.appendChild(tr);
    });

    // Modal is already set to flex/block at the start of the function
}


// --- Initialize the report when the page loads ---
document.addEventListener('DOMContentLoaded', init);