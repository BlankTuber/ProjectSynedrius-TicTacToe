const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const path = require('path');
const { Client, GatewayIntentBits } = require('discord.js');
require('dotenv').config(); // Load environment variables
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = socketIO(server);

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.MessageContent, // Add this intent for prefix commands
        GatewayIntentBits.GuildMessages // Add this intent for prefix commands
    ]
});

// Middleware
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: true })); // Parse URL-encoded bodies
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

client.once('ready', () => {
    console.log(`Logged in as ${client.user.tag}`);
    commandHandler.init(client);

    // Watch for changes in the config file
    const configPath = path.join(__dirname, 'discord/config.json');
    fs.watch(configPath, (eventType, filename) => {
        if (eventType === 'change') {
            const { prefix } = JSON.parse(fs.readFileSync(configPath, 'utf8'));
            console.log(`Prefix updated to: ${prefix}`);
            // You can emit an event here if you want to notify other parts of your application
            // client.emit('prefixUpdated', prefix);
        }
    });
});

client.login(process.env.BOT_TOKEN).catch(err => {
    console.error('Failed to login:', err); // Log login error
});

app.set('discordClient', client);
client.io = io;

client.on('error', (err) => {
    console.error('A Discord error occurred:', err);
});

// Delete the previous output files if they exist
const outputFiles = ['./ytdlp-audio/output1.mp3', './ytdlp-audio/output2.mp3'];
outputFiles.forEach(file => {
    if (fs.existsSync(file)) {
        fs.unlinkSync(file); // Delete the file
        console.log(`Deleted existing file: ${file}`);
    }
});

// const discordSocket = require('./sockets/discordSocket');
// discordSocket(io);

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

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
    // Application specific logging, throwing an error, or other logic here
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
    // Application specific logging, throwing an error, or other logic here
    // Depending on the error, you might want to exit the process
    // process.exit(1);
});