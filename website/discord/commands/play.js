const { SlashCommandBuilder } = require('discord.js');
const player = require('../global/player');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('play')
        .setDescription('Play a song from a URL')
        .addStringOption(option =>
            option.setName('url')
                .setDescription('The URL of the song to play')
                .setRequired(true)),
    async execute(interaction) {
        const url = interaction.options.getString('url');

        if (!interaction.member.voice.channel) {
            return interaction.reply('You need to be in a voice channel to play a song!');
        }

        const channel = interaction.member.voice.channel;
        
        if (!player.connection || player.connection.joinConfig.channelId !== channel.id) {
            player.join(channel);
        }

        await player.play(url);
        return interaction.reply(`Added to queue: **${url}**`);
    },
};