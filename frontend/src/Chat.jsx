import { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import MessageList from './MessageList';
import MessageInput from './MessageInput';
import './Chat.css';

// Use relative URL if VITE_SOCKET_URL is not set (for same-domain deployment)
// Or use absolute URL if explicitly set
const getSocketURL = () => {
  const envUrl = import.meta.env.VITE_SOCKET_URL;
  if (envUrl) {
    return envUrl;
  }
  // If no explicit URL, use same origin (works when frontend/backend on same domain)
  if (typeof window !== 'undefined') {
    return window.location.origin;
  }
  return 'http://localhost:3001'; // Fallback for SSR
};

const SOCKET_URL = getSocketURL();

function Chat() {
  const [messages, setMessages] = useState([]);
  const [blockedMessages, setBlockedMessages] = useState([]);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState(null);
  const [username, setUsername] = useState('');
  const [usernameSet, setUsernameSet] = useState(false);
  const socketRef = useRef(null);
  const messagesEndRef = useRef(null);

  useEffect(() => {
    // Initialize socket connection
    socketRef.current = io(SOCKET_URL, {
      transports: ['websocket', 'polling'],
    });

    const socket = socketRef.current;

    // Connection events
    socket.on('connect', () => {
      console.log('Connected to server');
      setIsConnected(true);
      setError(null);
    });

    socket.on('disconnect', () => {
      console.log('Disconnected from server');
      setIsConnected(false);
    });

    socket.on('connect_error', (err) => {
      console.error('Connection error:', err);
      setError('Failed to connect to server. Make sure the backend is running.');
      setIsConnected(false);
    });

    // Message events
    socket.on('message', (messageData) => {
      setMessages((prev) => [...prev, messageData]);
    });

    socket.on('messageBlocked', (blockedData) => {
      setBlockedMessages((prev) => [...prev, blockedData]);
    });

    socket.on('error', (errorData) => {
      setError(errorData.message || 'An error occurred');
      console.error('Socket error:', errorData);
    });

    // Cleanup on unmount
    return () => {
      socket.disconnect();
    };
  }, []);

  const handleSendMessage = (text) => {
    if (!isConnected) {
      setError('Not connected to server');
      return;
    }

    if (!usernameSet || !username.trim()) {
      setError('Please enter your name first');
      return;
    }

    if (socketRef.current) {
      socketRef.current.emit('message', {
        text,
        author: username,
      });
    }
  };

  const handleUsernameChange = (e) => {
    setUsername(e.target.value);
    setError(null);
  };

  const handleUsernameSubmit = (e) => {
    e.preventDefault();
    const trimmedUsername = username.trim();
    
    if (!trimmedUsername) {
      setError('Please enter your name');
      return;
    }

    if (trimmedUsername.length > 20) {
      setError('Name must be 20 characters or less');
      return;
    }

    if (socketRef.current && isConnected) {
      socketRef.current.emit('register_username', {
        username: trimmedUsername,
      });
      setUsernameSet(true);
      setError(null);
    } else {
      setError('Not connected to server');
    }
  };

  return (
    <div className="chat-container">
      <div className="chat-status">
        <div className={`status-indicator ${isConnected ? 'connected' : 'disconnected'}`}>
          <span className="status-dot"></span>
          {isConnected ? 'Connected' : 'Disconnected'}
        </div>
        {usernameSet && username && (
          <div className="username-display">
            Chatting as: <strong>{username}</strong>
          </div>
        )}
      </div>

      {error && (
        <div className="error-banner">
          ⚠️ {error}
        </div>
      )}

      {!usernameSet && (
        <div className="username-input-container">
          <form onSubmit={handleUsernameSubmit} className="username-form">
            <input
              type="text"
              placeholder="Enter your name (required)"
              value={username}
              onChange={handleUsernameChange}
              className="username-input"
              maxLength={20}
              required
              autoFocus
            />
            <button type="submit" className="username-submit-button" disabled={!isConnected}>
              Join Chat
            </button>
          </form>
          <p className="username-hint">You must enter your name to start chatting</p>
        </div>
      )}

      <MessageList 
        messages={messages} 
        blockedMessages={blockedMessages}
        messagesEndRef={messagesEndRef}
        onReportFeedback={(messageId) => {
          // Optional: Handle feedback reported (e.g., show notification)
          console.log('Feedback reported for message:', messageId);
        }}
      />

      {usernameSet && (
        <MessageInput 
          onSendMessage={handleSendMessage}
          disabled={!isConnected}
        />
      )}
    </div>
  );
}

export default Chat;
