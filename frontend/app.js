const API_BASE_URL = 'http://localhost:8000/api';

// Auth Check
const userEmail = localStorage.getItem('userEmail');
if (!userEmail) window.location.href = 'login.html';

// ─── State ───
let state = {
    mementos: [],
    activeArticleId: null,
    isAnalyzing: false,
    currentForceUrl: null
};

// ─── DOM Elements ───
const elements = {};

function initElements() {
    elements.urlInput = document.getElementById('urlInput');
    elements.analyzeBtn = document.getElementById('analyzeBtn');
    elements.mementosList = document.getElementById('mementosList');
    elements.sidebarSearch = document.getElementById('sidebarSearch');
    elements.refreshBtn = document.getElementById('refreshMementosBtn');
    
    // Views
    elements.heroSection = document.getElementById('heroSection');
    elements.dashboardView = document.getElementById('dashboardView');
    elements.resultsView = document.getElementById('resultsView');
    elements.compareView = document.getElementById('compareView');
    elements.compareContent = document.getElementById('compareContent');
    elements.helpView = document.getElementById('helpView');
    elements.aboutView = document.getElementById('aboutView');
    elements.loadingState = document.getElementById('loadingState');
    
    // Result Fields
    elements.displayTitle = document.getElementById('displayTitle');
    elements.sourceLink = document.getElementById('sourceLink');
    elements.resSummary = document.getElementById('resSummary');
    elements.resMethodology = document.getElementById('resMethodology');
    elements.resResults = document.getElementById('resResults');
    elements.resContributions = document.getElementById('resContributions');
    elements.resEvolution = document.getElementById('resEvolution');
    elements.resGaps = document.getElementById('resGaps');
    
    // Stats
    elements.statTotalPapers = document.getElementById('statTotalPapers');
    elements.statRecentTitle = document.getElementById('statRecentTitle');
    elements.statTotalWords = document.getElementById('statTotalWords');
    
    // Timeline
    elements.timelineView = document.getElementById('timelineView');
    
    // Chat
    elements.chatbot = document.getElementById('chatbot');
    elements.chatbotToggle = document.getElementById('chatbotToggle');
    elements.chatWindow = document.getElementById('chatWindow');
    elements.chatMessages = document.getElementById('chatMessages');
    elements.chatInput = document.getElementById('chatInput');
    elements.sendChatBtn = document.getElementById('sendChatBtn');
    
    // Modals
    elements.duplicateModal = document.getElementById('duplicateModal');
    elements.deleteModal = document.getElementById('deleteModal');
    
    // Actions
    elements.compareBtn = document.getElementById('compareBtn');
    elements.logoutBtn = document.getElementById('logoutBtn');
}

// ─── Initialization ───
document.addEventListener('DOMContentLoaded', async () => {
    initElements();
    setupEventListeners();
    setupAnimations();
    initTypewriter('heroTyping', ["Analyze. Compare. Evolve.", "Unlock Research Insights.", "Academic Intelligence."]);
    await init();
});

async function init() {
    await fetchMementos();
    await fetchStats();
}

function setupEventListeners() {
    elements.analyzeBtn.addEventListener('click', () => handleAnalyze(false));
    elements.refreshBtn.addEventListener('click', init);
    elements.sidebarSearch.addEventListener('input', filterMementos);
    
    elements.chatbotToggle.addEventListener('click', toggleChat);
    const closeChatBtn = document.getElementById('closeChat');
    if (closeChatBtn) closeChatBtn.addEventListener('click', toggleChat);
    
    elements.sendChatBtn.addEventListener('click', handleChatSend);
    elements.chatInput.addEventListener('keypress', (e) => e.key === 'Enter' && handleChatSend());
    
    elements.logoutBtn.addEventListener('click', () => {
        localStorage.removeItem('userEmail');
        window.location.href = 'login.html';
    });

    const btd = document.getElementById('backToDash');
    if (btd) btd.addEventListener('click', showDashboard);
    
    const btdc = document.getElementById('backToDashCompare');
    if (btdc) btdc.addEventListener('click', showDashboard);
    
    // Navigation
    document.querySelectorAll('#navHome').forEach(el => el.addEventListener('click', showDashboard));
    document.querySelectorAll('#navHelp').forEach(el => el.addEventListener('click', () => {
        showView('helpView');
        updateActiveNav('navHelp');
    }));
    document.querySelectorAll('#navAbout').forEach(el => el.addEventListener('click', () => {
        showView('aboutView');
        updateActiveNav('navAbout');
    }));

    elements.compareBtn.addEventListener('click', handleCompare);

    // Modal Actions
    document.getElementById('confirmAnalyze').addEventListener('click', () => {
        hideModal('duplicateModal');
        handleAnalyze(true);
    });
    document.getElementById('cancelAnalyze').addEventListener('click', () => hideModal('duplicateModal'));
    
    document.getElementById('cancelDelete').addEventListener('click', () => hideModal('deleteModal'));

    const closeErrorModalBtn = document.getElementById('closeErrorModal');
    if (closeErrorModalBtn) {
        closeErrorModalBtn.addEventListener('click', () => hideModal('errorModal'));
    }
}

