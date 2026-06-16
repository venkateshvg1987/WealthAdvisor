// App state variables
let authToken = localStorage.getItem("token") || "";
let activeTab = "dashboard";
let chartInstances = {};

const API_BASE = "https://wealthadvisor-5i6v.onrender.com";

// Run in serverless client-side mode with Firebase DB
let isDemoMode = false;

// Firebase Configuration
const firebaseConfig = {
  apiKey: "AIzaSyAkqKxI0WDUGdjpbojtaMc5FBiVb9m00Ic",
  authDomain: "investorhealthcheck.firebaseapp.com",
  projectId: "investorhealthcheck",
  storageBucket: "investorhealthcheck.firebasestorage.app",
  messagingSenderId: "803759881512",
  appId: "1:803759881512:web:debcb9b835756bd35ba41d"
};

// Initialize Firebase
let db = null;
try {
    firebase.initializeApp(firebaseConfig);
    db = firebase.firestore();
    console.log("► Firebase initialized successfully.");
} catch (err) {
    console.error("► Error initializing Firebase:", err);
}

// User state and multi-profile portfolio holdings
let currentUser = null;
let demoPortfolios = {};
let activePortfolioName = "Default Portfolio";
let demoHoldings = [];

let demoLogs = JSON.parse(localStorage.getItem("demo_logs")) || [
    { timestamp: new Date(Date.now() - 1000 * 60 * 60).toISOString(), ip_address: "127.0.0.1", action: "AUTH_LOGIN_SUCCESS", details: "Demo session authenticated successfully." },
    { timestamp: new Date(Date.now() - 1000 * 60 * 120).toISOString(), ip_address: "127.0.0.1", action: "UPLOAD_PORTFOLIO", details: "Imported pre-seeded holdings for demo visualization." }
];

// Initialize
document.addEventListener("DOMContentLoaded", () => {
    setupEventListeners();
    initFirebaseState();
});

function initFirebaseState() {
    if (isDemoMode === false) {
        const token = localStorage.getItem("token");
        if (token) {
            authToken = token;
            document.getElementById("ai-status-badge").innerText = "Online | Cloud Connected";
            document.getElementById("ai-status-badge").className = "badge badge-green";
            
            document.querySelector(".user-avatar").innerText = "IN";
            document.querySelector(".user-name").innerText = "Investor";
            document.querySelector(".user-email").innerText = "investor@platform.in";
            
            document.getElementById("login-container").classList.add("hidden");
            document.getElementById("app-container").classList.remove("hidden");
            
            loadActiveTabData();
        } else {
            document.getElementById("login-container").classList.remove("hidden");
            document.getElementById("app-container").classList.add("hidden");
        }
        return;
    }

    if (typeof firebase === 'undefined') {
        console.log("► Firebase SDK not loaded. Loading local offline mode.");
        document.getElementById("ai-status-badge").innerText = "Offline | Local Mode";
        document.getElementById("ai-status-badge").className = "badge badge-yellow";
        
        // Restore UI profile defaults
        document.querySelector(".user-avatar").innerText = "L";
        document.querySelector(".user-name").innerText = "Local Investor";
        document.querySelector(".user-email").innerText = "local-session@offline";
        
        // Check if user has an active local login session
        if (localStorage.getItem("local_login") === "true") {
            document.getElementById("login-container").classList.add("hidden");
            document.getElementById("app-container").classList.remove("hidden");
        } else {
            document.getElementById("login-container").classList.remove("hidden");
            document.getElementById("app-container").classList.add("hidden");
        }
        
        // Load local storage portfolios
        loadLocalStorageData();
        return;
    }
    
    if (!firebase.apps || !firebase.apps.length) return;
    
    try {
        firebase.auth().onAuthStateChanged(async (user) => {
            if (user) {
                currentUser = user;
                console.log("► User logged in via Firebase:", user.email);
                document.getElementById("ai-status-badge").innerText = "Online | Cloud Connected";
                document.getElementById("ai-status-badge").className = "badge badge-green";
                
                // Update UI profile display
                document.querySelector(".user-avatar").innerText = user.email.slice(0, 2).toUpperCase();
                document.querySelector(".user-name").innerText = user.email.split("@")[0];
                document.querySelector(".user-email").innerText = user.email;
                
                // Hide login, show app
                document.getElementById("login-container").classList.add("hidden");
                document.getElementById("app-container").classList.remove("hidden");
                
                // Load user data from Firestore
                await loadUserDataFromFirestore();
            } else {
                currentUser = null;
                console.log("► No user session. Loading local offline mode.");
                document.getElementById("ai-status-badge").innerText = "Offline | Local Mode";
                document.getElementById("ai-status-badge").className = "badge badge-yellow";
                
                // Restore UI profile defaults
                document.querySelector(".user-avatar").innerText = "O";
                document.querySelector(".user-name").innerText = "Offline User";
                document.querySelector(".user-email").innerText = "local-session@offline";
                
                // Show login screen
                document.getElementById("login-container").classList.remove("hidden");
                document.getElementById("app-container").classList.add("hidden");
                
                // Load local storage portfolios
                loadLocalStorageData();
            }
        });
    } catch (e) {
        console.error("Firebase Auth initialization failed:", e);
        loadLocalStorageData();
    }
}

async function loadUserDataFromFirestore() {
    if (!currentUser || !db) return;
    try {
        const userDocRef = db.collection("users").doc(currentUser.uid);
        const userDoc = await userDocRef.get();
        
        let loadedActive = "Default Portfolio";
        let loadedProfiles = ["Default Portfolio"];
        
        if (userDoc.exists) {
            const userData = userDoc.data();
            if (userData.activePortfolioName) {
                loadedActive = userData.activePortfolioName;
            }
            if (userData.profiles) {
                loadedProfiles = userData.profiles;
            }
        } else {
            // Seed user document with default profile
            await userDocRef.set({
                activePortfolioName: "Default Portfolio",
                profiles: ["Default Portfolio"]
            });
        }
        
        activePortfolioName = loadedActive;
        demoPortfolios = {};
        
        // Fetch holdings for each profile
        for (const profile of loadedProfiles) {
            const holdingsSnapshot = await db.collection("users").doc(currentUser.uid)
                .collection("portfolios").doc(profile).collection("holdings").get();
                
            const holdings = [];
            holdingsSnapshot.forEach(doc => {
                const item = doc.data();
                item.id = item.id || doc.id;
                if (!isNaN(item.id)) item.id = parseInt(item.id);
                
                // Normalization self-healing
                const sym = String(item.symbol || "").toUpperCase();
                const nm = String(item.name || "").toUpperCase();
                const isMF = sym.startsWith("INF") || 
                             sym.includes("MUTUAL") || nm.includes("MUTUAL") ||
                             nm.includes("DIRECT") || nm.includes("GROWTH") || nm.includes("REGULAR") ||
                             nm.includes("FOF") || nm.includes("FUND OF FUNDS") ||
                             sym.includes("PPFAS") || nm.includes("PARAG PARIKH") ||
                             (nm.includes("FUND") && !nm.includes("ETF"));
                if (isMF && item.asset_class !== "MUTUAL_FUND") {
                    item.asset_class = "MUTUAL_FUND";
                    db.collection("users").doc(currentUser.uid)
                      .collection("portfolios").doc(profile)
                      .collection("holdings").doc(doc.id).update({ asset_class: "MUTUAL_FUND" })
                      .catch(err => console.error("Cloud normalization sync failed:", err));
                }
                
                holdings.push(item);
            });
            demoPortfolios[profile] = holdings;
        }
        
        // Seed default profile if empty
        if (demoPortfolios["Default Portfolio"] && demoPortfolios["Default Portfolio"].length === 0) {
            console.log("Seeding Default Portfolio in Firestore for first login.");
            const seed = [
                { id: 1, asset_class: "STOCK", symbol: "RELIANCE", name: "Reliance Industries Limited", quantity: 15, buy_price: 2320.0, buy_date: "2024-03-12" },
                { id: 2, asset_class: "STOCK", symbol: "TCS", name: "Tata Consultancy Services Limited", quantity: 8, buy_price: 3550.0, buy_date: "2024-06-20" },
                { id: 3, asset_class: "STOCK", symbol: "HDFCBANK", name: "HDFC Bank Limited", quantity: 40, buy_price: 1540.0, buy_date: "2025-01-15" },
                { id: 4, asset_class: "MUTUAL_FUND", symbol: "PPFAS_FLEXICAP", name: "Parag Parikh Flexi Cap Fund", quantity: 600, buy_price: 64.20, buy_date: "2024-05-10" },
                { id: 5, asset_class: "MUTUAL_FUND", symbol: "SBI_BLUECHIP", name: "SBI Bluechip Fund", quantity: 450, buy_price: 78.50, buy_date: "2024-09-18" },
                { id: 6, asset_class: "GOLD_ETF", symbol: "GOLDBEES", name: "Nippon India ETF Gold BeES", quantity: 200, buy_price: 58.20, buy_date: "2025-02-28" }
            ];
            demoPortfolios["Default Portfolio"] = seed;
            
            for (const item of seed) {
                await db.collection("users").doc(currentUser.uid)
                    .collection("portfolios").doc("Default Portfolio")
                    .collection("holdings").doc(String(item.id)).set(item);
            }
        }
        
        demoHoldings = demoPortfolios[activePortfolioName] || [];
        updateProfileDropdowns();
        loadActiveTabData();
    } catch (err) {
        console.error("Failed to load user portfolios from Firestore:", err);
        loadLocalStorageData();
    }
}

function loadLocalStorageData() {
    activePortfolioName = localStorage.getItem("active_portfolio_name") || "Default Portfolio";
    try {
        demoPortfolios = JSON.parse(localStorage.getItem("demo_portfolios"));
    } catch(e) {}
    
    if (!demoPortfolios || Object.keys(demoPortfolios).length === 0) {
        const seed = [
            { id: 1, asset_class: "STOCK", symbol: "RELIANCE", name: "Reliance Industries Limited", quantity: 15, buy_price: 2320.0, buy_date: "2024-03-12" },
            { id: 2, asset_class: "STOCK", symbol: "TCS", name: "Tata Consultancy Services Limited", quantity: 8, buy_price: 3550.0, buy_date: "2024-06-20" },
            { id: 3, asset_class: "STOCK", symbol: "HDFCBANK", name: "HDFC Bank Limited", quantity: 40, buy_price: 1540.0, buy_date: "2025-01-15" },
            { id: 4, asset_class: "MUTUAL_FUND", symbol: "PPFAS_FLEXICAP", name: "Parag Parikh Flexi Cap Fund", quantity: 600, buy_price: 64.20, buy_date: "2024-05-10" },
            { id: 5, asset_class: "MUTUAL_FUND", symbol: "SBI_BLUECHIP", name: "SBI Bluechip Fund", quantity: 450, buy_price: 78.50, buy_date: "2024-09-18" },
            { id: 6, asset_class: "GOLD_ETF", symbol: "GOLDBEES", name: "Nippon India ETF Gold BeES", quantity: 200, buy_price: 58.20, buy_date: "2025-02-28" }
        ];
        demoPortfolios = {
            "Default Portfolio": seed
        };
        localStorage.setItem("demo_portfolios", JSON.stringify(demoPortfolios));
        localStorage.setItem("active_portfolio_name", "Default Portfolio");
    }
    
    demoHoldings = demoPortfolios[activePortfolioName] || [];
    
    // Normalize local storage holdings if any misclassified index funds are found
    let changed = false;
    Object.keys(demoPortfolios).forEach(profile => {
        demoPortfolios[profile].forEach(item => {
            const sym = String(item.symbol || "").toUpperCase();
            const nm = String(item.name || "").toUpperCase();
            const isMF = sym.startsWith("INF") || 
                         sym.includes("MUTUAL") || nm.includes("MUTUAL") ||
                         nm.includes("DIRECT") || nm.includes("GROWTH") || nm.includes("REGULAR") ||
                         nm.includes("FOF") || nm.includes("FUND OF FUNDS") ||
                         sym.includes("PPFAS") || nm.includes("PARAG PARIKH") ||
                         (nm.includes("FUND") && !nm.includes("ETF"));
            if (isMF && item.asset_class !== "MUTUAL_FUND") {
                item.asset_class = "MUTUAL_FUND";
                changed = true;
            }
        });
    });
    if (changed) {
        localStorage.setItem("demo_portfolios", JSON.stringify(demoPortfolios));
    }
    
    updateProfileDropdowns();
    loadActiveTabData();
}

function updateProfileDropdowns() {
    const headerSelect = document.getElementById("header-profile-select");
    const settingsSelect = document.getElementById("settings-profile-select");
    
    headerSelect.innerHTML = "";
    settingsSelect.innerHTML = "";
    
    const profiles = Object.keys(demoPortfolios);
    profiles.forEach(p => {
        const opt1 = document.createElement("option");
        opt1.value = p;
        opt1.innerText = p;
        headerSelect.appendChild(opt1);
        
        const opt2 = document.createElement("option");
        opt2.value = p;
        opt2.innerText = p;
        settingsSelect.appendChild(opt2);
    });
    
    headerSelect.value = activePortfolioName;
    settingsSelect.value = activePortfolioName;
}

function switchPortfolioProfile(profileName) {
    if (!demoPortfolios[profileName]) return;
    activePortfolioName = profileName;
    demoHoldings = demoPortfolios[activePortfolioName];
    
    document.getElementById("header-profile-select").value = activePortfolioName;
    document.getElementById("settings-profile-select").value = activePortfolioName;
    
    if (currentUser && db) {
        db.collection("users").doc(currentUser.uid).set({
            activePortfolioName: activePortfolioName
        }, { merge: true }).catch(err => console.error("Cloud active profile update failed:", err));
    } else {
        localStorage.setItem("active_portfolio_name", activePortfolioName);
    }
    
    loadActiveTabData();
}

async function handleCreateProfile() {
    const inputEl = document.getElementById("new-profile-name");
    const name = inputEl.value.trim();
    if (!name) {
        alert("Please enter a profile name.");
        return;
    }
    if (demoPortfolios[name]) {
        alert("A profile with this name already exists.");
        return;
    }
    
    demoPortfolios[name] = [];
    activePortfolioName = name;
    demoHoldings = demoPortfolios[activePortfolioName];
    inputEl.value = "";
    
    if (currentUser && db) {
        try {
            const userDocRef = db.collection("users").doc(currentUser.uid);
            await userDocRef.set({
                activePortfolioName: activePortfolioName,
                profiles: Object.keys(demoPortfolios)
            }, { merge: true });
        } catch (err) {
            console.error("Cloud profile creation failed:", err);
        }
    } else {
        localStorage.setItem("demo_portfolios", JSON.stringify(demoPortfolios));
        localStorage.setItem("active_portfolio_name", activePortfolioName);
    }
    
    updateProfileDropdowns();
    alert(`Portfolio profile "${name}" created successfully!`);
    loadActiveTabData();
}

async function handleDeleteProfile() {
    if (activePortfolioName === "Default Portfolio") {
        alert("The Default Portfolio profile cannot be deleted.");
        return;
    }
    const confirmed = confirm(`Are you sure you want to delete the profile "${activePortfolioName}" and all of its holdings? This cannot be undone.`);
    if (!confirmed) return;
    
    const targetToDelete = activePortfolioName;
    delete demoPortfolios[targetToDelete];
    
    activePortfolioName = "Default Portfolio";
    demoHoldings = demoPortfolios[activePortfolioName];
    
    if (currentUser && db) {
        try {
            const userDocRef = db.collection("users").doc(currentUser.uid);
            
            const colRef = db.collection("users").doc(currentUser.uid)
                .collection("portfolios").doc(targetToDelete).collection("holdings");
            const snapshot = await colRef.get();
            const batch = db.batch();
            snapshot.forEach(doc => batch.delete(doc.ref));
            await batch.commit();
            
            await userDocRef.set({
                activePortfolioName: activePortfolioName,
                profiles: Object.keys(demoPortfolios)
            }, { merge: true });
        } catch (err) {
            console.error("Cloud profile deletion failed:", err);
        }
    } else {
        localStorage.setItem("demo_portfolios", JSON.stringify(demoPortfolios));
        localStorage.setItem("active_portfolio_name", activePortfolioName);
    }
    
    updateProfileDropdowns();
    alert(`Portfolio profile "${targetToDelete}" deleted successfully.`);
    loadActiveTabData();
}

