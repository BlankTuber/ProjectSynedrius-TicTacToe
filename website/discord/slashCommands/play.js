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
        try {
            // Defer the reply immediately to prevent interaction timeout
            await interaction.deferReply();
            
            const url = interaction.options.getString('url');

            if (!interaction.member.voice.channel) {
                return interaction.editReply('You need to be in a voice channel to play a song!');
            }

            const channel = interaction.member.voice.channel;
            
            if (!player.connection || player.connection.joinConfig.channelId !== channel.id) {
                await player.join(channel);
            }

            await player.play(url);
            return interaction.editReply(`Added to queue: **${url}**`);
            
        } catch (error) {
            console.error('Error in play command:', error);
            // If the interaction is still valid, try to send an error message
            try {
                if (interaction.deferred) {
                    await interaction.editReply('There was an error while executing the command!');
                } else {
                    await interaction.reply({ content: 'There was an error while executing the command!', ephemeral: true });
                }
            } catch (e) {
                console.error('Error sending error message:', e);
            }
        }
    },
};