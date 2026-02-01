# Real-time Chat Moderator with AI Assistant

A real-time chat application with AI-powered content moderation and a conversational AI assistant. Messages are filtered in real-time using the Hugging Face Friendly Text Moderation API, and a fun, chatty AI assistant (powered by OpenAI ChatGPT) responds to users, creating engaging conversations while maintaining a safe environment.

## 🚀 Quick Deploy

See [DEPLOYMENT.md](./DEPLOYMENT.md) for deployment instructions to Railway, Vercel, or Render.

## 🔒 Security

See [SECURITY_SUMMARY.md](./SECURITY_SUMMARY.md) for security audit and [PRE_DEPLOYMENT_CHECKLIST.md](./PRE_DEPLOYMENT_CHECKLIST.md) before deploying.

## Features

- **Real-time Messaging**: WebSocket-based chat for instant message delivery
- **AI Content Moderation**: Automatic filtering using Hugging Face Friendly Text Moderation API
- **AI Chat Assistant**: Fun, chatty AI assistant (OpenAI ChatGPT) that responds to all messages
- **Personalized Greetings**: AI greets users by name when they join
- **Mandatory Usernames**: Users must set a name before chatting
- **Toxicity Detection**: Detects multiple categories including:
  - Sexual content
  - Hate speech
  - Violence
  - Harassment
  - Self-harm
  - Content involving minors
  - Graphic violence
- **Rate Limiting**: Prevents spam and abuse
- **User Feedback System**: Report false positives/negatives to improve moderation
- **Graceful Error Handling**: Continues operating even if APIs are unavailable
- **Modern UI**: Clean, responsive React interface with distinct AI message styling

## Architecture

```
┌─────────────┐         WebSocket          ┌──────────────┐
│   Browser   │◄──────────────────────────►│   Express    │
│  (React)    │                             │   Server     │
└─────────────┘                             │  + Socket.io │
                                            └──────┬───────┘
                                                   │ HTTP
                                                   ├──────────────┐
                                                   ▼              ▼
                                            ┌──────────────┐  ┌──────────────┐
                                            │   Hugging    │  │   OpenAI     │
                                            │  Face API    │  │   ChatGPT    │
                                            │ (Moderation) │  │  (AI Chat)   │
                                            └──────────────┘  └──────────────┘
```

## Prerequisites

