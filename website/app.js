const express = require('express');
const http = require('http');
const socket = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socket(server);

// Serve static files from the 'public' directory
app.use(express.static(path.join(__dirname, 'public')));

// Set EJS as the view engine
app.set('view engine', 'ejs');

// Define the main route to render the index page
app.get("/", (req, res) => {
    res.render("index");
});

// Handle socket connections
io.on('connection', (socket) => {

    socket.on('disconnect', () => {
    });

    // Additional socket event handlers can be added here
});

// Start the server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