function setupAnimations() {
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('animate-in');
            }
        });
    }, { threshold: 0.1 });

    document.querySelectorAll('.reveal-on-scroll').forEach(el => observer.observe(el));
}

// ─── Core Logic ───
async function fetchMementos() {
    try {
        const res = await fetch(`${API_BASE_URL}/mementos`, {
            headers: { 'x-user-email': userEmail }
        });
        if (res.status === 401) {
            localStorage.removeItem('userEmail');
            window.location.href = 'login.html';
            return;
        }
        state.mementos = await res.json();
        renderMementosList(state.mementos);
        renderTimeline(state.mementos);
    } catch (err) {
        console.error('Fetch mementos error:', err);
    }
}

async function fetchStats() {
    try {
        const res = await fetch(`${API_BASE_URL}/stats`, {
            headers: { 'x-user-email': userEmail }
        });
        const stats = await res.json();
        elements.statTotalPapers.textContent = stats.total_papers;
        elements.statRecentTitle.textContent = stats.recent_title !== 'None' ? stats.recent_title.substring(0, 15) + '...' : 'N/A';
        elements.statTotalWords.textContent = (stats.total_words / 1000).toFixed(1) + 'k';
    } catch (err) {
        console.error('Stats error:', err);
    }
}

function parseDate(dateStr) {
    if (!dateStr) return new Date();
    // SQLite format: 2026-04-27 12:12:25
    // Replace space with T to make it ISO-like
    const isoStr = dateStr.replace(' ', 'T');
    const date = new Date(isoStr);
    return isNaN(date.getTime()) ? new Date() : date;
}

function renderMementosList(list) {
    elements.mementosList.innerHTML = '';
    list.forEach(m => {
        const li = document.createElement('li');
        li.className = `memento-item-wrapper ${state.activeArticleId === m.id ? 'active' : ''}`;
        li.innerHTML = `
            <input type="checkbox" class="memento-checkbox" value="${m.id}">
            <div class="memento-info">
                <span class="memento-title" title="${m.title}">${m.title}</span>
                <span class="memento-date">${parseDate(m.created_at).toLocaleDateString()}</span>
            </div>
            <button class="delete-memento-btn">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
            </button>
        `;
        
        li.querySelector('.memento-info').addEventListener('click', () => displayArticle(m.id));
        li.querySelector('.memento-checkbox').addEventListener('change', updateCompareBtn);
        li.querySelector('.delete-memento-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            showDeleteConfirm(m.id);
        });
        
        elements.mementosList.appendChild(li);
    });
    updateCompareBtn(); // Ensure button state is correct after render
}

function renderTimeline(list) {
    if (!list || list.length === 0) {
        elements.timelineView.innerHTML = '<div class="empty-timeline">No research papers in your timeline yet.</div>';
        return;
    }
    elements.timelineView.innerHTML = '';
    list.forEach(m => {
        const div = document.createElement('div');
        div.className = 'timeline-item';
        div.innerHTML = `
            <span class="timeline-year">${parseDate(m.created_at).getFullYear()}</span>
            <span class="timeline-title">${m.title}</span>
            <button class="ghost-btn timeline-view-btn" style="padding: 6px 12px; font-size: 0.75rem;">View Analysis</button>
        `;
        div.querySelector('.timeline-view-btn').addEventListener('click', () => displayArticle(m.id));
        elements.timelineView.appendChild(div);
    });
}

