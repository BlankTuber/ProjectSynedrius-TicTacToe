const { SlashCommandBuilder } = require('discord.js');
const player = require('../global/player');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('clear')
        .setDescription('Clear the entire queue'),
    async execute(interaction) {
        await interaction.deferReply();
        player.clearQueue();
        await interaction.editReply('The queue has been cleared.');
    },
};