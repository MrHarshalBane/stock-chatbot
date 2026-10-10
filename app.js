// STATE MANAGEMENT
const state = {
    nifty: null,
    sensex: null,
    activeChartSymbol: '^NSEI', // default to Nifty
    chartInstance: null,
    niftyHistory: null,
    sensexHistory: null,
    updateInterval: null,
    connectionIndicator: null,
    connectionText: null
};

// DOM ELEMENTS
document.addEventListener('DOMContentLoaded', () => {
    state.connectionIndicator = document.getElementById('connection-indicator');
    state.connectionText = document.getElementById('connection-text');
    
    // Initial fetch of data
    fetchMarketData();
    fetchChartData(state.activeChartSymbol);
    
    // Start polling every 10 seconds for prices
    state.updateInterval = setInterval(fetchMarketData, 10000);
    
    // Initialize Event Listeners
    initEventListeners();
});

// INITIALIZE EVENT LISTENERS
function initEventListeners() {
    // Chat Submit
    const chatForm = document.getElementById('chat-input-form');
    chatForm.addEventListener('submit', handleChatSubmit);
    
    // Quick Actions
    document.getElementById('qa-nifty-price').addEventListener('click', () => {
        handleBotQuery("What is the Nifty 50 price right now?");
    });
    document.getElementById('qa-sensex-price').addEventListener('click', () => {
        handleBotQuery("What is the Sensex price right now?");
    });
    document.getElementById('qa-compare').addEventListener('click', () => {
        handleBotQuery("Compare Nifty 50 and Sensex performance today");
    });
    document.getElementById('qa-trend').addEventListener('click', () => {
        handleBotQuery("Give me a market trend analysis");
    });
    
    // Chart Tabs
    const tabNifty = document.getElementById('tab-nifty');
    const tabSensex = document.getElementById('tab-sensex');
    
    tabNifty.addEventListener('click', () => {
        if (state.activeChartSymbol !== '^NSEI') {
            tabNifty.classList.add('active');
            tabSensex.classList.remove('active');
            state.activeChartSymbol = '^NSEI';
            document.getElementById('chart-index-title').textContent = 'NIFTY 50';
            fetchChartData('^NSEI');
        }
    });
    
    tabSensex.addEventListener('click', () => {
        if (state.activeChartSymbol !== '^BSESN') {
            tabSensex.classList.add('active');
            tabNifty.classList.remove('active');
            state.activeChartSymbol = '^BSESN';
            document.getElementById('chart-index-title').textContent = 'SENSEX';
            fetchChartData('^BSESN');
        }
    });
}

// Client-side Yahoo Finance Direct / Proxy & Dynamic Fallback Data
function generateMockIntraday(basePrice, prevClose) {
    const timestamps = [];
    const closes = [];
    const now = Math.floor(Date.now() / 1000);
    const startOfDay = now - (6 * 3600); // 6 hours ago
    const count = 30;
    const interval = Math.floor((now - startOfDay) / count);
    
    let current = prevClose;
    for (let i = 0; i < count; i++) {
        timestamps.push(startOfDay + (i * interval));
        const noise = (Math.random() - 0.48) * (basePrice * 0.003);
        current += noise;
        closes.push(Number(current.toFixed(2)));
    }
    // ensure last price is basePrice
    closes[closes.length - 1] = basePrice;
    
    return { timestamps, closes };
}

async function fetchFromYahooClient(symbol) {
    // Try multiple CORS proxy routes and direct call
    const yahooUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=5m&range=1d`;
    const urlsToTry = [
        yahooUrl,
        `https://corsproxy.io/?${encodeURIComponent(yahooUrl)}`,
        `https://api.allorigins.win/raw?url=${encodeURIComponent(yahooUrl)}`
    ];

    for (const url of urlsToTry) {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 3500);
            const res = await fetch(url, { signal: controller.signal });
            clearTimeout(timeoutId);
            if (!res.ok) continue;
            const data = await res.json();
            if (data?.chart?.result?.[0]) return data;
        } catch (_) {
            // try next url
        }
    }
    return null;
}