function filterMementos() {
    const term = elements.sidebarSearch.value.toLowerCase();
    const filtered = state.mementos.filter(m => m.title.toLowerCase().includes(term));
    renderMementosList(filtered);
}

function updateCompareBtn() {
    const checked = document.querySelectorAll('.memento-checkbox:checked');
    elements.compareBtn.disabled = checked.length < 2;
    if (checked.length >= 2) {
        elements.compareBtn.classList.add('pulse-animation');
    } else {
        elements.compareBtn.classList.remove('pulse-animation');
    }
}

// ─── Analysis Logic ───
async function handleAnalyze(force = false) {
    const url = force ? state.currentForceUrl : elements.urlInput.value.trim();
    if (!url) return;

    state.isAnalyzing = true;
    showLoading(true);
    
    // Simulate progress
    updateAnalysisProgress(10, 'Initializing Analysis...');
    
    try {
        updateAnalysisProgress(30, 'Scraping Content...');
        const res = await fetch(`${API_BASE_URL}/analyze`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-user-email': userEmail
            },
            body: JSON.stringify({ url, force_analyze: force })
        });
        
        updateAnalysisProgress(60, 'AI Synthesis in Progress...');
        
        if (res.status === 409) {
            state.currentForceUrl = url;
            showModal('duplicateModal');
            showLoading(false);
            return;
        }
        
        if (!res.ok) {
            const errData = await res.json();
            throw new Error(errData.detail || 'Analysis failed');
        }
        
        const data = await res.json();
        updateAnalysisProgress(90, 'Finalizing Memento...');
        
        elements.urlInput.value = '';
        await init();
        displayArticle(data.id);
        
        updateAnalysisProgress(100, 'Success!');
    } catch (err) {
        console.error('Analyze error:', err);
        showError(err.message, 'Analysis Failed');
    } finally {
        state.isAnalyzing = false;
        setTimeout(() => showLoading(false), 500);
    }
}

function updateAnalysisProgress(percent, status) {
    const bar = document.querySelector('.analysis-progress-bar');
    const text = document.querySelector('.progress-status');
    if (bar) bar.style.width = `${percent}%`;
    if (text) text.textContent = status;
}

function displayArticle(id) {
    const article = state.mementos.find(m => m.id === id);
    if (!article) return;

    state.activeArticleId = id;
    showResults(true);
    
    elements.displayTitle.textContent = article.title;
    elements.sourceLink.href = article.url;

    // Clear previous
    elements.resSummary.innerHTML = '';
    elements.resMethodology.innerHTML = '';
    elements.resResults.innerHTML = '';
    elements.resContributions.innerHTML = '';
    elements.resEvolution.innerHTML = '';
    elements.resGaps.innerHTML = '';

    // Typing animations
    typeWriter(elements.resSummary, article.problem);
    typeWriter(elements.resMethodology, article.methodology);
    typeWriter(elements.resResults, article.results);
    
    // Render list for contributions
    const contribs = article.contributions.split(',').map(c => c.trim());
    contribs.forEach(c => {
        if (!c) return;
        const li = document.createElement('li');
        li.textContent = c;
        elements.resContributions.appendChild(li);
    });

    typeWriter(elements.resEvolution, article.insights);
    typeWriter(elements.resGaps, article.research_gaps || "No gaps identified.");

    // Scroll back to top of results
    const container = document.getElementById('scrollContainer');
    if (container) container.scrollTop = 0;
    
    renderMementosList(state.mementos); // Update active class
}

function typeWriter(element, text) {
    if (!text || !element) return;
    let i = 0;
    const speed = 5;
    element.innerHTML = '';
    function type() {
        if (i < text.length) {
            element.innerHTML += text.charAt(i);
            i++;
            setTimeout(type, speed);
        }
    }
    type();
}

// ─── Chat Logic ───
function toggleChat() {
    if (!elements.chatWindow) return;
    elements.chatWindow.classList.toggle('hidden');
    const badge = elements.chatbot.querySelector('.chat-badge');
    if (badge) badge.classList.add('hidden');
}

async function handleChatSend() {
    const query = elements.chatInput.value.trim();
    if (!query || !state.activeArticleId) return;

    appendMessage('user', query);
    elements.chatInput.value = '';

    try {
        const res = await fetch(`${API_BASE_URL}/chat`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-user-email': userEmail
            },
            body: JSON.stringify({
                article_id: state.activeArticleId,
                query: query
            })
        });
        const data = await res.json();
        appendMessage('system', data.response);
    } catch (err) {
        appendMessage('system', 'Error connecting to AI assistant.');
    }
}

