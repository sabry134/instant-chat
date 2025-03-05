import React, { useState, useEffect, useRef } from 'react';
import LinearProgress from '@mui/material/LinearProgress';
import Snackbar from '@mui/material/Snackbar';

const styles = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    height: '100vh',
    background: 'linear-gradient(135deg, #2c3e50, #4ca1af)',
    padding: '20px',
    boxSizing: 'border-box',
    color: '#fff',
    fontFamily: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif",
    position: 'relative'
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '10px',
    paddingBottom: '10px',
    borderBottom: '2px solid rgba(255,255,255,0.2)'
  },
  userInfo: {
    fontSize: '18px',
    fontWeight: 'bold'
  },
  button: {
    padding: '8px 16px',
    fontSize: '14px',
    border: 'none',
    borderRadius: '6px',
    backgroundColor: '#e74c3c',
    color: '#fff',
    cursor: 'pointer',
    transition: '0.2s'
  },
  chatBox: {
    flexGrow: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    borderRadius: '10px',
    padding: '15px',
    overflowY: 'auto',
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
    position: 'relative'
  },
  messageContainer: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px'
  },
  message: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: '8px',
    padding: '12px',
    maxWidth: '75%',
    wordBreak: 'break-word',
    boxShadow: '0 2px 6px rgba(0,0,0,0.2)',
    position: 'relative'
  },
  avatar: {
    width: '40px',
    height: '40px',
    borderRadius: '50%'
  },
  inputArea: {
    display: 'flex',
    gap: '10px',
    marginTop: '10px'
  },
  input: {
    flexGrow: 1,
    padding: '12px',
    fontSize: '16px',
    borderRadius: '6px',
    border: 'none',
    outline: 'none'
  },
  deleteButton: {
    padding: '4px 8px',
    fontSize: '12px',
    border: 'none',
    borderRadius: '6px',
    backgroundColor: '#c0392b',
    color: '#fff',
    cursor: 'pointer',
    marginLeft: '8px'
  },
  timeoutNotice: {
    padding: '10px',
    backgroundColor: 'rgba(255,0,0,0.3)',
    borderRadius: '6px',
    textAlign: 'center',
    marginBottom: '10px'
  },
  modMessage: {
    padding: '8px',
    margin: '10px 0',
    backgroundColor: 'rgba(255, 255, 0, 0.2)',
    textAlign: 'center',
    borderRadius: '6px',
    fontWeight: 'bold'
  }
};

