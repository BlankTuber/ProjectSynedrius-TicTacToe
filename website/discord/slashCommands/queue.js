const { SlashCommandBuilder } = require('discord.js');
const player = require('../global/player');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('queue')
        .setDescription('Show the current song queue.'),
    async execute(interaction) {
        const queue = player.getQueue();

        if (queue.length === 0) {
            return interaction.reply('The queue is currently empty.');
        }

        const queueList = queue.map((url, index) => `${index + 1}. ${url}`).join('\n');
        return interaction.reply(`Current queue:\n${queueList}`);
    },
};
