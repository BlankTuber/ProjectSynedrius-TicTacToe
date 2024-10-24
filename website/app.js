const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const path = require('path');

// Game state constants
const SYMBOLS = {
    PLAYER_ONE: 'X',
    PLAYER_TWO: 'O'
};

const WIN_CONDITIONS = [
    ['0-0', '0-1', '0-2'], // Rows
    ['1-0', '1-1', '1-2'],
    ['2-0', '2-1', '2-2'],
    ['0-0', '1-0', '2-0'], // Columns
    ['0-1', '1-1', '2-1'],
    ['0-2', '1-2', '2-2'],
    ['0-0', '1-1', '2-2'], // Diagonals
    ['0-2', '1-1', '2-0']
];

class Game {
    constructor() {
        this.players = [];
        this.spectators = [];
        this.plays = {};
        this.currentPlayer = SYMBOLS.PLAYER_ONE;
        this.isGameOver = false;
        this.winner = null;
    }

    addPlayer(socketId) {
        if (this.players.length >= 2 || this.players.includes(socketId)) {
            return false;
        }
        this.players.push(socketId);
        return true;
    }

    addSpectator(socketId) {
        if (!this.spectators.includes(socketId)) {
            this.spectators.push(socketId);
            return true;
        }
        return false;
    }

    removePlayer(socketId) {
        const index = this.players.indexOf(socketId);
        if (index !== -1) {
            this.players.splice(index, 1);
            return true;
        }
        return false;
    }

    removeSpectator(socketId) {
        const index = this.spectators.indexOf(socketId);
        if (index !== -1) {
            this.spectators.splice(index, 1);
            return true;
        }
        return false;
    }

    getPlayerSymbol(socketId) {
        const playerIndex = this.players.indexOf(socketId);
        if (playerIndex === 0) return SYMBOLS.PLAYER_ONE;
        if (playerIndex === 1) return SYMBOLS.PLAYER_TWO;
        return null;
    }

    isValidMove(pos) {
        return !this.plays[pos];
    }

    makeMove(pos, symbol) {
        if (this.isValidMove(pos)) {
            this.plays[pos] = symbol;
            return true;
        }
        return false;
    }

    checkWin(symbol) {
        return WIN_CONDITIONS.some(condition =>
            condition.every(position => this.plays[position] === symbol)
        );
    }

    isBoardFull() {
        return Object.keys(this.plays).length === 9;
    }

    toggleCurrentPlayer() {
        this.currentPlayer = this.currentPlayer === SYMBOLS.PLAYER_ONE ? 
            SYMBOLS.PLAYER_TWO : SYMBOLS.PLAYER_ONE;
    }
}

// Server setup
const app = express();
const server = http.createServer(app);
const io = socketIO(server);
const games = new Map();

// Middleware
app.use(express.static(path.join(__dirname, 'public')));
app.set('view engine', 'ejs');

// Routes
app.get("/", (req, res) => {
    res.render("index");
});

// Add this function to reset the game state for a rematch
Game.prototype.reset = function () {
    this.plays = {};
    this.currentPlayer = SYMBOLS.PLAYER_ONE;
    this.isGameOver = false;
    this.winner = null;
};

io.on('connection', (socket) => {
    socket.on('joinGame', (code) => {
        try {
            if (!code) {
                socket.emit('error', 'Invalid game code');
                return;
            }

            let game = games.get(code) || new Game();
            let role, symbol;

            if (game.addPlayer(socket.id)) {
                role = 'player';
                symbol = game.getPlayerSymbol(socket.id);
                
                if (game.players.length === 2) {
                    io.to(code).emit('playersReady', 'Game is ready!');
                    io.to(code).emit('startGame', SYMBOLS.PLAYER_ONE);
                }
            } else {
                role = 'spectator';
                game.addSpectator(socket.id);
            }

            socket.join(code);
            socket.emit('role', role, symbol);
            socket.emit('gameState', {
                plays: game.plays,
                currentPlayer: game.currentPlayer,
                isGameOver: game.isGameOver
            });

            if (!games.has(code)) {
                games.set(code, game);
            }
        } catch (error) {
            console.error('Error in joinGame:', error);
            socket.emit('error', 'Failed to join game');
        }
    });

    socket.on('playMove', (code, row, col) => {
        try {
            const game = games.get(code);
            if (!game) {
                socket.emit('error', 'Game not found');
                return;
            }

            const playerSymbol = game.getPlayerSymbol(socket.id);
            if (!playerSymbol || game.isGameOver || game.currentPlayer !== playerSymbol) {
                return;
            }

            const pos = `${row}-${col}`;
            if (!game.makeMove(pos, playerSymbol)) {
                return;
            }

            io.to(code).emit('updateState', row, col, playerSymbol);

            if (game.checkWin(playerSymbol)) {
                game.isGameOver = true;
                game.winner = playerSymbol;
                io.to(code).emit('gameOver', playerSymbol);
            } else if (game.isBoardFull()) {
                game.isGameOver = true;
                io.to(code).emit('gameOver', 'Tie');
            } else {
                game.toggleCurrentPlayer();
            }
        } catch (error) {
            console.error('Error in playMove:', error);
            socket.emit('error', 'Failed to make move');
        }
    });

    // Handle rematch requests
    socket.on('requestRematch', (code) => {
        try {
            const game = games.get(code);
            if (!game) {
                socket.emit('error', 'Game not found');
                return;
            }

            game.reset(); // Reset the game state for the rematch
            io.to(code).emit('rematchAccepted'); // Notify players rematch is accepted
            io.to(code).emit('startGame', SYMBOLS.PLAYER_ONE); // Start new game
        } catch (error) {
            console.error('Error in rematch:', error);
            socket.emit('error', 'Failed to start rematch');
        }
    });

    socket.on('disconnect', () => {
        try {
            games.forEach((game, code) => {
                if (game.removePlayer(socket.id)) {
                    socket.to(code).emit('playerLeft', 'Opponent has disconnected');
                    if (game.players.length === 0 && game.spectators.length === 0) {
                        games.delete(code);
                    }
                } else {
                    game.removeSpectator(socket.id);
                }
            });
        } catch (error) {
            console.error('Error in disconnect handler:', error);
        }
    });
});

const PORT = 8080;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});