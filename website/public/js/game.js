const socket = io();
let yourSymbol;
let gameCode;

// DOM Elements
const currentPlayerDisplay = document.getElementById('currentPlayer');
const roleDisplay = document.getElementById('roleDisplay');
const readyStatus = document.getElementById('readyStatus');
const winnerDisplay = document.getElementById('winnerDisplay');
const winnerDiv = document.getElementById('winnerDiv');
const codeInput = document.getElementById('codeInput');
const codeSubmit = document.getElementById('codeSubmit');
const rematchButton = document.getElementById('rematchButton');
const dontRematchButton = document.getElementById('dontRematchButton');
const disconnectButton = document.createElement('button');

// Add a Disconnect button
disconnectButton.textContent = "Disconnect";
disconnectButton.classList.add('action-button');
disconnectButton.style.display = 'none';  // Initially hidden
document.body.appendChild(disconnectButton);  // Append to the body

async function playWin() {
    const winAudio = new Audio('audio/win.mp3');
    winAudio.volume = 0.5; // Louder than background loop
    await winAudio.play();
}

async function playLose() {
    const loseAudio = new Audio('audio/lose.mp3');
    loseAudio.volume = 0.5; // Slightly louder than background loop
    await loseAudio.play();
}

async function playDraw() {
    const drawAudio = new Audio('audio/draw.mp3');
    drawAudio.volume = 0.5; // A bit louder than background loop
    await drawAudio.play();
}

async function playNotif() {
    const notificationAudio = new Audio('audio/notif.mp3');
    notificationAudio.volume = 0.4; // Same as background loop
    await notificationAudio.play();
}

async function playSelect() {
    const selectAudio = new Audio('audio/select.mp3');
    selectAudio.volume = 0.25; // Slightly quieter than background loop
    await selectAudio.play();
}

const bgAudio = new Audio('audio/loopbg.mp3');
async function playLoopbg() {
    bgAudio.volume = 0.3; // Background loop at 30%
    bgAudio.loop = true;
    await bgAudio.play();
}

// Connection event
socket.on('connect', () => {
    console.log('Connected to server');
});

// Event Listeners
codeSubmit.addEventListener('click', () => {
    gameCode = codeInput.value.trim();
    if (gameCode) {
        socket.emit('joinGame', gameCode);
        disconnectButton.style.display = 'block';
        codeSubmit.parentElement.style.display = "none";
        playLoopbg();
    } else {
        alert('Please enter a valid game code.');
    }
});

rematchButton.addEventListener('click', () => {
    if (gameCode) {
        socket.emit('rematchRequest', gameCode);  // Updated event name
        winnerDiv.style.display = 'none';
        readyStatus.textContent = 'Waiting for opponent to accept rematch...';
    }
});

dontRematchButton.addEventListener('click', () => {
    if (gameCode) {
        socket.disconnect();
        bgAudio.pause();
        readyStatus.textContent = 'You have disconnected.';
        setTimeout(() => {
            readyStatus.textContent = '';
            window.location.reload();
        }, 1000);
        disconnectButton.style.display = 'none';
    }
});

// Disconnect event listener
disconnectButton.addEventListener('click', () => {
    socket.disconnect();
    resetBoard();
    bgAudio.pause();
    readyStatus.textContent = 'You have disconnected.';
    setTimeout(() => {
        readyStatus.textContent = '';
        window.location.reload();
    }, 1000);
    disconnectButton.style.display = 'none';  // Hide the button after disconnecting
});

// Game cell click listener
document.querySelectorAll('.tttcell').forEach(cell => {
    cell.addEventListener('click', (event) => {
        select(event.target);
    });
});

// Socket Events
socket.on('role', function(role, symbol) {
    yourSymbol = symbol;
    roleDisplay.innerText = symbol || "spectator";
    if (yourSymbol === "O") {
        readyStatus.textContent = "You have connected, X is starting.";
        setTimeout(() => {
            readyStatus.textContent = '';
        }, 2000);
    }
});

socket.on('playersReady', function(message) {
    readyStatus.textContent = message;
    setTimeout(() => {
        readyStatus.textContent = '';
    }, 3000);
});

socket.on('startGame', function(currentPlayer) {
    playNotif();
    currentPlayerDisplay.innerText = currentPlayer;
    readyStatus.textContent = 'Game Started! ' + currentPlayer + ' goes first!';
});

socket.on('gameState', function(game) {
    resetBoard();
    Object.keys(game.plays).forEach(pos => {
        const [row, col] = pos.split('-');
        const cell = document.querySelector(`td[data-row="${row}"][data-col="${col}"]`);
        updateCell(cell, game.plays[pos]);
    });
    currentPlayerDisplay.innerText = game.currentPlayer;
});

socket.on('updateState', function(row, col, owner) {
    const cell = document.querySelector(`td[data-row="${row}"][data-col="${col}"]`);
    updateCell(cell, owner);
    currentPlayerDisplay.innerText = owner === 'X' ? 'O' : 'X';
});

socket.on('gameOver', function(winner) {
    if (winner === yourSymbol) {
        playWin();
    } else if (winner === 'Tie') {
        playDraw();
    } else {
        playLose();
    }
    const message = winner === 'Tie' ? "It's a Tie!" : `Player ${winner} wins!`;
    winnerDisplay.innerText = message;
    winnerDiv.style.display = 'flex';
    rematchButton.style.display = 'block'; // Show rematch button when game is over
});

socket.on('playerLeft', function(message) {
    playNotif();
    readyStatus.textContent = message;
    resetBoard();
    setTimeout(() => {
        readyStatus.textContent = '';
        window.location.reload();
    }, 2000);
    disconnectButton.style.display = 'none';  // Hide the disconnect button
});

socket.on('error', function(message) {
    alert(message);
});

socket.on('rematchAccepted', function() {
    playNotif();
    resetBoard();
    winnerDiv.style.display = 'none';
    readyStatus.textContent = 'Rematch starting...';
    setTimeout(() => {
        readyStatus.textContent = '';
    }, 2000);
});

// Helper Functions
function select(cell) {
    playSelect();
    const row = cell.getAttribute('data-row');
    const col = cell.getAttribute('data-col');
    if (!cell.classList.contains('selected') && 
        yourSymbol === currentPlayerDisplay.innerText) {
        socket.emit('playMove', gameCode, row, col);
    }
}

function updateCell(cell, owner) {
    cell.classList.add('selected');
    cell.textContent = owner;
    cell.setAttribute('data-owner', owner);
}

function resetBoard() {
    document.querySelectorAll('.tttcell').forEach(cell => {
        cell.classList.remove('selected');
        cell.textContent = '';
        cell.setAttribute('data-owner', '');
    });
}