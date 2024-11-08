const { SlashCommandBuilder } = require('discord.js');
const player = require('../global/player');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('pause')
        .setDescription('Pause the current playback'),
    async execute(interaction) {
        await interaction.deferReply();
        player.pause();
        await interaction.editReply('Playback paused.');
    },
};