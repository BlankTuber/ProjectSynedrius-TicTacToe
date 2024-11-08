const { SlashCommandBuilder } = require('discord.js');
const player = require('../global/player');
const { exec } = require('child_process');
const util = require('util');

const execPromise = util.promisify(exec);

module.exports = {
    data: new SlashCommandBuilder()
        .setName('play')
        .setDescription('Play a song from a URL or search for a song')
        .addStringOption(option =>
            option.setName('input')
                .setDescription('The URL of the song or a search query')
                .setRequired(true)),

    async execute(interaction) {
        try {
            await interaction.deferReply();
            
            const input = interaction.options.getString('input');
            const isUrl = this.isValidUrl(input);

            if (!interaction.member.voice.channel) {
                return interaction.editReply('You need to be in a voice channel to play a song!');
            }

            const channel = interaction.member.voice.channel;
            
            if (!player.connection || player.connection.joinConfig.channelId !== channel.id) {
                await player.join(channel);
            }

            if (isUrl) {
                await player.play(input);
                return interaction.editReply(`Added to queue: **${input}**`);
            } else {
                const result = await this.searchYouTube(input);
                if (!result) {
                    return interaction.editReply('No results found for your search.');
                }
                await player.play(`https://music.youtube.com/watch?v=${result.id}`);
                return interaction.editReply(`Added to queue: **${result.title}**`);
            }
        } catch (error) {
            console.error('Error in play command:', error);
            await interaction.editReply('There was an error while executing the command!');
        }
    },

    isValidUrl(string) {
        try {
            new URL(string);
            return true;
        } catch (_) {
            return false;
        }
    },

    async searchYouTube(query) {
        try {
            const command = `yt-dlp -j "ytsearch:${query}"`;
            const { stdout } = await execPromise(command);
            return JSON.parse(stdout.trim());
        } catch (error) {
            console.error(`Error searching YouTube: ${error.message}`);
            return null;
        }
    }
};