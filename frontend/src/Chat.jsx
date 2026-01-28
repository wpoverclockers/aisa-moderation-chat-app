import { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import MessageList from './MessageList';
import MessageInput from './MessageInput';
import './Chat.css';

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || 'http://localhost:3001';

function Chat() {
  const [messages, setMessages] = useState([]);
  const [blockedMessages, setBlockedMessages] = useState([]);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState(null);
  const [username, setUsername] = useState('');
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

    if (socketRef.current) {
      socketRef.current.emit('message', {
        text,
        author: username || 'Anonymous',
      });
    }
  };

  const handleUsernameChange = (e) => {
    setUsername(e.target.value);
  };

  return (
    <div className="chat-container">
      <div className="chat-status">
        <div className={`status-indicator ${isConnected ? 'connected' : 'disconnected'}`}>
          <span className="status-dot"></span>
          {isConnected ? 'Connected' : 'Disconnected'}
        </div>
        {username && (
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

      <div className="username-input-container">
        <input
          type="text"
          placeholder="Enter your name (optional)"
          value={username}
          onChange={handleUsernameChange}
          className="username-input"
          maxLength={20}
        />
      </div>

      <MessageList 
        messages={messages} 
        blockedMessages={blockedMessages}
        messagesEndRef={messagesEndRef}
        onReportFeedback={(messageId) => {
          // Optional: Handle feedback reported (e.g., show notification)
          console.log('Feedback reported for message:', messageId);
        }}
      />

      <MessageInput 
        onSendMessage={handleSendMessage}
        disabled={!isConnected}
      />
    </div>
  );
}

export default Chat;