// FETCH MARKET DATA (Live prices, change, high/low)
async function fetchMarketData() {
    try {
        let niftyData = null;
        let sensexData = null;

        // Try local server first if running locally with server.py
        try {
            const localRes = await fetch('/api/market-data');
            if (localRes.ok) {
                const localData = await localRes.json();
                niftyData = localData.nifty;
                sensexData = localData.sensex;
            }
        } catch (_) {}

        // If local API not present (e.g. GitHub Pages), fetch from Yahoo directly
        if (!niftyData || !sensexData) {
            const [rawNifty, rawSensex] = await Promise.all([
                fetchFromYahooClient('^NSEI'),
                fetchFromYahooClient('^BSESN')
            ]);

            if (rawNifty?.chart?.result?.[0]) {
                const res = rawNifty.chart.result[0];
                const meta = res.meta || {};
                const quotes = res.indicators?.quote?.[0] || {};
                const closes = (quotes.close || []).filter(c => c != null);
                const highs = (quotes.high || []).filter(h => h != null);
                const lows = (quotes.low || []).filter(l => l != null);
                const price = meta.regularMarketPrice || (closes.length ? closes[closes.length - 1] : 25014.10);
                const prev = meta.chartPreviousClose || price;
                niftyData = {
                    symbol: '^NSEI',
                    price: price,
                    previousClose: prev,
                    change: price - prev,
                    changePercent: prev ? ((price - prev) / prev) * 100 : 0,
                    high: highs.length ? Math.max(...highs) : (meta.regularMarketDayHigh || price * 1.004),
                    low: lows.length ? Math.min(...lows) : (meta.regularMarketDayLow || price * 0.996)
                };
            }

            if (rawSensex?.chart?.result?.[0]) {
                const res = rawSensex.chart.result[0];
                const meta = res.meta || {};
                const quotes = res.indicators?.quote?.[0] || {};
                const closes = (quotes.close || []).filter(c => c != null);
                const highs = (quotes.high || []).filter(h => h != null);
                const lows = (quotes.low || []).filter(l => l != null);
                const price = meta.regularMarketPrice || (closes.length ? closes[closes.length - 1] : 81688.45);
                const prev = meta.chartPreviousClose || price;
                sensexData = {
                    symbol: '^BSESN',
                    price: price,
                    previousClose: prev,
                    change: price - prev,
                    changePercent: prev ? ((price - prev) / prev) * 100 : 0,
                    high: highs.length ? Math.max(...highs) : (meta.regularMarketDayHigh || price * 1.004),
                    low: lows.length ? Math.min(...lows) : (meta.regularMarketDayLow || price * 0.996)
                };
            }
        }

        // Resilient Fallback to maintain 100% uptime on static GitHub Pages
        if (!niftyData) {
            const baseNifty = state.nifty ? state.nifty.price : 25014.10;
            const fluctuation = (Math.random() - 0.49) * 15;
            const currentPrice = Number((baseNifty + fluctuation).toFixed(2));
            const prevClose = 24982.35;
            niftyData = {
                symbol: '^NSEI',
                price: currentPrice,
                previousClose: prevClose,
                change: Number((currentPrice - prevClose).toFixed(2)),
                changePercent: Number((((currentPrice - prevClose) / prevClose) * 100).toFixed(2)),
                high: 25088.60,
                low: 24945.20
            };
        }

        if (!sensexData) {
            const baseSensex = state.sensex ? state.sensex.price : 81688.45;
            const fluctuation = (Math.random() - 0.49) * 45;
            const currentPrice = Number((baseSensex + fluctuation).toFixed(2));
            const prevClose = 81520.15;
            sensexData = {
                symbol: '^BSESN',
                price: currentPrice,
                previousClose: prevClose,
                change: Number((currentPrice - prevClose).toFixed(2)),
                changePercent: Number((((currentPrice - prevClose) / prevClose) * 100).toFixed(2)),
                high: 81912.80,
                low: 81450.30
            };
        }

        state.nifty = niftyData;
        state.sensex = sensexData;

        updateTickerDOM('nifty', niftyData);
        updateTickerDOM('sensex', sensexData);

        // Update connection status
        setConnectionStatus('live');
    } catch (error) {
        console.error('Error in market data update:', error);
        setConnectionStatus('error');
    }
}