- Node.js (v18 or higher)
- npm or yarn
- Hugging Face account with API token ([Get one here](https://huggingface.co/settings/tokens))
- OpenAI account with API key ([Get one here](https://platform.openai.com/api-keys))

## Setup Instructions

### 1. Clone and Install Dependencies

```bash
# Install backend dependencies
cd backend
npm install

# Install frontend dependencies
cd ../frontend
npm install
```

### 2. Configure Environment Variables

#### Backend Configuration

Create a `.env` file in the `backend/` directory:

```bash
cd backend
cp .env.example .env
```

Edit `.env` and add your API tokens:

```env
# Hugging Face API (for moderation)
HF_API_TOKEN=your_huggingface_token_here
HF_API_URL=duchaba/Friendly_Text_Moderation

# OpenAI API (for AI assistant)
OPENAI_API_KEY=your_openai_api_key_here

# Server Configuration
PORT=3001
NODE_ENV=development

# Moderation Configuration
SAFER_VALUE=0.05
MODERATION_THRESHOLD=0.5

# AI Assistant Configuration
AI_ENABLED=true
AI_MODEL=gpt-3.5-turbo
AI_MAX_RESPONSE_LENGTH=200
AI_CONVERSATION_HISTORY_SIZE=5

# Rate Limiting
RATE_LIMIT_PER_MINUTE=30
```

**To get your API tokens:**

**Hugging Face API Token:**
1. Sign up at [huggingface.co](https://huggingface.co/join)
2. Go to [Settings > Tokens](https://huggingface.co/settings/tokens)
3. Create a new token with "Read" permissions
4. Copy the token and paste it in your `.env` file

**OpenAI API Key:**
1. Sign up at [platform.openai.com](https://platform.openai.com/)
2. Go to [API Keys](https://platform.openai.com/api-keys)
3. Create a new secret key
4. Copy the key and paste it in your `.env` file

#### Frontend Configuration (Optional)

The frontend will connect to `http://localhost:3001` by default. To change this, create a `.env` file in the `frontend/` directory:

```env
VITE_SOCKET_URL=http://localhost:3001
```

### 3. Start the Application

#### Terminal 1 - Backend Server

```bash
cd backend
npm start
```

For development with auto-reload:

```bash
npm run dev
```

You should see:
```
🚀 Server running on port 3001
📡 Socket.io server ready
🌍 Environment: development
🔒 Moderation threshold: 0.5
```

#### Terminal 2 - Frontend Development Server

```bash
cd frontend
npm run dev
```

The frontend will be available at `http://localhost:5173`

## Usage

1. **Open the Application**: Navigate to `http://localhost:5173` in your browser

2. **Enter Your Name** (required): Enter your username and click "Join Chat"
   - The AI assistant will greet you personally when you join!

3. **Start Chatting**: Type a message and press Enter (or click Send)
   - The AI assistant will respond to your messages conversationally
   - Messages are moderated in real-time

4. **View Results**:
   - **Approved messages** appear in green with a checkmark
   - **AI responses** appear in purple with a robot badge 🤖
   - **Blocked messages** appear in red with a blocked icon and reason
   - The AI will also respond to blocked messages, explaining why they were blocked in a friendly way

### Testing Moderation

Try sending messages like:
- **Safe**: "Hello, how are you today?"
- **Toxic**: Messages containing profanity, hate speech, or violent language will be blocked

## API Documentation

### WebSocket Events

#### Client → Server

**`register_username`** (Required first - register username)
```javascript
socket.emit('register_username', {
  username: 'YourName'
});
```

**`message`** (Send message - requires username to be set first)
```javascript
socket.emit('message', {
  text: 'Your message here',
  author: 'Username' // Will use registered username if not provided
});
```

#### Server → Client

**`message`** (Approved message or AI response)
```javascript
{
  id: 'socket-id-timestamp',
  text: 'Message content',
  author: 'Username' or 'AI Moderator',
  timestamp: '2024-01-28T12:00:00.000Z',
  moderationStatus: 'OK',
  isAI: true, // Present if this is an AI message
  details: { /* moderation details */ }
}
```

**`messageBlocked`** (Blocked message)
```javascript
{
  id: 'socket-id-timestamp',
  text: 'Blocked message content',
  reason: 'Blocked due to hate',
  details: {
    scores: { hate: 0.85, violence: 0.2 },
    maxScore: 0.85,
    maxCategory: 'hate',
    threshold: 0.5
  },
  timestamp: '2024-01-28T12:00:00.000Z'
}
```

**`error`** (Error occurred)
```javascript
{
  message: 'Error description',
  error: 'Detailed error message'
}
```

### REST Endpoints

**GET `/health`**
- Health check endpoint
- Returns: `{ status: 'ok', timestamp: '...', service: 'chat-moderation-backend' }`

**GET `/api/info`**
- API information endpoint
- Returns: `{ name: '...', version: '...', moderationThreshold: 0.5, rateLimit: 30 }`

**GET `/api/ai/status`**
- AI assistant status endpoint
- Returns: `{ enabled: true, provider: 'OpenAI', model: 'gpt-3.5-turbo', ... }`

**POST `/api/feedback`**
- Submit moderation feedback (false positive/negative)
- Body: `{ messageId, messageText, wasBlocked, shouldHaveBeenBlocked, moderationResult, reason }`

**GET `/api/feedback/logs`**
- Get moderation feedback logs
- Query params: `?date=YYYY-MM-DD&format=json|csv`

**GET `/api/feedback/analytics`**
- Get analytics on moderation feedback
- Query params: `?date=YYYY-MM-DD`

## Configuration

### Moderation Threshold

**Option 1: Direct `SAFER_VALUE` (Recommended)**
- Set `SAFER_VALUE` directly (0.005 to 0.1)
- Lower value = stricter (blocks more messages)
- Higher value = more permissive (blocks fewer messages)
- Examples:
  - `SAFER_VALUE=0.005` - Very strict
  - `SAFER_VALUE=0.05` - Moderate (default)
  - `SAFER_VALUE=0.1` - Very permissive

**Option 2: `MODERATION_THRESHOLD`**
- Maps to `SAFER_VALUE` automatically (0.0-1.0)
- Only used if `SAFER_VALUE` is not set
- Higher threshold = stricter moderation

### AI Assistant Configuration

- `AI_ENABLED` - Set to `false` to disable AI responses (default: `true`)
- `AI_MODEL` - OpenAI model to use (default: `gpt-3.5-turbo`)
  - Options: `gpt-3.5-turbo`, `gpt-4`, `gpt-4-turbo-preview`, etc.
- `AI_MAX_RESPONSE_LENGTH` - Maximum AI response length in characters (default: 200)
- `AI_CONVERSATION_HISTORY_SIZE` - Number of previous messages for context (default: 5)

### Rate Limiting

The `RATE_LIMIT_PER_MINUTE` environment variable controls how many messages each user can send per minute (default: 30).

## Project Structure

```
api-homework-week-2/
├── backend/
│   ├── src/
│   │   ├── server.js                    # Express server setup
│   │   ├── socketHandler.js             # WebSocket event handlers
│   │   ├── moderationService.js         # Hugging Face API integration
│   │   ├── aiService.js                 # OpenAI ChatGPT integration
│   │   ├── config.js                    # Configuration management
│   │   ├── loggingService.js            # Feedback logging
│   │   ├── huggingFaceFeedbackService.js # Feedback formatting
│   │   └── feedbackAnalytics.js         # Analytics for feedback
│   ├── logs/                            # Moderation feedback logs
│   ├── package.json
│   └── .env.example
├── frontend/
│   ├── src/
│   │   ├── App.jsx                      # Main React component
│   │   ├── Chat.jsx                     # Chat interface container
│   │   ├── MessageList.jsx              # Message display component
│   │   ├── MessageInput.jsx             # Input component
│   │   └── *.css                        # Component styles
│   ├── package.json
│   ├── vite.config.js
│   └── index.html
├── README.md
├── DEPLOYMENT.md                        # Deployment guide
├── SECURITY_SUMMARY.md                  # Security audit
└── .gitignore
```

## Error Handling

The application includes comprehensive error handling:

1. **Moderation API Failures**: If the Hugging Face API is unavailable, messages are allowed with a warning (graceful degradation)
2. **AI API Failures**: If OpenAI API fails, chat continues normally without AI responses (silent degradation)
3. **Rate Limiting**: Users exceeding the rate limit receive a `messageBlocked` event
4. **Connection Errors**: Frontend displays connection status and error messages
5. **Invalid Input**: Empty or malformed messages are rejected
6. **Username Validation**: Username is required and validated before allowing messages

## Troubleshooting

### Backend won't start
- Check that port 3001 is not already in use
- Verify your `.env` file exists and contains `HF_API_TOKEN`
- Ensure all dependencies are installed: `npm install`

### Frontend can't connect to backend
- Verify backend is running on port 3001
- Check browser console for CORS errors
- Ensure `VITE_SOCKET_URL` matches your backend URL

### Messages not being moderated
- Verify your Hugging Face API token is valid
- Check backend console for API errors
- Ensure the API endpoint URL is correct

### AI assistant not responding
- Verify your OpenAI API key is set in `.env`
- Check that `AI_ENABLED=true` in your `.env`
- Check backend console for OpenAI API errors
- Verify you have credits/quota on your OpenAI account

### Username not working
- Username is now mandatory - you must enter a name and click "Join Chat"
- Username must be between 1-20 characters
- Check browser console for any error messages

### Rate limit issues
- Adjust `RATE_LIMIT_PER_MINUTE` in `.env` if needed
- Check backend logs for rate limit messages

## Development

### Backend Development

```bash
cd backend
npm run dev  # Auto-reload on file changes
```

### Frontend Development

```bash
cd frontend
npm run dev  # Vite dev server with hot reload
```

### Building for Production

**Backend:**
```bash
cd backend
npm start
```

**Frontend:**
```bash
cd frontend
npm run build
npm run preview  # Preview production build
```

## Technologies Used

- **Backend**:
  - Node.js + Express
  - Socket.io (WebSocket)
  - Axios (HTTP client)
  - dotenv (Environment variables)

- **Frontend**:
  - React 18
  - Vite (Build tool)
  - Socket.io-client
  - CSS3 (Modern styling)

- **APIs**:
  - Hugging Face Inference API (Content Moderation)
  - OpenAI ChatGPT API (AI Assistant)
  - Friendly Text Moderation Model (via Hugging Face)

## License

MIT

## Acknowledgments

- [Hugging Face](https://huggingface.co/) for the moderation API
- [duchaba/Friendly_Text_Moderation](https://huggingface.co/spaces/duchaba/Friendly_Text_Moderation) model
- [OpenAI](https://openai.com/) for ChatGPT API
- Built for AI Solution Architect course

## Features in Detail

### AI Assistant

The AI assistant is powered by OpenAI's ChatGPT and provides:
- **Conversational responses** to all user messages
- **Personalized greetings** when users join
- **Natural explanations** when messages are blocked
- **Context-aware conversations** using recent message history
- **Fun, chatty personality** for engaging interactions

### Moderation Feedback System

Users can report moderation errors:
- **False Positives**: Report messages that were incorrectly blocked
- **False Negatives**: Report messages that should have been blocked
- **Analytics**: View feedback analytics via `/api/feedback/analytics`
- **Export**: Download feedback logs as CSV for analysis

## Future Enhancements

- User authentication
- Multiple chat rooms/channels
- Message persistence/database
- Admin dashboard
- Customizable moderation thresholds per user/room
- Message history
- User profiles and avatars
- AI personality customization
- Voice messages support