require('dotenv').config();
const express = require('express');
const axios = require('axios');
const querystring = require('querystring');
const cors = require('cors');
const http = require('http');
const WebSocket = require('ws');

const app = express();

app.use(cors({
  origin: 'https://sabry134.github.io'
}));
const server = http.createServer(app);

app.get('/auth/discord', (req, res) => {
  const redirectUri = encodeURIComponent(process.env.DISCORD_CALLBACK_URL);
  const discordAuthUrl = `https://discord.com/api/oauth2/authorize?client_id=${process.env.DISCORD_CLIENT_ID}&redirect_uri=${redirectUri}&response_type=code&scope=identify%20email`;
  res.redirect(discordAuthUrl);
});

app.get('/auth/discord/callback', async (req, res) => {
  const code = req.query.code;
  if (!code) {
    return res.redirect('https://instant-chat-ifw4.onrender.com/');
  }

  const tokenParams = {
    client_id: process.env.DISCORD_CLIENT_ID,
    client_secret: process.env.DISCORD_CLIENT_SECRET,
    code: code,
    grant_type: 'authorization_code',
    redirect_uri: process.env.DISCORD_CALLBACK_URL,
    scope: 'identify email'
  };

  try {
    const tokenResponse = await axios.post(
      'https://discord.com/api/oauth2/token',
      querystring.stringify(tokenParams),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );
    const accessToken = tokenResponse.data.access_token;
    res.redirect(`https://sabry134.github.io/instant-chat?code=${accessToken}`);
  } catch (error) {
    console.error('Error exchanging code for token:', error.response ? error.response.data : error.message);
    res.status(500).send("Internal Server Error");
  }
});

app.get('/api/current_user', async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: 'No token provided' });
  const token = authHeader.split(' ')[1];
  try {
    const userResponse = await axios.get('https://discord.com/api/users/@me', {
      headers: { Authorization: `Bearer ${token}` }
    });
    res.json(userResponse.data);
  } catch (error) {
    res.status(401).json({ error: 'Invalid token' });
  }
});

app.get('/auth/logout', (req, res) => {
  res.json({ success: true });
});

const timeouts = {};
const usernames = {};

function parseDuration(durationStr) {
  if (!durationStr) return null;
  if (durationStr.toLowerCase() === 'forever') return Infinity;
  const match = durationStr.match(/^(\d+)([smhdwy])$/i);
  if (!match) return null;
  const value = parseInt(match[1], 10);
  const unit = match[2].toLowerCase();
  const multipliers = {
    s: 1000,
    m: 60 * 1000,
    h: 60 * 60 * 1000,
    d: 24 * 60 * 60 * 1000,
    w: 7 * 24 * 60 * 60 * 1000,
    y: 365 * 24 * 60 * 60 * 1000,
  };
  return value * (multipliers[unit] || 0);
}

function broadcast(message) {
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(message));
    }
  });
}

function broadcastMod(message) {
  message.adminOnly = true;
  console.log("DEBUG: broadcastMod - about to send message:", message);
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN && client.userId === "495265351270137883") {
      client.send(JSON.stringify(message));
      console.log("DEBUG: broadcastMod - sent to client with userId:", client.userId);
    }
  });
}

app.get('/api/username/:discordId', (req, res) => {
  const discordId = req.params.discordId;
  if (usernames[discordId]) {
    res.json({ username: usernames[discordId] });
  } else {
    res.status(404).json({ error: 'Username not found' });
  }
});

app.get('/is-timed-out/:id', (req, res) => {
  const userId = req.params.id;
  const timeoutInfo = timeouts[userId];
  if (timeoutInfo && (timeoutInfo.expires === Infinity || Date.now() < timeoutInfo.expires)) {
    return res.json({ timedOut: true, expires: timeoutInfo.expires, reason: timeoutInfo.reason });
  }
  res.json({ timedOut: false });
});

let chatHistory = [];

const wss = new WebSocket.Server({ server });

wss.on('connection', (ws, req) => {
  console.log('DEBUG: New client connected');

  const query = req.url.split('?')[1] || '';
  const params = new URLSearchParams(query);
  ws.userId = params.get('userId') || null;
  console.log("DEBUG: Connection userId:", ws.userId);

  chatHistory.forEach((message) => {
    if (ws.readyState === WebSocket.OPEN) {
      if (!message.adminOnly || ws.userId === "495265351270137883") {
        ws.send(JSON.stringify(message));
      }
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

    if (!parsed.content?.trim() && parsed.type !== 'delete') {
      console.log("DEBUG: Ignoring empty message.");
      return;
    }

    if (parsed.type === 'delete' && parsed.id) {
      chatHistory = chatHistory.filter(msg => msg.id !== parsed.id);
      console.log(`DEBUG: Deleted message with ID ${parsed.id}`);

      if (parsed.id) {
        broadcast({ type: 'delete', id: parsed.id });
      }
      return;
    }

    if (parsed.author && parsed.author.id && parsed.author.username) {
      usernames[parsed.author.id] = parsed.author.username;
    }

    if (parsed.author && timeouts[parsed.author.id] && Date.now() < timeouts[parsed.author.id].expires) {
      console.log(`DEBUG: User ${parsed.author.id} is timed out.`);
      return;
    }

    if (parsed.author && parsed.author.id === "495265351270137883" && parsed.content.startsWith("/timeout")) {
      const parts = parsed.content.split(" ");
      if (parts.length >= 4) {
        const targetUserId = parts[1];
        const durationStr = parts[2];
        const reason = parts.slice(3).join(" ");
        const durationMs = parseDuration(durationStr);
        if (durationMs === null) {
          console.log("DEBUG: Invalid duration format:", durationStr);
          return;
        }
        console.log(`DEBUG: Received timeout command for user ${targetUserId} for duration ${durationStr} (${durationMs} ms) with reason: ${reason}`);

        if (durationMs === Infinity) {
          timeouts[targetUserId] = { expires: Infinity, reason };
        } else {
          timeouts[targetUserId] = { expires: Date.now() + durationMs, reason };
          setTimeout(() => {
            delete timeouts[targetUserId];
            console.log(`DEBUG: Timeout expired for user ${targetUserId}`);
          }, durationMs);
        }

        const targetUsername = usernames[targetUserId] || targetUserId;
        const modMsg = { adminOnly: true, content: `[MOD] ${targetUsername} has been timed out for ${durationStr}. Reason: ${reason}`, id: Date.now() };
        console.log("DEBUG: Sending mod confirmation message:", modMsg);
        chatHistory.push(modMsg);
        broadcastMod(modMsg);
        return;
      }
    }

    if (parsed.author && parsed.author.id === "495265351270137883" && parsed.content.startsWith("/untimeout")) {
      const parts = parsed.content.split(" ");
      if (parts.length >= 2) {
        const targetUserId = parts[1];
        if (timeouts[targetUserId]) {
          delete timeouts[targetUserId];
          console.log(`DEBUG: Timeout removed for user ${targetUserId}`);
          const targetUsername = usernames[targetUserId] || targetUserId;
          const modMsg = { adminOnly: true, content: `[MOD] ${targetUsername} has been un-timed out.`, id: Date.now() };
          chatHistory.push(modMsg);
          broadcastMod(modMsg);
        } else {
          console.log(`DEBUG: User ${targetUserId} was not timed out.`);
        }
        return;
      }
    }

    chatHistory.push(parsed);
    broadcast(parsed);
  });

  ws.on('close', () => {
    console.log('DEBUG: Client disconnected');
  });
});

const PORT = process.env.PORT || 8080;
server.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
