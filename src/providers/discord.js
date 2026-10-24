const net = require('node:net');

class DiscordPresence {
  constructor() { this.socket = null; this.ready = false; this.buffer = Buffer.alloc(0); this.applicationId = ''; this.activity = null; }

  frame(opcode, payload) {
    const body = Buffer.from(JSON.stringify(payload));
    const header = Buffer.alloc(8);
    header.writeUInt32LE(opcode, 0); header.writeUInt32LE(body.length, 4);
    return Buffer.concat([header, body]);
  }

  async connect(applicationId) {
    if (!/^\d{17,20}$/.test(applicationId || '')) throw new Error('Enter a valid Discord Application ID (17–20 digits).');
    this.close(); this.applicationId = applicationId;
    if (process.platform !== 'win32') throw new Error('Discord presence is currently supported on Windows only.');
    let lastError = 'Discord desktop app was not found.';
    for (let index = 0; index < 10; index += 1) {
      const pipe = `\\\\?\\pipe\\discord-ipc-${index}`;
      const connected = await new Promise(resolve => {
        const socket = net.createConnection(pipe), timeout = setTimeout(() => { socket.destroy(); resolve(null); }, 700);
        socket.once('connect', () => { clearTimeout(timeout); this.socket = socket; this.ready = false; this.buffer = Buffer.alloc(0); socket.on('data', data => this.onData(data)); socket.on('error', error => { lastError = error.message; this.close(); }); socket.on('close', () => { this.ready = false; this.socket = null; }); socket.write(this.frame(0, { v: 1, client_id: applicationId })); resolve(socket); });
        socket.once('error', error => { clearTimeout(timeout); lastError = error.message; resolve(null); });
      });
      if (connected) return new Promise((resolve, reject) => { const timeout = setTimeout(() => { this.close(); reject(new Error('Discord did not accept the Rich Presence handshake.')); }, 2500); const poll = setInterval(() => { if (this.ready) { clearInterval(poll); clearTimeout(timeout); resolve(true); } else if (!this.socket) { clearInterval(poll); clearTimeout(timeout); reject(new Error(lastError)); } }, 50); });
    }
    throw new Error(`Could not connect to Discord: ${lastError}`);
  }

  onData(data) {
    this.buffer = Buffer.concat([this.buffer, data]);
    while (this.buffer.length >= 8) {
      const opcode = this.buffer.readUInt32LE(0), length = this.buffer.readUInt32LE(4);
      if (length > 1024 * 1024) return this.close();
      if (this.buffer.length < 8 + length) return;
      const packet = this.buffer.subarray(8, 8 + length); this.buffer = this.buffer.subarray(8 + length);
      if (opcode === 1) { this.ready = true; if (this.activity) this.setActivity(this.activity); }
      else if (opcode === 2) { try { const error = JSON.parse(packet.toString()); console.warn('Discord RPC error:', error.message || 'unknown error'); } catch {} }
    }
  }

  setActivity(title, startedAt = Date.now()) {
    this.activity = title ? { details: String(title).slice(0, 128), state: 'Playing through Chronos', timestamps: { start: startedAt } } : null;
    if (!this.ready || !this.socket) return false;
    this.socket.write(this.frame(1, { cmd: 'SET_ACTIVITY', args: { pid: process.pid, activity: this.activity } }));
    return true;
  }

  close() { if (this.socket) { try { this.socket.write(this.frame(1, { cmd: 'SET_ACTIVITY', args: { pid: process.pid, activity: null } })); } catch {} this.socket.destroy(); } this.socket = null; this.ready = false; }
}

module.exports = { DiscordPresence };
