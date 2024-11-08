const { SlashCommandBuilder } = require('discord.js');
const player = require('../global/player');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('resume')
        .setDescription('Resume the paused playback'),
    async execute(interaction) {
        await interaction.deferReply();
        player.resume();
        await interaction.editReply('Playback resumed.');
    },
};