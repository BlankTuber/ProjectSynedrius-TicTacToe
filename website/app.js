const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const path = require('path');
const { Client, GatewayIntentBits } = require('discord.js');
require('dotenv').config();
const fs = require('fs').promises;

const app = express();
const server = http.createServer(app);
const io = socketIO(server);

const client = new Client({
intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMessages
]
});

// Middleware
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: true }));
app.set('view engine', 'ejs');

// Routes
const indexRoutes = require('./routes/index');
const apiRoutes = require('./routes/api');
app.use('/', indexRoutes);
app.use('/api/', apiRoutes);

// Socket.IO
const gameSocket = require('./sockets/gameSocket');
gameSocket(io);

const commandHandler = require('./discord/handler/commandHandler');

// Function to clean up ytdlp-audio directory
async function cleanupYtdlpAudio() {
    const directory = './ytdlp-audio';
    try {
        const files = await fs.readdir(directory);
        for (const file of files) {
        if (file !== '.gitignore') {
            await fs.unlink(path.join(directory, file));
            console.log(`Deleted file: ${file}`);
        }
        }
    } catch (error) {
        console.error('Error cleaning up ytdlp-audio directory:', error);
    }
}

client.once('ready', async () => {
    console.log(`Logged in as ${client.user.tag}`);
    commandHandler.init(client);

    // Clean up ytdlp-audio directory on startup
    await cleanupYtdlpAudio();

    // Disconnect from any voice channels on startup
    for (const [guildId, voiceConnection] of client.voice.adapters) {
        try {
        await voiceConnection.disconnect();
            console.log(`Disconnected from voice channel in guild: ${guildId}`);
        } catch (error) {
            console.error(`Error disconnecting from voice channel in guild ${guildId}:`, error);
        }
    }

    // Watch for changes in the config file
    const configPath = path.join(__dirname, 'discord/config.json');
    fs.watch(configPath, (eventType, filename) => {
        if (eventType === 'change') {
            const { prefix } = JSON.parse(fs.readFileSync(configPath, 'utf8'));
            console.log(`Prefix updated to: ${prefix}`);
            // Optionally emit an event here if needed
        }
    });
});

client.login(process.env.BOT_TOKEN).catch(err => {
    console.error('Failed to login:', err);
});

app.set('discordClient', client);
client.io = io;

client.on('error', (err) => {
    console.error('A Discord error occurred:', err);
});

const PORT = 8080;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});

process.on('SIGTERM', () => {
    console.log('Received SIGTERM, shutting down gracefully...');
    server.close(() => {
        console.log('HTTP server closed');
        io.close(() => {
        console.log('Socket.IO server closed');
        client.destroy();
        process.exit(0);
        });
    });
});

process.on('exit', () => {
    console.log('Process exiting, disconnecting client...');
    client.destroy();
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
    process.exit(1);
});