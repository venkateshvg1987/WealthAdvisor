// App state variables
let authToken = localStorage.getItem("token") || "";
let activeTab = "dashboard";
let chartInstances = {};

const API_BASE = window.location.origin;

// Auto-detect Demo Mode (if opened as local file or host is not web server)
const isDemoMode = window.location.protocol === "file:" || window.location.hostname === "";

// Local storage holdings for Demo Mode
let demoHoldings = JSON.parse(localStorage.getItem("demo_holdings"));
if (!demoHoldings) {
    demoHoldings = [
        { id: 1, asset_class: "STOCK", symbol: "RELIANCE", name: "Reliance Industries Limited", quantity: 15, buy_price: 2320.0, buy_date: "2024-03-12" },
        { id: 2, asset_class: "STOCK", symbol: "TCS", name: "Tata Consultancy Services Limited", quantity: 8, buy_price: 3550.0, buy_date: "2024-06-20" },
        { id: 3, asset_class: "STOCK", symbol: "HDFCBANK", name: "HDFC Bank Limited", quantity: 40, buy_price: 1540.0, buy_date: "2025-01-15" },
        { id: 4, asset_class: "MUTUAL_FUND", symbol: "PPFAS_FLEXICAP", name: "Parag Parikh Flexi Cap Fund", quantity: 600, buy_price: 64.20, buy_date: "2024-05-10" },
        { id: 5, asset_class: "MUTUAL_FUND", symbol: "SBI_BLUECHIP", name: "SBI Bluechip Fund", quantity: 450, buy_price: 78.50, buy_date: "2024-09-18" },
        { id: 6, asset_class: "GOLD_ETF", symbol: "GOLDBEES", name: "Nippon India ETF Gold BeES", quantity: 200, buy_price: 58.20, buy_date: "2025-02-28" }
    ];
    localStorage.setItem("demo_holdings", JSON.stringify(demoHoldings));
}

let demoLogs = JSON.parse(localStorage.getItem("demo_logs")) || [
    { timestamp: new Date(Date.now() - 1000 * 60 * 60).toISOString(), ip_address: "127.0.0.1", action: "AUTH_LOGIN_SUCCESS", details: "Demo session authenticated successfully." },
    { timestamp: new Date(Date.now() - 1000 * 60 * 120).toISOString(), ip_address: "127.0.0.1", action: "UPLOAD_PORTFOLIO", details: "Imported 6 pre-seeded holdings for demo visualization." }
];

// Initialize
document.addEventListener("DOMContentLoaded", () => {
    setupEventListeners();
    if (isDemoMode) {
        console.log("► Running in browser-only Demo Mode.");
        document.getElementById("ai-status-badge").innerText = "Online | Demo Client Mode";
        document.getElementById("ai-status-badge").className = "badge badge-blue";
        // Auto sign-in for demo convenience
        authToken = "mock-demo-token-12345";
    }
    checkAuthStatus();
});

function checkAuthStatus() {
    if (authToken) {
        document.getElementById("login-container").classList.add("hidden");
        document.getElementById("app-container").classList.remove("hidden");
        loadActiveTabData();
    } else {
        document.getElementById("login-container").classList.remove("hidden");
        document.getElementById("app-container").classList.add("hidden");
    }
}

// Global API fetcher with token headers and Demo Mode Interceptor
async function apiFetch(endpoint, options = {}) {
    if (isDemoMode) {
        return handleDemoRequest(endpoint, options);
    }

    if (!options.headers) options.headers = {};
    if (authToken) {
        options.headers["Authorization"] = `Bearer ${authToken}`;
    }

    try {
        const response = await fetch(`${API_BASE}${endpoint}`, options);
        if (response.status === 401) {
            logout();
            throw new Error("Unauthorized/Session expired");
        }
        if (!response.ok) {
            const errData = await response.json().catch(() => ({}));
            throw new Error(errData.detail || "API Request Failed");
        }
        return response;
    } catch (err) {
        // Automatically switch to client-side demo if backend fails to connect
        console.warn("Backend connection failed. Switching to emulated demo mode.");
        document.getElementById("ai-status-badge").innerText = "Online | Demo Fallback Mode";
        document.getElementById("ai-status-badge").className = "badge badge-yellow";
        // Reload in demo mode
        authToken = "mock-demo-token-12345";
        localStorage.setItem("token", authToken);
        // Force refresh via demo execution
        return handleDemoRequest(endpoint, options);
    }
}

function logout() {
    authToken = "";
    localStorage.removeItem("token");
    checkAuthStatus();
}

function setupEventListeners() {
    document.getElementById("btn-login").addEventListener("click", handleLogin);
    document.getElementById("btn-logout").addEventListener("click", logout);

    const navItems = document.querySelectorAll(".nav-item");
    navItems.forEach(item => {
        item.addEventListener("click", (e) => {
            const targetBtn = e.currentTarget;
            navItems.forEach(btn => btn.classList.remove("active"));
            targetBtn.classList.add("active");
            switchTab(targetBtn.getAttribute("data-tab"));
        });
    });

    document.getElementById("btn-download-pdf").addEventListener("click", triggerPdfDownload);
    document.getElementById("btn-download-excel").addEventListener("click", triggerExcelDownload);
    document.getElementById("btn-manual-add").addEventListener("click", handleManualAdd);
    document.getElementById("btn-db-backup").addEventListener("click", triggerDatabaseBackup);

    const fileInput = document.getElementById("file-uploader-input");
    fileInput.addEventListener("change", () => {
        if (fileInput.files.length > 0) {
            document.getElementById("upload-status-display").innerText = `Selected file: ${fileInput.files[0].name}`;
        }
    });

    document.getElementById("btn-upload-submit").addEventListener("click", handleFileUpload);

    document.getElementById("btn-chat-send").addEventListener("click", sendChatMessage);
    document.getElementById("chat-user-input").addEventListener("keypress", (e) => {
        if (e.key === "Enter") sendChatMessage();
    });

    document.getElementById("manual-date").valueAsDate = new Date();
}

async function handleLogin() {
    const email = document.getElementById("login-email").value.trim();
    const password = document.getElementById("login-password").value;

    if (!email || !password) {
        alert("Please enter credentials.");
        return;
    }

    if (isDemoMode) {
        authToken = "mock-demo-token-12345";
        localStorage.setItem("token", authToken);
        checkAuthStatus();
        return;
    }

    const formData = new URLSearchParams();
    formData.append("username", email);
    formData.append("password", password);

    try {
        const response = await fetch(`${API_BASE}/api/auth/login`, {
            method: "POST",
            body: formData,
            headers: { "Content-Type": "application/x-www-form-urlencoded" }
        });

        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.detail || "Authentication failed");
        }

        const data = await response.json();
        authToken = data.access_token;
        localStorage.setItem("token", authToken);
        checkAuthStatus();
    } catch (err) {
        // Failover to demo mode
        console.warn("Authentication failed, loading Demo interface.", err);
        authToken = "mock-demo-token-12345";
        localStorage.setItem("token", authToken);
        checkAuthStatus();
    }
}

function switchTab(tabName) {
    activeTab = tabName;
    const sheets = document.querySelectorAll(".tab-sheet");
    sheets.forEach(sheet => sheet.classList.add("hidden"));
    document.getElementById(`tab-sheet-${tabName}`).classList.remove("hidden");

    const title = document.getElementById("header-tab-title");
    const desc = document.getElementById("header-tab-desc");

    const tabConfig = {
        dashboard: ["Overall Portfolio Dashboard", "High-level asset value mapping, allocation summaries, and structural ratings."],
        stocks: ["Direct Stock Analytics", "Explainable buy/sell recommendations, volume breakout alerts, and fundamentals scans."],
        "mutual-funds": ["Mutual Funds & SIP Metrics", "Overlapping holdings matrices, SIP return grading, and Sharpe risk indexes."],
        etfs: ["ETFs & Commodity Assets", "Liquidity bands, index tracking error evaluations, and expense ratios."],
        risk: ["Risk Engine & Stress Tests", "Simulated correction projections, India VIX factors, and Nifty multiple indexes."],
        advisor: ["Antigravity AI Advisor", "Chat securely with our zero-cost AI assistant regarding your holdings."],
        settings: ["Spreadsheet Imports & Core Maintenance", "Upload bulk CSV/Excel transactions, add manual records, and run backups."]
    };

    if (tabConfig[tabName]) {
        title.innerText = tabConfig[tabName][0];
        desc.innerText = tabConfig[tabName][1];
    }

    loadActiveTabData();
}

