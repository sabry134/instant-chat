require('dotenv').config(); // Load environment variables from .env

const express = require('express');
const session = require('express-session');
const passport = require('passport');
const DiscordStrategy = require('passport-discord').Strategy;
const WebSocket = require('ws');
const http = require('http');
const cors = require('cors');

const app = express();

// If behind a proxy (like onRender), trust the first proxy
app.set('trust proxy', 1);

app.use(cors({
  origin: 'https://sabry134.github.io',
  credentials: true
}));

// Set up session middleware with cross-site cookie settings
app.use(session({
  secret: 'your secret here',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: true, sameSite: 'none' } // secure: true works with HTTPS
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
app.get('/auth/discord/callback',
  passport.authenticate('discord', { failureRedirect: 'https://instant-chat-ifw4.onrender.com/' }),
  (req, res) => {
    res.redirect('https://sabry134.github.io/instant-chat/');
  }
);

// API endpoint to return current user data
app.get('/api/current_user', (req, res) => {
  res.json(req.isAuthenticated() ? req.user : null);
});

app.get('/auth/logout', (req, res) => {
  req.session.destroy(() => {
    res.clearCookie('connect.sid', { path: '/' });
    res.json({ success: true });
  });
});

// Create an HTTP server with Express
const server = http.createServer(app);

// WebSocket chat server integration
const chatHistory = [];
const wss = new WebSocket.Server({ server });

wss.on('connection', (ws) => {
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
      const deletePayload = { type: 'delete', id: parsed.id };
      wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify(deletePayload));
        }
      });
      return;
    }

    console.log('Received:', parsed);
    chatHistory.push(parsed);
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
