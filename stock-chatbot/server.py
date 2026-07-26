import http.server
import socketserver
import urllib.request
import urllib.parse
import json
import os
import sys

PORT = 8000
DIRECTORY = os.path.join(os.path.dirname(os.path.abspath(__file__)), "public")

class CustomHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        # Initialize with the directory to serve files from
        super().__init__(*args, directory=DIRECTORY, **kwargs)

    def do_GET(self):
        if self.path == '/api/market-data':
            self.handle_market_data()
        elif self.path.startswith('/api/chart-data'):
            self.handle_chart_data()
        else:
            # Serve static files normally
            super().do_GET()

    def handle_market_data(self):
        try:
            nifty_data = self.fetch_yahoo_data('^NSEI')
            sensex_data = self.fetch_yahoo_data('^BSESN')
            
            response = {
                'nifty': nifty_data,
                'sensex': sensex_data
            }
            
            self.send_json_response(response)
        except Exception as e:
            self.send_error_response(str(e))

    def handle_chart_data(self):
        # Parse query params
        parsed_url = urllib.parse.urlparse(self.path)
        params = urllib.parse.parse_qs(parsed_url.query)
        symbol = params.get('symbol', ['^NSEI'])[0]
        
        # Default to Nifty if invalid symbol requested
        if symbol not in ['^NSEI', '^BSESN']:
            symbol = '^NSEI'
            
        try:
            chart_raw = self.fetch_raw_chart(symbol)
            # Parse chart data
            result = chart_raw['chart']['result'][0]
            timestamps = result.get('timestamp', [])
            quotes = result.get('indicators', {}).get('quote', [{}])[0]
            closes = quotes.get('close', [])
            meta = result.get('meta', {})
            
            # Clean data (remove None/null values)
            cleaned_timestamps = []
            cleaned_closes = []
            for t, c in zip(timestamps, closes):
                if t is not None and c is not None:
                    cleaned_timestamps.append(t)
                    cleaned_closes.append(round(c, 2))
                    
            response = {
                'symbol': symbol,
                'timestamps': cleaned_timestamps,
                'closes': cleaned_closes,
                'currency': meta.get('currency', 'INR'),
                'regularMarketPrice': meta.get('regularMarketPrice'),
                'chartPreviousClose': meta.get('chartPreviousClose')
            }
            self.send_json_response(response)
        except Exception as e:
            self.send_error_response(str(e))

    def fetch_yahoo_data(self, symbol):
        # Fetch 1d chart to get regularMarketPrice, chartPreviousClose, daily high/low
        data = self.fetch_raw_chart(symbol)
        result = data['chart']['result'][0]
        meta = result['meta']
        
        price = meta.get('regularMarketPrice')
        prev_close = meta.get('chartPreviousClose')
        
        # In case regularMarketPrice or chartPreviousClose are missing, try indicators
        quotes = result.get('indicators', {}).get('quote', [{}])[0]
        closes = [c for c in quotes.get('close', []) if c is not None]
        highs = [h for h in quotes.get('high', []) if h is not None]
        lows = [l for l in quotes.get('low', []) if l is not None]
        
        if price is None and closes:
            price = closes[-1]
        if prev_close is None:
            prev_close = price # fallback
            
        high = max(highs) if highs else meta.get('regularMarketDayHigh', price)
        low = min(lows) if lows else meta.get('regularMarketDayLow', price)
        
        # Fallbacks for high/low
        if high is None: high = price
        if low is None: low = price
        
        change = round(price - prev_close, 2) if price and prev_close else 0.0
        change_percent = round((change / prev_close) * 100, 2) if prev_close else 0.0
        
        return {
            'symbol': symbol,
            'name': 'NIFTY 50' if symbol == '^NSEI' else 'SENSEX',
            'price': round(price, 2) if price else 0.0,
            'prevClose': round(prev_close, 2) if prev_close else 0.0,
            'change': change,
            'changePercent': change_percent,
            'high': round(high, 2),
            'low': round(low, 2),
            'volume': meta.get('regularMarketVolume', 0)
        }

    def fetch_raw_chart(self, symbol):
        # Fetch 1-day chart with 5-minute intervals
        url = f"https://query1.finance.yahoo.com/v8/finance/chart/{symbol}?interval=5m&range=1d"
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'})
        with urllib.request.urlopen(req, timeout=10) as response:
            return json.loads(response.read().decode('utf-8'))

    def send_json_response(self, data):
        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        self.wfile.write(json.dumps(data).encode('utf-8'))

    def send_error_response(self, message):
        self.send_response(500)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        self.wfile.write(json.dumps({'error': message}).encode('utf-8'))

if __name__ == '__main__':
    # Ensure the public directory exists
    if not os.path.exists(DIRECTORY):
        os.makedirs(DIRECTORY)
        
    print(f"Starting server on http://localhost:{PORT}")
    print(f"Serving static files from: {DIRECTORY}")
    
    # Allow address reuse
    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.TCPServer(("", PORT), CustomHandler) as httpd:
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nShutting down server.")
            sys.exit(0)
