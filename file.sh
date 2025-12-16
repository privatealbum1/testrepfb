# 1. Create project directory
mkdir facebook-gemini-webhook
cd facebook-gemini-webhook

# 2. Initialize Node.js project
npm init -y

# 3. Install dependencies
npm install express axios dotenv @google/generative-ai

# Install dev dependencies (optional)
npm install --save-dev nodemon

# 4. Create .env file
cat > .env << EOF
GEMINI_API_KEY=your_gemini_api_key_here
FACEBOOK_VERIFY_TOKEN=your_verify_token_here
FACEBOOK_PAGE_ACCESS_TOKEN=your_page_access_token_here
FACEBOOK_APP_SECRET=your_app_secret_here
PORT=5000
NODE_ENV=development
EOF

# 5. Run development server
npm run dev

# OR production mode
npm start