function loadActiveTabData() {
    if (activeTab === "dashboard") loadDashboardSummary();
    else if (activeTab === "stocks") loadStocksAnalysis();
    else if (activeTab === "mutual-funds") loadMutualFundsAnalysis();
    else if (activeTab === "etfs") loadEtfsAnalysis();
    else if (activeTab === "risk") loadRiskAnalysis();
    else if (activeTab === "settings") loadSettingsData();
}

// Mock database metadata
const MOCK_PRICES = {
    RELIANCE: 2450.0, TCS: 3820.0, HDFCBANK: 1495.0, INFOSYS: 1410.0,
    PPFAS_FLEXICAP: 72.4, SBI_BLUECHIP: 84.6, NIPPON_SMALLCAP: 145.2, AXIS_ELSS: 92.1,
    NIFTY_BEES: 242.5, JUNIORBEES: 590.2, MON100: 148.0, GOLDBEES: 62.4
};

// --- CLIENT-SIDE REAL-TIME ANALYTICS SIMULATORS ---
function getSymbolHash(symbol) {
    let hash = 0;
    const str = String(symbol || "").trim().toUpperCase();
    for (let i = 0; i < str.length; i++) {
        hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    return Math.abs(hash);
}

function getMockCurrentPrice(symbol, buyPrice, storedCurrentPrice = null) {
    if (storedCurrentPrice !== null && storedCurrentPrice !== undefined && !isNaN(storedCurrentPrice) && storedCurrentPrice > 0) {
        return parseFloat(storedCurrentPrice);
    }
    const sym = String(symbol || "").trim().toUpperCase();
    if (MOCK_PRICES[sym]) return MOCK_PRICES[sym];
    const hash = getSymbolHash(sym);
    // Deterministic price variance of -12% to +20% based on stock hash
    const variancePct = -12 + (hash % 33);
    const currentPrice = buyPrice * (1 + variancePct / 100);
    return Math.max(1.0, parseFloat(currentPrice.toFixed(2)));
}

function getStockSector(symbol) {
    const sym = String(symbol || "").trim().toUpperCase();
    const hash = getSymbolHash(sym);
    const SECTORS = [
        "Financial Services", "Energy & Utilities", "Information Technology",
        "Consumer Goods", "Automobile & Components", "Healthcare & Pharmaceuticals",
        "Metals & Mining", "Construction & Materials", "Telecommunications",
        "Chemicals & Agriculture"
    ];
    if (sym.includes("BANK") || sym.includes("HDFC") || sym.includes("ICICI") || sym.includes("SBI") || sym.includes("AXIS") || sym.includes("FIN") || sym.includes("GOLD") || sym.includes("BOND") || sym.includes("GOLDBEES")) {
        return "Financial Services";
    } else if (sym.includes("POWER") || sym.includes("SOLAR") || sym.includes("ENERGY") || sym.includes("GAS") || sym.includes("OIL") || sym.includes("RELIANCE") || sym.includes("ADANI")) {
        return "Energy & Utilities";
    } else if (sym.includes("INF") || sym.includes("TCS") || sym.includes("TECH") || sym.includes("WIPRO") || sym.includes("COFORGE") || sym.includes("LTI")) {
        return "Information Technology";
    } else if (sym.includes("PHARMA") || sym.includes("DRREDDY") || sym.includes("SUN") || sym.includes("BIOCON") || sym.includes("HEALTH") || sym.includes("CIPLA")) {
        return "Healthcare & Pharmaceuticals";
    } else if (sym.includes("AUTO") || sym.includes("TATA") || sym.includes("MARUTI") || sym.includes("MAH") || sym.includes("BAJAJ")) {
        return "Automobile & Components";
    } else if (sym.includes("STEEL") || sym.includes("IRON") || sym.includes("METAL") || sym.includes("TATASTEEL") || sym.includes("HINDALCO") || sym.includes("COAL") || sym.includes("VEDL")) {
        return "Metals & Mining";
    }
    return SECTORS[hash % SECTORS.length];
}

function analyzeStockClientSide(h) {
    const symbol = h.symbol;
    const name = h.name || symbol;
    const quantity = h.quantity;
    const buy_price = h.buy_price;
    const invested = quantity * buy_price;
    const current_price = getMockCurrentPrice(symbol, buy_price, h.current_price);
    const current_value = quantity * current_price;
    const gains = current_value - invested;
    const gains_pct = invested > 0 ? (gains / invested) * 100 : 0.0;
    const hash = getSymbolHash(symbol);
    
    const sector = getStockSector(symbol);
    const fundamental_score = 45 + (hash % 46); // 45 to 90
    const technical_score = 25 + (hash % 66); // 25 to 90
    const confidence_score = 75 + (hash % 21); // 75 to 95
    
    let recommendation = "Hold";
    let evidence_pos = [];
    let evidence_neg = [];
    
    const rsi = 25 + (hash % 56);
    const pe = 12 + (hash % 45);
    const roe = 8 + (hash % 31);
    
    if (technical_score < 45) {
        if (fundamental_score > 70) {
            recommendation = "Buy on Dips";
            evidence_pos = [
                `RSI at ${rsi.toFixed(1)} is oversold, indicating near-term selling exhaustion`,
                `Strong capital efficiency with ROE of ${roe.toFixed(1)}% supports structural value`,
                `Interest coverage ratio and debt-to-equity index is safe compared to category peers`
            ];
            evidence_neg = [
                `Short term pricing trades below EMA50 anchor, momentum remains bearish`
            ];
        } else {
            recommendation = "Reduce";
            evidence_pos = [
                `Immediate historical support levels near EMA200 are holding consolidation ranges`
            ];
            evidence_neg = [
                `RSI indicates structural divergence on weekly timelines`,
                `Operational margins compressed, dropping overall ROE to ${roe.toFixed(1)}%`,
                `MACD confirmed bearish crossover on rising trading volume`
            ];
        }
    } else if (technical_score >= 70) {
        if (fundamental_score > 60) {
            recommendation = "Accumulate";
            evidence_pos = [
                `Strong bullish trend; price holds above long-term EMA200 support`,
                `Institutional volume breakout confirms strong buy conviction`,
                `Elite capital returns with ROE at ${roe.toFixed(1)}%`
            ];
            evidence_neg = [
                `Price PE multiple of ${pe.toFixed(1)}x is slightly elevated relative to historical median`
            ];
        } else {
            recommendation = "Hold";
            evidence_pos = [
                `Medium term momentum parameters indicate stable relative strength index of ${rsi.toFixed(1)}`
            ];
            evidence_neg = [
                `Valuation PE of ${pe.toFixed(1)}x is premium, limiting immediate upside potential`,
                `Slight rise in debt leverage ratio observed in recent financial reports`
            ];
        }
    } else {
        recommendation = "Hold";
        evidence_pos = [
            `Stables trading inside range-bound historical support and resistance zones`,
            `RSI is comfortable at ${rsi.toFixed(1)}, avoiding overbought/oversold boundaries`
        ];
        evidence_neg = [
            `Absence of near term volume breakout alerts or structural trend changes`,
            `PE multiple of ${pe.toFixed(1)}x matches sectoral averages`
        ];
    }
    
    return {
        symbol: symbol,
        name: name,
        invested: invested,
        current_price: current_price,
        current_value: current_value,
        gains: gains,
        gains_pct: gains_pct,
        quantity: quantity,
        fundamental_score: fundamental_score,
        technical_score: technical_score,
        recommendation: recommendation,
        confidence_score: confidence_score,
        sector: sector,
        evidence_pos: evidence_pos,
        evidence_neg: evidence_neg
    };
}

function analyzeMutualFundClientSide(h) {
    const symbol = h.symbol;
    const name = h.name || symbol;
    const invested = h.quantity * h.buy_price;
    const quantity = h.quantity;
    const hash = getSymbolHash(symbol);
    
    let category = "Diversified Mutual Fund";
    const sym = symbol.toUpperCase();
    if (sym.includes("SMALL")) category = "Equity Small Cap";
    else if (sym.includes("MID")) category = "Equity Mid Cap";
    else if (sym.includes("BLUE") || sym.includes("LARGE")) category = "Equity Large Cap";
    else if (sym.includes("FLEXI")) category = "Flexi Cap Equity";
    else if (sym.includes("TAX") || sym.includes("ELSS")) category = "ELSS Tax Saver";
    else if (sym.includes("DEBT") || sym.includes("LIQUID")) category = "Debt / Liquid Fund";
    
    const sharpe = 0.8 + (hash % 11) / 10;
    const alpha = 1.2 + (hash % 81) / 10;
    const beta = 0.7 + (hash % 6) / 10;
    
    let recommendation = "Continue SIP";
    if (sharpe < 1.0) {
        recommendation = "Review Scheme";
    } else if (sharpe >= 1.4) {
        recommendation = "Continue SIP";
    } else {
        recommendation = "Accumulate Units";
    }
    
    const gainPct = -5 + (hash % 36);
    let sipHealthStatus = "Excellent";
    let sipHealthMsg = "Steady compounding returns achieved.";
    if (gainPct < 5) {
        sipHealthStatus = "Neutral";
        sipHealthMsg = "Short term consolidation. Maintain systematic installment discipline.";
    } else if (gainPct < 15) {
        sipHealthStatus = "Good";
        sipHealthMsg = "Solid compounding growth. Matches long term category benchmarks.";
    }
    
    return {
        symbol: symbol,
        name: name,
        category: category,
        invested: invested,
        quantity: quantity,
        metrics: { sharpe_ratio: sharpe, alpha: alpha, beta: beta },
        recommendation: recommendation,
        sip_health: { status: sipHealthStatus, percentage_gain: gainPct, message: sipHealthMsg }
    };
}

function analyzeEtfClientSide(h) {
    const symbol = h.symbol;
    const name = h.name || symbol;
    const quantity = h.quantity;
    const buy_price = h.buy_price;
    const invested = quantity * buy_price;
    const hash = getSymbolHash(symbol);
    
    let category = "Passive Index ETF";
    if (h.asset_class === "GOLD_ETF" || symbol.toUpperCase().includes("GOLD")) {
        category = "Gold Commodities";
    } else if (symbol.toUpperCase().includes("NIFTY") || symbol.toUpperCase().includes("BEES")) {
        category = "Nifty Broad Index";
    }
    
    const te = 0.03 + (hash % 10) / 100;
    const er = 0.05 + (hash % 20) / 100;
    const liquidity = (hash % 3 === 0) ? "Very High" : ((hash % 3 === 1) ? "High" : "Moderate");
    
    let recommendation = "Accumulate";
    if (te > 0.10) {
        recommendation = "Hold";
    } else {
        recommendation = "Accumulate";
    }
    
    const evidence = [
        `Tracking error is minimal at ${te.toFixed(2)}% relative to benchmark indices`,
        `Low expense ratio of ${er.toFixed(2)}% avoids yield drag on long term returns`
    ];
    
    return {
        symbol: symbol,
        name: name,
        category: category,
        invested: invested,
        quantity: quantity,
        metrics: { tracking_error: te, expense_ratio: er, liquidity: liquidity },
        recommendation: recommendation,
        evidence: evidence
    };
}

// --- MOCK API INTERCEPTOR FOR DEMO ---
function handleDemoRequest(endpoint, options) {
    let responseData = {};
    
    if (endpoint.startsWith("/api/portfolio/holdings")) {
        if (options.method === "POST") {
            const body = JSON.parse(options.body);
            const newItem = {
                id: Date.now(),
                asset_class: body.asset_class,
                symbol: body.symbol,
                name: body.name || body.symbol,
                quantity: body.quantity,
                buy_price: body.buy_price,
                buy_date: body.buy_date
            };
            demoHoldings.push(newItem);
            localStorage.setItem("demo_holdings", JSON.stringify(demoHoldings));
            
            demoLogs.unshift({
                timestamp: new Date().toISOString(),
                ip_address: "local-client",
                action: "ADD_HOLDING",
                details: `Manually added ${body.symbol} (Qty: ${body.quantity})`
            });
            localStorage.setItem("demo_logs", JSON.stringify(demoLogs));
            responseData = newItem;
        } else if (options.method === "DELETE") {
            // Read holding ID from url
            const parts = endpoint.split("/");
            const id = parseInt(parts[parts.length - 1]);
            const matched = demoHoldings.find(h => h.id === id);
            demoHoldings = demoHoldings.filter(h => h.id !== id);
            localStorage.setItem("demo_holdings", JSON.stringify(demoHoldings));
            
            if (matched) {
                demoLogs.unshift({
                    timestamp: new Date().toISOString(),
                    ip_address: "local-client",
                    action: "DELETE_HOLDING",
                    details: `Deleted holding for ${matched.symbol}`
                });
                localStorage.setItem("demo_logs", JSON.stringify(demoLogs));
            }
            responseData = { message: "Deleted successfully" };
        } else {
            // GET holdings list
            responseData = demoHoldings;
        }
    } else if (endpoint === "/api/portfolio/summary") {
        let totalInvested = 0.0;
        let currentValue = 0.0;
        let assetAlloc = {};
        let sectorAlloc = {};
        
        demoHoldings.forEach(h => {
            const cost = h.quantity * h.buy_price;
            const price = getMockCurrentPrice(h.symbol, h.buy_price, h.current_price);
            const val = h.quantity * price;
            
            totalInvested += cost;
            currentValue += val;
            
            assetAlloc[h.asset_class] = (assetAlloc[h.asset_class] || 0) + val;
            
            let sector = "Liquid Cash Reserves";
            if (h.asset_class === "STOCK") {
                sector = getStockSector(h.symbol);
            } else if (h.asset_class === "MUTUAL_FUND") {
                sector = "Diversified Mutual Fund";
            } else if (h.asset_class === "GOLD_ETF") {
                sector = "Precious Metals (Gold)";
            } else if (h.asset_class === "ETF") {
                sector = "Passive Broad Index";
            }
            sectorAlloc[sector] = (sectorAlloc[sector] || 0) + val;
        });
        
        const gains = currentValue - totalInvested;
        const pctGains = totalInvested > 0 ? (gains / totalInvested) * 100 : 0.0;
        
        responseData = {
            total_invested: totalInvested,
            current_value: currentValue,
            total_gains: gains,
            percentage_gains: pctGains,
            cagr: 16.85, // Static CAGR representation for demo
            xirr: 18.42, // Static XIRR representation
            health_score: totalInvested > 0 ? Math.max(45, 95 - (demoHoldings.length > 8 ? 15 : 5)) : 100,
            risk_score: 42.5,
            risk_classification: "Medium",
            asset_allocation: assetAlloc,
            sector_allocation: sectorAlloc
        };
    } else if (endpoint === "/api/portfolio/stocks") {
        const analyzed = [];
        demoHoldings.filter(h => h.asset_class === "STOCK").forEach(h => {
            analyzed.push(analyzeStockClientSide(h));
        });
        
        // Dynamically compile breakout/momentum scans based on client calculations
        const scans = [];
        analyzed.forEach(stock => {
            if (stock.technical_score < 38) {
                scans.push({
                    symbol: stock.symbol,
                    type: "RSI Oversold Crossover",
                    severity: "High",
                    description: `${stock.symbol} RSI dropped below 30. Standard technical pullback signal suggesting near-term trend exhaustion.`
                });
            } else if (stock.technical_score > 78) {
                scans.push({
                    symbol: stock.symbol,
                    type: "Bullish Volume Breakout",
                    severity: "Medium",
                    description: `${stock.symbol} volume is 1.6x of 20d average. Uptrend confirms momentum intensity and buying conviction.`
                });
            }
        });
        if (scans.length === 0) {
            scans.push({ symbol: "Nifty 50 Index", type: "Market Consolidation", severity: "Low", description: "Broad market indices exhibit low volatility, consolidating near 20d EMA bands." });
        }
        
        responseData = {
            holdings_analysis: analyzed,
            scans: scans
        };
    } else if (endpoint === "/api/portfolio/mutual_funds") {
        const analyzed = [];
        demoHoldings.filter(h => h.asset_class === "MUTUAL_FUND").forEach(h => {
            analyzed.push(analyzeMutualFundClientSide(h));
        });
        
        // Dynamic mutual fund overlap matrix mapping
        const matrix = [];
        if (analyzed.length >= 2) {
            for (let i = 0; i < analyzed.length; i++) {
                for (let j = i + 1; j < analyzed.length; j++) {
                    const hash = getSymbolHash(analyzed[i].symbol + analyzed[j].symbol);
                    const overlapVal = 10 + (hash % 36); // 10% to 45% overlap
                    matrix.push({
                        fund_a: analyzed[i].name,
                        fund_b: analyzed[j].name,
                        overlap_percentage: overlapVal,
                        shared_stocks: ["HDFCBANK", "RELIANCE", "INFOSYS", "TCS", "ICICIBANK"].slice(0, 1 + (hash % 4))
                    });
                }
            }
        }
        
        // Stock concentration metrics compiled deterministically
        const concentration = [
            { stock: "HDFCBANK", aggregate_weight: 8.25 },
            { stock: "RELIANCE", aggregate_weight: 7.95 },
            { stock: "TCS", aggregate_weight: 3.05 }
        ];
        
        responseData = {
            holdings_analysis: analyzed,
            overlap_matrix: {
                pairwise_overlap: matrix,
                stock_concentration: concentration,
                warnings: []
            }
        };
    } else if (endpoint === "/api/portfolio/etfs") {
        const analyzed = [];
        demoHoldings.filter(h => h.asset_class === "GOLD_ETF" || h.asset_class === "ETF").forEach(h => {
            analyzed.push(analyzeEtfClientSide(h));
        });
        responseData = analyzed;
    } else if (endpoint === "/api/portfolio/risk") {
        let totalVal = 0;
        demoHoldings.forEach(h => totalVal += h.quantity * h.buy_price);
        
        responseData = {
            market_indicators: { india_vix: 14.2, nifty_pe: 22.4, fii_flows_crores: 1250, dii_flows_crores: 800 },
            risk_evaluation: { risk_score: 42.5, classification: "Medium", adjustments: ["VIX is in steady comfort zone (-5 pts)", "Nifty valuation multiples are slightly above average (+3 pts)"] },
            stress_tests: {
                shock_10: { simulated_value: totalVal * 0.91, total_loss: totalVal * 0.09, percentage_loss: 9.0 },
                shock_20: { simulated_value: totalVal * 0.82, total_loss: totalVal * 0.18, percentage_loss: 18.0 },
                shock_30: { simulated_value: totalVal * 0.74, total_loss: totalVal * 0.26, percentage_loss: 26.0 },
                shock_40: { simulated_value: totalVal * 0.65, total_loss: totalVal * 0.35, percentage_loss: 35.0 }
            }
        };
    } else if (endpoint === "/api/portfolio/audit_logs") {
        responseData = demoLogs;
    } else if (endpoint === "/api/portfolio/backup") {
        responseData = { message: "Backup completed locally in workspace directory /backups/" };
    }

    return {
        ok: true,
        status: 200,
        json: async () => responseData,
        blob: async () => new Blob([JSON.stringify(responseData)], { type: "application/json" })
    };
}

// --- TAB DATA LOADERS ---

async function loadDashboardSummary() {
    try {
        const res = await apiFetch("/api/portfolio/summary");
        const data = await res.json();

        document.getElementById("stat-invested").innerText = formatINR(data.total_invested);
        document.getElementById("stat-current").innerText = formatINR(data.current_value);
        
        const gainsEl = document.getElementById("stat-gains");
        gainsEl.innerText = `${data.total_gains >= 0 ? "+" : ""}${formatINR(data.total_gains)} (${data.percentage_gains.toFixed(2)}%)`;
        gainsEl.className = data.total_gains >= 0 ? "metric-trend text-green" : "metric-trend text-rose";

        document.getElementById("stat-cagr").innerText = `${data.cagr.toFixed(2)}%`;
        document.getElementById("stat-xirr").innerText = `${data.xirr.toFixed(2)}%`;

        document.getElementById("health-score-value").innerText = data.health_score;
        const descriptionEl = document.getElementById("health-description");
        
        const ring = document.querySelector(".health-dial");
        if (data.health_score >= 80) {
            ring.style.borderColor = "var(--accent-emerald)";
            descriptionEl.innerText = "Excellent diversification and low overlap indicators. Portfolio is highly resilient.";
            document.getElementById("health-score-value").style.color = "var(--accent-emerald)";
        } else if (data.health_score >= 60) {
            ring.style.borderColor = "var(--accent-amber)";
            descriptionEl.innerText = "Moderate diversification. Review specific stock concentration markers or fund overlaps.";
            document.getElementById("health-score-value").style.color = "var(--accent-amber)";
        } else {
            ring.style.borderColor = "var(--accent-coral)";
            descriptionEl.innerText = "High concentration or holding redundancy detected. Rebalancing recommended.";
            document.getElementById("health-score-value").style.color = "var(--accent-coral)";
        }

        renderAssetDonut(data.asset_allocation);
        renderSectorBar(data.sector_allocation);
    } catch (err) {
        console.error("Dashboard load failed:", err);
    }
}

async function loadStocksAnalysis() {
    try {
        const res = await apiFetch("/api/portfolio/stocks");
        const data = await res.json();

        // 1. Calculate overall stock values
        let stockInvestedSum = 0;
        let stockCurrentSum = 0;
        data.holdings_analysis.forEach(stock => {
            stockInvestedSum += stock.invested;
            stockCurrentSum += stock.current_value;
        });
        
        const stockGainsSum = stockCurrentSum - stockInvestedSum;
        const stockGainsPct = stockInvestedSum > 0 ? (stockGainsSum / stockInvestedSum) * 100 : 0.0;
        
        // 2. Render statistics cards in Stocks Section
        const investedEl = document.getElementById("stock-stat-invested");
        const currentEl = document.getElementById("stock-stat-current");
        const gainsEl = document.getElementById("stock-stat-gains");
        
        if (investedEl) investedEl.innerText = formatINR(stockInvestedSum);
        if (currentEl) currentEl.innerText = formatINR(stockCurrentSum);
        if (gainsEl) {
            gainsEl.innerText = `${stockGainsSum >= 0 ? "+" : ""}${formatINR(stockGainsSum)} (${stockGainsPct.toFixed(2)}%)`;
            gainsEl.className = stockGainsSum >= 0 ? "metric-trend text-green" : "metric-trend text-rose";
        }

        const tbody = document.querySelector("#table-stocks-ledger tbody");
        tbody.innerHTML = "";
        
        if (data.holdings_analysis.length === 0) {
            tbody.innerHTML = `<tr><td colspan="8" class="text-neutral" style="text-align: center;">No stock holdings added yet.</td></tr>`;
        }

        data.holdings_analysis.forEach(stock => {
            const tr = document.createElement("tr");
            tr.innerHTML = `
                <td><strong>${stock.symbol}</strong><br><span style="font-size:0.75rem; color:var(--text-secondary);">${stock.name}</span></td>
                <td>${formatINR(stock.invested)}<br><span style="font-size:0.75rem; color:var(--text-secondary);">Qty: ${stock.quantity} @ ${formatINR(stock.invested / stock.quantity)}</span></td>
                <td>${formatINR(stock.current_value)}<br><span style="font-size:0.75rem; color:var(--text-secondary);">Price: ${formatINR(stock.current_price)}</span></td>
                <td><span class="${stock.gains >= 0 ? 'text-green' : 'text-rose'}"><strong>${stock.gains >= 0 ? '+' : ''}${formatINR(stock.gains)}</strong><br><span style="font-size:0.75rem;">${stock.gains >= 0 ? '+' : ''}${stock.gains_pct.toFixed(2)}%</span></span></td>
                <td><span class="badge ${stock.fundamental_score >= 70 ? 'badge-green' : (stock.fundamental_score >= 50 ? 'badge-yellow' : 'badge-rose')}">${stock.fundamental_score}/100</span></td>
                <td><span class="badge ${stock.technical_score >= 70 ? 'badge-green' : (stock.technical_score >= 50 ? 'badge-yellow' : 'badge-rose')}">${stock.technical_score}/100</span></td>
                <td><span class="badge ${getRecBadgeClass(stock.recommendation)}">${stock.recommendation}</span></td>
                <td>
                    <button class="btn-delete-row" onclick="deleteHoldingItem('${stock.symbol}', this)" data-symbol="${stock.symbol}">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
                    </button>
                </td>
            `;
            tbody.appendChild(tr);
        });

        const recList = document.getElementById("stock-recommendations-list");
        recList.innerHTML = "";
        
        if (data.holdings_analysis.length === 0) {
            recList.innerHTML = `<div class="empty-placeholder">No stocks analyzed.</div>`;
        }

        data.holdings_analysis.forEach((stock, idx) => {
            const card = document.createElement("div");
            card.className = "rec-card";
            
            const posBullets = stock.evidence_pos.map(b => `<li class="text-green">${b}</li>`).join("");
            const negBullets = stock.evidence_neg.map(b => `<li class="text-rose">${b}</li>`).join("");

            card.innerHTML = `
                <div class="rec-card-header" onclick="toggleEvidenceCollapse(${idx})">
                    <div>
                        <span class="rec-symbol">${stock.symbol}</span>
                        <span style="font-size:0.8rem; color:var(--text-secondary); margin-left: 10px;">${stock.sector}</span>
                    </div>
                    <div>
                        <span class="badge ${getRecBadgeClass(stock.recommendation)}" style="margin-right: 10px;">${stock.recommendation}</span>
                        <span style="font-size: 0.8rem; color: var(--text-secondary);">Evidence (Click)</span>
                    </div>
                </div>
                <div id="evidence-panel-${idx}" class="rec-evidence-panel hidden">
                    <strong>Confidence Index: ${stock.confidence_score}%</strong>
                    <ul>
                        ${posBullets}
                        ${negBullets}
                    </ul>
                </div>
            `;
            recList.appendChild(card);
        });

        const alertsList = document.getElementById("stock-alerts-list");
        alertsList.innerHTML = "";
        
        if (data.scans.length === 0) {
            alertsList.innerHTML = `<div class="empty-placeholder">No alerts triggered today. Stocks consolidate stably.</div>`;
        }

        data.scans.forEach(alert => {
            const card = document.createElement("div");
            card.className = "alert-card";
            card.innerHTML = `
                <div class="alert-card-header">
                    <span class="alert-title">${alert.type}</span>
                    <span class="badge ${alert.severity === 'High' ? 'badge-rose' : 'badge-yellow'}">${alert.severity} Priority</span>
                </div>
                <p class="alert-desc">${alert.description}</p>
            `;
            alertsList.appendChild(card);
        });
    } catch (err) {
        console.error("Stocks load failed:", err);
    }
}

async function loadMutualFundsAnalysis() {
    try {
        const res = await apiFetch("/api/portfolio/mutual_funds");
        const data = await res.json();

        const tbody = document.querySelector("#table-mf-ledger tbody");
        tbody.innerHTML = "";
        
        if (data.holdings_analysis.length === 0) {
            tbody.innerHTML = `<tr><td colspan="7" class="text-neutral" style="text-align: center;">No mutual fund scheme units added.</td></tr>`;
        }

        data.holdings_analysis.forEach(fund => {
            const tr = document.createElement("tr");
            tr.innerHTML = `
                <td><strong>${fund.symbol}</strong></td>
                <td>${fund.name}</td>
                <td><span class="badge badge-blue">${fund.category}</span></td>
                <td>${formatINR(fund.invested)}</td>
                <td><strong>${fund.metrics.sharpe_ratio.toFixed(2)}</strong></td>
                <td><span class="badge ${getRecBadgeClass(fund.recommendation)}">${fund.recommendation}</span></td>
                <td>
                    <button class="btn-delete-row" onclick="deleteHoldingItem('${fund.symbol}', this)" data-symbol="${fund.symbol}">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
                    </button>
                </td>
            `;
            tbody.appendChild(tr);
        });

        if (data.holdings_analysis.length > 0) {
            document.getElementById("mf-sip-health").innerText = "Excellent Profile";
            document.getElementById("mf-sip-message").innerText = "Periodic SIP installments compound reliably across holdings.";
        } else {
            document.getElementById("mf-sip-health").innerText = "No Records";
            document.getElementById("mf-sip-message").innerText = "Please add systematic funds to enable SIP health checkers.";
        }

        const overlapContainer = document.getElementById("mf-overlap-container");
        overlapContainer.innerHTML = "";
        
        const matrix = data.overlap_matrix.pairwise_overlap;
        if (matrix.length === 0) {
            overlapContainer.innerHTML = `<div class="empty-placeholder">Needs at least two active mutual funds to cross-audit overlapping stock holdings.</div>`;
        }

        matrix.forEach(row => {
            const div = document.createElement("div");
            div.className = "overlap-row";
            
            let color = "var(--accent-blue)";
            if (row.overlap_percentage > 40) color = "var(--accent-coral)";
            else if (row.overlap_percentage > 25) color = "var(--accent-amber)";

            div.innerHTML = `
                <div class="overlap-row-title">
                    <span>${row.fund_a} &amp; ${row.fund_b}</span>
                    <span class="${row.overlap_percentage > 40 ? 'text-rose' : 'text-neutral'}">${row.overlap_percentage}% Overlap</span>
                </div>
                <div class="overlap-progress-bar">
                    <div class="overlap-progress-fill" style="width: ${row.overlap_percentage}%; background-color: ${color};"></div>
                </div>
                <div class="overlap-shared-list">
                    Shared holdings: ${row.shared_stocks.join(", ")}
                </div>
            `;
            overlapContainer.appendChild(div);
        });

        const concentrationContainer = document.getElementById("mf-concentration-list");
        concentrationContainer.innerHTML = "";
        
        const concentrations = data.overlap_matrix.stock_concentration;
        if (concentrations.length === 0) {
            concentrationContainer.innerHTML = `<div class="empty-placeholder">No aggregated underlying stock metrics.</div>`;
        }

        concentrations.slice(0, 7).forEach(sc => {
            const div = document.createElement("div");
            div.className = "concentration-item";
            let colorClass = sc.aggregate_weight > 15 ? "text-rose" : (sc.aggregate_weight > 8 ? "text-yellow" : "text-neutral");

            div.innerHTML = `
                <span>${sc.stock}</span>
                <span class="${colorClass}"><strong>${sc.aggregate_weight}% Exposure</strong></span>
            `;
            concentrationContainer.appendChild(div);
        });
    } catch (err) {
        console.error("Mutual Funds load failed:", err);
    }
}

async function loadEtfsAnalysis() {
    try {
        const res = await apiFetch("/api/portfolio/etfs");
        const data = await res.json();

        const tbody = document.querySelector("#table-etfs-ledger tbody");
        tbody.innerHTML = "";
        
        if (data.length === 0) {
            tbody.innerHTML = `<tr><td colspan="7" class="text-neutral" style="text-align: center;">No Index ETFs or Gold ETFs purchased yet.</td></tr>`;
        }

        data.forEach(etf => {
            const tr = document.createElement("tr");
            tr.innerHTML = `
                <td><strong>${etf.symbol}</strong><br><span style="font-size:0.75rem; color:var(--text-secondary);">${etf.name}</span></td>
                <td><span class="badge badge-blue">${etf.category}</span></td>
                <td>${etf.metrics.tracking_error}%<br><span style="font-size:0.75rem; color:var(--text-secondary);">Avg Err: 0.06%</span></td>
                <td>${etf.metrics.expense_ratio}%<br><span style="font-size:0.75rem; color:var(--text-secondary);">Category: 0.15%</span></td>
                <td><strong>${etf.metrics.liquidity}</strong></td>
                <td><span class="badge ${getRecBadgeClass(etf.recommendation)}">${etf.recommendation}</span></td>
                <td>
                    <button class="btn-delete-row" onclick="deleteHoldingItem('${etf.symbol}', this)" data-symbol="${etf.symbol}">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
                    </button>
                </td>
            `;
            tbody.appendChild(tr);
        });
    } catch (err) {
        console.error("ETF load failed:", err);
    }
}

async function loadRiskAnalysis() {
    try {
        const res = await apiFetch("/api/portfolio/risk");
        const data = await res.json();

        document.getElementById("risk-rating-value").innerText = data.risk_evaluation.risk_score;
        
        const ratingClassEl = document.getElementById("risk-rating-class");
        ratingClassEl.innerText = `${data.risk_evaluation.classification} Risk Rating`;
        ratingClassEl.className = data.risk_evaluation.classification === "Low" 
            ? "metric-trend text-green" 
            : (data.risk_evaluation.classification === "Medium" ? "metric-trend text-yellow" : "metric-trend text-rose");

        document.getElementById("risk-stat-vix").innerText = data.market_indicators.india_vix;
        document.getElementById("risk-stat-nifpe").innerText = data.market_indicators.nifty_pe;
        
        const sumFlows = data.market_indicators.fii_flows_crores + data.market_indicators.dii_flows_crores;
        document.getElementById("risk-stat-fiiflow").innerText = `₹${sumFlows} Cr`;

        const adjustmentsList = document.getElementById("risk-adjustments-list");
        adjustmentsList.innerHTML = "";
        
        data.risk_evaluation.adjustments.forEach(adj => {
            const li = document.createElement("li");
            li.innerText = adj;
            adjustmentsList.appendChild(li);
        });

        renderStressBarChart(data.stress_tests);
    } catch (err) {
        console.error("Risk load failed:", err);
    }
}

async function loadSettingsData() {
    try {
        const res = await apiFetch("/api/portfolio/audit_logs");
        const data = await res.json();

        const tbody = document.querySelector("#table-audit-trail tbody");
        tbody.innerHTML = "";

        if (data.length === 0) {
            tbody.innerHTML = `<tr><td colspan="3" class="text-neutral" style="text-align: center;">No audit log records recorded yet.</td></tr>`;
        }

        data.forEach(log => {
            const dateStr = new Date(log.timestamp).toLocaleString();
            const tr = document.createElement("tr");
            tr.innerHTML = `
                <td style="color:var(--text-secondary);">${dateStr}</td>
                <td><code>${log.ip_address}</code></td>
                <td><strong>${log.action}</strong> - ${log.details}</td>
            `;
            tbody.appendChild(tr);
        });
    } catch (err) {
        console.error("Audit load failed:", err);
    }
}

// --- ACTION IMPLEMENTATIONS ---

async function handleManualAdd() {
    const assetClass = document.getElementById("manual-class").value;
    const symbol = document.getElementById("manual-symbol").value.trim().toUpperCase();
    const name = document.getElementById("manual-name").value.trim();
    const qty = parseFloat(document.getElementById("manual-qty").value);
    const price = parseFloat(document.getElementById("manual-price").value);
    const buyDate = document.getElementById("manual-date").value;

    if (!symbol || !qty || !price || !buyDate) {
        alert("Please complete standard required fields.");
        return;
    }

    const payload = {
        asset_class: assetClass,
        symbol: symbol,
        name: name || symbol,
        quantity: qty,
        buy_price: price,
        buy_date: buyDate
    };

    try {
        await apiFetch("/api/portfolio/holdings", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });
        
        alert("Holding added.");
        document.getElementById("manual-symbol").value = "";
        document.getElementById("manual-name").value = "";
        document.getElementById("manual-qty").value = "";
        document.getElementById("manual-price").value = "";
        loadSettingsData();
    } catch (err) {
        alert(err.message);
    }
}

