const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIO(server);

app.use(express.static(path.join(__dirname, 'public')));
app.set('view engine', 'ejs');

app.get("/", (req, res) => {
    res.render("index");
});

let games = {};

function checkWin(plays, player) {
    const winConditions = [
        ['0-0', '0-1', '0-2'],
        ['1-0', '1-1', '1-2'],
        ['2-0', '2-1', '2-2'],
        ['0-0', '1-0', '2-0'],
        ['0-1', '1-1', '2-1'],
        ['0-2', '1-2', '2-2'],
        ['0-0', '1-1', '2-2'],
        ['0-2', '1-1', '2-0']
    ];

    return winConditions.some(condition => {
        return condition.every(position => {
            return plays[position] === player;
        });
    });
}

io.on('connection', (socket) => {
    socket.on('joinGame', (code) => {
        let room = games[code] || {
            players: [], 
            spectators: [], 
            plays: {}, 
            currentPlayer: 'X', 
            isGameOver: false, 
            winner: null
        };

        if (room.players.length < 2 && room.players.indexOf(socket.id) === -1) {
            room.players.push(socket.id);
            socket.emit('role', 'player', room.players.length === 1 ? 'X' : 'O');
            if (room.players.length === 2) {
                io.to(code).emit('startGame', 'X'); // Notify both players that the game can start
            }
        } else {
            room.spectators.push(socket.id);
            socket.emit('role', 'spectator');
        }

        games[code] = room;
        socket.join(code);
        socket.emit('gameState', room); // Send current game state to the new player or spectator
    });

    socket.on('playMove', (code, row, col) => {
        let room = games[code];
        if (!room || room.players.indexOf(socket.id) === -1 || room.isGameOver || room.currentPlayer !== room.players.indexOf(socket.id) + 1) return;

        const pos = `${row}-${col}`;
        if (room.plays[pos]) return;  // Cell already played

        room.plays[pos] = room.currentPlayer;
        io.to(code).emit('updateState', row, col, room.currentPlayer);

        // Check for win or tie
        if (checkWin(room.plays, room.currentPlayer)) {
            room.isGameOver = true;
            room.winner = room.currentPlayer;
            io.to(code).emit('gameOver', room.currentPlayer);
        } else if (Object.keys(room.plays).length === 9) {
            room.isGameOver = true;
            io.to(code).emit('gameOver', 'Tie');
        }

        // Toggle current player
        room.currentPlayer = room.currentPlayer === 'X' ? 'O' : 'X';
    });

    socket.on('disconnect', () => {
        // Notify other players in the room about the disconnect
        Object.keys(games).forEach(code => {
            let room = games[code];
            let index = room.players.indexOf(socket.id);
            if (index !== -1) {
                room.players.splice(index, 1);
                socket.to(code).emit('playerLeft', `Player has disconnected`);
                if (room.players.length === 0) {
                    // No players left, delete game
                    delete games[code];
                }
            }
            index = room.spectators.indexOf(socket.id);
            if (index !== -1) {
                room.spectators.splice(index, 1);
            }
        });
    });
});


const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});