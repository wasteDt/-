const socket = io();

const connectionStatus = document.querySelector('#connectionStatus');
const nameForm = document.querySelector('#nameForm');
const nameInput = document.querySelector('#nameInput');
const userCount = document.querySelector('#userCount');
const usersList = document.querySelector('#users');
const messages = document.querySelector('#messages');
const messageForm = document.querySelector('#messageForm');
const messageInput = document.querySelector('#messageInput');
const sendButton = document.querySelector('#sendButton');

let currentUser = null;
let toastTimer = null;

function setChatEnabled(enabled) {
  messageInput.disabled = !enabled;
  sendButton.disabled = !enabled;
  messageInput.placeholder = enabled ? '输入消息，按 Enter 发送' : '先设置唯一用户名，再发送消息';
}

function showToast(text) {
  let toast = document.querySelector('.toast');

  if (!toast) {
    toast = document.createElement('div');
    toast.className = 'toast';
    document.body.appendChild(toast);
  }

  toast.textContent = text;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 2200);
}

function formatTime(value) {
  return new Intl.DateTimeFormat('zh-CN', {
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date(value));
}

function scrollToLatest() {
  messages.scrollTop = messages.scrollHeight;
}

function addSystemMessage(message) {
  const item = document.createElement('div');
  item.className = 'system';
  item.textContent = message.text;
  messages.appendChild(item);
  scrollToLatest();
}

function addChatMessage(message) {
  const isMe = currentUser && message.userId === currentUser.id;
  const item = document.createElement('article');
  item.className = `message${isMe ? ' me' : ''}`;

  const meta = document.createElement('div');
  meta.className = 'meta';
  meta.textContent = `${message.username} · ${formatTime(message.createdAt)}`;

  const bubble = document.createElement('div');
  bubble.className = 'bubble';
  bubble.textContent = message.text;

  item.append(meta, bubble);
  messages.appendChild(item);
  scrollToLatest();
}

function renderUsers(users) {
  userCount.textContent = users.length;
  usersList.innerHTML = '';

  users.forEach((user) => {
    const item = document.createElement('li');
    item.textContent = user.name;

    if (currentUser && user.id === currentUser.id) {
      item.classList.add('me');
    }

    usersList.appendChild(item);
  });
}

function sendWithAck(eventName, payload) {
  return new Promise((resolve) => {
    socket.emit(eventName, payload, resolve);
  });
}

socket.on('connect', () => {
  connectionStatus.textContent = '已连接，请设置唯一用户名';
});

socket.on('disconnect', () => {
  connectionStatus.textContent = '连接已断开，正在等待重连...';
  setChatEnabled(false);
});

socket.on('connect_error', () => {
  connectionStatus.textContent = '连接失败，请确认服务器已启动';
});

socket.on('users:update', renderUsers);
socket.on('chat:system', addSystemMessage);
socket.on('chat:message', addChatMessage);

nameForm.addEventListener('submit', async (event) => {
  event.preventDefault();

  const name = nameInput.value.trim();
  const eventName = currentUser ? 'user:rename' : 'user:join';
  const result = await sendWithAck(eventName, name);

  if (!result?.ok) {
    showToast(result?.error || '用户名设置失败');
    nameInput.focus();
    return;
  }

  currentUser = result.user;
  nameInput.value = currentUser.name;
  connectionStatus.textContent = `当前用户：${currentUser.name}`;
  setChatEnabled(true);
  messageInput.focus();
});

messageForm.addEventListener('submit', async (event) => {
  event.preventDefault();

  const text = messageInput.value.trim();

  if (!text) {
    return;
  }

  const result = await sendWithAck('chat:message', text);

  if (!result?.ok) {
    showToast(result?.error || '消息发送失败');
    return;
  }

  messageInput.value = '';
  messageInput.focus();
});

setChatEnabled(false);
