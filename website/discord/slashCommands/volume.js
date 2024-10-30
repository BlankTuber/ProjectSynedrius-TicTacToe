const { SlashCommandBuilder } = require('discord.js');
const player = require('../global/player');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('volume')
        .setDescription('Change or check the playback volume')
        .addIntegerOption(option =>
            option.setName('percentage')
                .setDescription('Volume level (0-100)')
                .setMinValue(0)
                .setMaxValue(100)
                .setRequired(false)),

    async execute(interaction) {
        try {
            // Check if the user is in a voice channel
            const voiceChannel = interaction.member.voice.channel;
            if (!voiceChannel) {
                return interaction.reply({ 
                    content: 'You need to be in a voice channel to use this command!',
                    ephemeral: true 
                });
            }

            // Check if the bot is in the same voice channel
            const botVoiceChannel = interaction.guild.members.me.voice.channel;
            if (!botVoiceChannel) {
                return interaction.reply({ 
                    content: 'I\'m not currently in a voice channel!',
                    ephemeral: true 
                });
            }

            if (botVoiceChannel.id !== voiceChannel.id) {
                return interaction.reply({ 
                    content: 'You need to be in the same voice channel as me to change the volume!',
                    ephemeral: true 
                });
            }

            const volumePercentage = interaction.options.getInteger('percentage');

            // If no volume is specified, return current volume
            if (volumePercentage === null) {
                const currentVolume = Math.round(player.volume * 100);
                return interaction.reply(`🔊 Current volume: ${currentVolume}%`);
            }

            // Set new volume
            const newVolume = volumePercentage / 100;
            player.setVolume(newVolume);

            // Create volume bar visualization
            const barLength = 20;
            const filledBars = Math.round((volumePercentage / 100) * barLength);
            const emptyBars = barLength - filledBars;
            const volumeBar = '█'.repeat(filledBars) + '░'.repeat(emptyBars);

            // Choose appropriate volume emoji
            let volumeEmoji;
            if (volumePercentage === 0) volumeEmoji = '🔇';
            else if (volumePercentage < 30) volumeEmoji = '🔈';
            else if (volumePercentage < 70) volumeEmoji = '🔉';
            else volumeEmoji = '🔊';

            return interaction.reply(
                `${volumeEmoji} Volume set to ${volumePercentage}%\n` +
                `[${volumeBar}] ${volumePercentage}%`
            );

        } catch (error) {
            console.error('Error executing volume command:', error);
            return interaction.reply({ 
                content: 'There was an error while executing the volume command.',
                ephemeral: true 
            });
        }
    },
};