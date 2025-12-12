// --- CONFIGURATION ---
const SPREADSHEET_ID = '12kHQeKs8OrxADFW7ICgRoZOHpwgambPc2mbeKwkKEMw';
const API_KEY = 'AIzaSyAiUTTvYAc9LG7eoF6eyky49ucGZtyaePU';
const SHEET_NAME = 'all'; 
const RANGE = `${SHEET_NAME}!A:H`; 
const API_URL = `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${RANGE}?key=${API_KEY}`;
const HEADERS = ['RD NO', 'MOBILE', 'DATE', 'AMT', 'SHARE NAME', 'AGENT', 'COMPANY', 'BRANCH'];
const NOVEMBER_2025_THRESHOLD = '2025-11'; // Strict date check
const TARGET_COMPANY = 'VFL'; // NEW: Hardcoded target company

// --- GLOBAL STATE ---
let ALL_DATA = []; 
let FILTERED_MONTH_DATA = [];
let CURRENT_COMPANY = TARGET_COMPANY; // Initialized to VFL
let NOV_2025_BASE_DATA = []; 

// --- DOM REFERENCES ---
let messageElement, companySelect, monthFilterComp, reportControls, branchListContainer, 
    branchTableBody, agentDetailContainer, agentTableBody, backToBranchButton, agentDetailTitle,
    companySummaryElement; 

// --- UTILITY FUNCTIONS ---
function parseCurrencyValue(valueString) {
    if (typeof valueString !== 'string') {
        return parseFloat(valueString) || 0;
    }
    let cleanString = valueString.replace(/,/g, '');
    cleanString = cleanString.replace(/[^0-9.-]/g, '');
    return parseFloat(cleanString) || 0;
}

function parseSheetDate(dateString) {
    if (!dateString) return null;
    let date = new Date(dateString);
    if (isNaN(date) || date.getFullYear() < 1900) {
        const parts = dateString.match(/(\d{1,4})[-/.](\d{1,4})[-/.](\d{2,4})/);
        if (parts && parts.length === 4) {
            const year = parseInt(parts[3].length === 2 ? '20' + parts[3] : parts[3]);
            const day = parseInt(parts[1]);
            const month = parseInt(parts[2]) - 1; 
            date = new Date(year, month, day);
        }
    }
    return (!isNaN(date) && date.getFullYear() >= 1900) ? date : null;
}

// Helper to strictly filter data from Nov 2025 onwards
function getNov2025Data(data) {
    const dateIndex = HEADERS.indexOf('DATE');
    return data.filter(row => {
        const date = parseSheetDate(row[dateIndex]);
        if (!date) return false;
        const rowMonthYear = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        return rowMonthYear >= NOVEMBER_2025_THRESHOLD;
    });
}

// --- INITIALIZATION ---
function initDOM() {
    messageElement = document.getElementById('message');
    companySelect = document.getElementById('company-select');
    monthFilterComp = document.getElementById('month-filter-comp');
    reportControls = document.getElementById('report-controls');
    branchListContainer = document.getElementById('branch-list-container');
    branchTableBody = document.getElementById('branch-table-body'); 
    agentDetailContainer = document.getElementById('agent-detail-container');
    agentTableBody = document.getElementById('agent-table-body'); 
    backToBranchButton = document.getElementById('back-to-branch-button');
    agentDetailTitle = document.getElementById('agent-detail-title');
    companySummaryElement = document.getElementById('company-summary');
}

// --- FETCH DATA ---
async function fetchAllData() { 
    try { 
        const response = await fetch(API_URL); 
        if (!response.ok) { 
            throw new Error(`HTTP error! status: ${response.status}`); 
        }

        const data = await response.json(); 
        ALL_DATA = data.values.slice(1); 
        
        // CRITICAL: Filter ALL_DATA to Nov 2025+ and store as base
        NOV_2025_BASE_DATA = getNov2025Data(ALL_DATA);
        FILTERED_MONTH_DATA = NOV_2025_BASE_DATA;

        // NEW: Immediately start the report for VFL
        startVFLReport(NOV_2025_BASE_DATA);
        populateMonthFilter(NOV_2025_BASE_DATA);
        
        messageElement.textContent = `VFL Branch Performance Report.`;
        messageElement.className = 'info';
        reportControls.classList.remove('hidden');

    } catch (error) { 
        console.error('Error fetching data:', error); 
        messageElement.textContent = `Error: Failed to load sheet data. (${error.message})`; 
        messageElement.className = 'error'; 
    }
}

