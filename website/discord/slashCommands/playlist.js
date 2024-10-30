const { SlashCommandBuilder } = require('discord.js');
const player = require('../global/player');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('playlist')
        .setDescription('Add a playlist to the queue')
        .addStringOption(option => 
            option.setName('url')
                .setDescription('The URL of the playlist')
                .setRequired(true))
        .addIntegerOption(option =>
            option.setName('maxsongs')
                .setDescription('Maximum number of songs to add (default: 30, max: 50)')
                .setMinValue(1)
                .setMaxValue(50)),
    
    async execute(interaction) {
        const url = interaction.options.getString('url');
        const maxSongs = Math.min(interaction.options.getInteger('maxsongs') || 30, 50);

        await interaction.deferReply();

        try {
            // Check if the user is in a voice channel
            const voiceChannel = interaction.member.voice.channel;
            if (!voiceChannel) {
                return interaction.editReply('You need to be in a voice channel to use this command!');
            }

            // Join the voice channel
            await player.join(voiceChannel);

            // Add the playlist
            await player.addPlaylist(url, maxSongs);
            const queue = player.getQueue();
            const queueList = queue.map((song, index) => `${index + 1}. ${song}`).join('\n');
            await interaction.editReply(`Added up to ${maxSongs} songs from the playlist to the queue.\n\nCurrent queue:\n${queueList}`);
        } catch (error) {
            console.error('Error executing addplaylist command:', error);
            await interaction.editReply('There was an error while adding the playlist.');
        }
    },
};