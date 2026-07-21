const mongoose = require('mongoose');

const padSchema = new mongoose.Schema(
  {
    // The page name, e.g. carbon.pad/name -> name: "name"
    name: { type: String, required: true, unique: true, trim: true, index: true },
    content: { type: String, default: '' },
    // bcrypt hash of the page's password, or null if the page is unlocked
    passwordHash: { type: String, default: null },
    // Opaque tokens that currently grant edit access to this page
    tokens: { type: [String], default: [] },
  },
  { timestamps: true }
);

// A password can only ever belong to ONE page at a time. This is enforced
// at the database level (not just in route code) via a partial unique index,
// so it holds even under concurrent requests / multiple server instances.
padSchema.index(
  { passwordHash: 1 },
  { unique: true, partialFilterExpression: { passwordHash: { $type: 'string' } } }
);

module.exports = mongoose.model('Pad', padSchema);
