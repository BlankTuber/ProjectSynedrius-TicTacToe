const player = require('../global/player');

module.exports = {
    name: 'queue',
    description: 'Show the current song queue.',
    async executeMessage(message, args) {
        const queue = player.getQueue();

        if (queue.length === 0) {
            return message.reply('The queue is currently empty.');
        }

        const queueList = queue.map((url, index) => `${index + 1}. ${url}`).join('\n');
        return message.reply(`Current queue:\n${queueList}`);
    },
};