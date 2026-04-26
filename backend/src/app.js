const express = require('express');
const cors = require('cors');
const path = require('path');
const { PUBLIC_DIR, UPLOADS_DIR } = require('./config');
const { registerApiRoutes } = require('./routes');

function createApp() {
    const app = express();

    app.use(cors());
    app.use(express.json({ limit: '10mb' }));
    app.use(express.urlencoded({ extended: true }));
    app.use(express.static(PUBLIC_DIR));
    app.use('/uploads', express.static(UPLOADS_DIR));

    registerApiRoutes(app);

    app.get('*', (req, res) => {
        res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
    });

    return app;
}

module.exports = { createApp };