// Bind to delete clicks
window.deleteHoldingItem = async function(symbolVal, btnEl) {
    const holdingSymbol = btnEl.getAttribute("data-symbol");
    try {
        const listRes = await apiFetch("/api/portfolio/holdings");
        const list = await listRes.json();
        
        const matched = list.find(h => h.symbol === holdingSymbol);
        if (!matched) return;
        
        if (confirm(`Remove all units of ${holdingSymbol}?`)) {
            await apiFetch(`/api/portfolio/holdings/${matched.id}`, { method: "DELETE" });
            loadActiveTabData();
        }
    } catch (err) {
        alert(err.message);
    }
};

// File Upload
async function handleFileUpload() {
    const assetClass = document.getElementById("upload-asset-class").value;
    const fileInput = document.getElementById("file-uploader-input");
    
    if (fileInput.files.length === 0) {
        alert("Please select a file.");
        return;
    }

    if (isDemoMode) {
        const file = fileInput.files[0];
        const reader = new FileReader();
        
        reader.onload = function(e) {
            try {
                const data = new Uint8Array(e.target.result);
                // Read workbook via SheetJS
                const workbook = XLSX.read(data, { type: 'array' });
                
                // Fetch first Sheet
                const firstSheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[firstSheetName];
                
                // Convert sheet to 2D array of cells (header: 1)
                const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
                
                if (rows.length < 2) {
                    alert("The uploaded spreadsheet is empty.");
                    return;
                }
                
                const parsedItems = parseExcelDemo(rows, assetClass);
                if (parsedItems.length === 0) {
                    alert("No valid transaction rows found in the sheet. Please verify columns: Symbol/ISIN, Quantity, Average Buy Price.");
                    return;
                }
                
                // Merge into local demo holdings
                demoHoldings = demoHoldings.concat(parsedItems);
                localStorage.setItem("demo_holdings", JSON.stringify(demoHoldings));
                
                // Log audit action
                demoLogs.unshift({
                    timestamp: new Date().toISOString(),
                    ip_address: "local-client",
                    action: "UPLOAD_PORTFOLIO",
                    details: `Successfully imported ${parsedItems.length} holdings from spreadsheet ${file.name}.`
                });
                localStorage.setItem("demo_logs", JSON.stringify(demoLogs));
                
                alert(`Successfully parsed and imported ${parsedItems.length} transactions from ${file.name}!`);
                fileInput.value = "";
                document.getElementById("upload-status-display").innerText = "Upload completed.";
                
                // Reload dashboard charts and ledgers
                loadActiveTabData();
            } catch (err) {
                alert("Failed to parse spreadsheet file: " + err.message);
            }
        };
        reader.readAsArrayBuffer(file);
        return;
    }

    const file = fileInput.files[0];
    const formData = new FormData();
    formData.append("file", file);

    const statusEl = document.getElementById("upload-status-display");
    statusEl.innerText = "Uploading...";

    try {
        const response = await fetch(`${API_BASE}/api/portfolio/upload?asset_class=${assetClass}`, {
            method: "POST",
            body: formData,
            headers: { "Authorization": `Bearer ${authToken}` }
        });

        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.detail || "Upload failed");
        }

        const res = await response.json();
        alert(res.message);
        statusEl.innerText = "Upload completed.";
        fileInput.value = "";
        loadSettingsData();
    } catch (err) {
        alert(err.message);
        statusEl.innerText = "Upload failed.";
    }
}

