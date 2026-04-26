const { createApp } = require('./app');
const { PORT } = require('./config');
const { initDb, closeDb } = require('./db');

initDb();

const app = createApp();
const server = app.listen(PORT, () => {
    console.log(`[Server] http://localhost:${PORT}`);
});

server.on('error', (error) => {
    if (error.code === 'EADDRINUSE') {
        console.error(`[Server] Port ${PORT} is already in use`);
        closeDb();
        process.exit(1);
    }

    throw error;
});

function shutdown() {
    server.close(() => {
        closeDb();
        process.exit(0);
    });
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

