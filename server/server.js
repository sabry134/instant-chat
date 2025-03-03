require('dotenv').config();

const express = require('express');
const session = require('express-session');
const passport = require('passport');
const DiscordStrategy = require('passport-discord').Strategy;
const WebSocket = require('ws');
const http = require('http');
const cors = require('cors');

const app = express();

app.use(cors({
  origin: 'https://sabry134.github.io',
  credentials: true
}));

app.use(session({
  secret: 'your secret here',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false }
}));

app.use(passport.initialize());
app.use(passport.session());

passport.serializeUser((user, done) => {
  done(null, user);
});
passport.deserializeUser((obj, done) => {
  done(null, obj);
});

passport.use(new DiscordStrategy({
  clientID: process.env.DISCORD_CLIENT_ID,
  clientSecret: process.env.DISCORD_CLIENT_SECRET,
  callbackURL: process.env.DISCORD_CALLBACK_URL,
  scope: ['identify']
}, (accessToken, refreshToken, profile, done) => {
  process.nextTick(() => done(null, profile));
}));

app.get('/auth/discord', passport.authenticate('discord'));
app.get('/auth/discord/callback', passport.authenticate('discord', { failureRedirect: 'https://instant-chat-ifw4.onrender.com/' }), (req, res) => {
  res.redirect('https://sabry134.github.io/instant-chat/');
});

app.get('/api/current_user', (req, res) => {
  res.json(req.isAuthenticated() ? req.user : null);
});

app.get('/auth/logout', (req, res) => {
  req.session.destroy(() => {
    res.clearCookie('connect.sid', { path: '/' });
    res.json({ success: true });
  });
});

const server = http.createServer(app);
const chatHistory = [];
const wss = new WebSocket.Server({ server });

wss.on('connection', (ws) => {
  console.log('New client connected');

  chatHistory.forEach((message) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    }
  });

  ws.on('message', (message) => {
    let parsed;
    try {
      parsed = JSON.parse(message);
    } catch {
      console.error('Invalid message format');
      return;
    }

    if (parsed.type === 'delete') {
      const index = chatHistory.findIndex(msg => msg.id === parsed.id);
      if (index !== -1) chatHistory.splice(index, 1);
      wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify({ type: 'delete', id: parsed.id }));
        }
      });
      return;
    }

    console.log('Received:', parsed);
    chatHistory.push(parsed);
    wss.clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify(parsed));
      }
    });
  });

  ws.on('close', () => console.log('Client disconnected'));
});

const PORT = process.env.PORT || 8080;
server.listen(PORT, () => console.log(`Server listening on port ${PORT}`));