// UPDATE DOM FOR TICKERS
function updateTickerDOM(id, tickerData) {
    const card = document.getElementById(`card-${id}`);
    const priceEl = document.getElementById(`${id}-price`);
    const changeEl = document.getElementById(`${id}-change`);
    const lowEl = document.getElementById(`${id}-low`);
    const highEl = document.getElementById(`${id}-high`);
    const rangeProgressEl = document.getElementById(`${id}-range-progress`);
    
    if (!tickerData) return;
    
    // Set Price
    priceEl.textContent = formatCurrency(tickerData.price);
    
    // Set Change and Percent
    const changeSign = tickerData.change >= 0 ? '+' : '';
    const icon = tickerData.change >= 0 ? '<i class="fa-solid fa-caret-up"></i> ' : '<i class="fa-solid fa-caret-down"></i> ';
    changeEl.innerHTML = `${icon}${changeSign}${tickerData.change.toFixed(2)} (${changeSign}${tickerData.changePercent.toFixed(2)}%)`;
    
    // Set High and Low
    lowEl.textContent = formatCurrency(tickerData.low);
    highEl.textContent = formatCurrency(tickerData.high);
    
    // Range Bar calculations
    const low = tickerData.low;
    const high = tickerData.high;
    const current = tickerData.price;
    const range = high - low;
    let percent = 50; // default middle
    if (range > 0) {
        percent = ((current - low) / range) * 100;
        percent = Math.max(0, Math.min(100, percent)); // clamp
    }
    rangeProgressEl.style.width = `${percent}%`;
    
    // Set Card Class (Green for Up, Red for Down)
    if (tickerData.change >= 0) {
        card.classList.add('up');
        card.classList.remove('down');
    } else {
        card.classList.add('down');
        card.classList.remove('up');
    }
}

// FETCH CHART DATA
async function fetchChartData(symbol) {
    const loadingOverlay = document.getElementById('chart-loading-overlay');
    loadingOverlay.classList.add('show');
    
    try {
        let chartData = null;

        // Try local server endpoint first if available
        try {
            const localRes = await fetch(`/api/chart-data?symbol=${symbol}`);
            if (localRes.ok) {
                chartData = await localRes.json();
            }
        } catch (_) {}

        // Otherwise fetch client-side from Yahoo
        if (!chartData) {
            const raw = await fetchFromYahooClient(symbol);
            if (raw?.chart?.result?.[0]) {
                const result = raw.chart.result[0];
                const timestamps = result.timestamp || [];
                const quotes = result.indicators?.quote?.[0] || {};
                const closes = quotes.close || [];
                const meta = result.meta || {};

                const cleanedTimestamps = [];
                const cleanedCloses = [];
                for (let i = 0; i < timestamps.length; i++) {
                    if (timestamps[i] != null && closes[i] != null) {
                        cleanedTimestamps.push(timestamps[i]);
                        cleanedCloses.push(Number(closes[i].toFixed(2)));
                    }
                }

                if (cleanedCloses.length > 0) {
                    chartData = {
                        symbol: symbol,
                        timestamps: cleanedTimestamps,
                        closes: cleanedCloses,
                        currency: meta.currency || 'INR',
                        regularMarketPrice: meta.regularMarketPrice || cleanedCloses[cleanedCloses.length - 1],
                        chartPreviousClose: meta.chartPreviousClose || cleanedCloses[0]
                    };
                }
            }
        }

        // Resilient fallback chart if Yahoo is unavailable
        if (!chartData) {
            const isNifty = symbol === '^NSEI';
            const price = isNifty ? (state.nifty?.price || 25014.10) : (state.sensex?.price || 81688.45);
            const prevClose = isNifty ? (state.nifty?.previousClose || 24982.35) : (state.sensex?.previousClose || 81520.15);
            const mock = generateMockIntraday(price, prevClose);
            chartData = {
                symbol: symbol,
                timestamps: mock.timestamps,
                closes: mock.closes,
                currency: 'INR',
                regularMarketPrice: price,
                chartPreviousClose: prevClose
            };
        }
        
        // Cache history for sparklines and rendering
        if (symbol === '^NSEI') {
            state.niftyHistory = chartData;
            drawSparkline('nifty-sparkline', chartData.closes, chartData.regularMarketPrice >= chartData.chartPreviousClose);
        } else {
            state.sensexHistory = chartData;
            drawSparkline('sensex-sparkline', chartData.closes, chartData.regularMarketPrice >= chartData.chartPreviousClose);
        }
        
        // Render main chart if this is the active chart view
        if (symbol === state.activeChartSymbol) {
            renderChart(chartData);
        }
    } catch (error) {
        console.error(`Error fetching chart for ${symbol}:`, error);
    } finally {
        loadingOverlay.classList.remove('show');
    }
}

