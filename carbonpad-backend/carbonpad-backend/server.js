require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const compression = require('compression');
const morgan = require('morgan');
const path = require('path');

const connectDB = require('./src/db');
const padRoutes = require('./src/routes/pad');

const app = express();

app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors());
app.use(compression());
app.use(morgan('tiny'));
app.use(express.json({ limit: '256kb' }));

app.use('/api/pads', padRoutes);
app.use(express.static(path.join(__dirname, 'public')));

// Used by load balancers / uptime checks
app.get('/health', (req, res) => res.json({ ok: true }));

const PORT = process.env.PORT || 3000;

connectDB()
  .then(() => {
    app.listen(PORT, () => console.log(`carbon.pad backend running on port ${PORT}`));
  })
  .catch((err) => {
    console.error('Failed to start server:', err.message);
    process.exit(1);
  });
