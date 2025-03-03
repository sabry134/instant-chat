import React, { useState, useEffect, useRef } from 'react';

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
    gap: '10px'
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
  }
};

function App() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [user, setUser] = useState(null);
  const ws = useRef(null);
  const chatEndRef = useRef(null);

  useEffect(() => {
    fetch('https://instant-chat-ifw4.onrender.com/api/current_user', {
      credentials: 'include' // Ensures cookies/session are sent
    })
      .then((res) => {
        console.log('Response received:', res);
        return res.json();
      })
      .then((data) => {
        console.log('Parsed data:', data);
        if (data) {
          setUser(data);
          initializeWebSocket();
        }
      })
      .catch((err) => {
        console.error('Error fetching user:', err);
      });
  
    return () => {
      if (ws.current) {
        console.log('Closing WebSocket');
        ws.current.close();
      }
    };
  }, []);
  


  const initializeWebSocket = () => {
    if (ws.current) return;
    ws.current = new WebSocket('wss://instant-chat-ifw4.onrender.com');

    ws.current.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        // Handle delete event: remove the message from state
        if (message.type && message.type === 'delete') {
          setMessages((prev) => prev.filter((msg) => msg.id !== message.id));
        } else {
          setMessages((prev) => [...prev, message]);
        }
      } catch (err) {
        console.error('Error parsing message:', err);
      }
    };
  };

  const sendMessage = () => {
    if (!ws.current || ws.current.readyState !== WebSocket.OPEN || input.trim() === '' || !user) return;

    const truncatedInput = input.slice(0, 2000); // Limit message to 2000 characters

    const messagePayload = {
      id: Date.now(), // unique identifier for deletion purposes
      content: truncatedInput,
      author: {
        id: user.id, // include the Discord id of the sender
        username: user.username,
        avatar: user.avatar
          ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png`
          : ''
      }
    };

    ws.current.send(JSON.stringify(messagePayload));
    setInput('');
    setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
  };

  // Function for the admin to delete a message
  const deleteMessage = (messageId) => {
    if (!ws.current || ws.current.readyState !== WebSocket.OPEN) return;
    const deletePayload = { type: 'delete', id: messageId };
    ws.current.send(JSON.stringify(deletePayload));
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const logout = () => {
    fetch('https://instant-chat-ifw4.onrender.com/auth/logout', { credentials: 'include' })
      .then(() => {
        setUser(null);
        window.location.href = 'https://instant-chat-ifw4.onrender.com/auth/discord'; // Redirect to login
      })
      .catch((err) => console.error('Logout error:', err));
  };

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
      <div style={styles.chatBox}>
        {messages.map((msg, index) => (
          <div key={msg.id || index} style={styles.messageContainer}>
            {msg.author.avatar && (
              <img src={msg.author.avatar} alt={msg.author.username} style={styles.avatar} />
            )}
            <div style={styles.message}>
              <strong>{msg.author.username}</strong>
              {/* Only the admin sees the Discord ID of the message sender */}
              {user.id === "495265351270137883" && (
                <div style={{ fontSize: '12px', color: '#ccc' }}>
                  Discord ID: {msg.author.id}
                </div>
              )}
              <p>{msg.content}</p>
            </div>
            {/* Render delete icon if the current user is the admin */}
            {user.id === "495265351270137883" && (
              <button onClick={() => deleteMessage(msg.id)} style={styles.deleteButton}>🗑️</button>
            )}
          </div>
        ))}
        <div ref={chatEndRef} />
      </div>
      <div style={styles.inputArea}>
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type a message..."
          style={styles.input}
        />
        <button onClick={sendMessage} style={styles.button}>Send</button>
      </div>
    </div>
  );
}

export default App;