function appendMessage(sender, text) {
    const msg = document.createElement('div');
    msg.className = `message ${sender}`;
    elements.chatMessages.appendChild(msg);
    elements.chatMessages.scrollTop = elements.chatMessages.scrollHeight;

    if (sender === 'system') {
        let i = 0;
        const speed = 10;
        function type() {
            if (i < text.length) {
                msg.textContent += text.charAt(i);
                i++;
                elements.chatMessages.scrollTop = elements.chatMessages.scrollHeight;
                setTimeout(type, speed);
            }
        }
        type();
    } else {
        msg.textContent = text;
    }
}

// ─── Compare Logic ───
async function handleCompare() {
    const checked = document.querySelectorAll('.memento-checkbox:checked');
    const selectedPapers = Array.from(checked).map(cb => parseInt(cb.value));

    // Task 4: Validate input before API call
    if (!selectedPapers || selectedPapers.length < 2) {
        alert("Please select at least 2 papers to compare.");
        return;
    }

    showLoading(true);
    try {
        const res = await fetch(`${API_BASE_URL}/compare`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-user-email': userEmail
            },
            body: JSON.stringify({ article_ids: selectedPapers })
        });
        
        const data = await res.json();

        // Task 3: Fix Frontend Handling
        if (!data || data.success === false) {
            console.error("Comparison failed:", data);
            showError(data?.error || "Comparison failed. Please try again.", "API Limit Reached");
            return;
        }

        renderStructuredComparison(data.comparison);
        showCompare(true);
    } catch (err) {
        console.error('Comparison error:', err);
        showError('An unexpected error occurred during comparison.');
    } finally {
        showLoading(false);
    }
}

function renderStructuredComparison(text) {
    if (!elements.compareContent) return;
    elements.compareContent.innerHTML = '';

    const sections = {
        'OVERVIEW': { icon: '📌', title: 'Overview' },
        'METHODOLOGY': { icon: '🔬', title: 'Methodology' },
        'RESULTS': { icon: '📊', title: 'Results' },
        'CONTRIBUTIONS': { icon: '💡', title: 'Key Contributions' },
        'EVOLUTION': { icon: '🔄', title: 'Evolution' },
        'GAPS': { icon: '📉', title: 'Research Gaps' },
        'SUMMARY': { icon: '🧾', title: 'Final Summary' }
    };

    let currentSection = null;
    const lines = text.split('\n');
    const contentMap = {};

    lines.forEach(line => {
        const match = line.match(/^\[(OVERVIEW|METHODOLOGY|RESULTS|CONTRIBUTIONS|EVOLUTION|GAPS|SUMMARY)\]/);
        if (match) {
            currentSection = match[1];
            contentMap[currentSection] = [];
        } else if (currentSection && line.trim()) {
            contentMap[currentSection].push(line.trim());
        }
    });

    // Header Row
    const headerRow = document.createElement('div');
    headerRow.className = 'comparison-header-row reveal-on-scroll';
    headerRow.innerHTML = `
        <div class="row-label">Comparison Scope</div>
        <div class="paper-title-card p1">📄 Research Paper 1</div>
        <div class="paper-title-card p2">📄 Research Paper 2</div>
    `;
    elements.compareContent.appendChild(headerRow);

    Object.keys(sections).forEach(key => {
        const data = contentMap[key] || [];
        if (data.length > 0) {
            // Split content between two columns (heuristic split or use markers if LLM updated)
            // For now, let's split by finding "Paper 1:" and "Paper 2:" if present, or just half-half
            let p1Text = '', p2Text = '';
            
            const fullText = data.join('\n');
            if (fullText.includes('Paper 1:') && fullText.includes('Paper 2:')) {
                const parts = fullText.split(/Paper [12]:/);
                p1Text = parts[1] || '';
                p2Text = parts[2] || '';
            } else {
                // Heuristic: alternate or just show in both if not clearly separated
                const half = Math.ceil(data.length / 2);
                p1Text = data.slice(0, half).join('<br>');
                p2Text = data.slice(half).join('<br>');
            }

            const row = document.createElement('div');
            row.className = 'comparison-row reveal-on-scroll';
            row.innerHTML = `
                <div class="row-label">
                    <span>${sections[key].icon} ${sections[key].title}</span>
                </div>
                <div class="paper-col p1 hover-lift">${p1Text || 'N/A'}</div>
                <div class="paper-col p2 hover-lift">${p2Text || 'N/A'}</div>
            `;
            elements.compareContent.appendChild(row);
        }
    });

    setupScrollReveal();
}

