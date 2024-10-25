// sockets/gameSocket.js
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
        this.rematchVotes = new Set(); // Changed to Set for easier tracking
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
            this.rematchVotes.delete(socketId); // Clean up rematch vote when player leaves
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

    reset() {
        this.plays = {};
        this.currentPlayer = SYMBOLS.PLAYER_ONE;
        this.isGameOver = false;
        this.winner = null;
        this.rematchVotes.clear(); // Clear all rematch votes
    }

    // New method to check if all players have voted for rematch
    hasAllRematchVotes() {
        return this.players.length === 2 && this.rematchVotes.size === 2;
    }
}

const games = new Map();

module.exports = (io) => {
    io.on('connection', (socket) => {
        socket.on('joinGame', (code) => {
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
        });

        socket.on('playMove', (code, row, col) => {
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
        });

        socket.on('rematchRequest', (code) => {
            const game = games.get(code);
            if (!game) {
                socket.emit('error', 'Game not found');
                return;
            }

            // Only allow rematch requests if the game is over
            if (!game.isGameOver) {
                return;
            }

            // Add this player's rematch vote
            game.rematchVotes.add(socket.id);

            // If all players have voted for rematch
            if (game.hasAllRematchVotes()) {
                game.reset();
                io.to(code).emit('rematchAccepted');
                io.to(code).emit('startGame', SYMBOLS.PLAYER_ONE);
                io.to(code).emit('gameState', {
                    plays: game.plays,
                    currentPlayer: game.currentPlayer,
                    isGameOver: game.isGameOver
                });
            } else {
                // Notify the other player about the rematch request
                const otherPlayer = game.players.find(id => id !== socket.id);
                if (otherPlayer) {
                    io.to(otherPlayer).emit('rematchRequest');
                }
            }
        });

        socket.on('disconnect', () => {
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
        });
    });
};