function App() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [user, setUser] = useState(null);
  const [wsConnected, setWsConnected] = useState(false);
  const [loading, setLoading] = useState(true);
  const [isTimedOut, setIsTimedOut] = useState(false);
  const [timeoutExpires, setTimeoutExpires] = useState(null);
  const [timeoutReason, setTimeoutReason] = useState('');
  const [snackbarOpen, setSnackbarOpen] = useState(false);
  const [snackbarMessage, setSnackbarMessage] = useState('');
  const ws = useRef(null);
  const chatEndRef = useRef(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get('code');
    if (token) {
      localStorage.setItem('authToken', token);
      window.history.replaceState({}, document.title, window.location.pathname);
      window.location.href = "https://sabry134.github.io/instant-chat";
    }
  }, []);

  useEffect(() => {
    const token = localStorage.getItem('authToken');
    if (!token) {
      setLoading(false);
      return;
    }
    fetch('https://instant-chat-ifw4.onrender.com/api/current_user', {
      headers: { 'Authorization': `Bearer ${token}` }
    })
      .then(res => res.json())
      .then(data => {
        if (data) {
          setUser(data);
          initializeWebSocket(data.id);
        }
      })
      .catch(err => console.error('Error fetching user:', err))
      .finally(() => setLoading(false));
      
    return () => {
      if (ws.current) ws.current.close();
    };
  }, []);

  useEffect(() => {
    if (user) {
      const checkTimeout = () => {
        fetch(`https://instant-chat-ifw4.onrender.com/is-timed-out/${user.id}`)
          .then(res => res.json())
          .then(data => {
            setIsTimedOut(data.timedOut);
            if (data.timedOut && data.expires) {
              setTimeoutExpires(new Date(data.expires));
            } else {
              setTimeoutExpires(null);
            }
            setTimeoutReason(data.reason || '');
          });
      };
      checkTimeout();
      const interval = setInterval(checkTimeout, 5000);
      return () => clearInterval(interval);
    }
  }, [user]);

  const initializeWebSocket = (userId) => {
    if (ws.current) return;

    const connectWebSocket = () => {
      ws.current = new WebSocket(`wss://instant-chat-ifw4.onrender.com?userId=${userId}`);

      ws.current.onopen = () => {
        setWsConnected(true);
        console.log("WebSocket connected");
      };

      ws.current.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          console.log("DEBUG: Received message:", message);
      
          if (!message.content?.trim()) {
            console.log("DEBUG: Ignoring empty message.");
            return;
          }
      
          if (message.adminOnly) {
            console.log("DEBUG: Admin-only message received, displaying snackbar:", message);
            setMessages(prev => [...prev, message]);
          } else {
            setMessages(prev => [...prev, message]);
          }
        } catch (err) {
          console.error('Error parsing message:', err);
        }
      };

      ws.current.onclose = (event) => {
        setWsConnected(false);
        console.log('WebSocket closed', event);
        setSnackbarMessage("Disconnected from server. Reconnecting...");
        setSnackbarOpen(true);

        setTimeout(() => connectWebSocket(), 3000);
      };

      ws.current.onerror = (error) => {
        console.error('WebSocket error:', error);
      };
    };

    connectWebSocket();
  };

  const sendMessage = () => {
    if (!ws.current || ws.current.readyState !== WebSocket.OPEN || input.trim() === '' || !user) return;
    if (isTimedOut) return;
    const truncatedInput = input.slice(0, 2000);
    const messagePayload = {
      id: Date.now(),
      content: truncatedInput,
      author: {
        id: user.id,
        username: user.username,
        avatar: user.avatar ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png` : ''
      }
    };
    ws.current.send(JSON.stringify(messagePayload));
    setInput('');
    setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
  };

  const deleteMessage = (messageId) => {
    if (!ws.current || ws.current.readyState !== WebSocket.OPEN) return;
  
    const deletePayload = { type: 'delete', id: messageId };
    ws.current.send(JSON.stringify(deletePayload));
  
    setMessages(prevMessages => prevMessages.filter(msg => msg.id !== messageId));
  };
  
  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const logout = () => {
    localStorage.removeItem('authToken');
    setUser(null);
  };

  if (loading) {
    return (
      <div style={{ ...styles.container, justifyContent: 'center', alignItems: 'center' }}>
        <LinearProgress style={{ width: '100%' }} />
      </div>
    );
  }

  if (!user) {
    return (
      <div style={{ ...styles.container, justifyContent: 'center', alignItems: 'center' }}>
        <h1>Login to Access Chat</h1>
        <a href="https://instant-chat-ifw4.onrender.com/auth/discord">
          <button style={styles.button}>Login with Discord</button>
        </a>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <span style={styles.userInfo}>Logged in as {user.username}</span>
        <button onClick={logout} style={styles.button}>Logout</button>
      </div>
      {isTimedOut && (
        <div style={styles.timeoutNotice}>
          You are currently timed out {timeoutExpires && `(until ${timeoutExpires.toLocaleTimeString()})`}.
          {timeoutReason && <div>Reason: {timeoutReason}</div>}
        </div>
      )}
      <div style={styles.chatBox}>
        {!wsConnected && <LinearProgress style={{ marginBottom: '10px' }} />}
        {messages.map((msg, index) => {
          if (msg.adminOnly) {
            return (
              <div key={msg.id || index} style={styles.modMessage}>
                <p>{msg.content}</p>
              </div>
            );
          }
          return (
            <div key={msg.id || index} style={styles.messageContainer}>
              {msg.author && msg.author.avatar && (
                <img src={msg.author.avatar} alt={msg.author.username} style={styles.avatar} />
              )}
              <div style={styles.message}>
                <strong>{msg.author?.username}</strong>
                {user.id === "495265351270137883" && msg.author && (
                  <div style={{ fontSize: '12px', color: '#ccc' }}>
                    Discord ID: {msg.author.id}
                  </div>
                )}
                <p>{msg.content}</p>
              </div>
              {user.id === "495265351270137883" && (
                <button onClick={() => deleteMessage(msg.id)} style={styles.deleteButton}>🗑️</button>
              )}
            </div>
          );
        })}
        <div ref={chatEndRef} />
      </div>
      <div style={styles.inputArea}>
        <input
          type="text"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={isTimedOut ? "You are timed out" : "Type a message..."}
          style={styles.input}
          disabled={isTimedOut}
        />
        <button onClick={sendMessage} style={styles.button} disabled={isTimedOut}>Send</button>
      </div>

      <Snackbar
        open={snackbarOpen}
        autoHideDuration={3000}
        onClose={() => setSnackbarOpen(false)}
        message={snackbarMessage}
      />
    </div>
  );
}

export default App;
