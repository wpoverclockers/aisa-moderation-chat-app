import { useState } from 'react';
import Chat from './Chat';
import './App.css';

function App() {
  return (
    <div className="app">
      <header className="app-header">
        <h1>💬 Real-time Chat Moderator</h1>
        <p>Powered by Hugging Face Friendly Text Moderation API</p>
      </header>
      <Chat />
    </div>
  );
}

export default App;
