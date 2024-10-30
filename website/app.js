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
        GatewayIntentBits.GuildVoiceStates
    ]
})

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
})

client.login(process.env.BOT_TOKEN).catch(err => {
    console.error('Failed to login:', err); // Log login error
});

app.set('discordClient', client);
client.io = io;

client.on('error', (err) => {
    console.error('A Discord error occurred:', err);
})


// Delete the previous output file if it exists
if (fs.existsSync("./ytdlp-audio/output1.mp3")) {
    fs.unlinkSync("./ytdlp-audio/output1.mp3"); // Delete the file
}

// Delete the previous output file if it exists
if (fs.existsSync("./ytdlp-audio/output2.mp3")) {
    fs.unlinkSync("./ytdlp-audio/output2.mp3"); // Delete the file
}

// const discordSocket = require('./sockets/discordSocket');
// discordSocket(io);

const PORT = 8080;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});


process.on('SIGTERM', () => {
    console.log('Received SIGTERM, shutting down gracefully...');
    app.close(() => {
        console.log('Express Server closed');
        process.exit(0);
    })
    io.close(() => {
        console.log('Socket.IO server closed');
        client.destroy();
        process.exit(0);
    });
})