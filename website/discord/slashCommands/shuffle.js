const { SlashCommandBuilder } = require('discord.js');
const player = require('../global/player');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('shuffle')
        .setDescription('Shuffle the current queue'),
    async execute(interaction) {
        await interaction.deferReply();
        player.shuffle();
        await interaction.editReply('The queue has been shuffled.');
    },
};