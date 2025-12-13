// Configuration
const CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vT9_AWvtkXrKNfZn8a2MjBythmdYm_IBbM-IGzGz8EdB2NvKo8YoaMMzJ8DZ_Yvi8GnlTyEBUTrKZ8_/pub?gid=749150387&single=true&output=csv';
const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const SAFE_CSV_SPLIT_REGEX = /,(?=(?:(?:[^"]*"){2})*[^"]*$)/g;

// State
let rawData = [];
let allMonths = new Set();
let allTMs = new Map(); 
// Map to store detailed records for each UM for the branch breakdown modal (leaf node)
let umContributionMap = new Map();
// NEW: Map to store children's aggregate stats for parent breakdown modal (non-leaf nodes)
let managerBreakdownMap = new Map();
let uniqueIdCounter = 0; 

// Helper function for robust CSV parsing
function safeCSVSplit(rowStr) {
    return rowStr.split(SAFE_CSV_SPLIT_REGEX).map(s => s.trim().replace(/^"|"$/g, ''));
}

// --- MODAL FUNCTIONS ---

function closeModal() {
    document.getElementById('branchModal').style.display = 'none';
}

function showBranchContribution(umUniqueId, umName) {
    const contributionData = umContributionMap.get(umUniqueId);
    const modalTitle = document.getElementById('modalTitle');
    const modalBody = document.getElementById('modalBody');

    modalTitle.textContent = `Branch Contribution Breakdown for UM: ${umName}`;
    
    if (!contributionData || contributionData.length === 0) {
        modalBody.innerHTML = '<p>No individual records found for this Unit Manager.</p>';
        document.getElementById('branchModal').style.display = 'flex';
        return;
    }

    // AGGREGATE BRANCH DATA
    const aggregatedBranches = new Map();

    contributionData.forEach((row) => {
        const branchName = row.branch || "N/A"; 
        
        if (!aggregatedBranches.has(branchName)) {
            aggregatedBranches.set(branchName, { inf: 0, out: 0, net: 0 });
        }

        const branchAgg = aggregatedBranches.get(branchName);
        branchAgg.inf += row.inf;
        branchAgg.out += row.out;
        branchAgg.net += row.net;
    });
    
    const fmt = (n) => n.toLocaleString('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });

    let tableHtml = `
        <table class="branch-table">
            <thead>
                <tr>
                    <th>Branch</th> <th>Inflow</th>
                    <th>Outflow</th>
                    <th>Net</th>
                </tr>
            </thead>
            <tbody>
    `;

    // Populate table using the aggregated branch results
    Array.from(aggregatedBranches.entries()).forEach(([branchName, data]) => {
        tableHtml += `
            <tr>
                <td>${branchName}</td> <td style="color:var(--pos-green);">${fmt(data.inf)}</td>
                <td style="color:var(--neg-red);">${fmt(data.out)}</td>
                <td style="font-weight:700;">${fmt(data.net)}</td>
            </tr>
        `;
    });

    tableHtml += `
            </tbody>
        </table>
    `;

    modalBody.innerHTML = tableHtml;
    document.getElementById('branchModal').style.display = 'flex';
}

// NEW FUNCTION: Team breakdown for TM/RM/DM (non-leaf nodes)
function showManagerBreakdown(managerUniqueId, managerName) {
    const breakdownData = managerBreakdownMap.get(managerUniqueId);
    const modalTitle = document.getElementById('modalTitle');
    const modalBody = document.getElementById('modalBody');

    modalTitle.textContent = `Team Breakdown for ${managerName}`;

    if (!breakdownData || breakdownData.length === 0) {
        modalBody.innerHTML = '<p>No sub-managers found for this level.</p>';
        document.getElementById('branchModal').style.display = 'flex';
        return;
    }
    
    // AGGREGATE MANAGER DATA BY NAME AND ROLE 
    const aggregatedManagers = new Map();

    breakdownData.forEach((child) => {
        // Use a composite key (Name + Role) for aggregation
        const key = `${child.name}_${child.role}`; 
        
        if (!aggregatedManagers.has(key)) {
            aggregatedManagers.set(key, { name: child.name, role: child.role, inf: 0, out: 0, net: 0 });
        }

        const managerAgg = aggregatedManagers.get(key);
        managerAgg.inf += child.inf;
        managerAgg.out += child.out;
        managerAgg.net += child.net;
    });

    // Convert the map values back to an array for easy iteration
    const finalBreakdownData = Array.from(aggregatedManagers.values());
    
    const fmt = (n) => n.toLocaleString('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });

    let tableHtml = `
        <table class="branch-table">
            <thead>
                <tr>
                    <th>Sub-Manager Name (Role)</th> <th>Inflow</th>
                    <th>Outflow</th>
                    <th>Net</th>
                </tr>
            </thead>
            <tbody>
    `;
    
    // Populate table using the final aggregated data
    finalBreakdownData.forEach((child) => {
        tableHtml += `
            <tr>
                <td>${child.name} (${child.role || 'TM'})</td> 
                <td style="color:var(--pos-green);">${fmt(child.inf)}</td>
                <td style="color:var(--neg-red);">${fmt(child.out)}</td>
                <td style="font-weight:700;">${fmt(child.net)}</td>
            </tr>
        `;
    });

    tableHtml += `
            </tbody>
        </table>
    `;

    modalBody.innerHTML = tableHtml;
    document.getElementById('branchModal').style.display = 'flex';
}


// --- DATA FETCH & PARSING ---

document.addEventListener('DOMContentLoaded', () => {
    fetchData();
});

async function fetchData() {
    try {
        const response = await fetch(CSV_URL);
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const text = await response.text();
        parseCSV(text);
        initFilters();
        
        document.querySelector('.loading-msg').textContent = "Data Loaded. Please select filters and click 'Analyze Data'.";
    } catch (error) {
        console.error("Error loading CSV:", error);
        document.querySelector('#treeContainer').innerHTML = `<div class="loading-msg" style="color: red;">
            CRITICAL ERROR: Failed to load or parse data.<br> 
            Error details: ${error.message}. Please check if the Google Sheet link is correct and publicly published as CSV.
        </div>`;
    }
}

function parseCSV(csvText) {
    const rows = csvText.split('\n').map(row => row.trim()).filter(row => row.length > 0);
    const headers = safeCSVSplit(rows[0]).map(h => h.trim());
    
    const idx = {
        date: headers.indexOf('DATE'),
        tm: headers.indexOf('TM'),
        rm: headers.indexOf('RM'),
        dm: headers.indexOf('DM'),
        um: headers.indexOf('Unit Manager'),
        // ASSUMPTION: The CSV MUST include a 'Branch' column for the UM breakdown to work correctly.
        branch: headers.indexOf('Branch'), 
        inf: headers.indexOf('INF Total'),
        out: headers.indexOf('OUT Total'),
        net: headers.indexOf('Net')
    };
    
    const cleanNum = (val) => parseFloat(String(val).replace(/,/g, '')) || 0;

    rawData = rows.slice(1).map(rowStr => {
        const row = safeCSVSplit(rowStr); 
        
        // --- Date Parsing (supports DD/MM/YYYY or YYYY-MM-DD) ---
        let dateStr = row[idx.date] || "";
        let month = "Unknown";
        if(dateStr) {
            try {
                const parts = dateStr.includes('/') ? dateStr.split('/') : dateStr.includes('-') ? dateStr.split('-') : [];
                if (parts.length === 3) {
                    const monthPartIndex = dateStr.includes('/') ? 1 : (dateStr.includes('-') ? 1 : -1); 
                    if(monthPartIndex !== -1) {
                         const monthIndex = parseInt(parts[monthPartIndex], 10) - 1;
                         month = MONTH_NAMES[monthIndex] || "Unknown";
                    }
                }
            } catch(e) { month = "Unknown"; }
        }
        // -------------------------------------------------------

        let tmValue = (row[idx.tm] || "").trim();
        let dmValue = (row[idx.dm] || "").trim();
        let rmValue = (row[idx.rm] || "").trim();
        let umValue = (row[idx.um] || "").trim();
        let branchValue = (row[idx.branch] || "").trim(); 
        
        let isOrphan = false;
        let finalTM = tmValue; 

        if (!tmValue) {
            if (rmValue || dmValue || umValue || branchValue) { 
                finalTM = rmValue || dmValue || umValue || branchValue; 
                isOrphan = true;
                
                // If promoted to finalTM, remove from lower levels to avoid hierarchy confusion
                if (finalTM === rmValue) rmValue = '';
                else if (finalTM === dmValue) dmValue = '';
                else if (finalTM === umValue) umValue = '';
                else if (finalTM === branchValue) branchValue = ''; 
            } 
        }

        if (finalTM) {
            if (allTMs.get(finalTM) !== false) {
                allTMs.set(finalTM, isOrphan);
            } else if (!isOrphan) {
                allTMs.set(finalTM, false);
            }
        }
        
        if (month !== "Unknown") allMonths.add(month);

        return {
            month: month, 
            tm: finalTM,
            rm: rmValue, 
            dm: dmValue,
            um: umValue,
            branch: branchValue, 
            isOrphanRecord: isOrphan,
            inf: cleanNum(row[idx.inf]),
            out: cleanNum(row[idx.out]),
            net: cleanNum(row[idx.net])
        };
    }).filter(d => d.month !== "Unknown" && d.tm.length > 0); 
}

function initFilters() {
    const monthSelect = document.getElementById('monthFilter');
    const tmSelect = document.getElementById('tmFilter');
    
    monthSelect.innerHTML = '<option value="all">All Months</option>';
    tmSelect.innerHTML = '<option value="all">All TMs</option>';

    Array.from(allMonths)
        .sort((a, b) => MONTH_NAMES.indexOf(a) - MONTH_NAMES.indexOf(b))
        .forEach(m => {
            const opt = document.createElement('option');
            opt.value = m;
            opt.textContent = m;
            monthSelect.appendChild(opt);
        });

    Array.from(allTMs.entries())
        .filter(([tmName]) => tmName.length > 0)
        .sort((a, b) => {
            const orphanA = a[1];
            const orphanB = b[1];

            if (orphanA && !orphanB) return 1; 
            if (!orphanA && orphanB) return -1; 

            return a[0].localeCompare(b[0]);
        })
        .forEach(([tmName, isOrphan]) => {
            const opt = document.createElement('option');
            opt.value = tmName;
            opt.textContent = tmName + (isOrphan ? ' (Orphan)' : '');
            tmSelect.appendChild(opt);
        });

    tmSelect.disabled = false;
}

function applyFilters() {
    const selectedMonth = document.getElementById('monthFilter').value;
    const selectedTM = document.getElementById('tmFilter').value;
    
    let filtered = rawData.filter(d => {
        const monthMatch = selectedMonth === 'all' || d.month === selectedMonth;
        const tmMatch = selectedTM === 'all' || d.tm === selectedTM;
        
        return monthMatch && tmMatch;
    });

    const hierarchy = buildHierarchy(filtered);
    
    renderTree(hierarchy);
    updateSummary(filtered);
}


function buildHierarchy(data) {
    let tree = {};
    umContributionMap.clear(); 
    managerBreakdownMap.clear(); // Clear the new map
    uniqueIdCounter = 0; 

    data.forEach(row => {
        let tmKey = row.tm; 
        let rmKey = row.rm;
        let dmKey = row.dm;
        let umKey = row.um;
        
        if (!tmKey) return; 

        // --- TM Level (Root) ---
        if(!tree[tmKey]) {
            uniqueIdCounter++; // Assign ID at TM level
            const isOrphanTM = allTMs.get(tmKey) || false; 

            tree[tmKey] = { 
                id: `node-${uniqueIdCounter}`, // Add ID
                role: 'TM', // Add Role
                name: tmKey, // Add Name for breakdown map
                inf:0, out:0, net:0, 
                children: {}, 
                isOrphan: isOrphanTM
            };
        }
        
        let currentLevel = tree[tmKey];
        
        // Accumulate stats at TM level
        currentLevel.inf += row.inf;
        currentLevel.out += row.out;
        currentLevel.net += row.net;
        
        // Define the hierarchy roles in order
        const hierarchyLevels = [
            { key: rmKey, name: 'RM' },
            { key: dmKey, name: 'DM' },
            { key: umKey, name: 'UM' }
        ];

        // Dynamically build the path:
        for (let i = 0; i < hierarchyLevels.length; i++) {
            const level = hierarchyLevels[i];
            const managerKey = level.key;
            
            if (managerKey) {
                if(!currentLevel.children[managerKey]) {
                    // Assign a unique ID to the manager node for the contribution map
                    uniqueIdCounter++;
                    currentLevel.children[managerKey] = { 
                        id: `node-${uniqueIdCounter}`,
                        inf:0, out:0, net:0, 
                        children: {},
                        role: level.name,
                        name: managerKey, // Add Name for breakdown map
                        records: [] 
                    };
                }
                
                currentLevel = currentLevel.children[managerKey];
                
                // Accumulate stats at the current node
                currentLevel.inf += row.inf;
                currentLevel.out += row.out;
                currentLevel.net += row.net;

                const nextLevelKey = (i + 1) < hierarchyLevels.length ? hierarchyLevels[i+1].key : '';

                if (!nextLevelKey) {
                    // This is the leaf node for this particular row's path
                    currentLevel.records.push(row); 
                }
            }
        }
    });

    // Function to populate both contribution maps recursively
    function mapContributionsAndBreakdowns(node) {
        if (!node.children || Object.keys(node.children).length === 0) {
            // Leaf Node (UM): Populate Branch Contribution Map
            if (node.records && node.id) {
                umContributionMap.set(node.id, node.records);
            }
        } else {
            // Parent Node (TM, RM, DM): Populate Manager Breakdown Map with children's aggregates
            const childrenBreakdown = [];
            for (const childName in node.children) {
                const child = node.children[childName];
                // Push the child's aggregated data to the breakdown list for the parent
                childrenBreakdown.push({
                    name: child.name,
                    role: child.role,
                    inf: child.inf,
                    out: child.out,
                    net: child.net
                });
                // Recurse down
                mapContributionsAndBreakdowns(child);
            }
            if (node.id) {
                managerBreakdownMap.set(node.id, childrenBreakdown);
            }
        }
    }

    for (const tmName in tree) {
        mapContributionsAndBreakdowns(tree[tmName]);
    }
    
    return tree;
}


function renderTree(tree) {
    const container = document.getElementById('treeContainer');
    const tmCardContainer = document.getElementById('tmCardContainer');
    container.innerHTML = ''; 
    tmCardContainer.innerHTML = ''; 
    
    const selectedTM = document.getElementById('tmFilter').value;
    const isAllTMsSelected = selectedTM === 'all'; 

    if(Object.keys(tree).length === 0) {
        container.innerHTML = '<div class="loading-msg">No records found for this selection.</div>';
        return;
    }

    const fmt = (n) => n.toLocaleString('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });

    const statHtml = (managerData, managerName, isTMCard = false) => {
        const isLeaf = !managerData.children || Object.keys(managerData.children).length === 0;
        
        let netBox;
        if (isLeaf && managerData.id) {
            // UM Level (Leaf Node) - Click for Branch Breakdown
            const safeManagerName = managerName.replace(/'/g, "\\'");
            
            netBox = `
                <div class="stat-box clickable-net" onclick="showBranchContribution('${managerData.id}', '${safeManagerName}')">
                    <span>Net ${isTMCard ? '' : '(Click for Branch)'}</span>
                    <span style="font-weight:800">${fmt(managerData.net)}</span>
                </div>
            `;
        } else if (managerData.id) {
             // TM, RM, DM Level (Non-Leaf Node) - Click for Manager/Team Breakdown
            const safeManagerName = managerName.replace(/'/g, "\\'");
            
            netBox = `
                <div class="stat-box clickable-net" onclick="showManagerBreakdown('${managerData.id}', '${safeManagerName}')">
                    <span>Net ${isTMCard ? '' : '(Click for Team)'}</span>
                    <span style="font-weight:800">${fmt(managerData.net)}</span>
                </div>
            `;
        } else {
            // Fallback for nodes without ID or if logic is missed
            netBox = `
                <div class="stat-box">
                    <span>Net</span>
                    <span style="font-weight:800">${fmt(managerData.net)}</span>
                </div>
            `;
        }
        
        // TM cards only show Net
        if (isTMCard) {
             return `<div class="node-stats tm-card-stats">${netBox}</div>`;
        }

        return `
            <div class="node-stats">
                <div class="stat-box"><span>Inflow</span><span style="color:var(--pos-green)">${fmt(managerData.inf)}</span></div>
                <div class="stat-box"><span>Outflow</span><span style="color:var(--neg-red)">${fmt(managerData.out)}</span></div>
                ${netBox}
            </div>
        `;
    };
    
    // Function to render the individual card node for hierarchy (RM, DM, UM)
    function buildHierarchyNode(managerName, managerData) {
        const nodeDiv = document.createElement('div');
        nodeDiv.className = `hierarchy-card level-${managerData.role ? managerData.role.toLowerCase() : 'um'}`;
        
        const isLeaf = !managerData.children || Object.keys(managerData.children).length === 0;

        let managerTitle = `${managerData.role}: ${managerName}`;

        const contentHtml = `
            <div class="node-header">
                <span class="node-title">${managerTitle}</span>
                ${statHtml(managerData, managerName)}
            </div>
        `;
        
        nodeDiv.innerHTML = contentHtml;
        
        // If it's a parent node, add a container for children and recurse
        if (!isLeaf) {
            const childrenContainer = document.createElement('div');
            childrenContainer.className = 'children-container';
            
            for (const [childName, childData] of Object.entries(managerData.children)) {
                const childNode = buildHierarchyNode(childName, childData);
                childrenContainer.appendChild(childNode);
            }
            
            nodeDiv.appendChild(childrenContainer);
        }

        return nodeDiv;
    }


    // --- 1. RENDER TM CARDS (Horizontal Selector) ---
    
    // NEW: Dedicated "All TMs" card for main view
    const allTMCard = document.createElement('div');
    allTMCard.className = `tm-select-card all-tm-card ${isAllTMsSelected ? 'selected' : ''}`;
    allTMCard.innerHTML = `
        <div class="tm-card-title" style="font-size:1rem; font-weight:700; color:#555;">🏠 All TMs</div>
        <div class="tm-card-stats" style="margin-top:0; font-size:0.8rem; color:#777;">
             (Click to reset view)
        </div>
    `; 
    
    allTMCard.onclick = () => {
        document.getElementById('tmFilter').value = 'all';
        applyFilters(); 
    };
    tmCardContainer.appendChild(allTMCard);


    // Render individual TM cards
    for(const [tmName, tmData] of Object.entries(tree)) { 
        const tmCard = document.createElement('div');
        const tmTag = tmData.isOrphan ? ` <span class="orphan-tag">(Orphan)</span>` : '';
        const tmTitle = `${tmName}${tmTag}`;
        
        tmCard.className = `tm-select-card level-tm-select ${tmData.isOrphan ? 'untagged-tm-select' : ''} ${tmName === selectedTM ? 'selected' : ''}`;
        
        tmCard.innerHTML = `
            <div class="tm-card-title">TM: ${tmTitle}</div>
            ${statHtml(tmData, tmName, true)}
        `;

        // Click handler for card selection: toggle between selected TM and 'all'
        tmCard.onclick = () => {
             // If already selected, deselect (go back to 'all')
             const newSelection = tmName === selectedTM ? 'all' : tmName;
             document.getElementById('tmFilter').value = newSelection;
             applyFilters(); 
        };
        
        tmCardContainer.appendChild(tmCard);
    }
    
    // --- 2. RENDER HIERARCHY (Vertical Tree) ---
    if (!isAllTMsSelected) {
        const tmData = tree[selectedTM];
        if (tmData && tmData.children && Object.keys(tmData.children).length > 0) {
            // Display the name of the selected TM as the root title (not a card)
            const rootTitle = document.createElement('h3');
            rootTitle.textContent = `Hierarchy for Selected TM: ${selectedTM}`;
            rootTitle.style.marginTop = '20px';
            rootTitle.style.borderBottom = '1px solid #ddd';
            rootTitle.style.paddingBottom = '10px';
            container.appendChild(rootTitle);

            // This is the container for the RM/DM/UM hierarchy below the selected TM card
            const hierarchyRoot = document.createElement('div');
            hierarchyRoot.className = 'hierarchy-root';
            
            for (const [childName, childData] of Object.entries(tmData.children)) {
                const childNode = buildHierarchyNode(childName, childData);
                hierarchyRoot.appendChild(childNode);
            }
            container.appendChild(hierarchyRoot);
        } else {
             container.innerHTML = '<div class="loading-msg">No breakdown records found for the selected TM.</div>';
        }
    } else {
         // If 'All TMs' is selected, instruct the user to select one
         container.innerHTML = '<div class="loading-msg">Select a Territory Manager (TM) from the cards above to view their full hierarchy breakdown.</div>';
    }
}


function updateSummary(data) {
    const totalInf = data.reduce((acc, curr) => acc + curr.inf, 0);
    const totalOut = data.reduce((acc, curr) => acc + curr.out, 0);
    const totalNet = totalInf - totalOut;

    const fmt = (n) => n.toLocaleString('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });

    document.getElementById('totalInf').textContent = fmt(totalInf);
    document.getElementById('totalOut').textContent = fmt(totalOut);
    document.getElementById('totalNet').textContent = fmt(totalNet);
    document.getElementById('summaryRow').style.display = 'flex';
}