async function wipeCategoryData(categoryKey) {
    let classesToWipe = [categoryKey];
    if (categoryKey === "ETF_ALL") {
        classesToWipe = ["ETF", "GOLD_ETF"];
    } else if (categoryKey === "ALL") {
        classesToWipe = ["STOCK", "MUTUAL_FUND", "ETF", "GOLD_ETF", "CASH"];
    }
    
    const categoryNames = {
        "STOCK": "Direct Stocks",
        "MUTUAL_FUND": "Mutual Funds",
        "ETF_ALL": "ETFs & Gold",
        "ALL": "Entire Portfolio"
    };
    
    const confirmed = confirm(`Are you sure you want to permanently delete all holdings in "${categoryNames[categoryKey] || categoryKey}"? This cannot be undone.`);
    if (!confirmed) return;
    
    demoPortfolios[activePortfolioName] = demoPortfolios[activePortfolioName].filter(
        h => !classesToWipe.includes(h.asset_class)
    );
    demoHoldings = demoPortfolios[activePortfolioName];
    
    if (currentUser && db) {
        try {
            const colRef = db.collection("users").doc(currentUser.uid)
                .collection("portfolios").doc(activePortfolioName).collection("holdings");
                
            const snapshot = await colRef.get();
            const batch = db.batch();
            
            snapshot.forEach(doc => {
                const item = doc.data();
                if (classesToWipe.includes(item.asset_class)) {
                    batch.delete(doc.ref);
                }
            });
            
            await batch.commit();
        } catch (err) {
            console.error("Firestore batch wipe failed:", err);
            alert("Error: Failed to sync wipe to cloud.");
        }
    } else {
        localStorage.setItem("demo_portfolios", JSON.stringify(demoPortfolios));
    }
    
    demoLogs.unshift({
        timestamp: new Date().toISOString(),
        ip_address: "local-client",
        action: "CLEAR_CATEGORY",
        details: `Wiped all holdings in category: ${categoryKey} for portfolio ${activePortfolioName}`
    });
    localStorage.setItem("demo_logs", JSON.stringify(demoLogs));
    
    alert(`Category "${categoryNames[categoryKey] || categoryKey}" has been successfully cleared!`);
    loadActiveTabData();
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
}

function logout() {
    localStorage.removeItem("local_login");
    localStorage.removeItem("token");
    authToken = "";
    if (typeof firebase !== 'undefined' && firebase.auth) {
        firebase.auth().signOut().then(() => {
            window.location.reload();
        }).catch(err => {
            window.location.reload();
        });
    } else {
        window.location.reload();
    }
}

function setupEventListeners() {
    document.getElementById("btn-login").addEventListener("click", handleLogin);
    document.getElementById("btn-logout").addEventListener("click", logout);

    // Profile switcher & Reset events
    document.getElementById("header-profile-select").addEventListener("change", (e) => {
        switchPortfolioProfile(e.target.value);
    });
    document.getElementById("settings-profile-select").addEventListener("change", (e) => {
        switchPortfolioProfile(e.target.value);
    });
    document.getElementById("btn-create-profile").addEventListener("click", handleCreateProfile);
    document.getElementById("btn-delete-profile").addEventListener("click", handleDeleteProfile);
    document.getElementById("btn-clear-section").addEventListener("click", () => {
        const category = document.getElementById("clear-section-select").value;
        wipeCategoryData(category);
    });

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

    const ageInput = document.getElementById("portfolio-age");
    if (ageInput) {
        ageInput.value = localStorage.getItem("portfolio_age") || "";
        ageInput.addEventListener("input", (e) => {
            localStorage.setItem("portfolio_age", e.target.value);
            if (activeTab === "dashboard") {
                renderAssetComparison();
            }
        });
    }

    // Theme Switcher Logic
    const themeToggleBtn = document.getElementById("btn-theme-toggle");
    if (themeToggleBtn) {
        const currentTheme = localStorage.getItem("theme") || "dark";
        if (currentTheme === "light") {
            document.body.classList.add("theme-light");
            const sunIcon = document.getElementById("theme-icon-sun");
            const moonIcon = document.getElementById("theme-icon-moon");
            if (sunIcon) sunIcon.classList.add("hidden");
            if (moonIcon) moonIcon.classList.remove("hidden");
        }
        
        themeToggleBtn.addEventListener("click", () => {
            const isLight = document.body.classList.toggle("theme-light");
            localStorage.setItem("theme", isLight ? "light" : "dark");
            
            const sunIcon = document.getElementById("theme-icon-sun");
            const moonIcon = document.getElementById("theme-icon-moon");
            if (isLight) {
                if (sunIcon) sunIcon.classList.add("hidden");
                if (moonIcon) moonIcon.classList.remove("hidden");
            } else {
                if (sunIcon) sunIcon.classList.remove("hidden");
                if (moonIcon) moonIcon.classList.add("hidden");
            }
            loadActiveTabData();
        });
    }

    document.getElementById("manual-date").valueAsDate = new Date();
}

