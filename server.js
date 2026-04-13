// server.js
// BrewPOS Express.js Backend Entry Point

require('dotenv').config();
const express    = require('express');
const http       = require('http');
const cors       = require('cors');
const helmet     = require('helmet');
const compression = require('compression');
const bodyParser = require('body-parser');
const { Server } = require('socket.io');
const routes     = require('./routes/index');
const { sanitizeBody } = require('./middleware/security');
const jwt = require('jsonwebtoken');

const app    = express();
const server = http.createServer(app);
const PORT   = process.env.PORT || 4000;

// ── CORS ──────────────────────────────────────────────────
const allowedOrigins = (process.env.ALLOWED_ORIGINS || 'http://localhost:3000')
  .split(',')
  .map(o => o.trim());

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
}));

// ── Socket.IO ─────────────────────────────────────────────
const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    credentials: true,
  },
});

// ── Socket.IO (JWT-authenticated, tenant-scoped rooms) ───
io.use((socket, next) => {
  const token = socket.handshake.auth?.token;
  if (!token) return next(new Error('Authentication required'));
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    socket.user = decoded;
    next();
  } catch {
    next(new Error('Invalid token'));
  }
});

io.on('connection', (socket) => {
  // Auto-join tenant room based on JWT
  if (socket.user?.tenant_id) {
    socket.join(socket.user.tenant_id);
  }
  socket.on('disconnect', () => {});
});

// Expose io so controllers can emit events
app.set('io', io);

// ── Gzip Compression ─────────────────────────────────────
app.use(compression());

// ── Security Headers ──────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc:  ["'self'", "https://accounts.google.com", "https://apis.google.com"],
      frameSrc:   ["'self'", "https://accounts.google.com"],
      connectSrc: ["'self'", "https://accounts.google.com", "https://oauth2.googleapis.com"],
      imgSrc:     ["'self'", "data:", "https://*.googleusercontent.com"],
      styleSrc:   ["'self'", "'unsafe-inline'", "https://accounts.google.com"],
    },
  },
  crossOriginOpenerPolicy: { policy: 'same-origin-allow-popups' },
}));

// ── Body Parsing ──────────────────────────────────────────
app.use(bodyParser.json({ limit: '1mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '1mb' }));

// ── Input Sanitization ────────────────────────────────────
app.use(sanitizeBody);

// ── Health Check ──────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'BrewPOS API',
    timestamp: new Date().toISOString(),
  });
});

// ── API Routes ────────────────────────────────────────────
app.use('/api', routes);

// ── 404 Handler ───────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ error: `Route ${req.method} ${req.path} not found` });
});

// ── Global Error Handler ──────────────────────────────────
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// ── Cleanup expired/revoked refresh tokens every 24h ──────
const pool = require('./db/pool');
setInterval(() => {
  pool.query('DELETE FROM refresh_tokens WHERE expires_at < NOW() OR revoked = TRUE')
    .catch(err => console.error('Token cleanup error:', err.message));
}, 24 * 60 * 60 * 1000);

// ── Start Server ──────────────────────────────────────────
server.listen(PORT, () => {
  console.log(`\n☕  BrewPOS API running on http://localhost:${PORT}`);
  console.log(`   Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`   Health:      http://localhost:${PORT}/health`);
  console.log(`   WebSocket:   ws://localhost:${PORT}\n`);
});

module.exports = app;