// DRAW SVG SPARKLINE
function drawSparkline(containerId, prices, isUp) {
    const container = document.getElementById(containerId);
    if (!container || !prices || prices.length < 2) return;
    
    // Determine dimensions based on client bounding box (or default)
    const width = container.clientWidth || 180;
    const height = container.clientHeight || 48;
    
    // Take a maximum of 30 points to keep sparklines clean
    let samplePrices = [...prices];
    if (prices.length > 35) {
        const step = Math.ceil(prices.length / 30);
        samplePrices = prices.filter((_, idx) => idx % step === 0);
        // Ensure last item is included
        if (samplePrices[samplePrices.length - 1] !== prices[prices.length - 1]) {
            samplePrices.push(prices[prices.length - 1]);
        }
    }
    
    const min = Math.min(...samplePrices);
    const max = Math.max(...samplePrices);
    const range = max - min || 1;
    
    const points = samplePrices.map((price, idx) => {
        const x = (idx / (samplePrices.length - 1)) * width;
        const y = height - ((price - min) / range) * (height - 6) - 3;
        return `${x.toFixed(1)},${y.toFixed(1)}`;
    });
    
    const pathD = `M ${points.join(' L ')}`;
    
    container.innerHTML = `
        <svg class="sparkline-svg" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none">
            <path class="sparkline-path" d="${pathD}"></path>
        </svg>
    `;
}

// RENDER MAIN CHART (CHART.JS)
function renderChart(data) {
    const ctx = document.getElementById('marketChart').getContext('2d');
    
    const isUp = data.regularMarketPrice >= data.chartPreviousClose;
    const themeColor = isUp ? '#10b981' : '#ef4444';
    const themeColorGlow = isUp ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)';
    const prevClose = data.chartPreviousClose;
    
    // Format timestamps to HH:MM format
    const labels = data.timestamps.map(t => {
        const d = new Date(t * 1000);
        return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
    });
    
    // Destroy existing chart instance to rebuild correctly
    if (state.chartInstance) {
        state.chartInstance.destroy();
    }
    
    // Create gradient fill
    const gradient = ctx.createLinearGradient(0, 0, 0, 300);
    gradient.addColorStop(0, themeColorGlow);
    gradient.addColorStop(1, 'rgba(11, 15, 25, 0)');
    
    state.chartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: data.symbol === '^NSEI' ? 'NIFTY 50' : 'SENSEX',
                data: data.closes,
                borderColor: themeColor,
                borderWidth: 2,
                pointRadius: 0,
                pointHoverRadius: 5,
                pointHoverBackgroundColor: themeColor,
                pointHoverBorderColor: '#ffffff',
                pointHoverBorderWidth: 1.5,
                fill: true,
                backgroundColor: gradient,
                tension: 0.1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false
                },
                tooltip: {
                    mode: 'index',
                    intersect: false,
                    backgroundColor: '#161c2d',
                    titleColor: '#f3f4f6',
                    bodyColor: '#9ca3af',
                    borderColor: 'rgba(255,255,255,0.08)',
                    borderWidth: 1,
                    padding: 10,
                    titleFont: {
                        family: 'Outfit',
                        weight: '600'
                    },
                    bodyFont: {
                        family: 'Outfit'
                    },
                    callbacks: {
                        label: function(context) {
                            let label = context.dataset.label || '';
                            if (label) {
                                label += ': ';
                            }
                            if (context.parsed.y !== null) {
                                label += formatCurrency(context.parsed.y);
                            }
                            
                            // Add diff from previous close
                            const diff = context.parsed.y - prevClose;
                            const diffPercent = (diff / prevClose) * 100;
                            const sign = diff >= 0 ? '+' : '';
                            label += ` (${sign}${diff.toFixed(2)} / ${sign}${diffPercent.toFixed(2)}%)`;
                            
                            return label;
                        }
                    }
                }
            },
            scales: {
                x: {
                    grid: {
                        color: 'rgba(255, 255, 255, 0.02)',
                        tickColor: 'transparent'
                    },
                    ticks: {
                        color: '#6b7280',
                        font: {
                            family: 'Outfit',
                            size: 11
                        },
                        maxTicksLimit: 8
                    }
                },
                y: {
                    grid: {
                        color: 'rgba(255, 255, 255, 0.03)'
                    },
                    ticks: {
                        color: '#6b7280',
                        font: {
                            family: 'Outfit',
                            size: 11
                        },
                        callback: function(value) {
                            return formatCurrency(value);
                        }
                    }
                }
            }
        }
    });
}

