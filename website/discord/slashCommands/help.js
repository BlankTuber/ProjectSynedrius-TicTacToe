const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('help')
        .setDescription('Lists all available commands'),
    async execute(interaction) {
        const commands = interaction.client.slashCommands;
        const embed = new EmbedBuilder()
            .setColor('#0099ff')
            .setTitle('Available Commands')
            .setDescription('Here are all the commands you can use:');

        commands.forEach(command => {
            embed.addFields({ name: `/${command.data.name}`, value: command.data.description });
        });

        await interaction.reply({ embeds: [embed] });
    },
};