// NEW: Function to initiate the report for the fixed company VFL
function startVFLReport(data) {
    // Set companySelect to the target name for display purposes
    companySelect.innerHTML = `<option value="${TARGET_COMPANY}" selected>${TARGET_COMPANY}</option>`;
    companySelect.disabled = true; // Disable selection

    // Generate the initial report
    generateCompanyBranchReport(CURRENT_COMPANY, data);
    branchListContainer.classList.remove('hidden');
}


function populateMonthFilter(data) {
    const dateIndex = HEADERS.indexOf('DATE');
    const companyIndex = HEADERS.indexOf('COMPANY');
    const uniqueMonths = new Set();
    
    // Filter data to only VFL before getting months
    const vflData = data.filter(row => row[companyIndex] === TARGET_COMPANY);

    vflData.forEach(row => {
        const date = parseSheetDate(row[dateIndex]);
        if (date) {
            const monthYear = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
            uniqueMonths.add(monthYear);
        }
    });

    const sortedMonths = Array.from(uniqueMonths).sort((a, b) => a.localeCompare(b));

    monthFilterComp.innerHTML = '<option value="all">All Months</option>';
    sortedMonths.forEach(monthYear => {
        const [year, month] = monthYear.split('-');
        const date = new Date(year, parseInt(month) - 1);
        const monthName = date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
        
        const option = document.createElement('option');
        option.value = monthYear;
        option.textContent = monthName;
        monthFilterComp.appendChild(option);
    });
}

// --- FILTERING LOGIC ---
function filterByMonth(e) {
    const selectedMonth = e.target.value;
    const dateIndex = HEADERS.indexOf('DATE');

    if (selectedMonth === 'all') {
        FILTERED_MONTH_DATA = NOV_2025_BASE_DATA;
    } else {
        FILTERED_MONTH_DATA = NOV_2025_BASE_DATA.filter(row => {
            const date = parseSheetDate(row[dateIndex]);
            if (!date) return false;
            
            const rowMonthYear = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
            return rowMonthYear === selectedMonth;
        });
    }
    
    // CURRENT_COMPANY is always VFL here
    generateCompanyBranchReport(CURRENT_COMPANY, FILTERED_MONTH_DATA);
    
    agentDetailContainer.classList.add('hidden');
    branchListContainer.classList.remove('hidden');
}


