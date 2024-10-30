const { SlashCommandBuilder, VoiceConnectionStatus } = require('discord.js');
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

            // Check if the bot is already in a voice channel
            const botVoiceConnection = interaction.guild.members.me.voice.channel;
            
            // Join the voice channel only if not already connected to the user's voice channel
            if (!botVoiceConnection || botVoiceConnection.id !== voiceChannel.id) {
                await player.join(voiceChannel);
            }

            // Add the playlist
            console.log("Adding to playlist...");
            await interaction.editReply('Fetching playlist information...');
            
            const addedSongs = await player.addPlaylist(url, maxSongs);
            const queue = player.getQueue();
            const queueList = queue.slice(0, 10).map((song, index) => `${index + 1}. ${song}`).join('\n');
            
            let replyMessage = `Added ${addedSongs} songs from the playlist to the queue.`;
            if (queue.length > 10) {
                replyMessage += `\n\nShowing first 10 songs in queue:\n${queueList}\n...and ${queue.length - 10} more.`;
            } else {
                replyMessage += `\n\nCurrent queue:\n${queueList}`;
            }
            
            await interaction.editReply(replyMessage);
        } catch (error) {
            console.error('Error executing addplaylist command:', error);
            await interaction.editReply('There was an error while adding the playlist. Please try again later.');
        }
    },
};