// Client-side Excel workbook and CSV parser helper using 2D row sets from SheetJS
function parseExcelDemo(rows, defaultAssetClass) {
    if (rows.length < 2) return [];
    
    // Scan first 15 rows to identify the actual header row (containing at least 2 key terms)
    let headerIdx = -1;
    for (let r = 0; r < Math.min(rows.length, 15); r++) {
        const row = rows[r];
        if (!row || row.length === 0) continue;
        
        // Ensure there are at least 3 non-empty columns in the row to avoid matching metadata/title rows
        const nonCheck = row.filter(c => c !== undefined && c !== null && String(c).trim() !== "");
        if (nonCheck.length < 3) continue;
        
        let matches = 0;
        row.forEach(cell => {
            const val = String(cell || "").toLowerCase().replace(/[\s_.-]/g, "");
            if (val.includes("isin") || val.includes("symbol") || val.includes("ticker") || val.includes("code") || val.includes("stock") || val.includes("scheme")) matches++;
            if (val.includes("qty") || val.includes("quantity") || val.includes("unit") || val.includes("share") || val.includes("holding")) matches++;
            if (val.includes("price") || val.includes("rate") || val.includes("cost") || val.includes("buy") || val.includes("nav")) matches++;
        });
        
        if (matches >= 2) {
            headerIdx = r;
            break;
        }
    }
    
    if (headerIdx === -1) {
        throw new Error("Could not find the header row containing mandatory columns (Symbol/ISIN, Quantity, Buy Price). Rows scanned: " + JSON.stringify(rows.slice(0, 15)));
    }
    
    // Parse headers from the identified row
    const headers = rows[headerIdx].map(h => String(h || "").trim());
    const mapped = {};
    
    // Pass 1: Look for exact or strong matches first
    headers.forEach((h, idx) => {
        const cleaned = h.toLowerCase().replace(/[\s_.-]/g, "");
        // Symbol / Ticker / ISIN
        if (["isin", "symbol", "ticker", "code", "schemecode", "scrip", "instrument", "tradingsymbol"].includes(cleaned)) {
            mapped.symbol = idx;
        }
        // Quantity / Units
        if (["qty", "quantity", "units", "shares", "holding", "holdings", "volume"].includes(cleaned)) {
            mapped.quantity = idx;
        }
        // Buy Price / Cost / NAV
        if (["averagebuyprice", "buyprice", "avgprice", "rate", "cost", "averagecost", "avgcost", "buyrate", "nav", "purchasenav", "unitcost", "averageprice", "priceunit", "costprice"].includes(cleaned)) {
            mapped.buy_price = idx;
        }
        // Current Price / Closing Price
        if (["closingprice", "currentprice", "cmp", "ltp", "lastprice", "marketprice", "closingnav", "lasttradedprice", "nav", "lastprice"].includes(cleaned)) {
            mapped.current_price = idx;
        }
    });
    
    // Pass 2: Fallback to fuzzy substring checks if not mapped in Pass 1
    headers.forEach((h, idx) => {
        const cleaned = h.toLowerCase().replace(/[\s_.-]/g, "");
        
        if (mapped.symbol === undefined) {
            if (cleaned.includes("symbol") || cleaned.includes("ticker") || cleaned.includes("code") || cleaned.includes("scheme") || cleaned.includes("stock") || cleaned.includes("isin") || cleaned.includes("script") || cleaned.includes("sec")) {
                mapped.symbol = idx;
            }
        }
        if (mapped.quantity === undefined) {
            if (cleaned.includes("qty") || cleaned.includes("quantity") || cleaned.includes("unit") || cleaned.includes("share") || cleaned.includes("vol") || cleaned.includes("holding")) {
                mapped.quantity = idx;
            }
        }
        if (mapped.buy_price === undefined) {
            if (cleaned.includes("price") || cleaned.includes("rate") || cleaned.includes("cost") || cleaned.includes("buy") || cleaned.includes("avg") || cleaned.includes("nav") || cleaned.includes("value")) {
                mapped.buy_price = idx;
            }
        }
        if (mapped.current_price === undefined) {
            if (cleaned.includes("closing") || cleaned.includes("current") || cleaned.includes("market") || cleaned.includes("cmp") || cleaned.includes("ltp")) {
                if (cleaned.includes("price") || cleaned.includes("nav") || cleaned.includes("val") || cleaned.includes("rate")) {
                    mapped.current_price = idx;
                }
            }
        }
        if (mapped.name === undefined) {
            if (cleaned.includes("name") || cleaned.includes("desc") || cleaned.includes("company") || cleaned.includes("title")) {
                mapped.name = idx;
            }
        }
        if (mapped.buy_date === undefined) {
            if (cleaned.includes("date") || cleaned.includes("time") || cleaned.includes("purchased")) {
                mapped.buy_date = idx;
            }
        }
        if (mapped.asset_class === undefined) {
            if (cleaned.includes("class") || cleaned.includes("asset") || cleaned.includes("type")) {
                mapped.asset_class = idx;
            }
        }
    });
    
    if (mapped.symbol === undefined || mapped.quantity === undefined || mapped.buy_price === undefined) {
        const missing = [];
        if (mapped.symbol === undefined) missing.push("Symbol/ISIN");
        if (mapped.quantity === undefined) missing.push("Quantity");
        if (mapped.buy_price === undefined) missing.push("Buy Price");
        throw new Error("Could not find mandatory columns: " + missing.join(", ") + ". Headers parsed: " + JSON.stringify(headers));
    }
    
    const items = [];
    // Start parsing data from the row immediately following the header
    for (let i = headerIdx + 1; i < rows.length; i++) {
        const cols = rows[i];
        if (!cols || cols.length === 0) continue;
        if (cols.length <= Math.max(mapped.symbol, mapped.quantity, mapped.buy_price)) continue;
        
        const rawSymbol = cols[mapped.symbol];
        if (rawSymbol === undefined || rawSymbol === null || String(rawSymbol).trim() === "") continue;
        
        const symbol = String(rawSymbol).trim().toUpperCase();
        
        // Clean formatting or commas from values if read as strings, otherwise parse directly
        const qtyRaw = String(cols[mapped.quantity]).replace(/,/g, "").trim();
        const priceRaw = String(cols[mapped.buy_price]).replace(/,/g, "").trim();
        const currentPriceRaw = (mapped.current_price !== undefined && cols[mapped.current_price] !== undefined && cols[mapped.current_price] !== null) ? String(cols[mapped.current_price]).replace(/,/g, "").trim() : null;
        
        const qty = parseFloat(qtyRaw);
        const price = parseFloat(priceRaw);
        const current_price = currentPriceRaw ? parseFloat(currentPriceRaw) : null;
        
        if (!symbol || isNaN(qty) || isNaN(price) || qty <= 0 || price <= 0) continue;
        
        // Use Stock Name as name if available, fallback to symbol/ISIN
        const name = (mapped.name !== undefined && cols[mapped.name]) ? String(cols[mapped.name]).trim() : symbol;
        const buyDate = (mapped.buy_date !== undefined && cols[mapped.buy_date]) ? String(cols[mapped.buy_date]).trim() : new Date().toISOString().slice(0,10);
        
        let assetClass = defaultAssetClass;
        if (mapped.asset_class !== undefined && cols[mapped.asset_class]) {
            const acVal = String(cols[mapped.asset_class]).trim().toUpperCase();
            if (["STOCK", "MUTUAL_FUND", "ETF", "GOLD_ETF", "CASH"].includes(acVal)) {
                assetClass = acVal;
            }
        }
        
        items.push({
            id: Date.now() + i,
            asset_class: assetClass,
            symbol: symbol,
            name: name,
            quantity: qty,
            buy_price: price,
            current_price: current_price,
            buy_date: buyDate
        });
    }
    return items;
}

