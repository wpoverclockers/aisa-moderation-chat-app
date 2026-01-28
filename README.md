# Real-time Chat Moderator

A real-time chat application with AI-powered content moderation using the Hugging Face Friendly Text Moderation API. Messages are filtered in real-time before being displayed to users, blocking toxic content including hate speech, violence, harassment, and other harmful categories.

## 🚀 Quick Deploy

See [DEPLOYMENT.md](./DEPLOYMENT.md) for deployment instructions to Railway, Vercel, or Render.

## 🔒 Security

See [SECURITY_SUMMARY.md](./SECURITY_SUMMARY.md) for security audit and [PRE_DEPLOYMENT_CHECKLIST.md](./PRE_DEPLOYMENT_CHECKLIST.md) before deploying.

## Features

- **Real-time Messaging**: WebSocket-based chat for instant message delivery
- **AI Content Moderation**: Automatic filtering using Hugging Face Friendly Text Moderation API
- **Toxicity Detection**: Detects multiple categories including:
  - Sexual content
  - Hate speech
  - Violence
  - Harassment
  - Self-harm
  - Content involving minors
  - Graphic violence
- **Rate Limiting**: Prevents spam and abuse
- **Graceful Error Handling**: Continues operating even if moderation API is unavailable
- **Modern UI**: Clean, responsive React interface

## Architecture

```
┌─────────────┐         WebSocket          ┌──────────────┐
│   Browser   │◄──────────────────────────►│   Express    │
│  (React)    │                             │   Server     │
└─────────────┘                             │  + Socket.io │
                                            └──────┬───────┘
                                                   │ HTTP
                                                   ▼
                                            ┌──────────────┐
                                            │   Hugging    │
                                            │  Face API    │
                                            │  (Moderation)│
                                            └──────────────┘
```

## Prerequisites

- Node.js (v18 or higher)
- npm or yarn
- Hugging Face account with API token ([Get one here](https://huggingface.co/settings/tokens))

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

Edit `.env` and add your Hugging Face API token:

```env
HF_API_TOKEN=your_huggingface_token_here
HF_API_URL=https://api-inference.huggingface.co/models/duchaba/Friendly_Text_Moderation
PORT=3001
NODE_ENV=development
MODERATION_THRESHOLD=0.5
RATE_LIMIT_PER_MINUTE=30
```

**To get your Hugging Face API token:**
1. Sign up at [huggingface.co](https://huggingface.co/join)
2. Go to [Settings > Tokens](https://huggingface.co/settings/tokens)
3. Create a new token with "Read" permissions
4. Copy the token and paste it in your `.env` file

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

2. **Set Your Name** (optional): Enter a username in the input field at the top

3. **Start Chatting**: Type a message and press Enter (or click Send)

4. **View Results**:
   - **Approved messages** appear in green with a checkmark
   - **Blocked messages** appear in red with a blocked icon and reason

### Testing Moderation

Try sending messages like:
- **Safe**: "Hello, how are you today?"
- **Toxic**: Messages containing profanity, hate speech, or violent language will be blocked

## API Documentation

### WebSocket Events

#### Client → Server

**`message`**
```javascript
socket.emit('message', {
  text: 'Your message here',
  author: 'Username' // optional
});
```

#### Server → Client

**`message`** (Approved message)
```javascript
{
  id: 'socket-id-timestamp',
  text: 'Message content',
  author: 'Username',
  timestamp: '2024-01-28T12:00:00.000Z',
  moderationStatus: 'OK'
}
```

**`messageBlocked`** (Blocked message)
```javascript
{
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

## Configuration

### Moderation Threshold

The `MODERATION_THRESHOLD` environment variable controls how strict the moderation is:
- `0.0` - Very permissive (blocks only extreme content)
- `0.5` - Balanced (default)
- `1.0` - Very strict (blocks most potentially toxic content)

### Rate Limiting

The `RATE_LIMIT_PER_MINUTE` environment variable controls how many messages each user can send per minute (default: 30).

## Project Structure

```
api-homework-week-2/
├── backend/
│   ├── src/
│   │   ├── server.js              # Express server setup
│   │   ├── socketHandler.js       # WebSocket event handlers
│   │   ├── moderationService.js   # Hugging Face API integration
│   │   └── config.js              # Configuration management
│   ├── package.json
│   └── .env.example
├── frontend/
│   ├── src/
│   │   ├── App.jsx                # Main React component
│   │   ├── Chat.jsx               # Chat interface container
│   │   ├── MessageList.jsx        # Message display component
│   │   ├── MessageInput.jsx       # Input component
│   │   └── *.css                  # Component styles
│   ├── package.json
│   ├── vite.config.js
│   └── index.html
├── README.md
└── .gitignore
```

## Error Handling

The application includes comprehensive error handling:

1. **API Failures**: If the Hugging Face API is unavailable, messages are allowed with a warning (graceful degradation)
2. **Rate Limiting**: Users exceeding the rate limit receive a `messageBlocked` event
3. **Connection Errors**: Frontend displays connection status and error messages
4. **Invalid Input**: Empty or malformed messages are rejected

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

- **API**:
  - Hugging Face Inference API
  - Friendly Text Moderation Model

## License

MIT

## Acknowledgments

- [Hugging Face](https://huggingface.co/) for the moderation API
- [duchaba/Friendly_Text_Moderation](https://huggingface.co/spaces/duchaba/Friendly_Text_Moderation) model
- Built for AI Solution Architect course

## Future Enhancements

- User authentication
- Multiple chat rooms/channels
- Message persistence/database
- Admin dashboard
- Customizable moderation thresholds per user/room
- Message history
- User profiles and avatars
