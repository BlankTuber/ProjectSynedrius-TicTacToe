// sockets/gameSocket.js
const { Game, SYMBOLS } = require('../game/game');
const games = new Map();

module.exports = (io) => {
    io.on('connection', (socket) => {
        socket.on('joinGame', (code) => {
            // Join game logic, using `Game` instance
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

        // Rematch handling and other events can go here

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