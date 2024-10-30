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

            // Check if the bot is already in a voice channel
            const botVoiceConnection = interaction.guild.members.me.voice.channel;
            
            // Join the voice channel only if not already connected to the user's voice channel
            if (!botVoiceConnection || botVoiceConnection.id !== voiceChannel.id) {
                try {
                    await player.join(voiceChannel);
                } catch (error) {
                    console.error('Error joining voice channel:', error);
                    return interaction.editReply('Failed to join the voice channel. Please try again.');
                }
            }

            // Initial reply
            await interaction.editReply('Processing playlist...');

            // Set up progress tracking
            let progressMessage = '';
            let lastUpdateTime = Date.now();

            const updateProgress = async (processed, total, currentAction) => {
                const now = Date.now();
                // Update message at most every 5 seconds to avoid rate limits
                if (now - lastUpdateTime > 5000) {
                    progressMessage = `Processing playlist: ${processed}/${total} songs (${currentAction})`;
                    await interaction.editReply(progressMessage);
                    lastUpdateTime = now;
                }
            };

            // Start playlist processing with progress callback
            const result = await new Promise((resolve, reject) => {
                let messageTimeout;

                const processPlaylist = async () => {
                    try {
                        await player.addPlaylist(url, maxSongs, updateProgress);
                        clearTimeout(messageTimeout);
                        resolve();
                    } catch (error) {
                        clearTimeout(messageTimeout);
                        reject(error);
                    }
                };

                // Set a timeout to update the message if processing takes too long
                messageTimeout = setTimeout(async () => {
                    await interaction.editReply('This is taking longer than usual, but I\'m still processing the playlist...');
                }, 10000);

                processPlaylist();
            });

            // Get the final queue state
            const queue = player.getQueue();
            const queueList = queue.slice(0, 10).map((song, index) => `${index + 1}. ${song}`).join('\n');
            
            // Prepare final response
            let replyMessage = 'Playlist processing completed!\n\n';
            
            if (queue.length > 10) {
                replyMessage += `Current queue (showing first 10 songs):\n${queueList}\n...and ${queue.length - 10} more songs in queue.`;
            } else if (queue.length > 0) {
                replyMessage += `Current queue:\n${queueList}`;
            } else {
                replyMessage += 'No valid songs were found in the playlist. Please check the URL and try again.';
            }

            await interaction.editReply(replyMessage);

        } catch (error) {
            console.error('Error executing playlist command:', error);
            const errorMessage = error.message || 'Unknown error';
            await interaction.editReply(`Failed to process playlist: ${errorMessage}`);
        }
    },
};