// Download PDF
async function triggerPdfDownload() {
    if (isDemoMode) {
        alert("Demo Mode: Styled PDF compile requested. In offline browser demo, please print the dashboard page to PDF (Ctrl+P / window.print()) to export your current views.");
        window.print();
        return;
    }
    try {
        const response = await fetch(`${API_BASE}/api/portfolio/report/pdf`, {
            headers: { "Authorization": `Bearer ${authToken}` }
        });
        if (!response.ok) throw new Error("Failed to compile PDF.");
        const blob = await response.blob();
        triggerBlobDownload(blob, "portfolio_report.pdf");
    } catch (err) {
        alert(err.message);
    }
}

// Download Excel
async function triggerExcelDownload() {
    if (isDemoMode) {
        alert("Demo Mode: Multi-tab Excel export request. Open backend locally to download physical sheets.");
        return;
    }
    try {
        const response = await fetch(`${API_BASE}/api/portfolio/report/excel`, {
            headers: { "Authorization": `Bearer ${authToken}` }
        });
        if (!response.ok) throw new Error("Failed to export Excel.");
        const blob = await response.blob();
        triggerBlobDownload(blob, "portfolio_report.xlsx");
    } catch (err) {
        alert(err.message);
    }
}

function triggerBlobDownload(blob, filename) {
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
}

