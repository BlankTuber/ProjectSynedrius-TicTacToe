const { SlashCommandBuilder } = require('discord.js');
const player = require('../global/player');
const { exec } = require('child_process');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('search')
        .setDescription('Search for a song on YouTube Music and add it to the queue.')
        .addStringOption(option =>
            option.setName('query')
                .setDescription('The name of the song to search for')
                .setRequired(true)),

    async execute(interaction) {
        const query = interaction.options.getString('query');
        await interaction.deferReply();

        const command = `yt-dlp -j "ytsearch:${query}"`;

        exec(command, async (error, stdout, stderr) => {
            if (error || stderr) {
                console.error(`Error executing command: ${error?.message || stderr}`);
                return interaction.editReply('There was an error while searching for the song.');
            }

            const result = JSON.parse(stdout.trim());
            if (!result) {
                return interaction.editReply('No results found for your search.');
            }

            if (!interaction.member.voice.channel) {
                return interaction.editReply('You need to be in a voice channel to play a song!');
            }

            const channel = interaction.member.voice.channel;
            if (!player.connection || player.connection.joinConfig.channelId !== channel.id) {
                player.join(channel);
            }

            await player.play(`https://music.youtube.com/watch?v=${result.id}`);
            return interaction.editReply(`Added to queue: **${result.title}**`);
        });
    },
};