// ─── Delete Logic ───
let deleteIdPending = null;
function showDeleteConfirm(id) {
    deleteIdPending = id;
    showModal('deleteModal');
}

const confirmDeleteBtn = document.getElementById('confirmDelete');
if (confirmDeleteBtn) {
    confirmDeleteBtn.addEventListener('click', async () => {
        if (!deleteIdPending) return;
        try {
            await fetch(`${API_BASE_URL}/mementos/${deleteIdPending}`, {
                method: 'DELETE',
                headers: { 'x-user-email': userEmail }
            });
            hideModal('deleteModal');
            await init();
            if (state.activeArticleId === deleteIdPending) {
                state.activeArticleId = null;
                showDashboard();
            }
        } catch (err) {
            showError('Delete failed.');
        }
    });
}

// ─── View Management ───
function showLoading(show) {
    if (!elements.loadingState) return;
    elements.loadingState.classList.toggle('hidden', !show);
    if (!show) {
        // Reset progress bar on hide
        const bar = document.querySelector('.analysis-progress-bar');
        if (bar) bar.style.width = '0%';
    }
}

function showDashboard() {
    showView('dashboardView');
    // Special case for dashboard to show hero
    if (elements.heroSection) elements.heroSection.classList.remove('hidden');
    
    // Reset sidebar selection
    state.activeArticleId = null;
    renderMementosList(state.mementos);
    
    // Reset active nav
    updateActiveNav('navHome');
}

function showResults(show) {
    showView('resultsView');
}

function showCompare(show) {
    showView('compareView');
}

function showView(viewId) {
    const views = ['dashboardView', 'resultsView', 'compareView', 'helpView', 'aboutView'];
    views.forEach(v => {
        if (elements[v]) elements[v].classList.add('hidden');
    });
    
    if (elements.heroSection) elements.heroSection.classList.add('hidden');
    if (elements[viewId]) elements[viewId].classList.remove('hidden');
    
    // Scroll to top
    const container = document.getElementById('scrollContainer');
    if (container) container.scrollTop = 0;
}

function updateActiveNav(id) {
    document.querySelectorAll('.header-tab-btn').forEach(btn => btn.classList.remove('active'));
    const activeBtn = document.getElementById(id);
    if (activeBtn) activeBtn.classList.add('active');
}

function setupScrollReveal() {
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('active');
            }
        });
    }, { threshold: 0.1 });

    document.querySelectorAll('.reveal-on-scroll').forEach(el => observer.observe(el));
}

function initTypewriter(id, words) {
    const el = document.getElementById(id);
    if (!el) return;
    let wordIdx = 0;
    let charIdx = 0;
    let isDeleting = false;

    function type() {
        const currentWord = words[wordIdx];
        if (isDeleting) {
            el.textContent = currentWord.substring(0, charIdx - 1);
            charIdx--;
        } else {
            el.textContent = currentWord.substring(0, charIdx + 1);
            charIdx++;
        }

        let typeSpeed = isDeleting ? 50 : 100;

        if (!isDeleting && charIdx === currentWord.length) {
            isDeleting = true;
            typeSpeed = 2000; // Pause at end
        } else if (isDeleting && charIdx === 0) {
            isDeleting = false;
            wordIdx = (wordIdx + 1) % words.length;
            typeSpeed = 500;
        }

        setTimeout(type, typeSpeed);
    }
    type();
}

function showModal(id) {
    const m = document.getElementById(id);
    if (m) m.classList.remove('hidden');
}

function hideModal(id) {
    const m = document.getElementById(id);
    if (m) m.classList.add('hidden');
}

function showError(message, title = "System Message") {
    const titleEl = document.getElementById('errorModalTitle');
    const msgEl = document.getElementById('errorModalMessage');
    if (titleEl) titleEl.textContent = title;
    if (msgEl) msgEl.textContent = message;
    showModal('errorModal');
}
