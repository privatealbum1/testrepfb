# Terminal 1: Start webhook server
npm run dev

# Terminal 2: Expose with ngrok
npm install -g ngrok
ngrok http 5000

# Copy HTTPS URL from ngrok output
# Example: https://abc123.ngrok.io

# Terminal 3: Test webhook (optional)
curl -X GET "http://localhost:5000/health"
