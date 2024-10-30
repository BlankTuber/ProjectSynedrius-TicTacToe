const { SlashCommandBuilder } = require('discord.js');
const player = require('../global/player');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('skip')
        .setDescription('Skip the currently playing song.'),
    async execute(interaction) {
        if (!interaction.member.voice.channel) {
            return interaction.reply('You need to be in a voice channel to skip a song!');
        }

        player.skip();
        return interaction.reply('Skipped the current song!');
    },
};