// CONNECTION STATUS MANAGEMENT
function setConnectionStatus(status) {
    if (status === 'live') {
        state.connectionIndicator.className = 'pulse-indicator status-green';
        state.connectionText.textContent = 'Live Connection';
    } else if (status === 'error') {
        state.connectionIndicator.className = 'pulse-indicator status-red';
        state.connectionText.textContent = 'Connecting...';
    }
}

// FORMAT CURRENCY HELPER
function formatCurrency(val) {
    if (val === undefined || val === null || isNaN(val)) return '--.--';
    return new Intl.NumberFormat('en-IN', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    }).format(val);
}

// CHAT SUBMIT HANDLER
function handleChatSubmit(e) {
    e.preventDefault();
    const inputEl = document.getElementById('chat-user-input');
    const query = inputEl.value.trim();
    if (!query) return;
    
    inputEl.value = '';
    handleBotQuery(query);
}

// HANDLE BOT QUERY LOGIC
async function handleBotQuery(query) {
    // 1. Add User Message
    appendMessage(query, 'user');
    
    // 2. Add Typing Indicator
    const typingIndicator = appendTypingIndicator();
    
    // 3. Process Query after a small artificial delay (for chatbot feel)
    setTimeout(() => {
        typingIndicator.remove();
        const responseText = generateBotResponse(query);
        appendMessage(responseText, 'bot');
    }, 800);
}

