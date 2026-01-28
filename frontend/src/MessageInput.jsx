import { useState, useRef, useEffect } from 'react';
import './MessageInput.css';

function MessageInput({ onSendMessage, disabled }) {
  const [inputValue, setInputValue] = useState('');
  const inputRef = useRef(null);

  useEffect(() => {
    // Focus input when component mounts
    inputRef.current?.focus();
  }, []);

  const handleSubmit = (e) => {
    e.preventDefault();
    
    if (inputValue.trim() && !disabled) {
      onSendMessage(inputValue.trim());
      setInputValue('');
      inputRef.current?.focus();
    }
  };

  const handleKeyPress = (e) => {
    // Allow Enter to submit, but Shift+Enter for new line
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  return (
    <div className="message-input-container">
      <form onSubmit={handleSubmit} className="message-input-form">
        <textarea
          ref={inputRef}
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyPress={handleKeyPress}
          placeholder={disabled ? 'Connecting...' : 'Type your message (Enter to send, Shift+Enter for new line)'}
          disabled={disabled}
          className="message-input"
          rows={1}
          maxLength={1000}
        />
        <button
          type="submit"
          disabled={!inputValue.trim() || disabled}
          className="send-button"
        >
          Send
        </button>
      </form>
      <div className="input-hint">
        Messages are moderated in real-time. Toxic content will be blocked.
      </div>
    </div>
  );
}

export default MessageInput;
