require('dotenv').config(); // Load environment variables from .env

const express = require('express');
const session = require('express-session');
const passport = require('passport');
const DiscordStrategy = require('passport-discord').Strategy;
const WebSocket = require('ws');
const http = require('http');
const cors = require('cors');

const app = express();

// Enable CORS for requests coming from your React app (localhost:3000)
app.use(cors({
  origin: 'https://sabry134.github.io/instant-chat',
  credentials: true
}));

// Set up session middleware (using cookie settings appropriate for local development)
app.use(session({
  secret: 'your secret here',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false } // use secure: true in production over HTTPS
}));

app.use(passport.initialize());
app.use(passport.session());

// Passport session setup
passport.serializeUser((user, done) => {
  done(null, user);
});
passport.deserializeUser((obj, done) => {
  done(null, obj);
});

// Configure Discord strategy for Passport
passport.use(new DiscordStrategy({
  clientID: process.env.DISCORD_CLIENT_ID,
  clientSecret: process.env.DISCORD_CLIENT_SECRET,
  callbackURL: process.env.DISCORD_CALLBACK_URL,
  scope: ['identify']
}, (accessToken, refreshToken, profile, done) => {
  process.nextTick(() => {
    return done(null, profile);
  });
}));

// OAuth endpoints
app.get('/auth/discord', passport.authenticate('discord'));
app.get('/auth/discord/callback', passport.authenticate('discord', { failureRedirect: 'https://instant-chat-ifw4.onrender.com/' }), (req, res) => {
  // Successful authentication; redirect to the React chat app
  res.redirect('https://sabry134.github.io/instant-chat/');
});

// API endpoint to return current user data
app.get('/api/current_user', (req, res) => {
  if (req.isAuthenticated()) {
    res.json(req.user);
  } else {
    res.json(null);
  }
});

app.get('/auth/logout', (req, res) => {
  req.session.destroy((err) => {
    res.clearCookie('connect.sid', { path: '/' }); // Ensure session cookie is cleared
    res.json({ success: true }); // Send JSON instead of redirect
  });
});

// Create an HTTP server with Express
const server = http.createServer(app);

// WebSocket chat server integration
const chatHistory = [];
const wss = new WebSocket.Server({ server });

wss.on('connection', (ws, req) => {
  console.log('New client connected');

  // Send chat history to the newly connected client
  chatHistory.forEach((message) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    }
  });

  ws.on('message', (message) => {
    let parsed;
    try {
      parsed = JSON.parse(message);
    } catch (e) {
      console.error('Invalid message format');
      return;
    }

    // Handle deletion requests
    if (parsed.type && parsed.type === 'delete') {
      const index = chatHistory.findIndex(msg => msg.id === parsed.id);
      if (index !== -1) {
        chatHistory.splice(index, 1);
      }
      const deletePayload = {
        type: 'delete',
        id: parsed.id
      };
      // Broadcast the delete event to all connected clients
      wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify(deletePayload));
        }
      });
      return;
    }

    // Expected message format for normal chat: { id, content, author: { id, username, avatar } }
    console.log('Received:', parsed);

    // Save message to chat history
    chatHistory.push(parsed);

    // Broadcast the new message to all connected clients
    wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify(parsed));
      }
    });
  });

  ws.on('close', () => {
    console.log('Client disconnected');
  });
});

const PORT = process.env.PORT || 8080;
server.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
