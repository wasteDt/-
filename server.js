const path = require('path');
const fs = require('fs');
const http = require('http');
const { Server } = require('socket.io');

const PORT = process.env.PORT || 3000;
const MAX_NAME_LENGTH = 20;
const MAX_MESSAGE_LENGTH = 500;

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml'
};

const publicDir = path.join(__dirname, 'public');
const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const normalizedPath = path
    .normalize(decodeURIComponent(url.pathname))
    .replace(/^[/\\]+/, '');
  const requestedPath = normalizedPath || 'index.html';
  const filePath = path.resolve(publicDir, requestedPath);

  if (!filePath.startsWith(path.resolve(publicDir))) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  fs.readFile(filePath, (error, content) => {
    if (error) {
      res.writeHead(404);
      res.end('Not Found');
      return;
    }

    const contentType = MIME_TYPES[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(content);
  });
});
const io = new Server(server);

const users = new Map();

function cleanText(value, maxLength) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);
}

function isNameTaken(name, currentSocketId) {
  const normalized = name.toLowerCase();

  for (const [socketId, user] of users.entries()) {
    if (socketId !== currentSocketId && user.name.toLowerCase() === normalized) {
      return true;
    }
  }

  return false;
}

function publicUsers() {
  return [...users.values()]
    .sort((a, b) => a.joinedAt - b.joinedAt)
    .map((user) => ({ id: user.id, name: user.name }));
}

function emitUsers() {
  io.emit('users:update', publicUsers());
}

function systemMessage(text) {
  io.emit('chat:system', {
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    text,
    createdAt: new Date().toISOString()
  });
}

io.on('connection', (socket) => {
  socket.emit('users:update', publicUsers());

  socket.on('user:join', (rawName, reply) => {
    const name = cleanText(rawName, MAX_NAME_LENGTH);

    if (!name) {
      reply?.({ ok: false, error: '用户名不能为空' });
      return;
    }

    if (isNameTaken(name, socket.id)) {
      reply?.({ ok: false, error: '用户名已被占用' });
      return;
    }

    users.set(socket.id, {
      id: socket.id,
      name,
      joinedAt: Date.now()
    });

    reply?.({ ok: true, user: { id: socket.id, name } });
    emitUsers();
    systemMessage(`${name} 加入了聊天`);
  });

  socket.on('user:rename', (rawName, reply) => {
    const currentUser = users.get(socket.id);
    const name = cleanText(rawName, MAX_NAME_LENGTH);

    if (!currentUser) {
      reply?.({ ok: false, error: '请先进入聊天' });
      return;
    }

    if (!name) {
      reply?.({ ok: false, error: '用户名不能为空' });
      return;
    }

    if (isNameTaken(name, socket.id)) {
      reply?.({ ok: false, error: '用户名已被占用' });
      return;
    }

    if (currentUser.name === name) {
      reply?.({ ok: true, user: { id: socket.id, name } });
      return;
    }

    const oldName = currentUser.name;
    currentUser.name = name;
    users.set(socket.id, currentUser);

    reply?.({ ok: true, user: { id: socket.id, name } });
    emitUsers();
    systemMessage(`${oldName} 改名为 ${name}`);
  });

  socket.on('chat:message', (rawMessage, reply) => {
    const user = users.get(socket.id);
    const text = cleanText(rawMessage, MAX_MESSAGE_LENGTH);

    if (!user) {
      reply?.({ ok: false, error: '请先进入聊天' });
      return;
    }

    if (!text) {
      reply?.({ ok: false, error: '消息不能为空' });
      return;
    }

    const message = {
      id: `${Date.now()}-${socket.id}`,
      userId: socket.id,
      username: user.name,
      text,
      createdAt: new Date().toISOString()
    };

    io.emit('chat:message', message);
    reply?.({ ok: true });
  });

  socket.on('disconnect', () => {
    const user = users.get(socket.id);

    if (!user) {
      return;
    }

    users.delete(socket.id);
    emitUsers();
    systemMessage(`${user.name} 离开了聊天`);
  });
});

server.listen(PORT, () => {
  console.log(`Chat server running at http://localhost:${PORT}`);
});