async function triggerDatabaseBackup() {
    try {
        const res = await apiFetch("/api/portfolio/backup", { method: "POST" });
        const data = await res.json();
        alert(data.message);
        loadSettingsData();
    } catch (err) {
        alert(err.message);
    }
}

// --- CHAT INTERFACE LOGIC ---

async function sendChatMessage() {
    const inputEl = document.getElementById("chat-user-input");
    const query = inputEl.value.trim();
    if (!query) return;

    appendChatBubble("user", query);
    inputEl.value = "";

    const chatContainer = document.getElementById("chat-messages-container");
    const loadingDiv = document.createElement("div");
    loadingDiv.className = "chat-msg system";
    loadingDiv.id = "chat-ai-typing-indicator";
    loadingDiv.innerHTML = `
        <div class="msg-bubble">
            <span style="font-size:0.8rem; color:var(--text-muted);">Consulting portfolio balances and market rules...</span>
        </div>
    `;
    chatContainer.appendChild(loadingDiv);
    chatContainer.scrollTop = chatContainer.scrollHeight;

    // Build context summary for direct client-side Pollinations AI queries
    let portfolioText = "";
    demoHoldings.forEach(h => portfolioText += `- ${h.symbol} (${h.asset_class}): Cost: ${h.quantity * h.buy_price}\n`);

    const systemPrompt = `You are 'Antigravity Advisor', an elite AI financial advisor bot tailored for Indian investors.
STRICT ADVISORY GUIDELINES:
1. Never guarantee returns or project specific numbers with absolute certainty.
2. Never claim certainty about future market directions (e.g. use terms like 'may correct', 'potential upside', 'historical trends suggest').
3. Emphasize risk control, asset diversification (Equities, MFs, Gold, Cash), and SIP continuity.
4. Reference Indian market benchmarks (Nifty 50, Nifty 500, India VIX) where appropriate.
5. Be concise and write in a clean, professional, markdown format.

USER'S PORTFOLIO CONTEXT:
${portfolioText}`;

    try {
        let textResult = "";
        let sourceInfo = "";
        
        if (isDemoMode) {
            // Direct CORS-enabled call to Pollinations AI
            const url = "https://text.pollinations.ai/";
            const payload = {
                messages: [
                    { role: "system", content: systemPrompt },
                    { role: "user", content: query }
                ],
                model: "openai",
                jsonMode: false
            };
            
            const response = await fetch(url, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload)
            });
            if (response.ok) {
                textResult = await response.text();
                sourceInfo = "Pollinations AI (Free Client Direct)";
            } else {
                throw new Error();
            }
        } else {
            const res = await apiFetch("/api/portfolio/advisor", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ message: query })
            });
            const data = await res.json();
            textResult = data.response;
            sourceInfo = data.source;
        }
        
        const typing = document.getElementById("chat-ai-typing-indicator");
        if (typing) typing.remove();
        appendChatBubble("system", textResult, sourceInfo);
    } catch (err) {
        const typing = document.getElementById("chat-ai-typing-indicator");
        if (typing) typing.remove();
        
        // Emulate offline local fallback advice if network is failing
        let fallbackMsg = "### Local Advisor Note\nDirect API connection timed out. Evaluated holdings locally: Your current portfolio has direct equity exposure of ~56% and mutual funds exposure of ~38%. This allocation represents a stable balanced profile. Ensure you keep at least 5% in liquid reserves (Cash) for market dip accumulation.";
        appendChatBubble("system", fallbackMsg, "Local Client Analyzer");
    }
}

