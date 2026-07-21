const express = require('express');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const Pad = require('../models/Pad');
const { authLimiter } = require('../middleware/rateLimit');

const router = express.Router();

function getToken(req) {
  const header = req.headers.authorization || '';
  const match = header.match(/^Bearer (.+)$/);
  return match ? match[1] : null;
}

function randomToken() {
  return crypto.randomBytes(24).toString('hex');
}

function isValidName(name) {
  return typeof name === 'string' && /^[a-zA-Z0-9\-_.]{1,120}$/.test(name);
}

/**
 * GET /api/pads/:name
 * Returns page state. Content is only included if the page has no
 * password, or the caller presents a valid token for it.
 */
router.get('/:name', async (req, res) => {
  const { name } = req.params;
  if (!isValidName(name)) return res.status(400).json({ error: 'invalid page name' });

  const pad = await Pad.findOne({ name }).lean();
  if (!pad) {
    return res.json({ exists: false, hasPassword: false, locked: false, content: '' });
  }

  const hasPassword = !!pad.passwordHash;
  if (!hasPassword) {
    return res.json({ exists: true, hasPassword: false, locked: false, content: pad.content });
  }

  const token = getToken(req);
  const unlocked = !!token && pad.tokens.includes(token);
  if (unlocked) {
    return res.json({ exists: true, hasPassword: true, locked: false, content: pad.content });
  }
  return res.json({ exists: true, hasPassword: true, locked: true, content: null });
});

/**
 * PUT /api/pads/:name
 * Saves page content. Blocked if the page has a password and no valid
 * token is presented.
 */
router.put('/:name', async (req, res) => {
  const { name } = req.params;
  const { content } = req.body;
  if (!isValidName(name)) return res.status(400).json({ error: 'invalid page name' });
  if (typeof content !== 'string') return res.status(400).json({ error: 'content must be a string' });

  let pad = await Pad.findOne({ name });
  if (pad && pad.passwordHash) {
    const token = getToken(req);
    if (!token || !pad.tokens.includes(token)) {
      return res.status(403).json({ error: 'this page is locked' });
    }
  }

  if (!pad) {
    pad = new Pad({ name, content });
  } else {
    pad.content = content;
  }
  await pad.save();
  res.json({ ok: true, updatedAt: pad.updatedAt });
});

/**
 * POST /api/pads/:name/unlock
 * Verifies a password and issues a token that grants edit access.
 */
router.post('/:name/unlock', authLimiter, async (req, res) => {
  const { name } = req.params;
  const { password } = req.body;
  if (!isValidName(name)) return res.status(400).json({ error: 'invalid page name' });
  if (!password) return res.status(400).json({ error: 'password required' });

  const pad = await Pad.findOne({ name });
  if (!pad || !pad.passwordHash) return res.status(400).json({ error: 'this page has no password' });

  const match = await bcrypt.compare(password, pad.passwordHash);
  if (!match) return res.status(401).json({ error: 'incorrect password' });

  const token = randomToken();
  pad.tokens.push(token);
  if (pad.tokens.length > 25) pad.tokens = pad.tokens.slice(-25); // cap old sessions
  await pad.save();

  res.json({ token, content: pad.content });
});

/**
 * POST /api/pads/:name/lock
 * Sets or changes a page's password. Rejects passwords already in use
 * on another page — the database's unique index is the source of truth,
 * checked here so we can return a friendly message.
 */
router.post('/:name/lock', authLimiter, async (req, res) => {
  const { name } = req.params;
  const { password } = req.body;
  if (!isValidName(name)) return res.status(400).json({ error: 'invalid page name' });
  if (!password || password.length < 3) {
    return res.status(400).json({ error: 'password must be at least 3 characters' });
  }

  let pad = await Pad.findOne({ name });
  if (pad && pad.passwordHash) {
    const token = getToken(req);
    if (!token || !pad.tokens.includes(token)) {
      return res.status(403).json({ error: 'unlock this page first to change its password' });
    }
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const token = randomToken();

  if (!pad) {
    pad = new Pad({ name, content: '', passwordHash, tokens: [token] });
  } else {
    pad.passwordHash = passwordHash;
    pad.tokens = [token];
  }

  try {
    await pad.save();
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({
        error: 'that password is already used on another page — please choose a different password',
      });
    }
    throw err;
  }

  res.json({ token });
});

/**
 * DELETE /api/pads/:name/lock
 * Removes a page's password. Requires a currently-valid token.
 */
router.delete('/:name/lock', async (req, res) => {
  const { name } = req.params;
  if (!isValidName(name)) return res.status(400).json({ error: 'invalid page name' });

  const token = getToken(req);
  const pad = await Pad.findOne({ name });
  if (!pad || !pad.passwordHash) return res.status(400).json({ error: 'this page has no password' });
  if (!token || !pad.tokens.includes(token)) {
    return res.status(403).json({ error: 'incorrect or missing token' });
  }

  pad.passwordHash = null;
  pad.tokens = [];
  await pad.save();
  res.json({ ok: true });
});

module.exports = router;
