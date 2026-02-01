import { useEffect, useRef, useState } from 'react';
import './MessageList.css';

// Use relative URL for API calls (same domain as frontend)
const getAPIURL = () => {
  const envUrl = import.meta.env.VITE_SOCKET_URL;
  if (envUrl) {
    return envUrl;
  }
  // If no explicit URL, use same origin
  if (typeof window !== 'undefined') {
    return window.location.origin;
  }
  return 'http://localhost:3001';
};

const API_URL = getAPIURL();

function MessageList({ messages, blockedMessages, messagesEndRef, onReportFeedback }) {
  const [reportingMessageId, setReportingMessageId] = useState(null);
  // Combine and sort all messages by timestamp (oldest first, newest last)
  const allMessages = [
    ...messages.map(msg => ({ ...msg, type: 'approved' })),
    ...blockedMessages.map((msg, index) => ({ 
      ...msg, 
      type: 'blocked', 
      id: msg.id || `blocked-${index}` // Use provided ID or generate one
    }))
  ].sort((a, b) => {
    const timeA = new Date(a.timestamp).getTime();
    const timeB = new Date(b.timestamp).getTime();
    return timeA - timeB; // Oldest first
  });

  // Reference to the messages container for scrolling
  const containerRef = useRef(null);

  useEffect(() => {
    // Auto-scroll to bottom when new messages arrive
    // Use setTimeout to ensure DOM has updated
    setTimeout(() => {
      if (messagesEndRef.current) {
        messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
      } else if (containerRef.current) {
        // Fallback: scroll container to bottom
        containerRef.current.scrollTop = containerRef.current.scrollHeight;
      }
    }, 100);
  }, [messages, blockedMessages, messagesEndRef]);

  // Initial scroll to bottom on mount
  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, []);

  const formatTime = (timestamp) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const handleReportFeedback = async (message, isFalsePositive) => {
    if (reportingMessageId === message.id) return; // Already reporting
    
    setReportingMessageId(message.id);
    
    try {
      const response = await fetch(`${API_URL}/api/feedback`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messageId: message.id,
          messageText: message.text,
          wasBlocked: message.type === 'blocked',
          shouldHaveBeenBlocked: !isFalsePositive, // If false positive, it shouldn't have been blocked
          moderationResult: message.details || {},
          reason: message.reason || 'User reported incorrect moderation',
        }),
      });

      const data = await response.json();
      
      if (data.success) {
        alert('Thank you for your feedback! The incorrect moderation has been logged.');
        if (onReportFeedback) {
          onReportFeedback(message.id);
        }
      } else {
        alert('Failed to submit feedback. Please try again.');
      }
    } catch (error) {
      console.error('Error reporting feedback:', error);
      alert('Error submitting feedback. Please try again.');
    } finally {
      setReportingMessageId(null);
    }
  };

  return (
    <div className="message-list">
      <div className="messages-container" ref={containerRef}>
        {allMessages.length === 0 && (
          <div className="empty-state">
            <p>No messages yet. Start chatting!</p>
            <p className="empty-hint">Messages are moderated in real-time using AI.</p>
          </div>
        )}

        {allMessages.map((message) => {
          if (message.type === 'blocked') {
            return (
              <div key={message.id} className="message message-blocked">
                <div className="message-header">
                  <span className="message-author">System</span>
                  <span className="message-time">{formatTime(message.timestamp)}</span>
                </div>
                <div className="message-content-blocked">
                  <span className="blocked-icon">🚫</span>
                  <span className="blocked-text">Message blocked</span>
                </div>
                <div className="blocked-reason">
                  Reason: {message.reason}
                </div>
                {message.details && message.details.maxCategory && (
                  <div className="blocked-details">
                    Detected: {message.details.maxCategory} 
                    (score: {(message.details.maxScore * 100).toFixed(1)}%)
                  </div>
                )}
                <div className="message-actions">
                  <button
                    className="report-button"
                    onClick={() => handleReportFeedback(message, true)}
                    disabled={reportingMessageId === message.id}
                    title="Report as incorrectly blocked (false positive)"
                  >
                    {reportingMessageId === message.id ? 'Reporting...' : '⚠️ Report False Positive'}
                  </button>
                </div>
              </div>
            );
          } else {
            // Check if this is an AI message
            const isAIMessage = message.isAI || message.author === 'AI Moderator';
            
            return (
              <div key={message.id} className={`message message-approved ${isAIMessage ? 'message-ai' : ''}`}>
                <div className="message-header">
                  <span className="message-author">
                    {isAIMessage && <span className="ai-badge">🤖</span>}
                    {message.author}
                  </span>
                  <span className="message-time">{formatTime(message.timestamp)}</span>
                </div>
                <div className="message-content">{message.text}</div>
                {message.moderationStatus && message.moderationStatus !== 'OK' && (
                  <div className="message-status">
                    ✓ Moderated: {message.moderationStatus}
                  </div>
                )}
                {!isAIMessage && (
                  <div className="message-actions">
                    <button
                      className="report-button"
                      onClick={() => handleReportFeedback(message, false)}
                      disabled={reportingMessageId === message.id}
                      title="Report as incorrectly allowed (false negative)"
                    >
                      {reportingMessageId === message.id ? 'Reporting...' : '⚠️ Report False Negative'}
                    </button>
                  </div>
                )}
              </div>
            );
          }
        })}

        <div ref={messagesEndRef} />
      </div>
    </div>
  );
}

export default MessageList;