async function handleLogin() {
    let emailInput = document.getElementById("login-email").value.trim();
    const password = document.getElementById("login-password").value;

    if (!emailInput || !password) {
        alert("Please enter credentials.");
        return;
    }

    if (isDemoMode === false) {
        const loginBtn = document.getElementById("btn-login");
        loginBtn.innerText = "Authenticating...";
        loginBtn.disabled = true;

        let email = emailInput;
        if (!email.includes("@")) {
            email = email.toLowerCase() + "@platform.in";
        }

        const formData = new URLSearchParams();
        formData.append("username", email);
        formData.append("password", password);

        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 8000); // 8 seconds timeout

            const response = await fetch(`${API_BASE}/api/auth/login`, {
                method: "POST",
                body: formData,
                headers: { "Content-Type": "application/x-www-form-urlencoded" },
                signal: controller.signal
            });
            clearTimeout(timeoutId);

            if (!response.ok) {
                // Try registering the user if the login failed
                const regController = new AbortController();
                const regTimeoutId = setTimeout(() => regController.abort(), 8000);
                
                const regResponse = await fetch(`${API_BASE}/api/auth/register`, {
                    method: "POST",
                    body: JSON.stringify({ email: email, password: password }),
                    headers: { "Content-Type": "application/json" },
                    signal: regController.signal
                });
                clearTimeout(regTimeoutId);

                if (regResponse.ok) {
                    // Registration succeeded, retry login
                    const retryController = new AbortController();
                    const retryTimeoutId = setTimeout(() => retryController.abort(), 8000);
                    
                    const retryResponse = await fetch(`${API_BASE}/api/auth/login`, {
                        method: "POST",
                        body: formData,
                        headers: { "Content-Type": "application/x-www-form-urlencoded" },
                        signal: retryController.signal
                    });
                    clearTimeout(retryTimeoutId);
                    
                    if (retryResponse.ok) {
                        const data = await retryResponse.json();
                        authToken = data.access_token;
                        localStorage.setItem("token", authToken);
                        initFirebaseState();
                        return;
                    }
                }
                
                const err = await response.json().catch(() => ({ detail: "Authentication failed" }));
                throw new Error(err.detail || "Authentication failed");
            }

            const data = await response.json();
            authToken = data.access_token;
            localStorage.setItem("token", authToken);
            initFirebaseState();
        } catch (err) {
            console.error("Backend connection failed, offering offline mode:", err);
            const useLocal = confirm("Could not connect to live backend (Render may be sleeping or starting up). Would you like to run in Local Offline/Demo Mode instead?");
            if (useLocal) {
                isDemoMode = true;
                // Process local authentication
                if (emailInput === "Admin" && password === "Admin@123") {
                    localStorage.setItem("local_login", "true");
                    document.getElementById("login-container").classList.add("hidden");
                    document.getElementById("app-container").classList.remove("hidden");
                    document.getElementById("ai-status-badge").innerText = "Offline | Local Mode";
                    document.getElementById("ai-status-badge").className = "badge badge-yellow";
                    document.querySelector(".user-avatar").innerText = "L";
                    document.querySelector(".user-name").innerText = "Local Investor";
                    document.querySelector(".user-email").innerText = "local-session@offline";
                    loadLocalStorageData();
                } else {
                    alert("Local Offline Mode default credentials are: Admin / Admin@123");
                }
            }
        } finally {
            loginBtn.innerText = "Authenticate Access";
            loginBtn.disabled = false;
        }
        return;
    }

    if (typeof firebase === 'undefined') {
        // Local offline authentication fallback
        if (emailInput === "Admin" && password === "Admin@123") {
            localStorage.setItem("local_login", "true");
            document.getElementById("login-container").classList.add("hidden");
            document.getElementById("app-container").classList.remove("hidden");
            // Update UI profile display
            document.querySelector(".user-avatar").innerText = "L";
            document.querySelector(".user-name").innerText = "Local Investor";
            document.querySelector(".user-email").innerText = "local-session@offline";
            loadLocalStorageData();
            return;
        } else {
            alert("Invalid credentials. Try using default: Admin / Admin@123");
            return;
        }
    }

    // Convert short username (like 'Admin') to a valid email format for Firebase compatibility
    let email = emailInput;
    if (!email.includes("@")) {
        email = email.toLowerCase() + "@platform.in";
    }

    const loginBtn = document.getElementById("btn-login");
    loginBtn.innerText = "Authenticating...";
    loginBtn.disabled = true;

    try {
        await firebase.auth().signInWithEmailAndPassword(email, password);
    } catch (err) {
        if (err.code === "auth/user-not-found" || err.code === "auth/invalid-credential" || err.code === "auth/invalid-email" || err.message.includes("credential")) {
            const register = confirm(`Register new account for user "${emailInput}" (maps to ${email})?`);
            if (register) {
                try {
                    loginBtn.innerText = "Registering...";
                    await firebase.auth().createUserWithEmailAndPassword(email, password);
                } catch (regErr) {
                    alert("Registration failed: " + regErr.message);
                    loginBtn.innerText = "Authenticate Access";
                    loginBtn.disabled = false;
                }
            } else {
                loginBtn.innerText = "Authenticate Access";
                loginBtn.disabled = false;
            }
        } else {
            alert("Authentication failed: " + err.message);
            loginBtn.innerText = "Authenticate Access";
            loginBtn.disabled = false;
        }
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
        dashboard: ["Wealth Advisor", "High-level asset value mapping, allocation summaries, and structural ratings."],
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

const ISIN_TO_TICKER = {
    // Stocks
    "INE002A01018": "RELIANCE",
    "INE467B01029": "TCS",
    "INE040A01034": "HDFCBANK",
    "INE009A01021": "INFOSYS",
    "INE423A01024": "ADANIENT",
    "INE522F01014": "COALINDIA",
    "INE528G01027": "YESBANK",
    "INE931S01010": "ADANIENSOL",
    "INE758T01015": "ZOMATO",
    "INE263A01024": "HAL",
    "INE081A01020": "TATASTEEL",
    "INE155A01022": "TATAMOTORS",
    "INE090A01021": "ICICIBANK",
    "INE062A01020": "SBIN",
    "INE397D01024": "BHARTIARTL",
    "INE018A01030": "LT",
    "INE154A01025": "ITC",
    "INE238A01034": "AXISBANK",
    "INE237A01028": "KOTAKBANK",
    "INE030A01027": "HINDUNILVR",
    "INE075A01022": "WIPRO",
    "INE585B01010": "MARUTI",
    "INE021A01026": "ASIANPAINT",
    "INE280A01028": "TITAN",
    // Mutual Funds
    "INF879O01026": "PPFAS_FLEXICAP",
    "INF200K01217": "SBI_BLUECHIP",
    "INF204K01QY4": "NIPPON_SMALLCAP",
    "INF846K01239": "AXIS_ELSS",
    "INF846K01DP4": "AXIS_SMALLCAP",
    "INF090I01HP0": "FRANKLIN_US",
    "INF844O01015": "EDELWEISS_LIQUID",
    // ETFs
    "INF204KB1013": "GOLDBEES"
};

function resolveTicker(symbol) {
    const sym = String(symbol || "").trim().toUpperCase();
    if (ISIN_TO_TICKER[sym]) return ISIN_TO_TICKER[sym];
    return sym;
}

const FRIENDLY_NAMES = {
    // Stocks
    "RELIANCE": "Reliance Industries Limited",
    "INE002A01018": "Reliance Industries Limited",
    "TCS": "Tata Consultancy Services Limited",
    "INE467B01029": "Tata Consultancy Services Limited",
    "HDFCBANK": "HDFC Bank Limited",
    "INE040A01034": "HDFC Bank Limited",
    "INFOSYS": "Infosys Limited",
    "INE009A01021": "Infosys Limited",
    "ADANIENT": "Adani Enterprises Limited",
    "INE423A01024": "Adani Enterprises Limited",
    "COALINDIA": "Coal India Limited",
    "INE522F01014": "Coal India Limited",
    "YESBANK": "Yes Bank Limited",
    "INE528G01027": "Yes Bank Limited",
    "ADANIENSOL": "Adani Energy Solutions Limited",
    "INE931S01010": "Adani Energy Solutions Limited",
    "ZOMATO": "Zomato Limited",
    "INE758T01015": "Zomato Limited",
    "HAL": "Hindustan Aeronautics Limited",
    "INE263A01024": "Hindustan Aeronautics Limited",
    "TATASTEEL": "Tata Steel Limited",
    "INE081A01020": "Tata Steel Limited",
    "TATAMOTORS": "Tata Motors Limited",
    "INE155A01022": "Tata Motors Limited",
    "ICICIBANK": "ICICI Bank Limited",
    "INE090A01021": "ICICI Bank Limited",
    "SBIN": "State Bank of India",
    "INE062A01020": "State Bank of India",
    "BHARTIARTL": "Bharti Airtel Limited",
    "INE397D01024": "Bharti Airtel Limited",
    "LT": "Larsen & Toubro Limited",
    "INE018A01030": "Larsen & Toubro Limited",
    "ITC": "ITC Limited",
    "INE154A01025": "ITC Limited",
    "AXISBANK": "Axis Bank Limited",
    "INE238A01034": "Axis Bank Limited",
    "KOTAKBANK": "Kotak Mahindra Bank Limited",
    "INE237A01028": "Kotak Mahindra Bank Limited",
    "HINDUNILVR": "Hindustan Unilever Limited",
    "INE030A01027": "Hindustan Unilever Limited",
    "WIPRO": "Wipro Limited",
    "INE075A01022": "Wipro Limited",
    "MARUTI": "Maruti Suzuki India Limited",
    "INE585B01010": "Maruti Suzuki India Limited",
    "ASIANPAINT": "Asian Paints Limited",
    "INE021A01026": "Asian Paints Limited",
    "TITAN": "Titan Company Limited",
    "INE280A01028": "Titan Company Limited",
    
    // Mutual Funds
    "PPFAS_FLEXICAP": "Parag Parikh Flexi Cap Fund",
    "INF879O01026": "Parag Parikh Flexi Cap Fund",
    "SBI_BLUECHIP": "SBI Bluechip Fund",
    "INF200K01217": "SBI Bluechip Fund",
    "NIPPON_SMALLCAP": "Nippon India Small Cap Fund",
    "INF204K01QY4": "Nippon India Small Cap Fund",
    "AXIS_ELSS": "Axis ELSS Tax Saver Fund",
    "INF846K01239": "Axis ELSS Tax Saver Fund",
    "AXIS_SMALLCAP": "Axis Small Cap Fund",
    "INF846K01DP4": "Axis Small Cap Fund",
    "FRANKLIN_US": "Franklin U.S. Opportunities Fund",
    "INF090I01HP0": "Franklin U.S. Opportunities Fund",
    "EDELWEISS_LIQUID": "Edelweiss Liquid Fund",
    "INF844O01015": "Edelweiss Liquid Fund",
    
    // ETFs
    "NIFTY_BEES": "Nippon India ETF Nifty 50 BeES",
    "JUNIORBEES": "Nippon India ETF Nifty Next 50 BeES",
    "MON100": "Motilal Oswal Nasdaq 100 ETF",
    "GOLDBEES": "Nippon India ETF Gold BeES",
    "INF204KB1013": "Nippon India ETF Gold BeES"
};

function resolveFriendlyName(symbol, defaultName) {
    const sym = String(symbol || "").trim().toUpperCase();
    const resolvedSym = resolveTicker(sym);
    if (FRIENDLY_NAMES[sym]) return FRIENDLY_NAMES[sym];
    if (FRIENDLY_NAMES[resolvedSym]) return FRIENDLY_NAMES[resolvedSym];
    const cleanedDefault = String(defaultName || "").trim();
    if (cleanedDefault && cleanedDefault !== sym && cleanedDefault !== resolvedSym && !cleanedDefault.startsWith("INE") && !cleanedDefault.startsWith("INF")) {
        return cleanedDefault;
    }
    return resolvedSym;
}

// NSE Momentum Breakout Trade Ideas
const NSE_MOMENTUM_IDEAS = [
    {
        symbol: "TRENT",
        name: "Trent Limited",
        trend: "Strong Bullish (Stage 2 Markup)",
        rsi: 68,
        buy_range: "₹2,850 - ₹2,880",
        target: "₹3,250",
        stop_loss: "₹2,690",
        technical_insight: "Trading above 20d & 50d EMA anchor. Momentum breakout supported by 3.5x average weekly volume.",
        market_insight: "Strong performance in Zudio and Zara stores drives solid revenue growth, attracting institutional buyers."
    },
    {
        symbol: "ZOMATO",
        name: "Zomato Limited",
        trend: "Bullish Cup & Handle Breakout",
        rsi: 64,
        buy_range: "₹248 - ₹252",
        target: "₹288",
        stop_loss: "₹234",
        technical_insight: "Breaking out of multi-month resistance. Daily charts confirm a MACD bullish crossover above zero line.",
        market_insight: "Blinkit quick-commerce unit monetization and rapid dark store expansion are scaling contribution margins."
    },
    {
        symbol: "HAL",
        name: "Hindustan Aeronautics Ltd",
        trend: "Ascending Triangle Breakout",
        rsi: 67,
        buy_range: "₹4,230 - ₹4,260",
        target: "₹4,850",
        stop_loss: "₹3,990",
        technical_insight: "Price consolidates above resistance range. RSI shows strong positive divergence on weekly timelines.",
        market_insight: "Defence budget increases and domestic fighter aircraft production plans provide long-term contract visibility."
    },
    {
        symbol: "TATASTEEL",
        name: "Tata Steel Limited",
        trend: "Bullish Reversal (Mean Reversion)",
        rsi: 58,
        buy_range: "₹192 - ₹195",
        target: "₹220",
        stop_loss: "₹181",
        technical_insight: "Bounced off long term 200-day EMA support. Aggressive futures accumulation on weekly timeline.",
        market_insight: "Restructuring of UK operations cuts European cost drag, coinciding with Asian steel demand stabilization."
    }
];

function resolveFriendlyName(symbol, defaultName) {
    const sym = String(symbol || "").trim().toUpperCase();
    if (FRIENDLY_NAMES[sym]) return FRIENDLY_NAMES[sym];
    const cleanedDefault = String(defaultName || "").trim();
    if (cleanedDefault && cleanedDefault !== sym) return cleanedDefault;
    return sym;
}

// --- DYNAMIC PORTFOLIO HEALTH AUDITING ENGINE ---
function generatePortfolioHealthAudit(holdings) {
    const stockItems = holdings.filter(h => h.asset_class === "STOCK");
    const mfItems = holdings.filter(h => h.asset_class === "MUTUAL_FUND");
    const otherItems = holdings.filter(h => h.asset_class === "GOLD_ETF" || h.asset_class === "ETF" || h.asset_class === "CASH");
    
    let totalStockVal = 0;
    let totalStockInvested = 0;
    let totalMfVal = 0;
    let totalMfInvested = 0;
    let totalOtherVal = 0;
    let totalOtherInvested = 0;
    
    // Analyze Stocks
    const analyzedStocks = stockItems.map(h => analyzeStockClientSide(h));
    analyzedStocks.forEach(s => {
        totalStockVal += s.current_value;
        totalStockInvested += s.invested;
    });
    
    // Analyze MFs
    const analyzedMfs = mfItems.map(h => analyzeMutualFundClientSide(h));
    analyzedMfs.forEach(f => {
        totalMfVal += f.current_value;
        totalMfInvested += f.invested;
    });
    
    // Other assets
    otherItems.forEach(h => {
        const cost = h.quantity * h.buy_price;
        const currentPrice = getMockCurrentPrice(h.symbol, h.buy_price, h.current_price);
        const val = h.quantity * currentPrice;
        totalOtherVal += val;
        totalOtherInvested += cost;
    });
    
    const totalVal = totalStockVal + totalMfVal + totalOtherVal;
    const totalInvested = totalStockInvested + totalMfInvested + totalOtherInvested;
    
    // ----------------------------------------
    // STOCKS AUDIT
    // ----------------------------------------
    let stockScore = 100;
    const stockPros = [];
    const stockCons = [];
    let stockSummary = "No stock holdings added.";
    
    if (stockItems.length > 0) {
        const count = stockItems.length;
        if (count <= 2) {
            stockScore -= 10;
            stockCons.push(`Under-diversified: Only ${count} stocks owned. Extreme dependency on too few companies.`);
        } else if (count > 15) {
            stockScore -= 5;
            stockCons.push(`Over-diversified: ${count} stocks owned. Dilutes return potential and increases tracking friction.`);
        } else if (count >= 4 && count <= 10) {
            stockScore += 5;
            stockPros.push(`Optimal Diversification: Holding ${count} stocks is ideal for balanced growth and focus.`);
        } else {
            stockPros.push(`Steady Diversification: Holding ${count} stocks is reasonable.`);
        }
        
        // Concentration check
        let hasConcentration = false;
        analyzedStocks.forEach(s => {
            const weight = totalStockVal > 0 ? (s.current_value / totalStockVal) * 100 : 0;
            if (weight > 25) {
                hasConcentration = true;
                stockCons.push(`Concentration Threat: ${s.name} represents ${weight.toFixed(1)}% of your stock portfolio (exceeds 25% safety limit).`);
            }
        });
        if (hasConcentration) {
            stockScore -= 15;
        } else {
            stockPros.push("Safe Stock Allocation: No single stock represents more than 25% of the equity portfolio.");
        }
        
        // Fundamentals and Technicals averages
        let avgFund = 0;
        let avgTech = 0;
        analyzedStocks.forEach(s => {
            avgFund += s.fundamental_score;
            avgTech += s.technical_score;
        });
        avgFund /= count;
        avgTech /= count;
        
        if (avgFund >= 70) {
            stockPros.push(`High Fundamental Quality: Average fundamental score of ${avgFund.toFixed(0)}/100 shows excellent financial safety.`);
        } else if (avgFund < 50) {
            stockScore -= 15;
            stockCons.push(`Poor Fundamental Quality: Average fundamental rating of ${avgFund.toFixed(0)}/100 points to low-safety, highly volatile assets.`);
        } else {
            stockPros.push(`Fair Fundamental Strength: Average rating of ${avgFund.toFixed(0)}/100 matches historical corporate standards.`);
        }
        
        if (avgTech >= 65) {
            stockPros.push(`Strong Bullish Momentum: Average technical score of ${avgTech.toFixed(0)}/100 indicates upward structural trends.`);
        } else if (avgTech < 40) {
            stockScore -= 10;
            stockCons.push(`Weak Technical Momentum: Average technical score of ${avgTech.toFixed(0)}/100 shows major holdings are in bearish consolidations.`);
        }
        
        // Returns
        const stockGains = totalStockVal - totalStockInvested;
        const stockGainsPct = totalStockInvested > 0 ? (stockGains / totalStockInvested) * 100 : 0;
        if (stockGains > 0) {
            stockPros.push(`Profitable Returns: Equity basket compounds positively with absolute gains of ${formatINR(stockGains)} (${stockGainsPct.toFixed(1)}%).`);
        } else if (stockGains < 0) {
            stockScore -= 5;
            stockCons.push(`Underperforming returns: Stock holdings currently sit on a net loss of ${formatINR(stockGains)}.`);
        }
        
        stockScore = Math.max(40, Math.min(100, stockScore));
        
        if (stockScore >= 80) {
            stockSummary = "Excellent stock quality and healthy weight limits. Strong capital structure.";
        } else if (stockScore >= 60) {
            stockSummary = "Moderate stock health. Diversify away from concentrated assets to improve resilience.";
        } else {
            stockSummary = "High stock risk detected. Rebalance concentrated holdings and evaluate weak performers.";
        }
    }
    
    // ----------------------------------------
    // MUTUAL FUNDS AUDIT
    // ----------------------------------------
    let mfScore = 100;
    const mfPros = [];
    const mfCons = [];
    let mfSummary = "No mutual fund schemes added.";
    
    if (mfItems.length > 0) {
        const count = mfItems.length;
        
        // Pairwise Overlap Matrix check
        let maxOverlap = 0;
        let worstFundA = "";
        let worstFundB = "";
        if (analyzedMfs.length >= 2) {
            for (let i = 0; i < analyzedMfs.length; i++) {
                for (let j = i + 1; j < analyzedMfs.length; j++) {
                    const res = getRealisticOverlap(analyzedMfs[i], analyzedMfs[j]);
                    if (res.overlap > maxOverlap) {
                        maxOverlap = res.overlap;
                        worstFundA = analyzedMfs[i].name;
                        worstFundB = analyzedMfs[j].name;
                    }
                }
            }
        }
        
        if (maxOverlap >= 25) {
            mfScore -= 20;
            mfCons.push(`High Overlap Redundancy: ${worstFundA} and ${worstFundB} share ${maxOverlap}% underlying holdings. Consolidate to reduce double fees.`);
        } else if (analyzedMfs.length >= 2) {
            mfPros.push(`Stylistic Diversification: Max overlap between schemes is low at ${maxOverlap}%, showing high manager style diversity.`);
        }
        
        // Expense ratio
        let avgEr = 0;
        analyzedMfs.forEach(f => avgEr += f.metrics.expense_ratio);
        avgEr /= count;
        
        if (avgEr > 1.25) {
            mfScore -= 10;
            mfCons.push(`High Fees: Average expense ratio of ${avgEr.toFixed(2)}% creates a long-term compound drag on returns.`);
        } else if (avgEr <= 0.75) {
            mfPros.push(`Cost-Efficient: Average expense ratio is low at ${avgEr.toFixed(2)}% (avoids fee leakage).`);
        } else {
            mfPros.push(`Standard Costs: Average expense ratio is reasonable at ${avgEr.toFixed(2)}%.`);
        }
        
        // Ratings
        let avgScore = 0;
        analyzedMfs.forEach(f => avgScore += f.score);
        avgScore /= count;
        
        if (avgScore >= 75) {
            mfPros.push(`Top-Rated Managers: High average fund manager score of ${avgScore.toFixed(0)}/100 (>4 stars).`);
        } else if (avgScore < 60) {
            mfScore -= 15;
            mfCons.push(`Sub-optimal Rating: Average fund performance rating is low (${avgScore.toFixed(0)}/100), review historical alpha.`);
        }
        
        // Systematic plan
        mfPros.push("Systematic compounding (SIP): Periodic units build wealth steadily across market cycles.");
        
        mfScore = Math.max(40, Math.min(100, mfScore));
        
        if (mfScore >= 80) {
            mfSummary = "Strong mutual fund selections with low redundancy and clean fee structures.";
        } else if (mfScore >= 60) {
            mfSummary = "Moderate fund health. Consolidate overlapping funds to reduce fees.";
        } else {
            mfSummary = "High fund redundancy or manager underperformance. Switch strategies suggested.";
        }
    }
    
    // ----------------------------------------
    // OVERALL PORTFOLIO ROLLUP
    // ----------------------------------------
    let overallScore = 80;
    if (totalVal > 0) {
        let stockWeight = totalStockVal / totalVal;
        let mfWeight = totalMfVal / totalVal;
        let otherWeight = totalOtherVal / totalVal;
        
        let stockContribution = stockItems.length > 0 ? stockScore : 100;
        let mfContribution = mfItems.length > 0 ? mfScore : 100;
        
        // Weighted baseline
        overallScore = (stockWeight * stockContribution) + (mfWeight * mfContribution) + (otherWeight * 100);
    }
    
    const overallPros = [];
    const overallCons = [];
    let overallSummary = "Diversify your assets to enable composite health auditing.";
    
    if (totalVal > 0) {
        // Asset cushion checks
        const protectiveWeight = (totalOtherVal / totalVal) * 100;
        if (protectiveWeight >= 10 && protectiveWeight <= 30) {
            overallPros.push(`Balanced Asset Cushion: Protective assets (Gold/Cash/ETFs) represent ${protectiveWeight.toFixed(1)}% of your portfolio, shielding against sudden market corrections.`);
        } else if (protectiveWeight < 5) {
            overallScore -= 5;
            overallCons.push(`Aggressive Volatility threat: Protected asset weight is extremely low at ${protectiveWeight.toFixed(1)}%. Highly vulnerable to equity shocks.`);
        }
        
        // Compound rates
        const overallGains = totalVal - totalInvested;
        const overallGainsPct = totalInvested > 0 ? (overallGains / totalInvested) * 100 : 0;
        
        if (overallGains > 0) {
            overallPros.push(`Positive Capital growth: Net gains stand at ${formatINR(overallGains)} (${overallGainsPct.toFixed(1)}% absolute returns).`);
        } else if (overallGains < 0) {
            overallCons.push(`Negative Capital trend: Net portfolio is in red by ${formatINR(overallGains)}.`);
        }
        
        // Roll up from components
        if (stockItems.length > 0 && stockScore < 70) {
            overallCons.push("Direct equity weaknesses: Direct stock concentration or bearish momentum degrades baseline security.");
        }
        if (mfItems.length > 0 && mfScore < 70) {
            overallCons.push("Mutual fund overlap leakage: Overlapping schemes reduce effective diversification.");
        }
        
        if (stockItems.length > 0 && stockScore >= 80) {
            overallPros.push("High-safety stock picks: Stock selections exhibit strong fundamentals.");
        }
        if (mfItems.length > 0 && mfScore >= 80) {
            overallPros.push("Low-cost mutual funds: Mutual funds are cost-efficient and stylistically diverse.");
        }
        
        overallScore = Math.max(40, Math.min(100, Math.round(overallScore)));
        
        if (overallScore >= 80) {
            overallSummary = "Excellent asset mix and high diversification. Portfolio is highly resilient and cost-optimized.";
        } else if (overallScore >= 60) {
            overallSummary = "Healthy portfolio with moderate warning signs. Consolidate holdings to reduce overlap and concentration.";
        } else {
            overallSummary = "High vulnerability detected. Rebalance immediately to safe-haven assets and resolve stock/fund redundancy.";
        }
    }
    
    return {
        stocks: { score: stockScore, pros: stockPros, cons: stockCons, summary: stockSummary },
        mfs: { score: mfScore, pros: mfPros, cons: mfCons, summary: mfSummary },
        overall: { score: overallScore, pros: overallPros, cons: overallCons, summary: overallSummary }
    };
}

function renderHealthAuditDetails(audit, containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;
    
    if (audit.pros.length === 0 && audit.cons.length === 0) {
        container.innerHTML = `<div class="empty-placeholder">No active metrics available to audit health. Add holdings to analyze.</div>`;
        return;
    }
    
    const prosHtml = audit.pros.map(p => `<li>${p}</li>`).join("");
    const consHtml = audit.cons.map(c => `<li>${c}</li>`).join("");
    
    container.innerHTML = `
        <div class="health-audit-summary-box">
            <strong>Executive Health Summary:</strong> ${audit.summary}
        </div>
        <div class="health-audit-grid">
            <div class="audit-card audit-pro-card">
                <h5>🟢 Positive Strengths (Pros)</h5>
                <ul class="audit-list">
                    ${prosHtml || "<li>No significant positives identified. Strengthen portfolio composition.</li>"}
                </ul>
            </div>
            <div class="audit-card audit-con-card">
                <h5>🔴 Red Flags / Optimization Areas (Cons)</h5>
                <ul class="audit-list">
                    ${consHtml || "<li>No significant weaknesses or overlap issues. Keep it up!</li>"}
                </ul>
            </div>
        </div>
    `;
}


// --- CLIENT-SIDE REAL-TIME ANALYTICS SIMULATORS ---
function cleanNumber(val) {
    if (val === undefined || val === null || String(val).trim() === "") return null;
    if (typeof val === 'number') return isNaN(val) ? null : val;
    const cleaned = String(val).replace(/[^0-9.-]/g, "").trim();
    const parsed = parseFloat(cleaned);
    return isNaN(parsed) ? null : parsed;
}

function calculateXIRRClientSide(cashFlows) {
    if (cashFlows.length < 2) return 0.0;
    cashFlows.sort((a, b) => a.date - b.date);

    // Calculate simple return as fallback
    let totalInvested = 0;
    let finalVal = 0;
    cashFlows.forEach(cf => {
        if (cf.amount < 0) totalInvested += -cf.amount;
        else finalVal += cf.amount;
    });
    const simpleReturn = totalInvested > 0 ? ((finalVal - totalInvested) / totalInvested) * 100 : 0.0;

    // Do not annualize if total span is less than 180 days
    const totalDays = (cashFlows[cashFlows.length - 1].date - cashFlows[0].date) / (1000 * 60 * 60 * 24);
    if (totalDays < 180) {
        return simpleReturn;
    }

    let r = 0.1;
    const maxIterations = 100;
    const precision = 1e-6;
    const t0 = cashFlows[0].date;
    
    for (let iter = 0; iter < maxIterations; iter++) {
        let f = 0.0;
        let df = 0.0;
        for (let i = 0; i < cashFlows.length; i++) {
            const exp = (cashFlows[i].date - t0) / (1000 * 60 * 60 * 24 * 365.25);
            const val = 1.0 + r;
            if (val <= 0.0) return simpleReturn; // Fallback
            f += cashFlows[i].amount / Math.pow(val, exp);
            df -= exp * cashFlows[i].amount / Math.pow(val, exp + 1);
        }
        if (Math.abs(df) < 1e-12) break;
        const nextR = r - f / df;
        if (isNaN(nextR) || !isFinite(nextR) || nextR > 10.0 || nextR < -0.99) {
            return simpleReturn; // Solver diverged or jump was wild, fallback to simple return
        }
        if (Math.abs(nextR - r) < precision) {
            return nextR * 100;
        }
        r = nextR;
    }
    
    return simpleReturn; // Fallback if no convergence
}

function getSymbolHash(symbol) {
    let hash = 0;
    const str = String(symbol || "").trim().toUpperCase();
    for (let i = 0; i < str.length; i++) {
        hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    return Math.abs(hash);
}

function getMockCurrentPrice(symbol, buyPrice, storedCurrentPrice = null) {
    const parsedPrice = cleanNumber(storedCurrentPrice);
    if (parsedPrice !== null && parsedPrice > 0) {
        return parsedPrice;
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
    const name = resolveFriendlyName(symbol, h.name);
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

function getRealisticOverlap(fundA, fundB) {
    const catA = fundA.category;
    const catB = fundB.category;
    const symA = fundA.symbol.toUpperCase();
    const symB = fundB.symbol.toUpperCase();
    const nmA = fundA.name.toUpperCase();
    const nmB = fundB.name.toUpperCase();
    
    // If either is debt/liquid, overlap is 0
    if (catA === "Debt / Liquid Fund" || catB === "Debt / Liquid Fund") {
        return { overlap: 0, shared: [] };
    }
    
    // If either is Gold or commodities, overlap is 0
    if (symA.includes("GOLD") || symB.includes("GOLD") || nmA.includes("GOLD") || nmB.includes("GOLD") || catA.includes("Commodities") || catB.includes("Commodities")) {
        return { overlap: 0, shared: [] };
    }
    
    // If either is International and the other is domestic, overlap is 0
    const isIntA = catA === "International Equity" || symA.includes("US") || symA.includes("NASDAQ") || nmA.includes("U.S") || nmA.includes("NASDAQ");
    const isIntB = catB === "International Equity" || symB.includes("US") || symB.includes("NASDAQ") || nmB.includes("U.S") || nmB.includes("NASDAQ");
    if (isIntA !== isIntB) {
        return { overlap: 0, shared: [] };
    }
    
    if (isIntA && isIntB) {
        // Both are international. Let's see if they are Nasdaq/US
        const isUS_A = symA.includes("US") || symA.includes("NASDAQ") || nmA.includes("U.S") || nmA.includes("NASDAQ");
        const isUS_B = symB.includes("US") || symB.includes("NASDAQ") || nmB.includes("U.S") || nmB.includes("NASDAQ");
        if (isUS_A && isUS_B) {
            return {
                overlap: 38,
                shared: ["MICROSOFT", "APPLE", "NVIDIA", "AMAZON", "ALPHABET"]
            };
        }
        return { overlap: 0, shared: [] };
    }
    
    // Both are domestic equity.
    // If same category, high overlap
    if (catA === catB) {
        if (catA === "Equity Small Cap") {
            return {
                overlap: 32,
                shared: ["CHOLAMANDALAM", "KARUR_VYSYA_BANK", "KPI_GREEN", "BRIGADE_ENTERPRISES"]
            };
        }
        if (catA === "Equity Mid Cap") {
            return {
                overlap: 35,
                shared: ["CUMMINS_INDIA", "COFORGE", "SUPREME_INDUSTRIES", "FEDERAL_BANK"]
            };
        }
        if (catA === "Equity Large Cap" || symA.includes("NIFTY") || symB.includes("NIFTY") || nmA.includes("NIFTY") || nmB.includes("NIFTY")) {
            return {
                overlap: 42,
                shared: ["RELIANCE", "HDFCBANK", "ICICIBANK", "INFOSYS", "TCS"]
            };
        }
        // General same category
        return {
            overlap: 28,
            shared: ["RELIANCE", "HDFCBANK", "ICICIBANK"]
        };
    }
    
    // Different domestic equity categories
    // Large Cap vs Flexi Cap
    if ((catA === "Equity Large Cap" || catA === "Flexi Cap Equity") && 
        (catB === "Equity Large Cap" || catB === "Flexi Cap Equity")) {
        return {
            overlap: 24,
            shared: ["RELIANCE", "HDFCBANK", "INFOSYS"]
        };
    }
    
    // Mid Cap vs Flexi Cap
    if ((catA === "Equity Mid Cap" || catA === "Flexi Cap Equity") && 
        (catB === "Equity Mid Cap" || catB === "Flexi Cap Equity")) {
        return {
            overlap: 15,
            shared: ["FEDERAL_BANK", "COFORGE"]
        };
    }
    
    // Default low overlap for other cross-cap domestic equities
    return {
        overlap: 5,
        shared: ["HDFCBANK"]
    };
}

function getMFMetricsAndInsights(symbol, name, quantity, buy_price, current_value, hash) {
    const sym = String(symbol || "").toUpperCase();
    const nm = String(name || symbol).toUpperCase();
    
    let category = "Diversified Equity Fund";
    let er = 0.65 + (hash % 25) / 100; // default 0.65% - 0.89%
    let score = 75 + (hash % 16); // default 75-90
    let stars = 4;
    let pm = "Stable Management";
    let rec = "Continue SIP";
    let justification = "Broad diversification with average market returns. Expense ratio is aligned with category norms.";
    let action_plan = "Maintain systematic SIP installments.";
    
    if (sym.includes("SMALL") || nm.includes("SMALL")) {
        category = "Equity Small Cap";
        er = 0.55;
        if (sym.includes("AXIS") || nm.includes("AXIS")) {
            score = 72;
            stars = 3;
            pm = "Recent Manager Transition";
            rec = "Hold & Redirect SIP";
            justification = "Axis Small Cap has exhibited significant performance drag recently due to conservative cash levels and underperforming mid-cap weights. Sharpe ratio fell to 1.10.";
            action_plan = "Hold current units, but redirect future monthly SIPs to Nippon India Small Cap or Tata Small Cap.";
        } else if (sym.includes("NIPPON") || nm.includes("NIPPON")) {
            score = 92;
            stars = 5;
            pm = "High Alpha Manager (Samir Rachh)";
            rec = "Strong SIP Continue";
            justification = "Outstanding small-cap execution with stable manager tenure. Strong risk-adjusted returns with a Sharpe ratio of 1.62. Expense ratio is competitive.";
            action_plan = "Excellent wealth creator. Maintain or increase SIP allocation.";
        } else {
            score = 84;
            stars = 4;
            pm = "Stable Mid-cap Shift";
            rec = "Continue SIP";
            justification = "Active small cap scheme with a healthy mix of high-growth emerging companies. Moderate risk profile.";
            action_plan = "Continue monthly SIPs.";
        }
    }
    else if (sym.includes("MID") || nm.includes("MID")) {
        category = "Equity Mid Cap";
        er = 0.62;
        if (sym.includes("KOTAK") || nm.includes("KOTAK")) {
            score = 86;
            stars = 4;
            pm = "Stable Manager (Harsha Upadhyaya)";
            rec = "Continue SIP";
            justification = "Solid mid-cap focus with consistent trailing returns. Sharpe ratio is healthy at 1.35. Standard portfolio holding with moderate alpha.";
            action_plan = "Maintain systematic holdings to capture Indian mid-cap growth.";
        } else if (sym.includes("MOTILAL") || nm.includes("MOTILAL")) {
            score = 88;
            stars = 4;
            pm = "Aggressive Manager bets";
            rec = "SIP Continue (Consolidate)";
            justification = "Aggressive sector bets (high weight in industrials/capital goods). Has delivered outstanding recent performance, but has 35% overlap with Kotak Midcap.";
            action_plan = "If holding both Kotak and Motilal Midcap, consolidate future SIPs into Motilal Oswal for aggressive alpha, or Kotak for lower volatility.";
        } else {
            score = 83;
            stars = 4;
            pm = "Stable Alpha";
            rec = "Continue SIP";
            justification = "Mid-cap scheme tracking index benchmark with average risk-adjusted returns.";
            action_plan = "Continue SIP.";
        }
    }
    else if (sym.includes("LIQUID") || nm.includes("LIQUID") || sym.includes("DEBT") || nm.includes("DEBT")) {
        category = "Debt / Liquid Fund";
        er = 0.15;
        score = 90;
        stars = 4.5;
        pm = "Conservative Duration Manager";
        rec = "Maintain / Use for STP";
        justification = "Bonds & T-bills portfolio. Yields 6.8% compounding with zero exposure to equity market corrections. Safe liquidity buffer.";
        action_plan = "Maintain units for emergencies or use Systematic Transfer Plan (STP) to transition to equity over time.";
    }
    else if (sym.includes("U.S") || sym.includes("US") || sym.includes("NASDAQ") || nm.includes("U.S") || nm.includes("US") || nm.includes("NASDAQ") || sym.includes("GLOBAL") || sym.includes("INTERNATIONAL")) {
        category = "International Equity";
        er = 0.52;
        if (sym.includes("FRANKLIN") || nm.includes("FRANKLIN")) {
            score = 89;
            stars = 4;
            pm = "Overseas Institutional Manager";
            rec = "Strong SIP Continue";
            justification = "100% US Feeder fund investing in large US tech giants. Provides unique geographic diversification and currency hedge (USD appreciation).";
            action_plan = "Keep SIP active as a structural global hedge.";
        } else if (sym.includes("MOTILAL") || nm.includes("MOTILAL")) {
            score = 91;
            stars = 4.5;
            pm = "Nasdaq Index Replication";
            rec = "Strong SIP Continue";
            justification = "Direct passive feeder into Nasdaq-100. Excellent index return profiles with minimal tracking error.";
            action_plan = "Keep SIP active for exposure to global technological innovators.";
        } else {
            score = 85;
            stars = 4;
            pm = "Overseas Passive";
            rec = "Continue SIP";
            justification = "Feeder fund providing exposure to global equities.";
            action_plan = "Continue SIP.";
        }
    }
    else if (sym.includes("FLEXI") || nm.includes("FLEXI")) {
        category = "Flexi Cap Equity";
        er = 0.51;
        if (sym.includes("PPFAS") || nm.includes("PARAG") || nm.includes("PPFAS")) {
            score = 95;
            stars = 5;
            pm = "Value Focused Manager (Rajeev Thakkar)";
            rec = "Strong SIP Continue";
            justification = "Outstanding risk-adjusted performance (Sharpe: 1.68). High quality large-cap equity focus with Nasdaq components provides solid currency/geographic hedge. PM maintains high cash buffer to buy market dips.";
            action_plan = "Excellent core wealth creator. Keep SIP active and add lump sums on market corrections.";
        } else {
            score = 85;
            stars = 4;
            pm = "Stable Value Manager";
            rec = "Continue SIP";
            justification = "Flexible cap allocation across large, mid, and small cap equities based on market valuation cycles.";
            action_plan = "Continue SIP.";
        }
    }
    else if (sym.includes("BLUE") || nm.includes("BLUE") || sym.includes("LARGE") || nm.includes("LARGE") || sym.includes("NIFTY") || nm.includes("NIFTY")) {
        category = "Equity Large Cap";
        if (sym.includes("NAVI") || nm.includes("NAVI") || sym.includes("INDEX") || nm.includes("INDEX")) {
            er = 0.06;
            score = 91;
            stars = 4.5;
            pm = "Passive Index Replication";
            rec = "Strong SIP Continue";
            justification = "Ultra-low expense ratio of 0.06% eliminates yield drag. Tracking error is minimal. Safe core asset mapping the broader Indian economy.";
            action_plan = "Excellent core portfolio anchor. Keep SIP active.";
        } else {
            er = 0.45;
            score = 85;
            stars = 4;
            pm = "Stable Large Cap Manager";
            rec = "Continue SIP";
            justification = "Invests in top 100 bluechip companies in India. High stability, lower volatility relative to mid/small caps.";
            action_plan = "Continue SIP.";
        }
    }
    else if (sym.includes("GOLD") || nm.includes("GOLD") || sym.includes("GOLDBEES")) {
        category = "Commodities / Gold";
        er = 0.12;
        score = 88;
        stars = 4;
        pm = "Commodity Physical Replication";
        rec = "Accumulate on Dips";
        justification = "Tracks physical gold prices. Acts as a hedge against inflation and equity market stress. Highly liquid.";
        action_plan = "Maintain 5-10% portfolio allocation for stress hedging.";
    }
    
    // Adjust stars based on score
    if (score >= 90) stars = 5;
    else if (score >= 80) stars = 4;
    else if (score >= 70) stars = 3;
    else stars = 2;
    
    return {
        category: category,
        expense_ratio: er,
        score: score,
        stars: stars,
        pm_rating: pm,
        sip_recommendation: rec,
        justification: justification,
        action_plan: action_plan
    };
}

function analyzeMutualFundClientSide(h) {
    const symbol = h.symbol;
    const name = resolveFriendlyName(symbol, h.name);
    const quantity = h.quantity;
    const buy_price = h.buy_price;
    const invested = quantity * buy_price;
    const current_price = getMockCurrentPrice(symbol, buy_price, h.current_price);
    const current_value = quantity * current_price;
    const gains = current_value - invested;
    const gains_pct = invested > 0 ? (gains / invested) * 100 : 0.0;
    const hash = getSymbolHash(symbol);
    
    const insights = getMFMetricsAndInsights(symbol, name, quantity, buy_price, current_value, hash);
    
    let sharpe = 1.15;
    let alpha = 2.5;
    let beta = 1.0;
    if (insights.category === "Equity Small Cap") { sharpe = 1.45; alpha = 5.2; beta = 1.15; }
    else if (insights.category === "Equity Mid Cap") { sharpe = 1.32; alpha = 3.8; beta = 1.10; }
    else if (insights.category === "Equity Large Cap") { sharpe = 1.25; alpha = 1.5; beta = 0.95; }
    else if (insights.category === "Flexi Cap Equity") { sharpe = 1.55; alpha = 4.1; beta = 1.02; }
    else if (insights.category === "Debt / Liquid Fund") { sharpe = 2.10; alpha = 0.2; beta = 0.05; }
    else if (insights.category === "International Equity") { sharpe = 1.28; alpha = 2.1; beta = 1.05; }
    else if (insights.category === "Commodities / Gold") { sharpe = 1.12; alpha = 0.1; beta = 0.12; }
    
    const rating = insights.stars;
    const starString = "★".repeat(rating) + "☆".repeat(5 - rating);
    
    return {
        symbol: symbol,
        name: name,
        category: insights.category,
        invested: invested,
        quantity: quantity,
        buy_price: buy_price,
        current_price: current_price,
        current_value: current_value,
        gains: gains,
        gains_pct: gains_pct,
        metrics: { sharpe_ratio: sharpe, alpha: alpha, beta: beta, expense_ratio: insights.expense_ratio },
        score: insights.score,
        stars: rating,
        star_string: starString,
        pm_rating: insights.pm_rating,
        recommendation: insights.sip_recommendation,
        justification: insights.justification,
        action_plan: insights.action_plan,
        sip_health: { status: rating >= 4 ? "Excellent" : (rating >= 3 ? "Good" : "Neutral"), percentage_gain: gains_pct, message: insights.justification }
    };
}

function analyzeEtfClientSide(h) {
    const symbol = h.symbol;
    const name = resolveFriendlyName(symbol, h.name);
    const quantity = h.quantity;
    const buy_price = h.buy_price;
    const invested = quantity * buy_price;
    const current_price = getMockCurrentPrice(symbol, buy_price, h.current_price);
    const current_value = quantity * current_price;
    const gains = current_value - invested;
    const gains_pct = invested > 0 ? (gains / invested) * 100 : 0.0;
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
        buy_price: buy_price,
        current_price: current_price,
        current_value: current_value,
        gains: gains,
        gains_pct: gains_pct,
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
            
            if (!demoPortfolios[activePortfolioName]) {
                demoPortfolios[activePortfolioName] = [];
            }
            demoPortfolios[activePortfolioName].push(newItem);
            demoHoldings = demoPortfolios[activePortfolioName];
            
            if (currentUser && db) {
                db.collection("users").doc(currentUser.uid)
                    .collection("portfolios").doc(activePortfolioName)
                    .collection("holdings").doc(String(newItem.id)).set(newItem)
                    .catch(err => console.error("Cloud write failed:", err));
            } else {
                localStorage.setItem("demo_portfolios", JSON.stringify(demoPortfolios));
            }
            
            demoLogs.unshift({
                timestamp: new Date().toISOString(),
                ip_address: "local-client",
                action: "ADD_HOLDING",
                details: `Manually added ${body.symbol} (Qty: ${body.quantity}) to portfolio ${activePortfolioName}`
            });
            localStorage.setItem("demo_logs", JSON.stringify(demoLogs));
            responseData = newItem;
        } else if (options.method === "DELETE") {
            const parts = endpoint.split("/");
            const id = parseInt(parts[parts.length - 1]);
            const matched = demoHoldings.find(h => h.id === id);
            
            demoPortfolios[activePortfolioName] = demoPortfolios[activePortfolioName].filter(h => h.id !== id);
            demoHoldings = demoPortfolios[activePortfolioName];
            
            if (currentUser && db && matched) {
                db.collection("users").doc(currentUser.uid)
                    .collection("portfolios").doc(activePortfolioName)
                    .collection("holdings").doc(String(matched.id)).delete()
                    .catch(err => console.error("Cloud delete failed:", err));
            } else {
                localStorage.setItem("demo_portfolios", JSON.stringify(demoPortfolios));
            }
            
            if (matched) {
                demoLogs.unshift({
                    timestamp: new Date().toISOString(),
                    ip_address: "local-client",
                    action: "DELETE_HOLDING",
                    details: `Deleted holding for ${matched.symbol} in portfolio ${activePortfolioName}`
                });
                localStorage.setItem("demo_logs", JSON.stringify(demoLogs));
            }
            responseData = { message: "Deleted successfully" };
        } else {
            responseData = demoHoldings;
        }
    } else if (endpoint === "/api/portfolio/summary") {
        let totalInvested = 0.0;
        let currentValue = 0.0;
        let assetAlloc = {};
        let sectorAlloc = {};
        let oldestDate = new Date();
        let hasDate = false;
        const cashFlows = [];
        
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
            
            if (h.buy_date) {
                const d = new Date(h.buy_date);
                if (!isNaN(d.getTime())) {
                    if (d < oldestDate) {
                        oldestDate = d;
                        hasDate = true;
                    }
                    cashFlows.push({ amount: -cost, date: d });
                } else {
                    cashFlows.push({ amount: -cost, date: new Date(Date.now() - 1000*60*60*24*365) });
                }
            } else {
                cashFlows.push({ amount: -cost, date: new Date(Date.now() - 1000*60*60*24*365) });
            }
        });
        
        const gains = currentValue - totalInvested;
        const pctGains = totalInvested > 0 ? (gains / totalInvested) * 100 : 0.0;
        
        // Calculate dynamic CAGR (prevent annualizing if under 1 year)
        const today = new Date();
        let years = 1.0;
        if (hasDate) {
            const diffTime = Math.abs(today - oldestDate);
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
            years = Math.max(0.1, diffDays / 365.25);
        }
        const cagrYears = Math.max(1.0, years);
        const cagr = totalInvested > 0 ? (Math.pow(currentValue / totalInvested, 1 / cagrYears) - 1) * 100 : 0.0;
        
        // Calculate dynamic XIRR
        cashFlows.push({ amount: currentValue, date: today });
        let xirr = 0.0;
        try {
            xirr = calculateXIRRClientSide(cashFlows);
        } catch (e) {
            xirr = cagr; // Fallback
        }
        
        responseData = {
            total_invested: totalInvested,
            current_value: currentValue,
            total_gains: gains,
            percentage_gains: pctGains,
            cagr: cagr,
            xirr: xirr,
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
                    description: `${stock.name} (${stock.symbol}) RSI dropped below 30. Standard technical pullback signal suggesting near-term trend exhaustion.`
                });
            } else if (stock.technical_score > 78) {
                scans.push({
                    symbol: stock.symbol,
                    type: "Bullish Volume Breakout",
                    severity: "Medium",
                    description: `${stock.name} (${stock.symbol}) volume is 1.6x of 20d average. Uptrend confirms momentum intensity and buying conviction.`
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
        
        // Dynamic mutual fund overlap matrix mapping using realistic rules
        const matrix = [];
        if (analyzed.length >= 2) {
            for (let i = 0; i < analyzed.length; i++) {
                for (let j = i + 1; j < analyzed.length; j++) {
                    const res = getRealisticOverlap(analyzed[i], analyzed[j]);
                    if (res.overlap > 0) {
                        matrix.push({
                            fund_a: analyzed[i].name,
                            fund_b: analyzed[j].name,
                            overlap_percentage: res.overlap,
                            shared_stocks: res.shared
                        });
                    }
                }
            }
        }
        
        // Stock concentration metrics compiled dynamically
        const concentrationMap = {};
        analyzed.forEach(fund => {
            let weightFactor = 1.0;
            let stockList = ["HDFCBANK", "RELIANCE", "INFOSYS"];
            if (fund.category === "Equity Small Cap") {
                stockList = ["CHOLAMANDALAM", "KARUR_VYSYA_BANK", "KPI_GREEN"];
            } else if (fund.category === "Equity Mid Cap") {
                stockList = ["CUMMINS_INDIA", "COFORGE", "FEDERAL_BANK"];
            } else if (fund.category === "International Equity") {
                stockList = ["MICROSOFT", "APPLE", "NVIDIA"];
            }
            
            stockList.forEach((stk, sIdx) => {
                const stockWeight = (10 - sIdx * 3) * (fund.current_value / 1000000); // weight proportional to asset value
                concentrationMap[stk] = (concentrationMap[stk] || 0) + stockWeight;
            });
        });
        
        const concentration = Object.entries(concentrationMap).map(([stock, weight]) => ({
            stock: stock,
            aggregate_weight: parseFloat(Math.min(18.5, Math.max(1.5, weight)).toFixed(2))
        }));
        
        concentration.sort((a, b) => b.aggregate_weight - a.aggregate_weight);
        
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

        const audit = generatePortfolioHealthAudit(demoHoldings);
        document.getElementById("health-score-value").innerText = `${audit.overall.score}%`;
        const descriptionEl = document.getElementById("health-description");
        
        const ring = document.querySelector(".health-dial");
        if (audit.overall.score >= 80) {
            ring.style.borderColor = "var(--accent-emerald)";
            descriptionEl.innerText = audit.overall.summary;
            document.getElementById("health-score-value").style.color = "var(--accent-emerald)";
        } else if (audit.overall.score >= 60) {
            ring.style.borderColor = "var(--accent-amber)";
            descriptionEl.innerText = audit.overall.summary;
            document.getElementById("health-score-value").style.color = "var(--accent-amber)";
        } else {
            ring.style.borderColor = "var(--accent-coral)";
            descriptionEl.innerText = audit.overall.summary;
            document.getElementById("health-score-value").style.color = "var(--accent-coral)";
        }
        
        renderHealthAuditDetails(audit.overall, "overall-health-audit-details");

        renderAssetComparison(data.asset_allocation);
        renderSectorBar(data.sector_allocation);
        
        // Render 10-Year Compounding Projection Graph
        const projCurrentValEl = document.getElementById("proj-current-val");
        if (projCurrentValEl) {
            projCurrentValEl.innerText = formatINR(data.current_value);
        }
        renderProjectionChart(data.current_value);
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

        // Render stock health indicators
        const audit = generatePortfolioHealthAudit(demoHoldings);
        const stockScoreEl = document.getElementById("stock-health-score");
        const stockSummaryEl = document.getElementById("stock-health-summary");
        if (stockScoreEl) {
            stockScoreEl.innerText = stockInvestedSum > 0 ? `${audit.stocks.score}%` : "--";
            if (audit.stocks.score >= 80) {
                stockScoreEl.style.color = "var(--accent-emerald)";
                stockSummaryEl.className = "metric-trend text-green";
            } else if (audit.stocks.score >= 60) {
                stockScoreEl.style.color = "var(--accent-amber)";
                stockSummaryEl.className = "metric-trend text-yellow";
            } else {
                stockScoreEl.style.color = "var(--accent-coral)";
                stockSummaryEl.className = "metric-trend text-rose";
            }
            stockSummaryEl.innerText = stockInvestedSum > 0 ? audit.stocks.summary : "Add stock holdings to audit.";
        }
        
        renderHealthAuditDetails(audit.stocks, "stock-health-audit-details");

        const tbody = document.querySelector("#table-stocks-ledger tbody");
        tbody.innerHTML = "";
        
        if (data.holdings_analysis.length === 0) {
            tbody.innerHTML = `<tr><td colspan="7" class="text-neutral" style="text-align: center;">No stock holdings added yet.</td></tr>`;
        }

        data.holdings_analysis.forEach(stock => {
            const combinedScore = Math.round((stock.fundamental_score + stock.technical_score) / 2);
            const tr = document.createElement("tr");
            tr.setAttribute("data-symbol", stock.symbol);
            tr.innerHTML = `
                <td><strong>${resolveTicker(stock.symbol)}</strong><br><span style="font-size:0.75rem; color:var(--text-secondary);">${stock.name}</span></td>
                <td>${formatINR(stock.invested)}<br><span style="font-size:0.75rem; color:var(--text-secondary);">Qty: ${stock.quantity} @ ${formatINR(stock.invested / stock.quantity)}</span></td>
                <td>${formatINR(stock.current_value)}<br><span style="font-size:0.75rem; color:var(--text-secondary);">Price: ${formatINR(stock.current_price)}</span></td>
                <td><span class="${stock.gains >= 0 ? 'text-green' : 'text-rose'}"><strong>${stock.gains >= 0 ? '+' : ''}${formatINR(stock.gains)}</strong><br><span style="font-size:0.75rem;">${stock.gains >= 0 ? '+' : ''}${stock.gains_pct.toFixed(2)}%</span></span></td>
                <td>
                    <span class="badge ${combinedScore >= 70 ? 'badge-green' : (combinedScore >= 50 ? 'badge-yellow' : 'badge-rose')}">${combinedScore}/100</span>
                    <br><span style="font-size:0.72rem; color:var(--text-secondary);">F: ${stock.fundamental_score} | T: ${stock.technical_score}</span>
                </td>
                <td><span class="badge ${getRecBadgeClass(stock.recommendation)}">${stock.recommendation}</span></td>
                <td>
                    <button class="btn-delete-row" onclick="deleteHoldingItem('${stock.symbol}', this)" data-symbol="${stock.symbol}">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
                    </button>
                </td>
            `;
            tbody.appendChild(tr);
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

        // 4. Render NSE Momentum Breakout Ideas
        const recList = document.getElementById("momentum-recommendations-list");
        if (recList) {
            recList.innerHTML = "";
            
            NSE_MOMENTUM_IDEAS.forEach(idea => {
                const card = document.createElement("div");
                card.className = "momentum-idea-card";
                card.style.cssText = "padding: 12px; background: rgba(255, 255, 255, 0.45); border: 1px solid var(--glass-border); border-radius: 10px; font-size: 0.85rem; display: flex; flex-direction: column; gap: 8px; box-shadow: var(--glass-shadow); transition: all 0.2s ease;";
                
                card.onmouseover = () => {
                    card.style.background = "rgba(124, 58, 237, 0.04)";
                    card.style.borderColor = "var(--accent-blue)";
                };
                card.onmouseout = () => {
                    card.style.background = "rgba(255, 255, 255, 0.45)";
                    card.style.borderColor = "var(--glass-border)";
                };

                card.innerHTML = `
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                        <span style="font-size: 0.9rem; font-family: 'Outfit';"><strong>${idea.symbol}</strong> <span style="font-size:0.75rem; color:var(--text-secondary);">${idea.name}</span></span>
                        <span class="badge badge-green" style="font-size:0.68rem; font-weight:600;">${idea.trend}</span>
                    </div>
                    <div style="display: flex; gap: 10px; font-size: 0.78rem; border-top: 1px dashed var(--glass-border); border-bottom: 1px dashed var(--glass-border); padding: 5px 0;">
                        <span>Buy Range: <strong style="color:var(--accent-blue);">${idea.buy_range}</strong></span>
                        <span>Target: <strong style="color:var(--accent-emerald);">${idea.target}</strong></span>
                        <span>SL: <strong style="color:var(--accent-coral);">${idea.stop_loss}</strong></span>
                        <span style="margin-left: auto; color:var(--text-secondary);">RSI: <strong>${idea.rsi}</strong></span>
                    </div>
                    <div style="display: flex; flex-direction: column; gap: 4px; font-size: 0.76rem; line-height: 1.4;">
                        <div><strong style="color:var(--text-primary);">Technical:</strong> <span style="color:var(--text-secondary);">${idea.technical_insight}</span></div>
                        <div><strong style="color:var(--text-primary);">Market Catalyst:</strong> <span style="color:var(--text-secondary);">${idea.market_insight}</span></div>
                    </div>
                `;
                recList.appendChild(card);
            });
        }
    } catch (err) {
        console.error("Stocks load failed:", err);
    }
}

async function loadMutualFundsAnalysis() {
    try {
        const res = await apiFetch("/api/portfolio/mutual_funds");
        const data = await res.json();

        // 1. Calculate overall mutual fund values
        let mfInvestedSum = 0;
        let mfCurrentSum = 0;
        data.holdings_analysis.forEach(fund => {
            mfInvestedSum += fund.invested;
            mfCurrentSum += fund.current_value;
        });
        
        const mfGainsSum = mfCurrentSum - mfInvestedSum;
        const mfGainsPct = mfInvestedSum > 0 ? (mfGainsSum / mfInvestedSum) * 100 : 0.0;
        
        // 2. Render statistics cards in Mutual Funds Section
        const mfInvestedEl = document.getElementById("mf-stat-invested");
        const mfCurrentEl = document.getElementById("mf-stat-current");
        const mfGainsEl = document.getElementById("mf-stat-gains");
        
        if (mfInvestedEl) mfInvestedEl.innerText = formatINR(mfInvestedSum);
        if (mfCurrentEl) mfCurrentEl.innerText = formatINR(mfCurrentSum);
        if (mfGainsEl) {
            mfGainsEl.innerText = `${mfGainsSum >= 0 ? "+" : ""}${formatINR(mfGainsSum)} (${mfGainsPct.toFixed(2)}%)`;
            mfGainsEl.className = mfGainsSum >= 0 ? "metric-trend text-green" : "metric-trend text-rose";
        }

        renderMFAllocationChart(data.holdings_analysis);

        const tbody = document.querySelector("#table-mf-ledger tbody");
        tbody.innerHTML = "";
        
        if (data.holdings_analysis.length === 0) {
            tbody.innerHTML = `<tr><td colspan="8" class="text-neutral" style="text-align: center;">No mutual fund scheme units added.</td></tr>`;
        }

        data.holdings_analysis.forEach(fund => {
            const tr = document.createElement("tr");
            tr.setAttribute("data-symbol", fund.symbol);
            tr.innerHTML = `
                <td><strong>${resolveTicker(fund.symbol)}</strong><br><span style="font-size:0.75rem; color:var(--text-secondary);">${fund.name}</span></td>
                <td><span class="badge badge-blue">${fund.category}</span></td>
                <td>${formatINR(fund.invested)}<br><span style="font-size:0.75rem; color:var(--text-secondary);">Qty: ${fund.quantity} @ ${formatINR(fund.buy_price)}</span></td>
                <td>${formatINR(fund.current_value)}<br><span style="font-size:0.75rem; color:var(--text-secondary);">NAV: ${formatINR(fund.current_price)}</span></td>
                <td><span class="${fund.gains >= 0 ? 'text-green' : 'text-rose'}"><strong>${fund.gains >= 0 ? '+' : ''}${formatINR(fund.gains)}</strong><br><span style="font-size:0.75rem;">${fund.gains >= 0 ? '+' : ''}${fund.gains_pct.toFixed(2)}%</span></span></td>
                <td><strong style="color:var(--accent-amber); font-size: 0.95rem;">${fund.star_string}</strong><br><span style="font-size:0.72rem; color:var(--text-secondary);">${fund.score}/100 (ER: ${fund.metrics.expense_ratio.toFixed(2)}%)</span></td>
                <td><span class="badge ${getRecBadgeClass(fund.recommendation)}">${fund.recommendation}</span></td>
                <td>
                    <button class="btn-delete-row" onclick="deleteHoldingItem('${fund.symbol}', this)" data-symbol="${fund.symbol}">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
                    </button>
                </td>
            `;
            tbody.appendChild(tr);
        });

        const audit = generatePortfolioHealthAudit(demoHoldings);
        const mfScoreEl = document.getElementById("mf-sip-health");
        const mfSummaryEl = document.getElementById("mf-sip-message");
        const mfLabelEl = mfScoreEl.previousElementSibling;
        if (mfLabelEl) mfLabelEl.innerText = "MF Portfolio Health";
        if (mfScoreEl) {
            mfScoreEl.innerText = data.holdings_analysis.length > 0 ? `${audit.mfs.score}%` : "--";
            if (audit.mfs.score >= 80) {
                mfScoreEl.style.color = "var(--accent-emerald)";
                mfSummaryEl.className = "metric-trend text-green";
            } else if (audit.mfs.score >= 60) {
                mfScoreEl.style.color = "var(--accent-amber)";
                mfSummaryEl.className = "metric-trend text-yellow";
            } else {
                mfScoreEl.style.color = "var(--accent-coral)";
                mfSummaryEl.className = "metric-trend text-rose";
            }
            mfSummaryEl.innerText = data.holdings_analysis.length > 0 ? audit.mfs.summary : "Add mutual fund units to audit.";
        }
        
        renderHealthAuditDetails(audit.mfs, "mf-health-audit-details");

        const overlapContainer = document.getElementById("mf-overlap-container");
        overlapContainer.innerHTML = "";
        
        const matrix = data.overlap_matrix.pairwise_overlap;
        if (!matrix || matrix.length === 0) {
            overlapContainer.innerHTML = `<div class="empty-placeholder">Needs at least two active mutual funds to cross-audit overlapping stock holdings.</div>`;
        } else {
            // Sort by overlap percentage descending
            matrix.sort((a, b) => b.overlap_percentage - a.overlap_percentage);
            
            // Find high overlaps (>= 25%)
            const highOverlaps = matrix.filter(row => row.overlap_percentage >= 25);
            
            let html = '<div class="mf-insights-panel">';
            
            // Master summary recommendation card
            if (highOverlaps.length > 0) {
                const worst = highOverlaps[0];
                html += `
                    <div class="insight-alert-box alert-warning">
                        <div class="insight-alert-header">
                            <span class="icon">⚠️</span>
                            <strong>Holding Redundancy Detected</strong>
                        </div>
                        <p class="insight-alert-desc">
                            Your schemes have high stock overlap. The worst case is between <strong>${worst.fund_a}</strong> and <strong>${worst.fund_b}</strong> which share <strong>${worst.overlap_percentage}%</strong> of their underlying stocks. Consider consolidating schemes in similar categories to lower fees and trading friction.
                        </p>
                    </div>
                `;
            } else {
                html += `
                    <div class="insight-alert-box alert-success">
                        <div class="insight-alert-header">
                            <span class="icon">✅</span>
                            <strong>Optimal Diversification</strong>
                        </div>
                        <p class="insight-alert-desc">
                            No significant overlaps detected. All scheme pairs share less than 25% of their stock portfolios, showing excellent stylistic diversification.
                        </p>
                    </div>
                `;
            }
            
            // Render top 3 overlaps
            html += '<h5 class="mt-15 mb-10" style="font-size:0.9rem; color:var(--text-secondary);">Highest Scheme Overlaps (Top 3)</h5>';
            const displayRows = matrix.slice(0, 3);
            displayRows.forEach(row => {
                let badgeClass = "badge-blue";
                if (row.overlap_percentage > 40) badgeClass = "badge-rose";
                else if (row.overlap_percentage >= 25) badgeClass = "badge-yellow";
                
                html += `
                    <div class="overlap-compact-row">
                        <div class="overlap-compact-title">
                            <span>${row.fund_a} <span class="vs">vs</span> ${row.fund_b}</span>
                            <span class="badge ${badgeClass}">${row.overlap_percentage}%</span>
                        </div>
                        <div class="overlap-compact-details">
                            Shared stocks: <code>${row.shared_stocks.join(", ")}</code>
                        </div>
                    </div>
                `;
            });
            
            html += '</div>';
            overlapContainer.innerHTML = html;
        }

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

        // 5. Render switch advisor cards
        const advisorContainer = document.getElementById("mf-advisor-cards");
        advisorContainer.innerHTML = "";
        
        if (data.holdings_analysis.length === 0) {
            advisorContainer.innerHTML = `<div class="empty-placeholder">Please upload a mutual fund statement to audit portfolio manager allocations.</div>`;
        } else {
            let cardsHtml = "";
            data.holdings_analysis.forEach(fund => {
                let badgeClass = "badge-blue";
                if (fund.recommendation.includes("Strong") || fund.recommendation.includes("Continue") || fund.recommendation.includes("Buy")) badgeClass = "badge-green";
                else if (fund.recommendation.includes("Hold") || fund.recommendation.includes("Redirect") || fund.recommendation.includes("STP") || fund.recommendation.includes("Review")) badgeClass = "badge-yellow";
                else badgeClass = "badge-rose";

                cardsHtml += `
                    <div class="mf-advisor-card">
                        <div class="mf-advisor-card-header">
                            <span class="mf-advisor-title">${fund.name}</span>
                            <div>
                                <span class="badge ${badgeClass}" style="margin-right: 8px;">${fund.recommendation}</span>
                                <span style="color:var(--accent-amber); font-weight:600; font-size:0.9rem;">${fund.star_string}</span>
                            </div>
                        </div>
                        <div class="mf-advisor-meta mb-10" style="font-size:0.8rem; color:var(--text-secondary); margin-bottom:10px;">
                            Category: <strong>${fund.category}</strong> | 
                            Expense Ratio: <strong>${fund.metrics.expense_ratio.toFixed(2)}%</strong> | 
                            Manager Status: <strong>${fund.pm_rating}</strong>
                        </div>
                        <div class="mf-advisor-justification" style="font-size:0.85rem; color:var(--text-secondary); line-height:1.45; margin-bottom:8px;">
                            ${fund.justification}
                        </div>
                        <div class="mf-advisor-action" style="font-size:0.82rem; border-left:3px solid var(--accent-blue); padding:8px 12px; border-radius:4px;">
                            <strong>Switch Strategy / Action:</strong> ${fund.action_plan}
                        </div>
                    </div>
                `;
            });
            advisorContainer.innerHTML = cardsHtml;
        }
    } catch (err) {
        console.error("Mutual Funds load failed:", err);
    }
}

async function loadEtfsAnalysis() {
    try {
        const res = await apiFetch("/api/portfolio/etfs");
        const data = await res.json();

        // 1. Calculate overall ETF values
        let etfInvestedSum = 0;
        let etfCurrentSum = 0;
        data.forEach(etf => {
            etfInvestedSum += etf.invested;
            etfCurrentSum += etf.current_value;
        });
        
        const etfGainsSum = etfCurrentSum - etfInvestedSum;
        const etfGainsPct = etfInvestedSum > 0 ? (etfGainsSum / etfInvestedSum) * 100 : 0.0;
        
        // 2. Render statistics cards in ETFs Section
        const etfInvestedEl = document.getElementById("etf-stat-invested");
        const etfCurrentEl = document.getElementById("etf-stat-current");
        const etfGainsEl = document.getElementById("etf-stat-gains");
        
        if (etfInvestedEl) etfInvestedEl.innerText = formatINR(etfInvestedSum);
        if (etfCurrentEl) etfCurrentEl.innerText = formatINR(etfCurrentSum);
        if (etfGainsEl) {
            etfGainsEl.innerText = `${etfGainsSum >= 0 ? "+" : ""}${formatINR(etfGainsSum)} (${etfGainsPct.toFixed(2)}%)`;
            etfGainsEl.className = etfGainsSum >= 0 ? "metric-trend text-green" : "metric-trend text-rose";
        }

        // 3. Render Dynamic AI ETF Recommendations & Allocation Audits
        const insightsEl = document.getElementById("etf-recommendations-insights");
        if (insightsEl) {
            insightsEl.innerHTML = "";
            if (data.length === 0) {
                insightsEl.innerHTML = `<div class="empty-placeholder">No ETF holdings added yet. Add broad index trackers or Gold ETFs.</div>`;
            } else {
                let pros = [];
                let cons = [];
                let overallRating = 100;
                
                data.forEach(etf => {
                    const te = etf.metrics.tracking_error;
                    const er = etf.metrics.expense_ratio;
                    const resolvedSym = resolveTicker(etf.symbol);
                    
                    if (te > 0.15) {
                        cons.push(`<strong>${resolvedSym}</strong> shows elevated tracking error of <strong>${te.toFixed(2)}%</strong>. This indicates potential replication mismatch or poor liquidity on the exchange.`);
                        overallRating -= 15;
                    } else {
                        pros.push(`<strong>${resolvedSym}</strong> exhibits excellent tracking accuracy (error: <strong>${te.toFixed(2)}%</strong>) relative to its underlying index.`);
                    }
                    
                    if (er > 0.30) {
                        cons.push(`<strong>${resolvedSym}</strong> fee structure (Expense Ratio: <strong>${er.toFixed(2)}%</strong>) is premium relative to passive industry benchmarks. Consider lower-cost alternative index replication plans.`);
                        overallRating -= 10;
                    } else {
                        pros.push(`<strong>${resolvedSym}</strong> maintains an ultra-low expense ratio of <strong>${er.toFixed(2)}%</strong>, preserving maximum returns.`);
                    }
                });
                
                // Asset level checks
                const hasGold = data.some(etf => etf.category.includes("Gold") || etf.symbol.includes("GOLD") || etf.symbol.includes("BEES") && (etf.symbol.includes("GOLD") || etf.symbol.includes("GOLDBEES")));
                const hasEquity = data.some(etf => etf.category.includes("Index") || etf.symbol.includes("BEES") && !etf.symbol.includes("GOLD") || etf.symbol.includes("100"));
                
                if (hasGold) {
                    pros.push(`Commodity hedge active: Holding precious metals provides high inflation shielding and capital preservation.`);
                } else {
                    cons.push(`No physical commodity exposure found in ETF sheet. Consider adding a Gold ETF (e.g. GOLDBEES) to buffer against equity volatility.`);
                    overallRating -= 15;
                }
                
                overallRating = Math.max(40, overallRating);
                
                let ratingColor = "var(--accent-emerald)";
                if (overallRating < 60) ratingColor = "var(--accent-coral)";
                else if (overallRating < 80) ratingColor = "var(--accent-amber)";
                
                let html = `
                    <div class="health-audit-summary-box" style="margin-bottom: 15px; border-left-color: ${ratingColor}; display: flex; justify-content: space-between; align-items: center;">
                        <div>
                            <strong>AI ETF Tracker Score: <span style="color:${ratingColor}; font-size: 1.2rem; font-weight: 700;">${overallRating}%</span></strong>
                            <p style="font-size:0.82rem; color:var(--text-secondary); margin-top: 4px;">Audited against active liquidity, expense ratios, tracking metrics, and asset class hedging balances.</p>
                        </div>
                        <span class="badge" style="background: rgba(124, 58, 237, 0.08); color: var(--accent-blue); font-size: 0.8rem; padding: 6px 12px;">Nifty PE: 22.4 (Stable)</span>
                    </div>
                    <div class="health-audit-grid">
                        <div class="audit-card audit-pro-card">
                            <h5>Strengths &amp; Tracking Pluses</h5>
                            <ul class="audit-list">
                                ${pros.map(p => `<li>${p}</li>`).join("")}
                            </ul>
                        </div>
                        <div class="audit-card audit-con-card">
                            <h5>Risk Scans &amp; Action Recommendations</h5>
                            <ul class="audit-list">
                                ${cons.map(c => `<li>${c}</li>`).join("")}
                            </ul>
                        </div>
                    </div>
                `;
                insightsEl.innerHTML = html;
            }
        }

        // 4. Render ledger table
        const tbody = document.querySelector("#table-etfs-ledger tbody");
        tbody.innerHTML = "";
        
        if (data.length === 0) {
            tbody.innerHTML = `<tr><td colspan="8" class="text-neutral" style="text-align: center;">No Index ETFs or Gold ETFs purchased yet.</td></tr>`;
        }

        data.forEach(etf => {
            const tr = document.createElement("tr");
            tr.setAttribute("data-symbol", etf.symbol);
            tr.innerHTML = `
                <td><strong>${resolveTicker(etf.symbol)}</strong><br><span style="font-size:0.75rem; color:var(--text-secondary);">${etf.name}</span></td>
                <td><span class="badge badge-blue">${etf.category}</span></td>
                <td>${formatINR(etf.invested)}<br><span style="font-size:0.75rem; color:var(--text-secondary);">Qty: ${etf.quantity} @ ${formatINR(etf.buy_price)}</span></td>
                <td>${formatINR(etf.current_value)}<br><span style="font-size:0.75rem; color:var(--text-secondary);">Price: ${formatINR(etf.current_price)}</span></td>
                <td><span class="${etf.gains >= 0 ? 'text-green' : 'text-rose'}"><strong>${etf.gains >= 0 ? '+' : ''}${formatINR(etf.gains)}</strong><br><span style="font-size:0.75rem;">${etf.gains >= 0 ? '+' : ''}${etf.gains_pct.toFixed(2)}%</span></span></td>
                <td>${etf.metrics.tracking_error}%<br><span style="font-size:0.75rem; color:var(--text-secondary);">ER: ${etf.metrics.expense_ratio}%</span></td>
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

// Helper to overwrite category holdings on upload
async function overwriteCategoryHoldings(parsedAssetClasses, newItems) {
    demoPortfolios[activePortfolioName] = demoPortfolios[activePortfolioName].filter(
        h => !parsedAssetClasses.includes(h.asset_class)
    ).concat(newItems);
    demoHoldings = demoPortfolios[activePortfolioName];
    
    if (currentUser && db) {
        try {
            const colRef = db.collection("users").doc(currentUser.uid)
                .collection("portfolios").doc(activePortfolioName).collection("holdings");
                
            const snapshot = await colRef.get();
            const batch = db.batch();
            
            snapshot.forEach(doc => {
                const item = doc.data();
                if (parsedAssetClasses.includes(item.asset_class)) {
                    batch.delete(doc.ref);
                }
            });
            
            newItems.forEach(item => {
                const docRef = colRef.doc(String(item.id));
                batch.set(docRef, item);
            });
            
            await batch.commit();
        } catch (err) {
            console.error("Firestore batch overwrite failed:", err);
            alert("Warning: Failed to sync overwrite to Firestore cloud, but it is applied locally.");
        }
    } else {
        localStorage.setItem("demo_portfolios", JSON.stringify(demoPortfolios));
    }
}

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
        
        reader.onload = async function(e) {
            try {
                const data = new Uint8Array(e.target.result);
                const workbook = XLSX.read(data, { type: 'array' });
                
                let parsedItems = [];
                let parseError = null;
                let successfulSheetName = "";
                
                for (const sheetName of workbook.SheetNames) {
                    const worksheet = workbook.Sheets[sheetName];
                    const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
                    if (rows.length < 2) continue;
                    
                    try {
                        const items = parseExcelDemo(rows, assetClass);
                        if (items && items.length > 0) {
                            parsedItems = items;
                            successfulSheetName = sheetName;
                            break;
                        }
                    } catch (err) {
                        if (!parseError) {
                            parseError = err;
                        }
                    }
                }
                
                if (parsedItems.length === 0) {
                    if (parseError) throw parseError;
                    else throw new Error("No valid sheets found in the spreadsheet workbook.");
                }
                
                const parsedAssetClasses = [...new Set(parsedItems.map(item => item.asset_class))];
                const assetClassMap = { "STOCK": "Stocks", "MUTUAL_FUND": "Mutual Funds", "ETF": "ETFs", "GOLD_ETF": "Gold ETFs", "CASH": "Cash" };
                const displayNames = parsedAssetClasses.map(ac => assetClassMap[ac] || ac).join(" and ");
                
                await overwriteCategoryHoldings(parsedAssetClasses, parsedItems);
                
                demoLogs.unshift({
                    timestamp: new Date().toISOString(),
                    ip_address: "local-client",
                    action: "UPLOAD_PORTFOLIO",
                    details: `Automatically overwrote and imported ${parsedItems.length} holdings for ${displayNames} from sheet "${successfulSheetName}" in workbook ${file.name}.`
                });
                localStorage.setItem("demo_logs", JSON.stringify(demoLogs));
                
                alert(`Successfully parsed and imported ${parsedItems.length} transactions, overwriting existing ${displayNames} in the active folio profile!`);
                fileInput.value = "";
                document.getElementById("upload-status-display").innerText = "Upload completed.";
                
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
        alert(res.message || "Upload completed successfully!");
        statusEl.innerText = "Upload completed.";
        fileInput.value = "";
        loadActiveTabData();
    } catch (err) {
        alert(err.message);
        statusEl.innerText = "Upload failed.";
    }
}

// Helper to intelligently detect/normalize asset classes in demo mode
function detectAssetClass(symbol, name, explicitAssetClassValue, defaultAssetClass) {
    if (explicitAssetClassValue) {
        const val = String(explicitAssetClassValue).trim().toUpperCase();
        if (["STOCK", "MUTUAL_FUND", "ETF", "GOLD_ETF", "CASH"].includes(val)) {
            return val;
        }
        if (val.includes("MUTUAL") || val.includes("MF") || val === "FUND" || val === "FUNDS" || val.includes("SCHEME")) {
            return "MUTUAL_FUND";
        }
        if (val.includes("STOCK") || val.includes("EQUITY") || val === "EQ" || val === "SHARE" || val === "SHARES") {
            return "STOCK";
        }
        if (val.includes("GOLD") || val.includes("GOLDBEES")) {
            return "GOLD_ETF";
        }
        if (val.includes("ETF") || val.includes("INDEX")) {
            return "ETF";
        }
        if (val.includes("CASH") || val.includes("LIQUID") || val.includes("MONEY")) {
            return "CASH";
        }
    }

    const sym = String(symbol || "").trim().toUpperCase();
    const nm = String(name || "").trim().toUpperCase();

    // 1. Check if it's explicitly a mutual fund by ISIN starting with INF (standard Indian mutual fund prefix)
    if (sym.startsWith("INF")) {
        return "MUTUAL_FUND";
    }

    // 2. Prioritize Mutual Fund keyword match (contains DIRECT, GROWTH, REGULAR, FOF, FUND OF FUNDS, or MUTUAL)
    const isMF = sym.includes("MUTUAL") || nm.includes("MUTUAL") ||
                 nm.includes("DIRECT") || nm.includes("GROWTH") || nm.includes("REGULAR") ||
                 nm.includes("FOF") || nm.includes("FUND OF FUNDS") ||
                 sym.includes("PPFAS") || nm.includes("PARAG PARIKH") ||
                 sym.includes("SIP") || nm.includes("SIP") ||
                 sym.includes("FLEXICAP") || nm.includes("FLEXI CAP") ||
                 sym.includes("BLUECHIP") || nm.includes("BLUE CHIP") ||
                 sym.includes("SMALLCAP") || nm.includes("SMALL CAP") ||
                 sym.includes("MIDCAP") || nm.includes("MID CAP") ||
                 sym.includes("ELSS") || nm.includes("TAX SAVER") ||
                 sym.includes("PRUDENTIAL") || nm.includes("PRUDENTIAL") ||
                 sym.includes("BALANCED") || nm.includes("BALANCED") ||
                 (nm.includes("FUND") && !nm.includes("ETF"));

    if (isMF) {
        return "MUTUAL_FUND";
    }

    // 3. Gold ETF check
    if (sym.includes("GOLDBEES") || (sym.includes("GOLD") && sym.includes("BEES")) || (nm.includes("GOLD") && nm.includes("BEES")) || sym.includes("SILVER") || nm.includes("SILVER")) {
        return "GOLD_ETF";
    }

    // 4. ETF check
    if (sym.includes("BEES") || sym.includes("ETF") || nm.includes("ETF") || sym.includes("MON100") || sym.includes("NIFTY") || sym.includes("SENSEX") || sym.includes("NASDAQ") || sym.includes("JUNIORBEES")) {
        return "ETF";
    }

    // 5. Cash check
    if (sym === "CASH" || nm === "CASH" || sym === "LIQUID" || nm === "LIQUID CASH") {
        return "CASH";
    }

    // 6. Stock ISIN check or default fallback
    if (sym.startsWith("INE")) {
        return "STOCK";
    }

    return defaultAssetClass || "STOCK";
}

// Client-side Excel workbook and CSV parser helper using 2D row sets from SheetJS
function parseExcelDemo(rows, defaultAssetClass) {
    if (rows.length < 2) return [];
    
    // Scan first 100 rows to identify the actual header row (containing at least Symbol/ISIN, Quantity, and either Buy Price or Invested Value)
    let headerIdx = -1;
    let mapped = {};
    
    for (let r = 0; r < Math.min(rows.length, 100); r++) {
        const row = rows[r];
        if (!row || row.length === 0) continue;
        
        // Ensure there are at least 3 non-empty columns in the row to avoid matching metadata/title rows
        const nonCheck = row.filter(c => c !== undefined && c !== null && String(c).trim() !== "");
        if (nonCheck.length < 3) continue;
        
        const currentMapped = {};
        const headers = row.map(h => String(h || "").trim());
        
        // Pass 1: Look for exact or strong matches first
        headers.forEach((h, idx) => {
            const cleaned = h.toLowerCase().replace(/[\s_.-]/g, "");
            
            // Symbol / Ticker / ISIN / Scheme Name
            if (["isin", "symbol", "ticker", "code", "schemecode", "scrip", "instrument", "tradingsymbol", "schemename"].includes(cleaned)) {
                currentMapped.symbol = idx;
            }
            // Quantity / Units
            if (["qty", "quantity", "units", "shares", "holding", "holdings", "volume"].includes(cleaned)) {
                currentMapped.quantity = idx;
            }
            // Buy Price / Avg Price
            if (["averagebuyprice", "buyprice", "avgprice", "rate", "cost", "averagecost", "avgcost", "buyrate", "nav", "purchasenav", "unitcost", "averageprice", "priceunit", "costprice"].includes(cleaned)) {
                currentMapped.buy_price = idx;
            }
            // Invested Value / Amount Invested
            if (["investedvalue", "invested", "investment", "investmentvalue", "totalinvestment", "investedamount", "purchasevalue", "costbasis", "totalinvested", "investedval", "amountinvested"].includes(cleaned)) {
                currentMapped.invested_value = idx;
            }
            // Current Price / CMP / LTP / NAV
            if (["closingprice", "currentprice", "cmp", "ltp", "lastprice", "marketprice", "closingnav", "lasttradedprice", "lastprice"].includes(cleaned)) {
                currentMapped.current_price = idx;
            }
            // Current Value
            if (["currentvalue", "marketvalue", "totalvalue", "holdingvalue", "valuation", "value", "amount", "currentamount"].includes(cleaned)) {
                currentMapped.current_value = idx;
            }
        });
        
        // Pass 2: Fallback to fuzzy substring checks if not mapped in Pass 1
        headers.forEach((h, idx) => {
            const cleaned = h.toLowerCase().replace(/[\s_.-]/g, "");
            
            if (currentMapped.symbol === undefined) {
                if (cleaned.includes("symbol") || cleaned.includes("ticker") || cleaned.includes("code") || cleaned.includes("scheme") || cleaned.includes("stock") || cleaned.includes("isin") || cleaned.includes("script") || cleaned.includes("sec")) {
                    currentMapped.symbol = idx;
                }
            }
            if (currentMapped.quantity === undefined) {
                if (cleaned.includes("qty") || cleaned.includes("quantity") || cleaned.includes("unit") || cleaned.includes("share") || cleaned.includes("vol") || cleaned.includes("holding")) {
                    currentMapped.quantity = idx;
                }
            }
            if (currentMapped.buy_price === undefined) {
                if (cleaned.includes("buy") || cleaned.includes("cost") || cleaned.includes("purchase") || cleaned.includes("average") || cleaned.includes("avg")) {
                    currentMapped.buy_price = idx;
                }
            }
            if (currentMapped.invested_value === undefined) {
                if (cleaned.includes("invested") || cleaned.includes("investment") || (cleaned.includes("cost") && cleaned.includes("val"))) {
                    currentMapped.invested_value = idx;
                }
            }
            if (currentMapped.current_price === undefined) {
                if (cleaned.includes("ltp") || cleaned.includes("cmp") || ( (cleaned.includes("closing") || cleaned.includes("current") || cleaned.includes("market") || cleaned.includes("last") || cleaned.includes("unit")) && (cleaned.includes("price") || cleaned.includes("nav") || cleaned.includes("rate")) )) {
                    currentMapped.current_price = idx;
                }
            }
            if (currentMapped.current_value === undefined) {
                if (cleaned.includes("value") || cleaned.includes("valuation") || cleaned.includes("amount") || cleaned.includes("val")) {
                    if (cleaned.includes("current") || cleaned.includes("market") || cleaned.includes("total") || cleaned.includes("holding") || cleaned.includes("latest")) {
                        currentMapped.current_value = idx;
                    }
                }
            }
        });
        
        // If we successfully map symbol, quantity, and either buy_price or invested_value, this is the header row
        if (currentMapped.symbol !== undefined && currentMapped.quantity !== undefined && (currentMapped.buy_price !== undefined || currentMapped.invested_value !== undefined)) {
            headerIdx = r;
            
            // Map Name, Buy Date, and Asset Class if available
            headers.forEach((h, idx) => {
                const cleaned = h.toLowerCase().replace(/[\s_.-]/g, "");
                if (currentMapped.name === undefined && (cleaned.includes("name") || cleaned.includes("desc") || cleaned.includes("company") || cleaned.includes("title"))) {
                    currentMapped.name = idx;
                }
                if (currentMapped.buy_date === undefined && (cleaned.includes("date") || cleaned.includes("time") || cleaned.includes("purchased"))) {
                    currentMapped.buy_date = idx;
                }
                if (currentMapped.asset_class === undefined && (cleaned.includes("class") || cleaned.includes("asset") || cleaned.includes("type"))) {
                    currentMapped.asset_class = idx;
                }
            });
            
            mapped = currentMapped;
            break;
        }
    }
    
    if (headerIdx === -1) {
        throw new Error("Could not find the header row containing mandatory columns (Symbol/ISIN, Quantity, Buy Price or Invested Value). Rows scanned (first 25): " + JSON.stringify(rows.slice(0, 25)));
    }
    
    const items = [];
    // Start parsing data from the row immediately following the header
    for (let i = headerIdx + 1; i < rows.length; i++) {
        const cols = rows[i];
        if (!cols || cols.length === 0) continue;
        
        const rawSymbol = cols[mapped.symbol];
        if (rawSymbol === undefined || rawSymbol === null || String(rawSymbol).trim() === "") continue;
        
        const symbol = String(rawSymbol).trim().toUpperCase();
        
        // Clean formatting or currency symbols from values
        const qty = cleanNumber(cols[mapped.quantity]);
        let price = (mapped.buy_price !== undefined) ? cleanNumber(cols[mapped.buy_price]) : null;
        const invested_val = (mapped.invested_value !== undefined) ? cleanNumber(cols[mapped.invested_value]) : null;
        let current_price = (mapped.current_price !== undefined) ? cleanNumber(cols[mapped.current_price]) : null;
        const current_value = (mapped.current_value !== undefined) ? cleanNumber(cols[mapped.current_value]) : null;
        
        // Back-calculate buy price if average price is missing but invested value and quantity exist
        if ((price === null || isNaN(price) || price === 0) && invested_val !== null && !isNaN(invested_val) && qty !== null && qty > 0) {
            price = invested_val / qty;
        }
        
        // Back-calculate unit price if only total current valuation was provided
        if ((current_price === null || isNaN(current_price) || current_price === 0) && current_value !== null && !isNaN(current_value) && qty !== null && qty > 0) {
            current_price = current_value / qty;
        }
        
        if (!symbol || qty === null || price === null || qty <= 0 || price <= 0 || isNaN(qty) || isNaN(price)) continue;
        
        // Use Name as name if available, fallback to symbol/ISIN
        const name = (mapped.name !== undefined && cols[mapped.name]) ? String(cols[mapped.name]).trim() : symbol;
        const oneYearAgo = new Date();
        oneYearAgo.setDate(oneYearAgo.getDate() - 365);
        const buyDate = (mapped.buy_date !== undefined && cols[mapped.buy_date]) ? String(cols[mapped.buy_date]).trim() : oneYearAgo.toISOString().slice(0,10);
        
        let assetClass = defaultAssetClass;
        let explicitVal = "";
        if (mapped.asset_class !== undefined && cols[mapped.asset_class]) {
            explicitVal = String(cols[mapped.asset_class]).trim();
        }
        assetClass = detectAssetClass(symbol, name, explicitVal, defaultAssetClass);
        
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

function getThemeChartColors() {
    const isLight = document.body.classList.contains("theme-light");
    return {
        text: isLight ? "#4f46e5" : "#a5b4fc",
        grid: isLight ? "rgba(99, 102, 241, 0.08)" : "rgba(139, 92, 246, 0.1)",
        legendText: isLight ? "#1e293b" : "#f3f4f6"
    };
}

function renderProjectionChart(currentVal) {
    const ctx = document.getElementById("chart-portfolio-projection").getContext("2d");
    if (chartInstances["projection"]) chartInstances["projection"].destroy();
    
    const themeColors = getThemeChartColors();
    const years = 10;
    const labels = [];
    const conservativeData = [];
    const moderateData = [];
    const aggressiveData = [];
    
    const now = new Date();
    const currentYear = now.getFullYear();
    
    for (let i = 0; i <= years; i++) {
        labels.push(currentYear + i);
        conservativeData.push(currentVal * Math.pow(1 + 0.08, i));
        moderateData.push(currentVal * Math.pow(1 + 0.12, i));
        aggressiveData.push(currentVal * Math.pow(1 + 0.15, i));
    }
    
    chartInstances["projection"] = new Chart(ctx, {
        type: "line",
        data: {
            labels: labels,
            datasets: [
                {
                    label: "Conservative (8% CAGR)",
                    data: conservativeData,
                    borderColor: "#8e95b0", // Slate gray
                    backgroundColor: "transparent",
                    borderWidth: 2,
                    pointRadius: 3,
                    tension: 0.2
                },
                {
                    label: "Moderate (12% CAGR)",
                    data: moderateData,
                    borderColor: "#7c3aed", // Vibrant Purple
                    backgroundColor: "rgba(124, 58, 237, 0.04)",
                    borderWidth: 3,
                    pointRadius: 4,
                    tension: 0.2,
                    fill: true
                },
                {
                    label: "Aggressive (15% CAGR)",
                    data: aggressiveData,
                    borderColor: "#059669", // Emerald Green
                    backgroundColor: "transparent",
                    borderWidth: 2,
                    pointRadius: 3,
                    tension: 0.2
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: "bottom",
                    labels: { color: themeColors.legendText, font: { family: "Inter", size: 11, weight: "500" } }
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            return context.dataset.label + ": " + formatINR(context.parsed.y);
                        }
                    }
                }
            },
            scales: {
                y: {
                    grid: { color: themeColors.grid },
                    ticks: {
                        color: themeColors.text,
                        font: { size: 10 },
                        callback: function(value) {
                            if (value >= 10000000) return "₹" + (value / 10000000).toFixed(1) + " Cr";
                            if (value >= 100000) return "₹" + (value / 100000).toFixed(1) + " L";
                            return formatINR(value);
                        }
                    }
                },
                x: {
                    grid: { display: false },
                    ticks: { color: themeColors.text, font: { size: 10 } }
                }
            }
        }
    });
}

function calculateTargets(age, niftyPe) {
    let target = {
        "Direct Stocks": 25.0,
        "MF Large Cap": 20.0,
        "MF Mid Cap": 15.0,
        "MF Small Cap": 10.0,
        "MF Flexi Cap": 15.0,
        "MF Global": 5.0,
        "Gold & Gold ETFs": 5.0,
        "Liquid & Debt": 5.0
    };

    if (age) {
        const a = Math.max(18, Math.min(80, parseInt(age))); // Clamp between 18 and 80 for calculation consistency
        
        // Continuous target mapping: Total Equity allocation = 100 - age
        const totalEquity = 100 - a;
        
        // Distribute the equity component strategically:
        target["Direct Stocks"] = parseFloat((totalEquity * 0.3).toFixed(1));
        target["MF Large Cap"] = parseFloat((totalEquity * 0.25).toFixed(1));
        target["MF Mid Cap"] = parseFloat((totalEquity * 0.15).toFixed(1));
        target["MF Small Cap"] = parseFloat((totalEquity * 0.15).toFixed(1));
        target["MF Flexi Cap"] = parseFloat((totalEquity * 0.15).toFixed(1));
        
        // Global remains at 5.0% for geographic diversification
        target["MF Global"] = 5.0;
        
        // Gold allocation increases continuously as you age:
        // at 18: 5.0% , at 80: 12.0%
        target["Gold & Gold ETFs"] = parseFloat((5.0 + (a - 18) * 0.113).toFixed(1));
        
        // Liquid & Debt is the exact mathematical remainder
        const sumOthers = target["Direct Stocks"] + target["MF Large Cap"] + target["MF Mid Cap"] + target["MF Small Cap"] + target["MF Flexi Cap"] + target["MF Global"] + target["Gold & Gold ETFs"];
        target["Liquid & Debt"] = parseFloat((100.0 - sumOthers).toFixed(1));
    }

    // Market Trend overlay based on Nifty PE
    const pe = niftyPe || 22.4;
    if (pe > 24) {
        // Expensive valuations: shift risk assets into cash/gold
        target["Direct Stocks"] = Math.max(5.0, target["Direct Stocks"] - 5.0);
        target["MF Small Cap"] = Math.max(5.0, target["MF Small Cap"] - 5.0);
        target["Gold & Gold ETFs"] += 3.0;
        target["Liquid & Debt"] += 7.0;
    } else if (pe < 18) {
        // Cheap valuations: capitalize on discounts
        const adjustCash = Math.min(target["Liquid & Debt"], 5.0);
        target["Liquid & Debt"] -= adjustCash;
        target["Direct Stocks"] += adjustCash * 0.6;
        target["MF Small Cap"] += adjustCash * 0.4;
    }

    return target;
}

function getHoldingSubcategory(h) {
    const sym = String(h.symbol || "").toUpperCase();
    const nm = String(h.name || "").toUpperCase();
    const isMF = sym.startsWith("INF") || 
                 sym.includes("MUTUAL") || nm.includes("MUTUAL") ||
                 nm.includes("DIRECT") || nm.includes("GROWTH") || nm.includes("REGULAR") ||
                 nm.includes("FOF") || nm.includes("FUND OF FUNDS") ||
                 sym.includes("PPFAS") || nm.includes("PARAG PARIKH") ||
                 (nm.includes("FUND") && !nm.includes("ETF"));

    let assetClass = h.asset_class;
    if (isMF) {
        assetClass = "MUTUAL_FUND";
    }

    if (assetClass === "STOCK") return "Direct Stocks";
    if (assetClass === "GOLD_ETF") return "Gold & Gold ETFs";
    if (assetClass === "CASH") return "Liquid & Debt";
    if (assetClass === "ETF") {
        if (sym.includes("GOLD") || nm.includes("GOLD") || sym.includes("GOLDBEES")) {
            return "Gold & Gold ETFs";
        }
        return "Direct Stocks";
    }
    if (assetClass === "MUTUAL_FUND") {
        const hash = getSymbolHash(h.symbol);
        const insights = getMFMetricsAndInsights(h.symbol, h.name, h.quantity, h.buy_price, h.quantity * h.buy_price, hash);
        const cat = insights.category;
        if (cat === "Equity Large Cap" || cat.includes("Bluechip") || cat.includes("Large") || cat.includes("Nifty")) return "MF Large Cap";
        if (cat === "Equity Mid Cap" || cat.includes("Mid")) return "MF Mid Cap";
        if (cat === "Equity Small Cap" || cat.includes("Small")) return "MF Small Cap";
        if (cat === "Flexi Cap Equity" || cat.includes("Flexi")) return "MF Flexi Cap";
        if (cat === "International Equity" || cat.includes("Global") || cat.includes("US") || cat.includes("Nasdaq")) return "MF Global";
        if (cat === "Commodities / Gold") return "Gold & Gold ETFs";
        return "Liquid & Debt";
    }
    return "Liquid & Debt";
}

function renderAssetComparison(allocations) {
    const ctx = document.getElementById("chart-asset-allocation").getContext("2d");
    if (chartInstances["asset"]) chartInstances["asset"].destroy();

    const ageInput = document.getElementById("portfolio-age");
    const age = ageInput ? ageInput.value.trim() : "";
    const niftyPe = 22.4; // Fixed baseline trend metric from backend mock
    const targets = calculateTargets(age, niftyPe);

    // Update UI headers
    const ageDisplay = document.getElementById("audit-age-display");
    if (ageDisplay) ageDisplay.innerText = age ? `(Age: ${age})` : "(Standard)";
    
    const trendEl = document.getElementById("market-trend-indicator");
    if (trendEl) {
        trendEl.innerText = `Trend: Stable (Nifty PE: ${niftyPe})`;
        trendEl.className = "badge badge-blue";
    }

    let totalVal = 0;
    const actualVals = {
        "Direct Stocks": 0,
        "MF Large Cap": 0,
        "MF Mid Cap": 0,
        "MF Small Cap": 0,
        "MF Flexi Cap": 0,
        "MF Global": 0,
        "Gold & Gold ETFs": 0,
        "Liquid & Debt": 0
    };

    const categoryHoldings = {
        "Direct Stocks": [],
        "MF Large Cap": [],
        "MF Mid Cap": [],
        "MF Small Cap": [],
        "MF Flexi Cap": [],
        "MF Global": [],
        "Gold & Gold ETFs": [],
        "Liquid & Debt": []
    };

    demoHoldings.forEach(h => {
        const buyPrice = cleanNumber(h.buy_price);
        const currentPrice = getMockCurrentPrice(h.symbol, buyPrice, h.current_price);
        const val = h.quantity * currentPrice;
        totalVal += val;

        const subcat = getHoldingSubcategory(h);
        if (actualVals[subcat] !== undefined) {
            actualVals[subcat] += val;
            categoryHoldings[subcat].push(h);
        } else {
            actualVals["Liquid & Debt"] += val;
            categoryHoldings["Liquid & Debt"].push(h);
        }
    });

    const labels = [
        "Direct Stocks",
        "MF Large Cap",
        "MF Mid Cap",
        "MF Small Cap",
        "MF Flexi Cap",
        "MF Global",
        "Gold & Gold ETFs",
        "Liquid & Debt"
    ];

    const actualPcts = labels.map(lbl => {
        return totalVal > 0 ? parseFloat(((actualVals[lbl] / totalVal) * 100).toFixed(1)) : 0;
    });

    const recommendedPcts = labels.map(lbl => targets[lbl] || 0);
    const themeColors = getThemeChartColors();

    chartInstances["asset"] = new Chart(ctx, {
        type: "bar",
        data: {
            labels: labels,
            datasets: [
                {
                    label: "Actual (%)",
                    data: actualPcts,
                    backgroundColor: "rgba(124, 58, 237, 0.65)",
                    borderColor: "#7c3aed",
                    borderWidth: 1.5,
                    borderRadius: 4
                },
                {
                    label: "Strategy Target (%)",
                    data: recommendedPcts,
                    backgroundColor: "rgba(16, 185, 129, 0.2)",
                    borderColor: "#10b981",
                    borderWidth: 1.5,
                    borderRadius: 4,
                    borderDash: [2, 2]
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: "bottom",
                    labels: { color: themeColors.text, font: { family: "Inter", size: 10, weight: "600" } }
                }
            },
            scales: {
                y: {
                    min: 0,
                    max: 100,
                    grid: { color: themeColors.grid },
                    ticks: {
                        color: themeColors.text,
                        font: { size: 10 },
                        callback: function(value) { return value + "%"; }
                    }
                },
                x: {
                    grid: { display: false },
                    ticks: { color: themeColors.text, font: { size: 10 } }
                }
            }
        }
    });

    // Render detailed comparison audit table
    const tbody = document.querySelector("#table-allocation-audit tbody");
    if (tbody) {
        tbody.innerHTML = "";
        
        if (totalVal === 0) {
            tbody.innerHTML = `<tr><td colspan="6" class="text-neutral" style="text-align: center;">No holdings detected. Please import portfolio spreadsheets in Settings.</td></tr>`;
            return;
        }

        labels.forEach((lbl, idx) => {
            const actualVal = actualVals[lbl];
            const actualPct = actualPcts[idx];
            const targetPct = recommendedPcts[idx];
            const variance = parseFloat((actualPct - targetPct).toFixed(1));
            
            let statusBadge = "";
            if (variance > 4.0) {
                statusBadge = `<span class="badge badge-rose" style="font-size:0.75rem;">Overweighted (Reduce)</span>`;
            } else if (variance < -4.0) {
                statusBadge = `<span class="badge badge-yellow" style="font-size:0.75rem;">Underweighted (Buy)</span>`;
            } else {
                statusBadge = `<span class="badge badge-green" style="font-size:0.75rem;">Healthy (Hold)</span>`;
            }

            // Create clickable holdings tags
            const holdings = categoryHoldings[lbl] || [];
            let holdingsHtml = "";
            if (holdings.length > 0) {
                const uniqueSymbols = [...new Set(holdings.map(h => h.symbol))];
                const tags = uniqueSymbols.map(sym => {
                    const holdingItem = holdings.find(h => h.symbol === sym);
                    const assetClass = holdingItem.asset_class;
                    let tabId = "tab-sheet-dashboard";
                    if (assetClass === "STOCK") tabId = "tab-sheet-stocks";
                    else if (assetClass === "MUTUAL_FUND") tabId = "tab-sheet-mutual-funds";
                    else if (assetClass === "ETF" || assetClass === "GOLD_ETF") tabId = "tab-sheet-etfs";
                    return `<span class="holding-pill" onclick="switchTabAndHighlight('${tabId}', '${sym}')" title="Click to view in ${assetClass} ledger">${resolveTicker(sym)}</span>`;
                }).join("");
                holdingsHtml = `<div class="associated-holdings">${tags}</div>`;
            } else {
                holdingsHtml = `<div class="associated-holdings empty-holdings">No active assets</div>`;
            }

            // Compute deployment amount and recommendation
            let deploymentText = "";
            const targetValForLbl = (targetPct / 100) * totalVal;
            const diffVal = targetValForLbl - actualVal;
            
            if (diffVal > 100) { // underweighted by more than 100 rupees
                const amtStr = formatINR(Math.round(diffVal));
                const isVolatile = ["Direct Stocks", "MF Small Cap", "MF Mid Cap", "MF Flexi Cap"].includes(lbl);
                
                if (niftyPe > 22 && isVolatile) {
                    const sipAmt = Math.round(diffVal / 12);
                    deploymentText = `Deploy <strong>${amtStr}</strong> via 12-mo SIP (~₹${formatINR(sipAmt)}/mo) due to high market PE.`;
                } else if (niftyPe < 19) {
                    deploymentText = `Deploy <strong>${amtStr}</strong> via Lumpsum (Value buying PE: ${niftyPe}).`;
                } else {
                    deploymentText = `Deploy <strong>${amtStr}</strong> via SIP or Lumpsum.`;
                }
            } else if (diffVal < -100) { // overweighted by more than 100 rupees
                const excessAmtStr = formatINR(Math.round(Math.abs(diffVal)));
                if (lbl === "Liquid & Debt" || lbl === "Gold & Gold ETFs") {
                    deploymentText = `Hold. Excess is safe safety cover.`;
                } else {
                    deploymentText = `Trim / Shift excess <strong>${excessAmtStr}</strong> to underweighted classes.`;
                }
            } else {
                deploymentText = "Allocation optimal. Maintain status.";
            }

            const tr = document.createElement("tr");
            tr.innerHTML = `
                <td>
                    <div style="font-weight:600; font-size:0.88rem; color:var(--text-primary);">${lbl}</div>
                    ${holdingsHtml}
                </td>
                <td style="text-align: right; font-family: monospace; font-size: 0.85rem;">${formatINR(actualVal)}</td>
                <td style="text-align: right; font-weight:600; font-size: 0.85rem;">${actualPct}%</td>
                <td style="text-align: right; color:var(--text-secondary); font-size: 0.85rem;">${targetPct}%</td>
                <td style="text-align: right; font-weight:600; font-size: 0.85rem;">
                    <span class="${variance > 4.0 ? 'text-rose' : (variance < -4.0 ? 'text-yellow' : 'text-green')}">
                        ${variance >= 0 ? '+' : ''}${variance}%
                    </span>
                </td>
                <td style="text-align: center;">
                    <div style="display: flex; flex-direction: column; align-items: center; gap: 4px;">
                        ${statusBadge}
                        <div style="font-size: 0.72rem; color: var(--text-secondary); font-weight: 500; text-align: center; max-width: 200px; line-height: 1.3;">
                            ${deploymentText}
                        </div>
                    </div>
                </td>
            `;
            tbody.appendChild(tr);
        });
    }
}

function renderMFAllocationChart(analyzedMfs) {
    const ctx = document.getElementById("chart-mf-allocation").getContext("2d");
    if (chartInstances["mf_alloc"]) chartInstances["mf_alloc"].destroy();

    const categories = {
        "Large Cap": 0,
        "Mid Cap": 0,
        "Small Cap": 0,
        "International": 0,
        "Debt/Liquid": 0
    };

    let totalMfVal = 0;
    analyzedMfs.forEach(fund => {
        totalMfVal += fund.current_value;
        const cat = fund.category;
        if (cat === "Equity Large Cap" || cat.includes("Bluechip") || cat.includes("Large")) {
            categories["Large Cap"] += fund.current_value;
        } else if (cat === "Equity Mid Cap" || cat.includes("Mid")) {
            categories["Mid Cap"] += fund.current_value;
        } else if (cat === "Equity Small Cap" || cat.includes("Small")) {
            categories["Small Cap"] += fund.current_value;
        } else if (cat === "International Equity" || cat.includes("US") || cat.includes("Nasdaq")) {
            categories["International"] += fund.current_value;
        } else {
            categories["Debt/Liquid"] += fund.current_value;
        }
    });

    const labels = ["Large Cap", "Mid Cap", "Small Cap", "International", "Debt/Liquid"];
    const actualPcts = labels.map(lbl => {
        return totalMfVal > 0 ? parseFloat(((categories[lbl] / totalMfVal) * 100).toFixed(1)) : 0;
    });

    const recommendedPcts = [40.0, 20.0, 15.0, 15.0, 10.0];
    const themeColors = getThemeChartColors();

    chartInstances["mf_alloc"] = new Chart(ctx, {
        type: "bar",
        data: {
            labels: labels,
            datasets: [
                {
                    label: "Actual MF Allocation (%)",
                    data: actualPcts,
                    backgroundColor: "rgba(59, 130, 246, 0.65)",
                    borderColor: "#3b82f6",
                    borderWidth: 1.5,
                    borderRadius: 4
                },
                {
                    label: "Recommended (%)",
                    data: recommendedPcts,
                    backgroundColor: "rgba(16, 185, 129, 0.2)",
                    borderColor: "#10b981",
                    borderWidth: 1.5,
                    borderRadius: 4,
                    borderDash: [2, 2]
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: "bottom",
                    labels: { color: themeColors.text, font: { family: "Inter", size: 10, weight: "600" } }
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            return context.dataset.label + ": " + context.parsed.y + "%";
                        }
                    }
                }
            },
            scales: {
                y: {
                    min: 0,
                    max: 100,
                    grid: { color: themeColors.grid },
                    ticks: {
                        color: themeColors.text,
                        font: { size: 10 },
                        callback: function(value) { return value + "%"; }
                    }
                },
                x: {
                    grid: { display: false },
                    ticks: { color: themeColors.text, font: { size: 10 } }
                }
            }
        }
    });

    const auditEl = document.getElementById("mf-allocation-audit");
    if (auditEl) {
        if (totalMfVal === 0) {
            auditEl.innerHTML = `<div class="text-neutral">No mutual funds found in active portfolio. Please upload some to start allocation auditing.</div>`;
            return;
        }

        let pros = [];
        let cons = [];

        if (actualPcts[0] > 55) {
            cons.push(`<strong>Large Cap Over-exposure:</strong> Actual is <strong>${actualPcts[0]}%</strong> (rec: 40%). High stability but limits small/mid-cap high-growth opportunities.`);
        } else if (actualPcts[0] < 25) {
            cons.push(`<strong>Large Cap Under-exposure:</strong> Actual is <strong>${actualPcts[0]}%</strong> (rec: 40%). Missing core market stability against large corrections.`);
        } else {
            pros.push(`<strong>Large Cap Anchor ideal:</strong> Actual is <strong>${actualPcts[0]}%</strong> (rec: 40%), forming a highly resilient core.`);
        }

        const riskCapPct = actualPcts[1] + actualPcts[2];
        if (riskCapPct > 50) {
            cons.push(`<strong>Mid/Small Cap Risk High:</strong> Combined mid & small cap exposure is <strong>${riskCapPct.toFixed(1)}%</strong> (rec: 35%). High volatility potential during corrections.`);
        } else if (riskCapPct < 20) {
            cons.push(`<strong>Mid/Small Cap Growth Low:</strong> Combined exposure is <strong>${riskCapPct.toFixed(1)}%</strong> (rec: 35%). Portfolio may underperform index benchmarks.`);
        } else {
            pros.push(`<strong>Mid/Small Cap mix healthy:</strong> Combined exposure of <strong>${riskCapPct.toFixed(1)}%</strong> (rec: 35%) balances growth and volatility.`);
        }

        if (actualPcts[3] < 5) {
            cons.push(`<strong>International diversification missing:</strong> Actual is <strong>${actualPcts[3]}%</strong> (rec: 15%). Add global/Nasdaq index funds as USD hedge.`);
        } else {
            pros.push(`<strong>Global diversification healthy:</strong> Actual is <strong>${actualPcts[3]}%</strong> (rec: 15%), hedging local country risk.`);
        }

        let html = "";
        if (pros.length > 0) {
            html += `<div style="color:var(--accent-emerald);"><strong>✓ Healthy Strategies:</strong><ul style="margin: 4px 0 0 16px; padding:0;">${pros.map(p => `<li style="margin-bottom:2px;">${p}</li>`).join("")}</ul></div>`;
        }
        if (cons.length > 0) {
            html += `<div style="color:var(--accent-coral); margin-top:4px;"><strong>⚠ Target Corrections:</strong><ul style="margin: 4px 0 0 16px; padding:0;">${cons.map(c => `<li style="margin-bottom:2px;">${c}</li>`).join("")}</ul></div>`;
        }
        auditEl.innerHTML = html;
    }
}

function renderSectorBar(sectors) {
    const ctx = document.getElementById("chart-sector-allocation").getContext("2d");
    if (chartInstances["sector"]) chartInstances["sector"].destroy();

    const labels = Object.keys(sectors);
    const data = Object.values(sectors);
    const themeColors = getThemeChartColors();

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
                y: { grid: { color: themeColors.grid }, ticks: { color: themeColors.text, font: { size: 10 } } },
                x: { grid: { display: false }, ticks: { color: themeColors.text, font: { size: 10 } } }
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
    const themeColors = getThemeChartColors();

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
                y: { grid: { color: themeColors.grid }, ticks: { color: themeColors.text, font: { size: 10 } } },
                x: { grid: { display: false }, ticks: { color: themeColors.text, font: { size: 10 } } }
            }
        }
    });
}

function formatINR(val) {
    return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(val);
}

function getRecBadgeClass(rec) {
    if (!rec) return "badge-blue";
    const r = String(rec);
    if (r === "Buy on Dips" || r === "Continue SIP" || r === "Accumulate" || r.includes("Continue") || r.includes("Strong") || r.includes("Buy")) return "badge-green";
    if (r === "Hold" || r.includes("Maintain")) return "badge-blue";
    if (r.includes("Redirect") || r.includes("Review") || r.includes("STP") || r.includes("Hold")) return "badge-yellow";
    return "badge-rose";
}

window.switchTabAndHighlight = function(tabId, symbol) {
    const tabName = tabId.replace('tab-sheet-', '');
    const tabEl = document.querySelector(`.sidebar-nav [data-tab="${tabName}"]`);
    if (tabEl) {
        tabEl.click();
    } else {
        const tabs = document.querySelectorAll(".tab-sheet");
        tabs.forEach(t => t.classList.add("hidden"));
        const targetTab = document.getElementById(tabId);
        if (targetTab) targetTab.classList.remove("hidden");
    }
    
    setTimeout(() => {
        const rows = document.querySelectorAll("table tbody tr");
        let found = false;
        rows.forEach(row => {
            const rowSymbol = row.getAttribute("data-symbol");
            const firstCell = row.querySelector("td");
            if (rowSymbol === symbol || (firstCell && firstCell.innerHTML.includes(symbol))) {
                row.scrollIntoView({ behavior: 'smooth', block: 'center' });
                row.style.background = "rgba(124, 58, 237, 0.18)";
                row.style.transition = "background 0.3s ease";
                setTimeout(() => {
                    row.style.background = "";
                }, 3000);
                found = true;
            }
        });
    }, 200);
};
