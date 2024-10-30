const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('delete')
        .setDescription('Deletes a specified number of messages')
        .addIntegerOption((option) =>
        option
            .setName('amount')
            .setDescription('The number of messages to delete')
            .setMinValue(1)
            .setMaxValue(100)
            .setRequired(true)
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    async execute(interaction) {
        const amount = interaction.options.getInteger('amount');

        try {
        // Attempt to bulk delete messages
        const messages = await interaction.channel.bulkDelete(amount, true);
        console.log(`Bulk deleted ${messages.size} messages.`);

        // If the bulk delete didn't delete the full amount, delete the rest individually
        if (messages.size < amount) {
            const remainingAmount = amount - messages.size;
            const remainingMessages = await interaction.channel.messages.fetch({ limit: remainingAmount });
            await interaction.channel.bulkDelete(remainingMessages, true);
            console.log(`Deleted the remaining ${remainingAmount} messages.`);
        }

        await interaction.reply(`Deleted ${amount} messages.`);
        } catch (error) {
        console.error('Error deleting messages:', error);
        await interaction.reply('There was an error deleting the messages.');
        }
    },
};