// --- MAIN REPORT GENERATION (UPDATED AMOUNT FORMATTING) ---
function generateCompanyBranchReport(companyName, data) {
    const companyIndex = HEADERS.indexOf('COMPANY');
    const branchIndex = HEADERS.indexOf('BRANCH');
    const amtIndex = HEADERS.indexOf('AMT');
    const agentIndex = HEADERS.indexOf('AGENT'); 

    // Filter by companyName (which is always 'VFL' in this modified version)
    const companyData = data.filter(row => row[companyIndex] === companyName);
    
    const branchData = {};
    const uniqueAgents = new Set(); 
    let totalAmount = 0;
    
    companyData.forEach(row => {
        const branchName = row[branchIndex] || 'UNKNOWN';
        const agentName = row[agentIndex]; 
        const amount = parseCurrencyValue(row[amtIndex]);
        
        if (agentName) {
            uniqueAgents.add(agentName); 
        }

        if (!branchData[branchName]) {
            branchData[branchName] = { 
                amount: 0, 
                count: 0,
                transactions: []
            };
        }
        
        branchData[branchName].amount += amount;
        branchData[branchName].count++;
        branchData[branchName].transactions.push(row);
        totalAmount += amount; 
    });

    // --- Calculate Totals for Summary ---
    const totalTransactions = companyData.length;
    const totalBranches = Object.keys(branchData).length;
    const totalUniqueStaff = uniqueAgents.size; 

    // --- Render Summary Cards ---
    if (companySummaryElement) {
        companySummaryElement.innerHTML = `
            <div class="summary-card total">
                <h3>TOTAL BRANCHES PARTICIPATED</h3>
                <p>${totalBranches.toLocaleString('en-IN')}</p>
            </div>
            <div class="summary-card total">
                <h3>TOTAL STAFF PARTICIPATED</h3>
                <p>${totalUniqueStaff.toLocaleString('en-IN')}</p>
            </div>
            <div class="summary-card total">
                <h3>TOTAL TRANSACTIONS (Count)</h3>
                <p>${totalTransactions.toLocaleString('en-IN')}</p>
            </div>
            <div class="summary-card total">
                <h3>TOTAL AMOUNT</h3>
                <p>${totalAmount.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</p> </div>
        `;
    }


    // Sort branches by amount descending
    const sortedBranches = Object.entries(branchData)
        .map(([name, stats]) => ({ name, ...stats }))
        .sort((a, b) => b.amount - a.amount);

    // Render Branch Summary Table Rows
    branchTableBody.innerHTML = '';
    if (sortedBranches.length === 0) {
        branchTableBody.innerHTML = `<tr><td colspan="4" style="text-align: center;">No data found for VFL in the selected month.</td></tr>`;
        return;
    }

    sortedBranches.forEach((branch, index) => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${index + 1}</td>
            <td class="branch-name-link">
                <a href="#" data-branch="${branch.name}">
                    ${branch.name}
                </a>
            </td>
            <td class="numeric">${branch.count.toLocaleString('en-IN')}</td>
            <td class="numeric">${branch.amount.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</td> `;
        
        tr.querySelector('.branch-name-link a').addEventListener('click', (e) => {
            e.preventDefault(); 
            showAgentDetails(branch.name, branch.transactions);
        });
        
        branchTableBody.appendChild(tr);
    });
}

// --- AGENT DETAIL VIEW (UPDATED AMOUNT FORMATTING) ---
function showAgentDetails(branchName, transactions) {
    agentDetailTitle.textContent = `Agent Performance in ${branchName} (VFL)`;
    agentTableBody.innerHTML = ''; 
    
    const agentIndex = HEADERS.indexOf('AGENT');
    const amtIndex = HEADERS.indexOf('AMT');
    
    const agentPerformance = {};
    transactions.forEach(row => {
        const agentName = row[agentIndex] || 'UNKNOWN';
        const amount = parseCurrencyValue(row[amtIndex]);
        
        if (!agentPerformance[agentName]) {
            agentPerformance[agentName] = { 
                amount: 0, 
                count: 0
            };
        }
        
        agentPerformance[agentName].amount += amount;
            agentPerformance[agentName].count++;
    });

    // Sort agents by amount descending
    const sortedAgents = Object.entries(agentPerformance)
        .map(([name, stats]) => ({ name, ...stats }))
        .sort((a, b) => b.amount - a.amount);
    
    // Render Agent Table
    sortedAgents.forEach((agent, index) => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${index + 1}</td>
            <td>${agent.name}</td>
            <td class="numeric">${agent.count.toLocaleString('en-IN')}</td>
            <td class="numeric">${agent.amount.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</td> `;
        agentTableBody.appendChild(tr);
    });

    branchListContainer.classList.add('hidden');
    agentDetailContainer.classList.remove('hidden');
}

function backToBranchList() {
    agentDetailContainer.classList.add('hidden');
    branchListContainer.classList.remove('hidden');
}


// --- FINAL SETUP ---
document.addEventListener('DOMContentLoaded', () => {
    initDOM();
    fetchAllData();

    // Attach event listeners
    // companySelect.addEventListener('change', handleCompanyChange); // Removed for VFL-only mode
    monthFilterComp.addEventListener('change', filterByMonth);
    backToBranchButton.addEventListener('click', backToBranchList);
});