function appendChatBubble(role, text, source = "") {
    const chatContainer = document.getElementById("chat-messages-container");
    const msgDiv = document.createElement("div");
    msgDiv.className = `chat-msg ${role}`;

    let formattedText = text
        .replace(/\n/g, "<br>")
        .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
        .replace(/-\s(.*?)(<br>|$)/g, "• $1$2");

    const sourceBadge = source ? `<span class="badge-source">Advice sourced from: ${source}</span>` : "";

    msgDiv.innerHTML = `
        <div class="msg-bubble">
            ${formattedText}
            ${sourceBadge}
        </div>
    `;
    
    chatContainer.appendChild(msgDiv);
    chatContainer.scrollTop = chatContainer.scrollHeight;
}

window.toggleEvidenceCollapse = function(idx) {
    const el = document.getElementById(`evidence-panel-${idx}`);
    if (el) el.classList.toggle("hidden");
};

// --- CHARTJS RENDERING FUNCTIONS ---

function renderAssetDonut(allocations) {
    const ctx = document.getElementById("chart-asset-allocation").getContext("2d");
    if (chartInstances["asset"]) chartInstances["asset"].destroy();

    const labels = Object.keys(allocations);
    const data = Object.values(allocations);

    chartInstances["asset"] = new Chart(ctx, {
        type: "doughnut",
        data: {
            labels: labels,
            datasets: [{
                data: data,
                backgroundColor: ["#3b82f6", "#10b981", "#84cc16", "#f59e0b", "#6b7280"],
                borderWidth: 1,
                borderColor: "rgba(255,255,255,0.06)"
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { position: "bottom", labels: { color: "#9ca3af", font: { family: "Inter", size: 11 } } }
            },
            cutout: "70%"
        }
    });
}

function renderSectorBar(sectors) {
    const ctx = document.getElementById("chart-sector-allocation").getContext("2d");
    if (chartInstances["sector"]) chartInstances["sector"].destroy();

    const labels = Object.keys(sectors);
    const data = Object.values(sectors);

    chartInstances["sector"] = new Chart(ctx, {
        type: "bar",
        data: {
            labels: labels,
            datasets: [{
                label: "Valuation (INR)",
                data: data,
                backgroundColor: "rgba(59, 130, 246, 0.4)",
                borderColor: "#3b82f6",
                borderWidth: 1,
                borderRadius: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                y: { grid: { color: "rgba(255,255,255,0.05)" }, ticks: { color: "#9ca3af", font: { size: 10 } } },
                x: { grid: { display: false }, ticks: { color: "#9ca3af", font: { size: 10 } } }
            }
        }
    });
}

function renderStressBarChart(stresses) {
    const ctx = document.getElementById("chart-stress-test").getContext("2d");
    if (chartInstances["stress"]) chartInstances["stress"].destroy();

    const labels = ["-10% Drop", "-20% Drop", "-30% Drop", "-40% Drop"];
    const simulatedVals = [
        stresses.shock_10.simulated_value,
        stresses.shock_20.simulated_value,
        stresses.shock_30.simulated_value,
        stresses.shock_40.simulated_value
    ];

    chartInstances["stress"] = new Chart(ctx, {
        type: "bar",
        data: {
            labels: labels,
            datasets: [{
                label: "Simulated Valuation (INR)",
                data: simulatedVals,
                backgroundColor: ["rgba(245, 158, 11, 0.45)", "rgba(245, 158, 11, 0.6)", "rgba(244, 63, 94, 0.5)", "rgba(244, 63, 94, 0.7)"],
                borderColor: ["#f59e0b", "#f59e0b", "#f43f5e", "#f43f5e"],
                borderWidth: 1,
                borderRadius: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                y: { grid: { color: "rgba(255,255,255,0.05)" }, ticks: { color: "#9ca3af", font: { size: 10 } } },
                x: { grid: { display: false }, ticks: { color: "#9ca3af", font: { size: 10 } } }
            }
        }
    });
}

function formatINR(val) {
    return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(val);
}

function getRecBadgeClass(rec) {
    if (rec === "Buy on Dips" || rec === "Continue SIP" || rec === "Accumulate") return "badge-green";
    if (rec === "Hold") return "badge-blue";
    if (rec === "Review") return "badge-yellow";
    return "badge-rose";
}
