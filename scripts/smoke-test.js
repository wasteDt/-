const { io } = require('socket.io-client');

const SERVER_URL = process.env.SERVER_URL || 'http://localhost:3000';

function waitForConnect(socket) {
  return new Promise((resolve, reject) => {
    socket.once('connect', resolve);
    socket.once('connect_error', reject);
  });
}

function emitWithAck(socket, eventName, payload) {
  return new Promise((resolve) => {
    socket.emit(eventName, payload, resolve);
  });
}

async function main() {
  const alice = io(SERVER_URL);
  const bob = io(SERVER_URL);
  let bobReceivedMessage = false;

  try {
    await Promise.all([waitForConnect(alice), waitForConnect(bob)]);

    const aliceJoin = await emitWithAck(alice, 'user:join', 'Alice');
    const duplicateJoin = await emitWithAck(bob, 'user:join', 'Alice');
    const bobJoin = await emitWithAck(bob, 'user:join', 'Bob');

    bob.on('chat:message', (message) => {
      bobReceivedMessage = message.username === 'Alice' && message.text === 'hello';
    });

    const messageSent = await emitWithAck(alice, 'chat:message', 'hello');

    await new Promise((resolve) => setTimeout(resolve, 300));

    const result = {
      aliceJoined: aliceJoin.ok === true,
      duplicateRejected: duplicateJoin.ok === false,
      bobJoined: bobJoin.ok === true,
      messageAccepted: messageSent.ok === true,
      messageBroadcast: bobReceivedMessage
    };

    console.log(JSON.stringify(result, null, 2));

    if (Object.values(result).some((value) => value !== true)) {
      process.exitCode = 1;
    }
  } finally {
    alice.close();
    bob.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
