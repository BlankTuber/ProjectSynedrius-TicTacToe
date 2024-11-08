const { SlashCommandBuilder } = require('discord.js');
const player = require('../global/player');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('remove')
        .setDescription('Remove a song from the queue')
        .addIntegerOption(option =>
            option.setName('position')
                .setDescription('The position of the song to remove (1-based)')
                .setRequired(true)),
    async execute(interaction) {
        await interaction.deferReply();
        const position = interaction.options.getInteger('position');
        player.removeFromQueue(position - 1); // Convert to 0-based index
        await interaction.editReply(`Removed song at position ${position} from the queue.`);
    },
};