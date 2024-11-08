const { SlashCommandBuilder } = require('discord.js');
const player = require('../global/player');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('skip')
        .setDescription('Skip the current song'),
    async execute(interaction) {
        await interaction.deferReply();
        await player.skip();
        await interaction.editReply('Skipped the current song.');
    },
};