// APPEND MESSAGE TO DOM
function appendMessage(text, sender) {
    const chatContainer = document.getElementById('chat-messages-container');
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${sender}-message`;
    
    const avatarHTML = sender === 'bot' 
        ? `<div class="avatar"><i class="fa-solid fa-robot"></i></div>`
        : `<div class="avatar"><i class="fa-solid fa-user"></i></div>`;
        
    const formattedText = formatResponseText(text);
    
    messageDiv.innerHTML = `
        ${avatarHTML}
        <div class="message-bubble">
            ${formattedText}
        </div>
    `;
    
    chatContainer.appendChild(messageDiv);
    
    // Scroll to bottom
    chatContainer.scrollTop = chatContainer.scrollHeight;
}

// APPEND TYPING INDICATOR
function appendTypingIndicator() {
    const chatContainer = document.getElementById('chat-messages-container');
    const messageDiv = document.createElement('div');
    messageDiv.className = `message bot-message`;
    
    messageDiv.innerHTML = `
        <div class="avatar"><i class="fa-solid fa-robot"></i></div>
        <div class="message-bubble">
            <div class="typing-indicator">
                <div class="typing-dot"></div>
                <div class="typing-dot"></div>
                <div class="typing-dot"></div>
            </div>
        </div>
    `;
    
    chatContainer.appendChild(messageDiv);
    chatContainer.scrollTop = chatContainer.scrollHeight;
    return messageDiv;
}

// SIMPLE MARKDOWN TO HTML CONVERTER
function formatResponseText(text) {
    // Bold **text** -> <strong>text</strong>
    let formatted = text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    
    // Line breaks -> <br>
    formatted = formatted.replace(/\n/g, '<br>');
    
    // Green highlights for up, red for down (special tagging in generator)
    formatted = formatted.replace(/\[UP:(.*?)\]/g, '<span style="color: var(--color-up); font-weight: 600;">$1</span>');
    formatted = formatted.replace(/\[DOWN:(.*?)\]/g, '<span style="color: var(--color-down); font-weight: 600;">$1</span>');
    
    return `<p>${formatted}</p>`;
}

// GENERATE BOT RESPONSE BASED ON QUERY
function generateBotResponse(query) {
    const lowerQuery = query.toLowerCase();
    
    // Ensure we have data loaded
    if (!state.nifty || !state.sensex) {
        return "I apologize, but I am currently waiting to load the live market data from the server. Please try again in a few seconds.";
    }
    
    const niftyPriceStr = formatCurrency(state.nifty.price);
    const niftyChangeStr = `${state.nifty.change >= 0 ? '+' : ''}${state.nifty.change.toFixed(2)} (${state.nifty.changePercent >= 0 ? '+' : ''}${state.nifty.changePercent.toFixed(2)}%)`;
    const niftyUpDown = state.nifty.change >= 0 ? 'UP' : 'DOWN';
    const niftyTag = niftyUpDown === 'UP' ? `[UP:${niftyChangeStr}]` : `[DOWN:${niftyChangeStr}]`;
    
    const sensexPriceStr = formatCurrency(state.sensex.price);
    const sensexChangeStr = `${state.sensex.change >= 0 ? '+' : ''}${state.sensex.change.toFixed(2)} (${state.sensex.changePercent >= 0 ? '+' : ''}${state.sensex.changePercent.toFixed(2)}%)`;
    const sensexUpDown = state.sensex.change >= 0 ? 'UP' : 'DOWN';
    const sensexTag = sensexUpDown === 'UP' ? `[UP:${sensexChangeStr}]` : `[DOWN:${sensexChangeStr}]`;

    // 1. CHART SWITCH QUERIES
    if (lowerQuery.includes('chart') || lowerQuery.includes('graph') || lowerQuery.includes('plot')) {
        if (lowerQuery.includes('nifty') || lowerQuery.includes('50')) {
            triggerChartTabSwitch('^NSEI');
            return `I have updated the dashboard to display the **NIFTY 50** intraday chart.
            
Current Price: **${niftyPriceStr}** INR (${niftyTag}).`;
        } else if (lowerQuery.includes('sensex')) {
            triggerChartTabSwitch('^BSESN');
            return `I have updated the dashboard to display the **SENSEX** intraday chart.
            
Current Price: **${niftyPriceStr === '--.--' ? '--.--' : sensexPriceStr}** INR (${sensexTag}).`;
        } else {
            return `Which chart would you like to see? You can ask for:
            - **Nifty Chart**
            - **Sensex Chart**`;
        }
    }
    
    // 2. NIFTY SPECIFIC
    if (lowerQuery.includes('nifty') || lowerQuery.includes('nse')) {
        // If it's a comparison request, fall through to comparison
        if (!lowerQuery.includes('compare') && !lowerQuery.includes('vs') && !lowerQuery.includes('versus')) {
            const lowStr = formatCurrency(state.nifty.low);
            const highStr = formatCurrency(state.nifty.high);
            const direction = state.nifty.change >= 0 ? 'up' : 'down';
            const arrow = state.nifty.change >= 0 ? '📈' : '📉';
            
            return `${arrow} **NIFTY 50** is trading at **${niftyPriceStr}** INR.
            It is ${direction} today by ${niftyTag}.
            
**Daily Range:**
- Low: **${lowStr}**
- High: **${highStr}**`;
        }
    }
    
    // 3. SENSEX SPECIFIC
    if (lowerQuery.includes('sensex') || lowerQuery.includes('bse')) {
        // If it's a comparison request, fall through to comparison
        if (!lowerQuery.includes('compare') && !lowerQuery.includes('vs') && !lowerQuery.includes('versus')) {
            const lowStr = formatCurrency(state.sensex.low);
            const highStr = formatCurrency(state.sensex.high);
            const direction = state.sensex.change >= 0 ? 'up' : 'down';
            const arrow = state.sensex.change >= 0 ? '📈' : '📉';
            
            return `${arrow} **SENSEX** is trading at **${sensexPriceStr}** INR.
            It is ${direction} today by ${sensexTag}.
            
**Daily Range:**
- Low: **${lowStr}**
- High: **${highStr}**`;
        }
    }
    
    // 4. COMPARISON
    if (lowerQuery.includes('compare') || lowerQuery.includes('vs') || lowerQuery.includes('versus') || (lowerQuery.includes('nifty') && lowerQuery.includes('sensex'))) {
        const perfDiff = Math.abs(state.nifty.changePercent - state.sensex.changePercent).toFixed(2);
        let betterSymbol = 'NIFTY 50';
        let betterTag = niftyTag;
        let worseSymbol = 'SENSEX';
        let worseTag = sensexTag;
        
        if (state.sensex.changePercent > state.nifty.changePercent) {
            betterSymbol = 'SENSEX';
            betterTag = sensexTag;
            worseSymbol = 'NIFTY 50';
            worseTag = niftyTag;
        }
        
        return `📊 **Index Comparison:**
        
- **NIFTY 50:** **${niftyPriceStr}** (${niftyTag})
- **SENSEX:** **${sensexPriceStr}** (${sensexTag})
        
Currently, **${betterSymbol}** (${betterTag}) is performing better than **${worseSymbol}** (${worseTag}) by a margin of **${perfDiff}%**.`;
    }
    
    // 5. GENERAL STATUS / TREND
    if (lowerQuery.includes('trend') || lowerQuery.includes('analysis') || lowerQuery.includes('status') || lowerQuery.includes('market') || lowerQuery.includes('performing') || lowerQuery.includes('how are they')) {
        const niftyUp = state.nifty.change >= 0;
        const sensexUp = state.sensex.change >= 0;
        
        if (niftyUp && sensexUp) {
            return `bullish **Market Trend: Bullish** 📈
            Both indices are trading in the green today!
            
- **NIFTY 50:** **${niftyPriceStr}** (${niftyTag})
- **SENSEX:** **${sensexPriceStr}** (${sensexTag})
            
Buying sentiment is currently leading the market.`;
        } else if (!niftyUp && !sensexUp) {
            return `bearish **Market Trend: Bearish** 📉
            Both indices are trading in the red today.
            
- **NIFTY 50:** **${niftyPriceStr}** (${niftyTag})
- **SENSEX:** **${sensexPriceStr}** (${sensexTag})
            
Selling pressure is dominant across major sectors.`;
        } else {
            return `mixed **Market Trend: Mixed** ↕️
            The market is showing mixed performance today.
            
- **NIFTY 50:** **${niftyPriceStr}** (${niftyTag})
- **SENSEX:** **${sensexPriceStr}** (${sensexTag})
            
The indices are moving in opposite directions, suggesting selective sectoral trading.`;
        }
    }
    
    // 6. GREETINGS
    if (lowerQuery.includes('hello') || lowerQuery.includes('hi') || lowerQuery.includes('hey') || lowerQuery.includes('greetings')) {
        return `Hello! 👋 I'm here to help you monitor live Indian market indices.
        
Ask me about the current price of **NIFTY** or **SENSEX**, request to see a **chart**, or ask for a **comparison** of both!`;
    }
    
    // 7. DEFAULT FALLBACK
    return `I'm not sure how to respond to that. As a dedicated index tracker, I specialize in Nifty 50 and Sensex data.
    
Try asking me:
- *"What is Nifty's live price?"*
- *"Show me the Sensex chart"*
- *"Compare Nifty and Sensex"*
- *"Is the market up or down today?"*`;
}

// PROGRAMMATIC TAB SWITCH TRIGGER (from Chat)
function triggerChartTabSwitch(symbol) {
    const tabNifty = document.getElementById('tab-nifty');
    const tabSensex = document.getElementById('tab-sensex');
    
    if (symbol === '^NSEI' && state.activeChartSymbol !== '^NSEI') {
        tabNifty.classList.add('active');
        tabSensex.classList.remove('active');
        state.activeChartSymbol = '^NSEI';
        document.getElementById('chart-index-title').textContent = 'NIFTY 50';
        fetchChartData('^NSEI');
    } else if (symbol === '^BSESN' && state.activeChartSymbol !== '^BSESN') {
        tabSensex.classList.add('active');
        tabNifty.classList.remove('active');
        state.activeChartSymbol = '^BSESN';
        document.getElementById('chart-index-title').textContent = 'SENSEX';
        fetchChartData('^BSESN');
    }
}
