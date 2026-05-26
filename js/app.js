// Custom Fabric.js properties that must be included in toJSON()/toObject() calls
const CUSTOM_FABRIC_PROPS = [
    'objectId', 'rectId', 'isRectDimension', 'dimensionType',
    'isStageElement', 'elementType', 'pixelsPerFoot', 'gridLine',
    'fillEnabled', 'fillColor', 'fillOpacity', 'locked'
];

// Generate a unique client session ID for multi-user collaboration
if (!sessionStorage.getItem('clientId')) {
    sessionStorage.setItem('clientId', 'client_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9));
}
const CLIENT_ID = sessionStorage.getItem('clientId');

// Global state
const state = {
    budget: [],
    timeline: [],
    mainStageInputs: [],
    cocktailStageInputs: [],
    staff: [],
    stagePlots: [],
    setLists: [],
    setListSearch: '',
    setListStageFilter: 'all',
    setListsExpanded: new Set(),
    budgetSort: { field: null, direction: 'asc' },
    budgetSearch: '',
    currentPage: 'dashboard',
    currentDay: 'Thursday',  // For timeline filtering
    vendorFilter: 'all',  // For vendor page filtering (all/confirmed/pending/issues)
    vendorSearch: '',
    vendorView: 'grid',                     // 'grid' | 'schedule'
    vendorScheduleFilter: 'all',            // 'all' | 'needs-schedule'
    vendorScheduleEditingRowId: null,       // blocks re-render during cell edit
    vendorScheduleRenderPending: false,     // deferred re-render flag
    pendingVendorScheduleEdit: null,        // { id, day, originalValue } — for Esc revert
    vendorGanttDay: 'saturday',             // selected day for Vendor Schedule gantt
    staffSearch: '',
    staffFilter: 'all',  // 'all' or 'unfilled'
    staffView: 'team',
    staffDay: 'saturday',
    currentStage: 'main',  // For stage input filtering
    currentStagePlotType: 'main',  // For stage plot tabs
    currentPlotId: null,  // Currently selected plot
    isDraftPlot: false,  // Whether current plot is a local draft (not yet in Firestore)
    canvas: null,  // Fabric.js canvas instance
    autoSaveTimeout: null,  // For debounced auto-save
    isDrawingStage: false,  // Drawing mode flag
    isEditingStage: false,  // Edit/drag mode flag
    currentTool: null,  // 'draw' or 'move' - which tool is active
    stageRectangles: [],  // Array of stage rectangle objects {id, rect, widthLabel, heightLabel}
    currentDrawingRect: null,  // Rectangle being drawn
    drawingStartPoint: null,  // Starting point for rectangle draw
    stageLocked: false,  // Whether stage is locked
    snapDistance: 10,  // Pixels for snap-to-align
    zoom: 1.0,  // Current zoom level (1.0 = 100%)
    isPanning: false,  // Whether user is panning the canvas
    panStart: null,  // Starting point for panning
    undoStack: [],  // History of canvas states for undo
    redoStack: [],  // History of undone states for redo
    isUndoRedoing: false,  // Flag to prevent history recording during undo/redo
    isInteracting: false,  // Flag to prevent canvas resize during user interaction
    dimensionsVisible: true,  // Whether stage dimension labels are shown
    // Real-time collaboration state
    dirtyObjectIds: new Set(),    // Object IDs that need saving
    deletedObjectIds: new Set(),  // Object IDs that were deleted
    isReceivingRemote: false,     // Flag to suppress re-saving during remote updates
    plotObjectsUnsubscribe: null, // Firestore listener unsubscribe function
    vmUndoStack: [],  // Undo history for venue map canvas
    vmRedoStack: [],  // Redo history for venue map canvas
    vmIsUndoRedoing: false,  // Flag to prevent history recording during undo/redo
    timelineUndoStack: [],  // Undo history for timeline actions
    timelineFilter: 'all',  // Current timeline filter: 'all', 'production', 'run-of-show'
    timelineAnimateRows: true,  // Only animate rows on day/filter switch, not data updates
    timelineEditingRowId: null,  // Row ID currently being inline-edited (blocks re-render)
    timelineRenderPending: false,  // True if a Firestore snapshot arrived during editing
    cueSheetEditingRowId: null,
    cueSheetRenderPending: false,
    cueSheetShowHidden: false,
    pendingNewRow: {},  // Accumulates phantom row data before commit
    budgetEditingRowId: null,
    budgetRenderPending: false,
    pendingNewBudgetRow: {},
    stageEditingRowId: null,
    stageRenderPending: false,
    pendingNewStageRow: {},
    // Venue map annotation state
    vmCanvas: null,
    vmLayers: [],         // [{id, name, color, visible, objects: [fabricJSON]}]
    vmActiveLayerId: null,
    vmCurrentTool: 'select',
    vmCurrentColor: '#e53e3e',
    vmStrokeWidth: 4,
    vmFillShape: false,
    vmDrawingObj: null,
    vmDrawStart: null,
    vmAutoSaveTimeout: null,
    vmImageLoaded: false,
    vmZoom: 1.0,
    vmBaseWidth: 0,
    vmBaseHeight: 0,
    // Packing list state
    packingList: [],
    packingCategoryColors: [],
    packingSearch: '',
    packingCategoryFilter: 'all',
    packingStatusFilter: 'all',
    // Menu state
    menuItems: [],
    menuSearch: '',
    menuCategoryFilter: 'all',
    menuStatusFilter: 'all',
    menuViewMode: 'category',
    // Printed materials state
    printedMaterials: [],
    printSearch: '',
    printStatusFilter: 'all',
    printSort: { field: null, direction: 'asc' },
    printVendorFilter: 'all',
    printColumns: { name: true, quantity: true, size: true, material: true, holder: true, vendor: true, status: true, link: true, notes: true },
    // Digital assets state
    digitalAssets: [],
    daSearch: '',
    daStatusFilter: 'all',
    daSort: { field: null, direction: 'asc' },
    // Seating state
    guests: [],
    seatingTables: [],
    seatingView: 'table',
    seatingSelectedTableId: null,
    seatingSearch: '',
    seatingPanelSearch: '',
    seatingUnassignedOnly: false,
    seatingEditingRowId: null,
    seatingRenderPending: false,
    pendingNewGuestRow: {},
    seatingCanvas: null,
    seatingBgImage: null,
    seatingMarkers: new Map(),
    seatingCanvasInitialized: false
};

// --- Staff-Budget linking helpers ---
function getLinkedBudget(member) {
    if (!member || !member.linkedBudgetId) return null;
    return state.budget.find(b => b.id === member.linkedBudgetId) || null;
}

function getLinkedStaff(budgetItem) {
    if (!budgetItem || !budgetItem.linkedStaffId) return null;
    return state.staff.find(s => s.id === budgetItem.linkedStaffId) || null;
}

// One-time backfill: copy missing contact info between already-linked staff/budget pairs.
// Only fills empty fields (never overwrites), so future re-saves use the normal "last edit wins" sync.
let _linkedContactBackfillDone = false;
let _linkedContactBackfillRunning = false;
async function backfillLinkedContactInfo() {
    if (_linkedContactBackfillDone || _linkedContactBackfillRunning) return;
    if (!state.staff.length || !state.budget.length) return;
    _linkedContactBackfillRunning = true;

    const writes = [];
    for (const member of state.staff) {
        if (!member.linkedBudgetId) continue;
        const budgetItem = state.budget.find(b => b.id === member.linkedBudgetId);
        if (!budgetItem) continue;

        const staffUpdate = {};
        if (!member.phone && budgetItem.phone) staffUpdate.phone = budgetItem.phone;
        if (!member.email && budgetItem.email) staffUpdate.email = budgetItem.email;

        const budgetUpdate = {};
        if (!budgetItem.phone && member.phone) budgetUpdate.phone = member.phone;
        if (!budgetItem.email && member.email) budgetUpdate.email = member.email;
        if (!budgetItem.contact && member.name) budgetUpdate.contact = member.name;

        if (Object.keys(staffUpdate).length) writes.push(collections.staff.doc(member.id).update(staffUpdate));
        if (Object.keys(budgetUpdate).length) writes.push(collections.budget.doc(budgetItem.id).update(budgetUpdate));
    }

    try {
        if (writes.length) {
            await Promise.all(writes);
            console.log('[backfill] synced contact info for ' + writes.length + ' linked field group(s)');
        }
        _linkedContactBackfillDone = true;
    } catch (e) {
        console.error('[backfill] linked contact sync failed:', e);
    } finally {
        _linkedContactBackfillRunning = false;
    }
}

function findBudgetSuggestions(staffName) {
    if (!staffName) return [];
    const name = staffName.toLowerCase().trim();
    const nameWords = name.split(/\s+/).filter(w => w.length > 2);
    if (nameWords.length === 0) return [];
    return state.budget.filter(b => {
        if (b.linkedStaffId) return false;
        const vendor = (b.vendor || '').toLowerCase();
        const vendorWords = vendor.split(/\s+/).filter(w => w.length > 2);
        return nameWords.some(w => vendor.includes(w)) || vendorWords.some(w => name.includes(w));
    });
}

function findStaffSuggestions(vendorName) {
    if (!vendorName) return [];
    const vendor = vendorName.toLowerCase().trim();
    const vendorWords = vendor.split(/\s+/).filter(w => w.length > 2);
    if (vendorWords.length === 0) return [];
    return state.staff.filter(s => {
        if (s.linkedBudgetId) return false;
        const name = (s.name || '').toLowerCase();
        const nameWords = name.split(/\s+/).filter(w => w.length > 2);
        return vendorWords.some(w => name.includes(w)) || nameWords.some(w => vendor.includes(w));
    });
}

// Toast notification system
function showToast(message, type = 'success', duration = 3000) {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const icons = {
        success: '\u2713',
        error: '\u2717',
        info: '\u2139',
        warning: '\u26A0'
    };

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `<span class="toast-icon">${icons[type] || ''}</span><span>${message}</span>`;
    container.appendChild(toast);

    // Trigger slide-in
    requestAnimationFrame(() => {
        toast.classList.add('show');
    });

    // Auto-dismiss
    setTimeout(() => {
        toast.classList.remove('show');
        toast.classList.add('hiding');
        toast.addEventListener('transitionend', () => toast.remove(), { once: true });
    }, duration);
}

// Event date
const eventDate = new Date('2026-04-25T18:00:00-04:00');

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    initializeApp();
});

function initializeApp() {
    setupNavigation();
    setupHamburgerMenu();
    setupModals();
    setupCountdown();
    loadAllData();
    setupFormHandlers();
    setupDayTabs();
    setupVendorFilters();
    setupStageTabs();
    setupExportAndPrint();
    setupStagePlotTabs();
    setupStagePlotControls();
    setupZoomControls();
    setupUndoRedo();
    setupKeyboardShortcuts();
    setupPlotNameInput();
    setupPropertiesPanel();
    setupVenueMap();
    setupSetListPage();

    // Flush pending saves on page unload
    window.addEventListener('beforeunload', () => {
        if (state.autoSaveTimeout) {
            clearTimeout(state.autoSaveTimeout);
            state.autoSaveTimeout = null;
        }

        // Save draft canvas to localStorage for recovery
        if (state.isDraftPlot && state.canvas) {
            const nonGridObjects = state.canvas.getObjects().filter(o => !o.gridLine);
            if (nonGridObjects.length > 0) {
                try {
                    const canvasJSON = state.canvas.toJSON(CUSTOM_FABRIC_PROPS);
                    localStorage.setItem('stagePlot_draftCanvas', JSON.stringify(canvasJSON));
                    localStorage.setItem('stagePlot_draftStageType', state.currentStagePlotType);
                    const plotNameInput = document.getElementById('plot-name-input');
                    localStorage.setItem('stagePlot_draftName', plotNameInput?.value || 'Untitled Plot');
                } catch (e) {
                    console.error('Error saving draft to localStorage:', e);
                }
            }
        }

        // For saved plots with dirty objects, flush the save
        if (!state.isDraftPlot && state.currentPlotId &&
            (state.dirtyObjectIds.size > 0 || state.deletedObjectIds.size > 0)) {
            savePlot();
        }
    });

    // Also flush on visibility change (more reliable on mobile)
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') {
            if (state.autoSaveTimeout) {
                clearTimeout(state.autoSaveTimeout);
                state.autoSaveTimeout = null;
            }
            if (!state.isDraftPlot && state.currentPlotId &&
                (state.dirtyObjectIds.size > 0 || state.deletedObjectIds.size > 0)) {
                savePlot();
            }
        }
    });

    // Restore page from URL hash (or default to dashboard)
    const hash = location.hash.replace('#', '');
    if (hash && document.getElementById(hash)) {
        switchPage(hash);
        // Update nav link active state to match
        const navLinks = document.querySelectorAll('.nav-link');
        navLinks.forEach(l => l.classList.toggle('active', l.dataset.page === hash));
        updateNavGroupIndicators();
    } else {
        switchPage('dashboard');
    }

    // Browser back/forward navigation
    window.addEventListener('hashchange', () => {
        const page = location.hash.replace('#', '');
        if (page && document.getElementById(page) && page !== state.currentPage) {
            switchPage(page);
            const navLinks = document.querySelectorAll('.nav-link');
            navLinks.forEach(l => l.classList.toggle('active', l.dataset.page === page));
            updateNavGroupIndicators();
        }
    });
}

// Venue Map - setup is at end of file (setupVenueMap)

// Navigation
function setupNavigation() {
    const navLinks = document.querySelectorAll('.nav-link');

    navLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const page = link.dataset.page;
            switchPage(page);

            // Update active state
            navLinks.forEach(l => l.classList.remove('active'));
            link.classList.add('active');
            updateNavGroupIndicators();

            // Close mobile menu when clicking a link
            closeHamburgerMenu();
            // Close any open nav groups
            document.querySelectorAll('.nav-group.open').forEach(g => g.classList.remove('open'));
        });
    });

    // Mobile accordion toggles for nav groups
    document.querySelectorAll('.nav-group-toggle').forEach(toggle => {
        toggle.addEventListener('click', () => {
            const group = toggle.closest('.nav-group');
            // Close other groups
            document.querySelectorAll('.nav-group.open').forEach(g => {
                if (g !== group) g.classList.remove('open');
            });
            group.classList.toggle('open');
        });
    });

    // Set initial group indicators
    updateNavGroupIndicators();
}

function updateNavGroupIndicators() {
    document.querySelectorAll('.nav-group').forEach(g => {
        g.classList.toggle('has-active', g.querySelector('.nav-link.active') !== null);
    });
}

// Hamburger Menu
function setupHamburgerMenu() {
    const hamburger = document.getElementById('hamburger');
    const navMenu = document.getElementById('nav-menu');

    if (!hamburger || !navMenu) return;

    // Toggle menu on hamburger click
    hamburger.addEventListener('click', () => {
        const isActive = hamburger.classList.contains('active');

        if (isActive) {
            closeHamburgerMenu();
        } else {
            openHamburgerMenu();
        }
    });

    // Close menu when clicking outside
    document.addEventListener('click', (e) => {
        if (!hamburger.contains(e.target) && !navMenu.contains(e.target)) {
            closeHamburgerMenu();
        }
    });
}

function openHamburgerMenu() {
    const hamburger = document.getElementById('hamburger');
    const navMenu = document.getElementById('nav-menu');

    hamburger.classList.add('active');
    navMenu.classList.add('active');
    document.body.classList.add('menu-open');
    // Auto-expand all nav groups so all pages are visible
    document.querySelectorAll('.nav-group').forEach(g => g.classList.add('open'));
}

function closeHamburgerMenu() {
    const hamburger = document.getElementById('hamburger');
    const navMenu = document.getElementById('nav-menu');

    if (hamburger && navMenu) {
        hamburger.classList.remove('active');
        navMenu.classList.remove('active');
        document.body.classList.remove('menu-open');
        // Close any open accordion groups
        document.querySelectorAll('.nav-group.open').forEach(g => g.classList.remove('open'));
    }
}

function switchPage(pageName) {
    const pages = document.querySelectorAll('.page');
    pages.forEach(page => page.classList.remove('active'));

    const targetPage = document.getElementById(pageName);
    if (targetPage) {
        targetPage.classList.add('active');
        state.currentPage = pageName;
        window.location.hash = pageName;

        // Clear editing state when switching pages
        state.budgetEditingRowId = null;
        state.budgetRenderPending = false;
        state.pendingNewBudgetRow = {};
        state.stageEditingRowId = null;
        state.stageRenderPending = false;
        state.pendingNewStageRow = {};
        state.timelineEditingRowId = null;
        state.timelineRenderPending = false;
        state.pendingNewRow = {};

        // Refresh data for the page
        if (pageName === 'dashboard') updateDashboard();
        if (pageName === 'vendors') {
            state.vendorFilter = 'all';
            state.vendorSearch = '';
            state.vendorView = 'grid';
            state.vendorScheduleFilter = 'all';
            state.vendorScheduleEditingRowId = null;
            state.vendorScheduleRenderPending = false;
            state.pendingVendorScheduleEdit = null;
            state.vendorGanttDay = 'saturday';
            const vendorSearchInput = document.getElementById('vendor-search-input');
            if (vendorSearchInput) vendorSearchInput.value = '';
            const vendorFilterBtns = document.querySelectorAll('#vendor-card-view .vendor-filter-btn');
            vendorFilterBtns.forEach(b => b.classList.toggle('active', b.dataset.filter === 'all'));
            const vendorCardBtn = document.getElementById('vendor-card-view-btn');
            const vendorScheduleBtn = document.getElementById('vendor-schedule-view-btn');
            if (vendorCardBtn) vendorCardBtn.classList.add('active');
            if (vendorScheduleBtn) vendorScheduleBtn.classList.remove('active');
            const vendorCardContainer = document.getElementById('vendor-card-view');
            const vendorScheduleContainer = document.getElementById('vendor-schedule-view');
            if (vendorCardContainer) vendorCardContainer.style.display = '';
            if (vendorScheduleContainer) vendorScheduleContainer.style.display = 'none';
            renderVendors();
        }
        if (pageName === 'staff') {
            state.staffSearch = '';
            state.staffFilter = 'all';
            const staffSearchInput = document.getElementById('staff-search-input');
            if (staffSearchInput) staffSearchInput.value = '';
            updateStaffUnfilledCard();
            renderStaff();
        }
        if (pageName === 'budget') renderBudget();
        if (pageName === 'timeline') {
            // Reset to first day tab (Thursday)
            state.timelineAnimateRows = true;
            state.currentDay = 'Thursday';
            const dayTabs = document.querySelectorAll('.day-tab[data-day]');
            dayTabs.forEach(t => t.classList.remove('active'));
            if (dayTabs.length > 0) dayTabs[0].classList.add('active');
            renderTimeline();
        }
        if (pageName === 'technical-cue-sheet') {
            state.cueSheetEditingRowId = null;
            state.cueSheetRenderPending = false;
            const showHiddenCheckbox = document.getElementById('cue-show-hidden-checkbox');
            if (showHiddenCheckbox) showHiddenCheckbox.checked = state.cueSheetShowHidden;
            renderCueSheet();
        }
        if (pageName === 'input-lists') {
            // Reset to first stage tab (Main Stage)
            state.currentStage = 'main';
            const stageTabs = document.querySelectorAll('.day-tab[data-stage]');
            stageTabs.forEach(t => t.classList.remove('active'));
            if (stageTabs.length > 0) stageTabs[0].classList.add('active');
            renderStageInputs();
        }
        if (pageName === 'staff') renderStaff();
        if (pageName === 'set-lists') {
            state.setListSearch = '';
            state.setListStageFilter = 'all';
            const slSearchInput = document.getElementById('setlist-search-input');
            if (slSearchInput) slSearchInput.value = '';
            const slTabs = document.querySelectorAll('#setlist-stage-tabs .day-tab');
            slTabs.forEach(t => t.classList.toggle('active', t.dataset.setlistStage === 'all'));
            renderSetLists();
        }
        if (pageName === 'menu') {
            state.menuSearch = '';
            state.menuCategoryFilter = 'all';
            state.menuStatusFilter = 'all';
            state.menuViewMode = 'category';
            const menuSearchInput = document.getElementById('menu-search-input');
            if (menuSearchInput) menuSearchInput.value = '';
            const menuStatusSelect = document.getElementById('menu-status-filter');
            if (menuStatusSelect) menuStatusSelect.value = 'all';
            document.querySelectorAll('.menu-view-btn').forEach(b => b.classList.toggle('active', b.dataset.view === 'category'));
            document.querySelectorAll('.menu-cat-tab').forEach(b => b.classList.toggle('active', b.dataset.cat === 'all'));
            renderMenu();
        }
        if (pageName === 'stage-plots') initializeStagePlots();
        if (pageName === 'venue-map') {
            if (state.vmCanvas) {
                // Re-render canvas after it becomes visible
                setTimeout(() => state.vmCanvas.renderAll(), 50);
            } else {
                // First visit — initialize canvas now that the page is visible
                vmInitCanvas();
            }
        }
        if (pageName === 'printed-materials') {
            state.printSearch = '';
            state.printStatusFilter = 'all';
            state.printVendorFilter = 'all';
            const printSearchInput = document.getElementById('print-search-input');
            if (printSearchInput) printSearchInput.value = '';
            const printStatusSelect = document.getElementById('print-status-filter');
            if (printStatusSelect) printStatusSelect.value = 'all';
            const printVendorSelect = document.getElementById('print-vendor-filter');
            if (printVendorSelect) printVendorSelect.value = 'all';
            renderPrintedMaterials();
        }
        if (pageName === 'seating') {
            state.seatingEditingRowId = null;
            state.seatingRenderPending = false;
            state.pendingNewGuestRow = {};
            state.seatingSearch = '';
            state.seatingUnassignedOnly = false;
            const sInput = document.getElementById('seating-search-input');
            if (sInput) sInput.value = '';
            const uOnly = document.getElementById('seating-unassigned-only');
            if (uOnly) uOnly.checked = false;
            renderSeatingTable();
            updateSeatingStats();
            if (state.seatingView === 'map') {
                setTimeout(() => seatingInitCanvas(), 50);
            }
        }
        if (pageName === 'digital-assets') {
            state.daSearch = '';
            state.daStatusFilter = 'all';
            const daSearchInput = document.getElementById('da-search-input');
            if (daSearchInput) daSearchInput.value = '';
            const daStatusSelect = document.getElementById('da-status-filter');
            if (daStatusSelect) daStatusSelect.value = 'all';
            renderDigitalAssets();
        }
    }
}

// Countdown Timer
function setupCountdown() {
    updateCountdown();
    setInterval(updateCountdown, 60000); // Update every minute
}

function updateCountdown() {
    const now = new Date();
    const diff = eventDate - now;

    if (diff > 0) {
        const days = Math.floor(diff / (1000 * 60 * 60 * 24));
        const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

        document.getElementById('days').textContent = days;
        document.getElementById('hours').textContent = hours;
        document.getElementById('minutes').textContent = minutes;
    } else {
        document.getElementById('days').textContent = '0';
        document.getElementById('hours').textContent = '0';
        document.getElementById('minutes').textContent = '0';
    }
}

// Generic utility functions for data loading
function setupCollectionListener(collectionKey, stateKey, renderCallbacks = []) {
    if (!collections[collectionKey]) {
        console.warn(`Collection '${collectionKey}' not configured — skipping listener`);
        return;
    }
    collections[collectionKey].onSnapshot((snapshot) => {
        state[stateKey] = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));

        // Call all render callbacks
        renderCallbacks.forEach(callback => callback());
    }, (error) => {
        console.error(`Error loading ${collectionKey}:`, error);
    });
}

// Load all data from Firestore
function loadAllData() {
    setupCollectionListener('budget', 'budget', [renderBudget, renderVendors, updateDashboard, renderStaff, backfillLinkedContactInfo]);
    setupCollectionListener('timeline', 'timeline', [renderTimeline, renderCueSheet, updateDashboard]);
    setupCollectionListener('mainStageInputs', 'mainStageInputs', [renderStageInputs]);
    setupCollectionListener('cocktailStageInputs', 'cocktailStageInputs', [renderStageInputs]);
    setupCollectionListener('staff', 'staff', [renderStaff, renderVendors, backfillLinkedContactInfo]);
    setupCollectionListener('stagePlots', 'stagePlots', [updatePlotSelector, renderTimeline]);
    setupCollectionListener('setLists', 'setLists', [renderSetLists, updateDashboard, renderTimeline]);
    setupCollectionListener('packingList', 'packingList', [renderPackingList]);
    setupCollectionListener('packingCategoryColors', 'packingCategoryColors', [renderPackingList]);
    setupCollectionListener('menuItems', 'menuItems', [renderMenu, updateDashboard]);
    setupCollectionListener('printedMaterials', 'printedMaterials', [renderPrintedMaterials]);
    setupCollectionListener('digitalAssets', 'digitalAssets', [renderDigitalAssets]);
    setupCollectionListener('guests', 'guests', [renderSeatingTable, renderSeatingMap, renderSeatingPanel, updateSeatingStats]);
    setupCollectionListener('seatingTables', 'seatingTables', [renderSeatingTable, renderSeatingMap, renderSeatingPanel, updateSeatingStats]);
}

// Dashboard
function updateDashboard() {
    updateBudgetStats();
    updateVendorStats();
    updateTimelineStats();
    updateSetListDashboard();
    updateMenuDashboard();
}

function updateMenuDashboard() {
    const el = document.getElementById('dashboard-menu-count');
    if (el) el.textContent = state.menuItems.length;
    const label = document.getElementById('dashboard-menu-label');
    if (label) label.textContent = state.menuItems.length === 1 ? 'Menu Item' : 'Menu Items';
}

function updateSetListDashboard() {
    const el = document.getElementById('dashboard-setlist-count');
    if (el) el.textContent = state.setLists.length;
    const label = document.getElementById('dashboard-setlist-label');
    if (label) label.textContent = state.setLists.length === 1 ? 'Performance' : 'Performances';
}

function updateBudgetStats() {
    const totalBudget = state.budget.reduce((sum, item) => sum + (parseFloat(item.budgeted) || 0), 0);
    const totalSpent = state.budget.reduce((sum, item) => sum + (parseFloat(item.actual) || 0), 0);
    const remaining = totalBudget - totalSpent;
    const percentage = totalBudget > 0 ? (totalSpent / totalBudget * 100).toFixed(1) : 0;

    document.getElementById('total-budget').textContent = formatCurrency(totalBudget);
    document.getElementById('total-spent').textContent = formatCurrency(totalSpent);
    document.getElementById('total-remaining').textContent = formatCurrency(remaining);
    document.getElementById('budget-progress').style.width = `${Math.min(percentage, 100)}%`;
    document.getElementById('budget-percentage').textContent = `${percentage}%`;

    // Update budget page stats
    document.getElementById('budget-total').textContent = formatCurrency(totalBudget);
    document.getElementById('budget-spent').textContent = formatCurrency(totalSpent);
    document.getElementById('budget-remaining').textContent = formatCurrency(remaining);
}

function updateVendorStats() {
    const confirmed = state.budget.filter(b => b.confirmed).length;
    const total = state.budget.length;
    const pending = total - confirmed;
    const issueCount = state.budget.filter(b => getVendorIssues(b).length > 0).length;

    document.getElementById('vendors-confirmed').textContent = confirmed;
    document.getElementById('vendor-confirmed-count').textContent = confirmed;
    document.getElementById('vendor-pending-count').textContent = pending;
    document.getElementById('vendor-issue-count').textContent = issueCount;

    // Update filter button count badges
    const el = (id) => document.getElementById(id);
    const setCount = (id, count) => { const e = el(id); if (e) e.textContent = count > 0 ? count : ''; };
    setCount('vendor-filter-all-count', total);
    setCount('vendor-filter-confirmed-count', confirmed);
    setCount('vendor-filter-pending-count', pending);
    setCount('vendor-filter-issue-count', issueCount);

}

// Vendor Issues
function getVendorIssues(item) {
    const issues = [];
    if (!item.vendor) issues.push('vendor/item');
    if (!item.description) issues.push('description');
    if (!item.inKind && !item.budgeted) issues.push('budgeted');
    if (!item.noContactNeeded && !item.offSite) {
        if (!item.phone) issues.push('phone');
        if (!item.email) issues.push('email');
    }
    return issues;
}

function vendorItemMatchesSearch(item, query) {
    if (!query) return true;
    const tokens = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (tokens.length === 0) return true;
    const fields = [
        item.vendor || '', item.description || '', item.category || '',
        item.contact || '', item.email || '', item.phone || '', item.owner || '', item.notes || ''
    ];
    const text = fields.join(' ').toLowerCase();
    return tokens.every(t => text.includes(t));
}

function handleVendorSearch(value) {
    clearTimeout(vendorSearchDebounce);
    vendorSearchDebounce = setTimeout(() => {
        state.vendorSearch = value;
        renderVendors();
    }, 150);
}

function clearVendorSearch() {
    const input = document.getElementById('vendor-search-input');
    if (input) input.value = '';
    state.vendorSearch = '';
    renderVendors();
}

window.handleVendorSearch = handleVendorSearch;
window.clearVendorSearch = clearVendorSearch;

function toggleVendorCategorySection(categoryId) {
    const content = document.getElementById(`vendor-content-${categoryId}`);
    const arrow = document.getElementById(`vendor-arrow-${categoryId}`);
    if (content.style.display === 'none') {
        content.style.display = 'block';
        arrow.textContent = '▼';
    } else {
        content.style.display = 'none';
        arrow.textContent = '▶';
    }
}
window.toggleVendorCategorySection = toggleVendorCategorySection;

function summarizeVendorSchedule(sched) {
    if (!sched) return '';
    const days = [
        ['thursday', 'Thu'], ['friday', 'Fri'], ['saturday', 'Sat'], ['sunday', 'Sun']
    ].filter(([k]) => sched[k]).map(([, label]) => label);
    if (days.length === 0) return '';
    return `<div class="vendor-detail"><span class="vendor-detail-icon">📅</span> On-site ${days.join(', ')}</div>`;
}

function renderVendors() {
    if (state.vendorView === 'schedule') {
        renderVendorSchedule();
    } else {
        renderVendorCards();
    }
}

function setVendorView(view) {
    state.vendorView = view;
    const cardBtn = document.getElementById('vendor-card-view-btn');
    const schedBtn = document.getElementById('vendor-schedule-view-btn');
    const cardView = document.getElementById('vendor-card-view');
    const schedView = document.getElementById('vendor-schedule-view');
    if (cardBtn) cardBtn.classList.toggle('active', view === 'grid');
    if (schedBtn) schedBtn.classList.toggle('active', view === 'schedule');
    if (cardView) cardView.style.display = view === 'grid' ? '' : 'none';
    if (schedView) schedView.style.display = view === 'schedule' ? '' : 'none';
    renderVendors();
}
window.setVendorView = setVendorView;

function setVendorScheduleFilter(filter) {
    state.vendorScheduleFilter = filter;
    document.querySelectorAll('#vendor-schedule-view [data-schedule-filter]').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.scheduleFilter === filter);
    });
    renderVendorSchedule();
}
window.setVendorScheduleFilter = setVendorScheduleFilter;

function renderVendorCards() {
    const container = document.getElementById('vendor-grid');
    if (!container) return;

    // Capture expanded categories and scroll position before re-render
    const expandedCategories = new Set();
    container.querySelectorAll('.vendor-category-content').forEach(el => {
        if (el.style.display !== 'none') {
            expandedCategories.add(el.id);
        }
    });
    const scrollY = window.scrollY;

    let items = [...state.budget];

    // Apply status filter
    if (state.vendorFilter === 'confirmed') {
        items = items.filter(b => b.confirmed);
    } else if (state.vendorFilter === 'pending') {
        items = items.filter(b => !b.confirmed);
    } else if (state.vendorFilter === 'issues') {
        items = items.filter(b => getVendorIssues(b).length > 0);
    }

    // Apply search
    const searchQuery = state.vendorSearch;
    const isSearching = searchQuery && searchQuery.trim().length > 0;
    if (isSearching) {
        items = items.filter(item => vendorItemMatchesSearch(item, searchQuery));
    }

    // Update search count
    const countEl = document.getElementById('vendor-search-count');
    if (countEl) {
        const totalFiltered = state.budget.length;
        countEl.textContent = isSearching
            ? `${items.length} of ${totalFiltered} vendors`
            : `${totalFiltered} vendors`;
        countEl.style.display = totalFiltered > 0 ? '' : 'none';
    }
    const clearBtn = document.getElementById('vendor-search-clear');
    if (clearBtn) clearBtn.style.display = isSearching ? '' : 'none';

    if (items.length === 0) {
        if (state.vendorFilter === 'issues') {
            container.innerHTML = '<div class="staff-empty-state">All clear — no missing vendor information!</div>';
        } else if (isSearching) {
            container.innerHTML = `<div class="staff-empty-state">No vendors match "${escapeHtml(searchQuery)}"</div>`;
        } else {
            container.innerHTML = '<div class="staff-empty-state">No vendors found</div>';
        }
        return;
    }

    // Group by category
    const categorized = {};
    items.forEach(item => {
        const cat = item.category || 'Uncategorized';
        if (!categorized[cat]) categorized[cat] = [];
        categorized[cat].push(item);
    });

    const sortedCategories = Object.entries(categorized).sort((a, b) => a[0].localeCompare(b[0]));

    let cardIdx = 0;
    container.innerHTML = sortedCategories.map(([category, catItems]) => {
        const categoryId = category.replace(/[^a-zA-Z0-9]/g, '_');
        const displayName = category.replace(/^6811[a-g] - /, '');
        const budgetTotal = catItems.reduce((sum, item) => sum + (parseFloat(item.budgeted) || 0), 0);

        const cardsHtml = catItems.map(item => {
            const issues = getVendorIssues(item);
            const hasIssues = issues.length > 0;
            const isConfirmed = item.confirmed;
            const itemCategory = (item.category || '').replace(/^6811[a-g] - /, '');

            let statusClass = isConfirmed ? 'vendor-confirmed' : 'vendor-pending';
            if (hasIssues) statusClass = 'vendor-has-issues';

            const linkedStaff = getLinkedStaff(item);

            const issuePills = hasIssues ? `
                <div class="vendor-issues">
                    <span class="vendor-issues-label">Missing:</span>
                    ${issues.map(i => `<span class="vendor-issue-pill">${escapeHtml(i)}</span>`).join('')}
                </div>
            ` : '';

            const delay = cardIdx * 40;
            cardIdx++;

            return `
                <div class="vendor-card ${statusClass}" style="animation-delay: ${delay}ms">
                    <div class="vendor-card-header">
                        <div class="vendor-card-title">${escapeHtml(item.vendor || 'Unnamed')}</div>
                        <span class="status-badge ${isConfirmed ? 'confirmed' : 'pending'}">${isConfirmed ? 'Confirmed' : 'Pending'}</span>
                    </div>
                    ${item.description ? `<div class="vendor-card-description">${escapeHtml(item.description)}</div>` : ''}
                    <div class="vendor-card-category">${escapeHtml(itemCategory)}</div>
                    ${linkedStaff ? `<div class="vendor-linked-staff"><span class="vendor-detail-icon">👥</span> Staff: ${escapeHtml(linkedStaff.name)}${linkedStaff.role ? ' (' + escapeHtml(linkedStaff.role) + ')' : ''}</div>` : ''}
                    <div class="vendor-card-details">
                        ${item.noContactNeeded ? `<div class="vendor-detail"><span class="vendor-detail-icon">🌐</span> Online vendor</div>` : ''}
                        ${item.offSite ? `<div class="vendor-detail"><span class="vendor-detail-icon">🚫</span> Off-site</div>` : ''}
                        ${item.contact ? `<div class="vendor-detail"><span class="vendor-detail-icon">👤</span> ${escapeHtml(item.contact)}</div>` : ''}
                        ${item.phone ? `<div class="vendor-detail"><span class="vendor-detail-icon">📞</span> <a href="tel:${escapeHtml(item.phone)}">${escapeHtml(item.phone)}</a></div>` : ''}
                        ${item.email ? `<div class="vendor-detail"><span class="vendor-detail-icon">✉</span> <a href="mailto:${escapeHtml(item.email)}">${escapeHtml(item.email)}</a></div>` : ''}
                        ${summarizeVendorSchedule(linkedStaff ? linkedStaff.schedule : item.schedule)}
                    </div>
                    <div class="vendor-card-budget">
                        ${item.inKind ? '<span class="vendor-in-kind-badge">In-Kind</span>' : ''}
                        <span>Budgeted: <strong>${formatCurrency(item.budgeted)}</strong></span>
                        ${item.actual ? `<span>Actual: <strong>${formatCurrency(item.actual)}</strong></span>` : ''}
                    </div>
                    ${issuePills}
                    <div class="vendor-card-actions">
                        ${hasIssues
                            ? `<button class="btn btn-fix-issues" onclick="editBudgetItem('${item.id}')">Fix Issues</button>`
                            : `<button class="btn btn-edit" onclick="editBudgetItem('${item.id}')">Edit</button>`}
                        <div class="vendor-action-icons">
                            <button class="action-icon" onclick="editBudgetItem('${item.id}')" title="Edit">
                                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                            </button>
                            <button class="action-icon action-icon-danger" onclick="deleteBudgetItem('${item.id}')" title="Delete">
                                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                            </button>
                        </div>
                    </div>
                </div>
            `;
        }).join('');

        return `
            <div class="vendor-category-section">
                <div class="vendor-category-header" onclick="toggleVendorCategorySection('${categoryId}')">
                    <span class="category-arrow" id="vendor-arrow-${categoryId}">${isSearching ? '▼' : '▶'}</span>
                    <h3>${escapeHtml(displayName)}</h3>
                    <span class="category-count">${catItems.length} vendors</span>
                    <span style="font-size: 0.9rem; color: #8a8778; margin-left: auto;"><strong>Budget:</strong> ${formatCurrency(budgetTotal)}</span>
                </div>
                <div class="vendor-category-content" id="vendor-content-${categoryId}" style="display: ${isSearching ? 'block' : 'none'};">
                    <div class="vendor-grid">
                        ${cardsHtml}
                    </div>
                </div>
            </div>
        `;
    }).join('');

    // Restore expanded categories and scroll position after re-render
    expandedCategories.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.style.display = 'block';
            const arrow = document.getElementById(id.replace('vendor-content-', 'vendor-arrow-'));
            if (arrow) arrow.textContent = '▼';
        }
    });
    requestAnimationFrame(() => window.scrollTo(0, scrollY));
}

// ---------- Vendor Schedule view (inline day-cell edit) ----------

const VENDOR_SCHEDULE_DAYS = [
    ['thursday', 'Thu'],
    ['friday', 'Fri'],
    ['saturday', 'Sat'],
    ['sunday', 'Sun']
];

function vendorHasFullSchedule(sched) {
    if (!sched) return false;
    return VENDOR_SCHEDULE_DAYS.every(([k]) => sched[k] && String(sched[k]).trim());
}

function renderVendorSchedule() {
    const container = document.getElementById('vendor-schedule-container');
    if (!container) return;

    // Skip re-render if a cell is being inline-edited (Firestore listener may fire mid-edit)
    if (state.vendorScheduleEditingRowId) {
        state.vendorScheduleRenderPending = true;
        return;
    }

    // Remember expanded categories (reuses same id prefix as cards view — they're never mounted together)
    const expandedCategories = new Set();
    container.querySelectorAll('.vendor-category-content').forEach(el => {
        if (el.style.display !== 'none') expandedCategories.add(el.id);
    });

    let items = [...state.budget];

    // Apply needs-schedule filter
    if (state.vendorScheduleFilter === 'needs-schedule') {
        items = items.filter(item => {
            if (item.offSite) return false;
            const linked = getLinkedStaff(item);
            const sched = linked ? (linked.schedule || {}) : (item.schedule || {});
            return !vendorHasFullSchedule(sched);
        });
    }

    if (items.length === 0) {
        container.innerHTML = state.vendorScheduleFilter === 'needs-schedule'
            ? '<div class="vendor-sched-empty">All vendors have complete schedules (or are marked off-site).</div>'
            : '<div class="vendor-sched-empty">No vendors yet.</div>';
        return;
    }

    // Group by category (same ordering as card view)
    const categorized = {};
    items.forEach(item => {
        const cat = item.category || 'Uncategorized';
        if (!categorized[cat]) categorized[cat] = [];
        categorized[cat].push(item);
    });
    const sortedCategories = Object.entries(categorized).sort((a, b) => a[0].localeCompare(b[0]));

    const html = sortedCategories.map(([category, catItems]) => {
        const categoryId = category.replace(/[^a-zA-Z0-9]/g, '_');
        const displayName = category.replace(/^6811[a-g] - /, '');

        // Sort rows: unlinked, on-site, needs-schedule first; then linked; then off-site
        catItems.sort((a, b) => {
            const offA = a.offSite ? 1 : 0;
            const offB = b.offSite ? 1 : 0;
            if (offA !== offB) return offA - offB;
            const linkA = a.linkedStaffId ? 1 : 0;
            const linkB = b.linkedStaffId ? 1 : 0;
            if (linkA !== linkB) return linkA - linkB;
            return (a.vendor || '').localeCompare(b.vendor || '');
        });

        const rowsHtml = catItems.map(item => {
            const linked = getLinkedStaff(item);
            const sched = linked ? (linked.schedule || {}) : (item.schedule || {});
            const isOffSite = item.offSite === true;
            const isLinked = !!linked;
            const rowClasses = ['vendor-sched-row'];
            if (isOffSite) rowClasses.push('off-site');
            if (isLinked) rowClasses.push('linked');

            const dayCells = VENDOR_SCHEDULE_DAYS.map(([key]) => {
                const raw = sched[key] || '';
                const display = raw ? escapeHtml(normalizeTimeForPrint(raw) || raw)
                                    : '<span class="phantom-placeholder">—</span>';
                if (isOffSite) {
                    return `<td class="vendor-sched-cell" data-field="day" data-day="${key}"><span class="phantom-placeholder">—</span></td>`;
                }
                if (isLinked) {
                    return `<td class="vendor-sched-cell" data-field="day" data-day="${key}" data-original="${escapeHtml(raw)}" title="Also editable on staff tab" onclick="editVendorScheduleCell(this)">${display}</td>`;
                }
                return `<td class="vendor-sched-cell" data-field="day" data-day="${key}" data-original="${escapeHtml(raw)}" onclick="editVendorScheduleCell(this)">${display}</td>`;
            }).join('');

            const vendorLabel = escapeHtml(item.vendor || 'Unnamed');
            const subtitleParts = [];
            if (item.description) subtitleParts.push(escapeHtml(item.description));
            const subtitle = subtitleParts.length ? `<span class="vendor-sched-subtitle">${subtitleParts.join(' · ')}</span>` : '';

            const linkedBadge = isLinked
                ? ` <span class="vendor-sched-linked-badge" onclick="event.stopPropagation(); openStaffModal('${linked.id}')" title="Open staff entry">also on staff tab</span>`
                : '';
            const offSitePill = isOffSite ? ` <span class="vendor-sched-offsite-pill">Off-site</span>` : '';

            const switchDisabled = isLinked ? 'disabled' : '';
            const switchChecked = !isOffSite ? 'checked' : '';
            const switchTitle = isLinked
                ? 'Linked to staff — presence controlled by staff entry'
                : (isOffSite ? 'Off-site (hidden from check-in list)' : 'On-site (shown on check-in list)');

            const contactLine = item.contact ? escapeHtml(item.contact) : '';

            return `
                <tr class="${rowClasses.join(' ')}" data-id="${item.id}">
                    <td>
                        <span class="vendor-sched-vendor" onclick="editBudgetItem('${item.id}')">${vendorLabel}</span>${linkedBadge}${offSitePill}
                        ${subtitle}
                    </td>
                    <td class="vendor-sched-onsite-cell">
                        <input type="checkbox" class="vendor-onsite-switch" ${switchChecked} ${switchDisabled}
                            title="${switchTitle}"
                            onchange="toggleVendorOffSite('${item.id}', this.checked)">
                    </td>
                    ${dayCells}
                    <td class="vendor-sched-contact">${contactLine}</td>
                </tr>`;
        }).join('');

        return `
            <div class="vendor-category-section">
                <div class="vendor-category-header" onclick="toggleVendorCategorySection('${categoryId}')">
                    <span class="category-arrow" id="vendor-arrow-${categoryId}">▼</span>
                    <h3>${escapeHtml(displayName)}</h3>
                    <span class="category-count">${catItems.length} vendors</span>
                </div>
                <div class="vendor-category-content" id="vendor-content-${categoryId}" style="display:block;">
                    <table class="vendor-sched-table">
                        <thead>
                            <tr>
                                <th>Vendor</th>
                                <th class="vendor-sched-onsite-cell">On-site</th>
                                <th>Thu</th>
                                <th>Fri</th>
                                <th>Sat</th>
                                <th>Sun</th>
                                <th>Contact</th>
                            </tr>
                        </thead>
                        <tbody>${rowsHtml}</tbody>
                    </table>
                </div>
            </div>
        `;
    }).join('');

    container.innerHTML = html;

    // Restore collapsed/expanded state from previous render (default: expanded on first render)
    if (expandedCategories.size > 0) {
        container.querySelectorAll('.vendor-category-content').forEach(el => {
            const isExpanded = expandedCategories.has(el.id);
            el.style.display = isExpanded ? 'block' : 'none';
            const arrow = document.getElementById(el.id.replace('vendor-content-', 'vendor-arrow-'));
            if (arrow) arrow.textContent = isExpanded ? '▼' : '▶';
        });
    }

    renderVendorGantt();
}

function editVendorScheduleCell(cell) {
    if (cell.querySelector('.inline-edit-input')) return;
    const row = cell.closest('tr');
    if (!row) return;
    const id = row.dataset.id;
    const day = cell.dataset.day;
    const original = cell.dataset.original || '';

    state.vendorScheduleEditingRowId = id;
    state.pendingVendorScheduleEdit = { id, day, originalValue: original };
    row.classList.add('editing');

    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'inline-edit-input';
    input.value = original;
    input.placeholder = 'e.g. 10am-6pm';
    cell.textContent = '';
    cell.appendChild(input);
    input.focus();
    input.select();

    input.addEventListener('keydown', (e) => handleVendorScheduleKeydown(e, cell, row));
    input.addEventListener('blur', () => {
        setTimeout(() => {
            if (cell.querySelector('.inline-edit-input')) saveVendorScheduleCell(cell, row);
        }, 50);
    });
}
window.editVendorScheduleCell = editVendorScheduleCell;

function restoreVendorScheduleCellDisplay(cell) {
    const raw = cell.dataset.original || '';
    const display = raw
        ? escapeHtml(normalizeTimeForPrint(raw) || raw)
        : '<span class="phantom-placeholder">—</span>';
    cell.innerHTML = display;
}

function clearVendorScheduleEditingFlag() {
    state.vendorScheduleEditingRowId = null;
    state.pendingVendorScheduleEdit = null;
    if (state.vendorScheduleRenderPending) {
        state.vendorScheduleRenderPending = false;
        renderVendors();
    }
}

function handleVendorScheduleKeydown(e, cell, row) {
    if (e.key === 'Escape') {
        e.preventDefault();
        row.classList.remove('editing');
        restoreVendorScheduleCellDisplay(cell);
        clearVendorScheduleEditingFlag();
        return;
    }
    if (e.key === 'Enter') {
        e.preventDefault();
        const day = cell.dataset.day;
        saveVendorScheduleCell(cell, row, () => {
            const nextRow = row.nextElementSibling;
            if (!nextRow) return;
            const nextCell = nextRow.querySelector(`td[data-day="${day}"][onclick]`);
            if (nextCell) editVendorScheduleCell(nextCell);
        });
        return;
    }
    if (e.key === 'Tab') {
        e.preventDefault();
        const day = cell.dataset.day;
        const forward = !e.shiftKey;
        saveVendorScheduleCell(cell, row, () => {
            const idx = VENDOR_SCHEDULE_DAYS.findIndex(([k]) => k === day);
            const nextIdx = forward ? idx + 1 : idx - 1;
            if (nextIdx >= 0 && nextIdx < VENDOR_SCHEDULE_DAYS.length) {
                const nextKey = VENDOR_SCHEDULE_DAYS[nextIdx][0];
                const nextCell = row.querySelector(`td[data-day="${nextKey}"][onclick]`);
                if (nextCell) { editVendorScheduleCell(nextCell); return; }
            }
            // Wrap to adjacent row
            const neighborRow = forward ? row.nextElementSibling : row.previousElementSibling;
            if (!neighborRow) return;
            const wrapKey = forward ? VENDOR_SCHEDULE_DAYS[0][0] : VENDOR_SCHEDULE_DAYS[VENDOR_SCHEDULE_DAYS.length - 1][0];
            const wrapCell = neighborRow.querySelector(`td[data-day="${wrapKey}"][onclick]`);
            if (wrapCell) editVendorScheduleCell(wrapCell);
        });
    }
}

async function saveVendorScheduleCell(cell, row, afterSave) {
    const input = cell.querySelector('.inline-edit-input');
    if (!input) return;
    const id = row.dataset.id;
    const day = cell.dataset.day;
    const original = cell.dataset.original || '';
    const newValue = input.value.trim();

    row.classList.remove('editing');

    if (newValue === original) {
        restoreVendorScheduleCellDisplay(cell);
        clearVendorScheduleEditingFlag();
        if (typeof afterSave === 'function') afterSave();
        return;
    }

    const writeValue = newValue === '' ? firebase.firestore.FieldValue.delete() : newValue;

    // Linked pairs: staff is authoritative (see commit 4d48229). Redirect write to the staff doc.
    const budgetItem = state.budget.find(b => b.id === id);
    const linkedStaffId = budgetItem && budgetItem.linkedStaffId;

    try {
        if (linkedStaffId) {
            await collections.staff.doc(linkedStaffId).update({
                [`schedule.${day}`]: writeValue,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
        } else {
            await collections.budget.doc(id).update({
                [`schedule.${day}`]: writeValue,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
        }
        cell.dataset.original = newValue;
        restoreVendorScheduleCellDisplay(cell);
        showToast('Updated');
    } catch (err) {
        console.error('Error saving vendor schedule cell:', err);
        restoreVendorScheduleCellDisplay(cell);
        showToast('Error saving', 'error');
    } finally {
        clearVendorScheduleEditingFlag();
        if (typeof afterSave === 'function') afterSave();
    }
}
window.saveVendorScheduleCell = saveVendorScheduleCell;

async function toggleVendorOffSite(id, onSite) {
    try {
        await collections.budget.doc(id).update({
            offSite: !onSite,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        showToast(onSite ? 'Marked on-site' : 'Marked off-site');
    } catch (err) {
        console.error('Error toggling vendor off-site:', err);
        showToast('Error updating', 'error');
    }
}
window.toggleVendorOffSite = toggleVendorOffSite;

// ---------- Vendor Schedule Gantt ----------

function setVendorGanttDay(day) {
    state.vendorGanttDay = day;
    document.querySelectorAll('.vendor-gantt-day-tab').forEach(tab => {
        tab.classList.toggle('active', tab.dataset.day === day);
    });
    renderVendorGantt();
}
window.setVendorGanttDay = setVendorGanttDay;

function renderVendorGantt() {
    const container = document.getElementById('vendor-gantt-container');
    if (!container) return;

    const day = state.vendorGanttDay;
    const dayKeys = ['thursday', 'friday', 'saturday', 'sunday'];
    const dayNames = ['Thu', 'Fri', 'Sat', 'Sun'];

    // Per-day counts for the tab labels
    const dayCounts = { thursday: 0, friday: 0, saturday: 0, sunday: 0 };
    for (const b of state.budget) {
        if (b.offSite === true) continue;
        const linked = getLinkedStaff(b);
        const sched = linked ? (linked.schedule || {}) : (b.schedule || {});
        for (const d of dayKeys) if (sched[d]) dayCounts[d]++;
    }
    document.querySelectorAll('.vendor-gantt-day-tab').forEach(tab => {
        const d = tab.dataset.day;
        const idx = dayKeys.indexOf(d);
        if (idx !== -1) tab.textContent = dayNames[idx] + ' (' + dayCounts[d] + ')';
    });

    // Resolve entries for the selected day
    const entries = [];
    for (const item of state.budget) {
        if (item.offSite === true) continue;
        const linked = getLinkedStaff(item);
        const sched = linked ? (linked.schedule || {}) : (item.schedule || {});
        const timeStr = sched[day];
        if (!timeStr) continue;
        entries.push({ item, linked, timeStr });
    }

    if (entries.length === 0) {
        container.innerHTML = '<div class="staff-empty-state">No vendors scheduled for this day</div>';
        return;
    }

    // Axis — match staff gantt so the two align visually
    const axisStart = 7;
    const axisEnd = 27;
    const axisRange = axisEnd - axisStart;

    const axisLabels = [];
    for (let h = axisStart; h < axisEnd; h++) {
        const displayH = h > 24 ? h - 24 : h;
        const suffix = displayH < 12 || displayH === 24 ? 'a' : 'p';
        const label = displayH === 0 ? '12a' : displayH === 12 ? '12p' : (displayH > 12 ? displayH - 12 : displayH) + suffix;
        axisLabels.push(label);
    }

    const timeAxisHtml = '<div class="vendor-gantt-time-axis">' +
        axisLabels.map(l => '<span class="vendor-gantt-time-label">' + l + '</span>').join('') +
        '</div>';

    // Group by category
    const catMap = new Map();
    for (const entry of entries) {
        const cat = entry.item.category || 'Uncategorized';
        if (!catMap.has(cat)) catMap.set(cat, []);
        catMap.get(cat).push(entry);
    }
    const sortedCats = [...catMap.keys()].sort((a, b) => a.localeCompare(b));

    let html = timeAxisHtml;
    for (const cat of sortedCats) {
        const displayCat = cat.replace(/^6811[a-g] - /, '');
        const color = getTeamColor(cat);
        const catEntries = catMap.get(cat).sort((a, b) => (a.item.vendor || '').localeCompare(b.item.vendor || ''));

        html += '<div class="vendor-gantt-team">';
        html += '<div class="vendor-gantt-team-header">' + escapeHtml(displayCat) + '</div>';

        for (const { item, linked, timeStr } of catEntries) {
            const ranges = parseStaffScheduleRange(timeStr);
            const onClick = linked
                ? `openStaffModal('${linked.id}')`
                : `editBudgetItem('${item.id}')`;
            const barsHtml = ranges.map(r => {
                const left = Math.max(0, (r.start - axisStart) / axisRange * 100);
                const width = Math.min(100 - left, (r.end - r.start) / axisRange * 100);
                const label = formatScheduleShort(timeStr) || '';
                const linkedMark = linked ? ' vendor-gantt-bar-linked' : '';
                const titleText = (item.vendor || 'Unnamed') + ': ' + timeStr + (linked ? ' (staff: ' + linked.name + ')' : '');
                return '<div class="vendor-gantt-bar' + linkedMark + '"' +
                    ' style="left:' + left + '%;width:' + width + '%;background:' + color + '"' +
                    ' onclick="' + onClick + '"' +
                    ' title="' + escapeHtml(titleText) + '">' +
                    (ranges.length === 1 ? escapeHtml(label) : '') +
                '</div>';
            }).join('');

            const displayName = escapeHtml(item.vendor || 'Unnamed');
            const linkedTag = linked ? '<span class="multi-team-tag">staff</span>' : '';

            html += '<div class="vendor-gantt-row">' +
                '<div class="vendor-gantt-name" onclick="' + onClick + '">' +
                    displayName + linkedTag +
                '</div>' +
                '<div class="vendor-gantt-bar-area">' + barsHtml + '</div>' +
            '</div>';
        }

        html += '</div>';
    }

    container.innerHTML = html;
}
window.renderVendorGantt = renderVendorGantt;

function setupVendorFilters() {
    const filterBtns = document.querySelectorAll('#vendor-card-view .vendor-filter-btn');
    filterBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            filterBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            state.vendorFilter = btn.dataset.filter;
            renderVendors();
        });
    });

    // Dashboard vendor status card clicks
    ['confirmed', 'pending', 'issues'].forEach(filter => {
        const link = document.getElementById(`dashboard-${filter}-link`);
        if (link) {
            link.addEventListener('click', () => navigateToVendorFilter(filter));
        }
    });
}

function navigateToVendorFilter(filter) {
    switchPage('vendors');

    // Override the 'all' default that switchPage just set
    state.vendorFilter = filter;

    // Update nav active state
    document.querySelectorAll('.nav-link').forEach(link => {
        link.classList.toggle('active', link.dataset.page === 'vendors');
    });
    updateNavGroupIndicators();

    // Update filter button active state
    document.querySelectorAll('.vendor-filter-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.filter === filter);
    });

    renderVendors();
}
window.navigateToVendorFilter = navigateToVendorFilter;

function updateTimelineStats() {
    const total = state.timeline.length;
    const completed = state.timeline.filter(t => t.status === 'complete').length;
    const inProgress = state.timeline.filter(t => t.status === 'in-progress').length;
    const overdue = state.timeline.filter(t => {
        if (!t.dueDate || t.status === 'complete') return false;
        return new Date(t.dueDate) < new Date();
    }).length;

    const el = (id) => document.getElementById(id);
    if (el('timeline-total')) el('timeline-total').textContent = total;
    if (el('timeline-completed')) el('timeline-completed').textContent = completed;
    if (el('timeline-in-progress')) el('timeline-in-progress').textContent = inProgress;
    if (el('timeline-overdue')) el('timeline-overdue').textContent = overdue;
}

// Toggle confirmed status for budget items
async function toggleBudgetConfirmed(id, confirmed) {
    try {
        await collections.budget.doc(id).update({
            confirmed: confirmed,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        showToast(confirmed ? 'Item confirmed' : 'Item unconfirmed');
    } catch (error) {
        console.error('Error toggling confirmed:', error);
        showToast('Error updating confirmed status', 'error');
    }
}

// Budget
function renderBudget() {
    renderBudgetGrouped();
}

// Sort budget items by a column
function sortBudgetBy(field) {
    if (state.budgetSort.field === field) {
        state.budgetSort.direction = state.budgetSort.direction === 'asc' ? 'desc' : 'asc';
    } else {
        state.budgetSort.field = field;
        state.budgetSort.direction = 'asc';
    }
    renderBudgetGrouped();
}
window.sortBudgetBy = sortBudgetBy;

function getSortedBudgetItems(items) {
    const { field, direction } = state.budgetSort;
    if (!field) return items;

    const sorted = [...items].sort((a, b) => {
        let valA, valB;

        if (field === 'confirmed') {
            valA = a.confirmed ? 1 : 0;
            valB = b.confirmed ? 1 : 0;
        } else if (field === 'budgeted' || field === 'actual') {
            valA = parseFloat(a[field]) || 0;
            valB = parseFloat(b[field]) || 0;
        } else if (field === 'difference') {
            valA = (parseFloat(a.budgeted) || 0) - (parseFloat(a.actual) || 0);
            valB = (parseFloat(b.budgeted) || 0) - (parseFloat(b.actual) || 0);
        } else {
            valA = (a[field] || '').toString().toLowerCase();
            valB = (b[field] || '').toString().toLowerCase();
        }

        if (valA < valB) return -1;
        if (valA > valB) return 1;
        return 0;
    });

    return direction === 'desc' ? sorted.reverse() : sorted;
}

function budgetSortIndicator(field) {
    if (state.budgetSort.field !== field) return '';
    return state.budgetSort.direction === 'asc' ? ' ▲' : ' ▼';
}

// Fuzzy search: returns true if all characters in pattern appear in str in order
// with a max gap of 3 characters between consecutive matches
function fuzzyMatch(pattern, str) {
    if (!pattern) return true;
    if (!str) return false;
    const p = pattern.toLowerCase();
    const s = str.toLowerCase();
    // Fast path: substring match
    if (s.includes(p)) return true;
    // Subsequence match with max gap of 3 between consecutive matched characters
    const maxGap = 3;
    let pi = 0;
    let lastMatchIndex = -1;
    for (let si = 0; si < s.length && pi < p.length; si++) {
        if (s[si] === p[pi]) {
            if (lastMatchIndex !== -1 && (si - lastMatchIndex - 1) > maxGap) {
                return false;
            }
            lastMatchIndex = si;
            pi++;
        }
    }
    return pi === p.length;
}

// Check if a budget item matches the search query (token-based, all tokens must match)
function budgetItemMatchesSearch(item, query) {
    if (!query) return true;
    const tokens = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (tokens.length === 0) return true;

    // Build searchable text fields
    const fields = [
        item.vendor || '',
        item.description || '',
        item.category || '',
        item.contact || '',
        item.notes || '',
        formatPaymentStatus(item.paymentStatus),
        item.email || '',
        item.phone || '',
        String(parseFloat(item.budgeted) || 0),
        String(parseFloat(item.actual) || 0),
        formatCurrency(parseFloat(item.budgeted) || 0),
        formatCurrency(parseFloat(item.actual) || 0)
    ];

    // Every token must fuzzy-match at least one field
    return tokens.every(token =>
        fields.some(field => fuzzyMatch(token, field))
    );
}

// Budget search handler
let budgetSearchDebounce = null;
let vendorSearchDebounce = null;
let staffSearchDebounce = null;
function handleBudgetSearch(value) {
    clearTimeout(budgetSearchDebounce);
    budgetSearchDebounce = setTimeout(() => {
        state.budgetSearch = value;
        renderBudgetGrouped();
    }, 150);
}

function clearBudgetSearch() {
    const input = document.getElementById('budget-search-input');
    if (input) input.value = '';
    state.budgetSearch = '';
    renderBudgetGrouped();
}

// Render Budget Grouped by Category (Collapsible Sections)
function renderBudgetGrouped() {
    const container = document.getElementById('budget-grouped-container');

    // Skip re-render if a row is being inline-edited
    if (state.budgetEditingRowId) {
        state.budgetRenderPending = true;
        return;
    }

    // Remember which sections are open
    const openSections = {};
    container.querySelectorAll('.category-section-content').forEach(el => {
        if (el.style.display !== 'none') {
            openSections[el.id] = true;
        }
    });

    // Update search result count
    const searchQuery = state.budgetSearch;
    const isSearching = searchQuery.trim().length > 0;
    const filteredBudget = isSearching
        ? state.budget.filter(item => budgetItemMatchesSearch(item, searchQuery))
        : state.budget;

    const countEl = document.getElementById('budget-search-count');
    if (countEl) {
        countEl.textContent = isSearching
            ? `${filteredBudget.length} of ${state.budget.length} items`
            : `${state.budget.length} items`;
        countEl.style.display = state.budget.length > 0 ? '' : 'none';
    }

    // Toggle clear button visibility
    const clearBtn = document.getElementById('budget-search-clear');
    if (clearBtn) clearBtn.style.display = isSearching ? '' : 'none';

    if (state.budget.length === 0) {
        container.innerHTML = '<div class="card"><div class="card-body"><p class="empty-state">No budget items</p></div></div>';
        return;
    }

    if (isSearching && filteredBudget.length === 0) {
        container.innerHTML = `<div class="card"><div class="card-body"><p class="empty-state">No items match "${escapeHtml(searchQuery)}"</p></div></div>`;
        return;
    }

    // Group filtered items by category
    const categorized = {};
    filteredBudget.forEach(item => {
        const cat = item.category || 'Uncategorized';
        if (!categorized[cat]) {
            categorized[cat] = [];
        }
        categorized[cat].push(item);
    });

    // Calculate totals for each category (based on filtered items)
    const categoryTotals = {};
    Object.keys(categorized).forEach(cat => {
        const budgeted = categorized[cat].reduce((sum, item) => sum + (parseFloat(item.budgeted) || 0), 0);
        const actual = categorized[cat].reduce((sum, item) => sum + (parseFloat(item.actual) || 0), 0);
        categoryTotals[cat] = { budgeted, actual, count: categorized[cat].length };
    });

    // Sort categories alphabetically by code (6811a, 6811b, etc.)
    const sortedCategories = Object.entries(categorized).sort((a, b) => {
        return a[0].localeCompare(b[0]);
    });

    // Render each category as a collapsible card (default: collapsed, or open when searching)
    container.innerHTML = sortedCategories.map(([category, items]) => {
        const totals = categoryTotals[category];
        const categoryId = category.replace(/[^a-zA-Z0-9]/g, '_');

        const percentage = totals.budgeted > 0 ? (totals.actual / totals.budgeted * 100) : 0;

        return `
            <div class="card budget-category-section">
                <div class="card-header category-section-header" onclick="toggleCategorySection('${categoryId}')">
                    <div style="display: flex; align-items: center; gap: 0.75rem; flex: 1;">
                        <span class="category-arrow" id="arrow-${categoryId}">${isSearching ? '▼' : '▶'}</span>
                        <h3 style="margin: 0;">${escapeHtml(category)}</h3>
                        <span class="category-count">${totals.count} items</span>
                    </div>
                    <div style="display: flex; gap: 1.5rem; font-size: 0.95rem;">
                        <span><strong>Budgeted:</strong> ${formatCurrency(totals.budgeted)}</span>
                        <span><strong>Spent:</strong> ${formatCurrency(totals.actual)}</span>
                        <span><strong>Remaining:</strong> ${formatCurrency(totals.budgeted - totals.actual)}</span>
                    </div>
                    <div class="budget-category-progress" style="margin-top: 8px;">
                        <div class="budget-category-progress-fill" style="width: ${Math.min(percentage, 100)}%"></div>
                    </div>
                </div>
                <div class="category-section-content" id="content-${categoryId}" style="display: ${isSearching ? 'block' : 'none'};">
                    <div class="table-container">
                        <table class="data-table budget-table">
                            <thead>
                                <tr>
                                    <th class="sortable-th" onclick="sortBudgetBy('confirmed')">Confirmed${budgetSortIndicator('confirmed')}</th>
                                    <th class="sortable-th" onclick="sortBudgetBy('vendor')">Vendor/Item${budgetSortIndicator('vendor')}</th>
                                    <th class="sortable-th" onclick="sortBudgetBy('description')">Description/Role${budgetSortIndicator('description')}</th>
                                    <th class="sortable-th" onclick="sortBudgetBy('owner')">Owner${budgetSortIndicator('owner')}</th>
                                    <th class="sortable-th" onclick="sortBudgetBy('budgeted')">Budgeted${budgetSortIndicator('budgeted')}</th>
                                    <th class="sortable-th" onclick="sortBudgetBy('actual')">Actual${budgetSortIndicator('actual')}</th>
                                    <th class="sortable-th" onclick="sortBudgetBy('difference')">Difference${budgetSortIndicator('difference')}</th>
                                    <th class="sortable-th" onclick="sortBudgetBy('paymentStatus')">Payment Status${budgetSortIndicator('paymentStatus')}</th>
                                    <th class="sortable-th" onclick="sortBudgetBy('notes')">Notes${budgetSortIndicator('notes')}</th>
                                    <th class="no-print">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${getSortedBudgetItems(items).map(item => {
                                    const budgeted = parseFloat(item.budgeted) || 0;
                                    const actual = parseFloat(item.actual) || 0;
                                    const difference = budgeted - actual;
                                    const diffClass = difference < 0 ? 'over-budget' : difference > 0 ? 'under-budget' : '';

                                    return `
                                        <tr data-id="${item.id}">
                                            <td class="confirmed-cell">
                                                <input type="checkbox" class="confirmed-checkbox" ${item.confirmed ? 'checked' : ''} onchange="toggleBudgetConfirmed('${item.id}', this.checked)">
                                            </td>
                                            <td data-field="vendor" data-original="${escapeHtml(item.vendor || '')}" onclick="editBudgetCell(this)">${escapeHtml(item.vendor || '')}</td>
                                            <td data-field="description" data-original="${escapeHtml(item.description || '')}" onclick="editBudgetCell(this)">${escapeHtml(item.description || '')}</td>
                                            <td data-field="owner" data-original="${escapeHtml(item.owner || '')}" onclick="editBudgetCell(this)">${escapeHtml(item.owner || '')}</td>
                                            <td data-field="budgeted" data-original="${budgeted}" onclick="editBudgetCell(this)">${formatCurrency(budgeted)}</td>
                                            <td data-field="actual" data-original="${actual}" onclick="editBudgetCell(this)">${formatCurrency(actual)}</td>
                                            <td data-computed="difference" class="${diffClass}">${formatCurrency(Math.abs(difference))} ${difference < 0 ? 'over' : difference > 0 ? 'under' : ''}</td>
                                            <td data-field="paymentStatus" data-original="${item.paymentStatus || 'not-paid'}" onclick="editBudgetCell(this)">
                                                <span class="status-badge ${item.paymentStatus}">${formatPaymentStatus(item.paymentStatus)}</span>
                                            </td>
                                            <td data-field="notes" data-original="${escapeHtml(item.notes || '')}" onclick="editBudgetCell(this)">${escapeHtml(item.notes || '')}</td>
                                            <td class="actions budget-actions-cell no-print">
                                                <div class="actions-row">
                                                    <button class="action-icon" onclick="editBudgetItem('${item.id}')" title="Edit">
                                                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                                                    </button>
                                                    <button class="action-icon" onclick="duplicateBudgetItem('${item.id}')" title="Duplicate">
                                                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                                                    </button>
                                                    <button class="action-icon action-icon-danger" onclick="deleteBudgetItem('${item.id}')" title="Delete">
                                                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    `;
                                }).join('')}
                                <tr class="budget-phantom-row" data-phantom="true" data-category="${escapeHtml(category)}">
                                    <td class="confirmed-cell"></td>
                                    <td data-field="vendor" onclick="editBudgetCell(this)"><span class="phantom-placeholder">+ vendor</span></td>
                                    <td data-field="description" onclick="editBudgetCell(this)"><span class="phantom-placeholder">+ description</span></td>
                                    <td data-field="owner" onclick="editBudgetCell(this)"><span class="phantom-placeholder">+ owner</span></td>
                                    <td data-field="budgeted" onclick="editBudgetCell(this)"><span class="phantom-placeholder">+ budgeted</span></td>
                                    <td data-field="actual" onclick="editBudgetCell(this)"><span class="phantom-placeholder">+ actual</span></td>
                                    <td data-computed="difference"></td>
                                    <td data-field="paymentStatus" onclick="editBudgetCell(this)"><span class="phantom-placeholder">+ status</span></td>
                                    <td data-field="notes" onclick="editBudgetCell(this)"><span class="phantom-placeholder">+ notes</span></td>
                                    <td class="actions budget-actions-cell no-print"></td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                    <div class="budget-mobile-cards">
                        ${getSortedBudgetItems(items).map(item => {
                            const budgeted = parseFloat(item.budgeted) || 0;
                            const actual = parseFloat(item.actual) || 0;
                            const difference = budgeted - actual;
                            const pct = budgeted > 0 ? Math.min((actual / budgeted) * 100, 150) : 0;
                            const isOver = difference < 0;

                            return `
                                <div class="mobile-card">
                                    <div class="mobile-card-row">
                                        <input type="checkbox" class="mobile-card-checkbox"
                                               ${item.confirmed ? 'checked' : ''}
                                               onchange="toggleBudgetConfirmed('${item.id}', this.checked)">
                                        <span class="mobile-card-title">${escapeHtml(item.vendor || 'No vendor')}</span>
                                        <span class="mobile-card-amount ${isOver ? 'over' : ''}">${formatCurrency(budgeted)}</span>
                                    </div>
                                    ${item.description ? `<div style="font-size: 0.8rem; color: #777; margin: 0.25rem 0 0.25rem 2rem;">${escapeHtml(item.description)}</div>` : ''}
                                    ${item.owner ? `<div style="font-size: 0.8rem; color: #555; margin: 0.25rem 0 0.25rem 2rem;"><strong>Owner:</strong> ${escapeHtml(item.owner)}</div>` : ''}
                                    <div class="mobile-card-details">
                                        <span class="mobile-card-detail"><strong>Spent:</strong> ${formatCurrency(actual)}</span>
                                        <span class="mobile-card-detail ${isOver ? 'mobile-card-amount over' : ''}"><strong>${isOver ? 'Over:' : 'Left:'}</strong> ${formatCurrency(Math.abs(difference))}</span>
                                        <span class="status-badge ${item.paymentStatus || 'not-paid'}" style="font-size: 0.7rem;">${formatPaymentStatus(item.paymentStatus)}</span>
                                    </div>
                                    <div class="mobile-card-progress">
                                        <div class="mobile-card-progress-bar ${isOver ? 'over-budget' : ''}" style="width: ${Math.min(pct, 100)}%"></div>
                                    </div>
                                </div>
                            `;
                        }).join('')}
                    </div>
                </div>
            </div>
        `;
    }).join('');

    // Restore open sections (only when not searching — search auto-expands all)
    if (!isSearching) {
        Object.keys(openSections).forEach(id => {
            const content = document.getElementById(id);
            const arrowId = id.replace('content-', 'arrow-');
            const arrow = document.getElementById(arrowId);
            if (content) content.style.display = 'block';
            if (arrow) arrow.textContent = '▼';
        });
    }

    state.pendingNewBudgetRow = {};
}

// Timeline
function renderTimeline() {
    // Guard: don't rebuild DOM if user is editing a cell
    if (state.timelineEditingRowId) {
        state.timelineRenderPending = true;
        return;
    }

    const tbody = document.getElementById('timeline-tbody');

    // Filter by current day
    let filteredTimeline = state.timeline.filter(item => item.day === state.currentDay);

    // Apply tag/time filter
    if (state.timelineFilter === 'production') {
        filteredTimeline = filteredTimeline.filter(item => item.production === true || item.tag === 'production');
    } else if (state.timelineFilter === 'runner') {
        filteredTimeline = filteredTimeline.filter(item => item.runner === true);
    } else if (state.timelineFilter === 'andi') {
        filteredTimeline = filteredTimeline.filter(item => item.andi === true);
    } else if (state.timelineFilter === 'pedro') {
        filteredTimeline = filteredTimeline.filter(item => item.pedro === true);
    } else if (state.timelineFilter === 'run-of-show') {
        filteredTimeline = filteredTimeline.filter(item => {
            if (!item.time) return false;
            return item.time >= '18:20' && item.time <= '23:00';
        });
    } else if (state.timelineFilter === 'screencue') {
        filteredTimeline = filteredTimeline.filter(item =>
            item.screenCue && String(item.screenCue).trim() !== ''
        );
    }

    // Update day title and subtitle
    const dayTitle = document.getElementById('timeline-day-title');
    const dateSubtitle = document.getElementById('timeline-date-subtitle');
    const dateMap = {
        'Thursday': 'April 23, 2026',
        'Friday': 'April 24, 2026',
        'Saturday': 'April 25, 2026',
        'Sunday': 'April 26, 2026'
    };

    const filterLabels = { 'all': '', 'production': ' — Production', 'runner': ' — Runner Tasks', 'run-of-show': ' — Run of Show', 'screencue': ' — Screen Cue', 'andi': ' — Andi', 'pedro': ' — Pedro' };
    if (dayTitle) {
        dayTitle.textContent = `${state.currentDay} Timeline${filterLabels[state.timelineFilter] || ''}`;
    }
    if (dateSubtitle) {
        dateSubtitle.textContent = dateMap[state.currentDay] || '';
    }

    if (filteredTimeline.length === 0) {
        const phantomOnly = `
            <tr class="tl-row tl-phantom-row no-anim" data-phantom="true">
                <td class="checkbox-col"></td>
                <td class="time-col" data-field="time" onclick="editTimelineCell(this)"><span class="phantom-placeholder">+ time</span></td>
                <td class="duration-col" data-field="duration" onclick="editTimelineCell(this)"><span class="phantom-placeholder">+ duration</span></td>
                <td class="event-col" data-field="event" onclick="editTimelineCell(this)"><span class="phantom-placeholder">+ event</span></td>
                <td class="prod-col"></td>
                <td class="andi-col"></td>
                <td class="pedro-col"></td>
                <td class="runner-col"></td>
                <td class="responsible-col" data-field="responsible" onclick="editTimelineCell(this)"><span class="phantom-placeholder">+ responsible</span></td>
                <td class="staff-col" data-field="staff" onclick="editTimelineCell(this)"><span class="phantom-placeholder">+ staff</span></td>
                <td class="screencue-col" data-field="screenCue" onclick="editTimelineCell(this)"><span class="phantom-placeholder">#</span></td>
                <td class="setlist-col"></td>
                <td class="stageplot-col"></td>
                <td class="actions-col no-print"></td>
            </tr>
        `;
        tbody.innerHTML = phantomOnly;
        state.pendingNewRow = {};
        return;
    }

    // Sort by time
    const sorted = [...filteredTimeline].sort((a, b) => {
        if (!a.time) return 1;
        if (!b.time) return -1;
        return a.time.localeCompare(b.time);
    });

    const rowsHtml = sorted.map((item, idx) => {
        const isComplete = item.completed === true || item.status === 'complete';

        const rowColor = item.highlightColor || '';
        const hasHighlight = rowColor && rowColor !== '#ffffff';
        const borderColor = hasHighlight ? rowColor : 'transparent';
        const skipAnim = !state.timelineAnimateRows;
        const animDelay = skipAnim ? '' : `animation-delay: ${idx * 30}ms;`;

        return `
            <tr class="tl-row ${isComplete ? 'task-completed' : ''} ${hasHighlight ? 'tl-highlighted' : ''} ${skipAnim ? 'no-anim' : ''}"
                data-id="${item.id}"
                style="--row-accent: ${borderColor}; ${animDelay}">
                <td class="checkbox-col">
                    <input type="checkbox" class="tl-checkbox"
                           ${isComplete ? 'checked' : ''}
                           onchange="toggleTaskComplete('${item.id}', this.checked)">
                </td>
                <td class="time-col" data-field="time" data-original="${escapeHtml(item.time || '')}" onclick="editTimelineCell(this)"><span class="tl-time">${formatTime12Hour(item.time)}</span></td>
                <td class="duration-col" data-field="duration" data-original="${escapeHtml(item.duration || '')}" onclick="editTimelineCell(this)">${item.duration ? escapeHtml(item.duration) : '<span class="phantom-placeholder">+ duration</span>'}</td>
                <td class="event-col" data-field="event" data-original="${escapeHtml(item.event || '')}" onclick="editTimelineCell(this)">${escapeHtml(item.event || '')}</td>
                <td class="prod-col"><input type="checkbox" class="tl-checkbox" ${item.production === true || item.tag === 'production' ? 'checked' : ''} onchange="toggleTimelineField('${item.id}', 'production', this.checked)"></td>
                <td class="andi-col"><input type="checkbox" class="tl-checkbox" ${item.andi === true ? 'checked' : ''} onchange="toggleTimelineField('${item.id}', 'andi', this.checked)"></td>
                <td class="pedro-col"><input type="checkbox" class="tl-checkbox" ${item.pedro === true ? 'checked' : ''} onchange="toggleTimelineField('${item.id}', 'pedro', this.checked)"></td>
                <td class="runner-col"><input type="checkbox" class="tl-checkbox" ${item.runner === true ? 'checked' : ''} onchange="toggleTimelineField('${item.id}', 'runner', this.checked)"></td>
                <td class="responsible-col" data-field="responsible" data-original="${escapeHtml(item.responsible || '')}" onclick="editTimelineCell(this)">${escapeHtml(item.responsible || '')}</td>
                <td class="staff-col" data-field="staff" data-original="${escapeHtml(item.staff || '')}" onclick="editTimelineCell(this)">${escapeHtml(item.staff || '')}</td>
                <td class="screencue-col" data-field="screenCue" data-original="${escapeHtml(item.screenCue || '')}" onclick="editTimelineCell(this)">${escapeHtml(item.screenCue || '')}</td>
                <td class="setlist-col">
                    ${item.performer && state.setLists.some(sl => sl.performer && sl.performer.toLowerCase() === item.performer.toLowerCase()) ? `
                    <button class="action-icon action-icon-link" onclick="goToLinkedSetList('${escapeHtml(item.performer).replace(/'/g, "\\'")}')" title="Go to set list: ${escapeHtml(item.performer)}">
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18V5l12-2v13"></path><circle cx="6" cy="18" r="3"></circle><circle cx="18" cy="16" r="3"></circle></svg>
                        <span class="link-label">${escapeHtml(item.performer)}</span>
                    </button>` : `
                    <button class="action-icon action-icon-assign" onclick="assignTimelineLink('${item.id}', 'performer')" title="Assign set list">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                    </button>`}
                </td>
                <td class="stageplot-col">
                    ${item.stagePlotId && state.stagePlots.some(sp => sp.id === item.stagePlotId) ? `
                    <button class="action-icon action-icon-link" onclick="goToLinkedStagePlot('${item.stagePlotId}')" title="Go to stage plot: ${escapeHtml((state.stagePlots.find(sp => sp.id === item.stagePlotId) || {}).name || '')}">
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="3" y1="9" x2="21" y2="9"></line><line x1="9" y1="21" x2="9" y2="9"></line></svg>
                        <span class="link-label">${escapeHtml((state.stagePlots.find(sp => sp.id === item.stagePlotId) || {}).name || '')}</span>
                    </button>` : `
                    <button class="action-icon action-icon-assign" onclick="assignTimelineLink('${item.id}', 'stagePlotId')" title="Assign stage plot">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                    </button>`}
                </td>
                <td class="actions-col no-print">
                    <div class="actions-row">
                        <div class="color-swatch-wrapper">
                            <button class="color-swatch-btn" style="background-color: ${rowColor || '#ffffff'}; ${rowColor && rowColor !== '#ffffff' ? '' : 'border: 2px dashed #ccc;'}" onclick="toggleColorPicker('${item.id}')" title="Highlight color"></button>
                            <div class="color-swatch-dropdown" id="color-picker-${item.id}">
                                <button class="color-swatch" style="background:#ffffff; border: 1px dashed #ccc;" onclick="setTimelineColor('${item.id}','#ffffff')" title="None"></button>
                                <button class="color-swatch" style="background:#fff3cd;" onclick="setTimelineColor('${item.id}','#fff3cd')" title="Yellow"></button>
                                <button class="color-swatch" style="background:#d4edda;" onclick="setTimelineColor('${item.id}','#d4edda')" title="Green"></button>
                                <button class="color-swatch" style="background:#cce5ff;" onclick="setTimelineColor('${item.id}','#cce5ff')" title="Blue"></button>
                                <button class="color-swatch" style="background:#f8d7da;" onclick="setTimelineColor('${item.id}','#f8d7da')" title="Red"></button>
                                <button class="color-swatch" style="background:#e2d6f3;" onclick="setTimelineColor('${item.id}','#e2d6f3')" title="Purple"></button>
                                <button class="color-swatch" style="background:#fde0c8;" onclick="setTimelineColor('${item.id}','#fde0c8')" title="Orange"></button>
                                <button class="color-swatch" style="background:#d6d6d6;" onclick="setTimelineColor('${item.id}','#d6d6d6')" title="Gray"></button>
                            </div>
                        </div>
                        <button class="action-icon" onclick="editTimelineItem('${item.id}')" title="Edit">
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                        </button>
                        <button class="action-icon" onclick="duplicateTimelineItem('${item.id}')" title="Duplicate">
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                        </button>
                        <button class="action-icon action-icon-danger" onclick="deleteTimelineItem('${item.id}')" title="Delete">
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                        </button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');

    // Phantom row for inline adding
    const phantomRow = `
        <tr class="tl-row tl-phantom-row no-anim" data-phantom="true">
            <td class="checkbox-col"></td>
            <td class="time-col" data-field="time" onclick="editTimelineCell(this)"><span class="phantom-placeholder">+ time</span></td>
            <td class="duration-col" data-field="duration" onclick="editTimelineCell(this)"><span class="phantom-placeholder">+ duration</span></td>
            <td class="event-col" data-field="event" onclick="editTimelineCell(this)"><span class="phantom-placeholder">+ event</span></td>
            <td class="prod-col"></td>
            <td class="andi-col"></td>
            <td class="pedro-col"></td>
            <td class="runner-col"></td>
            <td class="responsible-col" data-field="responsible" onclick="editTimelineCell(this)"><span class="phantom-placeholder">+ responsible</span></td>
            <td class="staff-col" data-field="staff" onclick="editTimelineCell(this)"><span class="phantom-placeholder">+ staff</span></td>
            <td class="screencue-col" data-field="screenCue" onclick="editTimelineCell(this)"><span class="phantom-placeholder">#</span></td>
            <td class="setlist-col"></td>
            <td class="stageplot-col"></td>
            <td class="actions-col no-print"></td>
        </tr>
    `;

    tbody.innerHTML = rowsHtml + phantomRow;
    state.pendingNewRow = {};
    state.timelineAnimateRows = false;

    // Mobile card view
    const mobileContainer = document.getElementById('timeline-mobile-cards');
    if (mobileContainer) {
        if (sorted.length === 0) {
            mobileContainer.innerHTML = '<div class="mobile-card-empty">No tasks for this day</div>';
        } else {
            mobileContainer.innerHTML = sorted.map(item => {
                const isComplete = item.completed === true || item.status === 'complete';
                const rowColor = item.highlightColor || '';
                const hasHighlight = rowColor && rowColor !== '#ffffff';
                const borderStyle = hasHighlight ? `border-left-color: ${rowColor}` : '';
                const badges = [];
                if (item.production === true || item.tag === 'production') badges.push('<span class="mobile-card-badge prod">Prod</span>');
                if (item.andi === true) badges.push('<span class="mobile-card-badge andi">Andi</span>');
                if (item.pedro === true) badges.push('<span class="mobile-card-badge pedro">Pedro</span>');

                return `
                    <div class="mobile-card ${isComplete ? 'completed' : ''}" style="${borderStyle}">
                        <div class="mobile-card-row">
                            <input type="checkbox" class="mobile-card-checkbox"
                                   ${isComplete ? 'checked' : ''}
                                   onchange="toggleTaskComplete('${item.id}', this.checked)">
                            ${item.time ? `<span class="mobile-card-time">${formatTime12Hour(item.time)}</span>` : ''}
                            ${item.duration ? `<span class="mobile-card-duration">${escapeHtml(item.duration)}</span>` : ''}
                            <span class="mobile-card-event">${escapeHtml(item.event || 'Untitled')}</span>
                        </div>
                        ${(item.responsible || item.staff || badges.length > 0) ? `
                        <div class="mobile-card-details">
                            ${item.responsible ? `<span class="mobile-card-detail"><strong>Resp:</strong> ${escapeHtml(item.responsible)}</span>` : ''}
                            ${item.staff ? `<span class="mobile-card-detail"><strong>Staff:</strong> ${escapeHtml(item.staff)}</span>` : ''}
                            ${badges.length > 0 ? `<div class="mobile-card-badges">${badges.join('')}</div>` : ''}
                        </div>` : ''}
                    </div>
                `;
            }).join('');
        }
    }
}

// Technical Cue Sheet — same Firestore docs as timeline, filtered to Saturday >= 18:20.
// Tech-only fields (audio/liveVideo/lighting/centerScreen/sideScreens/nameOfFile)
// live on the same timeline document and are ignored by the timeline view.
const CUE_SHEET_FIELD_ORDER = ['time', 'duration', 'event', 'audio', 'liveVideo', 'stageLighting', 'houseLighting', 'centerScreen', 'sideScreens', 'screenCue'];
const CUE_SHEET_MULTILINE_FIELDS = new Set(['audio', 'liveVideo', 'stageLighting']);

function renderCueSheet() {
    const tbody = document.getElementById('cue-sheet-tbody');
    if (!tbody) return;

    if (state.cueSheetEditingRowId) {
        state.cueSheetRenderPending = true;
        return;
    }

    const all = state.timeline.filter(item =>
        item.day === 'Saturday' &&
        typeof item.time === 'string' &&
        item.time >= '18:20'
    );

    const hiddenCount = all.filter(item => item.hiddenFromCueSheet === true).length;
    const countEl = document.getElementById('cue-hidden-count');
    if (countEl) countEl.textContent = hiddenCount;

    const visible = state.cueSheetShowHidden
        ? all
        : all.filter(item => item.hiddenFromCueSheet !== true);

    const sorted = [...visible].sort((a, b) => {
        if (!a.time) return 1;
        if (!b.time) return -1;
        return a.time.localeCompare(b.time);
    });

    if (sorted.length === 0) {
        tbody.innerHTML = '<tr><td colspan="11" class="empty-state">No Saturday timeline rows ≥ 6:20 PM yet.</td></tr>';
        return;
    }

    tbody.innerHTML = sorted.map(item => renderCueSheetRow(item)).join('');
}

function renderCueSheetRow(item) {
    const isHidden = item.hiddenFromCueSheet === true;
    const rowClass = isHidden ? 'cs-row cs-hidden-row' : 'cs-row';

    const cell = (field, colClass) => {
        const raw = item[field];
        const isMultiline = CUE_SHEET_MULTILINE_FIELDS.has(field);
        const multilineClass = isMultiline ? ' cs-cell-multiline' : '';
        let display;
        if (field === 'time') {
            display = `<span class="tl-time">${formatTime12Hour(raw)}</span>`;
        } else if (raw === undefined || raw === null || raw === '') {
            display = '<span class="cs-cell-empty">—</span>';
        } else {
            display = escapeHtml(String(raw));
        }
        return `<td class="${colClass}${multilineClass}" data-field="${field}" data-original="${escapeHtml(raw == null ? '' : String(raw))}" onclick="editCueCell(this)">${display}</td>`;
    };

    const actionBtn = isHidden
        ? `<button class="cs-action-btn" onclick="unhideCueRow('${item.id}')" title="Unhide">Unhide</button>`
        : `<button class="cs-action-btn" onclick="hideCueRow('${item.id}')" title="Hide from cue sheet">Hide</button>`;

    return `
        <tr class="${rowClass}" data-id="${item.id}">
            ${cell('time', 'cs-time-col')}
            ${cell('duration', 'cs-duration-col')}
            ${cell('event', 'cs-activity-col')}
            ${cell('audio', 'cs-audio-col')}
            ${cell('liveVideo', 'cs-live-video-col')}
            ${cell('stageLighting', 'cs-stage-lighting-col')}
            ${cell('houseLighting', 'cs-house-lighting-col')}
            ${cell('centerScreen', 'cs-center-screen-col')}
            ${cell('sideScreens', 'cs-side-screens-col')}
            ${cell('screenCue', 'cs-cue-col')}
            <td class="cs-actions-col no-print">${actionBtn}</td>
        </tr>
    `;
}

window.hideCueRow = async (id) => {
    try {
        await collections.timeline.doc(id).update({
            hiddenFromCueSheet: true,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
    } catch (error) {
        console.error('Error hiding cue row:', error);
        showToast('Error hiding row', 'error');
    }
};

window.unhideCueRow = async (id) => {
    try {
        await collections.timeline.doc(id).update({
            hiddenFromCueSheet: false,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
    } catch (error) {
        console.error('Error unhiding cue row:', error);
        showToast('Error unhiding row', 'error');
    }
};

window.toggleCueSheetShowHidden = (checked) => {
    state.cueSheetShowHidden = !!checked;
    renderCueSheet();
};

// Modal Management
function setupModals() {
    // Close buttons
    document.querySelectorAll('.close-btn, .cancel-btn').forEach(btn => {
        btn.addEventListener('click', closeAllModals);
    });

    // Click outside modal to close
    document.querySelectorAll('.modal').forEach(modal => {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                closeAllModals();
            }
        });
    });

    // Add button handlers
    document.getElementById('add-budget-item-btn').addEventListener('click', () => {
        // Scroll to first visible phantom row and focus its first cell
        const phantomRow = document.querySelector('.budget-phantom-row');
        if (phantomRow) {
            // Expand collapsed section if needed
            const sectionContent = phantomRow.closest('.category-section-content');
            if (sectionContent && sectionContent.style.display === 'none') {
                const categoryId = sectionContent.id.replace('content-', '');
                toggleCategorySection(categoryId);
            }
            phantomRow.scrollIntoView({ behavior: 'smooth', block: 'center' });
            setTimeout(() => {
                const firstCell = phantomRow.querySelector(`td[data-field="${BUDGET_FIELD_ORDER[0]}"]`);
                if (firstCell) editBudgetCell(firstCell);
            }, 300);
        } else {
            // No categories exist yet — fall back to modal
            openBudgetModal();
        }
    });
    document.getElementById('add-timeline-item-btn').addEventListener('click', () => openTimelineModal());
    document.getElementById('add-staff-btn').addEventListener('click', () => openStaffModal());
    document.getElementById('add-packing-item-btn').addEventListener('click', () => openPackingModal());
    document.getElementById('add-menu-item-btn').addEventListener('click', () => openMenuModal());
    document.getElementById('add-print-item-btn').addEventListener('click', () => openPrintModal());
    document.getElementById('add-da-item-btn').addEventListener('click', () => openDAModal());
}

function closeAllModals() {
    document.querySelectorAll('.modal').forEach(modal => {
        modal.classList.remove('active');
    });
}

// Generic modal opening function
function openModal(config) {
    const modal = document.getElementById(config.modalId);
    const form = document.getElementById(config.formId);
    const title = modal.querySelector('h2');

    form.reset();

    // Find data object if editing
    let data = null;
    if (config.itemId && config.stateKey) {
        data = state[config.stateKey].find(item => item.id === config.itemId);
    }

    // Set title
    title.textContent = data ? `Edit ${config.title}` : `Add ${config.title}`;

    // Populate form fields
    if (data) {
        Object.entries(config.fieldMap).forEach(([fieldId, dataKey]) => {
            const element = document.getElementById(fieldId);
            if (element) {
                if (element.type === 'checkbox') {
                    element.checked = !!data[dataKey];
                } else {
                    element.value = data[dataKey] || '';
                }
            }
        });

        // Set ID field for editing
        const idField = document.getElementById(config.idFieldId);
        if (idField) {
            idField.value = data.id;
        }
    } else {
        // Clear ID field for new items
        const idField = document.getElementById(config.idFieldId);
        if (idField) {
            idField.value = '';
        }

        // Set default values for new items
        if (config.defaultValues) {
            Object.entries(config.defaultValues).forEach(([fieldId, value]) => {
                const element = document.getElementById(fieldId);
                if (element) {
                    element.value = value;
                }
            });
        }
    }

    modal.classList.add('active');
}

function openBudgetModal(itemId = null) {
    openModal({
        modalId: 'budget-modal',
        formId: 'budget-form',
        idFieldId: 'budget-id',
        itemId: itemId,
        stateKey: 'budget',
        title: 'Budget Item',
        fieldMap: {
            'budget-vendor': 'vendor',
            'budget-description': 'description',
            'budget-category': 'category',
            'budget-owner': 'owner',
            'budget-no-contact-needed': 'noContactNeeded',
            'budget-contact': 'contact',
            'budget-phone': 'phone',
            'budget-email': 'email',
            'budget-budgeted': 'budgeted',
            'budget-actual': 'actual',
            'budget-in-kind': 'inKind',
            'budget-payment-status': 'paymentStatus',
            'budget-notes': 'notes',
            'budget-confirmed': 'confirmed'
        },
        defaultValues: {
            'budget-payment-status': 'not-paid'
        }
    });
    // Sync contact fields visibility with checkbox state
    const noContact = document.getElementById('budget-no-contact-needed').checked;
    document.getElementById('budget-contact-fields').style.display = noContact ? 'none' : '';

    // Populate on-site schedule (nested, not in fieldMap)
    const editItem = itemId ? state.budget.find(b => b.id === itemId) : null;
    const sched = (editItem && editItem.schedule) || {};
    document.getElementById('budget-sched-thursday').value = sched.thursday || '';
    document.getElementById('budget-sched-friday').value = sched.friday || '';
    document.getElementById('budget-sched-saturday').value = sched.saturday || '';
    document.getElementById('budget-sched-sunday').value = sched.sunday || '';

    // Populate staff link dropdown
    const item = itemId ? state.budget.find(b => b.id === itemId) : null;
    const staffSelect = document.getElementById('budget-linked-staff');
    const unlinkedStaff = state.staff.filter(s => !s.linkedBudgetId || (item && s.id === item.linkedStaffId));
    staffSelect.innerHTML = '<option value="">— None —</option>' +
        unlinkedStaff.map(s =>
            '<option value="' + s.id + '"' + (item && item.linkedStaffId === s.id ? ' selected' : '') + '>' +
            escapeHtml(s.name) + (s.role ? ' (' + escapeHtml(s.role) + ')' : '') +
            '</option>'
        ).join('');

    // Show auto-suggestion if unlinked
    const suggestionDiv = document.getElementById('budget-staff-suggestion');
    const infoPanel = document.getElementById('budget-linked-staff-info');
    if (item && !item.linkedStaffId) {
        const suggestions = findStaffSuggestions(item.vendor);
        if (suggestions.length > 0) {
            suggestionDiv.innerHTML = '<strong>Suggested match:</strong> ' +
                suggestions.map(s =>
                    '<button type="button" class="btn-link-suggest" onclick="document.getElementById(\'budget-linked-staff\').value=\'' + s.id + '\'; this.parentElement.style.display=\'none\';">' +
                    escapeHtml(s.name) + (s.role ? ' (' + escapeHtml(s.role) + ')' : '') + '</button>'
                ).join(' ');
            suggestionDiv.style.display = '';
        } else {
            suggestionDiv.style.display = 'none';
        }
    } else {
        suggestionDiv.style.display = 'none';
    }

    // Show linked staff info panel, hide schedule grid when linked (staff side is authoritative)
    const scheduleSection = document.getElementById('budget-schedule-section');
    if (item && item.linkedStaffId) {
        const ls = getLinkedStaff(item);
        if (ls) {
            const teams = (ls.teams || []).join(', ');
            const schedLine = summarizeLinkedSchedule(ls.schedule);
            infoPanel.innerHTML = '<div class="linked-info-summary">' +
                '<strong>' + escapeHtml(ls.name) + '</strong>' +
                (ls.role ? ' — ' + escapeHtml(ls.role) : '') +
                (teams ? '<br>Teams: ' + escapeHtml(teams) : '') +
                '<br>Schedule: ' + schedLine +
                '<br><button type="button" class="btn btn-sm" onclick="closeAllModals(); setTimeout(function(){ openStaffModal(\'' + ls.id + '\'); }, 200);">View Staff Entry</button>' +
                '</div>';
            infoPanel.style.display = '';
            if (scheduleSection) scheduleSection.style.display = 'none';
        } else {
            infoPanel.style.display = 'none';
            if (scheduleSection) scheduleSection.style.display = '';
        }
    } else {
        infoPanel.style.display = 'none';
        if (scheduleSection) scheduleSection.style.display = '';
    }
}

function summarizeLinkedSchedule(schedule) {
    if (!schedule) return '<span style="color:#9ca3af;">— (open staff entry to schedule)</span>';
    const days = [['thursday','Thu'],['friday','Fri'],['saturday','Sat'],['sunday','Sun']];
    const parts = [];
    for (const [key, label] of days) {
        const val = schedule[key];
        if (val && String(val).trim()) {
            parts.push(label + ' ' + normalizeTimeForPrint(val));
        }
    }
    if (parts.length === 0) return '<span style="color:#9ca3af;">— (open staff entry to schedule)</span>';
    return escapeHtml(parts.join(' · '));
}

function openTimelineModal(itemId = null) {
    openModal({
        modalId: 'timeline-modal',
        formId: 'timeline-form',
        idFieldId: 'timeline-id',
        itemId: itemId,
        stateKey: 'timeline',
        title: 'Task',
        fieldMap: {
            'timeline-time': 'time',
            'timeline-duration': 'duration',
            'timeline-day': 'day',
            'timeline-event': 'event',
            'timeline-responsible': 'responsible',
            'timeline-staff': 'staff',
            'timeline-screen-cue': 'screenCue',
            'timeline-production': 'production',
            'timeline-andi': 'andi',
            'timeline-pedro': 'pedro',
            'timeline-runner': 'runner',
            'timeline-notes': 'notes',
            'timeline-performer': 'performer',
            'timeline-stage-plot': 'stagePlotId'
        },
        defaultValues: {
            'timeline-day': state.currentDay
        }
    });
    // Show the current day in the read-only display field
    document.getElementById('timeline-day-display').value =
        document.getElementById('timeline-day').value || state.currentDay;
    populateTimelineLinkedDropdowns();
}

function populateTimelineLinkedDropdowns() {
    // Populate performer dropdown from set lists
    const performerSelect = document.getElementById('timeline-performer');
    if (performerSelect) {
        const currentVal = performerSelect.value;
        const performers = [...new Set(state.setLists.map(sl => sl.performer).filter(Boolean))].sort();
        performerSelect.innerHTML = '<option value="">— None —</option>' +
            performers.map(p => `<option value="${escapeHtml(p)}">${escapeHtml(p)}</option>`).join('');
        performerSelect.value = currentVal;
    }

    // Populate stage plot dropdown grouped by stage type
    const plotSelect = document.getElementById('timeline-stage-plot');
    if (plotSelect) {
        const currentVal = plotSelect.value;
        const mainPlots = state.stagePlots.filter(p => p.stageType === 'main').sort((a, b) => (a.name || '').localeCompare(b.name || ''));
        const cocktailPlots = state.stagePlots.filter(p => p.stageType === 'cocktail').sort((a, b) => (a.name || '').localeCompare(b.name || ''));
        let html = '<option value="">— None —</option>';
        if (mainPlots.length) {
            html += '<optgroup label="Main Stage">' +
                mainPlots.map(p => `<option value="${p.id}">${escapeHtml(p.name || 'Untitled')}</option>`).join('') +
                '</optgroup>';
        }
        if (cocktailPlots.length) {
            html += '<optgroup label="Cocktail Stage">' +
                cocktailPlots.map(p => `<option value="${p.id}">${escapeHtml(p.name || 'Untitled')}</option>`).join('') +
                '</optgroup>';
        }
        plotSelect.innerHTML = html;
        plotSelect.value = currentVal;
    }
}

// Form Handlers
function setupFormHandlers() {
    document.getElementById('budget-form').addEventListener('submit', handleBudgetSubmit);
    document.getElementById('budget-no-contact-needed').addEventListener('change', function() {
        document.getElementById('budget-contact-fields').style.display = this.checked ? 'none' : '';
    });
    document.getElementById('timeline-form').addEventListener('submit', handleTimelineSubmit);
    document.getElementById('staff-form').addEventListener('submit', handleStaffSubmit);
    setupStaffTeamInput();
    document.getElementById('setlist-form').addEventListener('submit', handleSetListSubmit);
    document.getElementById('packing-form').addEventListener('submit', handlePackingSubmit);
    document.getElementById('menu-form').addEventListener('submit', handleMenuSubmit);
    document.getElementById('print-form').addEventListener('submit', handlePrintSubmit);
    document.getElementById('da-form').addEventListener('submit', handleDASubmit);
    const guestForm = document.getElementById('guest-form');
    if (guestForm) guestForm.addEventListener('submit', handleGuestSubmit);
}

// Generic form submission handler
async function handleFormSubmit(e, config) {
    e.preventDefault();

    const data = {};
    Object.entries(config.fieldMap).forEach(([fieldId, dataKey]) => {
        const element = document.getElementById(fieldId);
        let value;

        if (element.type === 'checkbox') {
            value = element.checked;
        } else {
            value = element.value;
            // Handle number fields
            if (config.numericFields && config.numericFields.includes(dataKey)) {
                value = parseFloat(value) || 0;
            }
        }

        data[dataKey] = value;
    });

    data.updatedAt = firebase.firestore.FieldValue.serverTimestamp();

    const id = document.getElementById(config.idFieldId).value;

    try {
        let result = { isNew: false, docId: id };
        if (id) {
            await collections[config.collection].doc(id).update(data);
            showToast(`${config.itemName.charAt(0).toUpperCase() + config.itemName.slice(1)} updated`);
        } else {
            data.createdAt = firebase.firestore.FieldValue.serverTimestamp();
            const docRef = await collections[config.collection].add(data);
            result = { isNew: true, docId: docRef.id };
            showToast(`${config.itemName.charAt(0).toUpperCase() + config.itemName.slice(1)} added`);
        }
        closeAllModals();
        return result;
    } catch (error) {
        console.error(`Error saving ${config.collection}:`, error);
        showToast(`Error saving ${config.itemName}. Please try again.`, 'error');
    }
}

async function handleBudgetSubmit(e) {
    const newVendorName = document.getElementById('budget-vendor').value;
    const newLinkedStaffId = document.getElementById('budget-linked-staff').value || null;
    const budgetId = document.getElementById('budget-id').value;
    const oldItem = budgetId ? state.budget.find(b => b.id === budgetId) : null;
    const oldStaffId = oldItem ? oldItem.linkedStaffId : null;

    const result = await handleFormSubmit(e, {
        collection: 'budget',
        idFieldId: 'budget-id',
        itemName: 'budget item',
        fieldMap: {
            'budget-vendor': 'vendor',
            'budget-description': 'description',
            'budget-category': 'category',
            'budget-owner': 'owner',
            'budget-no-contact-needed': 'noContactNeeded',
            'budget-contact': 'contact',
            'budget-phone': 'phone',
            'budget-email': 'email',
            'budget-budgeted': 'budgeted',
            'budget-actual': 'actual',
            'budget-in-kind': 'inKind',
            'budget-payment-status': 'paymentStatus',
            'budget-notes': 'notes',
            'budget-confirmed': 'confirmed'
        },
        numericFields: ['budgeted', 'actual']
    });

    if (result) {
        const resolvedBudgetId = result.docId;

        // Save linkedStaffId on the budget doc (not in fieldMap to keep generic handler clean)
        try {
            await collections.budget.doc(resolvedBudgetId).update({ linkedStaffId: newLinkedStaffId });
        } catch (err) {
            console.error('Error saving budget link:', err);
        }

        // Save on-site schedule only for unlinked vendors — staff entry is authoritative when linked
        if (!newLinkedStaffId) {
            try {
                const schedule = {
                    thursday: document.getElementById('budget-sched-thursday').value.trim() || null,
                    friday:   document.getElementById('budget-sched-friday').value.trim() || null,
                    saturday: document.getElementById('budget-sched-saturday').value.trim() || null,
                    sunday:   document.getElementById('budget-sched-sunday').value.trim() || null
                };
                await collections.budget.doc(resolvedBudgetId).update({ schedule });
            } catch (err) {
                console.error('Error saving vendor schedule:', err);
            }
        }

        // Clear old staff link if it changed
        if (oldStaffId && oldStaffId !== newLinkedStaffId) {
            try { await collections.staff.doc(oldStaffId).update({ linkedBudgetId: null }); } catch (e) { /* staff may be deleted */ }
        }
        // Set new staff link + sync name and contact info (budget edit wins)
        if (newLinkedStaffId) {
            const staffUpdate = { linkedBudgetId: resolvedBudgetId };
            if (newVendorName) staffUpdate.name = newVendorName;
            const newPhone = document.getElementById('budget-phone').value.trim() || null;
            const newEmail = document.getElementById('budget-email').value.trim() || null;
            staffUpdate.phone = newPhone;
            staffUpdate.email = newEmail;
            try { await collections.staff.doc(newLinkedStaffId).update(staffUpdate); } catch (e) { console.error('Error syncing to staff:', e); }
        }
    }
}

async function handleTimelineSubmit(e) {
    const editId = document.getElementById('timeline-id').value;
    // Capture previous data for undo on edits
    let previousData = null;
    if (editId) {
        const item = state.timeline.find(i => i.id === editId);
        if (item) {
            const { id: _id, ...rest } = item;
            previousData = rest;
        }
    }

    // Normalize duration text to "Xh Ym" format before save
    const durationInput = document.getElementById('timeline-duration');
    if (durationInput && durationInput.value) {
        durationInput.value = formatDuration(durationInput.value);
    }

    // Normalize screen cue: digits only, max 3 chars
    const screenCueInput = document.getElementById('timeline-screen-cue');
    if (screenCueInput) {
        screenCueInput.value = normalizeScreenCue(screenCueInput.value);
    }

    const result = await handleFormSubmit(e, {
        collection: 'timeline',
        idFieldId: 'timeline-id',
        itemName: 'task',
        fieldMap: {
            'timeline-time': 'time',
            'timeline-duration': 'duration',
            'timeline-day': 'day',
            'timeline-event': 'event',
            'timeline-responsible': 'responsible',
            'timeline-staff': 'staff',
            'timeline-screen-cue': 'screenCue',
            'timeline-production': 'production',
            'timeline-andi': 'andi',
            'timeline-pedro': 'pedro',
            'timeline-runner': 'runner',
            'timeline-notes': 'notes',
            'timeline-performer': 'performer',
            'timeline-stage-plot': 'stagePlotId'
        },
        numericFields: []
    });

    if (result) {
        if (result.isNew) {
            pushTimelineUndo({ type: 'add', id: result.docId });
        } else if (previousData) {
            pushTimelineUndo({ type: 'update', id: result.docId, previousData });
        }
    }
}

// CRUD Operations
window.editBudgetItem = (id) => openBudgetModal(id);
window.editTimelineItem = (id) => openTimelineModal(id);

function updateNavActiveState(pageName) {
    const navLinks = document.querySelectorAll('.nav-link');
    navLinks.forEach(l => l.classList.toggle('active', l.dataset.page === pageName));
    updateNavGroupIndicators();
}

window.goToLinkedSetList = function(performer) {
    switchPage('set-lists');
    updateNavActiveState('set-lists');
    // Find and highlight the matching accordion item after switchPage renders
    setTimeout(() => {
        const items = document.querySelectorAll('.setlist-accordion-item');
        for (const item of items) {
            const perfEl = item.querySelector('.setlist-performer');
            if (perfEl && perfEl.textContent.toLowerCase() === performer.toLowerCase()) {
                // Expand the accordion body
                const body = item.querySelector('.setlist-accordion-body');
                const icon = item.querySelector('.setlist-toggle-icon');
                if (body) body.style.display = '';
                if (icon) icon.innerHTML = '&#9660;';
                item.classList.add('expanded');
                item.scrollIntoView({ behavior: 'smooth', block: 'center' });
                item.classList.add('setlist-accordion-highlight');
                setTimeout(() => item.classList.remove('setlist-accordion-highlight'), 2000);
                break;
            }
        }
    }, 100);
};

window.goToLinkedStagePlot = function(plotId) {
    const plot = state.stagePlots.find(p => p.id === plotId);
    if (!plot) return;
    // Pre-set state so initializeStagePlots (called by switchPage) picks up the right tab and plot
    state.currentStagePlotType = plot.stageType || 'main';
    state.currentPlotId = plotId;
    switchPage('stage-plots');
    updateNavActiveState('stage-plots');
    // Set the correct stage type tab visually
    const tabs = document.querySelectorAll('.stage-plot-tab');
    tabs.forEach(t => t.classList.toggle('active', t.dataset.stageType === state.currentStagePlotType));
    updatePlotSelector();
    // Load the specific plot
    const plotSelect = document.getElementById('plot-select');
    if (plotSelect) plotSelect.value = plotId;
    loadPlot(plotId);
};

window.assignTimelineLink = function(itemId, fieldType) {
    // Open the timeline modal for this item so the user can pick from the dropdowns
    openTimelineModal(itemId);
    // Auto-focus the relevant dropdown
    setTimeout(() => {
        const selectId = fieldType === 'performer' ? 'timeline-performer' : 'timeline-stage-plot';
        const el = document.getElementById(selectId);
        if (el) el.focus();
    }, 100);
};

window.duplicateBudgetItem = async (id) => {
    const item = state.budget.find(i => i.id === id);
    if (!item) return;

    const { id: _id, createdAt, updatedAt, ...data } = item;
    data.vendor = (data.vendor || '') + ' (copy)';
    data.createdAt = firebase.firestore.FieldValue.serverTimestamp();
    data.updatedAt = firebase.firestore.FieldValue.serverTimestamp();

    try {
        await collections.budget.add(data);
        showToast('Item duplicated');
    } catch (error) {
        console.error('Error duplicating budget item:', error);
        showToast('Error duplicating item', 'error');
    }
};

// Generic delete handler factory
function createDeleteHandler(collectionKey, itemName) {
    return async (id) => {
        if (confirm(`Are you sure you want to delete this ${itemName}?`)) {
            try {
                await collections[collectionKey].doc(id).delete();
                showToast(`${itemName.charAt(0).toUpperCase() + itemName.slice(1)} deleted`);
            } catch (error) {
                console.error(`Error deleting ${itemName}:`, error);
                showToast(`Error deleting ${itemName}. Please try again.`, 'error');
            }
        }
    };
}

const _baseDeleteBudgetItem = createDeleteHandler('budget', 'budget item');
window.deleteBudgetItem = async function(id) {
    const item = state.budget.find(b => b.id === id);
    if (item && item.linkedStaffId) {
        try { await collections.staff.doc(item.linkedStaffId).update({ linkedBudgetId: null }); } catch (e) { /* staff may be deleted */ }
    }
    return _baseDeleteBudgetItem(id);
};
window.toggleBudgetConfirmed = toggleBudgetConfirmed;
window.deleteTimelineItem = async (id) => {
    const item = state.timeline.find(i => i.id === id);
    if (item) {
        const { id: _id, ...data } = item;
        pushTimelineUndo({ type: 'delete', id, previousData: data });
    }
    try {
        await collections.timeline.doc(id).delete();
        showToast('Task deleted');
    } catch (error) {
        console.error('Error deleting task:', error);
        showToast('Error deleting task', 'error');
    }
};

window.toggleTaskComplete = async (id, completed) => {
    const item = state.timeline.find(i => i.id === id);
    if (item) pushTimelineUndo({ type: 'update', id, previousData: { completed: item.completed || false, status: item.status || 'not-started' } });

    try {
        await collections.timeline.doc(id).update({
            completed: completed,
            status: completed ? 'complete' : 'in-progress',
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        showToast(completed ? 'Checked off' : 'Unchecked');
    } catch (error) {
        console.error('Error updating task:', error);
        showToast('Error updating task. Please try again.', 'error');
    }
};

// Timeline undo system
function pushTimelineUndo(action) {
    state.timelineUndoStack.push(action);
    if (state.timelineUndoStack.length > 30) state.timelineUndoStack.shift();
    updateTimelineUndoButton();
}

function updateTimelineUndoButton() {
    const btn = document.getElementById('timeline-undo-btn');
    if (btn) btn.disabled = state.timelineUndoStack.length === 0;
}

window.undoTimelineAction = async () => {
    const action = state.timelineUndoStack.pop();
    updateTimelineUndoButton();
    if (!action) return;

    try {
        if (action.type === 'update') {
            await collections.timeline.doc(action.id).update(action.previousData);
        } else if (action.type === 'add') {
            await collections.timeline.doc(action.id).delete();
        } else if (action.type === 'delete') {
            await collections.timeline.doc(action.id).set(action.previousData);
        }
        showToast('Undone');
    } catch (error) {
        console.error('Error undoing:', error);
        showToast('Error undoing action', 'error');
    }
};

window.toggleTimelineCol = (col, visible) => {
    const table = document.getElementById('timeline-table');
    if (!table) return;
    table.classList.toggle(`hide-${col}`, !visible);
};

window.toggleColumnsDropdown = () => {
    const dropdown = document.getElementById('columns-dropdown');
    if (dropdown) dropdown.classList.toggle('open');
};

// Close columns dropdown when clicking outside
document.addEventListener('click', (e) => {
    const dropdown = document.getElementById('columns-dropdown');
    const btn = document.getElementById('columns-toggle-btn');
    if (dropdown && btn && !dropdown.contains(e.target) && !btn.contains(e.target)) {
        dropdown.classList.remove('open');
    }
});

window.toggleTimelineField = async (id, field, checked) => {
    const item = state.timeline.find(i => i.id === id);
    if (item) pushTimelineUndo({ type: 'update', id, previousData: { [field]: item[field] || false } });

    try {
        await collections.timeline.doc(id).update({
            [field]: checked,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
    } catch (error) {
        console.error(`Error setting ${field}:`, error);
        showToast(`Error updating ${field}`, 'error');
    }
};

window.setTimelineFilter = (filter) => {
    state.timelineFilter = filter;
    state.timelineAnimateRows = true;
    document.querySelectorAll('.timeline-filters .filter-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.filter === filter);
    });
    renderTimeline();
};

window.toggleColorPicker = (id) => {
    // Close any other open pickers
    document.querySelectorAll('.color-swatch-dropdown.open').forEach(el => {
        if (el.id !== `color-picker-${id}`) el.classList.remove('open');
    });
    const picker = document.getElementById(`color-picker-${id}`);
    if (picker) picker.classList.toggle('open');
};

// Close color pickers when clicking elsewhere
document.addEventListener('click', (e) => {
    if (!e.target.closest('.color-swatch-wrapper')) {
        document.querySelectorAll('.color-swatch-dropdown.open').forEach(el => el.classList.remove('open'));
    }
});

window.setTimelineColor = async (id, color) => {
    // Close the picker
    document.querySelectorAll('.color-swatch-dropdown.open').forEach(el => el.classList.remove('open'));
    const item = state.timeline.find(i => i.id === id);
    if (item) pushTimelineUndo({ type: 'update', id, previousData: { highlightColor: item.highlightColor || '' } });

    try {
        const highlightColor = (color === '#ffffff') ? '' : color;
        await collections.timeline.doc(id).update({
            highlightColor: highlightColor,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
    } catch (error) {
        console.error('Error setting color:', error);
        showToast('Error setting color', 'error');
    }
};

window.duplicateTimelineItem = async (id) => {
    const item = state.timeline.find(i => i.id === id);
    if (!item) return;

    const { id: _id, createdAt, updatedAt, ...data } = item;
    data.event = (data.event || '') + ' (copy)';
    data.createdAt = firebase.firestore.FieldValue.serverTimestamp();
    data.updatedAt = firebase.firestore.FieldValue.serverTimestamp();

    try {
        const docRef = await collections.timeline.add(data);
        pushTimelineUndo({ type: 'add', id: docRef.id });
        showToast('Task duplicated');
    } catch (error) {
        console.error('Error duplicating task:', error);
        showToast('Error duplicating task', 'error');
    }
};

// Utility Functions
function formatCurrency(amount) {
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0
    }).format(amount || 0);
}

function formatDate(dateString) {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric'
    });
}

// Accepts "1h 30m", "1:30", "90" (minutes), "1.5h", "2 hours 15 min" etc.
// Returns normalized "Xh Ym" string. If input can't be parsed, returns it unchanged.
function formatDuration(raw) {
    if (raw === null || raw === undefined) return '';
    const s = String(raw).trim().toLowerCase();
    if (!s) return '';

    let totalMinutes = null;

    const hMatch = s.match(/(\d+(?:\.\d+)?)\s*h/);
    const mMatch = s.match(/(\d+)\s*m(?:in)?/);

    if (hMatch || mMatch) {
        totalMinutes = 0;
        if (hMatch) totalMinutes += Math.round(parseFloat(hMatch[1]) * 60);
        if (mMatch) totalMinutes += parseInt(mMatch[1], 10);
    } else if (s.includes(':')) {
        const parts = s.split(':');
        const h = parseInt(parts[0], 10);
        const m = parseInt(parts[1], 10);
        if (!isNaN(h) || !isNaN(m)) {
            totalMinutes = (isNaN(h) ? 0 : h) * 60 + (isNaN(m) ? 0 : m);
        }
    } else if (/^\d+(?:\.\d+)?$/.test(s)) {
        totalMinutes = Math.round(parseFloat(s));
    }

    if (totalMinutes === null || totalMinutes <= 0) return raw;

    const hours = Math.floor(totalMinutes / 60);
    const mins = totalMinutes % 60;
    if (hours && mins) return `${hours}h ${mins}m`;
    if (hours) return `${hours}h`;
    return `${mins}m`;
}

function normalizeScreenCue(raw) {
    if (raw === null || raw === undefined) return '';
    return String(raw)
        .split(',')
        .map(t => t.replace(/\D/g, '').slice(0, 3))
        .filter(Boolean)
        .join(', ');
}

function formatTime12Hour(time24) {
    if (!time24) return '';

    // Handle various time formats
    const timeParts = time24.toString().split(':');
    if (timeParts.length < 2) return time24;

    let hours = parseInt(timeParts[0]);
    const minutes = timeParts[1];

    // Determine AM/PM
    const period = hours >= 12 ? 'PM' : 'AM';

    // Convert to 12-hour format
    if (hours === 0) {
        hours = 12; // Midnight
    } else if (hours > 12) {
        hours = hours - 12;
    }

    return `${hours}:${minutes} ${period}`;
}

function formatPaymentStatus(status) {
    const map = {
        'paid': 'Paid',
        'partial': 'Partial',
        'not-paid': 'Not Paid'
    };
    return map[status] || 'Not Paid';
}

function formatStatus(status) {
    const map = {
        'complete': 'Complete',
        'in-progress': 'In Progress',
        'not-started': 'Not Started'
    };
    return map[status] || 'Not Started';
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Day Tabs for Timeline
function setupDayTabs() {
    const dayTabs = document.querySelectorAll('.day-tab');

    dayTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const day = tab.dataset.day;

            // Update active state
            dayTabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');

            // Update state and re-render
            state.currentDay = day;
            state.timelineAnimateRows = true;
            renderTimeline();
        });
    });
}

function setupStageTabs() {
    const stageTabs = document.querySelectorAll('.day-tab[data-stage]');

    stageTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const stage = tab.dataset.stage;

            // Update active state
            stageTabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');

            // Clear editing state and re-render
            state.stageEditingRowId = null;
            state.stageRenderPending = false;
            state.pendingNewStageRow = {};
            state.currentStage = stage;
            renderStageInputs();
        });
    });

    // Add Input button - scroll to phantom row and focus first cell
    const addInputBtn = document.getElementById('add-stage-input-btn');
    if (addInputBtn) {
        addInputBtn.addEventListener('click', () => {
            const collectionName = state.currentStage === 'main' ? 'mainStageInputs' : 'cocktailStageInputs';
            const phantomRow = document.querySelector('.stage-phantom-row');
            if (phantomRow) {
                phantomRow.scrollIntoView({ behavior: 'smooth', block: 'center' });
                setTimeout(() => {
                    const firstCell = phantomRow.querySelector(`td[data-field="${STAGE_FIELD_ORDER[0]}"]`);
                    if (firstCell) editStageCell(firstCell, collectionName);
                }, 300);
            }
        });
    }
}

function printCueSheet() {
    let pageStyle = document.getElementById('cue-sheet-page-rule');
    if (!pageStyle) {
        pageStyle = document.createElement('style');
        pageStyle.id = 'cue-sheet-page-rule';
        pageStyle.textContent = '@page { size: landscape; }';
        document.head.appendChild(pageStyle);
    }
    document.body.classList.add('printing-cue-sheet');
    requestAnimationFrame(() => {
        window.print();
        setTimeout(() => {
            document.body.classList.remove('printing-cue-sheet');
            const el = document.getElementById('cue-sheet-page-rule');
            if (el) el.remove();
        }, 500);
    });
}
window.printCueSheet = printCueSheet;

// Scoped print helper — tags body with a class so @media print CSS can
// customize layout per-page without leaking into other prints.
function printWithScope(scopeClass) {
    document.body.classList.add(scopeClass);
    // Some browsers (Safari) don't flush layout before window.print; rAF helps.
    requestAnimationFrame(() => {
        window.print();
        setTimeout(() => document.body.classList.remove(scopeClass), 500);
    });
}
window.printWithScope = printWithScope;

// Export and Print Functionality
function setupExportAndPrint() {
    // Print Buttons
    const printTimelineBtn = document.getElementById('print-timeline-btn');
    const printStaffBtn = document.getElementById('print-staff-btn');
    const printStageBtn = document.getElementById('print-stage-btn');

    if (printTimelineBtn) {
        printTimelineBtn.addEventListener('click', () => printWithScope('printing-timeline'));
    }

    const printCueSheetBtn = document.getElementById('print-cue-sheet-btn');
    if (printCueSheetBtn) {
        printCueSheetBtn.addEventListener('click', printCueSheet);
    }

    const timelineUndoBtn = document.getElementById('timeline-undo-btn');
    if (timelineUndoBtn) {
        timelineUndoBtn.addEventListener('click', () => window.undoTimelineAction());
    }
    if (printStaffBtn) {
        printStaffBtn.addEventListener('click', openPrintStaffTeamsModal);
    }
    const printCheckinBtn = document.getElementById('print-checkin-btn');
    if (printCheckinBtn) {
        printCheckinBtn.addEventListener('click', openPrintCheckInModal);
    }
    if (printStageBtn) {
        printStageBtn.addEventListener('click', () => printWithScope('printing-stage-inputs'));
    }

    // Export Buttons
    const exportTimelineBtn = document.getElementById('export-timeline-btn');
    const exportBudgetBtn = document.getElementById('export-budget-btn');
    const exportStageBtn = document.getElementById('export-stage-btn');
    const exportStaffBtn = document.getElementById('export-staff-btn');

    if (exportTimelineBtn) {
        exportTimelineBtn.addEventListener('click', exportTimelineToExcel);
    }
    if (exportBudgetBtn) {
        exportBudgetBtn.addEventListener('click', exportBudgetToExcel);
    }
    if (exportStageBtn) {
        exportStageBtn.addEventListener('click', exportStageInputsToExcel);
    }
    if (exportStaffBtn) {
        exportStaffBtn.addEventListener('click', exportStaffToExcel);
    }

    const exportVendorsBtn = document.getElementById('export-vendors-btn');
    if (exportVendorsBtn) {
        exportVendorsBtn.addEventListener('click', exportBudgetToExcel);
    }

    const printSetListBtn = document.getElementById('print-setlist-btn');
    if (printSetListBtn) {
        printSetListBtn.addEventListener('click', printSetLists);
    }
    const printPerformerContactBtn = document.getElementById('print-performer-contact-btn');
    if (printPerformerContactBtn) {
        printPerformerContactBtn.addEventListener('click', printPerformerContactSheets);
    }
    const exportSetListBtn = document.getElementById('export-setlist-btn');
    if (exportSetListBtn) {
        exportSetListBtn.addEventListener('click', exportSetListToExcel);
    }
}

// Export Timeline to Excel
function exportTimelineToExcel() {
    // Create workbook
    const wb = XLSX.utils.book_new();

    // Export ALL three days in separate sheets
    const days = ['Thursday', 'Friday', 'Saturday'];

    days.forEach(day => {
        // Filter by day
        const filteredTimeline = state.timeline.filter(item => item.day === day);

        // Sort by time
        const sorted = [...filteredTimeline].sort((a, b) => {
            if (!a.time) return 1;
            if (!b.time) return -1;
            return a.time.localeCompare(b.time);
        });

        // Prepare data for Excel
        const data = sorted.map(item => ({
            'Time': item.time || '',
            'Event': item.event || '',
            'Responsible': item.responsible || '',
            'Staff': item.staff || '',
            'Completed': item.completed ? 'Yes' : 'No'
        }));

        // Create worksheet for this day
        const ws = XLSX.utils.json_to_sheet(data);

        // Set column widths
        ws['!cols'] = [
            { wch: 10 },  // Time
            { wch: 50 },  // Event
            { wch: 20 },  // Responsible
            { wch: 20 },  // Staff
            { wch: 10 }   // Completed
        ];

        // Add sheet to workbook
        XLSX.utils.book_append_sheet(wb, ws, day);
    });

    // Generate filename with today's date
    const today = new Date().toISOString().split('T')[0];
    const filename = `YMU_Gala_Complete_Timeline_${today}.xlsx`;

    // Download
    XLSX.writeFile(wb, filename);
}

// Export Budget to Excel
function exportBudgetToExcel() {
    // Prepare data for Excel
    const data = state.budget.map(item => ({
        'Vendor/Item': item.vendor || '',
        'Category': item.category || '',
        'Owner': item.owner || '',
        'Budgeted': parseFloat(item.budgeted) || 0,
        'Actual': parseFloat(item.actual) || 0,
        'Difference': (parseFloat(item.budgeted) || 0) - (parseFloat(item.actual) || 0),
        'Payment Status': formatPaymentStatus(item.paymentStatus),
        'Notes': item.notes || ''
    }));

    // Create worksheet
    const ws = XLSX.utils.json_to_sheet(data);

    // Set column widths
    ws['!cols'] = [
        { wch: 30 },  // Vendor/Item
        { wch: 35 },  // Category
        { wch: 20 },  // Owner
        { wch: 12 },  // Budgeted
        { wch: 12 },  // Actual
        { wch: 12 },  // Difference
        { wch: 15 },  // Payment Status
        { wch: 40 }   // Notes
    ];

    // Add number formatting for currency columns
    const range = XLSX.utils.decode_range(ws['!ref']);
    for (let R = range.s.r + 1; R <= range.e.r; ++R) {
        ['D', 'E', 'F'].forEach(col => {
            const cellRef = col + (R + 1);
            if (ws[cellRef]) {
                ws[cellRef].z = '$#,##0.00';
            }
        });
    }

    // Create workbook
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Budget');

    // Add summary sheet
    const totalBudget = state.budget.reduce((sum, item) => sum + (parseFloat(item.budgeted) || 0), 0);
    const totalSpent = state.budget.reduce((sum, item) => sum + (parseFloat(item.actual) || 0), 0);
    const remaining = totalBudget - totalSpent;

    const summaryData = [
        { 'Metric': 'Total Budgeted', 'Amount': totalBudget },
        { 'Metric': 'Total Spent', 'Amount': totalSpent },
        { 'Metric': 'Remaining', 'Amount': remaining }
    ];

    const wsSummary = XLSX.utils.json_to_sheet(summaryData);
    wsSummary['!cols'] = [{ wch: 20 }, { wch: 15 }];
    XLSX.utils.book_append_sheet(wb, wsSummary, 'Summary');

    // Download
    const today = new Date().toISOString().split('T')[0];
    XLSX.writeFile(wb, `YMU_Gala_Budget_${today}.xlsx`);
}

// Inline Editing for Timeline
// Editable cell field order for Tab navigation (skip tag — it has its own <select>)
const TIMELINE_FIELD_ORDER = ['time', 'duration', 'event', 'responsible', 'staff', 'screenCue'];
const BUDGET_FIELD_ORDER = ['vendor', 'description', 'owner', 'budgeted', 'actual', 'paymentStatus', 'notes'];
const STAGE_FIELD_ORDER = ['channel', 'subsnake', 'instrument', 'mics', 'stands', 'notes', 'symbol'];

// Single-click cell editing
function editTimelineCell(cell) {
    // Already has an input? Just focus it
    if (cell.querySelector('.inline-edit-input')) return;

    const row = cell.closest('tr');
    const field = cell.dataset.field;
    if (!field) return;

    const isPhantom = row.dataset.phantom === 'true';
    const rowId = row.dataset.id;

    // Set editing guard (use 'phantom' for phantom row)
    state.timelineEditingRowId = isPhantom ? 'phantom' : rowId;

    row.classList.add('editing');

    // Determine the original value
    let original = '';
    if (isPhantom) {
        original = state.pendingNewRow[field] || '';
    } else {
        original = cell.dataset.original || '';
    }

    // Create input
    const input = document.createElement('input');
    input.type = 'text';
    input.value = original;
    input.className = 'inline-edit-input';
    input.dataset.field = field;

    cell.textContent = '';
    cell.appendChild(input);
    input.focus();
    input.select();

    // Keyboard navigation
    input.addEventListener('keydown', (e) => handleCellKeydown(e, cell, row));

    // Blur handler: auto-save if focus leaves the row entirely
    input.addEventListener('blur', () => {
        setTimeout(() => {
            const activeEl = document.activeElement;
            // If focus moved to another cell input in the same row, do nothing
            if (row.contains(activeEl) && activeEl.classList.contains('inline-edit-input')) return;
            // Otherwise, save this cell
            if (cell.querySelector('.inline-edit-input')) {
                if (isPhantom) {
                    const val = input.value.trim();
                    if (val) state.pendingNewRow[field] = val;
                    restoreCellDisplay(cell, isPhantom);
                    // If no other inputs active, commit the new row
                    if (!row.querySelector('.inline-edit-input')) {
                        row.classList.remove('editing');
                        commitNewRow();
                    }
                } else {
                    saveSingleCell(cell, row);
                }
            }
        }, 50);
    });
}

function handleCellKeydown(e, cell, row) {
    const field = cell.dataset.field;
    const isPhantom = row.dataset.phantom === 'true';
    const input = cell.querySelector('.inline-edit-input');

    if (e.key === 'Tab') {
        e.preventDefault();
        const direction = e.shiftKey ? -1 : 1;
        if (isPhantom) {
            const val = input ? input.value.trim() : '';
            if (val) state.pendingNewRow[field] = val;
            restoreCellDisplay(cell, true);
        } else {
            saveSingleCell(cell, row, true);
        }
        navigateToAdjacentCell(row, field, direction);
    } else if (e.key === 'Enter') {
        e.preventDefault();
        if (isPhantom) {
            const val = input ? input.value.trim() : '';
            if (val) state.pendingNewRow[field] = val;
            restoreCellDisplay(cell, true);
            commitNewRow();
        } else {
            saveSingleCell(cell, row, true);
            navigateToNextRowSameColumn(row, field);
        }
    } else if (e.key === 'Escape') {
        e.preventDefault();
        restoreCellDisplay(cell, isPhantom);
        row.classList.remove('editing');
        clearTimelineEditingFlag();
    } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        e.preventDefault();
        if (isPhantom) {
            const val = input ? input.value.trim() : '';
            if (val) state.pendingNewRow[field] = val;
            restoreCellDisplay(cell, true);
        } else {
            saveSingleCell(cell, row, true);
        }
        if (e.key === 'ArrowUp') {
            navigateToPrevRowSameColumn(row, field);
        } else {
            navigateToNextRowSameColumn(row, field);
        }
    } else if (e.key === 'ArrowLeft' && input && input.selectionStart === 0 && input.selectionEnd === 0) {
        e.preventDefault();
        if (isPhantom) {
            const val = input.value.trim();
            if (val) state.pendingNewRow[field] = val;
            restoreCellDisplay(cell, true);
        } else {
            saveSingleCell(cell, row, true);
        }
        navigateToAdjacentCell(row, field, -1);
    } else if (e.key === 'ArrowRight' && input && input.selectionStart === input.value.length && input.selectionEnd === input.value.length) {
        e.preventDefault();
        if (isPhantom) {
            const val = input.value.trim();
            if (val) state.pendingNewRow[field] = val;
            restoreCellDisplay(cell, true);
        } else {
            saveSingleCell(cell, row, true);
        }
        navigateToAdjacentCell(row, field, 1);
    }
}

function saveSingleCell(cell, row, keepEditing = false) {
    const input = cell.querySelector('.inline-edit-input');
    if (!input) return; // Already saved by keydown (blur fired after)

    // Grab values before removing input
    const field = cell.dataset.field;
    const id = row.dataset.id;
    let newValue = input.value.trim();
    const item = state.timeline.find(i => i.id === id);
    const oldValue = item ? (item[field] || '') : '';

    // Convert time if needed
    if (field === 'time' && newValue) {
        newValue = convertTo24Hour(newValue);
    }
    if (field === 'duration' && newValue) {
        newValue = formatDuration(newValue);
    }
    if (field === 'screenCue') {
        newValue = normalizeScreenCue(newValue);
    }

    // Restore cell to display mode immediately (remove input so blur handler won't double-fire)
    cell.dataset.original = newValue;
    if (field === 'time') {
        cell.innerHTML = `<span class="tl-time">${formatTime12Hour(newValue)}</span>`;
    } else if (field === 'duration') {
        cell.innerHTML = newValue ? escapeHtml(newValue) : '<span class="phantom-placeholder">+ duration</span>';
    } else {
        cell.textContent = newValue;
    }

    // Only clear editing guard if not navigating to another cell
    if (!keepEditing && !row.querySelector('.inline-edit-input')) {
        row.classList.remove('editing');
        clearTimelineEditingFlag();
    }

    // Guard: item may have been deleted by another user
    if (!item) return;

    // Only save if value changed
    if (newValue === oldValue) return;

    // Optimistic local update so deferred renders show correct value
    item[field] = newValue;

    // Undo batching: merge if same row within 2 seconds
    const now = Date.now();
    const lastUndo = state.timelineUndoStack[state.timelineUndoStack.length - 1];
    if (lastUndo && lastUndo.type === 'update' && lastUndo.id === id && (now - (lastUndo._ts || 0)) < 2000) {
        if (!(field in lastUndo.previousData)) {
            lastUndo.previousData[field] = oldValue;
        }
        lastUndo._ts = now;
    } else {
        const undoEntry = { type: 'update', id, previousData: { [field]: oldValue }, _ts: now };
        pushTimelineUndo(undoEntry);
    }

    // Save to Firestore
    const updates = { [field]: newValue, updatedAt: firebase.firestore.FieldValue.serverTimestamp() };
    collections.timeline.doc(id).update(updates)
        .catch(err => {
            console.error('Error saving cell:', err);
            // Revert optimistic update
            if (item) item[field] = oldValue;
            cell.dataset.original = oldValue;
            showToast('Error saving', 'error');
        });
}

function restoreCellDisplay(cell, isPhantom) {
    const field = cell.dataset.field;
    if (isPhantom) {
        let val = state.pendingNewRow[field] || '';
        if (field === 'screenCue' && val) val = normalizeScreenCue(val);
        if (val) {
            if (field === 'time') {
                cell.innerHTML = `<span class="tl-time">${formatTime12Hour(val)}</span>`;
            } else {
                cell.textContent = val;
            }
        } else {
            const placeholder = field === 'screenCue' ? '#' : `+ ${field}`;
            cell.innerHTML = `<span class="phantom-placeholder">${placeholder}</span>`;
        }
    } else {
        const original = cell.dataset.original || '';
        if (field === 'time') {
            cell.innerHTML = `<span class="tl-time">${formatTime12Hour(original)}</span>`;
        } else if (field === 'duration') {
            cell.innerHTML = original ? escapeHtml(original) : '<span class="phantom-placeholder">+ duration</span>';
        } else {
            cell.textContent = original;
        }
    }
}

function clearTimelineEditingFlag() {
    state.timelineEditingRowId = null;
    if (state.timelineRenderPending) {
        state.timelineRenderPending = false;
        renderTimeline();
    }
}

// Cue Sheet inline cell editing — parallel to editTimelineCell but supports
// textarea for multiline tech fields (audio/liveVideo/lighting) and uses the
// cue-sheet's own field order for Tab navigation. Writes to the same timeline
// Firestore doc so edits sync to the timeline page.
function clearCueSheetEditingFlag() {
    state.cueSheetEditingRowId = null;
    if (state.cueSheetRenderPending) {
        state.cueSheetRenderPending = false;
        renderCueSheet();
    }
}

function editCueCell(cell) {
    if (cell.querySelector('.inline-edit-input, .inline-edit-textarea')) return;

    const row = cell.closest('tr');
    const field = cell.dataset.field;
    if (!field || !row || !row.dataset.id) return;

    state.cueSheetEditingRowId = row.dataset.id;
    row.classList.add('editing');

    const original = cell.dataset.original || '';
    const isMultiline = CUE_SHEET_MULTILINE_FIELDS.has(field);

    const input = document.createElement(isMultiline ? 'textarea' : 'input');
    if (!isMultiline) input.type = 'text';
    input.value = original;
    input.className = isMultiline ? 'inline-edit-textarea' : 'inline-edit-input';
    input.dataset.field = field;

    cell.textContent = '';
    cell.appendChild(input);
    input.focus();
    if (!isMultiline) input.select();

    input.addEventListener('keydown', (e) => handleCueCellKeydown(e, cell, row));

    input.addEventListener('blur', () => {
        setTimeout(() => {
            const activeEl = document.activeElement;
            if (row.contains(activeEl) && (activeEl.classList.contains('inline-edit-input') || activeEl.classList.contains('inline-edit-textarea'))) return;
            if (cell.querySelector('.inline-edit-input, .inline-edit-textarea')) {
                saveCueSheetCell(cell, row);
            }
        }, 50);
    });
}
window.editCueCell = editCueCell;

function handleCueCellKeydown(e, cell, row) {
    const field = cell.dataset.field;
    const input = cell.querySelector('.inline-edit-input, .inline-edit-textarea');
    const isMultiline = CUE_SHEET_MULTILINE_FIELDS.has(field);

    if (e.key === 'Enter' && isMultiline && !e.metaKey && !e.ctrlKey) {
        // Allow newlines in textarea; only commit on Cmd/Ctrl+Enter
        return;
    }
    if (e.key === 'Tab') {
        e.preventDefault();
        const direction = e.shiftKey ? -1 : 1;
        saveCueSheetCell(cell, row, true);
        navigateCueAdjacent(row, field, direction);
    } else if (e.key === 'Enter') {
        e.preventDefault();
        saveCueSheetCell(cell, row, true);
        navigateCueNextRow(row, field);
    } else if (e.key === 'Escape') {
        e.preventDefault();
        restoreCueCellDisplay(cell);
        row.classList.remove('editing');
        clearCueSheetEditingFlag();
    }
}

function saveCueSheetCell(cell, row, keepEditing = false) {
    const input = cell.querySelector('.inline-edit-input, .inline-edit-textarea');
    if (!input) return;

    const field = cell.dataset.field;
    const id = row.dataset.id;
    let newValue = input.value;
    if (!CUE_SHEET_MULTILINE_FIELDS.has(field)) newValue = newValue.trim();

    const item = state.timeline.find(i => i.id === id);
    const oldValue = item ? (item[field] == null ? '' : String(item[field])) : '';

    if (field === 'time' && newValue) newValue = convertTo24Hour(newValue);
    if (field === 'duration' && newValue) newValue = formatDuration(newValue);
    if (field === 'screenCue') newValue = normalizeScreenCue(newValue);

    cell.dataset.original = newValue;
    restoreCueCellDisplay(cell);

    if (!keepEditing && !row.querySelector('.inline-edit-input, .inline-edit-textarea')) {
        row.classList.remove('editing');
        clearCueSheetEditingFlag();
    }

    if (!item) return;
    if (newValue === oldValue) return;

    item[field] = newValue;

    const updates = { [field]: newValue, updatedAt: firebase.firestore.FieldValue.serverTimestamp() };
    collections.timeline.doc(id).update(updates).catch(err => {
        console.error('Error saving cue cell:', err);
        if (item) item[field] = oldValue;
        cell.dataset.original = oldValue;
        restoreCueCellDisplay(cell);
        showToast('Error saving', 'error');
    });
}

function restoreCueCellDisplay(cell) {
    const field = cell.dataset.field;
    const value = cell.dataset.original || '';
    if (field === 'time') {
        cell.innerHTML = `<span class="tl-time">${formatTime12Hour(value)}</span>`;
    } else if (value === '') {
        cell.innerHTML = '<span class="cs-cell-empty">—</span>';
    } else {
        cell.textContent = value;
    }
}

function navigateCueAdjacent(row, currentField, direction) {
    const idx = CUE_SHEET_FIELD_ORDER.indexOf(currentField);
    const nextIdx = idx + direction;
    if (nextIdx >= 0 && nextIdx < CUE_SHEET_FIELD_ORDER.length) {
        const nextField = CUE_SHEET_FIELD_ORDER[nextIdx];
        const liveRow = document.querySelector(`#cue-sheet-tbody tr[data-id="${row.dataset.id}"]`) || row;
        const nextCell = liveRow.querySelector(`td[data-field="${nextField}"]`);
        if (nextCell) editCueCell(nextCell);
    } else if (direction > 0) {
        const liveRow = document.querySelector(`#cue-sheet-tbody tr[data-id="${row.dataset.id}"]`) || row;
        const nextRow = liveRow.nextElementSibling;
        if (nextRow && nextRow.querySelector('td[data-field]')) {
            const firstField = CUE_SHEET_FIELD_ORDER[0];
            const nextCell = nextRow.querySelector(`td[data-field="${firstField}"]`);
            if (nextCell) editCueCell(nextCell);
        }
    } else if (direction < 0) {
        const liveRow = document.querySelector(`#cue-sheet-tbody tr[data-id="${row.dataset.id}"]`) || row;
        const prevRow = liveRow.previousElementSibling;
        if (prevRow && prevRow.querySelector('td[data-field]')) {
            const lastField = CUE_SHEET_FIELD_ORDER[CUE_SHEET_FIELD_ORDER.length - 1];
            const prevCell = prevRow.querySelector(`td[data-field="${lastField}"]`);
            if (prevCell) editCueCell(prevCell);
        }
    }
}

function navigateCueNextRow(row, field) {
    const liveRow = document.querySelector(`#cue-sheet-tbody tr[data-id="${row.dataset.id}"]`) || row;
    const nextRow = liveRow.nextElementSibling;
    if (nextRow && nextRow.querySelector('td[data-field]')) {
        const nextCell = nextRow.querySelector(`td[data-field="${field}"]`);
        if (nextCell) editCueCell(nextCell);
    }
}

// Re-query row from live DOM in case a render happened
function getLiveRow(row) {
    if (row.dataset.phantom === 'true') return document.querySelector('#timeline-tbody tr[data-phantom="true"]') || row;
    if (row.dataset.id) return document.querySelector(`#timeline-tbody tr[data-id="${row.dataset.id}"]`) || row;
    return row;
}

function navigateToAdjacentCell(row, currentField, direction) {
    const idx = TIMELINE_FIELD_ORDER.indexOf(currentField);
    const nextIdx = idx + direction;

    if (nextIdx >= 0 && nextIdx < TIMELINE_FIELD_ORDER.length) {
        // Same row, next/prev cell
        const liveRow = getLiveRow(row);
        const nextField = TIMELINE_FIELD_ORDER[nextIdx];
        const nextCell = liveRow.querySelector(`td[data-field="${nextField}"]`);
        if (nextCell) editTimelineCell(nextCell);
    } else if (direction > 0) {
        // Tab past last field: wrap to next row's first field
        const isPhantom = row.dataset.phantom === 'true';
        if (isPhantom) {
            commitNewRow();
            return;
        }
        const liveRow = getLiveRow(row);
        const nextRow = liveRow.nextElementSibling;
        if (nextRow && nextRow.querySelector('td[data-field]')) {
            const firstField = TIMELINE_FIELD_ORDER[0];
            const nextCell = nextRow.querySelector(`td[data-field="${firstField}"]`);
            if (nextCell) editTimelineCell(nextCell);
        }
    } else if (direction < 0) {
        // Shift+Tab past first field: wrap to prev row's last field
        const liveRow = getLiveRow(row);
        const prevRow = liveRow.previousElementSibling;
        if (prevRow && prevRow.querySelector('td[data-field]')) {
            const lastField = TIMELINE_FIELD_ORDER[TIMELINE_FIELD_ORDER.length - 1];
            const prevCell = prevRow.querySelector(`td[data-field="${lastField}"]`);
            if (prevCell) editTimelineCell(prevCell);
        }
    }
}

function navigateToNextRowSameColumn(row, field) {
    const liveRow = getLiveRow(row);
    const nextRow = liveRow.nextElementSibling;
    if (nextRow && nextRow.querySelector('td[data-field]')) {
        const nextCell = nextRow.querySelector(`td[data-field="${field}"]`);
        if (nextCell) editTimelineCell(nextCell);
    }
}

function navigateToPrevRowSameColumn(row, field) {
    const liveRow = getLiveRow(row);
    const prevRow = liveRow.previousElementSibling;
    if (prevRow && prevRow.querySelector('td[data-field]')) {
        const prevCell = prevRow.querySelector(`td[data-field="${field}"]`);
        if (prevCell) editTimelineCell(prevCell);
    }
}

// Commit the phantom row to Firestore
async function commitNewRow() {
    const data = { ...state.pendingNewRow };

    // Need at least time or event
    if (!data.time && !data.event) {
        state.pendingNewRow = {};
        clearTimelineEditingFlag();
        renderTimeline();
        return;
    }

    // Convert time to 24hr
    if (data.time) data.time = convertTo24Hour(data.time);
    if (data.duration) data.duration = formatDuration(data.duration);
    if (data.screenCue) data.screenCue = normalizeScreenCue(data.screenCue);

    data.day = state.currentDay;
    data.completed = false;
    data.status = 'not-started';
    data.tag = '';
    data.notes = '';
    data.highlightColor = '';
    data.performer = '';
    data.stagePlotId = '';
    data.createdAt = firebase.firestore.FieldValue.serverTimestamp();
    data.updatedAt = firebase.firestore.FieldValue.serverTimestamp();

    state.pendingNewRow = {};

    try {
        const docRef = await collections.timeline.add(data);
        pushTimelineUndo({ type: 'add', id: docRef.id });
        showToast('Task added');
    } catch (error) {
        console.error('Error adding task:', error);
        showToast('Error adding task', 'error');
    }

    clearTimelineEditingFlag();
}

// Backward compat: makeRowEditable now just clicks the first cell
function makeRowEditable(row) {
    if (row.classList.contains('editing')) return;
    const firstCell = row.querySelector(`td[data-field="${TIMELINE_FIELD_ORDER[0]}"]`);
    if (firstCell) editTimelineCell(firstCell);
}

function saveRowChanges(row) {
    // Save all active inputs in the row
    const inputs = row.querySelectorAll('.inline-edit-input');
    inputs.forEach(input => {
        const cell = input.closest('td');
        if (cell) saveSingleCell(cell, row);
    });
}

function cancelRowEdit(row) {
    const cells = row.querySelectorAll('td[data-field]');
    const isPhantom = row.dataset.phantom === 'true';
    cells.forEach(cell => restoreCellDisplay(cell, isPhantom));
    row.classList.remove('editing');
    clearTimelineEditingFlag();
}

// Flexible time parser: accepts nearly any format and returns 24hr "HH:MM"
// Examples: "5pm" → "17:00", "530p" → "17:30", "5:30 PM" → "17:30",
//   "17:00" → "17:00", "530" → "05:30", "5" → "05:00", "12a" → "00:00",
//   "noon" → "12:00", "midnight" → "00:00", "9:5p" → "21:05"
function convertTo24Hour(raw) {
    if (!raw) return '';
    let s = raw.trim().toLowerCase();

    // Special words
    if (s === 'noon' || s === '12n') return '12:00';
    if (s === 'midnight' || s === '12mn') return '00:00';

    // Extract AM/PM indicator
    let period = null;
    if (/a\.?m?\.?$/i.test(s)) {
        period = 'am';
        s = s.replace(/\s*a\.?m?\.?$/i, '');
    } else if (/p\.?m?\.?$/i.test(s)) {
        period = 'pm';
        s = s.replace(/\s*p\.?m?\.?$/i, '');
    }

    s = s.trim();

    let hours, minutes;

    if (s.includes(':')) {
        // Has colon: "5:30", "17:00", "5:5"
        const parts = s.split(':');
        hours = parseInt(parts[0], 10);
        minutes = parseInt(parts[1], 10) || 0;
    } else {
        // No colon: "5", "530", "1730", "17"
        const digits = s.replace(/\D/g, '');
        if (digits.length === 0) return raw; // can't parse, return as-is

        if (digits.length <= 2) {
            // "5" → 5:00, "17" → 17:00
            hours = parseInt(digits, 10);
            minutes = 0;
        } else if (digits.length === 3) {
            // "530" → 5:30
            hours = parseInt(digits.charAt(0), 10);
            minutes = parseInt(digits.substring(1), 10);
        } else {
            // "0530", "1730" → 17:30
            hours = parseInt(digits.substring(0, digits.length - 2), 10);
            minutes = parseInt(digits.substring(digits.length - 2), 10);
        }
    }

    // Validate
    if (isNaN(hours) || isNaN(minutes)) return raw;
    if (minutes < 0 || minutes > 59) return raw;

    // Apply AM/PM
    if (period === 'am') {
        if (hours === 12) hours = 0;
    } else if (period === 'pm') {
        if (hours !== 12) hours += 12;
    } else {
        // No AM/PM specified — if hours <= 12, guess based on context
        // (leave as-is for 24hr values like 17, 23, etc.)
        if (hours > 24) return raw;
    }

    if (hours < 0 || hours > 23) return raw;

    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
}

// Budget Category Accordion Toggle
// Toggle Category Section
function toggleCategorySection(categoryId) {
    const content = document.getElementById(`content-${categoryId}`);
    const arrow = document.getElementById(`arrow-${categoryId}`);

    if (content.style.display === 'none') {
        content.style.display = 'block';
        arrow.textContent = '▼';
        localStorage.setItem(`category-${categoryId}`, 'open');
    } else {
        content.style.display = 'none';
        arrow.textContent = '▶';
        localStorage.setItem(`category-${categoryId}`, 'closed');
    }
}

// Inline Editing for Budget Items
// Single-click cell editing for Budget
function editBudgetCell(cell) {
    // Already has an input? Just focus it
    if (cell.querySelector('.inline-edit-input')) return;

    const row = cell.closest('tr');
    const field = cell.dataset.field;
    if (!field) return;

    const isPhantom = row.dataset.phantom === 'true';
    const rowId = row.dataset.id;

    // Set editing guard
    state.budgetEditingRowId = isPhantom ? 'phantom' : rowId;

    row.classList.add('editing');

    // Determine the original value
    let original = '';
    if (isPhantom) {
        original = state.pendingNewBudgetRow[field] || '';
    } else {
        original = cell.dataset.original || '';
    }

    // Create appropriate input based on field type
    let inputEl;
    if (field === 'paymentStatus') {
        inputEl = document.createElement('select');
        inputEl.className = 'inline-edit-input';
        inputEl.dataset.field = field;
        inputEl.innerHTML = `
            <option value="paid" ${original === 'paid' ? 'selected' : ''}>Paid</option>
            <option value="partial" ${original === 'partial' ? 'selected' : ''}>Partial</option>
            <option value="not-paid" ${original === 'not-paid' ? 'selected' : ''}>Not Paid</option>
        `;
    } else if (field === 'budgeted' || field === 'actual') {
        inputEl = document.createElement('input');
        inputEl.type = 'number';
        inputEl.step = '0.01';
        inputEl.value = original;
        inputEl.className = 'inline-edit-input';
        inputEl.dataset.field = field;
    } else {
        inputEl = document.createElement('input');
        inputEl.type = 'text';
        inputEl.value = original;
        inputEl.className = 'inline-edit-input';
        inputEl.dataset.field = field;
    }

    cell.textContent = '';
    cell.appendChild(inputEl);
    inputEl.focus();
    if (inputEl.select) inputEl.select();

    // Keyboard navigation
    inputEl.addEventListener('keydown', (e) => handleBudgetCellKeydown(e, cell, row));

    // Blur handler: auto-save if focus leaves the row entirely
    inputEl.addEventListener('blur', () => {
        setTimeout(() => {
            const activeEl = document.activeElement;
            if (row.contains(activeEl) && activeEl.classList.contains('inline-edit-input')) return;
            if (cell.querySelector('.inline-edit-input')) {
                if (isPhantom) {
                    const val = inputEl.value.trim();
                    if (val) state.pendingNewBudgetRow[field] = val;
                    restoreBudgetCellDisplay(cell, isPhantom);
                    if (!row.querySelector('.inline-edit-input')) {
                        row.classList.remove('editing');
                        // Focus left the phantom row entirely — commit if any field has data
                        const hasData = BUDGET_FIELD_ORDER.some(f => state.pendingNewBudgetRow[f] && String(state.pendingNewBudgetRow[f]).trim());
                        if (hasData) {
                            commitNewBudgetRow(row);
                        } else {
                            clearBudgetEditingFlag();
                        }
                    }
                } else {
                    saveSingleBudgetCell(cell, row);
                }
            }
        }, 50);
    });
}

function handleBudgetCellKeydown(e, cell, row) {
    const field = cell.dataset.field;
    const isPhantom = row.dataset.phantom === 'true';

    if (e.key === 'Tab') {
        e.preventDefault();
        const direction = e.shiftKey ? -1 : 1;
        if (isPhantom) {
            const input = cell.querySelector('.inline-edit-input');
            const val = input ? input.value.trim() : '';
            if (val) state.pendingNewBudgetRow[field] = val;
            restoreBudgetCellDisplay(cell, true);
        } else {
            saveSingleBudgetCell(cell, row);
        }
        navigateBudgetCell(row, field, direction);
    } else if (e.key === 'Enter') {
        e.preventDefault();
        if (isPhantom) {
            const input = cell.querySelector('.inline-edit-input');
            const val = input ? input.value.trim() : '';
            if (val) state.pendingNewBudgetRow[field] = val;
            restoreBudgetCellDisplay(cell, true);
            commitNewBudgetRow(row);
        } else {
            saveSingleBudgetCell(cell, row);
            navigateBudgetNextRowSameColumn(row, field);
        }
    } else if (e.key === 'Escape') {
        e.preventDefault();
        restoreBudgetCellDisplay(cell, isPhantom);
        row.classList.remove('editing');
        clearBudgetEditingFlag();
    }
}

function saveSingleBudgetCell(cell, row) {
    const input = cell.querySelector('.inline-edit-input');
    if (!input) return;

    const field = cell.dataset.field;
    const id = row.dataset.id;
    const item = state.budget.find(i => i.id === id);
    if (!item) { restoreBudgetCellDisplay(cell, false); return; }

    let newValue = input.value.trim();
    const oldValue = (field === 'budgeted' || field === 'actual')
        ? (parseFloat(item[field]) || 0)
        : (item[field] || '');

    // Convert number fields
    if (field === 'budgeted' || field === 'actual') {
        newValue = parseFloat(newValue) || 0;
    }

    // Restore cell to display mode
    cell.dataset.original = String(newValue);
    restoreBudgetCellDisplay(cell, false);

    // Live-update difference column
    if (field === 'budgeted' || field === 'actual') {
        const budgetedCell = row.querySelector('td[data-field="budgeted"]');
        const actualCell = row.querySelector('td[data-field="actual"]');
        const budgetedVal = parseFloat(budgetedCell.dataset.original) || 0;
        const actualVal = parseFloat(actualCell.dataset.original) || 0;
        const difference = budgetedVal - actualVal;
        const diffCell = row.querySelector('td[data-computed="difference"]');
        if (diffCell) {
            diffCell.className = difference < 0 ? 'over-budget' : difference > 0 ? 'under-budget' : '';
            diffCell.textContent = `${formatCurrency(Math.abs(difference))} ${difference < 0 ? 'over' : difference > 0 ? 'under' : ''}`;
        }
    }

    // If no other cells are being edited in this row, clear editing state
    if (!row.querySelector('.inline-edit-input')) {
        row.classList.remove('editing');
        clearBudgetEditingFlag();
    }

    // Only save if value changed
    if (String(newValue) === String(oldValue)) return;

    // Save to Firestore
    const updates = { [field]: newValue, updatedAt: firebase.firestore.FieldValue.serverTimestamp() };
    collections.budget.doc(id).update(updates)
        .then(() => showToast('Updated'))
        .catch(err => {
            console.error('Error saving cell:', err);
            showToast('Error saving', 'error');
        });
}

function restoreBudgetCellDisplay(cell, isPhantom) {
    const field = cell.dataset.field;
    if (isPhantom) {
        const val = state.pendingNewBudgetRow[field] || '';
        if (val) {
            if (field === 'budgeted' || field === 'actual') {
                cell.textContent = formatCurrency(parseFloat(val) || 0);
            } else if (field === 'paymentStatus') {
                cell.innerHTML = `<span class="status-badge ${val}">${formatPaymentStatus(val)}</span>`;
            } else {
                cell.textContent = val;
            }
        } else {
            const placeholder = field === 'paymentStatus' ? '+ status' : `+ ${field}`;
            cell.innerHTML = `<span class="phantom-placeholder">${placeholder}</span>`;
        }
    } else {
        const original = cell.dataset.original || '';
        if (field === 'budgeted' || field === 'actual') {
            cell.textContent = formatCurrency(parseFloat(original) || 0);
        } else if (field === 'paymentStatus') {
            cell.innerHTML = `<span class="status-badge ${original}">${formatPaymentStatus(original)}</span>`;
        } else {
            cell.textContent = original;
        }
    }
}

function clearBudgetEditingFlag() {
    state.budgetEditingRowId = null;
    if (state.budgetRenderPending) {
        state.budgetRenderPending = false;
        renderBudget();
    }
}

function navigateBudgetCell(row, currentField, direction) {
    const idx = BUDGET_FIELD_ORDER.indexOf(currentField);
    const nextIdx = idx + direction;
    const tbody = row.closest('tbody');

    if (nextIdx >= 0 && nextIdx < BUDGET_FIELD_ORDER.length) {
        const nextField = BUDGET_FIELD_ORDER[nextIdx];
        const nextCell = row.querySelector(`td[data-field="${nextField}"]`);
        if (nextCell) editBudgetCell(nextCell);
    } else if (direction > 0) {
        const isPhantom = row.dataset.phantom === 'true';
        if (isPhantom) {
            commitNewBudgetRow(row);
            return;
        }
        // Wrap to next row within the same tbody (category)
        const nextRow = row.nextElementSibling;
        if (nextRow && nextRow.querySelector('td[data-field]')) {
            const firstField = BUDGET_FIELD_ORDER[0];
            const nextCell = nextRow.querySelector(`td[data-field="${firstField}"]`);
            if (nextCell) editBudgetCell(nextCell);
        }
    } else if (direction < 0) {
        const prevRow = row.previousElementSibling;
        if (prevRow && prevRow.querySelector('td[data-field]')) {
            const lastField = BUDGET_FIELD_ORDER[BUDGET_FIELD_ORDER.length - 1];
            const prevCell = prevRow.querySelector(`td[data-field="${lastField}"]`);
            if (prevCell) editBudgetCell(prevCell);
        }
    }
}

function navigateBudgetNextRowSameColumn(row, field) {
    const nextRow = row.nextElementSibling;
    if (nextRow && nextRow.querySelector('td[data-field]')) {
        const nextCell = nextRow.querySelector(`td[data-field="${field}"]`);
        if (nextCell) editBudgetCell(nextCell);
    }
}

async function commitNewBudgetRow(phantomRow) {
    const data = { ...state.pendingNewBudgetRow };

    // Need at least one field populated
    const hasAnyData = BUDGET_FIELD_ORDER.some(f => data[f] && String(data[f]).trim());
    if (!hasAnyData) {
        state.pendingNewBudgetRow = {};
        clearBudgetEditingFlag();
        renderBudget();
        return;
    }

    // Get category from phantom row
    const category = phantomRow.dataset.category || 'Uncategorized';
    data.category = category;

    // Convert number fields
    if (data.budgeted) data.budgeted = parseFloat(data.budgeted) || 0;
    if (data.actual) data.actual = parseFloat(data.actual) || 0;

    // Fill missing fields
    BUDGET_FIELD_ORDER.forEach(f => {
        if (data[f] === undefined) data[f] = (f === 'budgeted' || f === 'actual') ? 0 : '';
    });

    data.confirmed = false;
    data.paymentStatus = data.paymentStatus || 'not-paid';
    data.createdAt = firebase.firestore.FieldValue.serverTimestamp();
    data.updatedAt = firebase.firestore.FieldValue.serverTimestamp();

    state.pendingNewBudgetRow = {};
    clearBudgetEditingFlag();

    try {
        await collections.budget.add(data);
        showToast('Budget item added');
    } catch (error) {
        console.error('Error adding budget item:', error);
        showToast('Error adding item', 'error');
    }
}

// Initialize accordion state on page load
document.addEventListener('DOMContentLoaded', () => {
    // Restore budget category accordion state
    const accordionState = localStorage.getItem('budgetCategoryAccordionOpen');
    if (accordionState === 'true') {
        const content = document.getElementById('budget-category-accordion');
        const arrow = document.getElementById('budget-category-arrow');
        if (content && arrow) {
            content.style.display = 'block';
            arrow.textContent = '▼';
        }
    }
});

// Stage Inputs Loading

// Render Stage Inputs
function renderStageInputs() {
    // Render guard: don't rebuild DOM if user is editing a cell
    if (state.stageEditingRowId) {
        state.stageRenderPending = true;
        return;
    }

    const tbody = document.getElementById('stage-tbody');
    const title = document.getElementById('stage-title');

    // Determine which stage to show
    const isMainStage = state.currentStage === 'main';
    const stageData = isMainStage ? state.mainStageInputs : state.cocktailStageInputs;
    const collectionName = isMainStage ? 'mainStageInputs' : 'cocktailStageInputs';
    const stageName = isMainStage ? 'Main Stage' : 'Cocktail Stage';

    // Update title
    title.textContent = `${stageName} - Audio & Technical Inputs`;

    // Calculate next channel for phantom row
    const nextChannel = stageData.length > 0
        ? Math.max(...stageData.map(i => parseInt(i.channel) || 0)) + 1
        : 1;

    if (stageData.length === 0) {
        // Show phantom row even when empty
        const phantomRow = `
            <tr class="stage-phantom-row" data-phantom="true" data-collection="${collectionName}">
                <td class="drag-handle" style="cursor: default; color: transparent;">⠿</td>
                <td data-field="channel" onclick="editStageCell(this, '${collectionName}')"><span class="phantom-placeholder">+ ${nextChannel}</span></td>
                <td data-field="subsnake" onclick="editStageCell(this, '${collectionName}')"><span class="phantom-placeholder">+ subsnake</span></td>
                <td data-field="instrument" onclick="editStageCell(this, '${collectionName}')"><span class="phantom-placeholder">+ instrument</span></td>
                <td data-field="mics" onclick="editStageCell(this, '${collectionName}')"><span class="phantom-placeholder">+ mics</span></td>
                <td data-field="stands" onclick="editStageCell(this, '${collectionName}')"><span class="phantom-placeholder">+ stands</span></td>
                <td data-field="notes" onclick="editStageCell(this, '${collectionName}')"><span class="phantom-placeholder">+ notes</span></td>
                <td data-field="symbol" onclick="editStageCell(this, '${collectionName}')"><span class="phantom-placeholder">+ symbol</span></td>
                <td class="stage-actions-cell no-print"></td>
            </tr>
        `;
        tbody.innerHTML = phantomRow;
        state.pendingNewStageRow = {};
        return;
    }

    // Sort by order field, fall back to channel number
    const sorted = [...stageData].sort((a, b) => {
        if (a.order != null && b.order != null) return a.order - b.order;
        if (a.order != null) return -1;
        if (b.order != null) return 1;
        return (parseInt(a.channel) || 0) - (parseInt(b.channel) || 0);
    });

    const rowsHtml = sorted.map(item => {
        return `
            <tr data-id="${item.id}" draggable="true"
                ondragstart="onStageDragStart(event)"
                ondragover="onStageDragOver(event)"
                ondragend="onStageDragEnd(event)"
                ondrop="onStageDrop(event, '${collectionName}')">
                <td class="drag-handle" title="Drag to reorder">⠿</td>
                <td data-field="channel" data-original="${escapeHtml(item.channel || '')}" onclick="editStageCell(this, '${collectionName}')">${escapeHtml(item.channel || '')}</td>
                <td data-field="subsnake" data-original="${escapeHtml(item.subsnake || '')}" onclick="editStageCell(this, '${collectionName}')">${escapeHtml(item.subsnake || '')}</td>
                <td data-field="instrument" data-original="${escapeHtml(item.instrument || '')}" onclick="editStageCell(this, '${collectionName}')">${escapeHtml(item.instrument || '')}</td>
                <td data-field="mics" data-original="${escapeHtml(item.mics || '')}" onclick="editStageCell(this, '${collectionName}')">${escapeHtml(item.mics || '')}</td>
                <td data-field="stands" data-original="${escapeHtml(item.stands || '')}" onclick="editStageCell(this, '${collectionName}')">${escapeHtml(item.stands || '')}</td>
                <td data-field="notes" data-original="${escapeHtml(item.notes || '')}" onclick="editStageCell(this, '${collectionName}')">${escapeHtml(item.notes || '')}</td>
                <td data-field="symbol" data-original="${escapeHtml(item.symbol || '')}" onclick="editStageCell(this, '${collectionName}')">${escapeHtml(item.symbol || '')}</td>
                <td class="stage-actions-cell no-print">
                    <div class="actions-row">
                        <button class="action-icon action-icon-danger" onclick="deleteStageInput('${item.id}', '${collectionName}')" title="Delete">
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                        </button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');

    // Phantom row for inline adding
    const phantomRow = `
        <tr class="stage-phantom-row" data-phantom="true" data-collection="${collectionName}">
            <td class="drag-handle" style="cursor: default; color: transparent;">⠿</td>
            <td data-field="channel" onclick="editStageCell(this, '${collectionName}')"><span class="phantom-placeholder">+ ${nextChannel}</span></td>
            <td data-field="subsnake" onclick="editStageCell(this, '${collectionName}')"><span class="phantom-placeholder">+ subsnake</span></td>
            <td data-field="instrument" onclick="editStageCell(this, '${collectionName}')"><span class="phantom-placeholder">+ instrument</span></td>
            <td data-field="mics" onclick="editStageCell(this, '${collectionName}')"><span class="phantom-placeholder">+ mics</span></td>
            <td data-field="stands" onclick="editStageCell(this, '${collectionName}')"><span class="phantom-placeholder">+ stands</span></td>
            <td data-field="notes" onclick="editStageCell(this, '${collectionName}')"><span class="phantom-placeholder">+ notes</span></td>
            <td data-field="symbol" onclick="editStageCell(this, '${collectionName}')"><span class="phantom-placeholder">+ symbol</span></td>
            <td class="stage-actions-cell no-print"></td>
        </tr>
    `;

    tbody.innerHTML = rowsHtml + phantomRow;
    state.pendingNewStageRow = {};

    // Mobile card view
    const mobileContainer = document.getElementById('stage-mobile-cards');
    if (mobileContainer) {
        if (sorted.length === 0) {
            mobileContainer.innerHTML = '<div class="mobile-card-empty">No inputs</div>';
        } else {
            mobileContainer.innerHTML = sorted.map(item => {
                return `
                    <div class="mobile-card">
                        <div class="mobile-card-row">
                            <span class="mobile-card-channel">${escapeHtml(item.channel || '?')}</span>
                            <span class="mobile-card-title">${escapeHtml(item.instrument || 'No instrument')}</span>
                            ${item.symbol ? `<span class="mobile-card-subtitle">${escapeHtml(item.symbol)}</span>` : ''}
                        </div>
                        <div class="mobile-card-details">
                            ${item.subsnake ? `<span class="mobile-card-detail"><strong>Snake:</strong> ${escapeHtml(item.subsnake)}</span>` : ''}
                            ${item.mics ? `<span class="mobile-card-detail"><strong>Mic:</strong> ${escapeHtml(item.mics)}</span>` : ''}
                            ${item.stands ? `<span class="mobile-card-detail"><strong>Stand:</strong> ${escapeHtml(item.stands)}</span>` : ''}
                            ${item.notes ? `<span class="mobile-card-detail"><strong>Notes:</strong> ${escapeHtml(item.notes)}</span>` : ''}
                        </div>
                    </div>
                `;
            }).join('');
        }
    }
}

// Single-click cell editing for Stage Inputs
function editStageCell(cell, collectionName) {
    // Already has an input? Just focus it
    if (cell.querySelector('.inline-edit-input')) return;

    const row = cell.closest('tr');
    const field = cell.dataset.field;
    if (!field) return;

    const isPhantom = row.dataset.phantom === 'true';
    const rowId = row.dataset.id;

    // Set editing guard
    state.stageEditingRowId = isPhantom ? 'phantom' : rowId;

    row.classList.add('editing');

    // Determine the original value
    let original = '';
    if (isPhantom) {
        original = state.pendingNewStageRow[field] || '';
    } else {
        original = cell.dataset.original || '';
    }

    // Create input
    const input = document.createElement('input');
    input.type = 'text';
    input.value = original;
    input.className = 'inline-edit-input';
    input.dataset.field = field;

    cell.textContent = '';
    cell.appendChild(input);
    input.focus();
    input.select();

    // Keyboard navigation
    input.addEventListener('keydown', (e) => handleStageCellKeydown(e, cell, row, collectionName));

    // Blur handler: auto-save if focus leaves the row entirely
    input.addEventListener('blur', () => {
        setTimeout(() => {
            const activeEl = document.activeElement;
            if (row.contains(activeEl) && activeEl.classList.contains('inline-edit-input')) return;
            if (cell.querySelector('.inline-edit-input')) {
                if (isPhantom) {
                    const val = input.value.trim();
                    if (val) state.pendingNewStageRow[field] = val;
                    restoreStageCellDisplay(cell, isPhantom);
                    if (!row.querySelector('.inline-edit-input')) {
                        row.classList.remove('editing');
                        clearStageEditingFlag();
                    }
                } else {
                    saveSingleStageCell(cell, row, collectionName);
                }
            }
        }, 50);
    });
}

function handleStageCellKeydown(e, cell, row, collectionName) {
    const field = cell.dataset.field;
    const isPhantom = row.dataset.phantom === 'true';

    if (e.key === 'Tab') {
        e.preventDefault();
        const direction = e.shiftKey ? -1 : 1;
        if (isPhantom) {
            const input = cell.querySelector('.inline-edit-input');
            const val = input ? input.value.trim() : '';
            if (val) state.pendingNewStageRow[field] = val;
            restoreStageCellDisplay(cell, true);
        } else {
            saveSingleStageCell(cell, row, collectionName);
        }
        navigateStageCell(row, field, direction, collectionName);
    } else if (e.key === 'Enter') {
        e.preventDefault();
        if (isPhantom) {
            const input = cell.querySelector('.inline-edit-input');
            const val = input ? input.value.trim() : '';
            if (val) state.pendingNewStageRow[field] = val;
            restoreStageCellDisplay(cell, true);
            commitNewStageRow(collectionName);
        } else {
            saveSingleStageCell(cell, row, collectionName);
            navigateStageNextRowSameColumn(row, field, collectionName);
        }
    } else if (e.key === 'Escape') {
        e.preventDefault();
        restoreStageCellDisplay(cell, isPhantom);
        row.classList.remove('editing');
        clearStageEditingFlag();
    }
}

function saveSingleStageCell(cell, row, collectionName) {
    const input = cell.querySelector('.inline-edit-input');
    if (!input) return;

    const field = cell.dataset.field;
    const id = row.dataset.id;
    const newValue = input.value.trim();

    // Restore cell to display mode
    cell.dataset.original = newValue;
    cell.textContent = newValue;

    // If no other cells are being edited in this row, clear editing state
    if (!row.querySelector('.inline-edit-input')) {
        row.classList.remove('editing');
        clearStageEditingFlag();
    }

    // Only save if value changed
    const stageData = collectionName === 'mainStageInputs' ? state.mainStageInputs : state.cocktailStageInputs;
    const item = stageData.find(i => i.id === id);
    const oldValue = item ? (item[field] || '') : '';
    if (newValue === oldValue) return;

    // Save to Firestore
    const updates = { [field]: newValue, updatedAt: firebase.firestore.FieldValue.serverTimestamp() };
    collections[collectionName].doc(id).update(updates)
        .then(() => showToast('Updated'))
        .catch(err => {
            console.error('Error saving cell:', err);
            showToast('Error saving', 'error');
        });
}

function restoreStageCellDisplay(cell, isPhantom) {
    const field = cell.dataset.field;
    if (isPhantom) {
        const val = state.pendingNewStageRow[field] || '';
        if (val) {
            cell.textContent = val;
        } else {
            cell.innerHTML = `<span class="phantom-placeholder">+ ${field}</span>`;
        }
    } else {
        cell.textContent = cell.dataset.original || '';
    }
}

function clearStageEditingFlag() {
    state.stageEditingRowId = null;
    if (state.stageRenderPending) {
        state.stageRenderPending = false;
        renderStageInputs();
    }
}

function navigateStageCell(row, currentField, direction, collectionName) {
    const idx = STAGE_FIELD_ORDER.indexOf(currentField);
    const nextIdx = idx + direction;

    if (nextIdx >= 0 && nextIdx < STAGE_FIELD_ORDER.length) {
        const nextField = STAGE_FIELD_ORDER[nextIdx];
        const nextCell = row.querySelector(`td[data-field="${nextField}"]`);
        if (nextCell) editStageCell(nextCell, collectionName);
    } else if (direction > 0) {
        const isPhantom = row.dataset.phantom === 'true';
        if (isPhantom) {
            commitNewStageRow(collectionName);
            return;
        }
        const nextRow = row.nextElementSibling;
        if (nextRow && nextRow.querySelector('td[data-field]')) {
            const firstField = STAGE_FIELD_ORDER[0];
            const nextCell = nextRow.querySelector(`td[data-field="${firstField}"]`);
            if (nextCell) editStageCell(nextCell, collectionName);
        }
    } else if (direction < 0) {
        const prevRow = row.previousElementSibling;
        if (prevRow && prevRow.querySelector('td[data-field]')) {
            const lastField = STAGE_FIELD_ORDER[STAGE_FIELD_ORDER.length - 1];
            const prevCell = prevRow.querySelector(`td[data-field="${lastField}"]`);
            if (prevCell) editStageCell(prevCell, collectionName);
        }
    }
}

function navigateStageNextRowSameColumn(row, field, collectionName) {
    const nextRow = row.nextElementSibling;
    if (nextRow && nextRow.querySelector('td[data-field]')) {
        const nextCell = nextRow.querySelector(`td[data-field="${field}"]`);
        if (nextCell) editStageCell(nextCell, collectionName);
    }
}

async function commitNewStageRow(collectionName) {
    const data = { ...state.pendingNewStageRow };

    // Need at least channel or instrument
    if (!data.channel && !data.instrument) {
        state.pendingNewStageRow = {};
        clearStageEditingFlag();
        renderStageInputs();
        return;
    }

    // Auto-assign channel if not provided
    if (!data.channel) {
        const stageData = collectionName === 'mainStageInputs' ? state.mainStageInputs : state.cocktailStageInputs;
        const nextChannel = stageData.length > 0
            ? Math.max(...stageData.map(i => parseInt(i.channel) || 0)) + 1
            : 1;
        data.channel = String(nextChannel);
    }

    // Fill missing fields with empty strings
    STAGE_FIELD_ORDER.forEach(f => { if (!data[f]) data[f] = ''; });

    const stageData = collectionName === 'mainStageInputs' ? state.mainStageInputs : state.cocktailStageInputs;
    data.order = stageData.length;

    state.pendingNewStageRow = {};
    clearStageEditingFlag();

    try {
        await collections[collectionName].add(data);
        showToast('Input added');
    } catch (error) {
        console.error('Error adding stage input:', error);
        showToast('Error adding input', 'error');
    }
}

// Delete a stage input row
async function deleteStageInput(id, collectionName) {
    if (!confirm('Delete this input?')) return;
    try {
        await collections[collectionName].doc(id).delete();
        showToast('Input deleted');
    } catch (error) {
        console.error('Error deleting stage input:', error);
        showToast('Error deleting input', 'error');
    }
}
window.deleteStageInput = deleteStageInput;

// Drag and Drop for Stage Input rows
let draggedRow = null;

function onStageDragStart(e) {
    draggedRow = e.target.closest('tr');
    draggedRow.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
}

function onStageDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const row = e.target.closest('tr');
    if (!row || row === draggedRow || !row.parentElement) return;

    const tbody = row.parentElement;
    const rows = [...tbody.querySelectorAll('tr')];
    const dragIdx = rows.indexOf(draggedRow);
    const hoverIdx = rows.indexOf(row);

    if (dragIdx < hoverIdx) {
        row.after(draggedRow);
    } else {
        row.before(draggedRow);
    }
}

function onStageDragEnd(e) {
    if (draggedRow) {
        draggedRow.classList.remove('dragging');
        draggedRow = null;
    }
}

function onStageDrop(e, collectionName) {
    e.preventDefault();
    if (!draggedRow) return;

    const tbody = draggedRow.parentElement;
    const rows = [...tbody.querySelectorAll('tr')];

    // Batch update order field for all rows
    const batch = db.batch();
    rows.forEach((row, index) => {
        const id = row.dataset.id;
        if (id) {
            batch.update(collections[collectionName].doc(id), { order: index });
        }
    });

    batch.commit()
        .then(() => showToast('Order updated'))
        .catch(err => {
            console.error('Error saving order:', err);
            showToast('Error saving order', 'error');
        });
}

window.onStageDragStart = onStageDragStart;
window.onStageDragOver = onStageDragOver;
window.onStageDragEnd = onStageDragEnd;
window.onStageDrop = onStageDrop;

// Export Stage Inputs to Excel
function exportStageInputsToExcel() {
    const wb = XLSX.utils.book_new();

    // Export Main Stage
    const mainSorted = [...state.mainStageInputs].sort((a, b) => {
        const aNum = parseInt(a.channel) || 0;
        const bNum = parseInt(b.channel) || 0;
        return aNum - bNum;
    });

    const mainData = mainSorted.map(item => ({
        '#': item.channel || '',
        'Subsnake': item.subsnake || '',
        'Instrument': item.instrument || '',
        'Mics (Preferred)': item.mics || '',
        'Stands': item.stands || '',
        'Notes': item.notes || '',
        'Symbol': item.symbol || ''
    }));

    const wsMain = XLSX.utils.json_to_sheet(mainData);
    wsMain['!cols'] = [
        { wch: 5 },
        { wch: 12 },
        { wch: 25 },
        { wch: 20 },
        { wch: 15 },
        { wch: 30 },
        { wch: 8 }
    ];
    XLSX.utils.book_append_sheet(wb, wsMain, 'Main Stage');

    // Export Cocktail Stage
    const cocktailSorted = [...state.cocktailStageInputs].sort((a, b) => {
        const aNum = parseInt(a.channel) || 0;
        const bNum = parseInt(b.channel) || 0;
        return aNum - bNum;
    });

    const cocktailData = cocktailSorted.map(item => ({
        '#': item.channel || '',
        'Subsnake': item.subsnake || '',
        'Instrument': item.instrument || '',
        'Mics (Preferred)': item.mics || '',
        'Stands': item.stands || '',
        'Notes': item.notes || '',
        'Symbol': item.symbol || ''
    }));

    const wsCocktail = XLSX.utils.json_to_sheet(cocktailData);
    wsCocktail['!cols'] = [
        { wch: 5 },
        { wch: 12 },
        { wch: 25 },
        { wch: 20 },
        { wch: 15 },
        { wch: 30 },
        { wch: 8 }
    ];
    XLSX.utils.book_append_sheet(wb, wsCocktail, 'Cocktail Stage');

    const today = new Date().toISOString().split('T')[0];
    XLSX.writeFile(wb, `Stage_Input_Lists_${today}.xlsx`);
}

// ==========================================
// STAFF PAGE
// ==========================================

const STAFF_TEAM_COLORS = {
    'Check In': '#4a90a4',
    'FOH Team': '#7b6cb0',
    'Silent Auction': '#c9a961',
    'Bathroom/FOH': '#8a8778',
    'Marketing': '#d4795c',
    'Mainstage Production Team': '#c9a961',
    'Talent': '#e06b8a',
    'Power 20 team': '#4aaa7a',
    'Greenroom Team': '#6a9a6a'
};

function getTeamColor(teamName) {
    if (STAFF_TEAM_COLORS[teamName]) return STAFF_TEAM_COLORS[teamName];
    let hash = 0;
    for (let i = 0; i < teamName.length; i++) hash = teamName.charCodeAt(i) + ((hash << 5) - hash);
    const colors = ['#4a90a4', '#7b6cb0', '#d4795c', '#e06b8a', '#4aaa7a', '#6a9a6a', '#8a6a4a', '#5a7a9a'];
    return colors[Math.abs(hash) % colors.length];
}

function staffItemMatchesSearch(member, query) {
    if (!query) return true;
    const tokens = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (tokens.length === 0) return true;
    const fields = [
        member.name || '',
        member.role || '',
        ...(member.teams || [])
    ];
    const text = fields.join(' ').toLowerCase();
    return tokens.every(t => text.includes(t));
}

function handleStaffSearch(value) {
    clearTimeout(staffSearchDebounce);
    staffSearchDebounce = setTimeout(() => {
        state.staffSearch = value;
        renderStaff();
    }, 150);
}

function clearStaffSearch() {
    const input = document.getElementById('staff-search-input');
    if (input) input.value = '';
    state.staffSearch = '';
    renderStaff();
}

window.handleStaffSearch = handleStaffSearch;
window.clearStaffSearch = clearStaffSearch;

function setStaffView(view) {
    state.staffView = view;
    document.getElementById('staff-team-view-btn').classList.toggle('active', view === 'team');
    document.getElementById('staff-schedule-view-btn').classList.toggle('active', view === 'schedule');
    document.getElementById('staff-team-view').style.display = view === 'team' ? '' : 'none';
    document.getElementById('staff-schedule-view').style.display = view === 'schedule' ? '' : 'none';
    renderStaff();
}

function setStaffDay(day) {
    state.staffDay = day;
    document.querySelectorAll('.staff-day-tab').forEach(tab => {
        tab.classList.toggle('active', tab.dataset.day === day);
    });
    renderStaffGantt();
}

window.setStaffView = setStaffView;
window.setStaffDay = setStaffDay;

function toggleStaffUnfilledFilter() {
    state.staffFilter = state.staffFilter === 'unfilled' ? 'all' : 'unfilled';
    updateStaffUnfilledCard();
    renderStaff();
}

function updateStaffUnfilledCard() {
    const card = document.getElementById('staff-stat-unfilled-card');
    if (card) card.classList.toggle('active', state.staffFilter === 'unfilled');
}

window.toggleStaffUnfilledFilter = toggleStaffUnfilledFilter;

function formatScheduleShort(timeStr) {
    if (!timeStr) return null;
    return timeStr
        .replace(/:00/g, '')
        .replace(/\s*-\s*/g, '-')
        .replace(/12:30:00 PM/gi, '12:30p')
        .replace(/(\d{1,2})(:\d{2})?(am)/gi, '$1$2a')
        .replace(/(\d{1,2})(:\d{2})?(pm)/gi, '$1$2p')
        .replace(/ /g, '');
}

function parseStaffTime(timeStr) {
    if (!timeStr) return null;
    // Strip whitespace AND periods so "9:30 a.m." normalizes to "9:30am"
    let s = timeStr.trim().toLowerCase().replace(/[\s.]/g, '');
    s = s.replace(/(\d{1,2}:\d{2}):\d{2}(am|pm)/i, '$1$2');
    // Colon between hours and minutes is optional so "930am" also parses
    const match = s.match(/^(\d{1,2})(?::?(\d{2}))?(am|pm|a|p)?$/i);
    if (!match) return null;
    let hours = parseInt(match[1], 10);
    const minutes = match[2] ? parseInt(match[2], 10) : 0;
    const ampm = (match[3] || '').toLowerCase();
    if (ampm === 'pm' || ampm === 'p') {
        if (hours !== 12) hours += 12;
    } else if (ampm === 'am' || ampm === 'a') {
        if (hours === 12) hours = 0;
    }
    return hours + minutes / 60;
}

function parseStaffScheduleRange(schedStr) {
    if (!schedStr) return [];
    const parts = schedStr.split('/').map(p => p.trim());
    const ranges = [];
    for (const part of parts) {
        const halves = part.split(/\s*-\s*/);
        if (halves.length !== 2) continue;
        let start = parseStaffTime(halves[0]);
        let end = parseStaffTime(halves[1]);
        if (start === null || end === null) continue;
        if (end <= start) end += 24;
        ranges.push({ start, end });
    }
    return ranges;
}

function renderStaff() {
    const total = state.staff.length;
    const allTeams = new Set();
    state.staff.forEach(m => (m.teams || []).forEach(t => allTeams.add(t)));
    const unfilled = state.staff.filter(m => m.isPlaceholder).length;

    const setStat = (id, val) => { const e = document.getElementById(id); if (e) e.textContent = val; };
    setStat('staff-stat-total', total);
    setStat('staff-stat-teams', allTeams.size);
    setStat('staff-stat-unfilled', unfilled);
    updateStaffUnfilledCard();

    const searchQuery = state.staffSearch;
    const isSearching = searchQuery && searchQuery.trim().length > 0;

    const countEl = document.getElementById('staff-search-count');
    const clearBtn = document.getElementById('staff-search-clear');

    if (state.staffView === 'team') {
        renderStaffTeamView(isSearching, searchQuery);
    } else {
        renderStaffGantt();
    }

    const filteredCount = state.staff.filter(m => staffItemMatchesSearch(m, searchQuery)).length;
    if (countEl) {
        countEl.textContent = isSearching ? `${filteredCount} of ${total} staff` : `${total} staff`;
        countEl.style.display = total > 0 ? '' : 'none';
    }
    if (clearBtn) clearBtn.style.display = isSearching ? '' : 'none';
}

function renderStaffTeamView(isSearching, searchQuery) {
    const container = document.getElementById('staff-team-grid');
    if (!container) return;

    const total = state.staff.length;
    if (total === 0) {
        container.innerHTML = '<div class="staff-empty-state">No staff members added yet. Click "+ Add Staff" to get started.</div>';
        return;
    }

    const teamMap = new Map();
    let members = isSearching
        ? state.staff.filter(m => staffItemMatchesSearch(m, searchQuery))
        : state.staff;

    if (state.staffFilter === 'unfilled') {
        members = members.filter(m => m.isPlaceholder);
    }

    if (members.length === 0) {
        if (state.staffFilter === 'unfilled') {
            container.innerHTML = '<div class="staff-empty-state">No unfilled positions — all roles are assigned!</div>';
        } else {
            container.innerHTML = '<div class="staff-empty-state">No staff match "' + escapeHtml(searchQuery) + '"</div>';
        }
        return;
    }

    for (const member of members) {
        const teams = member.teams && member.teams.length > 0 ? member.teams : ['Unassigned'];
        for (const team of teams) {
            if (!teamMap.has(team)) teamMap.set(team, []);
            teamMap.get(team).push(member);
        }
    }

    const teamOrder = [
        'Mainstage Production Team', 'Check In', 'FOH Team', 'Silent Auction',
        'Bathroom/FOH', 'Marketing', 'Talent', 'Power 20 team',
        'Greenroom Team', 'Unassigned'
    ];
    const sortedTeams = [...teamMap.keys()].sort((a, b) => {
        const ai = teamOrder.indexOf(a);
        const bi = teamOrder.indexOf(b);
        if (ai !== -1 && bi !== -1) return ai - bi;
        if (ai !== -1) return -1;
        if (bi !== -1) return 1;
        return a.localeCompare(b);
    });

    let cardIndex = 0;
    const days = ['thursday', 'friday', 'saturday', 'sunday'];
    const dayLabels = ['Thu', 'Fri', 'Sat', 'Sun'];

    container.innerHTML = sortedTeams.map(teamName => {
        const teamMembers = teamMap.get(teamName).sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
        const color = getTeamColor(teamName);

        const cardsHtml = teamMembers.map(member => {
            const idx = cardIndex++;
            const otherTeams = (member.teams || []).filter(t => t !== teamName);
            const badgesHtml = otherTeams.map(t =>
                '<span class="staff-team-badge">+' + escapeHtml(t) + '</span>'
            ).join('');
            const linkedBudget = getLinkedBudget(member);
            const budgetHtml = linkedBudget ? '<span class="staff-budget-badge">$</span>' : '';

            const schedHtml = days.map((day, i) => {
                const val = member.schedule && member.schedule[day];
                const short = formatScheduleShort(val);
                let timeHtml;
                if (!short) {
                    timeHtml = '\u2014';
                } else if (short.includes('-')) {
                    const parts = short.split('-');
                    timeHtml = escapeHtml(parts[0]) + '<br>' + escapeHtml(parts.slice(1).join('-'));
                } else {
                    timeHtml = escapeHtml(short);
                }
                return '<div class="staff-sched-day' + (val ? '' : ' off') + '">' +
                    '<span class="staff-sched-day-label">' + dayLabels[i] + '</span>' +
                    '<span class="staff-sched-day-time">' + timeHtml + '</span>' +
                '</div>';
            }).join('');

            return '<div class="staff-card' + (member.isPlaceholder ? ' placeholder' : '') + '"' +
                ' style="--team-color: ' + color + '; animation-delay: ' + (idx * 30) + 'ms"' +
                ' onclick="openStaffModal(\'' + member.id + '\')">' +
                (budgetHtml ? '<span class="staff-budget-badge staff-budget-corner">' + '$' + '</span>' : '') +
                '<div class="staff-card-name">' + escapeHtml(member.name || '') + '</div>' +
                '<div class="staff-card-role">' + escapeHtml(member.role || '') + '</div>' +
                (badgesHtml ? '<div class="staff-card-badges">' + badgesHtml + '</div>' : '') +
                '<div class="staff-card-schedule">' + schedHtml + '</div>' +
            '</div>';
        }).join('');

        return '<div class="staff-team-section" id="staff-team-' + teamName.replace(/\s+/g, '-').toLowerCase() + '">' +
            '<div class="staff-team-header" onclick="toggleStaffTeam(this)">' +
                '<div>' +
                    '<span class="staff-team-title">' + escapeHtml(teamName) + '</span>' +
                    '<span class="staff-team-count">' + teamMembers.length + '</span>' +
                '</div>' +
                '<span class="staff-team-chevron">\u25BC</span>' +
            '</div>' +
            '<div class="staff-team-cards">' + cardsHtml + '</div>' +
        '</div>';
    }).join('');
}

function toggleStaffTeam(headerEl) {
    headerEl.closest('.staff-team-section').classList.toggle('collapsed');
}
window.toggleStaffTeam = toggleStaffTeam;

function renderStaffGantt() {
    const container = document.getElementById('staff-gantt-container');
    if (!container) return;

    const day = state.staffDay;
    const searchQuery = state.staffSearch;
    const isSearching = searchQuery && searchQuery.trim().length > 0;

    let members = state.staff.filter(m => m.schedule && m.schedule[day]);
    if (isSearching) {
        members = members.filter(m => staffItemMatchesSearch(m, searchQuery));
    }

    const dayCountEl = document.getElementById('staff-day-count');
    if (dayCountEl) {
        dayCountEl.textContent = members.length + ' staff';
    }

    const dayCounts = {};
    for (const d of ['thursday', 'friday', 'saturday', 'sunday']) {
        dayCounts[d] = state.staff.filter(m => m.schedule && m.schedule[d]).length;
    }
    const dayNames = ['Thu', 'Fri', 'Sat', 'Sun'];
    const dayKeys = ['thursday', 'friday', 'saturday', 'sunday'];
    document.querySelectorAll('.staff-day-tab').forEach(tab => {
        const d = tab.dataset.day;
        const idx = dayKeys.indexOf(d);
        if (idx !== -1) tab.textContent = dayNames[idx] + ' (' + dayCounts[d] + ')';
    });

    if (members.length === 0) {
        container.innerHTML = '<div class="staff-empty-state">No staff scheduled for this day</div>';
        return;
    }

    const teamMap = new Map();
    for (const member of members) {
        const teams = member.teams && member.teams.length > 0 ? member.teams : ['Unassigned'];
        const team = teams[0];
        if (!teamMap.has(team)) teamMap.set(team, []);
        teamMap.get(team).push(member);
    }

    const axisStart = 7;
    const axisEnd = 27;
    const axisRange = axisEnd - axisStart;

    const axisLabels = [];
    for (let h = axisStart; h < axisEnd; h++) {
        const displayH = h > 24 ? h - 24 : h;
        const suffix = displayH < 12 || displayH === 24 ? 'a' : 'p';
        const label = displayH === 0 ? '12a' : displayH === 12 ? '12p' : (displayH > 12 ? displayH - 12 : displayH) + suffix;
        axisLabels.push(label);
    }

    const timeAxisHtml = '<div class="staff-gantt-time-axis">' +
        axisLabels.map(l => '<span class="staff-gantt-time-label">' + l + '</span>').join('') +
        '</div>';

    function collapseTeamMembers(teamMembers) {
        const result = [];
        const placeholderGroups = new Map();
        for (const m of teamMembers) {
            if (m.isPlaceholder) {
                const key = m.schedule[day] || '';
                if (placeholderGroups.has(key)) {
                    placeholderGroups.get(key).count++;
                } else {
                    placeholderGroups.set(key, { member: m, count: 1 });
                }
            } else {
                result.push({ member: m, count: 1 });
            }
        }
        for (const { member, count } of placeholderGroups.values()) {
            result.push({ member, count });
        }
        return result;
    }

    const teamOrder = [
        'Mainstage Production Team', 'Check In', 'FOH Team', 'Silent Auction',
        'Bathroom/FOH', 'Marketing', 'Talent', 'Power 20 team',
        'Greenroom Team', 'Unassigned'
    ];
    const sortedTeams = [...teamMap.keys()].sort((a, b) => {
        const ai = teamOrder.indexOf(a);
        const bi = teamOrder.indexOf(b);
        if (ai !== -1 && bi !== -1) return ai - bi;
        if (ai !== -1) return -1;
        if (bi !== -1) return 1;
        return a.localeCompare(b);
    });

    let html = timeAxisHtml;

    for (const teamName of sortedTeams) {
        const color = getTeamColor(teamName);
        const teamMembers = teamMap.get(teamName).sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
        const collapsed = collapseTeamMembers(teamMembers);

        html += '<div class="staff-gantt-team">';
        html += '<div class="staff-gantt-team-header">' + escapeHtml(teamName) + '</div>';

        for (const { member, count } of collapsed) {
            const otherTeams = (member.teams || []).filter(t => t !== teamName);
            const multiTag = otherTeams.length > 0
                ? '<span class="multi-team-tag">+' + escapeHtml(otherTeams[0]) + '</span>' : '';
            const budgetTag = getLinkedBudget(member) ? '<span class="budget-tag">$</span>' : '';
            const nameDisplay = member.isPlaceholder && count > 1
                ? '<span class="placeholder-name">' + escapeHtml(member.name) + ' \u00d7' + count + '</span>'
                : member.isPlaceholder
                ? '<span class="placeholder-name">' + escapeHtml(member.name) + '</span>'
                : escapeHtml(member.name);

            const ranges = parseStaffScheduleRange(member.schedule[day]);
            const barsHtml = ranges.map(r => {
                const left = Math.max(0, (r.start - axisStart) / axisRange * 100);
                const width = Math.min(100 - left, (r.end - r.start) / axisRange * 100);
                const label = formatScheduleShort(member.schedule[day]) || '';
                return '<div class="staff-gantt-bar' + (member.isPlaceholder ? ' placeholder-bar' : '') + '"' +
                    ' style="left:' + left + '%;width:' + width + '%;background:' + color + '"' +
                    ' onclick="openStaffModal(\'' + member.id + '\')"' +
                    ' title="' + escapeHtml(member.name) + ': ' + escapeHtml(member.schedule[day]) + '">' +
                    (ranges.length === 1 ? escapeHtml(label) : '') +
                '</div>';
            }).join('');

            html += '<div class="staff-gantt-row">' +
                '<div class="staff-gantt-name" onclick="openStaffModal(\'' + member.id + '\')">' +
                    nameDisplay + multiTag + budgetTag +
                '</div>' +
                '<div class="staff-gantt-bar-area">' + barsHtml + '</div>' +
            '</div>';
        }

        html += '</div>';
    }

    container.innerHTML = html;
}

let staffModalTeams = [];

function openStaffModal(memberId = null) {
    const modal = document.getElementById('staff-modal');
    const form = document.getElementById('staff-form');
    const title = document.getElementById('staff-modal-title');
    const deleteBtn = document.getElementById('staff-delete-btn');

    form.reset();
    staffModalTeams = [];

    if (memberId) {
        const member = state.staff.find(s => s.id === memberId);
        if (member) {
            title.textContent = 'Edit Staff Member';
            document.getElementById('staff-id').value = member.id;
            document.getElementById('staff-name').value = member.name || '';
            document.getElementById('staff-role').value = member.role || '';
            document.getElementById('staff-phone').value = member.phone || '';
            document.getElementById('staff-email').value = member.email || '';
            document.getElementById('staff-placeholder').checked = member.isPlaceholder || false;
            staffModalTeams = [...(member.teams || [])];

            const sched = member.schedule || {};
            document.getElementById('staff-sched-thursday').value = sched.thursday || '';
            document.getElementById('staff-sched-friday').value = sched.friday || '';
            document.getElementById('staff-sched-saturday').value = sched.saturday || '';
            document.getElementById('staff-sched-sunday').value = sched.sunday || '';

            deleteBtn.style.display = '';
        }
    } else {
        title.textContent = 'Add Staff Member';
        document.getElementById('staff-id').value = '';
        document.getElementById('staff-phone').value = '';
        document.getElementById('staff-email').value = '';
        document.getElementById('staff-sched-thursday').value = '';
        document.getElementById('staff-sched-friday').value = '';
        document.getElementById('staff-sched-saturday').value = '';
        document.getElementById('staff-sched-sunday').value = '';
        deleteBtn.style.display = 'none';
    }

    renderStaffTeamTags();

    // Populate budget link dropdown
    const member = memberId ? state.staff.find(s => s.id === memberId) : null;
    const budgetSelect = document.getElementById('staff-linked-budget');
    const unlinkedBudgets = state.budget.filter(b => !b.linkedStaffId || (member && b.id === member.linkedBudgetId));
    budgetSelect.innerHTML = '<option value="">— None —</option>' +
        unlinkedBudgets.map(b =>
            '<option value="' + b.id + '"' + (member && member.linkedBudgetId === b.id ? ' selected' : '') + '>' +
            escapeHtml(b.vendor || 'Unnamed') + ' (' + formatCurrency(b.budgeted) + ')' +
            '</option>'
        ).join('');

    // Show auto-suggestion if unlinked
    const suggestionDiv = document.getElementById('staff-budget-suggestion');
    const infoPanel = document.getElementById('staff-linked-budget-info');
    if (member && !member.linkedBudgetId) {
        const suggestions = findBudgetSuggestions(member.name);
        if (suggestions.length > 0) {
            suggestionDiv.innerHTML = '<strong>Suggested match:</strong> ' +
                suggestions.map(s =>
                    '<button type="button" class="btn-link-suggest" onclick="document.getElementById(\'staff-linked-budget\').value=\'' + s.id + '\'; this.parentElement.style.display=\'none\';">' +
                    escapeHtml(s.vendor) + ' (' + formatCurrency(s.budgeted) + ')</button>'
                ).join(' ');
            suggestionDiv.style.display = '';
        } else {
            suggestionDiv.style.display = 'none';
        }
    } else {
        suggestionDiv.style.display = 'none';
    }

    // Show linked budget info panel
    if (member && member.linkedBudgetId) {
        const lb = getLinkedBudget(member);
        if (lb) {
            const cat = (lb.category || '').replace(/^6811[a-g] - /, '');
            infoPanel.innerHTML = '<div class="linked-info-summary">' +
                '<strong>' + escapeHtml(lb.vendor) + '</strong> — ' + escapeHtml(cat) +
                (lb.contact ? '<br>Contact: ' + escapeHtml(lb.contact) : '') +
                (lb.phone ? ' | ' + escapeHtml(lb.phone) : '') +
                (lb.email ? ' | ' + escapeHtml(lb.email) : '') +
                '<br><button type="button" class="btn btn-sm" onclick="closeAllModals(); setTimeout(function(){ editBudgetItem(\'' + lb.id + '\'); }, 200);">View Budget Entry</button>' +
                '</div>';
            infoPanel.style.display = '';
        } else {
            infoPanel.style.display = 'none';
        }
    } else {
        infoPanel.style.display = 'none';
    }

    modal.classList.add('active');
}

function renderStaffTeamTags() {
    const container = document.getElementById('staff-teams-tags');
    container.innerHTML = staffModalTeams.map(t =>
        '<span class="staff-team-tag">' + escapeHtml(t) +
        '<span class="staff-team-tag-remove" onclick="removeStaffTeam(\'' + escapeHtml(t).replace(/'/g, "\\'") + '\')">\u00d7</span></span>'
    ).join('');
}

function removeStaffTeam(teamName) {
    staffModalTeams = staffModalTeams.filter(t => t !== teamName);
    renderStaffTeamTags();
}
window.removeStaffTeam = removeStaffTeam;

function setupStaffTeamInput() {
    const input = document.getElementById('staff-team-input');
    const sugBox = document.getElementById('staff-team-suggestions');
    if (!input || !sugBox) return;

    function showTeamSuggestions() {
        const val = input.value.trim().toLowerCase();

        const allTeams = new Set();
        state.staff.forEach(m => (m.teams || []).forEach(t => allTeams.add(t)));

        const matches = [...allTeams].sort()
            .filter(t => (!val || t.toLowerCase().includes(val)) && !staffModalTeams.includes(t));

        let html = '';
        if (matches.length > 0) {
            html = matches.map(t =>
                '<div class="staff-team-suggestion" onclick="addStaffTeam(\'' + escapeHtml(t).replace(/'/g, "\\'") + '\')">' + escapeHtml(t) + '</div>'
            ).join('');
        }
        if (val.length > 1 && !matches.some(t => t.toLowerCase() === val)) {
            html += '<div class="staff-team-suggestion staff-team-suggestion-create" onclick="addStaffTeam(\'' + escapeHtml(input.value.trim()).replace(/'/g, "\\'") + '\')">' +
                '+ Create "' + escapeHtml(input.value.trim()) + '"</div>';
        }
        if (html) {
            sugBox.innerHTML = html;
            sugBox.style.display = 'block';
        } else {
            sugBox.style.display = 'none';
        }
    }

    input.addEventListener('input', showTeamSuggestions);
    input.addEventListener('focus', showTeamSuggestions);

    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            const val = input.value.trim();
            if (val && !staffModalTeams.includes(val)) {
                addStaffTeam(val);
            }
        }
    });

    document.addEventListener('click', (e) => {
        if (!e.target.closest('.staff-teams-input') && !e.target.closest('.staff-team-suggestions')) {
            sugBox.style.display = 'none';
        }
    });
}

function addStaffTeam(teamName) {
    if (!staffModalTeams.includes(teamName)) {
        staffModalTeams.push(teamName);
        renderStaffTeamTags();
    }
    const input = document.getElementById('staff-team-input');
    input.value = '';
    document.getElementById('staff-team-suggestions').style.display = 'none';
}
window.addStaffTeam = addStaffTeam;

async function handleStaffSubmit(e) {
    e.preventDefault();

    // Auto-add any typed-but-uncommitted team name
    const teamInput = document.getElementById('staff-team-input');
    const pendingTeam = teamInput.value.trim();
    if (pendingTeam && !staffModalTeams.includes(pendingTeam)) {
        staffModalTeams.push(pendingTeam);
    }

    const newName = document.getElementById('staff-name').value;
    const newLinkedBudgetId = document.getElementById('staff-linked-budget').value || null;

    const staffData = {
        name: newName,
        role: document.getElementById('staff-role').value,
        phone: document.getElementById('staff-phone').value.trim() || null,
        email: document.getElementById('staff-email').value.trim() || null,
        teams: [...staffModalTeams],
        schedule: {
            thursday: document.getElementById('staff-sched-thursday').value.trim() || null,
            friday: document.getElementById('staff-sched-friday').value.trim() || null,
            saturday: document.getElementById('staff-sched-saturday').value.trim() || null,
            sunday: document.getElementById('staff-sched-sunday').value.trim() || null
        },
        isPlaceholder: document.getElementById('staff-placeholder').checked,
        linkedBudgetId: newLinkedBudgetId,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    };

    const staffId = document.getElementById('staff-id').value;

    try {
        let resolvedStaffId = staffId;
        if (staffId) {
            await collections.staff.doc(staffId).update(staffData);
            showToast('Staff member updated');
        } else {
            staffData.createdAt = firebase.firestore.FieldValue.serverTimestamp();
            staffData.sortOrder = state.staff.length;
            const docRef = await collections.staff.add(staffData);
            resolvedStaffId = docRef.id;
            showToast('Staff member added');
        }

        // Maintain bidirectional link
        const oldMember = state.staff.find(s => s.id === staffId);
        const oldBudgetId = oldMember ? oldMember.linkedBudgetId : null;

        // Clear old budget link if it changed
        if (oldBudgetId && oldBudgetId !== newLinkedBudgetId) {
            await collections.budget.doc(oldBudgetId).update({ linkedStaffId: null });
        }
        // Set new budget link
        if (newLinkedBudgetId) {
            const budgetUpdate = { linkedStaffId: resolvedStaffId };
            // Sync name to budget vendor + contact fields
            if (newName) {
                budgetUpdate.vendor = newName;
                budgetUpdate.contact = newName;
            }
            // Sync contact info to budget (staff edit wins)
            budgetUpdate.phone = staffData.phone;
            budgetUpdate.email = staffData.email;
            await collections.budget.doc(newLinkedBudgetId).update(budgetUpdate);
        }

        closeAllModals();
    } catch (error) {
        console.error('Error saving staff member:', error);
        showToast('Error saving staff member. Please try again.', 'error');
    }
}

const _baseDeleteStaff = createDeleteHandler('staff', 'staff member');
window.deleteStaff = async function(id) {
    const member = state.staff.find(s => s.id === id);
    if (member && member.linkedBudgetId) {
        try { await collections.budget.doc(member.linkedBudgetId).update({ linkedStaffId: null }); } catch (e) { /* budget may be deleted */ }
    }
    return _baseDeleteStaff(id);
};
window.openStaffModal = openStaffModal;

function deleteStaffFromModal() {
    const staffId = document.getElementById('staff-id').value;
    if (staffId) {
        closeAllModals();
        deleteStaff(staffId);
    }
}
window.deleteStaffFromModal = deleteStaffFromModal;

// ==========================================
// PACKING LIST
// ==========================================

// ==================== MENU PAGE ====================

const MENU_CATEGORIES = {
    "Passed Hors d'Oeuvres": [],
    "Seated Dinner": ["Salad", "Main Course", "Dessert"],
    "Late Night Bites": [],
    "Coffee & Tea Station": [],
    "Bar": ["Signature Cocktails", "Alternative Cocktails", "Sponsor Feature", "Wine", "Beer", "Non-Alcoholic"]
};

const MENU_CATEGORY_ORDER = [
    "Passed Hors d'Oeuvres",
    "Seated Dinner",
    "Late Night Bites",
    "Coffee & Tea Station",
    "Bar"
];

const DIETARY_TAGS = [
    { key: 'V', label: 'Vegetarian', color: '#22c55e' },
    { key: 'VG', label: 'Vegan', color: '#15803d' },
    { key: 'GF', label: 'Gluten-Free', color: '#f59e0b' },
    { key: 'DF', label: 'Dairy-Free', color: '#3b82f6' },
    { key: 'NF', label: 'Nut-Free', color: '#ef4444' }
];

const MENU_CATEGORY_COLORS = {
    "Passed Hors d'Oeuvres": '#c9a961',
    "Seated Dinner": '#2d8b75',
    "Late Night Bites": '#f07060',
    "Coffee & Tea Station": '#8b6914',
    "Bar": '#8b2252'
};

const MENU_FIELD_MAP = {
    'menu-name': 'name',
    'menu-description': 'description',
    'menu-category': 'category',
    'menu-subcategory': 'subcategory',
    'menu-serving-style': 'servingStyle',
    'menu-status': 'status',
    'menu-quantity': 'quantity',
    'menu-notes': 'notes'
};

function updateMenuSubcategories() {
    const catSelect = document.getElementById('menu-category');
    const subGroup = document.getElementById('menu-subcategory-group');
    const subSelect = document.getElementById('menu-subcategory');
    if (!catSelect || !subSelect || !subGroup) return;

    const category = catSelect.value;
    const subs = MENU_CATEGORIES[category] || [];

    if (subs.length === 0) {
        subGroup.style.display = 'none';
        subSelect.value = '';
    } else {
        subGroup.style.display = '';
        subSelect.innerHTML = '<option value="">None</option>' +
            subs.map(s => `<option value="${s}">${s}</option>`).join('');
    }
}

function openMenuModal(itemId = null) {
    openModal({
        modalId: 'menu-modal',
        formId: 'menu-form',
        title: 'Menu Item',
        stateKey: 'menuItems',
        itemId: itemId,
        idFieldId: 'menu-id',
        fieldMap: MENU_FIELD_MAP,
        defaultValues: {
            'menu-status': 'pending'
        }
    });

    // Handle dietary tag checkboxes separately
    const checkboxes = document.querySelectorAll('.menu-diet-cb');
    checkboxes.forEach(cb => cb.checked = false);

    if (itemId) {
        const item = state.menuItems.find(i => i.id === itemId);
        if (item && item.dietaryTags) {
            checkboxes.forEach(cb => {
                cb.checked = item.dietaryTags.includes(cb.value);
            });
        }
    }

    updateMenuSubcategories();

    // If editing, restore subcategory after populating options
    if (itemId) {
        const item = state.menuItems.find(i => i.id === itemId);
        if (item && item.subcategory) {
            const subSelect = document.getElementById('menu-subcategory');
            if (subSelect) subSelect.value = item.subcategory;
        }
    }
}

async function handleMenuSubmit(e) {
    e.preventDefault();

    const data = {};
    Object.entries(MENU_FIELD_MAP).forEach(([fieldId, dataKey]) => {
        const element = document.getElementById(fieldId);
        if (element) {
            data[dataKey] = element.value;
        }
    });

    // Parse quantity as number
    data.quantity = parseInt(data.quantity) || 0;

    // Collect dietary tags from checkboxes
    const dietaryTags = [];
    document.querySelectorAll('.menu-diet-cb:checked').forEach(cb => {
        dietaryTags.push(cb.value);
    });
    data.dietaryTags = dietaryTags;

    data.updatedAt = firebase.firestore.FieldValue.serverTimestamp();

    const id = document.getElementById('menu-id').value;

    try {
        if (id) {
            await collections.menuItems.doc(id).update(data);
            showToast('Menu item updated');
        } else {
            data.createdAt = firebase.firestore.FieldValue.serverTimestamp();
            // Set sortOrder for new items
            const catItems = state.menuItems.filter(i => i.category === data.category);
            data.sortOrder = catItems.length;
            await collections.menuItems.add(data);
            showToast('Menu item added');
        }
        closeAllModals();
    } catch (error) {
        console.error('Error saving menu item:', error);
        showToast('Error saving menu item', 'error');
    }
}

const deleteMenuItem = createDeleteHandler('menuItems', 'menu item');

function renderMenu() {
    const container = document.getElementById('menu-container');
    if (!container) return;

    const items = state.menuItems;
    const total = items.length;
    const confirmed = items.filter(i => i.status === 'confirmed').length;
    const pending = items.filter(i => i.status === 'pending' || !i.status).length;

    // Count unique dietary tags present
    const allTags = new Set();
    items.forEach(i => (i.dietaryTags || []).forEach(t => allTags.add(t)));

    // Update stat cards
    const setEl = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
    setEl('menu-stat-total', total);
    setEl('menu-stat-confirmed', confirmed);
    setEl('menu-stat-pending', pending);
    setEl('menu-stat-dietary', allTags.size);

    // Update dietary summary bar
    const summaryBar = document.getElementById('menu-dietary-summary');
    if (summaryBar) {
        const tagCounts = {};
        items.forEach(i => (i.dietaryTags || []).forEach(t => { tagCounts[t] = (tagCounts[t] || 0) + 1; }));
        if (Object.keys(tagCounts).length > 0) {
            summaryBar.innerHTML = DIETARY_TAGS
                .filter(dt => tagCounts[dt.key])
                .map(dt => `<span class="dietary-summary-pill pill-${dt.key.toLowerCase()}">${dt.key}: ${tagCounts[dt.key]}</span>`)
                .join('');
        } else {
            summaryBar.innerHTML = '';
        }
    }

    // Apply search
    let filtered = [...items];
    if (state.menuSearch) {
        const q = state.menuSearch.toLowerCase();
        filtered = filtered.filter(i =>
            (i.name || '').toLowerCase().includes(q) ||
            (i.description || '').toLowerCase().includes(q) ||
            (i.category || '').toLowerCase().includes(q) ||
            (i.subcategory || '').toLowerCase().includes(q) ||
            (i.notes || '').toLowerCase().includes(q) ||
            (i.dietaryTags || []).some(t => t.toLowerCase().includes(q))
        );
    }

    // Apply category filter
    if (state.menuCategoryFilter !== 'all') {
        filtered = filtered.filter(i => i.category === state.menuCategoryFilter);
    }

    // Apply status filter
    if (state.menuStatusFilter !== 'all') {
        filtered = filtered.filter(i => (i.status || 'pending') === state.menuStatusFilter);
    }

    // Update search count
    const searchCount = document.getElementById('menu-search-count');
    if (searchCount) {
        if (state.menuSearch || state.menuCategoryFilter !== 'all' || state.menuStatusFilter !== 'all') {
            searchCount.textContent = `${filtered.length} of ${total} items`;
        } else {
            searchCount.textContent = '';
        }
    }

    if (filtered.length === 0) {
        container.innerHTML = `<p class="empty-state">${total === 0 ? 'No menu items added' : 'No items match your filters'}</p>`;
        return;
    }

    // Group by category
    const grouped = {};
    filtered.forEach(item => {
        const cat = item.category || 'Uncategorized';
        if (!grouped[cat]) grouped[cat] = [];
        grouped[cat].push(item);
    });

    // Sort categories
    const sortedCats = Object.keys(grouped).sort((a, b) => {
        const ai = MENU_CATEGORY_ORDER.indexOf(a);
        const bi = MENU_CATEGORY_ORDER.indexOf(b);
        return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
    });

    const isFullView = state.menuViewMode === 'full';

    let html = '';
    sortedCats.forEach(cat => {
        const catItems = grouped[cat];
        const catConfirmed = catItems.filter(i => i.status === 'confirmed').length;
        const catColor = MENU_CATEGORY_COLORS[cat] || '#888';

        // Group by subcategory within category
        const subcatGrouped = {};
        const noSubcat = [];
        catItems.forEach(item => {
            if (item.subcategory) {
                if (!subcatGrouped[item.subcategory]) subcatGrouped[item.subcategory] = [];
                subcatGrouped[item.subcategory].push(item);
            } else {
                noSubcat.push(item);
            }
        });

        // Sort subcategories by defined order
        const catSubs = MENU_CATEGORIES[cat] || [];
        const sortedSubcats = Object.keys(subcatGrouped).sort((a, b) => {
            const ai = catSubs.indexOf(a);
            const bi = catSubs.indexOf(b);
            return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
        });

        const escapedCat = cat.replace(/'/g, "\\'");

        if (isFullView) {
            html += `<div class="menu-category-section menu-full-view" style="border-left-color: ${catColor}">
                <div class="menu-category-heading" style="color: ${catColor}">
                    <span class="menu-category-name">${cat}</span>
                    <span class="menu-category-count">${catConfirmed}/${catItems.length} confirmed</span>
                </div>`;
        } else {
            html += `<div class="menu-category-section" style="border-left-color: ${catColor}">
                <div class="menu-category-header" onclick="toggleMenuCategory('${escapedCat}')">
                    <div class="menu-category-header-left">
                        <svg class="packing-chevron" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="2 4 6 8 10 4"/></svg>
                        <span class="menu-category-name">${cat}</span>
                        <span class="packing-category-count">${catConfirmed}/${catItems.length} confirmed</span>
                    </div>
                </div>
                <div class="menu-category-body open">`;
        }

        // Render items without subcategory first
        noSubcat.forEach(item => { html += renderMenuItemCard(item, catColor); });

        // Render subcategory groups
        sortedSubcats.forEach(sub => {
            html += `<div class="menu-subcategory-heading">${sub}</div>`;
            subcatGrouped[sub].forEach(item => { html += renderMenuItemCard(item, catColor); });
        });

        if (isFullView) {
            html += `</div>`;
        } else {
            html += `</div></div>`;
        }
    });

    container.innerHTML = html;
}

function renderMenuItemCard(item, catColor) {
    const statusClass = item.status === 'confirmed' ? 'menu-status-confirmed' : 'menu-status-pending';
    const statusLabel = item.status === 'confirmed' ? 'Confirmed' : 'Pending';
    const dietaryPills = (item.dietaryTags || []).map(t =>
        `<span class="dietary-pill pill-${t.toLowerCase()}">${t}</span>`
    ).join('');
    const servingBadge = item.servingStyle ? `<span class="menu-serving-badge">${item.servingStyle}</span>` : '';
    const escapedName = (item.name || 'Unnamed').replace(/"/g, '&quot;');

    return `<div class="menu-item-card">
        <div class="menu-item-main">
            <div class="menu-item-header">
                <span class="menu-item-name">${item.name || 'Unnamed'}</span>
                ${dietaryPills ? `<span class="menu-item-pills">${dietaryPills}</span>` : ''}
            </div>
            ${item.description ? `<div class="menu-item-desc">${item.description}</div>` : ''}
            <div class="menu-item-meta">
                ${servingBadge}
                <span class="menu-status-badge ${statusClass}">${statusLabel}</span>
                ${item.quantity ? `<span class="menu-qty-badge">${item.quantity} servings</span>` : ''}
            </div>
        </div>
        <div class="menu-item-actions">
            <button class="btn-icon-sm" onclick="openMenuModal('${item.id}')" title="Edit">✎</button>
            <button class="btn-icon-sm delete" onclick="deleteMenuItem('${item.id}')" title="Delete">✕</button>
        </div>
    </div>`;
}

function handleMenuSearch(value) {
    state.menuSearch = value;
    const clearBtn = document.getElementById('menu-search-clear');
    if (clearBtn) clearBtn.style.display = value ? 'block' : 'none';
    renderMenu();
}

function clearMenuSearch() {
    state.menuSearch = '';
    const input = document.getElementById('menu-search-input');
    if (input) input.value = '';
    const clearBtn = document.getElementById('menu-search-clear');
    if (clearBtn) clearBtn.style.display = 'none';
    renderMenu();
}

function handleMenuStatusFilter(value) {
    state.menuStatusFilter = value;
    renderMenu();
}

function filterMenuCategory(category) {
    state.menuCategoryFilter = category;
    document.querySelectorAll('.menu-cat-tab').forEach(b =>
        b.classList.toggle('active', b.dataset.cat === category)
    );
    renderMenu();
}

function setMenuView(mode) {
    state.menuViewMode = mode;
    document.querySelectorAll('.menu-view-btn').forEach(b =>
        b.classList.toggle('active', b.dataset.view === mode)
    );
    renderMenu();
}

function toggleMenuCategory(category) {
    const sections = document.querySelectorAll('.menu-category-section');
    sections.forEach(section => {
        const name = section.querySelector('.menu-category-name');
        if (name && name.textContent === category) {
            const body = section.querySelector('.menu-category-body');
            const chevron = section.querySelector('.packing-chevron');
            if (body) body.classList.toggle('open');
            if (chevron) chevron.classList.toggle('collapsed');
        }
    });
}

function toggleMenuPrintMode() {
    const page = document.getElementById('menu');
    const printView = document.getElementById('menu-print-view');
    if (!page || !printView) return;

    page.querySelectorAll('.page-header, .page-search-bar, .menu-view-bar, .stats-grid, .menu-dietary-summary, #menu-container').forEach(el => el.style.display = 'none');
    printView.style.display = 'block';
    renderMenuPrintView();
}

function exitMenuPrintMode() {
    const page = document.getElementById('menu');
    const printView = document.getElementById('menu-print-view');
    if (!page || !printView) return;

    page.querySelectorAll('.page-header, .page-search-bar, .menu-view-bar, .stats-grid, .menu-dietary-summary, #menu-container').forEach(el => el.style.display = '');
    printView.style.display = 'none';
}

function renderMenuPrintView() {
    const printView = document.getElementById('menu-print-view');
    if (!printView) return;

    const items = state.menuItems.filter(i => i.status === 'confirmed');

    // Group by category
    const grouped = {};
    items.forEach(item => {
        const cat = item.category || 'Uncategorized';
        if (!grouped[cat]) grouped[cat] = [];
        grouped[cat].push(item);
    });

    const sortedCats = Object.keys(grouped).sort((a, b) => {
        const ai = MENU_CATEGORY_ORDER.indexOf(a);
        const bi = MENU_CATEGORY_ORDER.indexOf(b);
        return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
    });

    let html = `
        <div class="menu-print-content">
            <button class="menu-print-close" onclick="exitMenuPrintMode()">&times;</button>
            <div class="menu-print-header">
                <h1>YMU 13th Fundraising Gala</h1>
                <div class="menu-print-date">April 25, 2026</div>
                <div class="menu-print-divider"></div>
                <h2>Dinner Menu</h2>
            </div>`;

    sortedCats.forEach(cat => {
        const catItems = grouped[cat];
        html += `<div class="menu-print-category">
            <h3 class="menu-print-cat-title">${cat}</h3>
            <div class="menu-print-rule"></div>`;

        // Group by subcategory
        const subcatGrouped = {};
        const noSubcat = [];
        catItems.forEach(item => {
            if (item.subcategory) {
                if (!subcatGrouped[item.subcategory]) subcatGrouped[item.subcategory] = [];
                subcatGrouped[item.subcategory].push(item);
            } else {
                noSubcat.push(item);
            }
        });

        const catSubs = MENU_CATEGORIES[cat] || [];
        const sortedSubcats = Object.keys(subcatGrouped).sort((a, b) => {
            const ai = catSubs.indexOf(a);
            const bi = catSubs.indexOf(b);
            return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
        });

        noSubcat.forEach(item => {
            const pills = (item.dietaryTags || []).map(t => `<span class="dietary-pill-sm pill-${t.toLowerCase()}">${t}</span>`).join('');
            html += `<div class="menu-print-item">
                <div class="menu-print-item-name">${item.name}${pills ? ' ' + pills : ''}</div>
                ${item.description ? `<div class="menu-print-item-desc">${item.description}</div>` : ''}
            </div>`;
        });

        sortedSubcats.forEach(sub => {
            html += `<div class="menu-print-subcat">${sub}</div>`;
            subcatGrouped[sub].forEach(item => {
                const pills = (item.dietaryTags || []).map(t => `<span class="dietary-pill-sm pill-${t.toLowerCase()}">${t}</span>`).join('');
                html += `<div class="menu-print-item">
                    <div class="menu-print-item-name">${item.name}${pills ? ' ' + pills : ''}</div>
                    ${item.description ? `<div class="menu-print-item-desc">${item.description}</div>` : ''}
                </div>`;
            });
        });

        html += `</div>`;
    });

    html += `</div>`;
    printView.innerHTML = html;
}

// Menu window exports
window.openMenuModal = openMenuModal;
window.deleteMenuItem = deleteMenuItem;
window.handleMenuSearch = handleMenuSearch;
window.clearMenuSearch = clearMenuSearch;
window.handleMenuStatusFilter = handleMenuStatusFilter;
window.filterMenuCategory = filterMenuCategory;
window.setMenuView = setMenuView;
window.updateMenuSubcategories = updateMenuSubcategories;
window.toggleMenuPrintMode = toggleMenuPrintMode;
window.exitMenuPrintMode = exitMenuPrintMode;
window.toggleMenuCategory = toggleMenuCategory;

// ==================== PACKING LIST ====================

const PACKING_CATEGORIES = ['Audio', 'Lighting', 'Decor', 'Signage', 'Catering', 'Printed Materials', 'Misc'];

const PACKING_COLOR_PALETTE = [
    { hex: null,      title: 'None' },
    { hex: '#fff3cd', title: 'Yellow' },
    { hex: '#d4edda', title: 'Green' },
    { hex: '#cce5ff', title: 'Blue' },
    { hex: '#f8d7da', title: 'Red' },
    { hex: '#e2d6f3', title: 'Purple' },
    { hex: '#fde0c8', title: 'Orange' },
    { hex: '#fce4ec', title: 'Pink' },
    { hex: '#d6d6d6', title: 'Gray' }
];

function getPackingCategoryColor(category) {
    const rec = (state.packingCategoryColors || []).find(c => c.id === category);
    return rec && rec.color ? rec.color : null;
}

function renderPackingColorSwatches(onclickFn, extra) {
    return PACKING_COLOR_PALETTE.map(p => {
        const bg = p.hex || '#ffffff';
        const border = p.hex ? '' : 'border:1px dashed #ccc;';
        // Pass empty string for null so onclick gets a plain arg
        const arg = p.hex ? p.hex : '';
        return `<button type="button" class="color-swatch" style="background:${bg};${border}" onclick="event.stopPropagation(); ${onclickFn}('${extra}','${arg}')" title="${p.title}"></button>`;
    }).join('');
}

const PACKING_STATUSES = [
    { value: 'to-pack', label: 'To Pack', next: 'packed' },
    { value: 'packed', label: 'Packed', next: 'loaded' },
    { value: 'loaded', label: 'Loaded', next: 'at-venue' },
    { value: 'at-venue', label: 'At Venue', next: null }
];

function getStatusInfo(statusValue) {
    return PACKING_STATUSES.find(s => s.value === statusValue) || PACKING_STATUSES[0];
}

function renderPackingList() {
    const container = document.getElementById('packing-list-container');
    if (!container) return;

    const items = state.packingList;
    const total = items.length;
    const toPack = items.filter(i => i.status === 'to-pack').length;
    const packed = items.filter(i => i.status === 'packed').length;
    const loaded = items.filter(i => i.status === 'loaded').length;
    const atVenue = items.filter(i => i.status === 'at-venue').length;

    // Update stat cards
    const statTotal = document.getElementById('packing-stat-total');
    const statToPack = document.getElementById('packing-stat-topack');
    const statInProgress = document.getElementById('packing-stat-inprogress');
    const statAtVenue = document.getElementById('packing-stat-atvenue');
    if (statTotal) statTotal.textContent = total;
    if (statToPack) statToPack.textContent = toPack;
    if (statInProgress) statInProgress.textContent = packed + loaded;
    if (statAtVenue) statAtVenue.textContent = atVenue;

    // Update progress bar
    if (total > 0) {
        document.getElementById('progress-to-pack').style.width = ((toPack / total) * 100) + '%';
        document.getElementById('progress-packed').style.width = ((packed / total) * 100) + '%';
        document.getElementById('progress-loaded').style.width = ((loaded / total) * 100) + '%';
        document.getElementById('progress-at-venue').style.width = ((atVenue / total) * 100) + '%';
    } else {
        document.getElementById('progress-to-pack').style.width = '0%';
        document.getElementById('progress-packed').style.width = '0%';
        document.getElementById('progress-loaded').style.width = '0%';
        document.getElementById('progress-at-venue').style.width = '0%';
    }

    // Apply filters
    let filtered = [...items];
    if (state.packingSearch) {
        const q = state.packingSearch.toLowerCase();
        filtered = filtered.filter(i =>
            (i.name || '').toLowerCase().includes(q) ||
            (i.assignee || '').toLowerCase().includes(q) ||
            (i.notes || '').toLowerCase().includes(q)
        );
    }
    if (state.packingCategoryFilter !== 'all') {
        filtered = filtered.filter(i => i.category === state.packingCategoryFilter);
    }
    if (state.packingStatusFilter !== 'all') {
        filtered = filtered.filter(i => i.status === state.packingStatusFilter);
    }

    // Update search count
    const searchCount = document.getElementById('packing-search-count');
    if (searchCount) {
        if (state.packingSearch || state.packingCategoryFilter !== 'all' || state.packingStatusFilter !== 'all') {
            searchCount.textContent = `${filtered.length} of ${total} items`;
        } else {
            searchCount.textContent = '';
        }
    }

    if (filtered.length === 0) {
        container.innerHTML = `<p class="empty-state">${total === 0 ? 'No packing items added' : 'No items match your filters'}</p>`;
        return;
    }

    // Group by category
    const grouped = {};
    filtered.forEach(item => {
        const cat = item.category || 'Misc';
        if (!grouped[cat]) grouped[cat] = [];
        grouped[cat].push(item);
    });

    // Sort categories by PACKING_CATEGORIES order
    const sortedCats = Object.keys(grouped).sort((a, b) => {
        const ai = PACKING_CATEGORIES.indexOf(a);
        const bi = PACKING_CATEGORIES.indexOf(b);
        return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
    });

    let html = '';
    sortedCats.forEach(cat => {
        const catItems = grouped[cat];
        const catAtVenue = catItems.filter(i => i.status === 'at-venue').length;
        const catTotal = catItems.length;
        const catPct = catTotal > 0 ? Math.round((catAtVenue / catTotal) * 100) : 0;
        const allDone = catAtVenue === catTotal;
        const hasAdvanceable = catItems.some(i => getStatusInfo(i.status).next !== null);
        const catColor = getPackingCategoryColor(cat);
        const catSwatches = renderPackingColorSwatches('setPackingCategoryColor', cat);

        html += `
        <div class="packing-category-section" data-category="${cat}">
            <div class="packing-category-header" onclick="togglePackingCategory('${cat}')">
                <div class="packing-category-header-left">
                    <svg class="packing-chevron" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="2 4 6 8 10 4"/></svg>
                    <span class="packing-category-name">${cat}</span>
                    <span class="packing-category-count">${catAtVenue}/${catTotal}</span>
                </div>
                <div class="packing-category-header-right">
                    <div class="color-swatch-wrapper">
                        <button type="button" class="color-swatch-btn packing-cat-swatch" style="background-color:${catColor || '#ffffff'}; ${catColor ? '' : 'border:2px dashed #ccc;'}" onclick="event.stopPropagation(); togglePackingCategoryColorPicker('${cat}')" title="Set color for all ${cat} items"></button>
                        <div class="color-swatch-dropdown" id="pcat-picker-${cat.replace(/\s+/g, '-')}">${catSwatches}</div>
                    </div>
                    <div class="packing-mini-progress">
                        <div class="packing-mini-progress-fill${allDone ? ' complete' : ''}" style="width: ${catPct}%"></div>
                    </div>
                    ${hasAdvanceable ? `<button class="btn btn-sm btn-advance-all" onclick="event.stopPropagation(); bulkAdvanceCategory('${cat}')" title="Advance all items in ${cat}">Advance All</button>` : ''}
                </div>
            </div>
            <div class="packing-category-body open">
                ${catItems.map(item => {
                    const si = getStatusInfo(item.status);
                    const isLast = si.next === null;
                    const itemColor = item.color || null;
                    const borderStyle = itemColor ? `style="border-left-color:${itemColor};"` : '';
                    const itemSwatches = renderPackingColorSwatches('setPackingItemColor', item.id);
                    return `
                    <div class="packing-item-row${isLast ? ' done' : ''}${itemColor ? ' has-color' : ''}" ${borderStyle}>
                        <button class="packing-status-badge status-${item.status}${isLast ? '' : ' advanceable'}" onclick="cyclePackingStatus('${item.id}')" title="${isLast ? 'At Venue' : 'Click to advance to ' + getStatusInfo(item.status).next}">
                            ${si.label}${isLast ? '' : ' ›'}
                        </button>
                        <div class="packing-item-info">
                            <span class="packing-item-name">${item.name || 'Unnamed'}</span>
                            ${item.quantity > 1 ? `<span class="packing-item-qty">×${item.quantity}</span>` : ''}
                        </div>
                        ${item.assignee ? `<span class="packing-item-assignee">${item.assignee}</span>` : ''}
                        ${item.notes ? `<span class="packing-item-notes" title="${item.notes.replace(/"/g, '&quot;')}">📋</span>` : ''}
                        <div class="packing-item-actions">
                            <div class="color-swatch-wrapper">
                                <button type="button" class="color-swatch-btn-sm" style="background-color:${itemColor || '#ffffff'}; ${itemColor ? '' : 'border:1px dashed #ccc;'}" onclick="togglePackingItemColorPicker('${item.id}')" title="Item color"></button>
                                <div class="color-swatch-dropdown" id="pitem-picker-${item.id}">${itemSwatches}</div>
                            </div>
                            <button class="btn-icon-sm" onclick="openPackingModal('${item.id}')" title="Edit">✎</button>
                            <button class="btn-icon-sm delete" onclick="deletePackingItem('${item.id}')" title="Delete">✕</button>
                        </div>
                    </div>`;
                }).join('')}
            </div>
        </div>`;
    });

    container.innerHTML = html;
}

async function cyclePackingStatus(itemId) {
    const item = state.packingList.find(i => i.id === itemId);
    if (!item) return;

    const si = getStatusInfo(item.status);
    if (!si.next) {
        showToast('Already at venue', 'info');
        return;
    }

    try {
        await collections.packingList.doc(itemId).update({
            status: si.next,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        const nextLabel = getStatusInfo(si.next).label;
        showToast(`${item.name} → ${nextLabel}`);
    } catch (error) {
        console.error('Error updating packing status:', error);
        showToast('Error updating status', 'error');
    }
}

async function bulkAdvanceCategory(category) {
    const items = state.packingList.filter(i => i.category === category);
    const advanceable = items.filter(i => getStatusInfo(i.status).next !== null);

    if (advanceable.length === 0) {
        showToast('All items already at venue', 'info');
        return;
    }

    if (!confirm(`Advance ${advanceable.length} item(s) in ${category} to next status?`)) return;

    try {
        const batch = db.batch();
        advanceable.forEach(item => {
            const si = getStatusInfo(item.status);
            batch.update(collections.packingList.doc(item.id), {
                status: si.next,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
        });
        await batch.commit();
        showToast(`Advanced ${advanceable.length} items in ${category}`);
    } catch (error) {
        console.error('Error bulk advancing:', error);
        showToast('Error advancing items', 'error');
    }
}

const PACKING_FIELD_MAP = {
    'packing-name': 'name',
    'packing-category': 'category',
    'packing-quantity': 'quantity',
    'packing-status': 'status',
    'packing-assignee': 'assignee',
    'packing-notes': 'notes'
};

function openPackingModal(itemId = null) {
    openModal({
        modalId: 'packing-modal',
        formId: 'packing-form',
        title: 'Packing Item',
        stateKey: 'packingList',
        itemId: itemId,
        idFieldId: 'packing-id',
        fieldMap: PACKING_FIELD_MAP,
        defaultValues: {
            'packing-status': 'to-pack',
            'packing-quantity': '1'
        }
    });
}

async function handlePackingSubmit(e) {
    await handleFormSubmit(e, {
        collection: 'packingList',
        fieldMap: PACKING_FIELD_MAP,
        idFieldId: 'packing-id',
        itemName: 'packing item',
        numericFields: ['quantity']
    });
}

function handlePackingSearch(value) {
    state.packingSearch = value;
    const clearBtn = document.getElementById('packing-search-clear');
    if (clearBtn) clearBtn.style.display = value ? 'block' : 'none';
    renderPackingList();
}

function clearPackingSearch() {
    state.packingSearch = '';
    const input = document.getElementById('packing-search-input');
    if (input) input.value = '';
    const clearBtn = document.getElementById('packing-search-clear');
    if (clearBtn) clearBtn.style.display = 'none';
    renderPackingList();
}

function handlePackingCategoryFilter(value) {
    state.packingCategoryFilter = value;
    renderPackingList();
}

function handlePackingStatusFilter(value) {
    state.packingStatusFilter = value;
    renderPackingList();
}

function togglePackingCategory(category) {
    const section = document.querySelector(`.packing-category-section[data-category="${category}"]`);
    if (!section) return;
    const body = section.querySelector('.packing-category-body');
    const chevron = section.querySelector('.packing-chevron');
    if (body) body.classList.toggle('open');
    if (chevron) chevron.classList.toggle('collapsed');
}

function closeAllPackingColorPickers(exceptId) {
    document.querySelectorAll('.packing-category-section .color-swatch-dropdown.open').forEach(el => {
        if (el.id !== exceptId) el.classList.remove('open');
    });
}

function togglePackingCategoryColorPicker(category) {
    const id = 'pcat-picker-' + category.replace(/\s+/g, '-');
    const el = document.getElementById(id);
    if (!el) return;
    const willOpen = !el.classList.contains('open');
    closeAllPackingColorPickers(willOpen ? id : null);
    el.classList.toggle('open', willOpen);
}

function togglePackingItemColorPicker(itemId) {
    const id = 'pitem-picker-' + itemId;
    const el = document.getElementById(id);
    if (!el) return;
    const willOpen = !el.classList.contains('open');
    closeAllPackingColorPickers(willOpen ? id : null);
    el.classList.toggle('open', willOpen);
}

async function setPackingCategoryColor(category, hex) {
    const color = hex && hex.length ? hex : null;
    try {
        // Upsert the category color record
        await collections.packingCategoryColors.doc(category).set({
            color,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        // Bulk-overwrite every item in the category
        const items = state.packingList.filter(i => i.category === category);
        if (items.length > 0) {
            const batch = db.batch();
            items.forEach(i => {
                batch.update(collections.packingList.doc(i.id), {
                    color,
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                });
            });
            await batch.commit();
        }
        closeAllPackingColorPickers(null);
        showToast(color ? `Colored ${items.length} ${category} item${items.length === 1 ? '' : 's'}` : `Cleared color on ${category}`);
    } catch (error) {
        console.error('Error setting category color:', error);
        showToast('Error setting color', 'error');
    }
}

async function setPackingItemColor(itemId, hex) {
    const color = hex && hex.length ? hex : null;
    try {
        await collections.packingList.doc(itemId).update({
            color,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        closeAllPackingColorPickers(null);
    } catch (error) {
        console.error('Error setting item color:', error);
        showToast('Error setting color', 'error');
    }
}

// Close packing color pickers when clicking outside any of them
document.addEventListener('click', (e) => {
    if (!e.target.closest('.packing-category-section .color-swatch-wrapper')) {
        closeAllPackingColorPickers(null);
    }
});

window.deletePackingItem = createDeleteHandler('packingList', 'packing item');
window.openPackingModal = openPackingModal;
window.cyclePackingStatus = cyclePackingStatus;
window.bulkAdvanceCategory = bulkAdvanceCategory;
window.handlePackingSearch = handlePackingSearch;
window.clearPackingSearch = clearPackingSearch;
window.handlePackingCategoryFilter = handlePackingCategoryFilter;
window.handlePackingStatusFilter = handlePackingStatusFilter;
window.togglePackingCategory = togglePackingCategory;
window.togglePackingCategoryColorPicker = togglePackingCategoryColorPicker;
window.togglePackingItemColorPicker = togglePackingItemColorPicker;
window.setPackingCategoryColor = setPackingCategoryColor;
window.setPackingItemColor = setPackingItemColor;

// =============================================
// PRINTED MATERIALS FUNCTIONS
// =============================================

const PRINT_FIELD_MAP = {
    'print-name': 'name',
    'print-quantity': 'quantity',
    'print-fileLink': 'fileLink',
    'print-size': 'size',
    'print-material': 'material',
    'print-holder': 'holder',
    'print-vendor': 'vendor',
    'print-notes': 'notes',
    'print-status': 'status'
};

function formatSizeWithUnits(size) {
    if (!size || size === 'TBD') return size || '';
    // Already has units (inches symbol or ft/feet/in)
    if (/["″]/.test(size) || /\b(ft|feet|in)\b/i.test(size)) return size;
    // Replace bare numbers in dimension patterns like "24 x 36" or "8.5x11"
    return size.replace(/(\d+\.?\d*)\s*x\s*(\d+\.?\d*)/g, '$1" x $2"');
}

function renderPrintedMaterials() {
    const tbody = document.getElementById('print-materials-tbody');
    if (!tbody) return;

    const items = state.printedMaterials;
    const total = items.length;
    const awaiting = items.filter(i => i.status === 'awaiting-approval').length;
    const ordered = items.filter(i => i.status === 'ordered').length;
    const done = items.filter(i => i.status === 'received' || i.status === 'done').length;

    // Update stat cards
    const statTotal = document.getElementById('print-stat-total');
    const statAwaiting = document.getElementById('print-stat-awaiting');
    const statOrdered = document.getElementById('print-stat-ordered');
    const statDone = document.getElementById('print-stat-done');
    if (statTotal) statTotal.textContent = total;
    if (statAwaiting) statAwaiting.textContent = awaiting;
    if (statOrdered) statOrdered.textContent = ordered;
    if (statDone) statDone.textContent = done;

    // Populate vendor filter dropdown
    const vendorSelect = document.getElementById('print-vendor-filter');
    if (vendorSelect) {
        const vendors = [...new Set(items.map(i => i.vendor).filter(Boolean))].sort();
        const currentVal = state.printVendorFilter;
        vendorSelect.innerHTML = '<option value="all">All Vendors</option>' +
            vendors.map(v => `<option value="${escapeHtml(v)}"${currentVal === v ? ' selected' : ''}>${escapeHtml(v)}</option>`).join('');
    }

    // Apply filters
    let filtered = [...items];
    if (state.printSearch) {
        const q = state.printSearch.toLowerCase();
        filtered = filtered.filter(i =>
            (i.name || '').toLowerCase().includes(q) ||
            (i.material || '').toLowerCase().includes(q) ||
            (i.vendor || '').toLowerCase().includes(q) ||
            (i.notes || '').toLowerCase().includes(q)
        );
    }
    if (state.printStatusFilter !== 'all') {
        filtered = filtered.filter(i => {
            const s = i.status || 'not-started';
            return s === state.printStatusFilter || (state.printStatusFilter === 'not-started' && s === 'pending');
        });
    }
    if (state.printVendorFilter !== 'all') {
        filtered = filtered.filter(i => (i.vendor || '') === state.printVendorFilter);
    }

    // Apply column visibility classes to table
    const table = document.getElementById('print-materials-table');
    if (table) {
        const cols = state.printColumns;
        ['name','quantity','size','material','holder','vendor','status','link','notes'].forEach(col => {
            table.classList.toggle('hide-pm-' + col, !cols[col]);
        });
    }

    // Update search count
    const searchCount = document.getElementById('print-search-count');
    if (searchCount) {
        const isFiltered = state.printSearch || state.printStatusFilter !== 'all' || state.printVendorFilter !== 'all';
        if (isFiltered) {
            searchCount.textContent = `${filtered.length} of ${total} items`;
        } else {
            searchCount.textContent = '';
        }
    }

    // Sort
    if (state.printSort.field) {
        const { field, direction } = state.printSort;
        filtered.sort((a, b) => {
            let aVal = (a[field] || '').toString().toLowerCase();
            let bVal = (b[field] || '').toString().toLowerCase();
            // Normalize legacy 'pending' to 'not-started' for sorting
            if (field === 'status') {
                if (aVal === 'pending' || !aVal) aVal = 'not-started';
                if (bVal === 'pending' || !bVal) bVal = 'not-started';
            }
            const cmp = aVal.localeCompare(bVal, undefined, { numeric: true });
            return direction === 'asc' ? cmp : -cmp;
        });
    } else {
        // Default sort by sortOrder then name
        filtered.sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0) || (a.name || '').localeCompare(b.name || ''));
    }

    // Update sort indicators
    document.querySelectorAll('.print-materials-table .sort-indicator').forEach(el => el.textContent = '');
    if (state.printSort.field) {
        const indicator = document.getElementById(`print-sort-${state.printSort.field}`);
        if (indicator) indicator.textContent = state.printSort.direction === 'asc' ? ' \u25B2' : ' \u25BC';
    }

    if (filtered.length === 0) {
        tbody.innerHTML = `<tr><td colspan="9" class="empty-state">${total === 0 ? 'No printed materials added' : 'No items match your filters'}</td></tr>`;
        return;
    }

    const statusLabels = { 'not-started': 'Not Started', 'in-progress': 'In Progress', 'awaiting-approval': 'Awaiting Approval', approved: 'Approved', ordered: 'Ordered', received: 'Received', pending: 'Not Started' };
    const statusClasses = { 'not-started': 'print-status-not-started', 'in-progress': 'print-status-in-progress', 'awaiting-approval': 'print-status-awaiting', approved: 'print-status-approved', ordered: 'print-status-ordered', received: 'print-status-received', pending: 'print-status-not-started' };

    tbody.innerHTML = filtered.map(item => {
        const status = item.status === 'pending' ? 'not-started' : (item.status || 'not-started');
        const linkBtn = item.fileLink
            ? `<a href="${escapeHtml(item.fileLink)}" target="_blank" rel="noopener" class="print-link-btn" title="Open file" onclick="event.stopPropagation()">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
               </a>`
            : '<span class="print-no-link">--</span>';
        const notesText = item.notes || '';
        return `<tr onclick="openPrintModal('${item.id}')">
            <td class="print-name-cell pm-col-name">${escapeHtml(item.name || '')}</td>
            <td class="pm-col-quantity">${escapeHtml(item.quantity || '')}</td>
            <td class="pm-col-size">${escapeHtml(formatSizeWithUnits(item.size))}</td>
            <td class="pm-col-material">${escapeHtml(item.material || '')}</td>
            <td class="pm-col-holder">${escapeHtml(item.holder || '')}</td>
            <td class="pm-col-vendor">${escapeHtml(item.vendor || '')}</td>
            <td class="pm-col-status"><span class="print-status-badge ${statusClasses[status]}">${statusLabels[status]}</span></td>
            <td class="print-link-cell pm-col-link">${linkBtn}</td>
            <td class="print-notes-cell pm-col-notes" title="${escapeHtml(notesText)}">${escapeHtml(notesText)}</td>
        </tr>`;
    }).join('');
}

function sortPrintedMaterials(field) {
    if (state.printSort.field === field) {
        state.printSort.direction = state.printSort.direction === 'asc' ? 'desc' : 'asc';
    } else {
        state.printSort.field = field;
        state.printSort.direction = 'asc';
    }
    renderPrintedMaterials();
}

function openPrintModal(itemId = null) {
    openModal({
        modalId: 'print-modal',
        formId: 'print-form',
        title: 'Printed Material',
        stateKey: 'printedMaterials',
        itemId: itemId,
        idFieldId: 'print-id',
        fieldMap: PRINT_FIELD_MAP,
        defaultValues: {
            'print-status': 'not-started',
            'print-quantity': ''
        }
    });

    // Show/hide delete and duplicate buttons
    const deleteBtn = document.getElementById('print-delete-btn');
    if (deleteBtn) {
        deleteBtn.style.display = itemId ? 'inline-flex' : 'none';
        if (itemId) {
            deleteBtn.onclick = () => deletePrintedMaterial(itemId);
        }
    }
    const dupBtn = document.getElementById('print-duplicate-btn');
    if (dupBtn) {
        dupBtn.style.display = itemId ? 'inline-flex' : 'none';
        if (itemId) {
            dupBtn.onclick = () => duplicatePrintedMaterial(itemId);
        }
    }
}

async function handlePrintSubmit(e) {
    const result = await handleFormSubmit(e, {
        collection: 'printedMaterials',
        fieldMap: PRINT_FIELD_MAP,
        idFieldId: 'print-id',
        itemName: 'printed material'
    });
    // For new items, set a sortOrder based on current count
    if (result && result.isNew && result.docId) {
        try {
            await collections.printedMaterials.doc(result.docId).update({
                sortOrder: state.printedMaterials.length
            });
        } catch (e) {
            // Not critical
        }
    }
}

async function deletePrintedMaterial(itemId) {
    const id = itemId || document.getElementById('print-id').value;
    if (!id) return;
    if (confirm('Are you sure you want to delete this printed material?')) {
        try {
            await collections.printedMaterials.doc(id).delete();
            showToast('Printed material deleted');
            closeAllModals();
        } catch (error) {
            console.error('Error deleting printed material:', error);
            showToast('Error deleting printed material', 'error');
        }
    }
}

function handlePrintSearch(value) {
    state.printSearch = value;
    const clearBtn = document.getElementById('print-search-clear');
    if (clearBtn) clearBtn.style.display = value ? 'block' : 'none';
    renderPrintedMaterials();
}

function clearPrintSearch() {
    state.printSearch = '';
    const input = document.getElementById('print-search-input');
    if (input) input.value = '';
    const clearBtn = document.getElementById('print-search-clear');
    if (clearBtn) clearBtn.style.display = 'none';
    renderPrintedMaterials();
}

function handlePrintStatusFilter(value) {
    state.printStatusFilter = value;
    renderPrintedMaterials();
}

function handlePrintVendorFilter(value) {
    state.printVendorFilter = value;
    renderPrintedMaterials();
}

function togglePrintColumn(col, visible) {
    state.printColumns[col] = visible;
    renderPrintedMaterials();
}

function togglePrintColumnsDropdown() {
    const dropdown = document.getElementById('print-columns-dropdown');
    if (dropdown) dropdown.classList.toggle('open');
}

document.addEventListener('click', (e) => {
    const dropdown = document.getElementById('print-columns-dropdown');
    const btn = document.getElementById('print-columns-toggle-btn');
    if (dropdown && btn && !dropdown.contains(e.target) && !btn.contains(e.target)) {
        dropdown.classList.remove('open');
    }
});

function exportPrintedMaterialsToExcel() {
    // Apply same filters as current view
    let items = [...state.printedMaterials];
    if (state.printSearch) {
        const q = state.printSearch.toLowerCase();
        items = items.filter(i =>
            (i.name || '').toLowerCase().includes(q) ||
            (i.material || '').toLowerCase().includes(q) ||
            (i.vendor || '').toLowerCase().includes(q) ||
            (i.notes || '').toLowerCase().includes(q)
        );
    }
    if (state.printStatusFilter !== 'all') {
        items = items.filter(i => {
            const s = i.status || 'not-started';
            return s === state.printStatusFilter || (state.printStatusFilter === 'not-started' && s === 'pending');
        });
    }
    if (state.printVendorFilter !== 'all') {
        items = items.filter(i => (i.vendor || '') === state.printVendorFilter);
    }

    // Build rows with only visible columns
    const cols = state.printColumns;
    const statusLabels = { 'not-started': 'Not Started', 'in-progress': 'In Progress', 'awaiting-approval': 'Awaiting Approval', approved: 'Approved', ordered: 'Ordered', received: 'Received', pending: 'Not Started' };
    const data = items.map(item => {
        const row = {};
        if (cols.name) row['Name'] = item.name || '';
        if (cols.quantity) row['Quantity'] = item.quantity || '';
        if (cols.size) row['Size'] = formatSizeWithUnits(item.size);
        if (cols.material) row['Material'] = item.material || '';
        if (cols.holder) row['Holder'] = item.holder || '';
        if (cols.vendor) row['Vendor'] = item.vendor || '';
        if (cols.status) row['Status'] = statusLabels[item.status] || statusLabels['not-started'];
        if (cols.link) row['File Link'] = item.fileLink || '';
        if (cols.notes) row['Notes'] = item.notes || '';
        return row;
    });

    const ws = XLSX.utils.json_to_sheet(data);
    const widths = [];
    if (cols.name) widths.push({ wch: 30 });
    if (cols.quantity) widths.push({ wch: 8 });
    if (cols.size) widths.push({ wch: 14 });
    if (cols.material) widths.push({ wch: 15 });
    if (cols.holder) widths.push({ wch: 18 });
    if (cols.vendor) widths.push({ wch: 15 });
    if (cols.status) widths.push({ wch: 14 });
    if (cols.link) widths.push({ wch: 35 });
    if (cols.notes) widths.push({ wch: 25 });
    ws['!cols'] = widths;

    const wb = XLSX.utils.book_new();
    const vendorSuffix = state.printVendorFilter !== 'all' ? ' - ' + state.printVendorFilter : '';
    XLSX.utils.book_append_sheet(wb, ws, 'Printed Materials');

    const today = new Date().toISOString().split('T')[0];
    XLSX.writeFile(wb, 'Printed_Materials' + vendorSuffix.replace(/[^a-zA-Z0-9 _-]/g, '') + '_' + today + '.xlsx');
}

async function duplicatePrintedMaterial(itemId) {
    const item = state.printedMaterials.find(i => i.id === itemId);
    if (!item) return;
    const { id, createdAt, updatedAt, sortOrder, ...data } = item;
    data.name = (data.name || '') + ' (Copy)';
    data.status = 'not-started';
    data.createdAt = firebase.firestore.FieldValue.serverTimestamp();
    data.updatedAt = firebase.firestore.FieldValue.serverTimestamp();
    data.sortOrder = state.printedMaterials.length;
    try {
        const docRef = await collections.printedMaterials.add(data);
        closeAllModals();
        showToast('Item duplicated');
        // Open the new copy for editing
        setTimeout(() => openPrintModal(docRef.id), 300);
    } catch (error) {
        console.error('Error duplicating printed material:', error);
        showToast('Error duplicating item', 'error');
    }
}

window.openPrintModal = openPrintModal;
window.deletePrintedMaterial = deletePrintedMaterial;
window.duplicatePrintedMaterial = duplicatePrintedMaterial;
window.handlePrintSearch = handlePrintSearch;
window.clearPrintSearch = clearPrintSearch;
window.handlePrintStatusFilter = handlePrintStatusFilter;
window.sortPrintedMaterials = sortPrintedMaterials;
window.exportPrintedMaterialsToExcel = exportPrintedMaterialsToExcel;
window.handlePrintVendorFilter = handlePrintVendorFilter;
window.togglePrintColumn = togglePrintColumn;
window.togglePrintColumnsDropdown = togglePrintColumnsDropdown;

// =============================================
// DIGITAL ASSETS FUNCTIONS
// =============================================

const DA_FIELD_MAP = {
    'da-name': 'name',
    'da-format': 'format',
    'da-resolution': 'resolution',
    'da-destination': 'destination',
    'da-creator': 'creator',
    'da-duration': 'duration',
    'da-fileLink': 'fileLink',
    'da-notes': 'notes',
    'da-status': 'status'
};

function renderDigitalAssets() {
    const tbody = document.getElementById('da-materials-tbody');
    if (!tbody) return;

    const items = state.digitalAssets;
    const total = items.length;
    const pending = items.filter(i => i.status === 'pending' || i.status === 'not-started' || !i.status).length;
    const ordered = items.filter(i => i.status === 'ordered').length;
    const received = items.filter(i => i.status === 'received').length;
    const done = items.filter(i => i.status === 'done').length;

    const statTotal = document.getElementById('da-stat-total');
    const statPending = document.getElementById('da-stat-pending');
    const statOrdered = document.getElementById('da-stat-ordered');
    const statReceived = document.getElementById('da-stat-received');
    if (statTotal) statTotal.textContent = total;
    if (statPending) statPending.textContent = pending;
    if (statOrdered) statOrdered.textContent = ordered;
    if (statReceived) statReceived.textContent = received + done;

    let filtered = [...items];
    if (state.daSearch) {
        const q = state.daSearch.toLowerCase();
        filtered = filtered.filter(i =>
            (i.name || '').toLowerCase().includes(q) ||
            (i.format || '').toLowerCase().includes(q) ||
            (i.destination || '').toLowerCase().includes(q) ||
            (i.creator || '').toLowerCase().includes(q) ||
            (i.notes || '').toLowerCase().includes(q)
        );
    }
    if (state.daStatusFilter !== 'all') {
        filtered = filtered.filter(i => {
            const s = i.status || 'not-started';
            return s === state.daStatusFilter || (state.daStatusFilter === 'not-started' && s === 'pending');
        });
    }

    const searchCount = document.getElementById('da-search-count');
    if (searchCount) {
        if (state.daSearch || state.daStatusFilter !== 'all') {
            searchCount.textContent = `${filtered.length} of ${total} items`;
        } else {
            searchCount.textContent = '';
        }
    }

    if (state.daSort.field) {
        const { field, direction } = state.daSort;
        filtered.sort((a, b) => {
            const aVal = (a[field] || '').toString().toLowerCase();
            const bVal = (b[field] || '').toString().toLowerCase();
            const cmp = aVal.localeCompare(bVal, undefined, { numeric: true });
            return direction === 'asc' ? cmp : -cmp;
        });
    } else {
        filtered.sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0) || (a.name || '').localeCompare(b.name || ''));
    }

    document.querySelectorAll('#da-materials-table .sort-indicator').forEach(el => el.textContent = '');
    if (state.daSort.field) {
        const indicator = document.getElementById(`da-sort-${state.daSort.field}`);
        if (indicator) indicator.textContent = state.daSort.direction === 'asc' ? ' \u25B2' : ' \u25BC';
    }

    if (filtered.length === 0) {
        tbody.innerHTML = `<tr><td colspan="9" class="empty-state">${total === 0 ? 'No digital assets added' : 'No items match your filters'}</td></tr>`;
        return;
    }

    const statusLabels = { 'not-started': 'Not Started', 'in-progress': 'In Progress', 'awaiting-approval': 'Awaiting Approval', approved: 'Approved', ordered: 'Ordered', received: 'Received', pending: 'Not Started' };
    const statusClasses = { 'not-started': 'print-status-not-started', 'in-progress': 'print-status-in-progress', 'awaiting-approval': 'print-status-awaiting', approved: 'print-status-approved', ordered: 'print-status-ordered', received: 'print-status-received', pending: 'print-status-not-started' };

    tbody.innerHTML = filtered.map(item => {
        const status = item.status === 'pending' ? 'not-started' : (item.status || 'not-started');
        const linkBtn = item.fileLink
            ? `<a href="${escapeHtml(item.fileLink)}" target="_blank" rel="noopener" class="print-link-btn" title="Open file" onclick="event.stopPropagation()">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
               </a>`
            : '<span class="print-no-link">--</span>';
        const notesText = item.notes || '';
        return `<tr onclick="openDAModal('${item.id}')">
            <td class="print-name-cell">${escapeHtml(item.name || '')}</td>
            <td>${escapeHtml(item.format || '')}</td>
            <td>${escapeHtml(item.resolution || '')}</td>
            <td>${escapeHtml(item.destination || '')}</td>
            <td>${escapeHtml(item.creator || '')}</td>
            <td>${escapeHtml(item.duration || '')}</td>
            <td><span class="print-status-badge ${statusClasses[status]}">${statusLabels[status]}</span></td>
            <td class="print-link-cell">${linkBtn}</td>
            <td class="print-notes-cell" title="${escapeHtml(notesText)}">${escapeHtml(notesText)}</td>
        </tr>`;
    }).join('');
}

function sortDigitalAssets(field) {
    if (state.daSort.field === field) {
        state.daSort.direction = state.daSort.direction === 'asc' ? 'desc' : 'asc';
    } else {
        state.daSort.field = field;
        state.daSort.direction = 'asc';
    }
    renderDigitalAssets();
}

function openDAModal(itemId = null) {
    openModal({
        modalId: 'da-modal',
        formId: 'da-form',
        title: 'Digital Asset',
        stateKey: 'digitalAssets',
        itemId: itemId,
        idFieldId: 'da-id',
        fieldMap: DA_FIELD_MAP,
        defaultValues: {
            'da-status': 'not-started'
        }
    });

    const deleteBtn = document.getElementById('da-delete-btn');
    if (deleteBtn) {
        deleteBtn.style.display = itemId ? 'inline-flex' : 'none';
        if (itemId) {
            deleteBtn.onclick = () => deleteDigitalAsset(itemId);
        }
    }
    const dupBtn = document.getElementById('da-duplicate-btn');
    if (dupBtn) {
        dupBtn.style.display = itemId ? 'inline-flex' : 'none';
        if (itemId) {
            dupBtn.onclick = () => duplicateDigitalAsset(itemId);
        }
    }
}

async function handleDASubmit(e) {
    const result = await handleFormSubmit(e, {
        collection: 'digitalAssets',
        fieldMap: DA_FIELD_MAP,
        idFieldId: 'da-id',
        itemName: 'digital asset'
    });
    if (result && result.isNew && result.docId) {
        try {
            await collections.digitalAssets.doc(result.docId).update({
                sortOrder: state.digitalAssets.length
            });
        } catch (e) {
            // Not critical
        }
    }
}

async function deleteDigitalAsset(itemId) {
    const id = itemId || document.getElementById('da-id').value;
    if (!id) return;
    if (confirm('Are you sure you want to delete this digital asset?')) {
        try {
            await collections.digitalAssets.doc(id).delete();
            showToast('Digital asset deleted');
            closeAllModals();
        } catch (error) {
            console.error('Error deleting digital asset:', error);
            showToast('Error deleting digital asset', 'error');
        }
    }
}

function handleDASearch(value) {
    state.daSearch = value;
    const clearBtn = document.getElementById('da-search-clear');
    if (clearBtn) clearBtn.style.display = value ? 'block' : 'none';
    renderDigitalAssets();
}

function clearDASearch() {
    state.daSearch = '';
    const input = document.getElementById('da-search-input');
    if (input) input.value = '';
    const clearBtn = document.getElementById('da-search-clear');
    if (clearBtn) clearBtn.style.display = 'none';
    renderDigitalAssets();
}

function handleDAStatusFilter(value) {
    state.daStatusFilter = value;
    renderDigitalAssets();
}

function exportDigitalAssetsToExcel() {
    const data = state.digitalAssets.map(item => ({
        'Name': item.name || '',
        'Format': item.format || '',
        'Resolution': item.resolution || '',
        'Display/Destination': item.destination || '',
        'Creator': item.creator || '',
        'Duration': item.duration || '',
        'Status': (item.status || 'not-started').charAt(0).toUpperCase() + (item.status || 'not-started').slice(1),
        'File Link': item.fileLink || '',
        'Notes': item.notes || ''
    }));

    const ws = XLSX.utils.json_to_sheet(data);
    ws['!cols'] = [
        { wch: 30 }, { wch: 12 }, { wch: 14 }, { wch: 22 },
        { wch: 18 }, { wch: 12 }, { wch: 14 }, { wch: 35 }, { wch: 25 }
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Digital Assets');

    const today = new Date().toISOString().split('T')[0];
    XLSX.writeFile(wb, 'Digital_Assets_' + today + '.xlsx');
}

async function duplicateDigitalAsset(itemId) {
    const item = state.digitalAssets.find(i => i.id === itemId);
    if (!item) return;
    const { id, createdAt, updatedAt, sortOrder, ...data } = item;
    data.name = (data.name || '') + ' (Copy)';
    data.status = 'not-started';
    data.createdAt = firebase.firestore.FieldValue.serverTimestamp();
    data.updatedAt = firebase.firestore.FieldValue.serverTimestamp();
    data.sortOrder = state.digitalAssets.length;
    try {
        const docRef = await collections.digitalAssets.add(data);
        closeAllModals();
        showToast('Item duplicated');
        setTimeout(() => openDAModal(docRef.id), 300);
    } catch (error) {
        console.error('Error duplicating digital asset:', error);
        showToast('Error duplicating item', 'error');
    }
}

window.openDAModal = openDAModal;
window.deleteDigitalAsset = deleteDigitalAsset;
window.duplicateDigitalAsset = duplicateDigitalAsset;
window.handleDASearch = handleDASearch;
window.clearDASearch = clearDASearch;
window.handleDAStatusFilter = handleDAStatusFilter;
window.sortDigitalAssets = sortDigitalAssets;
window.exportDigitalAssetsToExcel = exportDigitalAssetsToExcel;

// Export Staff to Excel
function exportStaffToExcel() {
    const data = state.staff.map(member => ({
        'Name': member.name || '',
        'Role': member.role || '',
        'Teams': (member.teams || []).join(', '),
        'Thursday': (member.schedule && member.schedule.thursday) || '',
        'Friday': (member.schedule && member.schedule.friday) || '',
        'Saturday': (member.schedule && member.schedule.saturday) || '',
        'Sunday': (member.schedule && member.schedule.sunday) || '',
        'Placeholder': member.isPlaceholder ? 'Yes' : ''
    }));

    const ws = XLSX.utils.json_to_sheet(data);
    ws['!cols'] = [
        { wch: 22 },
        { wch: 28 },
        { wch: 30 },
        { wch: 18 },
        { wch: 18 },
        { wch: 18 },
        { wch: 18 },
        { wch: 10 }
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Staff');

    const today = new Date().toISOString().split('T')[0];
    XLSX.writeFile(wb, 'Staff_List_' + today + '.xlsx');
}

// =============================================
// STAGE PLOTS FUNCTIONS
// =============================================

// Load Stage Plots from Firestore

// Initialize Stage Plots page
function initializeStagePlots() {
    console.log('initializeStagePlots called. Canvas exists:', !!state.canvas);
    if (!state.canvas) {
        setupCanvas();
    }

    // Mobile: make element library collapsible
    if (window.innerWidth <= 768) {
        const lib = document.querySelector('.element-library');
        if (lib && !lib.dataset.mobileInit) {
            lib.dataset.mobileInit = 'true';
            const h3 = lib.querySelector('h3');
            if (h3) {
                h3.addEventListener('click', () => {
                    lib.classList.toggle('mobile-expanded');
                });
            }
        }
    }

    // Restore persisted stage type and plot from localStorage
    const persistedPlotId = localStorage.getItem('stagePlot_currentPlotId');
    const persistedStageType = localStorage.getItem('stagePlot_currentStagePlotType');

    if (persistedStageType) {
        state.currentStagePlotType = persistedStageType;
        // Update tab UI to match
        const tabs = document.querySelectorAll('.sp-tab[data-stage-type]');
        tabs.forEach(tab => {
            tab.classList.toggle('active', tab.dataset.stageType === persistedStageType);
        });
    }

    updatePlotSelector();

    // Check for draft recovery from localStorage
    const draftCanvas = localStorage.getItem('stagePlot_draftCanvas');
    if (draftCanvas) {
        try {
            state.isDraftPlot = true;
            state.currentPlotId = null;
            const draftStageType = localStorage.getItem('stagePlot_draftStageType') || 'main';
            const draftName = localStorage.getItem('stagePlot_draftName') || 'Untitled Plot';
            state.currentStagePlotType = draftStageType;

            // Update tab UI
            const tabs = document.querySelectorAll('.sp-tab[data-stage-type]');
            tabs.forEach(tab => {
                tab.classList.toggle('active', tab.dataset.stageType === draftStageType);
            });

            state.isReceivingRemote = true;
            state.canvas.loadFromJSON(JSON.parse(draftCanvas), () => {
                state.canvas.renderAll();
                drawGrid();
                rebuildStageRectangles();
                sendStageRectsToBack();
                state.isReceivingRemote = false;

                const plotNameInput = document.getElementById('plot-name-input');
                if (plotNameInput) {
                    plotNameInput.value = draftName;
                    plotNameInput.disabled = false;
                }
                updateSaveStatus('Draft recovered - make an edit to save');
                saveCanvasState();
            });

            localStorage.removeItem('stagePlot_draftCanvas');
            localStorage.removeItem('stagePlot_draftStageType');
            localStorage.removeItem('stagePlot_draftName');
            updatePlotSelector();
            return;
        } catch (e) {
            console.error('Error recovering draft:', e);
            localStorage.removeItem('stagePlot_draftCanvas');
            localStorage.removeItem('stagePlot_draftStageType');
            localStorage.removeItem('stagePlot_draftName');
        }
    }

    // If we have a persisted plot ID, wait for Firestore data and load it
    if (persistedPlotId) {
        waitForPlotAndLoad(persistedPlotId);
        return;
    }

    // No persisted plot - wait for Firestore data then create a draft
    let attempts = 0;
    const interval = setInterval(() => {
        attempts++;
        if (state.stagePlots.length > 0 || attempts > 20) {
            clearInterval(interval);
            if (!state.currentPlotId) {
                console.log('No plot selected - creating local draft');
                createDraftPlot();
            }
        }
    }, 100);
}

// Wait for a specific plot to appear in state.stagePlots, then load it
function waitForPlotAndLoad(plotId) {
    if (state.stagePlots.find(p => p.id === plotId)) {
        updatePlotSelector();
        const plotSelect = document.getElementById('plot-select');
        if (plotSelect) plotSelect.value = plotId;
        loadPlot(plotId);
        return;
    }
    let attempts = 0;
    const interval = setInterval(() => {
        attempts++;
        if (state.stagePlots.find(p => p.id === plotId)) {
            clearInterval(interval);
            updatePlotSelector();
            const plotSelect = document.getElementById('plot-select');
            if (plotSelect) plotSelect.value = plotId;
            loadPlot(plotId);
        } else if (attempts > 20) {
            clearInterval(interval);
            localStorage.removeItem('stagePlot_currentPlotId');
            createDraftPlot();
        }
    }, 100);
}

// Setup Fabric.js Canvas
function setupCanvas() {
    console.log('setupCanvas called');
    const canvasElement = document.getElementById('stage-canvas');
    if (!canvasElement) {
        console.log('ERROR: Canvas element not found!');
        return;
    }

    console.log('Canvas element found, initializing Fabric.js canvas');
    console.log('fabric object exists:', typeof fabric !== 'undefined');

    // Calculate responsive canvas size based on available space
    const canvasWrapper = document.querySelector('.canvas-wrapper');
    const maxWidth = canvasWrapper ? canvasWrapper.clientWidth - 80 : 1000; // Subtract padding
    const maxHeight = canvasWrapper ? canvasWrapper.clientHeight - 80 : 700; // Subtract padding

    // Use responsive size, but with reasonable limits
    const canvasWidth = Math.min(maxWidth, 1200);
    const canvasHeight = Math.min(maxHeight, 900);

    console.log('Calculated canvas size:', canvasWidth, 'x', canvasHeight);

    // Initialize Fabric.js canvas with responsive size
    state.canvas = new fabric.Canvas('stage-canvas', {
        width: canvasWidth,
        height: canvasHeight,
        backgroundColor: '#ffffff',
        selection: true
    });

    console.log('Fabric.js canvas created:', !!state.canvas);

    // Draw grid background
    drawGrid();

    // Initialize zoom display
    updateZoomDisplay();

    // Add event listeners for dirty tracking and auto-save
    state.canvas.on('object:modified', (e) => {
        if (state.isReceivingRemote) return;
        const obj = e.target;
        if (obj && !obj.gridLine) {
            trackDirtyObject(obj);
            triggerAutoSave();
        }
    });

    state.canvas.on('object:added', (e) => {
        if (state.isReceivingRemote) return;
        const obj = e.target;
        if (obj && !obj.gridLine) {
            assignObjectId(obj);
            trackDirtyObject(obj);
            triggerAutoSave();
        }
    });

    state.canvas.on('object:removed', (e) => {
        if (state.isReceivingRemote) return;
        const obj = e.target;
        if (obj && !obj.gridLine && obj.objectId) {
            state.deletedObjectIds.add(obj.objectId);
            state.dirtyObjectIds.delete(obj.objectId);
            triggerAutoSave();
        }
    });

    // Add double-click handler for editing element labels and dimension labels
    state.canvas.on('mouse:dblclick', (e) => {
        // Plain text IText objects handle their own editing natively
        if (e.target && e.target.elementType === 'plain-text') {
            return;  // Fabric.js IText enters edit mode automatically on dblclick
        }
        if (e.target && e.target.isStageElement) {
            editElementLabel(e.target);
        } else if (e.target && e.target.isRectDimension) {
            editRectangleDimension(e.target);
        }
    });

    // Alt-click to duplicate objects
    state.canvas.on('mouse:down', (e) => {
        if (e.e.altKey && e.target && !e.target.gridLine && !e.target.isRectDimension) {
            e.e.preventDefault();
            duplicateObject(e.target);
        }
    });

    // Setup undo/redo canvas event listeners
    state.canvas.on('object:added', (e) => {
        if (!state.isUndoRedoing && !state.isReceivingRemote) saveCanvasState();
    });
    state.canvas.on('object:modified', (e) => {
        if (!state.isUndoRedoing && !state.isReceivingRemote) saveCanvasState();
    });
    state.canvas.on('object:removed', (e) => {
        if (!state.isUndoRedoing && !state.isReceivingRemote) saveCanvasState();
    });

    // Properties panel: show/hide on selection
    state.canvas.on('selection:created', (e) => { showPropertiesPanel(e.selected); updateLockButton(e.selected?.[0]); });
    state.canvas.on('selection:updated', (e) => { showPropertiesPanel(e.selected); updateLockButton(e.selected?.[0]); });
    state.canvas.on('selection:cleared', () => { hidePropertiesPanel(); updateLockButton(null); });

    // Track user interaction to prevent canvas resize during mouse operations
    state.canvas.on('mouse:down', () => {
        state.isInteracting = true;
    });
    state.canvas.on('mouse:up', () => {
        state.isInteracting = false;
    });

    // Add window resize handler for responsive canvas
    let resizeTimeout;
    window.addEventListener('resize', () => {
        clearTimeout(resizeTimeout);
        resizeTimeout = setTimeout(() => {
            resizeCanvas();
        }, 250); // Debounce resize events
    });

    // Initialize with draw tool active
    setTool('draw');
}

// Resize Canvas to Fit Viewport
function resizeCanvas() {
    if (!state.canvas) return;

    // Don't resize while user is actively interacting with canvas
    if (state.isInteracting) {
        console.log('Skipping canvas resize - user is interacting');
        return;
    }

    const canvasWrapper = document.querySelector('.canvas-wrapper');
    if (!canvasWrapper) return;

    const maxWidth = canvasWrapper.clientWidth - 80;
    const maxHeight = canvasWrapper.clientHeight - 80;

    const newWidth = Math.min(maxWidth, 1200);
    const newHeight = Math.min(maxHeight, 900);

    // Only resize if dimensions actually changed significantly
    if (Math.abs(state.canvas.width - newWidth) > 50 ||
        Math.abs(state.canvas.height - newHeight) > 50) {

        console.log('Resizing canvas to:', newWidth, 'x', newHeight);

        state.canvas.setDimensions({
            width: newWidth,
            height: newHeight
        });

        // Redraw grid with new size
        drawGrid();
        state.canvas.renderAll();
    }
}

// Draw grid on canvas
function drawGrid() {
    if (!state.canvas) return;

    // Use fixed dimensions for grid scale calculation
    const width = 40;  // Default width in feet
    const height = 30; // Default height in feet

    // Calculate pixels per foot (scale to fit canvas)
    const canvasWidth = state.canvas.width;
    const canvasHeight = state.canvas.height;
    const pixelsPerFoot = Math.min(
        canvasWidth / width,
        canvasHeight / height
    );

    // Clear existing grid lines
    const objects = state.canvas.getObjects();
    objects.forEach(obj => {
        if (obj.gridLine) {
            state.canvas.remove(obj);
        }
    });

    // Account for zoom level - draw more grid lines when zoomed out
    const zoom = state.zoom || 1.0;
    const viewportWidth = canvasWidth / zoom;
    const viewportHeight = canvasHeight / zoom;

    // Calculate how many grid lines we need to cover the visible viewport
    const numVerticalLines = Math.ceil(viewportWidth / pixelsPerFoot) + 2;
    const numHorizontalLines = Math.ceil(viewportHeight / pixelsPerFoot) + 2;

    // Get viewport transform to know where we're viewing
    const vpt = state.canvas.viewportTransform;
    const viewportLeft = -vpt[4] / zoom;
    const viewportTop = -vpt[5] / zoom;

    // Calculate starting grid position (aligned to grid)
    const startX = Math.floor(viewportLeft / pixelsPerFoot) * pixelsPerFoot;
    const startY = Math.floor(viewportTop / pixelsPerFoot) * pixelsPerFoot;

    // Draw vertical grid lines
    for (let i = 0; i <= numVerticalLines; i++) {
        const x = startX + (i * pixelsPerFoot);
        const line = new fabric.Line([
            x, startY,
            x, startY + (numHorizontalLines * pixelsPerFoot)
        ], {
            stroke: '#e0e0e0',
            strokeWidth: 1 / zoom, // Adjust stroke width for zoom
            selectable: false,
            evented: false,
            gridLine: true
        });
        state.canvas.add(line);
        state.canvas.sendToBack(line);
    }

    // Draw horizontal grid lines
    for (let i = 0; i <= numHorizontalLines; i++) {
        const y = startY + (i * pixelsPerFoot);
        const line = new fabric.Line([
            startX, y,
            startX + (numVerticalLines * pixelsPerFoot), y
        ], {
            stroke: '#e0e0e0',
            strokeWidth: 1 / zoom, // Adjust stroke width for zoom
            selectable: false,
            evented: false,
            gridLine: true
        });
        state.canvas.add(line);
        state.canvas.sendToBack(line);
    }

    state.canvas.renderAll();
}

// Setup Stage Plot Tab Switching
function setupStagePlotTabs() {
    const stagePlotTabs = document.querySelectorAll('.sp-tab[data-stage-type]');

    stagePlotTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const stageType = tab.dataset.stageType;

            // Update active state
            stagePlotTabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');

            // Update state
            state.currentStagePlotType = stageType;

            // Detach previous listener
            if (state.plotObjectsUnsubscribe) {
                state.plotObjectsUnsubscribe();
                state.plotObjectsUnsubscribe = null;
            }

            // Reset plot selection and update selector
            state.currentPlotId = null;
            localStorage.removeItem('stagePlot_currentPlotId');
            state.dirtyObjectIds.clear();
            state.deletedObjectIds.clear();
            updatePlotSelector();

            // Clear canvas
            if (state.canvas) {
                state.canvas.clear();
                state.canvas.backgroundColor = '#ffffff';
                drawGrid();
            }
        });
    });
}

// Setup Stage Plot Controls
function setupStagePlotControls() {
    // Plot selector dropdown
    const plotSelect = document.getElementById('plot-select');
    if (plotSelect) {
        plotSelect.addEventListener('change', (e) => {
            const plotId = e.target.value;
            if (plotId) {
                // Discard draft silently when switching to an existing plot
                state.isDraftPlot = false;
                loadPlot(plotId);
            } else {
                // Detach listener
                if (state.plotObjectsUnsubscribe) {
                    state.plotObjectsUnsubscribe();
                    state.plotObjectsUnsubscribe = null;
                }

                // Clear canvas if no plot selected
                if (state.canvas) {
                    deleteStage();  // Clean up stage first
                    state.canvas.clear();
                    state.canvas.backgroundColor = '#ffffff';
                    drawGrid();
                }
                state.currentPlotId = null;
                state.dirtyObjectIds.clear();
                state.deletedObjectIds.clear();

                // Clear and disable plot name input
                const plotNameInput = document.getElementById('plot-name-input');
                if (plotNameInput) {
                    plotNameInput.value = '';
                    plotNameInput.disabled = true;
                }
            }
        });
    }

    // New plot button
    const newPlotBtn = document.getElementById('new-plot-btn');
    if (newPlotBtn) {
        newPlotBtn.addEventListener('click', createDraftPlot);
    }

    // Delete plot button
    const deletePlotBtn = document.getElementById('delete-plot-btn');
    if (deletePlotBtn) {
        deletePlotBtn.addEventListener('click', deletePlot);
    }

    // Duplicate plot button
    const duplicatePlotBtn = document.getElementById('duplicate-plot-btn');
    if (duplicatePlotBtn) {
        duplicatePlotBtn.addEventListener('click', duplicatePlot);
    }

    // Print button
    const printPlotBtn = document.getElementById('print-plot-btn');
    if (printPlotBtn) {
        printPlotBtn.addEventListener('click', printPlot);
    }

    // Element library buttons
    const elementButtons = document.querySelectorAll('.element-btn');
    elementButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const elementType = btn.dataset.element;
            addElementToCanvas(elementType);
        });
    });

    // Tool mode buttons
    const drawToolBtn = document.getElementById('draw-rect-tool-btn');
    const moveToolBtn = document.getElementById('move-tool-btn');

    if (drawToolBtn) {
        console.log('Draw tool button found, adding listener');
        drawToolBtn.addEventListener('click', () => {
            console.log('Draw tool button clicked');
            setTool('draw');
        });
    } else {
        console.log('WARNING: Draw tool button NOT found!');
    }

    if (moveToolBtn) {
        console.log('Move tool button found, adding listener');
        moveToolBtn.addEventListener('click', () => {
            console.log('Move tool button clicked');
            setTool('move');
        });
    } else {
        console.log('WARNING: Move tool button NOT found!');
    }

    // Toggle dimensions button
    const toggleDimsBtn = document.getElementById('toggle-dimensions-btn');
    if (toggleDimsBtn) {
        toggleDimsBtn.addEventListener('click', () => {
            state.dimensionsVisible = !state.dimensionsVisible;
            toggleDimsBtn.classList.toggle('active', state.dimensionsVisible);
            state.stageRectangles.forEach(rectData => {
                rectData.widthLabel.set({ visible: state.dimensionsVisible });
                rectData.heightLabel.set({ visible: state.dimensionsVisible });
            });
            if (state.canvas) state.canvas.renderAll();
        });
    }
}

// Update Plot Selector Dropdown
function updatePlotSelector() {
    const plotSelect = document.getElementById('plot-select');
    if (!plotSelect) return;

    // Filter plots by current stage type
    const filteredPlots = state.stagePlots.filter(
        plot => plot.stageType === state.currentStagePlotType
    );

    // Sort alphabetically by name
    filteredPlots.sort((a, b) => (a.name || '').localeCompare(b.name || ''));

    // Update dropdown
    plotSelect.innerHTML = '<option value="">Select a plot...</option>' +
        filteredPlots.map(plot =>
            `<option value="${plot.id}">${escapeHtml(plot.name)}</option>`
        ).join('');

    // Select current plot if any
    if (state.currentPlotId) {
        plotSelect.value = state.currentPlotId;
    }
}

// Create a local-only draft plot (no Firestore write until first meaningful action)
function createDraftPlot() {
    // Detach any existing plot listener
    if (state.plotObjectsUnsubscribe) {
        state.plotObjectsUnsubscribe();
        state.plotObjectsUnsubscribe = null;
    }

    state.currentPlotId = null;
    localStorage.removeItem('stagePlot_currentPlotId');
    state.isDraftPlot = true;
    state.undoStack = [];
    state.redoStack = [];
    state.dirtyObjectIds.clear();
    state.deletedObjectIds.clear();
    updateUndoRedoButtons();

    // Clear canvas and draw grid
    if (state.canvas) {
        state.canvas.clear();
        state.canvas.backgroundColor = '#ffffff';
        drawGrid();
    }

    // Set up plot name input
    const plotNameInput = document.getElementById('plot-name-input');
    if (plotNameInput) {
        plotNameInput.value = 'Untitled Plot';
        plotNameInput.disabled = false;
        setTimeout(() => {
            plotNameInput.focus();
            plotNameInput.select();
        }, 100);
    }

    // Reset plot selector to "Select a plot..."
    const plotSelect = document.getElementById('plot-select');
    if (plotSelect) {
        plotSelect.value = '';
    }

    updateSaveStatus('Draft (not saved)');
    console.log('Draft plot created locally');
}

// Promote a draft plot to a real Firestore document
async function promoteDraftPlot() {
    if (!state.isDraftPlot) return;

    const plotNameInput = document.getElementById('plot-name-input');
    const plotName = (plotNameInput && plotNameInput.value.trim()) || 'Untitled Plot';

    const plotData = {
        name: plotName,
        stageType: state.currentStagePlotType,
        width: 40,
        height: 30,
        schemaVersion: 2,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    };

    try {
        const docRef = await collections.stagePlots.add(plotData);
        state.currentPlotId = docRef.id;
        state.isDraftPlot = false;
        localStorage.setItem('stagePlot_currentPlotId', docRef.id);
        localStorage.setItem('stagePlot_currentStagePlotType', state.currentStagePlotType);

        // Reload data to update dropdown
        await loadAllData();

        // Select the new plot in dropdown
        const plotSelect = document.getElementById('plot-select');
        if (plotSelect) {
            plotSelect.value = docRef.id;
        }

        // Setup real-time listener
        setupPlotObjectsListener(docRef.id);

        console.log('Draft promoted to Firestore plot:', docRef.id);
        showToast('Plot saved');
    } catch (error) {
        console.error('Error promoting draft plot:', error);
        showToast('Error saving plot. Please try again.', 'error');
    }
}

// Create New Plot
async function createNewPlot() {
    // Create plot with default "Untitled Plot" name
    const plotName = 'Untitled Plot';

    // Use fixed dimensions
    const width = 40;
    const height = 30;

    const plotData = {
        name: plotName,
        stageType: state.currentStagePlotType,
        width: width,
        height: height,
        schemaVersion: 2,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    };

    try {
        const docRef = await collections.stagePlots.add(plotData);
        state.currentPlotId = docRef.id;
        localStorage.setItem('stagePlot_currentPlotId', docRef.id);
        localStorage.setItem('stagePlot_currentStagePlotType', state.currentStagePlotType);

        // Reload all data to update the dropdown
        await loadAllData();

        // Select the new plot in dropdown
        const plotSelect = document.getElementById('plot-select');
        if (plotSelect) {
            plotSelect.value = docRef.id;
        }

        // Update plot name input and focus it for easy renaming
        const plotNameInput = document.getElementById('plot-name-input');
        if (plotNameInput) {
            plotNameInput.value = plotName;
            plotNameInput.disabled = false;
            // Focus and select all text so user can immediately type new name
            setTimeout(() => {
                plotNameInput.focus();
                plotNameInput.select();
            }, 100);
        }

        // Clear canvas and redraw grid
        if (state.canvas) {
            state.canvas.clear();
            state.canvas.backgroundColor = '#ffffff';
            drawGrid();
        }

        // Clear undo/redo stacks for new plot
        state.undoStack = [];
        state.redoStack = [];
        state.dirtyObjectIds.clear();
        state.deletedObjectIds.clear();
        updateUndoRedoButtons();

        // Setup real-time listener for new plot
        setupPlotObjectsListener(docRef.id);

        // Save initial state
        setTimeout(() => {
            saveCanvasState();
        }, 100);

        updateSaveStatus('New plot created');
        showToast('New plot created');
    } catch (error) {
        console.error('Error creating plot:', error);
        showToast('Error creating plot. Please try again.', 'error');
    }
}

// Delete Plot
async function deletePlot() {
    if (!state.currentPlotId) {
        alert('Please select a plot to delete.');
        return;
    }

    const plot = state.stagePlots.find(p => p.id === state.currentPlotId);
    if (!plot) return;

    if (!confirm(`Are you sure you want to delete "${plot.name}"?`)) {
        return;
    }

    try {
        // Detach listener
        if (state.plotObjectsUnsubscribe) {
            state.plotObjectsUnsubscribe();
            state.plotObjectsUnsubscribe = null;
        }

        // Delete subcollection objects
        const objectsSnap = await collections.stagePlots.doc(state.currentPlotId).collection('objects').get();
        const batch = firebase.firestore().batch();
        objectsSnap.docs.forEach(doc => batch.delete(doc.ref));
        await batch.commit();

        await collections.stagePlots.doc(state.currentPlotId).delete();

        // Clear current plot
        state.currentPlotId = null;

        // Clear canvas
        if (state.canvas) {
            state.canvas.clear();
            state.canvas.backgroundColor = '#ffffff';
            drawGrid();
        }

        updateSaveStatus('Deleted');
        showToast('Plot deleted');
    } catch (error) {
        console.error('Error deleting plot:', error);
        showToast('Error deleting plot. Please try again.', 'error');
    }
}

// Duplicate Plot
async function duplicatePlot() {
    if (!state.currentPlotId) {
        alert('Please select a plot to duplicate.');
        return;
    }

    const originalPlot = state.stagePlots.find(p => p.id === state.currentPlotId);
    if (!originalPlot) return;

    const newName = prompt('Enter a name for the duplicated plot:', `${originalPlot.name} (Copy)`);
    if (!newName) return;

    try {
        // Create new plot with same data
        const duplicatedPlotData = {
            name: newName,
            stageType: originalPlot.stageType,
            width: originalPlot.width || 40,
            height: originalPlot.height || 30,
            schemaVersion: 2,
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        };

        const docRef = await collections.stagePlots.add(duplicatedPlotData);

        // Copy subcollection objects from original to new plot
        const objectsSnap = await collections.stagePlots.doc(originalPlot.id).collection('objects').get();
        if (objectsSnap.docs.length > 0) {
            const batch = firebase.firestore().batch();
            objectsSnap.docs.forEach(doc => {
                const newObjRef = collections.stagePlots.doc(docRef.id).collection('objects').doc();
                const data = doc.data();
                data.objectId = newObjRef.id;
                batch.set(newObjRef, data);
            });
            await batch.commit();
        } else if (originalPlot.canvasData) {
            // Old format: copy canvasData for migration on load
            await collections.stagePlots.doc(docRef.id).update({
                canvasData: originalPlot.canvasData,
                schemaVersion: null
            });
        }

        // Load the new duplicated plot
        state.currentPlotId = docRef.id;
        localStorage.setItem('stagePlot_currentPlotId', docRef.id);
        localStorage.setItem('stagePlot_currentStagePlotType', state.currentStagePlotType);

        // Reload all plots to update dropdown
        await loadAllData();

        // Select the new plot in dropdown
        const plotSelect = document.getElementById('plot-select');
        if (plotSelect) {
            plotSelect.value = docRef.id;
        }

        // Load the plot
        loadPlot(docRef.id);

        updateSaveStatus('Duplicated');
        showToast('Plot duplicated');
    } catch (error) {
        console.error('Error duplicating plot:', error);
        showToast('Error duplicating plot. Please try again.', 'error');
    }
}

// Load Plot from Firestore
async function loadPlot(plotId) {
    const plot = state.stagePlots.find(p => p.id === plotId);
    if (!plot) return;

    // Detach previous listener
    if (state.plotObjectsUnsubscribe) {
        state.plotObjectsUnsubscribe();
        state.plotObjectsUnsubscribe = null;
    }

    state.currentPlotId = plotId;
    localStorage.setItem('stagePlot_currentPlotId', plotId);
    localStorage.setItem('stagePlot_currentStagePlotType', state.currentStagePlotType);

    // Clear undo/redo stacks when loading a different plot
    state.undoStack = [];
    state.redoStack = [];
    state.dirtyObjectIds.clear();
    state.deletedObjectIds.clear();
    updateUndoRedoButtons();

    // Update plot name input
    const plotNameInput = document.getElementById('plot-name-input');
    if (plotNameInput) {
        plotNameInput.value = plot.name || '';
        plotNameInput.disabled = false;
    }

    // Clear canvas and delete existing stage
    if (state.canvas) {
        // Disable interactions during load to prevent accidental edits
        state.canvas.selection = false;
        state.canvas.forEachObject(obj => { obj.evented = false; });
        updateSaveStatus('Loading...');

        deleteStage();
        state.canvas.clear();
        state.canvas.backgroundColor = '#ffffff';
        drawGrid();

        if (plot.schemaVersion === 2) {
            // New format: load from subcollection
            await loadPlotFromSubcollection(plotId);
        } else if (plot.canvasData) {
            // Old format: migrate to subcollection
            await migrateOldPlotFormat(plotId, plot.canvasData);
        } else {
            // Empty plot
            setTool('draw');
            setTimeout(() => saveCanvasState(), 100);
        }

        // Re-enable interactions after load
        state.canvas.selection = true;
        state.canvas.forEachObject(obj => { obj.evented = true; });

        // Setup real-time listener
        setupPlotObjectsListener(plotId);
    }

    updateSaveStatus('Loaded');
}

// Load plot objects from Firestore subcollection
async function loadPlotFromSubcollection(plotId) {
    const objectsSnap = await collections.stagePlots.doc(plotId).collection('objects').get();

    if (objectsSnap.empty) {
        setTool('draw');
        setTimeout(() => saveCanvasState(), 100);
        return;
    }

    const fabricObjects = [];
    objectsSnap.docs.forEach(doc => {
        const data = doc.data();
        if (data.fabricData) {
            // Merge custom props back onto the fabric data
            const objData = { ...data.fabricData };
            objData.objectId = data.objectId;
            objData._zIndex = data.zIndex ?? 0;
            if (data.rectId) objData.rectId = data.rectId;
            fabricObjects.push(objData);
        }
    });

    // Sort by zIndex to preserve layer ordering across clients
    fabricObjects.sort((a, b) => a._zIndex - b._zIndex);

    if (fabricObjects.length === 0) {
        setTool('draw');
        setTimeout(() => saveCanvasState(), 100);
        return;
    }

    // Use enlivenObjects to deserialize
    state.isReceivingRemote = true;
    fabric.util.enlivenObjects(fabricObjects, (objects) => {
        objects.forEach(obj => {
            state.canvas.add(obj);
            applyLockState(obj);
        });
        state.canvas.renderAll();
        drawGrid();
        rebuildStageRectangles();
        sendStageRectsToBack();
        setTool('draw');
        state.isReceivingRemote = false;
        setTimeout(() => saveCanvasState(), 100);
    });
}

// Migrate old canvasData blob to per-object subcollection
async function migrateOldPlotFormat(plotId, canvasData) {
    return new Promise((resolve) => {
        state.isReceivingRemote = true;
        state.canvas.loadFromJSON(canvasData, async () => {
            state.canvas.renderAll();
            drawGrid();
            rebuildStageRectangles();
            sendStageRectsToBack();

            // Assign objectIds and batch-write to subcollection
            const objects = state.canvas.getObjects().filter(o => !o.gridLine);
            const batch = firebase.firestore().batch();

            objects.forEach((obj, index) => {
                assignObjectId(obj);
                const objData = obj.toObject(CUSTOM_FABRIC_PROPS);
                const docRef = collections.stagePlots.doc(plotId).collection('objects').doc(obj.objectId);
                batch.set(docRef, {
                    objectId: obj.objectId,
                    fabricType: obj.type,
                    fabricData: objData,
                    rectId: obj.rectId || null,
                    zIndex: index,
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
                    updatedBy: CLIENT_ID
                });
            });

            // Update plot document to mark as migrated
            const plotRef = collections.stagePlots.doc(plotId);
            batch.update(plotRef, {
                schemaVersion: 2,
                canvasData: firebase.firestore.FieldValue.delete()
            });

            await batch.commit();
            console.log(`Migrated plot ${plotId} to schema v2 with ${objects.length} objects`);

            setTool('draw');
            state.isReceivingRemote = false;
            setTimeout(() => saveCanvasState(), 100);
            resolve();
        });
    });
}

// Trigger Auto-Save (debounced)
function triggerAutoSave() {
    // Clear existing timeout
    if (state.autoSaveTimeout) {
        clearTimeout(state.autoSaveTimeout);
    }

    // If this is a draft plot, promote it first then save
    if (state.isDraftPlot) {
        updateSaveStatus('Saving...');
        state.autoSaveTimeout = setTimeout(async () => {
            await promoteDraftPlot();
            savePlot();
        }, 500);
        return;
    }

    // Set new timeout for 500ms
    state.autoSaveTimeout = setTimeout(() => {
        savePlot();
    }, 500);

    updateSaveStatus('Saving...');
}

// Save Plot to Firestore (per-object batch write)
let isSavingPlot = false;

async function savePlot() {
    if (state.isDraftPlot || !state.currentPlotId || !state.canvas) return;
    if (isSavingPlot) return;

    isSavingPlot = true;

    const dirtyIds = new Set(state.dirtyObjectIds);
    const deletedIds = new Set(state.deletedObjectIds);
    state.dirtyObjectIds.clear();
    state.deletedObjectIds.clear();

    if (dirtyIds.size === 0 && deletedIds.size === 0) {
        updateSaveStatus('Saved');
        isSavingPlot = false;
        return;
    }

    try {
        const batch = firebase.firestore().batch();
        const plotRef = collections.stagePlots.doc(state.currentPlotId);

        // Save dirty objects
        const allObjects = state.canvas.getObjects();
        const nonGridObjects = allObjects.filter(o => !o.gridLine);
        dirtyIds.forEach(objectId => {
            const obj = allObjects.find(o => o.objectId === objectId);
            if (obj && !obj.gridLine) {
                const objData = obj.toObject(CUSTOM_FABRIC_PROPS);
                const zIndex = nonGridObjects.indexOf(obj);
                const docRef = plotRef.collection('objects').doc(objectId);
                batch.set(docRef, {
                    objectId: objectId,
                    fabricType: obj.type,
                    fabricData: objData,
                    rectId: obj.rectId || null,
                    zIndex: zIndex,
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
                    updatedBy: CLIENT_ID
                });
            }
        });

        // Delete removed objects
        deletedIds.forEach(objectId => {
            const docRef = plotRef.collection('objects').doc(objectId);
            batch.delete(docRef);
        });

        // Update plot timestamp
        batch.update(plotRef, {
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });

        await batch.commit();
        updateSaveStatus('Saved');
    } catch (error) {
        console.error('Error saving plot:', error);
        // Re-add failed items for retry
        dirtyIds.forEach(id => state.dirtyObjectIds.add(id));
        deletedIds.forEach(id => state.deletedObjectIds.add(id));
        updateSaveStatus('Error saving');
    } finally {
        isSavingPlot = false;
    }
}

// Update Save Status Indicator
function updateSaveStatus(status) {
    const saveStatus = document.getElementById('save-status');
    if (!saveStatus) return;

    saveStatus.textContent = status;
    saveStatus.className = 'sp-save-status';

    if (status === 'Saved' || status === 'Loaded') {
        saveStatus.classList.add('save-status-saved');
    } else if (status === 'Saving...') {
        saveStatus.classList.add('save-status-saving');
    } else if (status === 'Loading...') {
        saveStatus.classList.add('save-status-saving');
    } else if (status && status.includes('Error')) {
        saveStatus.classList.add('save-status-error');
    } else if (status && (status.includes('Draft') || status.includes('draft'))) {
        saveStatus.classList.add('save-status-draft');
    }

    // Auto-clear transient messages after 3 seconds (keep draft/error visible)
    if (status === 'Saved' || status === 'Loaded') {
        setTimeout(() => {
            if (saveStatus.textContent === status) {
                saveStatus.textContent = '';
            }
        }, 3000);
    }
}

// Update Canvas Info - removed (dimension display no longer shown)

// Add Element to Canvas
function addElementToCanvas(elementType) {
    if (!state.canvas) return;

    const element = createStageElement(elementType);
    if (element) {
        // Position in center of canvas
        element.set({
            left: state.canvas.width / 2,
            top: state.canvas.height / 2,
            originX: 'center',
            originY: 'center'
        });

        // If in draw mode, add locked; otherwise add selectable
        if (state.currentTool === 'draw') {
            element.set({ selectable: false, evented: false });
            state.canvas.add(element);
        } else {
            state.canvas.add(element);
            state.canvas.setActiveObject(element);
        }
        sendStageRectsToBack();
    }
}

// Duplicate a canvas object
function duplicateObject(obj) {
    if (!obj || obj.gridLine || obj.isRectDimension) return;
    obj.clone((cloned) => {
        cloned.set({
            left: obj.left + 20,
            top: obj.top + 20,
            objectId: null  // Will get new ID from assignObjectId via object:added event
        });
        // Copy custom properties that clone might miss
        CUSTOM_FABRIC_PROPS.forEach(prop => {
            if (obj[prop] !== undefined && prop !== 'objectId') {
                cloned[prop] = obj[prop];
            }
        });
        cloned.locked = false;  // Duplicates start unlocked
        cloned.lockMovementX = false;
        cloned.lockMovementY = false;
        cloned.lockScalingX = false;
        cloned.lockScalingY = false;
        cloned.lockRotation = false;
        cloned.hasControls = true;
        cloned.borderDashArray = null;
        cloned.borderColor = '#c9a961';
        state.canvas.add(cloned);
        // Defer selection to after Fabric.js finishes its mouse:down selection
        setTimeout(() => {
            state.canvas.setActiveObject(cloned);
            state.canvas.renderAll();
        }, 0);
    }, CUSTOM_FABRIC_PROPS);
}
window.duplicateObject = duplicateObject;

// Create Stage Element (Factory Function) - Using Emojis
function createStageElement(type) {
    // Special case: plain text element (no icon)
    if (type === 'plain-text') {
        const textObj = new fabric.IText('Text', {
            fontSize: 20,
            fontFamily: 'Arial, sans-serif',
            fill: '#2c3e50',
            textAlign: 'center',
            originX: 'center',
            originY: 'center',
            isStageElement: true,
            elementType: 'plain-text',
            cornerStyle: 'circle',
            transparentCorners: false,
            cornerColor: '#c9a961',
            cornerStrokeColor: '#000',
            borderColor: '#c9a961',
            editable: true
        });
        return textObj;
    }

    const elementDefinitions = {
        // Audio
        'drum-kit': { emoji: '🥁', label: 'Drums' },
        'mic-stand': { emoji: '🎤', label: 'Mic' },
        'floor-monitor': { emoji: '🔊', label: 'Monitor' },
        'di-box': { emoji: '📦', label: 'DI' },
        'speaker-cab': { emoji: '🔈', label: 'Speaker' },

        // Instruments
        'keyboard-88': { emoji: '🎹', label: 'Piano' },
        'keyboard-61': { emoji: '🎹', label: 'Keyboard' },
        'pedalboard': { emoji: '🎛️', label: 'Pedalboard' },
        'guitar': { emoji: '🎸', label: 'Guitar' },
        'bass': { emoji: '🎸', label: 'Bass' },
        'guitar-amp': { emoji: '🔊', label: 'Guitar Amp' },
        'bass-amp': { emoji: '🔊', label: 'Bass Amp' },
        'music-stand': { emoji: '🎵', label: 'Stand' },

        // Furniture
        'table-round': { emoji: '⭕', label: 'Table' },
        'table-rect': { emoji: '🟫', label: 'Table' },
        'table': { emoji: '🟫', label: 'Table' },
        'chair': { emoji: '💺', label: 'Chair' },
        'stool': { emoji: '💺', label: 'Stool' },
        'podium': { emoji: '🗣️', label: 'Podium' },

        // Stage
        'riser': { emoji: '🔲', label: 'Riser' },
        'stage-riser': { emoji: '🔲', label: 'Riser' },
        'stairs': { emoji: '🪜', label: 'Stairs' },
        'backdrop': { emoji: '🎬', label: 'Backdrop' },

        // Technical
        'pa-speaker': { emoji: '📢', label: 'PA' },
        'spotlight': { emoji: '💡', label: 'Light' },
        'camera': { emoji: '📹', label: 'Camera' },
        'projection-screen': { emoji: '🖥️', label: 'Screen' },
        'mixer': { emoji: '🎚️', label: 'Mixer' },
        'mixer-console': { emoji: '🎚️', label: 'Mixer' },

        // Markers
        'performer': { emoji: '🧍', label: 'Person' },
        'text-label': { emoji: '📝', label: 'Label' },
        'rectangle': { emoji: '▭', label: 'Rectangle' },
        'arrow-marker': { emoji: '➡️', label: 'Arrow' },
        'x-marker': { emoji: '❌', label: 'X' },
        'star-marker': { emoji: '⭐', label: 'Star' }
    };

    const def = elementDefinitions[type];
    if (!def) return null;

    // Create emoji text with larger size and comprehensive font fallbacks
    const emojiText = new fabric.Text(def.emoji, {
        fontSize: 50,
        fontFamily: '"Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", "Android Emoji", "EmojiSymbols", Arial, sans-serif',
        fill: '#000000',
        textAlign: 'center',
        originX: 'center',
        originY: 'center'
    });

    // Create label text with background for better readability
    const labelText = new fabric.Text(def.label, {
        fontSize: 13,
        fontFamily: 'Arial, sans-serif',
        fontWeight: 'bold',
        fill: '#2c3e50',
        textAlign: 'center',
        backgroundColor: 'rgba(255, 255, 255, 0.9)',
        padding: 4,
        top: 45,  // Increased spacing to prevent overlap
        originX: 'center',
        originY: 'center'
    });

    // Group emoji and label together
    const group = new fabric.Group([emojiText, labelText], {
        left: 0,
        top: 0,
        lockScalingFlip: true,
        hasRotatingPoint: true,
        cornerStyle: 'circle',
        transparentCorners: false,
        cornerColor: '#c9a961',
        cornerStrokeColor: '#000',
        borderColor: '#c9a961',
        isStageElement: true,  // Mark as editable element
        elementType: type  // Store element type
    });

    return group;
}

// Setup Zoom Controls
function setupZoomControls() {
    const zoomInBtn = document.getElementById('zoom-in-btn');
    const zoomOutBtn = document.getElementById('zoom-out-btn');
    const fitScreenBtn = document.getElementById('fit-screen-btn');

    if (!zoomInBtn || !zoomOutBtn || !fitScreenBtn) return;

    // Zoom In
    zoomInBtn.addEventListener('click', () => {
        zoomCanvas(1.2); // Zoom in by 20%
    });

    // Zoom Out
    zoomOutBtn.addEventListener('click', () => {
        zoomCanvas(0.8); // Zoom out by 20%
    });

    // Fit to Screen
    fitScreenBtn.addEventListener('click', () => {
        fitCanvasToScreen();
    });

    // Mouse wheel zoom (hold Ctrl/Cmd to zoom)
    if (state.canvas) {
        state.canvas.on('mouse:wheel', (opt) => {
            const e = opt.e;

            // Only zoom if Ctrl (Windows/Linux) or Cmd (Mac) is pressed
            if (e.ctrlKey || e.metaKey) {
                e.preventDefault();
                e.stopPropagation();

                const delta = e.deltaY;
                let zoom = state.canvas.getZoom();

                // Zoom in or out based on scroll direction
                zoom *= 0.999 ** delta;

                // Limit zoom range
                if (zoom > 5) zoom = 5;
                if (zoom < 0.1) zoom = 0.1;

                // Zoom towards mouse pointer
                const point = new fabric.Point(opt.e.offsetX, opt.e.offsetY);
                state.canvas.zoomToPoint(point, zoom);

                state.zoom = zoom;
                updateZoomDisplay();
                drawGrid(); // Redraw grid for new zoom level
            }
        });

        // Pan/drag canvas when zoomed in (using Space + drag or middle mouse button)
        state.canvas.on('mouse:down', (opt) => {
            const e = opt.e;

            // Enable panning with Space key or middle mouse button
            if (e.button === 1 || e.code === 'Space' || state.zoom > 1) {
                state.isPanning = true;
                state.panStart = { x: e.clientX, y: e.clientY };
                state.canvas.selection = false; // Disable selection while panning
            }
        });

        state.canvas.on('mouse:move', (opt) => {
            if (state.isPanning && state.panStart) {
                const e = opt.e;
                const vpt = state.canvas.viewportTransform;

                vpt[4] += e.clientX - state.panStart.x;
                vpt[5] += e.clientY - state.panStart.y;

                state.canvas.requestRenderAll();
                state.panStart = { x: e.clientX, y: e.clientY };
            }
        });

        state.canvas.on('mouse:up', () => {
            if (state.isPanning) {
                drawGrid(); // Redraw grid after panning
            }
            state.isPanning = false;
            state.panStart = null;
            state.canvas.selection = true; // Re-enable selection
        });
    }
}

// Zoom Canvas
function zoomCanvas(factor) {
    if (!state.canvas) return;

    let zoom = state.canvas.getZoom();
    zoom *= factor;

    // Limit zoom range
    if (zoom > 5) zoom = 5;
    if (zoom < 0.1) zoom = 0.1;

    // Zoom to center of canvas
    const center = state.canvas.getCenter();
    state.canvas.zoomToPoint(new fabric.Point(center.left, center.top), zoom);

    state.zoom = zoom;
    updateZoomDisplay();
    drawGrid(); // Redraw grid for new zoom level
}

// Fit Canvas to Screen
function fitCanvasToScreen() {
    if (!state.canvas) return;

    // Reset zoom to 1.0 and center viewport
    state.canvas.setViewportTransform([1, 0, 0, 1, 0, 0]);
    state.zoom = 1.0;
    updateZoomDisplay();
    drawGrid(); // Redraw grid for reset zoom
    state.canvas.renderAll();
}

// Update Zoom Level Display
function updateZoomDisplay() {
    const zoomDisplay = document.getElementById('zoom-level');
    if (zoomDisplay) {
        const percentage = Math.round(state.zoom * 100);
        zoomDisplay.textContent = `${percentage}%`;
    }
}

// Undo/Redo Functionality
function saveCanvasState() {
    if (state.isUndoRedoing || state.isReceivingRemote || !state.canvas || !state.currentPlotId) return;

    const canvasState = state.canvas.toJSON(CUSTOM_FABRIC_PROPS);
    state.undoStack.push(JSON.stringify(canvasState));

    // Limit history to 30 states
    if (state.undoStack.length > 30) {
        state.undoStack.shift();
    }

    // Clear redo stack when new action is performed
    state.redoStack = [];
    updateUndoRedoButtons();
}

function undo() {
    if (state.undoStack.length === 0 || !state.canvas) return;

    // Save current state to redo stack
    const currentState = state.canvas.toJSON(CUSTOM_FABRIC_PROPS);
    state.redoStack.push(JSON.stringify(currentState));

    // Restore previous state
    const previousState = state.undoStack.pop();
    state.isUndoRedoing = true;

    state.canvas.loadFromJSON(previousState, () => {
        state.canvas.renderAll();
        drawGrid(); // Redraw grid
        rebuildStageRectangles();
        state.isUndoRedoing = false;
        updateUndoRedoButtons();
        syncAfterUndoRedo();
    });
}

function redo() {
    if (state.redoStack.length === 0 || !state.canvas) return;

    // Save current state to undo stack
    const currentState = state.canvas.toJSON(CUSTOM_FABRIC_PROPS);
    state.undoStack.push(JSON.stringify(currentState));

    // Restore next state
    const nextState = state.redoStack.pop();
    state.isUndoRedoing = true;

    state.canvas.loadFromJSON(nextState, () => {
        state.canvas.renderAll();
        drawGrid(); // Redraw grid
        rebuildStageRectangles();
        state.isUndoRedoing = false;
        updateUndoRedoButtons();
        syncAfterUndoRedo();
    });
}

function updateUndoRedoButtons() {
    const undoBtn = document.getElementById('undo-btn');
    const redoBtn = document.getElementById('redo-btn');

    if (undoBtn) {
        undoBtn.disabled = state.undoStack.length === 0;
    }
    if (redoBtn) {
        redoBtn.disabled = state.redoStack.length === 0;
    }
}

function setupUndoRedo() {
    const undoBtn = document.getElementById('undo-btn');
    const redoBtn = document.getElementById('redo-btn');

    if (undoBtn) {
        undoBtn.addEventListener('click', undo);
    }
    if (redoBtn) {
        redoBtn.addEventListener('click', redo);
    }

    // Canvas event listeners are set up in canvas initialization
    // so they're attached when canvas is actually created
}

// Setup Keyboard Shortcuts (Delete key)
function setupKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
        // Focus budget search with '/' key
        if (e.key === '/' && e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA' && state.currentPage === 'budget') {
            e.preventDefault();
            const searchInput = document.getElementById('budget-search-input');
            if (searchInput) searchInput.focus();
        }

        // Timeline: N to focus phantom row, Ctrl/Cmd+Z for undo
        if (state.currentPage === 'timeline' && e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA' && e.target.tagName !== 'SELECT') {
            if (e.key === 'n' || e.key === 'N') {
                e.preventDefault();
                const phantom = document.querySelector('.tl-phantom-row');
                if (phantom) {
                    const firstCell = phantom.querySelector(`td[data-field="${TIMELINE_FIELD_ORDER[0]}"]`);
                    if (firstCell) editTimelineCell(firstCell);
                }
                return;
            }
            if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
                e.preventDefault();
                undoTimelineAction();
                return;
            }
        }

        // Undo: Ctrl+Z or Cmd+Z (stage plots)
        if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
            if (e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA') {
                e.preventDefault();
                undo();
            }
        }

        // Redo: Ctrl+Shift+Z or Cmd+Shift+Z
        if ((e.ctrlKey || e.metaKey) && e.key === 'z' && e.shiftKey) {
            if (e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA') {
                e.preventDefault();
                redo();
            }
        }

        // Delete or Backspace key
        if ((e.key === 'Delete' || e.key === 'Backspace') && state.canvas) {
            // Prevent default backspace behavior (going back in browser)
            if (e.key === 'Backspace' && e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA') {
                e.preventDefault();
            }

            // Only delete if we're not in an input field
            if (e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA') {
                const activeObjects = state.canvas.getActiveObjects();
                const deletableObjects = activeObjects.filter(obj => !obj.locked);
                const lockedCount = activeObjects.length - deletableObjects.length;
                if (deletableObjects.length > 0) {
                    deletableObjects.forEach(obj => {
                        // If this is a stage rectangle, also remove its dimension labels
                        if (obj.rectId) {
                            const rectDataIndex = state.stageRectangles.findIndex(r => r.id === obj.rectId);
                            if (rectDataIndex !== -1) {
                                const rectData = state.stageRectangles[rectDataIndex];
                                state.canvas.remove(rectData.widthLabel);
                                state.canvas.remove(rectData.heightLabel);
                                state.canvas.remove(rectData.rect);
                                state.stageRectangles.splice(rectDataIndex, 1);
                            }
                        }
                        state.canvas.remove(obj);
                    });
                    state.canvas.discardActiveObject();
                    state.canvas.renderAll();
                    triggerAutoSave();
                }
                if (lockedCount > 0) {
                    showToast('Locked objects cannot be deleted', 'warning');
                }
            }
        }

        // Duplicate with Cmd+D or Ctrl+D
        if ((e.ctrlKey || e.metaKey) && e.key === 'd') {
            e.preventDefault();
            if (state.canvas && state.currentPage === 'stage-plots') {
                const active = state.canvas.getActiveObject();
                if (active && !active.gridLine) {
                    duplicateObject(active);
                }
            }
        }

        // Escape key - cancel drawing mode
        if (e.key === 'Escape' && state.isDrawingStage) {
            cancelDrawingMode();
        }

        // Enter key - finish drawing
        if (e.key === 'Enter' && state.isDrawingStage) {
            finishDrawingStage();
        }
    });
}

// =============================================
// RECTANGLE-BASED STAGE DRAWING SYSTEM
// =============================================

// Toggle Drawing Mode (Rectangle-based)
function toggleDrawingMode() {
    console.log('toggleDrawingMode called, canvas exists:', !!state.canvas);
    if (!state.canvas) return;

    state.isDrawingStage = !state.isDrawingStage;
    console.log('isDrawingStage set to:', state.isDrawingStage);

    const drawBtn = document.getElementById('draw-stage-btn');
    const finishBtn = document.getElementById('finish-drawing-btn');

    if (state.isDrawingStage) {
        // Enter rectangle drawing mode
        drawBtn.style.display = 'none';
        finishBtn.style.display = 'inline-block';

        // Show tool mode toggle
        const toolModeContainer = document.getElementById('tool-mode-container');
        if (toolModeContainer) {
            toolModeContainer.style.display = 'flex';
        }

        // Disable selection of existing elements
        state.canvas.selection = false;
        state.canvas.forEachObject(obj => {
            if (!obj.gridLine && !obj.isRectDimension) {
                obj.selectable = false;
            }
        });

        // Set initial tool to draw
        console.log('About to call setTool(draw)');
        setTool('draw');
    } else {
        cancelDrawingMode();
    }
}

// Set Tool Mode (Draw or Move)
function setTool(tool) {
    console.log('setTool called with:', tool);
    state.currentTool = tool;

    // Update button active states
    const drawBtn = document.getElementById('draw-rect-tool-btn');
    const moveBtn = document.getElementById('move-tool-btn');

    if (drawBtn && moveBtn) {
        drawBtn.classList.remove('active');
        moveBtn.classList.remove('active');

        if (tool === 'draw') {
            drawBtn.classList.add('active');
        } else {
            moveBtn.classList.add('active');
        }
    }

    // Remove all existing tool handlers
    state.canvas.off('mouse:down', startDrawingRectangle);
    state.canvas.off('mouse:move', continueDrawingRectangle);
    state.canvas.off('mouse:up', finishDrawingRectangle);

    // Make all stage rectangles non-selectable first
    state.stageRectangles.forEach(rectData => {
        rectData.rect.set({ selectable: false, evented: false });
        rectData.widthLabel.set({ selectable: false, evented: false });
        rectData.heightLabel.set({ selectable: false, evented: false });
    });

    if (tool === 'draw') {
        // Drawing mode: click and drag creates rectangles, nothing is movable
        state.canvas.on('mouse:down', startDrawingRectangle);
        state.canvas.on('mouse:move', continueDrawingRectangle);
        state.canvas.on('mouse:up', finishDrawingRectangle);

        // Lock all non-grid, non-stage objects so they can't be moved
        state.canvas.getObjects().forEach(obj => {
            if (!obj.gridLine && !obj.rectId) {
                obj.set({ selectable: false, evented: false });
            }
        });
        state.canvas.selection = false;
        state.canvas.discardActiveObject();
    } else if (tool === 'move') {
        // Move mode: everything is movable, no drawing
        state.stageRectangles.forEach((rectData, index) => {
            rectData.rect.set({
                selectable: true,
                evented: true,
                hasControls: false,
                hasBorders: true,
                borderColor: '#c9a961',
                lockRotation: true
            });

            // CRITICAL: Update the object's bounding box for hit detection
            rectData.rect.setCoords();

            // Add moving event handler for snap-to-align
            rectData.rect.on('moving', function(e) {
                snapRectangleToAlign(rectData);
                updateRectangleDimensions(rectData);
            });

            // Make dimension labels selectable for editing
            rectData.widthLabel.set({ selectable: true, evented: true });
            rectData.heightLabel.set({ selectable: true, evented: true });
        });

        // Unlock all non-grid objects so they can be moved
        state.canvas.getObjects().forEach(obj => {
            if (!obj.gridLine) {
                obj.set({ selectable: true, evented: true });
                obj.setCoords();
            }
        });
        state.canvas.selection = true;
    }

    state.canvas.renderAll();
}

// Rebuild stageRectangles array from current canvas objects (after loadFromJSON)
function rebuildStageRectangles() {
    if (!state.canvas) return;
    const rectMap = new Map();

    state.canvas.getObjects().forEach(obj => {
        if (obj.rectId) {
            if (!rectMap.has(obj.rectId)) {
                rectMap.set(obj.rectId, { id: obj.rectId });
            }
            const rectData = rectMap.get(obj.rectId);
            if (obj.type === 'rect' && !obj.isRectDimension) {
                rectData.rect = obj;
            } else if (obj.isRectDimension) {
                if (obj.dimensionType === 'width') rectData.widthLabel = obj;
                else if (obj.dimensionType === 'height') rectData.heightLabel = obj;
            }
        }
    });

    state.stageRectangles = Array.from(rectMap.values()).filter(
        r => r.rect && r.widthLabel && r.heightLabel
    );

    state.stageRectangles.forEach(rectData => {
        rectData.widthLabel.set({ evented: true, hoverCursor: 'pointer', visible: state.dimensionsVisible });
        rectData.heightLabel.set({ evented: true, hoverCursor: 'pointer', visible: state.dimensionsVisible });
        if (rectData.rect.locked) {
            applyLockState(rectData.rect);
        }
    });
}

// Ensure stage rectangles and their labels stay behind all other elements (but above grid)
function sendStageRectsToBack() {
    if (!state.canvas) return;
    state.stageRectangles.forEach(rectData => {
        state.canvas.sendToBack(rectData.heightLabel);
        state.canvas.sendToBack(rectData.widthLabel);
        state.canvas.sendToBack(rectData.rect);
    });
    // Grid lines should be at the very back
    state.canvas.getObjects().forEach(obj => {
        if (obj.gridLine) state.canvas.sendToBack(obj);
    });
    state.canvas.renderAll();
    // Mark all non-grid objects dirty so updated zIndex gets saved
    if (!state.isReceivingRemote) {
        state.canvas.getObjects().forEach(obj => {
            if (!obj.gridLine && obj.objectId) {
                state.dirtyObjectIds.add(obj.objectId);
            }
        });
    }
}

// Start Drawing a Rectangle
function startDrawingRectangle(e) {
    if (state.currentTool !== 'draw' || state.currentDrawingRect) {
        return;
    }

    const pointer = state.canvas.getPointer(e.e);
    state.drawingStartPoint = { x: pointer.x, y: pointer.y };

    // Get pixels per foot for live dimension display
    const width = 40;
    const height = 30;
    const canvasWidth = state.canvas.width;
    const canvasHeight = state.canvas.height;
    const pixelsPerFoot = Math.min(canvasWidth / width, canvasHeight / height);

    // Create temporary rectangle with fill properties
    const defaultStroke = state.defaultRectStroke || '#c9a961';
    const defaultFillColor = state.defaultFillColor || '#c9a961';
    const defaultFillOpacity = state.defaultFillOpacity || 0.2;
    const rgb = hexToRgb(defaultFillColor);

    state.currentDrawingRect = new fabric.Rect({
        left: pointer.x,
        top: pointer.y,
        width: 0,
        height: 0,
        fill: `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${defaultFillOpacity})`,
        stroke: defaultStroke,
        strokeWidth: 3,
        selectable: false,
        evented: false,
        pixelsPerFoot: pixelsPerFoot,
        fillEnabled: true,
        fillColor: defaultFillColor,
        fillOpacity: defaultFillOpacity
    });

    state.canvas.add(state.currentDrawingRect);
}

// Continue Drawing Rectangle (mouse move)
function continueDrawingRectangle(e) {
    if (!state.currentDrawingRect || !state.drawingStartPoint) return;

    const pointer = state.canvas.getPointer(e.e);
    const startX = state.drawingStartPoint.x;
    const startY = state.drawingStartPoint.y;

    // Calculate rectangle dimensions
    const width = pointer.x - startX;
    const height = pointer.y - startY;

    // Update rectangle (handle negative dimensions for reverse dragging)
    if (width > 0) {
        state.currentDrawingRect.set({ left: startX, width: width });
    } else {
        state.currentDrawingRect.set({ left: pointer.x, width: Math.abs(width) });
    }

    if (height > 0) {
        state.currentDrawingRect.set({ top: startY, height: height });
    } else {
        state.currentDrawingRect.set({ top: pointer.y, height: Math.abs(height) });
    }

    state.canvas.renderAll();
}

// Finish Drawing Rectangle (mouse up)
function finishDrawingRectangle(e) {
    if (!state.currentDrawingRect) return;

    const rect = state.currentDrawingRect;

    // Only create if rectangle has meaningful size (> 10 pixels)
    if (rect.width < 10 || rect.height < 10) {
        state.canvas.remove(rect);
        state.currentDrawingRect = null;
        state.drawingStartPoint = null;
        return;
    }

    // Get pixels per foot
    const pixelsPerFoot = rect.pixelsPerFoot;

    // Calculate dimensions in feet
    const widthFeet = rect.width / pixelsPerFoot;
    const heightFeet = rect.height / pixelsPerFoot;

    // Create dimension labels using rect's stroke color
    const labelColor = rect.stroke || '#c9a961';

    const widthLabel = new fabric.Text(feetToFeetInches(widthFeet), {
        left: rect.left + rect.width / 2,
        top: rect.top - 15,
        fontSize: 12,
        fontFamily: 'Arial, sans-serif',
        fontWeight: 'bold',
        fill: labelColor,
        backgroundColor: 'rgba(255, 255, 255, 0.8)',
        padding: 3,
        originX: 'center',
        originY: 'center',
        selectable: false,
        evented: true,
        hoverCursor: 'pointer',
        isRectDimension: true,
        dimensionType: 'width'
    });

    const heightLabel = new fabric.Text(feetToFeetInches(heightFeet), {
        left: rect.left - 15,
        top: rect.top + rect.height / 2,
        fontSize: 12,
        fontFamily: 'Arial, sans-serif',
        fontWeight: 'bold',
        fill: labelColor,
        backgroundColor: 'rgba(255, 255, 255, 0.8)',
        padding: 3,
        originX: 'center',
        originY: 'center',
        angle: -90,
        selectable: false,
        evented: true,
        hoverCursor: 'pointer',
        isRectDimension: true,
        dimensionType: 'height'
    });

    widthLabel.set({ visible: state.dimensionsVisible });
    heightLabel.set({ visible: state.dimensionsVisible });
    state.canvas.add(widthLabel);
    state.canvas.add(heightLabel);

    // Store rectangle with its labels
    const rectId = 'rect_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    rect.set({ rectId: rectId });
    widthLabel.set({ rectId: rectId });
    heightLabel.set({ rectId: rectId });

    state.stageRectangles.push({
        id: rectId,
        rect: rect,
        widthLabel: widthLabel,
        heightLabel: heightLabel
    });

    // Reset for next rectangle
    state.currentDrawingRect = null;
    state.drawingStartPoint = null;

    sendStageRectsToBack();
}

// Convert decimal feet to feet and inches format
function feetToFeetInches(decimalFeet) {
    const feet = Math.floor(decimalFeet);
    const inches = Math.round((decimalFeet - feet) * 12);

    // Handle case where inches rounds to 12
    if (inches === 12) {
        return `${feet + 1}'0"`;
    } else if (inches === 0) {
        return `${feet}'0"`;
    } else {
        return `${feet}'${inches}"`;
    }
}

// Convert feet-inches format to decimal feet
function feetInchesToFeet(feetInchesStr) {
    // Parse formats like "20'6\"" or "20' 6\"" or just "20"
    const match = feetInchesStr.match(/(\d+)(?:'|ft)?\s*(\d+)?(?:"|in)?/);
    if (!match) return null;

    const feet = parseInt(match[1]) || 0;
    const inches = parseInt(match[2]) || 0;

    return feet + (inches / 12);
}

// Parse feet-inches format or decimal feet to decimal
function parseFeetInches(input) {
    // Remove extra spaces
    input = input.trim();

    // Try to match feet-inches format: 20'6" or 20' 6" or 20ft 6in
    const feetInchesPattern = /(\d+)['ft]?\s*(\d+)?["in]?/i;
    const match = input.match(feetInchesPattern);

    if (match) {
        const feet = parseInt(match[1]) || 0;
        const inches = parseInt(match[2]) || 0;
        return feet + (inches / 12);
    }

    // Otherwise, try to parse as decimal
    const decimal = parseFloat(input);
    if (!isNaN(decimal)) {
        return decimal;
    }

    return null;
}


// Finish Drawing Stage
// Finish Drawing/Editing and Switch to Move Mode
function finishDrawingStage() {
    // Handle both drawing mode and editing mode
    if (!state.isDrawingStage && !state.isEditingStage) return;

    if (state.stageRectangles.length === 0) {
        alert('Please draw at least one rectangle for the stage.');
        return;
    }

    console.log('Finishing drawing stage, switching to move mode');

    // Hide the Finish button (keep tool toggle visible)
    const finishBtn = document.getElementById('finish-drawing-btn');
    if (finishBtn) finishBtn.style.display = 'none';

    // Switch to move mode so user can immediately move rectangles
    setTool('move');

    state.canvas.renderAll();
    triggerAutoSave();
}


// Edit Element Label (Double-click handler)
function editElementLabel(elementGroup) {
    if (!elementGroup || !elementGroup.isStageElement) return;

    // Get the label object from the group (it's the second item, index 1)
    const objects = elementGroup.getObjects();
    const labelObj = objects[1];  // Index 0 is emoji, index 1 is label

    if (!labelObj) return;

    const currentLabel = labelObj.text;

    // Prompt for new label
    const newLabel = prompt('Enter new label for this element:', currentLabel);
    if (!newLabel || newLabel === currentLabel) return;  // User cancelled or no change

    // Update the label text
    labelObj.set('text', newLabel);

    // Mark as dirty and re-render
    elementGroup.dirty = true;
    elementGroup.setCoords();
    state.canvas.renderAll();
    triggerAutoSave();
    updateSaveStatus('Label updated');
}

// Edit Rectangle Dimension (Double-click on dimension label)
function editRectangleDimension(dimensionLabel) {
    if (!dimensionLabel || !dimensionLabel.isRectDimension) return;

    const rectId = dimensionLabel.rectId;
    const dimensionType = dimensionLabel.dimensionType; // 'width' or 'height'

    // Find the rectangle data
    const rectData = state.stageRectangles.find(r => r.id === rectId);
    if (!rectData) return;

    const rect = rectData.rect;
    const pixelsPerFoot = rect.pixelsPerFoot || 20; // fallback

    // Get current dimension in feet
    const currentFeet = dimensionType === 'width'
        ? rect.width / pixelsPerFoot
        : rect.height / pixelsPerFoot;
    const currentDimensionStr = feetToFeetInches(currentFeet);

    // Prompt for new dimension
    const newDimensionStr = prompt(
        `Enter new ${dimensionType} (e.g., "20'6\"" or "20' 6\"" or "20"):`,
        currentDimensionStr
    );

    if (!newDimensionStr || newDimensionStr === currentDimensionStr) return;

    // Parse new dimension
    const newFeet = feetInchesToFeet(newDimensionStr);
    if (newFeet === null || newFeet <= 0) {
        alert('Invalid dimension format. Please use format like "20\'6\"" or "20"');
        return;
    }

    const newPixels = newFeet * pixelsPerFoot;

    // Resize the rectangle
    if (dimensionType === 'width') {
        rect.set({ width: newPixels });
    } else {
        rect.set({ height: newPixels });
    }

    // Update coordinates
    rect.setCoords();

    // Update dimension labels
    updateRectangleDimensionLabels(rectData);

    state.canvas.renderAll();
    triggerAutoSave();
    updateSaveStatus('Updated');
}

// Update Rectangle Dimension Label Positions and Text
function updateRectangleDimensionLabels(rectData) {
    const rect = rectData.rect;
    const pixelsPerFoot = rect.pixelsPerFoot || 20;

    // Calculate dimensions in feet
    const widthFeet = rect.width / pixelsPerFoot;
    const heightFeet = rect.height / pixelsPerFoot;

    // Update width label
    rectData.widthLabel.set({
        text: feetToFeetInches(widthFeet),
        left: rect.left + rect.width / 2,
        top: rect.top - 15
    });

    // Update height label
    rectData.heightLabel.set({
        text: feetToFeetInches(heightFeet),
        left: rect.left - 15,
        top: rect.top + rect.height / 2
    });
}

// Unlock Stage for Editing
// Unlock Stage - Enter Drag/Edit Mode
function unlockStage() {
    if (state.stageRectangles.length === 0) return;

    state.stageLocked = false;
    state.isDrawingStage = true;  // Reuse drawing mode flag for tool system

    // Show tool mode toggle
    const toolModeContainer = document.getElementById('tool-mode-container');
    if (toolModeContainer) {
        toolModeContainer.style.display = 'flex';
    }

    // Hide Edit button, show Finish button
    const editBtn = document.getElementById('edit-stage-btn');
    const finishBtn = document.getElementById('finish-drawing-btn');

    if (editBtn) editBtn.style.display = 'none';
    if (finishBtn) finishBtn.style.display = 'inline-block';

    // Set initial tool to move mode
    setTool('move');
}

// Snap Rectangle to Align with Other Rectangles
function snapRectangleToAlign(movingRectData) {
    const movingRect = movingRectData.rect;
    const snapDist = state.snapDistance;

    // Get edges of moving rectangle
    const movingLeft = movingRect.left;
    const movingRight = movingRect.left + movingRect.width;
    const movingTop = movingRect.top;
    const movingBottom = movingRect.top + movingRect.height;

    // Check against all other rectangles
    state.stageRectangles.forEach(otherRectData => {
        if (otherRectData.id === movingRectData.id) return;

        const otherRect = otherRectData.rect;
        const otherLeft = otherRect.left;
        const otherRight = otherRect.left + otherRect.width;
        const otherTop = otherRect.top;
        const otherBottom = otherRect.top + otherRect.height;

        // Snap left edge to other's right edge
        if (Math.abs(movingLeft - otherRight) < snapDist) {
            movingRect.set({ left: otherRight });
        }
        // Snap right edge to other's left edge
        if (Math.abs(movingRight - otherLeft) < snapDist) {
            movingRect.set({ left: otherLeft - movingRect.width });
        }
        // Snap left edges together
        if (Math.abs(movingLeft - otherLeft) < snapDist) {
            movingRect.set({ left: otherLeft });
        }
        // Snap right edges together
        if (Math.abs(movingRight - otherRight) < snapDist) {
            movingRect.set({ left: otherRight - movingRect.width });
        }

        // Snap top edge to other's bottom edge
        if (Math.abs(movingTop - otherBottom) < snapDist) {
            movingRect.set({ top: otherBottom });
        }
        // Snap bottom edge to other's top edge
        if (Math.abs(movingBottom - otherTop) < snapDist) {
            movingRect.set({ top: otherTop - movingRect.height });
        }
        // Snap top edges together
        if (Math.abs(movingTop - otherTop) < snapDist) {
            movingRect.set({ top: otherTop });
        }
        // Snap bottom edges together
        if (Math.abs(movingBottom - otherBottom) < snapDist) {
            movingRect.set({ top: otherBottom - movingRect.height });
        }
    });
}

// Update Rectangle Dimension Labels After Move
function updateRectangleDimensions(rectData) {
    const rect = rectData.rect;

    // Update width label position
    rectData.widthLabel.set({
        left: rect.left + rect.width / 2,
        top: rect.top - 15
    });

    // Update height label position
    rectData.heightLabel.set({
        left: rect.left - 15,
        top: rect.top + rect.height / 2
    });
}

// Delete All Stage Rectangles (called when clearing canvas or loading new plot)
function deleteStage() {
    state.stageRectangles.forEach(rectData => {
        state.canvas.remove(rectData.rect);
        state.canvas.remove(rectData.widthLabel);
        state.canvas.remove(rectData.heightLabel);
    });

    state.stageRectangles = [];
    state.stageLocked = false;
    state.isEditingStage = false;

    // Reset buttons
    const drawBtn = document.getElementById('draw-stage-btn');
    const editBtn = document.getElementById('edit-stage-btn');
    const finishBtn = document.getElementById('finish-drawing-btn');

    if (drawBtn) drawBtn.style.display = 'inline-block';
    if (editBtn) editBtn.style.display = 'none';
    if (finishBtn) finishBtn.style.display = 'none';
}

// Cancel Drawing/Editing Mode
function cancelDrawingMode() {
    state.isDrawingStage = false;
    state.isEditingStage = false;
    state.currentTool = null;

    // Remove any in-progress rectangle
    if (state.currentDrawingRect) {
        state.canvas.remove(state.currentDrawingRect);
        state.currentDrawingRect = null;
    }
    state.drawingStartPoint = null;

    // Remove mouse handlers
    state.canvas.off('mouse:down', startDrawingRectangle);
    state.canvas.off('mouse:move', continueDrawingRectangle);
    state.canvas.off('mouse:up', finishDrawingRectangle);

    // Hide tool mode toggle
    const toolModeContainer = document.getElementById('tool-mode-container');
    if (toolModeContainer) {
        toolModeContainer.style.display = 'none';
    }

    // Re-enable selection for elements (but NOT grid lines!)
    state.canvas.selection = true;
    state.canvas.forEachObject(obj => {
        if (!obj.isRectDimension && !obj.locked && !obj.gridLine) {
            obj.selectable = true;
        }
        // Make absolutely sure grid lines stay locked
        if (obj.gridLine) {
            obj.selectable = false;
            obj.evented = false;
        }
    });

    const drawBtn = document.getElementById('draw-stage-btn');
    const finishBtn = document.getElementById('finish-drawing-btn');

    if (drawBtn && finishBtn) {
        drawBtn.style.display = 'inline-block';
        finishBtn.style.display = 'none';
    }

    updateSaveStatus('');
}

// Setup Plot Name Input
function setupPlotNameInput() {
    const plotNameInput = document.getElementById('plot-name-input');
    if (!plotNameInput) return;

    // Update plot name on blur
    plotNameInput.addEventListener('blur', async () => {
        const newName = plotNameInput.value.trim();
        if (!newName) {
            alert('Plot name cannot be empty');
            if (state.isDraftPlot) {
                plotNameInput.value = 'Untitled Plot';
            } else {
                const plot = state.stagePlots.find(p => p.id === state.currentPlotId);
                if (plot) {
                    plotNameInput.value = plot.name;
                }
            }
            return;
        }

        // Promote draft if user typed a non-default name
        if (state.isDraftPlot && newName !== 'Untitled Plot') {
            await promoteDraftPlot();
            return;
        }

        if (!state.currentPlotId) return;

        try {
            await collections.stagePlots.doc(state.currentPlotId).update({
                name: newName,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            });

            // Update the plot in local state
            const plot = state.stagePlots.find(p => p.id === state.currentPlotId);
            if (plot) {
                plot.name = newName;
            }

            // Update the dropdown to show the new name
            updatePlotSelector();

            updateSaveStatus('Renamed');
            showToast('Plot renamed');
        } catch (error) {
            console.error('Error updating plot name:', error);
            showToast('Error updating plot name. Please try again.', 'error');
        }
    });

    // Update on Enter key
    plotNameInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            plotNameInput.blur();
        }
    });
}

// Print Plot
function printPlot() {
    if (!state.canvas) return;

    // Export canvas as data URL
    const dataURL = state.canvas.toDataURL({
        format: 'png',
        quality: 1.0,
        multiplier: 2  // Higher resolution for printing
    });

    // Create a new window for printing
    const printWindow = window.open('', '_blank');

    // Use fixed dimensions
    const width = 40;
    const height = 30;
    const plotName = state.currentPlotId ?
        state.stagePlots.find(p => p.id === state.currentPlotId)?.name || 'Untitled Plot' :
        'Untitled Plot';
    const stageTypeName = state.currentStagePlotType === 'main' ? 'Main Stage' : 'Cocktail Stage';
    const today = new Date().toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });

    printWindow.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>${plotName} - ${stageTypeName}</title>
            <style>
                * {
                    margin: 0;
                    padding: 0;
                    box-sizing: border-box;
                }
                body {
                    font-family: 'Segoe UI', 'Arial', sans-serif;
                    padding: 40px;
                    background: white;
                }
                .header {
                    border-bottom: 3px solid #c9a961;
                    padding-bottom: 20px;
                    margin-bottom: 30px;
                }
                .event-title {
                    color: #2c3e50;
                    font-size: 24px;
                    font-weight: 300;
                    margin-bottom: 5px;
                    text-transform: uppercase;
                    letter-spacing: 2px;
                }
                h1 {
                    color: #c9a961;
                    font-size: 32px;
                    margin-bottom: 8px;
                    font-weight: 600;
                }
                .subtitle {
                    color: #7f8c8d;
                    font-size: 16px;
                    margin-bottom: 5px;
                }
                .info-grid {
                    display: grid;
                    grid-template-columns: repeat(3, 1fr);
                    gap: 20px;
                    margin-bottom: 30px;
                    padding: 15px;
                    background: #f8f9fa;
                    border-radius: 8px;
                }
                .info-item {
                    text-align: center;
                }
                .info-label {
                    font-size: 12px;
                    color: #7f8c8d;
                    text-transform: uppercase;
                    letter-spacing: 1px;
                    margin-bottom: 5px;
                }
                .info-value {
                    font-size: 18px;
                    color: #2c3e50;
                    font-weight: 600;
                }
                .plot-container {
                    border: 2px solid #e0e0e0;
                    border-radius: 8px;
                    padding: 20px;
                    background: white;
                    box-shadow: 0 2px 8px rgba(0,0,0,0.1);
                }
                img {
                    width: 100%;
                    height: auto;
                    display: block;
                    border-radius: 4px;
                }
                .footer {
                    margin-top: 30px;
                    padding-top: 20px;
                    border-top: 1px solid #e0e0e0;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    font-size: 12px;
                    color: #95a5a6;
                }
                .footer-left {
                    font-style: italic;
                }
                .footer-right {
                    text-align: right;
                }
                @media print {
                    body {
                        padding: 20px;
                    }
                    .plot-container {
                        box-shadow: none;
                    }
                }
            </style>
        </head>
        <body>
            <div class="header">
                <div class="event-title">YMU Gala 2026</div>
                <h1>${plotName}</h1>
                <div class="subtitle">${stageTypeName} Plot</div>
            </div>

            <div class="info-grid">
                <div class="info-item">
                    <div class="info-label">Event Date</div>
                    <div class="info-value">April 25, 2026</div>
                </div>
                <div class="info-item">
                    <div class="info-label">Stage Dimensions</div>
                    <div class="info-value">${width}' × ${height}'</div>
                </div>
                <div class="info-item">
                    <div class="info-label">Scale</div>
                    <div class="info-value">1 ft = 1 grid</div>
                </div>
            </div>

            <div class="plot-container">
                <img src="${dataURL}" alt="Stage Plot">
            </div>

            <div class="footer">
                <div class="footer-left">
                    Young Musicians Unite • 2026 Gala Event
                </div>
                <div class="footer-right">
                    Printed: ${today}
                </div>
            </div>
        </body>
        </html>
    `);

    printWindow.document.close();

    // Wait for image to load then print
    printWindow.onload = () => {
        setTimeout(() => {
            printWindow.print();
        }, 250);
    };
}

// =============================================
// REAL-TIME COLLABORATION HELPERS
// =============================================

// Assign a unique objectId to a Fabric object if it doesn't have one
function assignObjectId(obj) {
    if (!obj.objectId && !obj.gridLine) {
        obj.objectId = 'obj_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    }
}

// Mark an object (and related rect labels) as dirty
function trackDirtyObject(obj) {
    if (!obj || obj.gridLine) return;
    assignObjectId(obj);
    state.dirtyObjectIds.add(obj.objectId);

    // If it's a rect, also mark its dimension labels
    if (obj.rectId) {
        const rectData = state.stageRectangles.find(r => r.id === obj.rectId);
        if (rectData) {
            if (rectData.widthLabel && rectData.widthLabel !== obj) {
                assignObjectId(rectData.widthLabel);
                state.dirtyObjectIds.add(rectData.widthLabel.objectId);
            }
            if (rectData.heightLabel && rectData.heightLabel !== obj) {
                assignObjectId(rectData.heightLabel);
                state.dirtyObjectIds.add(rectData.heightLabel.objectId);
            }
            if (rectData.rect && rectData.rect !== obj) {
                assignObjectId(rectData.rect);
                state.dirtyObjectIds.add(rectData.rect.objectId);
            }
        }
    }
}

// Setup real-time listener for plot objects subcollection
function setupPlotObjectsListener(plotId) {
    // Detach previous listener
    if (state.plotObjectsUnsubscribe) {
        state.plotObjectsUnsubscribe();
        state.plotObjectsUnsubscribe = null;
    }

    const unsubscribe = collections.stagePlots.doc(plotId).collection('objects')
        .onSnapshot((snapshot) => {
            if (!state.canvas || state.currentPlotId !== plotId) return;

            const remoteChanges = snapshot.docChanges().filter(c => c.doc.data().updatedBy !== CLIENT_ID);
            if (remoteChanges.length > 0) {
                state.isReceivingRemote = true;

                remoteChanges.forEach(change => {
                    const data = change.doc.data();
                    if (change.type === 'added' || change.type === 'modified') {
                        applyRemoteObject(data);
                    } else if (change.type === 'removed') {
                        removeRemoteObject(data.objectId);
                    }
                });

                state.canvas.renderAll();
                state.isReceivingRemote = false;
            }
        }, (error) => {
            console.error('Error listening to plot objects:', error);
        });

    state.plotObjectsUnsubscribe = unsubscribe;
}

// Apply a remote object change to the canvas
function applyRemoteObject(data) {
    if (!data.fabricData || !data.objectId) return;

    // Find existing object on canvas
    const existing = state.canvas.getObjects().find(o => o.objectId === data.objectId);

    if (existing) {
        // Update existing object properties
        const fabricData = data.fabricData;
        existing.set(fabricData);
        existing.setCoords();
        applyLockState(existing);
    } else {
        // Create new object from fabric data
        const objData = { ...data.fabricData, objectId: data.objectId };
        if (data.rectId) objData.rectId = data.rectId;

        fabric.util.enlivenObjects([objData], (objects) => {
            objects.forEach(obj => {
                // Insert at correct z-position based on stored zIndex
                const targetZIndex = data.zIndex;
                if (targetZIndex != null) {
                    const nonGridObjects = state.canvas.getObjects().filter(o => !o.gridLine);
                    const gridCount = state.canvas.getObjects().filter(o => o.gridLine).length;
                    // Clamp insertion index: gridCount offset + position among non-grid objects
                    const insertAt = Math.min(gridCount + targetZIndex, state.canvas.getObjects().length);
                    state.canvas.insertAt(obj, insertAt);
                } else {
                    state.canvas.add(obj);
                }
                applyLockState(obj);
            });
            // Rebuild stage rectangles if rect-related
            if (data.rectId) {
                rebuildStageRectangles();
                sendStageRectsToBack();
            }
        });
    }
}

// Remove a remote object from the canvas
function removeRemoteObject(objectId) {
    if (!objectId) return;
    const obj = state.canvas.getObjects().find(o => o.objectId === objectId);
    if (obj) {
        // If it's a rect, also remove related labels
        if (obj.rectId) {
            const rectData = state.stageRectangles.find(r => r.id === obj.rectId);
            if (rectData) {
                if (rectData.widthLabel) state.canvas.remove(rectData.widthLabel);
                if (rectData.heightLabel) state.canvas.remove(rectData.heightLabel);
                if (rectData.rect) state.canvas.remove(rectData.rect);
                state.stageRectangles = state.stageRectangles.filter(r => r.id !== obj.rectId);
                return;
            }
        }
        state.canvas.remove(obj);
    }
}

// After undo/redo, sync entire canvas state to Firestore
async function syncAfterUndoRedo() {
    if (!state.currentPlotId || !state.canvas) return;

    state.isReceivingRemote = true;

    // Get all current canvas objects (non-grid)
    const canvasObjects = state.canvas.getObjects().filter(o => !o.gridLine);
    const canvasObjectIds = new Set();

    // Assign IDs and mark all as dirty
    canvasObjects.forEach(obj => {
        assignObjectId(obj);
        canvasObjectIds.add(obj.objectId);
        state.dirtyObjectIds.add(obj.objectId);
    });

    // Find objects in Firestore that are no longer on canvas
    try {
        const objectsSnap = await collections.stagePlots.doc(state.currentPlotId).collection('objects').get();
        objectsSnap.docs.forEach(doc => {
            const objectId = doc.data().objectId;
            if (!canvasObjectIds.has(objectId)) {
                state.deletedObjectIds.add(objectId);
            }
        });
    } catch (error) {
        console.error('Error fetching objects for undo/redo sync:', error);
    }

    state.isReceivingRemote = false;
    triggerAutoSave();
}

// =============================================
// PROPERTIES PANEL (COLOR PICKER + FILL)
// =============================================

function hexToRgb(hex) {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16)
    } : { r: 0, g: 0, b: 0 };
}

function rgbaToHex(rgba) {
    if (!rgba || rgba === 'transparent') return '#000000';
    if (rgba.startsWith('#')) return rgba;
    const match = rgba.match(/(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
    if (!match) return '#000000';
    const r = parseInt(match[1]).toString(16).padStart(2, '0');
    const g = parseInt(match[2]).toString(16).padStart(2, '0');
    const b = parseInt(match[3]).toString(16).padStart(2, '0');
    return `#${r}${g}${b}`;
}

function toggleLockObject(obj) {
    if (!obj || obj.gridLine) return;
    const newLocked = !obj.locked;
    obj.set({
        locked: newLocked,
        lockMovementX: newLocked,
        lockMovementY: newLocked,
        lockScalingX: newLocked,
        lockScalingY: newLocked,
        lockRotation: newLocked,
        hasControls: !newLocked,
        selectable: true,
        evented: true,
        borderDashArray: newLocked ? [5, 5] : null,
        borderColor: newLocked ? '#999' : '#c9a961'
    });

    trackDirtyObject(obj);
    state.canvas.renderAll();
    triggerAutoSave();
    updateLockButton(obj);
}
window.toggleLockObject = toggleLockObject;

function applyLockState(obj) {
    if (!obj || !obj.locked) return;
    obj.set({
        lockMovementX: true,
        lockMovementY: true,
        lockScalingX: true,
        lockScalingY: true,
        lockRotation: true,
        hasControls: false,
        borderDashArray: [5, 5],
        borderColor: '#999'
    });
}

function updateLockButton(obj) {
    const lockBtn = document.getElementById('prop-lock-btn');
    if (!lockBtn) return;
    if (obj && obj.locked) {
        lockBtn.classList.add('active');
        lockBtn.title = 'Unlock';
    } else {
        lockBtn.classList.remove('active');
        lockBtn.title = 'Lock';
    }
}

function showPropertiesPanel(selectedObjects) {
    const panel = document.getElementById('properties-panel');
    if (!panel || !selectedObjects || selectedObjects.length === 0) return;

    const obj = selectedObjects[0];

    // Skip grid lines and dimension labels
    if (obj.gridLine || obj.isRectDimension) return;

    const strokeInput = document.getElementById('prop-stroke-color');
    const fillEnabledInput = document.getElementById('prop-fill-enabled');
    const fillColorInput = document.getElementById('prop-fill-color');
    const fillOpacitySelect = document.getElementById('prop-fill-opacity');
    const fillControls = document.getElementById('prop-fill-controls');

    // Determine if this is a rect-type object (show fill controls)
    const isRect = obj.type === 'rect' && obj.rectId;

    // Set stroke color
    if (strokeInput) {
        const strokeColor = obj.stroke || (isRect ? '#c9a961' : '#000000');
        strokeInput.value = rgbaToHex(strokeColor);
    }

    // Show/hide fill controls
    if (fillControls) {
        fillControls.style.display = isRect ? 'inline-flex' : 'none';
    }

    if (isRect) {
        const fillEnabled = obj.fillEnabled !== undefined ? obj.fillEnabled : true;
        const fillColor = obj.fillColor || rgbaToHex(obj.fill) || '#c9a961';
        const fillOpacity = obj.fillOpacity !== undefined ? obj.fillOpacity : 0.2;

        if (fillEnabledInput) fillEnabledInput.checked = fillEnabled;
        if (fillColorInput) fillColorInput.value = fillColor;
        if (fillOpacitySelect) {
            // Find closest opacity option
            const options = ['0.2', '0.4', '0.6', '1.0'];
            const closest = options.reduce((prev, curr) =>
                Math.abs(parseFloat(curr) - fillOpacity) < Math.abs(parseFloat(prev) - fillOpacity) ? curr : prev
            );
            fillOpacitySelect.value = closest;
        }
    }

    panel.classList.remove('hidden');
}

function hidePropertiesPanel() {
    const panel = document.getElementById('properties-panel');
    if (panel) panel.classList.add('hidden');
}

function setupPropertiesPanel() {
    const strokeInput = document.getElementById('prop-stroke-color');
    const fillEnabledInput = document.getElementById('prop-fill-enabled');
    const fillColorInput = document.getElementById('prop-fill-color');
    const fillOpacitySelect = document.getElementById('prop-fill-opacity');

    if (strokeInput) {
        strokeInput.addEventListener('input', () => {
            const obj = state.canvas?.getActiveObject();
            if (!obj) return;

            const newColor = strokeInput.value;
            obj.set('stroke', newColor);

            // If rect, update dimension label colors to match
            if (obj.rectId) {
                const rectData = state.stageRectangles.find(r => r.id === obj.rectId);
                if (rectData) {
                    rectData.widthLabel.set('fill', newColor);
                    rectData.heightLabel.set('fill', newColor);
                    trackDirtyObject(rectData.widthLabel);
                    trackDirtyObject(rectData.heightLabel);
                }
            }

            trackDirtyObject(obj);
            state.canvas.renderAll();
            triggerAutoSave();
        });
    }

    if (fillEnabledInput) {
        fillEnabledInput.addEventListener('change', () => {
            const obj = state.canvas?.getActiveObject();
            if (!obj || !obj.rectId) return;

            obj.fillEnabled = fillEnabledInput.checked;
            applyFillToRect(obj);
            trackDirtyObject(obj);
            state.canvas.renderAll();
            triggerAutoSave();
        });
    }

    if (fillColorInput) {
        fillColorInput.addEventListener('input', () => {
            const obj = state.canvas?.getActiveObject();
            if (!obj || !obj.rectId) return;

            obj.fillColor = fillColorInput.value;
            if (obj.fillEnabled) {
                applyFillToRect(obj);
            }
            trackDirtyObject(obj);
            state.canvas.renderAll();
            triggerAutoSave();
        });
    }

    if (fillOpacitySelect) {
        fillOpacitySelect.addEventListener('change', () => {
            const obj = state.canvas?.getActiveObject();
            if (!obj || !obj.rectId) return;

            obj.fillOpacity = parseFloat(fillOpacitySelect.value);
            if (obj.fillEnabled) {
                applyFillToRect(obj);
            }
            trackDirtyObject(obj);
            state.canvas.renderAll();
            triggerAutoSave();
        });
    }

    // Lock button
    document.getElementById('prop-lock-btn')?.addEventListener('click', () => {
        const obj = state.canvas?.getActiveObject();
        if (obj) toggleLockObject(obj);
    });

    // Right-click context menu for stage plots (z-order, duplicate, lock)
    const canvasWrapper = document.getElementById('canvas-wrapper');
    if (canvasWrapper) {
        canvasWrapper.addEventListener('contextmenu', spShowContextMenu);
        document.addEventListener('click', spHideContextMenu);
    }
}

// Stage Plot Right-Click Context Menu (matches venue map pattern)
function spShowContextMenu(e) {
    const activeObj = state.canvas && state.canvas.getActiveObject();
    if (!activeObj || activeObj.gridLine || activeObj.isRectDimension) return;

    e.preventDefault();
    const menu = document.getElementById('sp-context-menu');
    if (!menu) return;
    menu.style.display = 'block';
    menu.style.left = e.clientX + 'px';
    menu.style.top = e.clientY + 'px';
}

function spHideContextMenu() {
    const menu = document.getElementById('sp-context-menu');
    if (menu) menu.style.display = 'none';
}

function spContextAction(action) {
    const obj = state.canvas && state.canvas.getActiveObject();
    if (!obj) return;

    if (action === 'duplicate') {
        duplicateObject(obj);
    } else if (action === 'lock') {
        toggleLockObject(obj);
    } else {
        // Z-order: bringForward, bringToFront, sendBackwards, sendToBack
        saveCanvasState();
        state.canvas[action](obj);
        sendStageRectsToBack();
        state.canvas.renderAll();
        trackDirtyObject(obj);
        triggerAutoSave();
    }
    spHideContextMenu();
}
window.spContextAction = spContextAction;

function applyFillToRect(rect) {
    if (rect.fillEnabled) {
        const color = rect.fillColor || '#c9a961';
        const opacity = rect.fillOpacity !== undefined ? rect.fillOpacity : 0.2;
        const rgb = hexToRgb(color);
        rect.set('fill', `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${opacity})`);
    } else {
        rect.set('fill', 'transparent');
    }
}

// ========================================
// Venue Map Annotation Tool
// ========================================

function setupVenueMap() {
    const wrapper = document.getElementById('vm-canvas-wrapper');
    if (!wrapper) return;

    // Pre-load the image. Try with CORS first (needed for toDataURL export on
    // deployed sites). Fall back without CORS for file:// local dev.
    state.vmBgImage = new Image();
    state.vmBgImage.crossOrigin = 'anonymous';
    state.vmBgCORS = true;
    state.vmBgImage.onerror = () => {
        // CORS load failed (likely file:// protocol) — retry without crossOrigin
        state.vmBgCORS = false;
        const retry = new Image();
        retry.onload = () => {
            state.vmBgImage = retry;
            vmInitCanvas();
        };
        retry.src = 'venue-map.png';
    };
    state.vmBgImage.src = 'venue-map.png';

    // Tool buttons
    document.querySelectorAll('.vm-tool-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.vm-tool-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            state.vmCurrentTool = btn.dataset.tool;
            vmUpdateCanvasMode();
        });
    });

    // Color swatches
    document.querySelectorAll('.vm-color-swatch').forEach(swatch => {
        swatch.addEventListener('click', () => {
            document.querySelectorAll('.vm-color-swatch').forEach(s => s.classList.remove('active'));
            swatch.classList.add('active');
            state.vmCurrentColor = swatch.dataset.color;
            // Update the active brush if currently in pen mode
            if (state.vmCanvas && state.vmCanvas.isDrawingMode) {
                state.vmCanvas.freeDrawingBrush.color = state.vmCurrentColor;
            }
            // Apply color to selected object(s)
            const active = state.vmCanvas?.getActiveObject();
            if (active) {
                vmSaveCanvasState();
                const objs = active.type === 'activeSelection' ? active.getObjects() : [active];
                objs.forEach(obj => {
                    if (obj.type === 'textbox') {
                        obj.set('fill', state.vmCurrentColor);
                    } else {
                        obj.set('stroke', state.vmCurrentColor);
                        if (obj.fill && obj.fill !== 'transparent') {
                            obj.set('fill', state.vmCurrentColor);
                        }
                    }
                    obj.dirty = true;
                });
                if (active.type === 'activeSelection') active.dirty = true;
                state.vmCanvas.renderAll();
                vmTriggerSave();
            }
        });
    });

    // Stroke width
    const strokeSelect = document.getElementById('vm-stroke-width');
    if (strokeSelect) {
        strokeSelect.addEventListener('change', () => {
            state.vmStrokeWidth = parseInt(strokeSelect.value);
            // Update the active brush if currently in pen mode
            if (state.vmCanvas && state.vmCanvas.isDrawingMode) {
                state.vmCanvas.freeDrawingBrush.width = state.vmStrokeWidth;
            }
            // Apply stroke width to selected object(s) (not text)
            const active = state.vmCanvas?.getActiveObject();
            if (active) {
                vmSaveCanvasState();
                const objs = active.type === 'activeSelection' ? active.getObjects() : [active];
                objs.forEach(obj => {
                    if (obj.type !== 'textbox') {
                        obj.set('strokeWidth', state.vmStrokeWidth);
                        obj.dirty = true;
                    }
                });
                if (active.type === 'activeSelection') active.dirty = true;
                state.vmCanvas.renderAll();
                vmTriggerSave();
            }
        });
    }

    // Fill toggle
    const fillToggle = document.getElementById('vm-fill-toggle');
    if (fillToggle) {
        fillToggle.addEventListener('change', (e) => {
            state.vmFillShape = e.target.checked;
            const active = state.vmCanvas?.getActiveObject();
            if (active) {
                const objs = active.type === 'activeSelection' ? active.getObjects() : [active];
                const fillable = objs.filter(o => o.type === 'rect' || o.type === 'ellipse');
                if (fillable.length) {
                    vmSaveCanvasState();
                    fillable.forEach(obj => {
                        obj.set('fill', state.vmFillShape ? obj.stroke : 'transparent');
                        obj.dirty = true;
                    });
                    if (active.type === 'activeSelection') active.dirty = true;
                    state.vmCanvas.renderAll();
                    vmTriggerSave();
                }
            }
        });
    }

    // Zoom buttons
    const zoomInBtn = document.getElementById('vm-zoom-in-btn');
    const zoomOutBtn = document.getElementById('vm-zoom-out-btn');
    const zoomFitBtn = document.getElementById('vm-zoom-fit-btn');
    if (zoomInBtn) zoomInBtn.addEventListener('click', () => vmSetZoom(state.vmZoom + 0.15));
    if (zoomOutBtn) zoomOutBtn.addEventListener('click', () => vmSetZoom(state.vmZoom - 0.15));
    if (zoomFitBtn) zoomFitBtn.addEventListener('click', vmZoomFit);

    // Delete button
    const deleteBtn = document.getElementById('vm-delete-btn');
    if (deleteBtn) {
        deleteBtn.addEventListener('click', vmDeleteSelected);
    }

    // Add layer button
    const addLayerBtn = document.getElementById('vm-add-layer-btn');
    if (addLayerBtn) {
        addLayerBtn.addEventListener('click', () => vmAddLayer());
    }

    // Print & Export buttons
    const printBtn = document.getElementById('vm-print-btn');
    const exportBtn = document.getElementById('vm-export-btn');
    if (printBtn) printBtn.addEventListener('click', vmPrintMap);
    if (exportBtn) exportBtn.addEventListener('click', vmExportPNG);

    // Undo/Redo buttons
    const undoBtn = document.getElementById('vm-undo-btn');
    const redoBtn = document.getElementById('vm-redo-btn');
    if (undoBtn) undoBtn.addEventListener('click', vmUndo);
    if (redoBtn) redoBtn.addEventListener('click', vmRedo);

    // Keyboard shortcuts for venue map
    document.addEventListener('keydown', (e) => {
        if (state.currentPage !== 'venue-map' || !state.vmCanvas) return;
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

        if (e.key === 'Delete' || e.key === 'Backspace') {
            if (state.vmCanvas.getActiveObject()?.isEditing) return;
            vmDeleteSelected();
            e.preventDefault();
        }

        // Undo: Ctrl+Z / Cmd+Z
        if (e.key === 'z' && (e.ctrlKey || e.metaKey) && !e.shiftKey) {
            e.preventDefault();
            vmUndo();
        }
        // Redo: Ctrl+Shift+Z / Cmd+Shift+Z
        if (e.key === 'z' && (e.ctrlKey || e.metaKey) && e.shiftKey) {
            e.preventDefault();
            vmRedo();
        }
    });
}

function vmInitCanvas() {
    if (state.vmCanvas) return; // Already initialized

    const wrapper = document.getElementById('vm-canvas-wrapper');
    const img = state.vmBgImage;
    if (!wrapper || !img) return;

    // If image hasn't loaded yet, wait for it
    if (!img.naturalWidth) {
        img.onload = () => vmInitCanvas();
        return;
    }

    const wrapperWidth = wrapper.clientWidth || 1000;
    const scale = wrapperWidth / img.naturalWidth;
    const canvasWidth = Math.floor(img.naturalWidth * scale);
    const canvasHeight = Math.floor(img.naturalHeight * scale);

    state.vmCanvas = new fabric.Canvas('vm-canvas', {
        width: canvasWidth,
        height: canvasHeight,
        selection: true,
        preserveObjectStacking: true
    });

    state.vmCanvas.setBackgroundImage(
        new fabric.Image(img, {
            scaleX: scale,
            scaleY: scale,
            originX: 'left',
            originY: 'top'
        }),
        state.vmCanvas.renderAll.bind(state.vmCanvas)
    );
    state.vmBgScale = scale;

    state.vmImageLoaded = true;
    state.vmBaseWidth = canvasWidth;
    state.vmBaseHeight = canvasHeight;
    state.vmZoom = 1.0;

    // Right-click context menu for z-order
    const wrapperEl = document.getElementById('vm-canvas-wrapper');
    wrapperEl.addEventListener('contextmenu', vmShowContextMenu);
    document.addEventListener('click', vmHideContextMenu);

    state.vmCanvas.calcOffset();

    vmSetupDrawingEvents();
    vmLoadLayers().then(() => {
        // Save initial state so the first action is undoable
        setTimeout(() => vmSaveCanvasState(), 500);
    });
}

function vmUpdateCanvasMode() {
    const c = state.vmCanvas;
    if (!c) return;

    if (state.vmCurrentTool === 'select') {
        c.isDrawingMode = false;
        c.selection = true;
        c.forEachObject(o => { if (!o._vmBackground) o.selectable = true; });
    } else if (state.vmCurrentTool === 'pen') {
        c.isDrawingMode = true;
        c.freeDrawingBrush.color = state.vmCurrentColor;
        c.freeDrawingBrush.width = state.vmStrokeWidth;
        c.selection = false;
    } else {
        // Line, rect, circle, text — handled via mouse events
        c.isDrawingMode = false;
        c.selection = false;
        c.forEachObject(o => { if (!o._vmBackground) o.selectable = false; });
    }
}

function vmSetupDrawingEvents() {
    const c = state.vmCanvas;

    // When freehand path is created, tag it with the active layer
    c.on('path:created', (e) => {
        const path = e.path;
        if (!state.vmActiveLayerId) {
            c.remove(path);
            showToast('Create a layer first', 'warning');
            return;
        }
        path._vmLayerId = state.vmActiveLayerId;
        vmTriggerSave();
    });

    c.on('mouse:down', (opt) => {
        if (state.vmCurrentTool === 'select') return;
        if (!state.vmActiveLayerId) {
            if (state.vmCurrentTool === 'pen') {
                c.isDrawingMode = false;
            }
            showToast('Create a layer first', 'warning');
            return;
        }
        if (state.vmCurrentTool === 'pen') return;

        const pointer = c.getPointer(opt.e);
        state.vmDrawStart = { x: pointer.x, y: pointer.y };

        if (state.vmCurrentTool === 'text') {
            const textObj = new fabric.Textbox('Text', {
                left: pointer.x,
                top: pointer.y,
                width: 200,
                fontSize: state.vmStrokeWidth * 5 + 10,
                fill: state.vmCurrentColor,
                fontFamily: 'DM Sans, sans-serif',
                _vmLayerId: state.vmActiveLayerId
            });
            c.add(textObj);
            c.setActiveObject(textObj);
            textObj.enterEditing();
            textObj.selectAll();
            vmTriggerSave();
            // Switch back to select
            state.vmCurrentTool = 'select';
            document.querySelectorAll('.vm-tool-btn').forEach(b => b.classList.toggle('active', b.dataset.tool === 'select'));
            vmUpdateCanvasMode();
            return;
        }

        if (state.vmCurrentTool === 'line') {
            state.vmDrawingObj = new fabric.Line(
                [pointer.x, pointer.y, pointer.x, pointer.y],
                { stroke: state.vmCurrentColor, strokeWidth: state.vmStrokeWidth, selectable: false, _vmLayerId: state.vmActiveLayerId }
            );
            c.add(state.vmDrawingObj);
        } else if (state.vmCurrentTool === 'rect') {
            state.vmDrawingObj = new fabric.Rect({
                left: pointer.x, top: pointer.y, width: 0, height: 0,
                stroke: state.vmCurrentColor, strokeWidth: state.vmStrokeWidth,
                fill: state.vmFillShape ? state.vmCurrentColor : 'transparent', selectable: false, _vmLayerId: state.vmActiveLayerId
            });
            c.add(state.vmDrawingObj);
        } else if (state.vmCurrentTool === 'circle') {
            state.vmDrawingObj = new fabric.Ellipse({
                left: pointer.x, top: pointer.y, rx: 0, ry: 0,
                stroke: state.vmCurrentColor, strokeWidth: state.vmStrokeWidth,
                fill: state.vmFillShape ? state.vmCurrentColor : 'transparent', selectable: false, _vmLayerId: state.vmActiveLayerId
            });
            c.add(state.vmDrawingObj);
        }
    });

    c.on('mouse:move', (opt) => {
        if (!state.vmDrawingObj || !state.vmDrawStart) return;
        const pointer = c.getPointer(opt.e);

        if (state.vmCurrentTool === 'line') {
            let x2 = pointer.x, y2 = pointer.y;
            if (opt.e.shiftKey) {
                const dx = pointer.x - state.vmDrawStart.x;
                const dy = pointer.y - state.vmDrawStart.y;
                const angle = Math.atan2(dy, dx);
                const snapped = Math.round(angle / (Math.PI / 4)) * (Math.PI / 4);
                const dist = Math.sqrt(dx * dx + dy * dy);
                x2 = state.vmDrawStart.x + dist * Math.cos(snapped);
                y2 = state.vmDrawStart.y + dist * Math.sin(snapped);
            }
            state.vmDrawingObj.set({ x2, y2 });
        } else if (state.vmCurrentTool === 'rect') {
            const left = Math.min(state.vmDrawStart.x, pointer.x);
            const top = Math.min(state.vmDrawStart.y, pointer.y);
            state.vmDrawingObj.set({
                left, top,
                width: Math.abs(pointer.x - state.vmDrawStart.x),
                height: Math.abs(pointer.y - state.vmDrawStart.y)
            });
        } else if (state.vmCurrentTool === 'circle') {
            const rx = Math.abs(pointer.x - state.vmDrawStart.x) / 2;
            const ry = Math.abs(pointer.y - state.vmDrawStart.y) / 2;
            state.vmDrawingObj.set({
                left: Math.min(state.vmDrawStart.x, pointer.x),
                top: Math.min(state.vmDrawStart.y, pointer.y),
                rx, ry
            });
        }
        c.renderAll();
    });

    c.on('mouse:up', () => {
        if (state.vmDrawingObj) {
            const drawnObj = state.vmDrawingObj;
            drawnObj.setCoords();
            state.vmDrawingObj = null;
            state.vmDrawStart = null;
            vmTriggerSave();
            // Switch back to select and auto-select the drawn shape
            state.vmCurrentTool = 'select';
            document.querySelectorAll('.vm-tool-btn').forEach(b => b.classList.toggle('active', b.dataset.tool === 'select'));
            vmUpdateCanvasMode();
            c.setActiveObject(drawnObj);
            c.renderAll();
        }
    });

    // Sync fill checkbox on selection
    function vmUpdateFillCheckbox() {
        const obj = state.vmCanvas.getActiveObject();
        const toggle = document.getElementById('vm-fill-toggle');
        if (obj && (obj.type === 'rect' || obj.type === 'ellipse')) {
            toggle.checked = obj.fill !== 'transparent' && obj.fill !== '';
            state.vmFillShape = toggle.checked;
        }
    }
    c.on('selection:created', vmUpdateFillCheckbox);
    c.on('selection:updated', vmUpdateFillCheckbox);

    // Option/Alt + drag to duplicate
    c.on('mouse:down', (opt) => {
        if (!opt.e.altKey) return;
        if (state.vmCurrentTool !== 'select') return;
        const active = c.getActiveObject();
        if (!active || active._vmBackground) return;

        active.clone((cloned) => {
            cloned.set({
                left: active.left,
                top: active.top,
                _vmLayerId: active._vmLayerId
            });
            c.add(cloned);
            c.renderAll();
            vmTriggerSave();
        });
    });

    // Auto-save on object modifications and capture undo state
    c.on('object:added', () => { if (!state.vmIsUndoRedoing) vmSaveCanvasState(); });
    c.on('object:modified', () => { if (!state.vmIsUndoRedoing) vmSaveCanvasState(); vmTriggerSave(); });
    c.on('object:removed', () => { if (!state.vmIsUndoRedoing) vmSaveCanvasState(); vmTriggerSave(); });
    c.on('text:changed', () => vmTriggerSave());
}

// --- Venue Map Undo/Redo ---

function vmSaveCanvasState() {
    const c = state.vmCanvas;
    if (!c || state.vmIsUndoRedoing) return;
    const json = JSON.stringify(c.toJSON(['_vmLayerId', '_vmBackground']));
    state.vmUndoStack.push(json);
    if (state.vmUndoStack.length > 30) state.vmUndoStack.shift();
    state.vmRedoStack = [];
    vmUpdateUndoRedoButtons();
}

function vmUndo() {
    const c = state.vmCanvas;
    if (!c || state.vmUndoStack.length === 0) return;

    // Save current state to redo stack
    const current = JSON.stringify(c.toJSON(['_vmLayerId', '_vmBackground']));
    state.vmRedoStack.push(current);

    const prev = state.vmUndoStack.pop();
    state.vmIsUndoRedoing = true;
    c.renderOnAddRemove = false;

    // Suppress ALL renders during async loadFromJSON reconstruction
    const origRenderAll = c.renderAll.bind(c);
    const origRequestRenderAll = c.requestRenderAll.bind(c);
    c.renderAll = function() {};
    c.requestRenderAll = function() {};

    c.loadFromJSON(prev, () => {
        // Restore render methods
        c.renderAll = origRenderAll;
        c.requestRenderAll = origRequestRenderAll;

        // Re-apply background image since loadFromJSON replaces it
        if (state.vmBgImage) {
            c.setBackgroundImage(
                new fabric.Image(state.vmBgImage, {
                    scaleX: state.vmBgScale,
                    scaleY: state.vmBgScale,
                    originX: 'left',
                    originY: 'top'
                }),
                () => {}
            );
        }
        c.renderOnAddRemove = true;
        c.renderAll();
        state.vmIsUndoRedoing = false;
        vmUpdateUndoRedoButtons();
        vmTriggerSave();
    });
}

function vmRedo() {
    const c = state.vmCanvas;
    if (!c || state.vmRedoStack.length === 0) return;

    // Save current state to undo stack
    const current = JSON.stringify(c.toJSON(['_vmLayerId', '_vmBackground']));
    state.vmUndoStack.push(current);

    const next = state.vmRedoStack.pop();
    state.vmIsUndoRedoing = true;
    c.renderOnAddRemove = false;

    // Suppress ALL renders during async loadFromJSON reconstruction
    const origRenderAll = c.renderAll.bind(c);
    const origRequestRenderAll = c.requestRenderAll.bind(c);
    c.renderAll = function() {};
    c.requestRenderAll = function() {};

    c.loadFromJSON(next, () => {
        // Restore render methods
        c.renderAll = origRenderAll;
        c.requestRenderAll = origRequestRenderAll;

        if (state.vmBgImage) {
            c.setBackgroundImage(
                new fabric.Image(state.vmBgImage, {
                    scaleX: state.vmBgScale,
                    scaleY: state.vmBgScale,
                    originX: 'left',
                    originY: 'top'
                }),
                () => {}
            );
        }
        c.renderOnAddRemove = true;
        c.renderAll();
        state.vmIsUndoRedoing = false;
        vmUpdateUndoRedoButtons();
        vmTriggerSave();
    });
}

function vmUpdateUndoRedoButtons() {
    const undoBtn = document.getElementById('vm-undo-btn');
    const redoBtn = document.getElementById('vm-redo-btn');
    if (undoBtn) undoBtn.disabled = state.vmUndoStack.length === 0;
    if (redoBtn) redoBtn.disabled = state.vmRedoStack.length === 0;
}

// --- Right-click context menu for z-order ---

function vmShowContextMenu(e) {
    const activeObj = state.vmCanvas && state.vmCanvas.getActiveObject();
    if (!activeObj) return;

    e.preventDefault();
    const menu = document.getElementById('vm-context-menu');
    menu.style.display = 'block';
    menu.style.left = e.clientX + 'px';
    menu.style.top = e.clientY + 'px';
}

function vmHideContextMenu() {
    const menu = document.getElementById('vm-context-menu');
    if (menu) menu.style.display = 'none';
}

function vmContextAction(action) {
    const obj = state.vmCanvas && state.vmCanvas.getActiveObject();
    if (!obj) return;

    vmSaveCanvasState();
    state.vmCanvas[action](obj);
    state.vmCanvas.renderAll();
    vmHideContextMenu();
    vmTriggerSave();
}

window.vmContextAction = vmContextAction;

// --- Layer Management ---

function vmAddLayer(name) {
    const layerName = name || `Layer ${state.vmLayers.length + 1}`;
    const colors = ['#e53e3e', '#3182ce', '#38a169', '#d69e2e', '#805ad5', '#dd6b20', '#e53e9e'];
    const color = colors[state.vmLayers.length % colors.length];

    const layer = {
        id: 'layer_' + Date.now(),
        name: layerName,
        color: color,
        visible: true
    };

    state.vmLayers.push(layer);
    state.vmActiveLayerId = layer.id;
    vmRenderLayers();
    vmSaveLayers();
    return layer;
}

function vmRenderLayers() {
    const list = document.getElementById('vm-layers-list');
    if (!list) return;

    if (state.vmLayers.length === 0) {
        list.innerHTML = '<p style="padding: 1rem; color: #a0aec0; font-size: 0.85rem; text-align: center;">No layers yet. Click "+ Layer" to start annotating.</p>';
        return;
    }

    list.innerHTML = state.vmLayers.map(layer => `
        <div class="vm-layer-item ${layer.id === state.vmActiveLayerId ? 'active' : ''}"
             data-layer-id="${layer.id}" onclick="vmSelectLayer('${layer.id}')"
             draggable="true"
             ondragstart="vmLayerDragStart(event, '${layer.id}')"
             ondragover="vmLayerDragOver(event)"
             ondrop="vmLayerDrop(event, '${layer.id}')"
             ondragend="vmLayerDragEnd(event)">
            <div class="vm-layer-color" style="background:${layer.color}"></div>
            <span class="vm-layer-name" ondblclick="vmRenameLayer(event, '${layer.id}')">${layer.name}</span>
            <button class="vm-layer-visibility" onclick="vmToggleLayerVisibility(event, '${layer.id}')" title="${layer.visible ? 'Hide' : 'Show'}">
                ${layer.visible ? '&#128065;' : '&#128064;'}
            </button>
            <button class="vm-layer-delete" onclick="vmDeleteLayer(event, '${layer.id}')" title="Delete layer">&times;</button>
        </div>
    `).join('');
}

let vmDraggedLayerId = null;

function vmLayerDragStart(e, layerId) {
    vmDraggedLayerId = layerId;
    e.dataTransfer.effectAllowed = 'move';
    e.currentTarget.classList.add('vm-layer-dragging');
}

function vmLayerDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const item = e.currentTarget;
    const rect = item.getBoundingClientRect();
    const midY = rect.top + rect.height / 2;
    item.classList.toggle('vm-layer-drop-above', e.clientY < midY);
    item.classList.toggle('vm-layer-drop-below', e.clientY >= midY);
}

function vmLayerDrop(e, targetLayerId) {
    e.preventDefault();
    if (!vmDraggedLayerId || vmDraggedLayerId === targetLayerId) return;

    const fromIdx = state.vmLayers.findIndex(l => l.id === vmDraggedLayerId);
    const toIdx = state.vmLayers.findIndex(l => l.id === targetLayerId);
    if (fromIdx === -1 || toIdx === -1) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const dropAfter = e.clientY >= rect.top + rect.height / 2;

    const [moved] = state.vmLayers.splice(fromIdx, 1);
    const newIdx = state.vmLayers.findIndex(l => l.id === targetLayerId);
    state.vmLayers.splice(dropAfter ? newIdx + 1 : newIdx, 0, moved);

    vmRenderLayers();
    vmSaveLayers();
}

function vmLayerDragEnd(e) {
    vmDraggedLayerId = null;
    document.querySelectorAll('.vm-layer-item').forEach(el => {
        el.classList.remove('vm-layer-dragging', 'vm-layer-drop-above', 'vm-layer-drop-below');
    });
}

window.vmLayerDragStart = vmLayerDragStart;
window.vmLayerDragOver = vmLayerDragOver;
window.vmLayerDrop = vmLayerDrop;
window.vmLayerDragEnd = vmLayerDragEnd;

function vmSelectLayer(layerId) {
    // Don't re-render if we're in the middle of renaming a layer
    if (state.vmRenamingLayer) return;
    state.vmActiveLayerId = layerId;
    vmRenderLayers();
    if (state.vmCurrentTool === 'pen' && state.vmCanvas) {
        state.vmCanvas.isDrawingMode = true;
    }
}
window.vmSelectLayer = vmSelectLayer;

function vmToggleLayerVisibility(e, layerId) {
    e.stopPropagation();
    const layer = state.vmLayers.find(l => l.id === layerId);
    if (!layer) return;
    layer.visible = !layer.visible;

    // Show/hide objects on canvas
    if (state.vmCanvas) {
        state.vmCanvas.getObjects().forEach(obj => {
            if (obj._vmLayerId === layerId) {
                obj.visible = layer.visible;
            }
        });
        state.vmCanvas.renderAll();
    }

    vmRenderLayers();
    vmSaveLayers();
}
window.vmToggleLayerVisibility = vmToggleLayerVisibility;

function vmRenameLayer(e, layerId) {
    e.stopPropagation();
    const layer = state.vmLayers.find(l => l.id === layerId);
    if (!layer) return;

    state.vmRenamingLayer = true;
    const nameSpan = e.currentTarget;
    const input = document.createElement('input');
    input.type = 'text';
    input.value = layer.name;
    input.className = 'vm-layer-name-input';

    const finish = () => {
        const newName = input.value.trim() || layer.name;
        layer.name = newName;
        state.vmRenamingLayer = false;
        vmRenderLayers();
        vmSaveLayers();
    };

    input.addEventListener('blur', finish);
    input.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter') input.blur();
        if (ev.key === 'Escape') { input.value = layer.name; input.blur(); }
    });

    nameSpan.replaceWith(input);
    input.focus();
    input.select();
}
window.vmRenameLayer = vmRenameLayer;

function vmDeleteLayer(e, layerId) {
    e.stopPropagation();
    const layer = state.vmLayers.find(l => l.id === layerId);
    if (!layer) return;
    if (!confirm(`Delete layer "${layer.name}" and all its annotations?`)) return;

    // Remove objects from canvas
    if (state.vmCanvas) {
        const toRemove = state.vmCanvas.getObjects().filter(o => o._vmLayerId === layerId);
        toRemove.forEach(o => state.vmCanvas.remove(o));
    }

    state.vmLayers = state.vmLayers.filter(l => l.id !== layerId);
    if (state.vmActiveLayerId === layerId) {
        state.vmActiveLayerId = state.vmLayers.length > 0 ? state.vmLayers[0].id : null;
    }
    vmRenderLayers();
    vmSaveLayers();
}
window.vmDeleteLayer = vmDeleteLayer;

// --- Print & Export ---

// Build a data URL export of the venue map. Tries direct canvas export first
// (works on same-origin HTTP). Falls back to CORS composite for tainted canvases.
// Used by vmExportPNG (download). vmPrintMap uses its own layered approach.
function vmBuildExport(callback) {
    const c = state.vmCanvas;
    if (!c) {
        showToast('Canvas not ready — navigate to Venue Map first', 'error');
        return;
    }

    const w = state.vmBaseWidth;
    const h = state.vmBaseHeight;
    const prevZoom = state.vmZoom;

    // Export at original image resolution for full quality
    const origW = state.vmBgImage ? state.vmBgImage.naturalWidth : w;
    const origH = state.vmBgImage ? state.vmBgImage.naturalHeight : h;
    const exportScale = origW / w;

    // Reset to base dimensions for export
    c.setZoom(1);
    c.setWidth(w);
    c.setHeight(h);
    c.renderAll();

    function restoreZoom() {
        c.setZoom(prevZoom);
        c.setWidth(Math.round(w * prevZoom));
        c.setHeight(Math.round(h * prevZoom));
        c.renderAll();
    }

    // Direct export works only if the background was loaded with CORS
    if (state.vmBgCORS) {
        try {
            const dataURL = c.toDataURL({ format: 'png', multiplier: exportScale });
            restoreZoom();
            callback(dataURL);
            return;
        } catch (e) {
            // Unexpected — fall through to composite
        }
    }

    // Composite approach: export annotations separately, then layer onto a CORS background
    const hasAnnotations = c.getObjects().length > 0;
    let annotationDataURL = null;

    if (hasAnnotations) {
        const bg = c.backgroundImage;
        c.backgroundImage = null;
        c.renderAll();
        try {
            annotationDataURL = c.toDataURL({ format: 'png', multiplier: exportScale });
        } catch (err) {
            console.error('Annotation export failed:', err);
        }
        c.backgroundImage = bg;
        c.renderAll();
    }

    restoreZoom();

    // Load a fresh CORS copy of the background for the export canvas
    const corsImg = new Image();
    corsImg.crossOrigin = 'anonymous';
    corsImg.onload = () => {
        const offscreen = document.createElement('canvas');
        offscreen.width = origW;
        offscreen.height = origH;
        const ctx = offscreen.getContext('2d');
        ctx.drawImage(corsImg, 0, 0, origW, origH);

        if (annotationDataURL) {
            const annotImg = new Image();
            annotImg.onload = () => {
                ctx.drawImage(annotImg, 0, 0, origW, origH);
                callback(offscreen.toDataURL('image/png'));
            };
            annotImg.src = annotationDataURL;
        } else {
            // No annotations — just export the background
            callback(offscreen.toDataURL('image/png'));
        }
    };
    corsImg.onerror = () => {
        if (annotationDataURL) {
            console.warn('CORS image load failed, exporting annotations only');
            showToast('Exported annotations only (background unavailable in local mode)', 'warning');
            callback(annotationDataURL);
        } else {
            showToast('Cannot export venue map in local mode — deploy to GitHub Pages', 'error');
        }
    };
    corsImg.src = 'venue-map.png?export=' + Date.now();
}

function vmExportPNG() {
    vmBuildExport((dataURL) => {
        const visibleNames = state.vmLayers.filter(l => l.visible).map(l => l.name);
        const suffix = visibleNames.length > 0 ? ' (' + visibleNames.join(', ') + ')' : '';

        const link = document.createElement('a');
        link.download = 'Venue Map' + suffix + '.png';
        link.href = dataURL;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        showToast('Map exported');
    });
}

function vmPrintMap() {
    const c = state.vmCanvas;
    if (!c) {
        showToast('Canvas not ready — navigate to Venue Map first', 'error');
        return;
    }

    const w = state.vmBaseWidth;
    const h = state.vmBaseHeight;
    const prevZoom = state.vmZoom;

    // Reset zoom to base dimensions for annotation export
    c.setZoom(1);
    c.setWidth(w);
    c.setHeight(h);
    c.renderAll();

    // Try direct full-canvas export (works on same-origin HTTP)
    let fullDataURL = null;
    try {
        fullDataURL = c.toDataURL({ format: 'png' });
    } catch (e) {
        // Canvas tainted — will use layered approach
    }

    // If direct export failed, get annotations-only as a transparent overlay
    let annotationDataURL = null;
    if (!fullDataURL && c.getObjects().length > 0) {
        const bg = c.backgroundImage;
        c.backgroundImage = null;
        c.renderAll();
        try {
            annotationDataURL = c.toDataURL({ format: 'png' });
        } catch (e) { /* shouldn't happen — annotations don't taint */ }
        c.backgroundImage = bg;
        c.renderAll();
    }

    // Restore zoom
    c.setZoom(prevZoom);
    c.setWidth(Math.round(w * prevZoom));
    c.setHeight(Math.round(h * prevZoom));
    c.renderAll();

    const visibleLayers = state.vmLayers.filter(l => l.visible);
    const legendHTML = visibleLayers.length > 0
        ? visibleLayers.map(l => `<span style="display:inline-flex;align-items:center;gap:4px;margin-right:12px;"><span style="display:inline-block;width:12px;height:12px;background:${l.color};border-radius:2px;"></span>${l.name}</span>`).join('')
        : 'No annotation layers';

    // Build the map image HTML — either a single composited image or layered images
    let mapHTML;
    if (fullDataURL) {
        mapHTML = `<img src="${fullDataURL}" style="max-width:100%; height:auto;" />`;
    } else {
        // Layered: use venue-map.png directly (always displayable) + annotation overlay
        mapHTML = `<div style="position:relative; display:inline-block; max-width:100%;">
            <img src="venue-map.png" style="width:100%; height:auto; display:block;" />
            ${annotationDataURL ? `<img src="${annotationDataURL}" style="position:absolute; top:0; left:0; width:100%; height:100%;" />` : ''}
        </div>`;
    }

    const printWindow = window.open('', '_blank');
    if (!printWindow) {
        showToast('Popup blocked — please allow popups for this site', 'error');
        return;
    }

    const html = `<!DOCTYPE html>
<html>
<head>
    <title>Venue Map - YMU Gala 2026</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'DM Sans', sans-serif; }
        .header { text-align: center; padding: 12px 0 8px; }
        .header h1 { font-size: 18px; color: #1a3a35; }
        .header p { font-size: 12px; color: #718096; margin-top: 2px; }
        .map { text-align: center; padding: 0 10px; }
        @media print {
            @page { size: landscape; margin: 0.4in; }
            * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
        }
    </style>
</head>
<body>
    <div class="header">
        <h1>YMU Gala 2026 - Venue Map</h1>
        <div style="display:flex;flex-wrap:wrap;justify-content:center;margin-top:4px;font-size:12px;color:#4a5568;">${legendHTML}</div>
    </div>
    <div class="map">
        ${mapHTML}
    </div>
</body>
</html>`;

    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.onload = () => {
        setTimeout(() => printWindow.print(), 250);
    };
}

// --- Zoom ---

function vmSetZoom(newZoom) {
    const c = state.vmCanvas;
    if (!c) return;
    newZoom = Math.max(0.25, Math.min(3, newZoom));
    state.vmZoom = newZoom;

    const newWidth = Math.round(state.vmBaseWidth * newZoom);
    const newHeight = Math.round(state.vmBaseHeight * newZoom);

    c.setZoom(newZoom);
    c.setWidth(newWidth);
    c.setHeight(newHeight);
    c.calcOffset();
    c.renderAll();

    const label = document.getElementById('vm-zoom-level');
    if (label) label.textContent = Math.round(newZoom * 100) + '%';
}

function vmZoomFit() {
    const wrapper = document.getElementById('vm-canvas-wrapper');
    if (!wrapper || !state.vmBaseWidth) return;
    const fitZoom = wrapper.clientWidth / state.vmBaseWidth;
    vmSetZoom(fitZoom);
}

function vmDeleteSelected() {
    const c = state.vmCanvas;
    if (!c) return;
    const active = c.getActiveObjects();
    if (active.length === 0) return;
    active.forEach(obj => c.remove(obj));
    c.discardActiveObject();
    c.renderAll();
    vmTriggerSave();
}

// --- Persistence (Firestore) ---

function vmTriggerSave() {
    if (state.vmAutoSaveTimeout) clearTimeout(state.vmAutoSaveTimeout);
    vmUpdateSaveStatus('Saving...');
    state.vmAutoSaveTimeout = setTimeout(() => vmSaveLayers(), 600);
}

function vmUpdateSaveStatus(text) {
    const el = document.getElementById('vm-save-status');
    if (el) el.textContent = text;
}

async function vmSaveLayers() {
    if (!state.vmCanvas || !state.vmImageLoaded) return;

    // Serialize each layer: metadata + its canvas objects
    const layersData = state.vmLayers.map(layer => {
        const objects = state.vmCanvas.getObjects().filter(o => o._vmLayerId === layer.id);
        const serialized = objects.map(o => {
            const json = o.toJSON(['_vmLayerId']);
            return json;
        });
        return {
            id: layer.id,
            name: layer.name,
            color: layer.color,
            visible: layer.visible,
            objects: serialized
        };
    });

    try {
        await collections.venueMapLayers.doc('default').set({
            layers: JSON.stringify(layersData),
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        vmUpdateSaveStatus('Saved');
        setTimeout(() => vmUpdateSaveStatus(''), 2000);
    } catch (error) {
        console.error('Error saving venue map layers:', error);
        vmUpdateSaveStatus('Error saving');
    }
}

async function vmLoadLayers() {
    try {
        const doc = await collections.venueMapLayers.doc('default').get();
        if (!doc.exists) {
            vmRenderLayers();
            return;
        }

        const data = doc.data();
        const layersData = JSON.parse(data.layers || '[]');

        state.vmLayers = layersData.map(ld => ({
            id: ld.id,
            name: ld.name,
            color: ld.color,
            visible: ld.visible
        }));

        if (state.vmLayers.length > 0) {
            state.vmActiveLayerId = state.vmLayers[0].id;
        }

        // Restore objects to canvas
        const c = state.vmCanvas;
        layersData.forEach(ld => {
            ld.objects.forEach(objJson => {
                fabric.util.enlivenObjects([objJson], (enlivened) => {
                    enlivened.forEach(obj => {
                        obj._vmLayerId = ld.id;
                        obj.visible = ld.visible;
                        c.add(obj);
                    });
                    c.renderAll();
                });
            });
        });

        vmRenderLayers();
    } catch (error) {
        console.error('Error loading venue map layers:', error);
        vmRenderLayers();
    }
}

// =============================================
// SET LISTS
// =============================================

function setupSetListPage() {
    document.getElementById('add-setlist-btn')?.addEventListener('click', () => openSetListModal());

    document.querySelectorAll('#setlist-stage-tabs .day-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('#setlist-stage-tabs .day-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            state.setListStageFilter = tab.dataset.setlistStage;
            renderSetLists();
        });
    });
}

function renderSetLists() {
    const container = document.getElementById('setlist-grid');
    if (!container) return;

    const total = state.setLists.length;
    const totalSongs = state.setLists.reduce((sum, sl) => sum + (sl.songs || []).length, 0);
    const totalMembers = state.setLists.reduce((sum, sl) => sum + (sl.members || []).length, 0);

    const setStat = (id, val) => { const e = document.getElementById(id); if (e) e.textContent = val; };
    setStat('setlist-stat-total', total);
    setStat('setlist-stat-songs', totalSongs);
    setStat('setlist-stat-members', totalMembers);

    let items = [...state.setLists];
    if (state.setListStageFilter !== 'all') {
        items = items.filter(sl => sl.stage === state.setListStageFilter);
    }

    const isSearching = state.setListSearch && state.setListSearch.trim().length > 0;
    if (isSearching) {
        const q = state.setListSearch.toLowerCase();
        items = items.filter(sl =>
            (sl.performer || '').toLowerCase().includes(q) ||
            (sl.songs || []).some(s => (s.title || '').toLowerCase().includes(q)) ||
            (sl.members || []).some(m => (m.name || '').toLowerCase().includes(q) || (m.phone || '').toLowerCase().includes(q))
        );
    }

    // Update search count
    const countEl = document.getElementById('setlist-search-count');
    if (countEl) {
        countEl.textContent = isSearching ? `${items.length} of ${total} performers` : `${total} performers`;
        countEl.style.display = total > 0 ? '' : 'none';
    }
    const clearBtn = document.getElementById('setlist-search-clear');
    if (clearBtn) clearBtn.style.display = isSearching ? '' : 'none';

    items.sort((a, b) => (a.performer || '').localeCompare(b.performer || ''));

    if (total === 0) {
        container.innerHTML = '<div class="staff-empty-state">No performers added yet. Click "+ Add Performer" to get started.</div>';
        return;
    }

    if (items.length === 0) {
        container.innerHTML = `<div class="staff-empty-state">No performers match "${escapeHtml(state.setListSearch)}"</div>`;
        return;
    }

    const PERFORMER_DAY_LABEL = { thursday: 'Thu', friday: 'Fri', saturday: 'Sat', sunday: 'Sun' };

    container.innerHTML = '<div class="setlist-accordion">' + items.map((sl, idx) => {
        const songs = sl.songs || [];
        const members = sl.members || [];
        const arrivals = sl.arrivals || {};
        const overrides = sl.performanceOverrides || {};
        const derived = getDerivedPerformanceTimes(sl.performer);
        const stageLabel = sl.stage === 'main' ? 'Main Stage'
            : sl.stage === 'cocktail' ? 'Cocktail Stage'
            : '';
        const isExpanded = state.setListsExpanded.has(sl.id);
        const songListHtml = songs.map((s, i) =>
            `<div class="setlist-song-row" draggable="true" data-song-index="${i}">
                <span class="song-drag-handle" title="Drag to reorder" aria-hidden="true">⋮⋮</span>
                <span class="song-number">${i + 1}.</span>
                <span class="song-title">${escapeHtml(s.title)}</span>
                ${s.duration ? `<span class="song-duration">${escapeHtml(s.duration)}</span>` : ''}
                ${s.notes ? `<span class="song-notes">${escapeHtml(s.notes)}</span>` : ''}
            </div>`
        ).join('');

        const soundchecks = getDerivedSoundcheckTimes(sl.performer);
        const dayRowsHtml = PERFORMER_DAY_KEYS.map(day => {
            const arrival = arrivals[day] || '';
            const override = overrides[day] || '';
            const derivedTimes = (derived[day] || []).filter(Boolean).map(t => formatTime12Hour(t));
            const soundcheckTimes = (soundchecks[day] || []).filter(Boolean).map(t => formatTime12Hour(t));
            const overrideFormatted = formatPerfOverride(override);
            const perfDisplay = overrideFormatted
                ? `${escapeHtml(overrideFormatted)} <span class="perf-manual-tag">(manual)</span>`
                : (derivedTimes.length ? derivedTimes.map(escapeHtml).join(', ') : '');
            const soundcheckDisplay = soundcheckTimes.length
                ? soundcheckTimes.map(escapeHtml).join(', ')
                : '';
            if (!arrival && !soundcheckDisplay && !perfDisplay) return '';
            return `
                <div class="performer-day-row">
                    <span class="performer-day-label">${PERFORMER_DAY_LABEL[day]}</span>
                    <span class="performer-day-field">${arrival ? `<span class="performer-field-label">Arrival</span> ${escapeHtml(arrival)}` : ''}</span>
                    <span class="performer-day-field">${soundcheckDisplay ? `<span class="performer-field-label">Soundcheck</span> ${soundcheckDisplay}` : ''}</span>
                    <span class="performer-day-field">${perfDisplay ? `<span class="performer-field-label">Perf</span> ${perfDisplay}` : ''}</span>
                </div>`;
        }).filter(Boolean).join('');

        const scheduleHtml = dayRowsHtml ? `<div class="performer-schedule">${dayRowsHtml}</div>` : '';

        const membersHtml = members.length > 0
            ? `<div class="performer-members">
                    <div class="performer-section-title">Members (${members.length})</div>
                    <div class="performer-members-list">
                        ${members.map(m => `
                            <div class="performer-member-row">
                                <span class="member-name">${escapeHtml(m.name || '')}</span>
                                ${m.phone ? `<a class="member-phone" href="tel:${escapeHtml((m.phone || '').replace(/\s|-/g, ''))}">${escapeHtml(m.phone)}</a>` : ''}
                            </div>`).join('')}
                    </div>
                </div>`
            : '';

        const hasSongs = songs.length > 0;
        const songSection = (hasSongs || sl.generalNotes || sl.stagePlotUrl)
            ? `<div class="performer-setlist-section">
                    ${hasSongs ? `<div class="performer-section-title">Set List (${songs.length} song${songs.length !== 1 ? 's' : ''}${sl.estimatedDuration ? ' \u00b7 ' + escapeHtml(sl.estimatedDuration) : ''})</div>
                        <div class="setlist-songs-list" data-setlist-id="${sl.id}">${songListHtml}</div>` : ''}
                    ${sl.generalNotes ? `<div class="setlist-notes">${escapeHtml(sl.generalNotes)}</div>` : ''}
                    ${sl.stagePlotUrl ? `<div class="setlist-stage-plot-link"><a href="${escapeHtml(sl.stagePlotUrl)}" target="_blank" class="btn btn-sm btn-secondary">View Stage Plot</a></div>` : ''}
               </div>`
            : '';

        const headerMeta = [
            members.length ? `${members.length} member${members.length !== 1 ? 's' : ''}` : '',
            songs.length ? `${songs.length} song${songs.length !== 1 ? 's' : ''}` : ''
        ].filter(Boolean).join(' \u00b7 ');

        return `
        <div class="setlist-accordion-item ${isExpanded ? 'expanded' : ''}" data-setlist-id="${sl.id}" style="animation-delay: ${idx * 40}ms">
            <div class="setlist-accordion-header" onclick="toggleSetListSongs('${sl.id}')">
                <span class="setlist-toggle-icon" id="setlist-toggle-icon-${sl.id}">${isExpanded ? '&#9660;' : '&#9654;'}</span>
                <span class="setlist-performer">${escapeHtml(sl.performer || '')}</span>
                ${stageLabel ? `<span class="setlist-stage-badge stage-${sl.stage}">${stageLabel}</span>` : ''}
                <span class="setlist-song-count">${headerMeta}</span>
                <span class="setlist-header-actions" onclick="event.stopPropagation()">
                    <button class="btn btn-edit btn-sm" onclick="openSetListModal('${sl.id}')">Edit</button>
                    <button class="btn btn-danger btn-sm" onclick="deleteSetList('${sl.id}')">Delete</button>
                </span>
            </div>
            <div class="setlist-accordion-body" id="setlist-songs-${sl.id}" style="display:${isExpanded ? '' : 'none'}">
                ${scheduleHtml}
                ${membersHtml}
                ${songSection}
            </div>
        </div>`;
    }).join('') + '</div>';

    attachSetListSongDragHandlers(container);
}

// Drag-to-reorder for songs within a set list (one-time delegation on container).
function attachSetListSongDragHandlers(container) {
    if (container.dataset.dragWired === '1') return;
    container.dataset.dragWired = '1';

    let dragFromIndex = null;
    let dragList = null;

    container.addEventListener('dragstart', (e) => {
        const row = e.target.closest('.setlist-song-row');
        if (!row) return;
        dragList = row.parentElement;
        dragFromIndex = parseInt(row.dataset.songIndex, 10);
        row.classList.add('song-dragging');
        e.dataTransfer.effectAllowed = 'move';
        try { e.dataTransfer.setData('text/plain', String(dragFromIndex)); } catch (_) { /* some browsers require this */ }
    });

    container.addEventListener('dragover', (e) => {
        if (!dragList) return;
        const row = e.target.closest('.setlist-song-row');
        if (!row || row.parentElement !== dragList) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        dragList.querySelectorAll('.song-drop-above, .song-drop-below').forEach(el => {
            el.classList.remove('song-drop-above', 'song-drop-below');
        });
        const rect = row.getBoundingClientRect();
        const above = (e.clientY - rect.top) < rect.height / 2;
        row.classList.add(above ? 'song-drop-above' : 'song-drop-below');
    });

    container.addEventListener('dragleave', (e) => {
        const row = e.target.closest('.setlist-song-row');
        if (row) row.classList.remove('song-drop-above', 'song-drop-below');
    });

    container.addEventListener('drop', async (e) => {
        if (!dragList || dragFromIndex === null) return;
        const targetRow = e.target.closest('.setlist-song-row');
        if (!targetRow || targetRow.parentElement !== dragList) return;
        e.preventDefault();
        const rect = targetRow.getBoundingClientRect();
        const above = (e.clientY - rect.top) < rect.height / 2;
        let toIndex = parseInt(targetRow.dataset.songIndex, 10);
        if (!above) toIndex += 1;
        // Adjust for removing the dragged item first
        if (toIndex > dragFromIndex) toIndex -= 1;

        const setlistId = dragList.dataset.setlistId;
        const from = dragFromIndex;
        dragFromIndex = null;
        dragList.querySelectorAll('.song-drop-above, .song-drop-below, .song-dragging').forEach(el => {
            el.classList.remove('song-drop-above', 'song-drop-below', 'song-dragging');
        });
        dragList = null;

        if (toIndex === from) return;
        await reorderSetListSong(setlistId, from, toIndex);
    });

    container.addEventListener('dragend', () => {
        container.querySelectorAll('.song-drop-above, .song-drop-below, .song-dragging').forEach(el => {
            el.classList.remove('song-drop-above', 'song-drop-below', 'song-dragging');
        });
        dragFromIndex = null;
        dragList = null;
    });
}

async function reorderSetListSong(setlistId, fromIndex, toIndex) {
    const sl = state.setLists.find(s => s.id === setlistId);
    if (!sl) return;
    const songs = [...(sl.songs || [])];
    if (fromIndex < 0 || fromIndex >= songs.length) return;
    if (toIndex < 0 || toIndex > songs.length) return;
    const [moved] = songs.splice(fromIndex, 1);
    songs.splice(toIndex, 0, moved);

    // Optimistic local update so the re-render shows the new order immediately.
    sl.songs = songs;
    state.setListsExpanded.add(setlistId);
    renderSetLists();

    try {
        await collections.setLists.doc(setlistId).update({
            songs,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
    } catch (err) {
        console.error('Error reordering songs:', err);
        showToast('Error saving song order', 'error');
    }
}

// Stash for the pending print job between modal open and confirm
let _pendingPrintSetLists = null;

function printSetLists() {
    // Use the same filter the user has applied on the page
    let items = [...state.setLists];
    if (state.setListStageFilter !== 'all') {
        items = items.filter(sl => sl.stage === state.setListStageFilter);
    }
    if (state.setListSearch && state.setListSearch.trim().length > 0) {
        const q = state.setListSearch.toLowerCase();
        items = items.filter(sl =>
            (sl.performer || '').toLowerCase().includes(q) ||
            (sl.songs || []).some(s => (s.title || '').toLowerCase().includes(q))
        );
    }

    if (items.length === 0) {
        showToast('No set lists to print', 'error');
        return;
    }

    // Sort: Main Stage first, then Cocktail, alphabetical by performer within each
    items.sort((a, b) => {
        if (a.stage !== b.stage) return a.stage === 'main' ? -1 : 1;
        return (a.performer || '').localeCompare(b.performer || '');
    });

    openPrintCopiesModal(items);
}

function openPrintCopiesModal(items) {
    _pendingPrintSetLists = items;
    const listEl = document.getElementById('print-copies-list');
    if (!listEl) return;
    const escAttr = (s) => String(s || '').replace(/"/g, '&quot;');
    listEl.innerHTML = items.map(sl => {
        const name = sl.performer || 'UNNAMED';
        const stageLabel = sl.stage === 'main' ? 'Main' : 'Cocktail';
        return `
            <div class="copies-row">
                <div class="copies-row-label">
                    <span class="copies-row-stage">${escAttr(stageLabel)}</span>
                    <span class="copies-row-name">${escAttr(name)}</span>
                </div>
                <input type="number" min="0" max="50" value="1" data-id="${escAttr(sl.id)}" class="copies-input" aria-label="Copies for ${escAttr(name)}">
            </div>`;
    }).join('');
    const modal = document.getElementById('print-copies-modal');
    if (modal) modal.classList.add('active');
}

function closePrintCopiesModal() {
    const modal = document.getElementById('print-copies-modal');
    if (modal) modal.classList.remove('active');
    _pendingPrintSetLists = null;
}

function setAllPrintCopies(n) {
    document.querySelectorAll('#print-copies-list .copies-input').forEach(i => {
        i.value = String(n);
    });
}

function confirmPrintCopies() {
    const items = _pendingPrintSetLists;
    if (!items) return;
    const copiesById = {};
    document.querySelectorAll('#print-copies-list .copies-input').forEach(i => {
        const n = parseInt(i.value, 10);
        copiesById[i.dataset.id] = Number.isFinite(n) && n >= 0 ? n : 1;
    });
    closePrintCopiesModal();
    generateSetListPrintWindow(items, copiesById);
}

function generateSetListPrintWindow(items, copiesById) {
    const esc = (s) => String(s || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

    // Wrap parenthetical groups in nowrap spans so "(SET 1)" etc. don't break
    const formatPerformer = (name) => {
        return esc(name || 'UNNAMED').toUpperCase()
            .replace(/\(([^)]+)\)/g, '<span style="white-space:nowrap">($1)</span>');
    };

    // Filter out bands with 0 copies so nothing prints for them
    const toPrint = items.filter(sl => (copiesById[sl.id] ?? 1) > 0);
    if (toPrint.length === 0) {
        showToast('No copies requested', 'error');
        return;
    }

    const pagesHtml = toPrint.flatMap(sl => {
        const songs = sl.songs || [];
        const stageLabel = sl.stage === 'main' ? 'Main Stage' : 'Cocktail Stage';
        const count = songs.length;

        const songsHtml = songs.length > 0
            ? songs.map(s => `
                    <tr class="song-row">
                        <td class="song-title">${esc(s.title)}</td>
                    </tr>`).join('')
            : '<tr><td class="no-songs">NO SONGS LISTED</td></tr>';

        const sectionHtml = `
            <section class="setlist-page">
                <header class="setlist-header">
                    <div class="stage-badge">${esc(stageLabel).toUpperCase()}</div>
                    <h1 class="performer-name">${formatPerformer(sl.performer)}</h1>
                    <div class="meta">
                        <span>${count} SONG${count !== 1 ? 'S' : ''}</span>
                        ${sl.estimatedDuration ? `<span class="dot">•</span><span>${esc(sl.estimatedDuration).toUpperCase()}</span>` : ''}
                    </div>
                </header>
                <div class="song-list-wrap">
                    <table class="song-list"><tbody>${songsHtml}</tbody></table>
                </div>
                ${sl.generalNotes ? `<footer class="setlist-notes">${esc(sl.generalNotes).toUpperCase()}</footer>` : ''}
            </section>`;
        const copies = copiesById[sl.id] ?? 1;
        return Array(copies).fill(sectionHtml);
    }).join('');

    const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>Set Lists — YMU Gala 2026</title>
<style>
    @page {
        size: letter portrait;
        margin: 0;
    }
    * { box-sizing: border-box; }
    html, body {
        margin: 0;
        padding: 0;
        background: #fff;
        color: #000;
        font-family: 'Impact', 'Arial Black', 'Helvetica Neue', Arial, sans-serif;
        -webkit-font-smoothing: antialiased;
        /* Force layout to always use exact 816px (8.5in @ 96dpi) width so the
           fit calculations match the print paper size regardless of browser viewport */
        width: 816px;
        min-width: 816px;
    }
    .setlist-page {
        /* Exact portrait letter dimensions. Identical for screen and print. */
        width: 816px;
        height: 1056px;
        /* Generous top/bottom padding leaves room for any browser-added
           print headers/footers so content never gets clipped. */
        padding: 72px 58px; /* 0.75in x 0.6in at 96dpi */
        page-break-after: always;
        break-after: page;
        display: flex;
        flex-direction: column;
        align-items: stretch;
        text-align: center;
        overflow: hidden;
    }
    .setlist-page:last-child {
        page-break-after: auto;
        break-after: auto;
    }
    .setlist-header {
        width: 100%;
        border-bottom: 6px solid #000;
        padding-bottom: 0.15in;
        margin-bottom: 0.15in;
        flex-shrink: 0;
    }
    .stage-badge {
        display: inline-block;
        font-size: 16pt;
        letter-spacing: 0.25em;
        font-weight: 900;
        padding: 3px 14px;
        border: 3px solid #000;
        margin-bottom: 6px;
    }
    .performer-name {
        font-size: 46pt;
        line-height: 0.95;
        margin: 2px 0 4px;
        font-weight: 900;
        letter-spacing: 0.01em;
        text-transform: uppercase;
    }
    .meta {
        font-size: 13pt;
        font-weight: 700;
        letter-spacing: 0.15em;
    }
    .meta .dot { margin: 0 8px; }
    .song-list-wrap {
        flex: 1;
        min-height: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        width: 100%;
        overflow: hidden;
    }
    .song-list {
        /* Table layout gives us vertically-aligned number and title columns.
           The whole table is auto-centered as a single block. */
        margin: 0 auto;
        border-collapse: collapse;
        max-width: 100%;
    }
    .song-row { }
    .song-title {
        vertical-align: baseline;
        font-weight: 900;
        line-height: 1.05;
        padding: 0.08em 0;
        text-transform: uppercase;
        text-align: center;
        white-space: nowrap;
    }
    .no-songs {
        font-size: 48pt;
        font-weight: 900;
        color: #999;
        text-align: center;
        padding: 1in 0;
    }
    .setlist-notes {
        margin-top: 0.15in;
        padding-top: 0.12in;
        border-top: 3px solid #000;
        font-size: 12pt;
        font-weight: 700;
        letter-spacing: 0.08em;
        width: 100%;
        flex-shrink: 0;
    }
    @media screen {
        body { background: #333; padding: 20px 0; }
        .setlist-page {
            background: #fff;
            box-shadow: 0 8px 40px rgba(0,0,0,0.4);
            margin: 0 auto 20px;
        }
    }
</style>
</head>
<body>
    ${pagesHtml}
    <script>
        // Math-based fit: measure at reference size, compute scale, snap to target.
        function setRowFontSize(row, px) {
            row.style.fontSize = px + 'px';
        }
        function fitPages() {
            document.querySelectorAll('.setlist-page').forEach(page => {
                const header = page.querySelector('.setlist-header');
                const wrap = page.querySelector('.song-list-wrap');
                const list = page.querySelector('.song-list');
                const perf = page.querySelector('.performer-name');
                if (!list || !wrap) return;
                const rows = [...list.querySelectorAll('.song-row')];
                if (rows.length === 0) return;

                // 1) Shrink performer name if header too tall (long band names wrap)
                let perfSize = parseFloat(getComputedStyle(perf).fontSize);
                let guard = 60;
                const maxHeaderH = 280; // ~2.9in budget for header
                while (header.offsetHeight > maxHeaderH && perfSize > 20 && guard-- > 0) {
                    perfSize -= 2;
                    perf.style.fontSize = perfSize + 'px';
                }

                // 2) Measure song list at a reference font size
                const REF = 40;
                rows.forEach(r => setRowFontSize(r, REF));
                // Force reflow
                void list.offsetHeight;
                const refH = list.offsetHeight;
                const refW = list.offsetWidth;
                if (refH === 0 || refW === 0) return;

                // 3) Compute ideal scale to fit both dimensions
                const availH = wrap.clientHeight - 10;
                const availW = wrap.clientWidth - 20;
                const scale = Math.min(availH / refH, availW / refW);
                // Apply a 0.96 safety factor and cap maximum so single-song
                // pages don't get absurdly huge.
                let songSize = Math.floor(REF * scale * 0.96);
                songSize = Math.max(12, Math.min(songSize, 260));
                rows.forEach(r => setRowFontSize(r, songSize));

                // 4) Fine-tune: small corrections if slightly off after scale
                guard = 40;
                while ((list.offsetHeight > availH || list.offsetWidth > availW) && songSize > 12 && guard-- > 0) {
                    songSize -= 2;
                    rows.forEach(r => setRowFontSize(r, songSize));
                }
            });
        }
        function runFitAndPrint() {
            fitPages();
            // Run twice — first pass may change layout; second pass re-fits if needed
            fitPages();
            setTimeout(() => { window.print(); }, 250);
        }
        if (document.readyState === 'complete') {
            runFitAndPrint();
        } else {
            window.addEventListener('load', runFitAndPrint);
        }
    <\/script>
</body>
</html>`;

    const w = window.open('', '_blank');
    if (!w) {
        showToast('Please allow popups to print set lists', 'error');
        return;
    }
    w.document.open();
    w.document.write(html);
    w.document.close();
}

window.printSetLists = printSetLists;
window.openPrintCopiesModal = openPrintCopiesModal;
window.closePrintCopiesModal = closePrintCopiesModal;
window.setAllPrintCopies = setAllPrintCopies;
window.confirmPrintCopies = confirmPrintCopies;

// =============================================
// PERFORMER CONTACT SHEET PRINT (new-window)
// =============================================

function printPerformerContactSheets() {
    let items = [...state.setLists];
    if (state.setListStageFilter !== 'all') {
        items = items.filter(sl => sl.stage === state.setListStageFilter);
    }
    if (state.setListSearch && state.setListSearch.trim().length > 0) {
        const q = state.setListSearch.toLowerCase();
        items = items.filter(sl =>
            (sl.performer || '').toLowerCase().includes(q) ||
            (sl.songs || []).some(s => (s.title || '').toLowerCase().includes(q)) ||
            (sl.members || []).some(m => (m.name || '').toLowerCase().includes(q) || (m.phone || '').toLowerCase().includes(q))
        );
    }
    if (items.length === 0) {
        showToast('No performers to print', 'error');
        return;
    }
    items.sort((a, b) => (a.performer || '').localeCompare(b.performer || ''));
    generatePerformerContactWindow(items);
}

function generatePerformerContactWindow(items) {
    const esc = (s) => String(s || '').replace(/[&<>"']/g,
        c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    const dayOrder = ['thursday', 'friday', 'saturday', 'sunday'];
    const dayLabels = { thursday: 'Thu', friday: 'Fri', saturday: 'Sat', sunday: 'Sun' };
    const today = new Date().toISOString().split('T')[0];
    const total = items.length;

    const pagesHtml = items.map((sl, idx) => {
        const members = sl.members || [];
        const arrivals = sl.arrivals || {};
        const overrides = sl.performanceOverrides || {};
        const derived = getDerivedPerformanceTimes(sl.performer);
        const stageLabel = sl.stage === 'main' ? 'Main Stage'
            : sl.stage === 'cocktail' ? 'Cocktail Stage'
            : '';

        const soundchecks = getDerivedSoundcheckTimes(sl.performer);
        const scheduleRows = dayOrder.map(day => {
            const arrival = arrivals[day] || '';
            const override = overrides[day] || '';
            const derivedTimes = (derived[day] || []).filter(Boolean).map(t => formatTime12Hour(t));
            const soundcheckTimes = (soundchecks[day] || []).filter(Boolean).map(t => formatTime12Hour(t));
            const perf = formatPerfOverride(override) || derivedTimes.join(', ');
            const soundcheck = soundcheckTimes.join(', ');
            if (!arrival && !perf && !soundcheck) return '';
            return `
                <tr>
                    <td class="day">${dayLabels[day]}</td>
                    <td>${esc(arrival)}</td>
                    <td>${esc(soundcheck)}</td>
                    <td>${esc(perf)}</td>
                </tr>`;
        }).filter(Boolean).join('');

        const scheduleSection = scheduleRows
            ? `<table class="schedule-table">
                   <thead><tr><th>Day</th><th>Arrival</th><th>Soundcheck</th><th>Performance</th></tr></thead>
                   <tbody>${scheduleRows}</tbody>
               </table>`
            : '<p class="empty-note">No schedule recorded.</p>';

        const membersSection = members.length > 0
            ? `<table class="members-table">
                   <thead><tr><th>Name</th><th>Phone</th></tr></thead>
                   <tbody>
                       ${members.map(m => `
                           <tr>
                               <td>${esc(m.name || '')}</td>
                               <td class="phone">${esc(m.phone || '')}</td>
                           </tr>`).join('')}
                   </tbody>
               </table>`
            : '<p class="empty-note">No members listed.</p>';

        return `
            <section class="contact-page">
                <header class="contact-header">
                    <h1 class="contact-name">${esc(sl.performer || 'Unnamed')}</h1>
                    ${stageLabel ? `<span class="contact-stage">${esc(stageLabel)}</span>` : ''}
                </header>
                <div class="contact-section">
                    <h2>Schedule</h2>
                    ${scheduleSection}
                </div>
                <div class="contact-section">
                    <h2>Members</h2>
                    ${membersSection}
                </div>
                <footer class="contact-footer">Page ${idx + 1} of ${total} · Printed ${today}</footer>
            </section>`;
    }).join('');

    const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>Performer Contact Sheets — YMU Gala 2026</title>
<style>
    @page { size: letter portrait; margin: 0.45in; }
    * { box-sizing: border-box; }
    html, body {
        margin: 0; padding: 0;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
        color: #222;
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
    }
    .contact-page {
        page-break-after: always;
        break-after: page;
        padding: 0;
    }
    .contact-page:last-child {
        page-break-after: auto;
        break-after: auto;
    }
    .contact-header {
        border-bottom: 3px solid #1a3a35;
        padding-bottom: 14px;
        margin-bottom: 22px;
        display: flex;
        align-items: baseline;
        justify-content: space-between;
        gap: 1rem;
    }
    .contact-name {
        margin: 0;
        font-size: 32pt;
        font-weight: 800;
        letter-spacing: 0.01em;
        line-height: 1.05;
    }
    .contact-stage {
        font-size: 11pt;
        font-weight: 700;
        letter-spacing: 0.15em;
        text-transform: uppercase;
        color: #1a3a35;
        border: 2px solid #1a3a35;
        padding: 4px 10px;
        border-radius: 4px;
    }
    .contact-section {
        margin-bottom: 28px;
    }
    .contact-section h2 {
        font-size: 10pt;
        font-weight: 700;
        letter-spacing: 0.1em;
        text-transform: uppercase;
        color: #6b7280;
        margin: 0 0 10px;
        border-bottom: 1px solid #d1d5db;
        padding-bottom: 4px;
    }
    table {
        width: 100%;
        border-collapse: collapse;
        font-size: 11pt;
    }
    th, td {
        padding: 6px 10px;
        border-bottom: 1px solid #e5e7eb;
        text-align: left;
        vertical-align: top;
    }
    thead th {
        background: #faf8f3;
        font-size: 9pt;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        color: #374151;
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
    }
    .schedule-table .day {
        width: 60px;
        font-weight: 700;
        text-transform: uppercase;
    }
    .members-table td.phone {
        font-variant-numeric: tabular-nums;
        width: 180px;
        white-space: nowrap;
    }
    .empty-note {
        color: #9ca3af;
        font-style: italic;
        margin: 0;
    }
    tr { page-break-inside: avoid; }
    thead { display: table-header-group; }
    .contact-footer {
        position: absolute;
        bottom: 0.2in;
        left: 0;
        right: 0;
        text-align: center;
        font-size: 8pt;
        color: #9ca3af;
        letter-spacing: 0.05em;
    }
    @media screen {
        body { background: #e5e7eb; padding: 20px; }
        .contact-page {
            background: #fff;
            box-shadow: 0 4px 20px rgba(0,0,0,0.15);
            padding: 40px;
            margin: 0 auto 20px;
            max-width: 7.5in;
            min-height: 10in;
            position: relative;
        }
    }
</style>
</head>
<body>
    ${pagesHtml}
    <script>
        if (document.readyState === 'complete') {
            setTimeout(() => window.print(), 150);
        } else {
            window.addEventListener('load', () => setTimeout(() => window.print(), 150));
        }
    <\/script>
</body>
</html>`;

    const w = window.open('', '_blank');
    if (!w) {
        showToast('Please allow popups to print contact sheets', 'error');
        return;
    }
    w.document.open();
    w.document.write(html);
    w.document.close();
}

window.printPerformerContactSheets = printPerformerContactSheets;

// =============================================
// STAFF PRINT (team-scoped, new-window)
// =============================================

function openPrintStaffTeamsModal() {
    const listEl = document.getElementById('print-staff-teams-list');
    if (!listEl) return;

    // Collect unique teams from state.staff (use 'Unassigned' for empty teams array)
    const teamCounts = new Map();
    for (const m of state.staff) {
        const teams = (m.teams && m.teams.length > 0) ? m.teams : ['Unassigned'];
        for (const t of teams) {
            teamCounts.set(t, (teamCounts.get(t) || 0) + 1);
        }
    }

    if (teamCounts.size === 0) {
        showToast('No staff to print', 'error');
        return;
    }

    const sortedTeams = [...teamCounts.keys()].sort((a, b) =>
        a.localeCompare(b, undefined, { sensitivity: 'base' })
    );

    const escAttr = (s) => String(s || '').replace(/"/g, '&quot;');
    listEl.innerHTML = sortedTeams.map(team => {
        const color = getTeamColor(team);
        const count = teamCounts.get(team);
        return `
            <label class="copies-row staff-team-row">
                <div class="copies-row-label">
                    <input type="checkbox" class="staff-team-check" data-team="${escAttr(team)}" checked>
                    <span class="staff-team-swatch" style="background:${color}"></span>
                    <span class="copies-row-name">${escapeHtml(team)}</span>
                    <span class="staff-team-count">(${count})</span>
                </div>
            </label>`;
    }).join('');

    const modal = document.getElementById('print-staff-teams-modal');
    if (modal) modal.classList.add('active');
}

function closePrintStaffTeamsModal() {
    const modal = document.getElementById('print-staff-teams-modal');
    if (modal) modal.classList.remove('active');
}

function setAllPrintStaffTeams(checked) {
    document.querySelectorAll('#print-staff-teams-list .staff-team-check').forEach(cb => {
        cb.checked = !!checked;
    });
}

function confirmPrintStaffTeams() {
    const selected = [];
    document.querySelectorAll('#print-staff-teams-list .staff-team-check:checked').forEach(cb => {
        selected.push(cb.dataset.team);
    });
    if (selected.length === 0) {
        showToast('Select at least one team to print', 'error');
        return;
    }
    closePrintStaffTeamsModal();
    generateStaffPrintWindow(selected);
}

function generateStaffPrintWindow(selectedTeams) {
    const esc = (s) => String(s || '').replace(/[&<>"']/g,
        c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    const selectedSet = new Set(selectedTeams);

    // Expand staff into {team, member} rows, filter to selected, then group
    const byTeam = new Map();
    for (const m of state.staff) {
        const teams = (m.teams && m.teams.length > 0) ? m.teams : ['Unassigned'];
        for (const t of teams) {
            if (!selectedSet.has(t)) continue;
            if (!byTeam.has(t)) byTeam.set(t, []);
            byTeam.get(t).push(m);
        }
    }

    // Drop empty teams (no staff after filtering — shouldn't happen here but guard anyway)
    const teamOrder = [...byTeam.keys()]
        .filter(t => byTeam.get(t).length > 0)
        .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));

    if (teamOrder.length === 0) {
        showToast('No staff to print in selected teams', 'error');
        return;
    }

    const totalPages = teamOrder.length;
    const printedDate = new Date().toISOString().split('T')[0];

    const dayKeys = ['thursday', 'friday', 'saturday', 'sunday'];
    const dayLabels = ['Thursday', 'Friday', 'Saturday', 'Sunday'];

    const pagesHtml = teamOrder.map((team, idx) => {
        const color = getTeamColor(team);
        const members = byTeam.get(team).slice().sort((a, b) =>
            (a.name || '').localeCompare(b.name || '', undefined, { sensitivity: 'base' })
        );

        const rowsHtml = members.map(m => {
            const otherTeams = (m.teams || []).filter(t => t !== team).join(', ');
            const sched = m.schedule || {};
            const dayCells = dayKeys.map(d => {
                const val = sched[d];
                return val
                    ? `<td class="sched">${esc(val)}</td>`
                    : `<td class="sched empty">—</td>`;
            }).join('');
            return `
                <tr>
                    <td class="name">${esc(m.name || '')}</td>
                    <td class="role">${esc(m.role || '')}</td>
                    <td class="other-teams">${esc(otherTeams)}</td>
                    ${dayCells}
                </tr>`;
        }).join('');

        return `
            <section class="team-page">
                <header class="team-banner" style="background:${color}">
                    <h1 class="team-name">${esc(team)}</h1>
                    <div class="team-meta">${members.length} STAFF · YMU GALA 2026</div>
                </header>
                <table class="staff-table">
                    <thead>
                        <tr>
                            <th class="name">Name</th>
                            <th class="role">Role</th>
                            <th class="other-teams">Other Teams</th>
                            ${dayLabels.map(d => `<th class="sched">${d}</th>`).join('')}
                        </tr>
                    </thead>
                    <tbody>${rowsHtml}</tbody>
                </table>
                <footer class="page-footer">Page ${idx + 1} of ${totalPages} · Printed ${printedDate}</footer>
            </section>`;
    }).join('');

    const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>Staff List — YMU Gala 2026</title>
<style>
    @page {
        size: letter landscape;
        margin: 0.4in;
    }
    * { box-sizing: border-box; }
    html, body {
        margin: 0;
        padding: 0;
        background: #fff;
        color: #222;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
        -webkit-font-smoothing: antialiased;
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
    }
    .team-page {
        page-break-after: always;
        break-after: page;
        padding: 0;
    }
    .team-page:last-child {
        page-break-after: auto;
        break-after: auto;
    }
    .team-banner {
        color: #fff;
        padding: 18px 22px 14px;
        margin-bottom: 14px;
        border-radius: 4px;
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
    }
    .team-name {
        margin: 0;
        font-size: 28pt;
        font-weight: 800;
        letter-spacing: 0.01em;
        text-transform: uppercase;
        line-height: 1.05;
    }
    .team-meta {
        margin-top: 4px;
        font-size: 9pt;
        font-weight: 600;
        letter-spacing: 0.15em;
        opacity: 0.92;
    }
    .staff-table {
        width: 100%;
        border-collapse: collapse;
        font-size: 9.5pt;
    }
    .staff-table thead th {
        text-align: left;
        padding: 6px 8px;
        background: #f3f4f6;
        border-bottom: 2px solid #222;
        font-size: 8pt;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        font-weight: 700;
        color: #374151;
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
    }
    .staff-table tbody td {
        padding: 5px 8px;
        border-bottom: 1px solid #e5e7eb;
        vertical-align: top;
    }
    .staff-table tbody tr:nth-child(even) td {
        background: #fafafa;
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
    }
    .staff-table th.name, .staff-table td.name {
        width: 1.5in;
        font-weight: 600;
    }
    .staff-table th.role, .staff-table td.role {
        width: 1.8in;
    }
    .staff-table th.other-teams, .staff-table td.other-teams {
        width: 1.5in;
        color: #6b7280;
        font-size: 8.5pt;
    }
    .staff-table th.sched, .staff-table td.sched {
        width: 1.3in;
        white-space: nowrap;
        font-variant-numeric: tabular-nums;
    }
    .staff-table td.sched.empty {
        color: #d1d5db;
    }
    tr { page-break-inside: avoid; }
    thead { display: table-header-group; }
    .page-footer {
        margin-top: 12px;
        text-align: center;
        font-size: 8pt;
        color: #9ca3af;
        letter-spacing: 0.05em;
    }
    @media screen {
        body { background: #e5e7eb; padding: 20px; }
        .team-page {
            background: #fff;
            box-shadow: 0 4px 20px rgba(0,0,0,0.15);
            padding: 32px;
            margin: 0 auto 20px;
            max-width: 10in;
        }
    }
</style>
</head>
<body>
    ${pagesHtml}
    <script>
        if (document.readyState === 'complete') {
            setTimeout(() => window.print(), 150);
        } else {
            window.addEventListener('load', () => setTimeout(() => window.print(), 150));
        }
    <\/script>
</body>
</html>`;

    const w = window.open('', '_blank');
    if (!w) {
        showToast('Please allow popups to print staff list', 'error');
        return;
    }
    w.document.open();
    w.document.write(html);
    w.document.close();
}

window.openPrintStaffTeamsModal = openPrintStaffTeamsModal;
window.closePrintStaffTeamsModal = closePrintStaffTeamsModal;
window.setAllPrintStaffTeams = setAllPrintStaffTeams;
window.confirmPrintStaffTeams = confirmPrintStaffTeams;

// --- Check-In List (staff + on-site vendors) ---
const CHECKIN_DAY_KEYS = ['thursday', 'friday', 'saturday', 'sunday'];
const CHECKIN_DAY_LABELS = { thursday: 'Thursday', friday: 'Friday', saturday: 'Saturday', sunday: 'Sunday' };
const CHECKIN_DAY_COLORS = { thursday: '#4a90a4', friday: '#7b6cb0', saturday: '#d4795c', sunday: '#4aaa7a' };

function hasAnySchedule(sched) {
    if (!sched) return false;
    return CHECKIN_DAY_KEYS.some(d => sched[d]);
}

function buildCheckInPeople() {
    const people = [];

    for (const m of state.staff) {
        const linked = getLinkedBudget(m);
        const team = (m.teams && m.teams.length > 0) ? m.teams[0] : 'Staff';
        const displayName = m.name || m.role || 'TBD';
        people.push({
            id: 's_' + m.id,
            name: displayName,
            role: m.role || '',
            team,
            schedule: m.schedule || {},
            phone: m.phone || (linked && linked.phone) || '',
            email: m.email || (linked && linked.email) || '',
            source: 'staff',
            isPlaceholder: !!m.isPlaceholder
        });
    }

    for (const b of state.budget) {
        if (b.linkedStaffId) continue; // represented by the linked staff entry
        if (b.offSite === true) continue; // hidden from check-in list
        if (!hasAnySchedule(b.schedule)) continue;
        const hasContact = !!(b.contact && b.contact.trim());
        people.push({
            id: 'b_' + b.id,
            name: hasContact ? b.contact : (b.vendor || 'Unnamed vendor'),
            role: hasContact ? (b.vendor || '') : (b.description || ''),
            team: 'Vendor',
            schedule: b.schedule || {},
            phone: b.phone || '',
            email: b.email || '',
            source: 'vendor',
            isPlaceholder: false
        });
    }

    return people.sort((a, b) =>
        (a.name || '').localeCompare(b.name || '', undefined, { sensitivity: 'base' })
    );
}

function openPrintCheckInModal() {
    const listEl = document.getElementById('print-checkin-days-list');
    if (!listEl) return;

    const people = buildCheckInPeople();
    const counts = {};
    for (const d of CHECKIN_DAY_KEYS) {
        counts[d] = people.filter(p => p.schedule[d]).length;
    }

    listEl.innerHTML = CHECKIN_DAY_KEYS.map(d => `
        <label class="copies-row staff-team-row">
            <div class="copies-row-label">
                <input type="checkbox" class="checkin-day-check" data-day="${d}" checked>
                <span class="staff-team-swatch" style="background:${CHECKIN_DAY_COLORS[d]}"></span>
                <span class="copies-row-name">${CHECKIN_DAY_LABELS[d]}</span>
                <span class="staff-team-count">(${counts[d]})</span>
            </div>
        </label>`).join('');

    // Surface people with no schedule at all — they won't appear on any printed day.
    const unscheduled = people.filter(p => !CHECKIN_DAY_KEYS.some(d => p.schedule[d]));
    let hintEl = document.getElementById('print-checkin-unscheduled-hint');
    if (!hintEl) {
        hintEl = document.createElement('div');
        hintEl.id = 'print-checkin-unscheduled-hint';
        hintEl.className = 'form-helper';
        hintEl.style.marginTop = '12px';
        listEl.parentNode.insertBefore(hintEl, listEl.nextSibling);
    }
    if (unscheduled.length > 0) {
        const staffCount = unscheduled.filter(p => p.source === 'staff').length;
        const vendorCount = unscheduled.length - staffCount;
        const parts = [];
        if (staffCount) parts.push(staffCount + ' staff');
        if (vendorCount) parts.push(vendorCount + ' vendor' + (vendorCount === 1 ? '' : 's'));
        hintEl.innerHTML = '⚠ ' + parts.join(' and ') + ' have no schedule on any day and won\'t appear on the printout. Open them to set Thu/Fri/Sat/Sun times.';
        hintEl.style.display = '';
    } else {
        hintEl.style.display = 'none';
    }

    const modal = document.getElementById('print-checkin-modal');
    if (modal) modal.classList.add('active');
}

function closePrintCheckInModal() {
    const modal = document.getElementById('print-checkin-modal');
    if (modal) modal.classList.remove('active');
}

function confirmPrintCheckInList() {
    const selected = [];
    document.querySelectorAll('#print-checkin-days-list .checkin-day-check:checked').forEach(cb => {
        selected.push(cb.dataset.day);
    });
    if (selected.length === 0) {
        showToast('Select at least one day', 'error');
        return;
    }
    closePrintCheckInModal();
    generateCheckInPrintWindow(selected);
}

function abbreviateTeam(team) {
    if (!team) return '';
    let t = String(team).trim().replace(/\s+team\s*$/i, '');
    if (/^mainstage production$/i.test(t)) t = 'Mainstage';
    return t;
}

function formatCheckInHours(h) {
    // h = decimal hours, may exceed 24 for past-midnight ranges. Collapse to 12-hour label.
    let hh = ((Math.floor(h) % 24) + 24) % 24;
    let mm = Math.round((h - Math.floor(h)) * 60);
    if (mm === 60) { hh = (hh + 1) % 24; mm = 0; }
    const ampm = hh >= 12 ? 'pm' : 'am';
    const display = hh === 0 ? 12 : (hh > 12 ? hh - 12 : hh);
    return display + (mm === 0 ? '' : ':' + String(mm).padStart(2, '0')) + ampm;
}

function normalizeTimeForPrint(raw) {
    if (!raw) return '';
    // Accept semicolon-for-colon typos and double-seconds forms like "10:30:00 PM"
    let cleaned = String(raw)
        .replace(/;/g, ':')
        .replace(/(\d{1,2}:\d{2}):\d{2}\b/g, '$1'); // strip trailing :SS

    // Split on "/" for multi-range schedules (e.g. "1-5pm / 10:30pm - 2:30am")
    const parts = cleaned.split('/').map(p => p.trim()).filter(Boolean);
    const formatted = [];
    // Detect am/pm anywhere — just look for 'a' or 'p' adjacent to digits or at word boundary
    const hasAmPm = s => /[ap]m?\b/i.test(s);

    for (const part of parts) {
        const halves = part.split(/\s*[-–—]\s*/);
        if (halves.length !== 2) { formatted.push(part); continue; }
        let [startStr, endStr] = halves.map(h => h.trim());
        // If start lacks am/pm but end has it, inherit — "1-5pm" → "1pm-5pm"
        if (!hasAmPm(startStr) && hasAmPm(endStr)) {
            const suffix = /p/i.test(endStr) ? 'pm' : 'am';
            startStr = startStr + suffix;
        }
        const start = parseStaffTime(startStr);
        let end = parseStaffTime(endStr);
        if (start === null || end === null) { formatted.push(part); continue; }
        if (end <= start) end += 24;
        formatted.push(formatCheckInHours(start) + '–' + formatCheckInHours(end));
    }
    return formatted.join(' / ');
}

function normalizePhoneForPrint(raw) {
    if (!raw) return '';
    const digits = String(raw).replace(/\D/g, '');
    if (digits.length === 10) {
        return '(' + digits.slice(0,3) + ') ' + digits.slice(3,6) + '-' + digits.slice(6);
    }
    if (digits.length === 11 && digits[0] === '1') {
        return '(' + digits.slice(1,4) + ') ' + digits.slice(4,7) + '-' + digits.slice(7);
    }
    // Not a recognizable phone — suppress obvious junk (e.g. names in the phone field)
    if (digits.length < 7) return '';
    return String(raw).trim();
}

function generateCheckInPrintWindow(days) {
    const esc = (s) => String(s || '').replace(/[&<>"']/g,
        c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    const dash = '<span class="empty">—</span>';
    const printedDate = new Date().toISOString().split('T')[0];

    const people = buildCheckInPeople();

    const pagesHtml = days.map(day => {
        const color = CHECKIN_DAY_COLORS[day];
        const label = CHECKIN_DAY_LABELS[day];
        const dayPeople = people
            .filter(p => p.schedule[day])
            .sort((a, b) => (a.name || '').localeCompare(b.name || '', undefined, { sensitivity: 'base' }));

        if (dayPeople.length === 0) {
            return `
                <section class="team-page">
                    <header class="team-banner" style="background:${color}">
                        <h1 class="team-name">${esc(label)} Check-In</h1>
                        <div class="team-meta">0 PEOPLE · YMU GALA 2026 · PRINTED ${printedDate}</div>
                    </header>
                    <div class="empty-day">No one scheduled for ${esc(label)}.</div>
                </section>`;
        }

        const rows = dayPeople.map(p => {
            const phone = normalizePhoneForPrint(p.phone);
            const email = (p.email || '').trim();
            const time = normalizeTimeForPrint(p.schedule[day]);
            const nameCell = p.isPlaceholder
                ? `<span class="tbd-tag">TBD</span> ${esc(p.name)}`
                : esc(p.name);
            return `
                <tr class="${p.isPlaceholder ? 'placeholder-row' : ''}">
                    <td class="check"><span class="checkbox-cell"></span></td>
                    <td class="name">${nameCell}</td>
                    <td class="role">${esc(p.role)}</td>
                    <td class="team">${esc(abbreviateTeam(p.team))}</td>
                    <td class="sched">${esc(time)}</td>
                    <td class="phone">${phone ? esc(phone) : dash}</td>
                    <td class="email">${email ? esc(email) : dash}</td>
                </tr>`;
        }).join('');

        return `
            <section class="team-page">
                <table class="staff-table">
                    <thead>
                        <tr class="running-header">
                            <th colspan="7" class="running-banner" style="background:${color}">
                                <span class="rb-title">${esc(label)} Check-In</span>
                                <span class="rb-meta">${dayPeople.length} people · YMU Gala 2026 · Printed ${printedDate}</span>
                            </th>
                        </tr>
                        <tr class="col-headers">
                            <th class="check"></th>
                            <th class="name">Name</th>
                            <th class="role">Role / Company</th>
                            <th class="team">Team</th>
                            <th class="sched">Time</th>
                            <th class="phone">Phone</th>
                            <th class="email">Email</th>
                        </tr>
                    </thead>
                    <tbody>${rows}</tbody>
                </table>
            </section>`;
    }).join('');

    const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>Check-In List — YMU Gala 2026</title>
<style>
    /* margin:0 on @page suppresses browser-injected header/footer (date, URL, "about:blank", page numbers). Our own padding lives on the section. */
    @page { size: letter landscape; margin: 0; }
    * { box-sizing: border-box; }
    html, body {
        margin: 0; padding: 0; background: #fff; color: #222;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
        -webkit-font-smoothing: antialiased;
        -webkit-print-color-adjust: exact; print-color-adjust: exact;
    }
    .team-page {
        page-break-after: always; break-after: page;
        padding: 0.4in 0.4in 0.3in;
    }
    .team-page:last-child { page-break-after: auto; break-after: auto; }

    /* Empty-day section still uses the old big banner (no table means nothing to repeat) */
    .team-banner {
        color: #fff; padding: 18px 22px 14px; margin-bottom: 14px; border-radius: 4px;
        -webkit-print-color-adjust: exact; print-color-adjust: exact;
    }
    .team-name { margin: 0; font-size: 28pt; font-weight: 800; letter-spacing: 0.01em; text-transform: uppercase; line-height: 1.05; }
    .team-meta { margin-top: 4px; font-size: 9pt; font-weight: 600; letter-spacing: 0.15em; opacity: 0.92; }

    .staff-table { width: 100%; border-collapse: collapse; font-size: 9.5pt; }

    /* Running header: lives inside <thead>, repeats on every physical page automatically */
    .running-banner {
        color: #fff; text-align: left; padding: 10px 14px 9px;
        border-bottom: 0; border-radius: 3px 3px 0 0;
        -webkit-print-color-adjust: exact; print-color-adjust: exact;
    }
    .running-banner .rb-title {
        font-size: 15pt; font-weight: 800; letter-spacing: 0.01em;
        text-transform: uppercase; margin-right: 12px;
    }
    .running-banner .rb-meta {
        font-size: 8.5pt; font-weight: 500; letter-spacing: 0.08em;
        opacity: 0.92; text-transform: uppercase;
    }

    .col-headers th {
        text-align: left; padding: 6px 8px; background: #f3f4f6;
        border-bottom: 2px solid #222; font-size: 8pt; text-transform: uppercase;
        letter-spacing: 0.05em; font-weight: 700; color: #374151;
        -webkit-print-color-adjust: exact; print-color-adjust: exact;
    }
    .staff-table tbody td { padding: 5px 8px; border-bottom: 1px solid #e5e7eb; vertical-align: top; }
    .staff-table tbody tr:nth-child(even) td {
        background: #fafafa;
        -webkit-print-color-adjust: exact; print-color-adjust: exact;
    }
    .staff-table th.check, .staff-table td.check { width: 0.35in; text-align: center; }
    .checkbox-cell { display: inline-block; width: 14px; height: 14px; border: 1.5px solid #222; border-radius: 2px; }
    .staff-table th.name, .staff-table td.name { width: 1.85in; font-weight: 600; }
    .staff-table th.role, .staff-table td.role { width: 1.9in; color: #374151; }
    .staff-table th.team, .staff-table td.team { width: 0.85in; color: #6b7280; font-size: 8.5pt; }
    .staff-table th.sched, .staff-table td.sched { width: 1.3in; white-space: nowrap; font-variant-numeric: tabular-nums; }
    .staff-table th.phone, .staff-table td.phone { width: 1.15in; white-space: nowrap; font-variant-numeric: tabular-nums; }
    .staff-table th.email, .staff-table td.email { font-size: 8.5pt; overflow-wrap: break-word; word-break: normal; }
    .empty { color: #cbd1d8; }
    .placeholder-row td.name { color: #6b7280; }
    .placeholder-row td { background: #fbfbf8 !important; }
    .tbd-tag {
        display: inline-block; font-size: 7.5pt; font-weight: 700;
        letter-spacing: 0.04em; padding: 1px 5px; margin-right: 4px;
        background: #d97706; color: #fff; border-radius: 2px; vertical-align: 1px;
        -webkit-print-color-adjust: exact; print-color-adjust: exact;
    }
    tr { page-break-inside: avoid; }
    thead { display: table-header-group; }
    .empty-day {
        padding: 40px 20px; text-align: center; color: #9ca3af;
        font-size: 11pt; font-style: italic; border: 1px dashed #e5e7eb; border-radius: 4px;
    }
    @media screen {
        body { background: #e5e7eb; padding: 20px; }
        .team-page {
            background: #fff; box-shadow: 0 4px 20px rgba(0,0,0,0.15);
            padding: 32px; margin: 0 auto 20px; max-width: 10in;
        }
    }
</style>
</head>
<body>
    ${pagesHtml}
    <script>
        if (document.readyState === 'complete') {
            setTimeout(() => window.print(), 150);
        } else {
            window.addEventListener('load', () => setTimeout(() => window.print(), 150));
        }
    <\/script>
</body>
</html>`;

    const w = window.open('', '_blank');
    if (!w) {
        showToast('Please allow popups to print check-in list', 'error');
        return;
    }
    w.document.open();
    w.document.write(html);
    w.document.close();
}

window.openPrintCheckInModal = openPrintCheckInModal;
window.closePrintCheckInModal = closePrintCheckInModal;
window.confirmPrintCheckInList = confirmPrintCheckInList;

const PERFORMER_DAY_KEYS = ['thursday', 'friday', 'saturday', 'sunday'];

function openSetListModal(itemId = null) {
    const modal = document.getElementById('setlist-modal');
    const form = document.getElementById('setlist-form');
    const title = document.getElementById('setlist-modal-title');

    form.reset();
    document.getElementById('setlist-id').value = '';

    let data = null;
    if (itemId) {
        data = state.setLists.find(s => s.id === itemId);
    }

    title.textContent = data ? 'Edit Performer' : 'Add Performer';

    if (data) {
        document.getElementById('setlist-id').value = itemId;
        document.getElementById('setlist-performer').value = data.performer || '';
        document.getElementById('setlist-stage').value = data.stage || '';
        document.getElementById('setlist-duration').value = data.estimatedDuration || '';
        document.getElementById('setlist-notes').value = data.generalNotes || '';
        renderSongRows(data.songs || []);
        renderMemberRows(data.members || []);
        populatePerformerDayFields(data);
        updateStagePlotUI(data.stagePlotUrl || null);
    } else {
        renderSongRows([{ title: '', duration: '', notes: '' }]);
        renderMemberRows([]);
        populatePerformerDayFields(null);
        updateStagePlotUI(null);
    }

    modal.classList.add('active');
}

function populatePerformerDayFields(data) {
    const arrivals = (data && data.arrivals) || {};
    const overrides = (data && data.performanceOverrides) || {};
    const derived = getDerivedPerformanceTimes(data ? data.performer : '');

    PERFORMER_DAY_KEYS.forEach(day => {
        const arrivalInput = document.getElementById('setlist-arrival-' + day);
        const perfInput = document.getElementById('setlist-perf-' + day);
        const hintSpan = document.getElementById('derived-hint-' + day);
        if (arrivalInput) arrivalInput.value = arrivals[day] || '';
        if (perfInput) perfInput.value = overrides[day] || '';
        if (hintSpan) {
            const times = (derived[day] || []).filter(Boolean);
            hintSpan.textContent = times.length
                ? 'Timeline: ' + times.map(t => formatTime12Hour(t)).join(', ')
                : '';
        }
    });
}

function renderMemberRows(members) {
    const container = document.getElementById('setlist-members-container');
    if (!container) return;
    container.innerHTML = (members || []).map((m, i) => `
        <div class="member-edit-row" data-member-index="${i}">
            <input type="text" class="member-name-input" value="${escapeHtml(m.name || '')}" placeholder="Name">
            <input type="tel" class="member-phone-input" value="${escapeHtml(m.phone || '')}" placeholder="Phone">
            <button type="button" class="btn btn-danger btn-sm" onclick="removeMemberRow(this)">×</button>
        </div>
    `).join('');
}

function addMemberRow() {
    const container = document.getElementById('setlist-members-container');
    if (!container) return;
    const row = document.createElement('div');
    row.className = 'member-edit-row';
    row.innerHTML = `
        <input type="text" class="member-name-input" placeholder="Name">
        <input type="tel" class="member-phone-input" placeholder="Phone">
        <button type="button" class="btn btn-danger btn-sm" onclick="removeMemberRow(this)">×</button>
    `;
    container.appendChild(row);
    row.querySelector('.member-name-input').focus();
}

function removeMemberRow(btn) {
    const row = btn.closest('.member-edit-row');
    if (row) row.remove();
}

window.addMemberRow = addMemberRow;
window.removeMemberRow = removeMemberRow;

function getDerivedPerformanceTimes(performerName) {
    // Strict match on timeline row's performer field only. Event-text
    // matching was too noisy (On Stage / Performance / Backstage rows all
    // referenced the same band) so we now rely on the modal's manual
    // override field to be the authoritative display value.
    const result = { thursday: [], friday: [], saturday: [], sunday: [] };
    const norm = (performerName || '').trim().toLowerCase();
    if (!norm) return result;
    (state.timeline || []).forEach(t => {
        if ((t.performer || '').trim().toLowerCase() !== norm) return;
        const ev = (t.event || '').toLowerCase();
        if (/\bsound\s*check\b/.test(ev)) return;
        const dayKey = (t.day || '').toLowerCase();
        if (!result[dayKey]) return;
        if (t.time) result[dayKey].push(t.time);
    });
    return result;
}

// Format a manual performanceOverrides value: if it looks like 24h HH:MM,
// convert to 12h AM/PM; otherwise preserve whatever the user typed.
function formatPerfOverride(raw) {
    const s = (raw || '').trim();
    if (!s) return '';
    return /^\d{1,2}:\d{2}$/.test(s) ? formatTime12Hour(s) : s;
}

function getDerivedSoundcheckTimes(performerName) {
    const result = { thursday: [], friday: [], saturday: [], sunday: [] };
    const norm = (performerName || '').trim().toLowerCase();
    if (!norm) return result;
    (state.timeline || []).forEach(t => {
        const ev = (t.event || '').toLowerCase();
        const m = ev.match(/^\s*sound\s*check\s*:\s*(.+?)\s*$/i);
        if (!m) return;
        const subject = m[1].trim();
        if (!subject) return;
        // Bidirectional substring: matches both exact-name bands and shorter
        // aliases (e.g., "Rock Ensemble" → "Miami Beach Rock Ensemble (Set 1)").
        if (!(norm.includes(subject) || subject.includes(norm))) return;
        const dayKey = (t.day || '').toLowerCase();
        if (!result[dayKey]) return;
        if (t.time) result[dayKey].push(t.time);
    });
    return result;
}

function renderSongRows(songs) {
    const container = document.getElementById('setlist-songs-container');
    container.innerHTML = songs.map((song, i) => `
        <div class="song-edit-row" data-song-index="${i}">
            <input type="text" class="song-title-input" value="${escapeHtml(song.title || '')}" placeholder="Song title">
            <input type="text" class="song-duration-input" value="${escapeHtml(song.duration || '')}" placeholder="mm:ss" style="width:70px">
            <input type="text" class="song-notes-input" value="${escapeHtml(song.notes || '')}" placeholder="Notes">
            <button type="button" class="btn btn-danger btn-sm" onclick="removeSongRow(this)">×</button>
        </div>
    `).join('');
}

function addSongRow() {
    const container = document.getElementById('setlist-songs-container');
    const row = document.createElement('div');
    row.className = 'song-edit-row';
    row.innerHTML = `
        <input type="text" class="song-title-input" placeholder="Song title">
        <input type="text" class="song-duration-input" placeholder="mm:ss" style="width:70px">
        <input type="text" class="song-notes-input" placeholder="Notes">
        <button type="button" class="btn btn-danger btn-sm" onclick="removeSongRow(this)">×</button>
    `;
    container.appendChild(row);
    row.querySelector('.song-title-input').focus();
}

function removeSongRow(btn) {
    const container = document.getElementById('setlist-songs-container');
    if (container.querySelectorAll('.song-edit-row').length <= 1) return;
    btn.closest('.song-edit-row').remove();
}

async function handleSetListSubmit(e) {
    e.preventDefault();

    const songRows = document.querySelectorAll('#setlist-songs-container .song-edit-row');
    const songs = Array.from(songRows)
        .map(row => ({
            title: row.querySelector('.song-title-input').value.trim(),
            duration: row.querySelector('.song-duration-input').value.trim(),
            notes: row.querySelector('.song-notes-input').value.trim()
        }))
        .filter(s => s.title);

    const memberRows = document.querySelectorAll('#setlist-members-container .member-edit-row');
    const members = Array.from(memberRows)
        .map(row => ({
            name: row.querySelector('.member-name-input').value.trim(),
            phone: row.querySelector('.member-phone-input').value.trim()
        }))
        .filter(m => m.name || m.phone);

    const arrivals = {};
    const performanceOverrides = {};
    PERFORMER_DAY_KEYS.forEach(day => {
        const aEl = document.getElementById('setlist-arrival-' + day);
        const pEl = document.getElementById('setlist-perf-' + day);
        arrivals[day] = aEl ? aEl.value.trim() : '';
        performanceOverrides[day] = pEl ? pEl.value.trim() : '';
    });

    const data = {
        performer: document.getElementById('setlist-performer').value,
        stage: document.getElementById('setlist-stage').value,
        songs: songs,
        members: members,
        arrivals: arrivals,
        performanceOverrides: performanceOverrides,
        estimatedDuration: document.getElementById('setlist-duration').value,
        generalNotes: document.getElementById('setlist-notes').value,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    };

    const id = document.getElementById('setlist-id').value;

    // Pick up stage plot URL if uploaded during new setlist creation
    if (!id) {
        const fileInput = document.getElementById('stage-plot-file');
        if (fileInput && fileInput.dataset.uploadedUrl) {
            data.stagePlotUrl = fileInput.dataset.uploadedUrl;
            data.stagePlotPath = fileInput.dataset.uploadedPath;
        }
    }

    try {
        if (id) {
            await collections.setLists.doc(id).update(data);
            showToast('Performer updated');
        } else {
            data.createdAt = firebase.firestore.FieldValue.serverTimestamp();
            await collections.setLists.add(data);
            showToast('Performer added');
        }
        closeAllModals();
    } catch (error) {
        console.error('Error saving performer:', error);
        showToast('Error saving performer', 'error');
    }
}

function toggleSetListSongs(id) {
    const el = document.getElementById('setlist-songs-' + id);
    const icon = document.getElementById('setlist-toggle-icon-' + id);
    if (!el || !icon) return;
    const isHidden = el.style.display === 'none';
    el.style.display = isHidden ? '' : 'none';
    icon.innerHTML = isHidden ? '&#9660;' : '&#9654;';
    if (isHidden) {
        el.closest('.setlist-accordion-item').classList.add('expanded');
        state.setListsExpanded.add(id);
    } else {
        el.closest('.setlist-accordion-item').classList.remove('expanded');
        state.setListsExpanded.delete(id);
    }
}

function expandAllSetLists() {
    state.setLists.forEach(sl => state.setListsExpanded.add(sl.id));
    document.querySelectorAll('.setlist-accordion-body').forEach(body => {
        body.style.display = '';
        body.closest('.setlist-accordion-item').classList.add('expanded');
    });
    document.querySelectorAll('.setlist-toggle-icon').forEach(icon => {
        icon.innerHTML = '&#9660;';
    });
}

function collapseAllSetLists() {
    state.setListsExpanded.clear();
    document.querySelectorAll('.setlist-accordion-body').forEach(body => {
        body.style.display = 'none';
        body.closest('.setlist-accordion-item').classList.remove('expanded');
    });
    document.querySelectorAll('.setlist-toggle-icon').forEach(icon => {
        icon.innerHTML = '&#9654;';
    });
}

function handleSetListSearch(value) {
    state.setListSearch = value;
    renderSetLists();
}

function clearSetListSearch() {
    state.setListSearch = '';
    document.getElementById('setlist-search-input').value = '';
    renderSetLists();
}

function exportSetListToExcel() {
    const rows = [];
    state.setLists
        .sort((a, b) => (a.performer || '').localeCompare(b.performer || ''))
        .forEach(sl => {
            const songs = sl.songs || [];
            if (songs.length === 0) {
                rows.push({
                    'Performer': sl.performer || '',
                    'Stage': sl.stage === 'main' ? 'Main Stage' : 'Cocktail Stage',
                    '#': '',
                    'Song': '',
                    'Duration': sl.estimatedDuration || '',
                    'Song Notes': '',
                    'Crew Notes': sl.generalNotes || ''
                });
            } else {
                songs.forEach((song, i) => {
                    rows.push({
                        'Performer': i === 0 ? (sl.performer || '') : '',
                        'Stage': i === 0 ? (sl.stage === 'main' ? 'Main Stage' : 'Cocktail Stage') : '',
                        '#': i + 1,
                        'Song': song.title || '',
                        'Duration': song.duration || '',
                        'Song Notes': song.notes || '',
                        'Crew Notes': i === 0 ? (sl.generalNotes || '') : ''
                    });
                });
            }
        });

    const ws = XLSX.utils.json_to_sheet(rows);
    ws['!cols'] = [
        { wch: 25 },  // Performer
        { wch: 15 },  // Stage
        { wch: 4 },   // #
        { wch: 30 },  // Song
        { wch: 8 },   // Duration
        { wch: 30 },  // Song Notes
        { wch: 35 }   // Crew Notes
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Set Lists');

    // Arrivals & Performance sheet
    const scheduleRows = [];
    const dayOrder = ['thursday', 'friday', 'saturday', 'sunday'];
    const dayNames = { thursday: 'Thursday', friday: 'Friday', saturday: 'Saturday', sunday: 'Sunday' };
    state.setLists
        .slice()
        .sort((a, b) => (a.performer || '').localeCompare(b.performer || ''))
        .forEach(sl => {
            const arrivals = sl.arrivals || {};
            const overrides = sl.performanceOverrides || {};
            const derived = getDerivedPerformanceTimes(sl.performer);
            const soundchecks = getDerivedSoundcheckTimes(sl.performer);
            dayOrder.forEach(day => {
                const arrival = arrivals[day] || '';
                const override = overrides[day] || '';
                const derivedTimes = (derived[day] || []).filter(Boolean).map(t => formatTime12Hour(t));
                const soundcheckTimes = (soundchecks[day] || []).filter(Boolean).map(t => formatTime12Hour(t));
                if (!arrival && !override && derivedTimes.length === 0 && soundcheckTimes.length === 0) return;
                scheduleRows.push({
                    'Performer': sl.performer || '',
                    'Day': dayNames[day],
                    'Arrival': arrival,
                    'Soundcheck': soundcheckTimes.join(', '),
                    'Performance (derived)': derivedTimes.join(', '),
                    'Performance (override)': formatPerfOverride(override)
                });
            });
        });
    if (scheduleRows.length) {
        const sched = XLSX.utils.json_to_sheet(scheduleRows);
        sched['!cols'] = [{ wch: 25 }, { wch: 12 }, { wch: 18 }, { wch: 18 }, { wch: 22 }, { wch: 22 }];
        XLSX.utils.book_append_sheet(wb, sched, 'Arrivals & Performance');
    }

    // Members sheet
    const memberRows = [];
    state.setLists
        .slice()
        .sort((a, b) => (a.performer || '').localeCompare(b.performer || ''))
        .forEach(sl => {
            (sl.members || []).forEach(m => {
                memberRows.push({
                    'Performer': sl.performer || '',
                    'Name': m.name || '',
                    'Phone': m.phone || ''
                });
            });
        });
    if (memberRows.length) {
        const mem = XLSX.utils.json_to_sheet(memberRows);
        mem['!cols'] = [{ wch: 25 }, { wch: 25 }, { wch: 20 }];
        XLSX.utils.book_append_sheet(wb, mem, 'Members');
    }

    const today = new Date().toISOString().split('T')[0];
    XLSX.writeFile(wb, `Performers_${today}.xlsx`);
}

// Stage Plot PDF Upload
function updateStagePlotUI(url) {
    const currentDiv = document.getElementById('stage-plot-current');
    const link = document.getElementById('stage-plot-link');
    const fileInput = document.getElementById('stage-plot-file');
    const status = document.getElementById('stage-plot-upload-status');

    if (fileInput) fileInput.value = '';
    if (status) status.textContent = '';

    if (url) {
        currentDiv.style.display = 'flex';
        link.href = url;
    } else {
        currentDiv.style.display = 'none';
    }
}

function showUploadError(status, message, detail) {
    console.error('Stage plot upload:', message, detail || '');
    status.textContent = message;
    status.className = 'upload-status upload-error';
}

async function handleStagePlotFileSelect(input) {
    const file = input.files[0];
    if (!file) return;

    const status = document.getElementById('stage-plot-upload-status');
    const maxSize = 10 * 1024 * 1024; // 10MB
    const allowed = ['application/pdf', 'image/png', 'image/jpeg'];

    if (!allowed.includes(file.type)) {
        showUploadError(status, 'Only PDF, PNG, or JPG files allowed.');
        input.value = '';
        return;
    }
    if (file.size > maxSize) {
        showUploadError(status, 'File too large (max 10MB).');
        input.value = '';
        return;
    }

    // Check Firebase Storage is available before attempting upload
    if (typeof storage === 'undefined' || !storage) {
        showUploadError(status, 'Firebase Storage not configured. Check console.');
        input.value = '';
        return;
    }

    const setlistId = document.getElementById('setlist-id').value;
    const performer = document.getElementById('setlist-performer').value || 'unknown';
    const ext = file.name.split('.').pop();
    const path = `stagePlots/${performer.replace(/[^a-zA-Z0-9]/g, '_')}.${ext}`;

    status.textContent = 'Uploading...';
    status.className = 'upload-status';
    input.disabled = true;

    let uploadTimedOut = false;
    let progressReceived = false;

    // Timeout: if no progress after 15s, the bucket likely doesn't exist or rules block access
    const timeout = setTimeout(() => {
        if (!progressReceived) {
            uploadTimedOut = true;
            try { task.cancel(); } catch (e) { /* ignore */ }
            showUploadError(status,
                'Upload timed out — Firebase Storage may not be enabled.',
                'Go to Firebase Console → Storage → Get Started to enable it.'
            );
            showToast('Upload failed: Firebase Storage may not be enabled. Check Firebase Console → Storage.', 'error');
            input.disabled = false;
            input.value = '';
        }
    }, 15000);

    let task;
    try {
        const ref = storage.ref(path);
        task = ref.put(file);
    } catch (error) {
        clearTimeout(timeout);
        showUploadError(status, 'Upload failed: ' + (error.message || 'Unknown error'));
        input.disabled = false;
        input.value = '';
        return;
    }

    task.on('state_changed',
        (snapshot) => {
            if (uploadTimedOut) return;
            progressReceived = true;
            clearTimeout(timeout);
            const pct = Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100);
            status.textContent = `Uploading... ${pct}%`;
        },
        (error) => {
            if (uploadTimedOut) return;
            clearTimeout(timeout);
            input.disabled = false;
            input.value = '';

            if (error.code === 'storage/canceled') return;

            let userMsg = 'Upload failed.';
            if (error.code === 'storage/unauthorized' || error.code === 'storage/unauthenticated') {
                userMsg = 'Upload denied — check Firebase Storage rules.';
            } else if (error.code === 'storage/bucket-not-found') {
                userMsg = 'Storage bucket not found — enable Storage in Firebase Console.';
            } else if (error.code === 'storage/retry-limit-exceeded') {
                userMsg = 'Upload failed — check your internet connection.';
            }
            showUploadError(status, userMsg, error.code + ': ' + error.message);
            showToast(userMsg, 'error');
        },
        async () => {
            if (uploadTimedOut) return;
            clearTimeout(timeout);
            input.disabled = false;

            try {
                const url = await task.snapshot.ref.getDownloadURL();
                status.textContent = 'Uploaded!';
                status.className = 'upload-status upload-success';

                if (setlistId) {
                    await collections.setLists.doc(setlistId).update({
                        stagePlotUrl: url,
                        stagePlotPath: path,
                        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                    });
                } else {
                    document.getElementById('stage-plot-file').dataset.uploadedUrl = url;
                    document.getElementById('stage-plot-file').dataset.uploadedPath = path;
                }
                updateStagePlotUI(url);
                showToast('Stage plot uploaded');
            } catch (error) {
                showUploadError(status, 'Upload succeeded but failed to save URL.', error.message);
                showToast('Error saving stage plot link', 'error');
            }
        }
    );
}

async function removeStagePlotFile() {
    const setlistId = document.getElementById('setlist-id').value;
    if (!setlistId) return;

    const sl = state.setLists.find(s => s.id === setlistId);
    if (!sl) return;

    try {
        if (sl.stagePlotPath) {
            try {
                await storage.ref(sl.stagePlotPath).delete();
            } catch (storageErr) {
                // File may already be deleted from Storage — still clear Firestore reference
                console.warn('Could not delete storage file (may already be removed):', storageErr.code);
            }
        }
        await collections.setLists.doc(setlistId).update({
            stagePlotUrl: firebase.firestore.FieldValue.delete(),
            stagePlotPath: firebase.firestore.FieldValue.delete(),
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        updateStagePlotUI(null);
        showToast('Stage plot removed');
    } catch (error) {
        console.error('Error removing stage plot:', error);
        showToast('Error removing stage plot', 'error');
    }
}

window.openSetListModal = openSetListModal;
window.deleteSetList = createDeleteHandler('setLists', 'set list');
window.addSongRow = addSongRow;
window.removeSongRow = removeSongRow;
window.toggleSetListSongs = toggleSetListSongs;
window.expandAllSetLists = expandAllSetLists;
window.collapseAllSetLists = collapseAllSetLists;
window.handleSetListSearch = handleSetListSearch;
window.clearSetListSearch = clearSetListSearch;
window.handleStagePlotFileSelect = handleStagePlotFileSelect;
window.removeStagePlotFile = removeStagePlotFile;

// Make functions globally accessible
window.toggleCategorySection = toggleCategorySection;
window.editBudgetCell = editBudgetCell;
window.makeRowEditable = makeRowEditable;
window.saveRowChanges = saveRowChanges;
window.cancelRowEdit = cancelRowEdit;
window.editTimelineCell = editTimelineCell;
window.commitNewRow = commitNewRow;
window.editStageCell = editStageCell;

// ============================
// Seating
// ============================

const SEATING_GUEST_FIELDS = ['firstName', 'lastName', 'party', 'tableId', 'email', 'phone', 'dietary', 'notes'];
const SEATING_FIELD_LABELS = {
    firstName: 'first', lastName: 'last', party: 'party', tableId: 'table',
    email: 'email', phone: 'phone', dietary: 'dietary', notes: 'notes'
};
const SEATING_MARKER_COLORS = {
    empty: '#e5e7eb',
    partial: '#fde68a',
    full: '#a7f3d0',
    over: '#fecaca'
};

function getTableAssignedCount(tableId) {
    if (!tableId) return 0;
    return state.guests.filter(g => g.tableId === tableId).length;
}

function getTableFillColor(table) {
    const count = getTableAssignedCount(table.id);
    const cap = table.capacity || 0;
    if (count === 0) return SEATING_MARKER_COLORS.empty;
    if (count > cap) return SEATING_MARKER_COLORS.over;
    if (count === cap) return SEATING_MARKER_COLORS.full;
    return SEATING_MARKER_COLORS.partial;
}

function getTableLabel(tableId) {
    const t = state.seatingTables.find(st => st.id === tableId);
    return t ? t.label : '';
}

function sortSeatingTables(tables) {
    return [...tables].sort((a, b) => {
        if (a.kind !== b.kind) return a.kind === 'lounge' ? -1 : 1;
        return (a.number || 0) - (b.number || 0);
    });
}

function updateSeatingStats() {
    const total = state.guests.length;
    const seated = state.guests.filter(g => g.tableId).length;
    const unassigned = total - seated;
    const capacity = state.seatingTables.reduce((sum, t) => sum + (t.capacity || 0), 0);
    const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
    set('seating-stat-total', total);
    set('seating-stat-seated', seated);
    set('seating-stat-unassigned', unassigned);
    set('seating-stat-capacity', capacity);
}

function renderSeatingTable() {
    const tbody = document.getElementById('seating-guest-tbody');
    if (!tbody) return;
    if (state.seatingEditingRowId) {
        state.seatingRenderPending = true;
        return;
    }

    const search = (state.seatingSearch || '').toLowerCase().trim();
    let filtered = state.guests.filter(g => {
        if (state.seatingUnassignedOnly && g.tableId) return false;
        if (!search) return true;
        const tableLabel = getTableLabel(g.tableId).toLowerCase();
        return [g.firstName, g.lastName, g.party, g.email, tableLabel]
            .some(v => (v || '').toLowerCase().includes(search));
    });

    filtered.sort((a, b) => {
        const aL = (a.lastName || '').toLowerCase();
        const bL = (b.lastName || '').toLowerCase();
        if (aL !== bL) return aL.localeCompare(bL);
        return (a.firstName || '').toLowerCase().localeCompare((b.firstName || '').toLowerCase());
    });

    const phantomRow = `
        <tr class="tl-row seating-phantom-row no-anim" data-phantom="true">
            <td data-field="firstName" onclick="editSeatingCell(this)"><span class="phantom-placeholder">+ first</span></td>
            <td data-field="lastName" onclick="editSeatingCell(this)"><span class="phantom-placeholder">last</span></td>
            <td data-field="party" onclick="editSeatingCell(this)"><span class="phantom-placeholder">party</span></td>
            <td data-field="tableId" onclick="editSeatingCell(this)"><span class="phantom-placeholder">table</span></td>
            <td data-field="email" onclick="editSeatingCell(this)"><span class="phantom-placeholder">email</span></td>
            <td data-field="phone" onclick="editSeatingCell(this)"><span class="phantom-placeholder">phone</span></td>
            <td data-field="dietary" onclick="editSeatingCell(this)"><span class="phantom-placeholder">dietary</span></td>
            <td data-field="notes" onclick="editSeatingCell(this)"><span class="phantom-placeholder">notes</span></td>
            <td class="actions-col no-print"></td>
        </tr>
    `;

    if (filtered.length === 0) {
        tbody.innerHTML = phantomRow;
        state.pendingNewGuestRow = {};
        return;
    }

    const rowsHtml = filtered.map(g => {
        const tableLabel = g.tableId ? getTableLabel(g.tableId) : '';
        const tableCellInner = g.tableId
            ? `<span class="table-pill">${escapeHtml(tableLabel)}</span>`
            : `<span class="table-unassigned">unassigned</span>`;
        return `
            <tr class="tl-row" data-id="${g.id}">
                <td data-field="firstName" data-original="${escapeHtml(g.firstName || '')}" onclick="editSeatingCell(this)">${escapeHtml(g.firstName || '')}</td>
                <td data-field="lastName" data-original="${escapeHtml(g.lastName || '')}" onclick="editSeatingCell(this)">${escapeHtml(g.lastName || '')}</td>
                <td data-field="party" data-original="${escapeHtml(g.party || '')}" onclick="editSeatingCell(this)">${escapeHtml(g.party || '')}</td>
                <td data-field="tableId" data-original="${escapeHtml(g.tableId || '')}" onclick="editSeatingCell(this)">${tableCellInner}</td>
                <td data-field="email" data-original="${escapeHtml(g.email || '')}" onclick="editSeatingCell(this)">${escapeHtml(g.email || '')}</td>
                <td data-field="phone" data-original="${escapeHtml(g.phone || '')}" onclick="editSeatingCell(this)">${escapeHtml(g.phone || '')}</td>
                <td data-field="dietary" data-original="${escapeHtml(g.dietary || '')}" onclick="editSeatingCell(this)">${escapeHtml(g.dietary || '')}</td>
                <td data-field="notes" data-original="${escapeHtml(g.notes || '')}" onclick="editSeatingCell(this)">${escapeHtml(g.notes || '')}</td>
                <td class="actions-col no-print">
                    <div class="actions-row">
                        <button class="action-icon" onclick="openGuestModal('${g.id}')" title="Edit">
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                        </button>
                        <button class="action-icon" onclick="duplicateGuest('${g.id}')" title="Duplicate">
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                        </button>
                        <button class="action-icon action-icon-danger" onclick="deleteGuest('${g.id}')" title="Delete">
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                        </button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');

    tbody.innerHTML = rowsHtml + phantomRow;
    state.pendingNewGuestRow = {};
}

function editSeatingCell(cell) {
    if (cell.querySelector('.inline-edit-input, .inline-edit-select')) return;
    const row = cell.closest('tr');
    const field = cell.dataset.field;
    if (!field) return;

    const isPhantom = row.dataset.phantom === 'true';
    state.seatingEditingRowId = isPhantom ? 'phantom' : row.dataset.id;
    row.classList.add('editing');

    const original = isPhantom
        ? (state.pendingNewGuestRow[field] || '')
        : (cell.dataset.original || '');

    let input;
    if (field === 'tableId') {
        input = document.createElement('select');
        input.className = 'inline-edit-select';
        input.style.minWidth = '120px';
        const opts = ['<option value="">— Unassigned —</option>'];
        sortSeatingTables(state.seatingTables).forEach(t => {
            const count = getTableAssignedCount(t.id);
            const cap = t.capacity || 0;
            const isFull = count >= cap;
            const isCurrent = t.id === original;
            const disabled = isFull && !isCurrent ? 'disabled' : '';
            opts.push(`<option value="${t.id}" ${isCurrent ? 'selected' : ''} ${disabled}>${escapeHtml(t.label)} (${count}/${cap})</option>`);
        });
        input.innerHTML = opts.join('');
    } else {
        input = document.createElement('input');
        input.type = field === 'email' ? 'email' : 'text';
        input.value = original;
        input.className = 'inline-edit-input';
    }
    input.dataset.field = field;

    cell.textContent = '';
    cell.appendChild(input);
    input.focus();
    if (input.select) try { input.select(); } catch (e) {}

    input.addEventListener('keydown', (e) => handleSeatingCellKeydown(e, cell, row));
    input.addEventListener('blur', () => {
        setTimeout(() => {
            const activeEl = document.activeElement;
            if (row.contains(activeEl) && (activeEl.classList.contains('inline-edit-input') || activeEl.classList.contains('inline-edit-select'))) return;
            if (cell.querySelector('.inline-edit-input, .inline-edit-select')) {
                if (isPhantom) {
                    const val = input.value;
                    const trimmed = typeof val === 'string' ? val.trim() : val;
                    if (trimmed) state.pendingNewGuestRow[field] = trimmed;
                    restoreSeatingCell(cell, true);
                    if (!row.querySelector('.inline-edit-input, .inline-edit-select')) {
                        row.classList.remove('editing');
                        commitNewGuestRow();
                    }
                } else {
                    saveSingleSeatingCell(cell, row);
                }
            }
        }, 50);
    });
    if (field === 'tableId') {
        input.addEventListener('change', () => {
            if (isPhantom) {
                state.pendingNewGuestRow[field] = input.value;
                restoreSeatingCell(cell, true);
                if (!row.querySelector('.inline-edit-input, .inline-edit-select')) {
                    row.classList.remove('editing');
                    commitNewGuestRow();
                }
            } else {
                saveSingleSeatingCell(cell, row);
            }
        });
    }
}

function handleSeatingCellKeydown(e, cell, row) {
    const field = cell.dataset.field;
    const isPhantom = row.dataset.phantom === 'true';
    const input = cell.querySelector('.inline-edit-input, .inline-edit-select');
    if (e.key === 'Tab') {
        e.preventDefault();
        const direction = e.shiftKey ? -1 : 1;
        if (isPhantom) {
            const val = input ? input.value : '';
            const trimmed = typeof val === 'string' ? val.trim() : val;
            if (trimmed) state.pendingNewGuestRow[field] = trimmed;
            restoreSeatingCell(cell, true);
        } else {
            saveSingleSeatingCell(cell, row, true);
        }
        navigateSeatingCell(row, field, direction);
    } else if (e.key === 'Enter') {
        e.preventDefault();
        if (isPhantom) {
            const val = input ? input.value : '';
            const trimmed = typeof val === 'string' ? val.trim() : val;
            if (trimmed) state.pendingNewGuestRow[field] = trimmed;
            restoreSeatingCell(cell, true);
            commitNewGuestRow();
        } else {
            saveSingleSeatingCell(cell, row, true);
            navigateSeatingNextRow(row, field);
        }
    } else if (e.key === 'Escape') {
        e.preventDefault();
        restoreSeatingCell(cell, isPhantom);
        row.classList.remove('editing');
        clearSeatingEditingFlag();
    }
}

function navigateSeatingCell(row, currentField, direction) {
    const idx = SEATING_GUEST_FIELDS.indexOf(currentField);
    const nextIdx = idx + direction;
    if (nextIdx >= 0 && nextIdx < SEATING_GUEST_FIELDS.length) {
        const liveRow = getLiveSeatingRow(row);
        const nextField = SEATING_GUEST_FIELDS[nextIdx];
        const nextCell = liveRow.querySelector(`td[data-field="${nextField}"]`);
        if (nextCell) editSeatingCell(nextCell);
    } else if (direction > 0) {
        if (row.dataset.phantom === 'true') { commitNewGuestRow(); return; }
        const liveRow = getLiveSeatingRow(row);
        const nextRow = liveRow.nextElementSibling;
        if (nextRow) {
            const nextCell = nextRow.querySelector(`td[data-field="${SEATING_GUEST_FIELDS[0]}"]`);
            if (nextCell) editSeatingCell(nextCell);
        }
    }
}

function navigateSeatingNextRow(row, field) {
    const liveRow = getLiveSeatingRow(row);
    const nextRow = liveRow.nextElementSibling;
    if (nextRow) {
        const nextCell = nextRow.querySelector(`td[data-field="${field}"]`);
        if (nextCell) editSeatingCell(nextCell);
    }
}

function getLiveSeatingRow(row) {
    if (row.dataset.phantom === 'true') return document.querySelector('#seating-guest-tbody tr[data-phantom="true"]') || row;
    if (row.dataset.id) return document.querySelector(`#seating-guest-tbody tr[data-id="${row.dataset.id}"]`) || row;
    return row;
}

function restoreSeatingCell(cell, isPhantom) {
    const field = cell.dataset.field;
    if (isPhantom) {
        const val = state.pendingNewGuestRow[field] || '';
        if (val) {
            if (field === 'tableId') {
                const label = getTableLabel(val);
                cell.innerHTML = label ? `<span class="table-pill">${escapeHtml(label)}</span>` : `<span class="table-unassigned">unassigned</span>`;
            } else {
                cell.textContent = val;
            }
        } else {
            const placeholder = SEATING_FIELD_LABELS[field] || field;
            cell.innerHTML = `<span class="phantom-placeholder">${field === 'firstName' ? '+ ' : ''}${placeholder}</span>`;
        }
    } else {
        const original = cell.dataset.original || '';
        if (field === 'tableId') {
            const label = getTableLabel(original);
            cell.innerHTML = original
                ? `<span class="table-pill">${escapeHtml(label)}</span>`
                : `<span class="table-unassigned">unassigned</span>`;
        } else {
            cell.textContent = original;
        }
    }
}

function clearSeatingEditingFlag() {
    state.seatingEditingRowId = null;
    if (state.seatingRenderPending) {
        state.seatingRenderPending = false;
        renderSeatingTable();
    }
}

function saveSingleSeatingCell(cell, row, keepEditing = false) {
    const input = cell.querySelector('.inline-edit-input, .inline-edit-select');
    if (!input) return;
    const field = cell.dataset.field;
    const id = row.dataset.id;
    let newValue = typeof input.value === 'string' ? input.value.trim() : input.value;
    const item = state.guests.find(g => g.id === id);
    const oldValue = item ? (item[field] || '') : '';

    // Capacity check
    if (field === 'tableId' && newValue && newValue !== oldValue) {
        const target = state.seatingTables.find(t => t.id === newValue);
        if (target) {
            const count = getTableAssignedCount(newValue);
            if (count >= (target.capacity || 0)) {
                showToast(`${target.label} is full (${count}/${target.capacity})`, 'error');
                restoreSeatingCell(cell, false);
                if (!keepEditing && !row.querySelector('.inline-edit-input, .inline-edit-select')) {
                    row.classList.remove('editing');
                    clearSeatingEditingFlag();
                }
                return;
            }
        }
    }

    cell.dataset.original = newValue;
    if (field === 'tableId') {
        const label = getTableLabel(newValue);
        cell.innerHTML = newValue
            ? `<span class="table-pill">${escapeHtml(label)}</span>`
            : `<span class="table-unassigned">unassigned</span>`;
    } else {
        cell.textContent = newValue;
    }

    if (!keepEditing && !row.querySelector('.inline-edit-input, .inline-edit-select')) {
        row.classList.remove('editing');
        clearSeatingEditingFlag();
    }

    if (!item) return;
    if (newValue === oldValue) return;

    item[field] = newValue;
    collections.guests.doc(id).update({
        [field]: newValue,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    }).catch(err => {
        console.error('Error saving guest cell:', err);
        if (item) item[field] = oldValue;
        cell.dataset.original = oldValue;
        showToast('Error saving', 'error');
    });
}

async function commitNewGuestRow() {
    const data = { ...state.pendingNewGuestRow };
    if (!data.firstName && !data.lastName) {
        state.pendingNewGuestRow = {};
        clearSeatingEditingFlag();
        renderSeatingTable();
        return;
    }
    // Capacity check on phantom commit
    if (data.tableId) {
        const target = state.seatingTables.find(t => t.id === data.tableId);
        if (target) {
            const count = getTableAssignedCount(data.tableId);
            if (count >= (target.capacity || 0)) {
                showToast(`${target.label} is full — guest added unassigned`, 'warning');
                data.tableId = '';
            }
        }
    }
    const newGuest = {
        firstName: data.firstName || '',
        lastName: data.lastName || '',
        party: data.party || '',
        tableId: data.tableId || '',
        email: data.email || '',
        phone: data.phone || '',
        dietary: data.dietary || '',
        notes: data.notes || '',
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    };
    state.pendingNewGuestRow = {};
    try {
        await collections.guests.add(newGuest);
        clearSeatingEditingFlag();
    } catch (err) {
        console.error('Error adding guest:', err);
        showToast('Error adding guest', 'error');
        clearSeatingEditingFlag();
    }
}

function openGuestModal(id = null) {
    // Populate the table dropdown first
    const sel = document.getElementById('guest-table');
    if (sel) {
        const opts = ['<option value="">— Unassigned —</option>'];
        sortSeatingTables(state.seatingTables).forEach(t => {
            const count = getTableAssignedCount(t.id);
            const cap = t.capacity || 0;
            opts.push(`<option value="${t.id}">${escapeHtml(t.label)} (${count}/${cap})</option>`);
        });
        sel.innerHTML = opts.join('');
    }
    openModal({
        modalId: 'guest-modal',
        formId: 'guest-form',
        idFieldId: 'guest-id',
        itemId: id,
        stateKey: 'guests',
        title: 'Guest',
        fieldMap: {
            'guest-first-name': 'firstName',
            'guest-last-name': 'lastName',
            'guest-party': 'party',
            'guest-table': 'tableId',
            'guest-email': 'email',
            'guest-phone': 'phone',
            'guest-dietary': 'dietary',
            'guest-notes': 'notes'
        }
    });
}

async function handleGuestSubmit(e) {
    await handleFormSubmit(e, {
        collection: 'guests',
        idFieldId: 'guest-id',
        itemName: 'guest',
        fieldMap: {
            'guest-first-name': 'firstName',
            'guest-last-name': 'lastName',
            'guest-party': 'party',
            'guest-table': 'tableId',
            'guest-email': 'email',
            'guest-phone': 'phone',
            'guest-dietary': 'dietary',
            'guest-notes': 'notes'
        }
    });
}

const _baseDeleteGuest = createDeleteHandler('guests', 'guest');
async function deleteGuest(id) { return _baseDeleteGuest(id); }

async function duplicateGuest(id) {
    const g = state.guests.find(x => x.id === id);
    if (!g) return;
    const { id: _id, createdAt, updatedAt, ...data } = g;
    data.firstName = (data.firstName || '') + ' (copy)';
    data.tableId = '';
    data.createdAt = firebase.firestore.FieldValue.serverTimestamp();
    data.updatedAt = firebase.firestore.FieldValue.serverTimestamp();
    try {
        await collections.guests.add(data);
        showToast('Guest duplicated');
    } catch (err) {
        console.error('Error duplicating guest:', err);
        showToast('Error duplicating guest', 'error');
    }
}

function setSeatingView(view) {
    state.seatingView = view;
    document.getElementById('seating-table-view-btn').classList.toggle('active', view === 'table');
    document.getElementById('seating-map-view-btn').classList.toggle('active', view === 'map');
    document.getElementById('seating-table-view').style.display = view === 'table' ? '' : 'none';
    document.getElementById('seating-map-view').style.display = view === 'map' ? '' : 'none';
    if (view === 'map') {
        setTimeout(() => {
            seatingInitCanvas();
            renderSeatingMap();
        }, 50);
    }
}

function handleSeatingSearch(value) {
    state.seatingSearch = value;
    renderSeatingTable();
}

function toggleSeatingUnassignedOnly(checked) {
    state.seatingUnassignedOnly = checked;
    renderSeatingTable();
}

// ---------- Map view ----------

// Aspect ratio (portrait) used to size the canvas — matches the original floor plan.
const SEATING_CANVAS_ASPECT = 1764 / 2628;

function seatingInitCanvas() {
    if (state.seatingCanvasInitialized) {
        if (state.seatingCanvas) state.seatingCanvas.renderAll();
        return;
    }
    const wrapper = document.getElementById('seating-canvas-wrapper');
    if (!wrapper) return;

    const padding = 24;
    const availableWidth = (wrapper.parentElement ? wrapper.parentElement.clientWidth - 340 - 16 : wrapper.clientWidth) - padding;
    const maxHeight = Math.max(window.innerHeight - 200, 700);
    let canvasHeight = maxHeight;
    let canvasWidth = canvasHeight * SEATING_CANVAS_ASPECT;
    if (canvasWidth > availableWidth) {
        canvasWidth = availableWidth;
        canvasHeight = canvasWidth / SEATING_CANVAS_ASPECT;
    }
    canvasWidth = Math.floor(canvasWidth);
    canvasHeight = Math.floor(canvasHeight);
    wrapper.style.width = (canvasWidth + padding) + 'px';
    wrapper.style.minHeight = (canvasHeight + padding) + 'px';

    state.seatingCanvas = new fabric.Canvas('seating-canvas', {
        width: canvasWidth,
        height: canvasHeight,
        selection: false,
        preserveObjectStacking: true,
        backgroundColor: '#fafafa'
    });

    state.seatingCanvas.on('mouse:down', (opt) => {
        const target = opt.target;
        if (target && target._tableId) {
            state.seatingSelectedTableId = target._tableId;
            state.seatingPanelSearch = '';
            renderSeatingPanel();
        } else if (!target) {
            state.seatingSelectedTableId = null;
            renderSeatingPanel();
        }
    });

    state.seatingCanvas.on('object:modified', (e) => {
        const obj = e.target;
        if (!obj || !obj._tableId) return;
        const cw = state.seatingCanvas.getWidth();
        const ch = state.seatingCanvas.getHeight();
        const x = obj.left / cw;
        const y = obj.top / ch;
        collections.seatingTables.doc(obj._tableId).update({
            x, y,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        }).catch(err => {
            console.error('Error saving table position:', err);
            showToast('Error saving table position', 'error');
        });
    });

    state.seatingCanvasInitialized = true;
    renderSeatingMap();
}

function renderSeatingMap() {
    const c = state.seatingCanvas;
    if (!c || !state.seatingCanvasInitialized) return;
    const cw = c.getWidth();
    const ch = c.getHeight();

    const seenIds = new Set();
    state.seatingTables.forEach(t => {
        seenIds.add(t.id);
        const left = (t.x || 0.5) * cw;
        const top = (t.y || 0.5) * ch;
        const fill = getTableFillColor(t);
        const isLounge = t.kind === 'lounge';

        let group = state.seatingMarkers.get(t.id);
        if (!group) {
            const shape = isLounge
                ? new fabric.Rect({
                    width: 64,
                    height: 36,
                    rx: 6,
                    ry: 6,
                    fill,
                    stroke: '#1a3a35',
                    strokeWidth: 1.5,
                    originX: 'center',
                    originY: 'center'
                })
                : new fabric.Circle({
                    radius: 18,
                    fill,
                    stroke: '#1a3a35',
                    strokeWidth: 1.5,
                    originX: 'center',
                    originY: 'center'
                });
            const text = new fabric.Text(String(t.number || ''), {
                fontSize: isLounge ? 14 : 13,
                fontFamily: 'DM Sans, sans-serif',
                fontWeight: '700',
                fill: '#1a3a35',
                originX: 'center',
                originY: 'center'
            });
            group = new fabric.Group([shape, text], {
                left,
                top,
                originX: 'center',
                originY: 'center',
                hasControls: false,
                hasBorders: true,
                lockScalingX: true,
                lockScalingY: true,
                lockRotation: true,
                hoverCursor: 'pointer'
            });
            group._tableId = t.id;
            group._tableShape = shape;
            state.seatingMarkers.set(t.id, group);
            c.add(group);
        } else {
            group.set({ left, top });
            if (group._tableShape) group._tableShape.set({ fill });
            group.setCoords();
        }
    });

    // Remove markers for tables that no longer exist
    for (const [tid, group] of state.seatingMarkers.entries()) {
        if (!seenIds.has(tid)) {
            c.remove(group);
            state.seatingMarkers.delete(tid);
        }
    }

    c.renderAll();
}

function renderSeatingPanel() {
    const empty = document.getElementById('seating-panel-empty');
    const panel = document.getElementById('seating-panel-table');
    if (!empty || !panel) return;

    const tableId = state.seatingSelectedTableId;
    const table = tableId ? state.seatingTables.find(t => t.id === tableId) : null;
    if (!table) {
        empty.style.display = '';
        panel.style.display = 'none';
        return;
    }
    empty.style.display = 'none';
    panel.style.display = '';

    const seated = state.guests
        .filter(g => g.tableId === table.id)
        .sort((a, b) => (a.lastName || '').localeCompare(b.lastName || ''));
    const count = seated.length;
    const cap = table.capacity || 0;
    const counterClass = count > cap ? 'over' : (count === cap ? 'full' : '');

    const isLounge = table.kind === 'lounge';
    const search = (state.seatingPanelSearch || '').toLowerCase().trim();
    const unassigned = state.guests
        .filter(g => !g.tableId)
        .filter(g => {
            if (!search) return true;
            return [g.firstName, g.lastName, g.party, g.email]
                .some(v => (v || '').toLowerCase().includes(search));
        })
        .sort((a, b) => (a.lastName || '').localeCompare(b.lastName || ''))
        .slice(0, 50);

    panel.innerHTML = `
        <div class="seating-panel-header">
            <h3>${escapeHtml(table.label)}</h3>
            <span class="seating-panel-counter ${counterClass}">${count}/${cap}</span>
        </div>
        <div class="seating-panel-section">
            <div class="seating-panel-section-label">Capacity</div>
            <div class="seating-capacity-buttons">
                <button class="${cap === 10 ? 'active' : ''}" ${isLounge ? 'disabled' : ''} onclick="setTableCapacity('${table.id}', 10)">10</button>
                <button class="${cap === 12 ? 'active' : ''}" onclick="setTableCapacity('${table.id}', 12)">12</button>
            </div>
        </div>
        <div class="seating-panel-section">
            <div class="seating-panel-section-label">Seated (${count})</div>
            ${seated.length === 0 ? '<div class="seating-search-empty">No guests seated yet</div>' : seated.map(g => `
                <div class="guest-chip">
                    <span><span class="chip-name">${escapeHtml((g.firstName || '') + ' ' + (g.lastName || ''))}</span>${g.party ? `<span class="chip-party">· ${escapeHtml(g.party)}</span>` : ''}</span>
                    <button class="remove-btn" onclick="unseatGuest('${g.id}')" title="Remove from table">×</button>
                </div>
            `).join('')}
        </div>
        <div class="seating-panel-section">
            <div class="seating-panel-section-label">Add Guest</div>
            <input type="text" class="search-input" id="seating-panel-search" placeholder="Search unassigned guests…" value="${escapeHtml(state.seatingPanelSearch || '')}" oninput="handleSeatingPanelSearch(this.value)" style="width:100%;padding:6px 10px;border:1px solid #d1d5db;border-radius:6px;font-size:0.85rem;">
            <div class="seating-search-results">
                ${unassigned.length === 0 ? '<div class="seating-search-empty">No matching unassigned guests</div>' : unassigned.map(g => `
                    <div class="seating-search-result" onclick="seatGuest('${g.id}', '${table.id}')">
                        <span>${escapeHtml((g.firstName || '') + ' ' + (g.lastName || ''))}</span>
                        ${g.party ? `<span class="result-party"> · ${escapeHtml(g.party)}</span>` : ''}
                    </div>
                `).join('')}
            </div>
        </div>
    `;
    // Restore focus on search input if it was being typed in
    const searchInput = document.getElementById('seating-panel-search');
    if (searchInput && state.seatingPanelSearch) {
        searchInput.focus();
        searchInput.setSelectionRange(searchInput.value.length, searchInput.value.length);
    }
}

function handleSeatingPanelSearch(value) {
    state.seatingPanelSearch = value;
    renderSeatingPanel();
}

async function seatGuest(guestId, tableId) {
    const table = state.seatingTables.find(t => t.id === tableId);
    if (!table) return;
    const count = getTableAssignedCount(tableId);
    if (count >= (table.capacity || 0)) {
        showToast(`${table.label} is full (${count}/${table.capacity})`, 'error');
        return;
    }
    try {
        await collections.guests.doc(guestId).update({
            tableId,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
    } catch (err) {
        console.error('Error seating guest:', err);
        showToast('Error seating guest', 'error');
    }
}

async function unseatGuest(guestId) {
    try {
        await collections.guests.doc(guestId).update({
            tableId: '',
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
    } catch (err) {
        console.error('Error unseating guest:', err);
        showToast('Error unseating guest', 'error');
    }
}

async function setTableCapacity(tableId, capacity) {
    const table = state.seatingTables.find(t => t.id === tableId);
    if (!table || table.kind === 'lounge') return;
    const count = getTableAssignedCount(tableId);
    if (count > capacity) {
        showToast(`Table has ${count} seated — unseat first`, 'error');
        return;
    }
    try {
        await collections.seatingTables.doc(tableId).update({
            capacity,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        showToast(`Capacity set to ${capacity}`);
    } catch (err) {
        console.error('Error updating capacity:', err);
        showToast('Error updating capacity', 'error');
    }
}

// ---------- Import / Export ----------

async function importGuestsFromXlsx(file) {
    if (!file) return;
    if (typeof XLSX === 'undefined') {
        showToast('XLSX library not loaded', 'error');
        return;
    }
    try {
        const data = await file.arrayBuffer();
        const workbook = XLSX.read(data);
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });
        if (rows.length === 0) {
            showToast('No rows found in file', 'warning');
            return;
        }

        const norm = (s) => String(s || '').toLowerCase().replace(/[\s_]/g, '');
        const fieldAliases = {
            firstname: 'firstName', first: 'firstName',
            lastname: 'lastName', last: 'lastName', surname: 'lastName',
            party: 'party', group: 'party',
            email: 'email', 'e-mail': 'email',
            phone: 'phone', mobile: 'phone',
            dietary: 'dietary', diet: 'dietary',
            notes: 'notes', note: 'notes'
        };

        showToast(`Importing ${rows.length} guests…`, 'info');
        const batchSize = 400;
        for (let i = 0; i < rows.length; i += batchSize) {
            const batch = firebase.firestore().batch();
            const slice = rows.slice(i, i + batchSize);
            slice.forEach(row => {
                const guest = { firstName: '', lastName: '', party: '', tableId: '', email: '', phone: '', dietary: '', notes: '' };
                Object.keys(row).forEach(key => {
                    const target = fieldAliases[norm(key)];
                    if (target) guest[target] = String(row[key] || '').trim();
                });
                if (!guest.firstName && !guest.lastName) return;
                guest.createdAt = firebase.firestore.FieldValue.serverTimestamp();
                guest.updatedAt = firebase.firestore.FieldValue.serverTimestamp();
                const ref = collections.guests.doc();
                batch.set(ref, guest);
            });
            await batch.commit();
        }
        showToast(`Imported ${rows.length} guests`, 'success');
        document.getElementById('seating-import-input').value = '';
    } catch (err) {
        console.error('Error importing guests:', err);
        showToast('Error importing guests', 'error');
    }
}

function exportSeatingToXlsx() {
    if (typeof XLSX === 'undefined') {
        showToast('XLSX library not loaded', 'error');
        return;
    }
    const guestsRows = state.guests.map(g => ({
        id: g.id,
        'First Name': g.firstName || '',
        'Last Name': g.lastName || '',
        Party: g.party || '',
        Table: getTableLabel(g.tableId) || '',
        Email: g.email || '',
        Phone: g.phone || '',
        Dietary: g.dietary || '',
        Notes: g.notes || ''
    }));
    const tablesRows = sortSeatingTables(state.seatingTables).map(t => ({
        id: t.id,
        Label: t.label,
        Kind: t.kind,
        Number: t.number,
        Capacity: t.capacity,
        Assigned: getTableAssignedCount(t.id)
    }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(guestsRows), 'Guests');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(tablesRows), 'Tables');
    const date = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(wb, `gala-seating-${date}.xlsx`);
}

// Window exports
window.editSeatingCell = editSeatingCell;
window.deleteGuest = deleteGuest;
window.duplicateGuest = duplicateGuest;
window.openGuestModal = openGuestModal;
window.setSeatingView = setSeatingView;
window.handleSeatingSearch = handleSeatingSearch;
window.toggleSeatingUnassignedOnly = toggleSeatingUnassignedOnly;
window.handleSeatingPanelSearch = handleSeatingPanelSearch;
window.seatGuest = seatGuest;
window.unseatGuest = unseatGuest;
window.setTableCapacity = setTableCapacity;
window.importGuestsFromXlsx = importGuestsFromXlsx;
window.exportSeatingToXlsx = exportSeatingToXlsx;
